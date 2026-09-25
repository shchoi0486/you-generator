import edge_tts
try:
    import azure.cognitiveservices.speech as speechsdk
    AZURE_SPEECH_AVAILABLE = True
except Exception:
    # ImportError 외 PyInstaller 동적 DLL 누락(PyInstallerImportError) 등도 수용.
    # Azure 미사용 환경·번들에서 안전하게 폴백한다.
    speechsdk = None  # type: ignore
    AZURE_SPEECH_AVAILABLE = False
import asyncio
import os
import httpx
from datetime import timedelta
import re
import json
import hashlib
import shutil
from moviepy import AudioFileClip
from .config_utils import load_config, get_asset_dir

# Optional imports for other providers
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    import dashscope
    QWEN_AVAILABLE = True
except ImportError:
    QWEN_AVAILABLE = False

# Qwen 스타일 매핑 (Instruct 지침)
QWEN_STYLE_MAP = {
    'playful': "장난끼 넘치는 밝은 여성 목소리로 말해줘",
    'grandmother': "인자하고 따뜻한 할머니 목소리로 말해줘",
    'aunt': "엄격하고 차분한 아줌마 목소리로 말해줘",
    'friendly': "친절하고 푸근한 아저씨 목소리로 말해줘",
    'ryan': "자신감 있고 활기찬 성인 남성 목소리로 말해줘. 절대로 여성 목소리를 내지 마.",
    'uncle_fu': "중후하고 차분한 중년 남성 목소리로 말해줘. 절대로 여성 목소리를 내지 마.",
    'aiden': "밝고 친근한 청년 남성 목소리로 말해줘. 절대로 여성 목소리를 내지 마.",
    'mason': "차분하고 지적인 남성 목소리로 말해줘. 절대로 여성 목소리를 내지 마."
}


def time_str_to_delta(time_str):
    """00:00:00,000 형식의 문자열을 timedelta 객체로 변환"""
    hours, minutes, seconds_ms = time_str.split(':')
    seconds, milliseconds = seconds_ms.split(',')
    return timedelta(hours=int(hours), minutes=int(minutes), seconds=int(seconds), milliseconds=int(milliseconds))


def delta_to_time_str(td):
    """timedelta 객체를 00:00:00,000 형식의 문자열로 변환"""
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    milliseconds = int(td.microseconds / 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def shift_srt_content(srt_content, time_offset):
    """SRT 내용의 타임스탬프를 time_offset만큼 이동"""
    lines = srt_content.strip().split('\n')
    new_lines = []

    # SRT 패턴: 00:00:00,000 --> 00:00:00,000
    time_pattern = re.compile(r'(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})')

    for line in lines:
        match = time_pattern.match(line)
        if match:
            start_str, end_str = match.groups()
            start_delta = time_str_to_delta(start_str) + time_offset
            end_delta = time_str_to_delta(end_str) + time_offset
            new_line = f"{delta_to_time_str(start_delta)} --> {delta_to_time_str(end_delta)}"
            new_lines.append(new_line)
        else:
            new_lines.append(line)

    return '\n'.join(new_lines) + '\n'


def clean_text(text):
    """지문 제거 및 텍스트 정제"""
    text = re.sub(r'\(.*?\)', '', text)
    text = re.sub(r'\[.*?\]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def adjust_audio_locally(input_path, output_path, rate_str="+0%", pitch_str="+0Hz"):
    """로컬에서 오디오 속도와 피치 조절 (FFmpeg 직접 사용)"""
    if not rate_str: rate_str = "+0%"
    if not pitch_str: pitch_str = "+0Hz"

    # 변경이 없는 경우 복사만 수행
    if (rate_str == "+0%" or rate_str == "0%") and (pitch_str == "+0Hz" or pitch_str == "0Hz"):
        if input_path != output_path:
            import shutil
            shutil.copy(input_path, output_path)
        return True

    try:
        import subprocess
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

        # 속도 조절 (rate)
        # rate_str 예: "+20%", "-10%"
        rate_val = 1.0
        if '%' in rate_str:
            try:
                val = float(rate_str.replace('%', '').replace('+', ''))
                rate_val = 1.0 + (val / 100.0)
            except: rate_val = 1.0

        # FFmpeg atempo 필터는 0.5 ~ 2.0 사이만 지원함. 범위를 벗어나면 여러 번 적용해야 함.
        filters = []
        if rate_val != 1.0:
            # 0.5 ~ 2.0 범위를 맞추기 위해 쪼개기
            temp_rate = rate_val
            while temp_rate > 2.0:
                filters.append("atempo=2.0")
                temp_rate /= 2.0
            while temp_rate < 0.5:
                filters.append("atempo=0.5")
                temp_rate /= 0.5
            filters.append(f"atempo={temp_rate:.2f}")

        # 피치 조절 (pitch) - FFmpeg 기본 필터로는 한계가 있지만 asetrate로 흉내 가능
        # 하지만 asetrate는 속도도 변하므로 다시 atempo로 보정해야 함
        # pitch_str 예: "+5Hz", "-2Hz" (대략적인 값)
        if 'HZ' in pitch_str.upper():
            try:
                pitch_val = float(pitch_str.upper().replace('HZ', '').replace('+', ''))
                if pitch_val != 0:
                    # 샘플 레이트 조절로 피치 변경 (기본 24000Hz 가정)
                    new_rate = 24000 + (pitch_val * 100)  # 간이 계산
                    if new_rate < 8000: new_rate = 8000
                    if new_rate > 48000: new_rate = 48000
                    filters.insert(0, f"asetrate={new_rate}")
                    # 샘플 레이트 변경으로 인한 속도 변화 보정
                    correction = 24000 / new_rate
                    filters.append(f"atempo={correction:.2f}")
            except: pass

        if not filters:
            import shutil
            shutil.copy(input_path, output_path)
            return True

        filter_str = ",".join(filters)
        cmd = [
            ffmpeg_exe, "-y", "-i", input_path,
            "-filter:a", filter_str,
            "-vn", output_path
        ]

        print(f"DEBUG: [LOCAL ADJUST] Running FFmpeg: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0:
            print(f"DEBUG: [LOCAL ADJUST] Success using FFmpeg! Saved to: {os.path.basename(output_path)}")
            return True
        else:
            print(f"DEBUG: [LOCAL ADJUST] FFmpeg failed: {result.stderr}")
            return False

    except Exception as e:
        print(f"Local audio adjustment failed: {str(e)}")
        return False

def create_ssml(text, voice, style="general", rate="+0%", pitch="+0Hz"):
    """Azure용 SSML 생성"""
    # 스타일 지원 여부 확인 (기본적으로 SunHi, Hyejin 등 일부만 지원)
    # 스타일이 "general"이거나 지원하지 않는 보이스인 경우 express-as 태그 제외
    style_voices = ['ko-KR-SunHiNeural', 'ko-KR-HyejinNeural', 'ko-KR-JiMinNeural', 'ko-KR-SeoyunNeural']

    if style == "general" or voice not in style_voices:
        return f"""
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ko-KR'>
            <voice name='{voice}'>
                <prosody rate='{rate}' pitch='{pitch}'>
                    {text}
                </prosody>
            </voice>
        </speak>
        """
    else:
        return f"""
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='ko-KR'>
            <voice name='{voice}'>
                <mstts:express-as style='{style}'>
                    <prosody rate='{rate}' pitch='{pitch}'>
                        {text}
                    </prosody>
                </mstts:express-as>
            </voice>
        </speak>
        """


def get_audio_duration(file_path):
    """FFmpeg를 사용하여 오디오 파일의 길이를 초 단위로 반환 (ffprobe 대체)"""
    try:
        import subprocess
        import imageio_ffmpeg
        import re

        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        # ffmpeg -i 명령어로 파일 정보를 가져옴 (stderr에 출력됨)
        cmd = [ffmpeg_exe, "-i", file_path]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')

        # "Duration: 00:00:05.12" 형태의 문자열 찾기
        match = re.search(r"Duration:\s+(\d+):(\d+):(\d+\.\d+)", result.stderr)
        if match:
            hours = int(match.group(1))
            minutes = int(match.group(2))
            seconds = float(match.group(3))
            return hours * 3600 + minutes * 60 + seconds
    except Exception as e:
        print(f"DEBUG: Failed to get duration for {file_path}: {e}")
    return 0.0


async def azure_tts_worker(text, voice, output_path, config, rate="+0%", pitch="+0Hz"):
    """Azure SDK 또는 Cloudflare Worker 프록시를 이용한 TTS 생성"""
    use_proxy = config.get('use_cloudflare_tts_proxy', False)
    proxy_url = config.get('cloudflare_worker_url')

    # 1. Cloudflare Proxy 사용 시
    if use_proxy and proxy_url:
        print(f"DEBUG: Using Cloudflare TTS Proxy: {proxy_url}")
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    proxy_url,
                    json={
                        "text": text,
                        "voice": voice,
                        "rate": rate,
                        "pitch": pitch,
                        "format": "audio-24khz-48kbitrate-mono-mp3"
                        # 여기서 region을 보내지 않음으로써 Worker가 자신의 설정을 사용하게 함
                    },
                    timeout=30.0
                )
                if response.status_code == 200:
                    with open(output_path, "wb") as f:
                        f.write(response.content)
                    return True
                else:
                    print(f"ERROR: Cloudflare Proxy Error ({response.status_code}): {response.text}")
                    # 실패 시 SDK로 폴백 시도 (키가 있는 경우)
        except Exception as e:
            print(f"ERROR: Cloudflare Proxy Exception: {str(e)}")

    # 2. Azure SDK 사용 (키가 있는 경우)
    key = config.get('azure_speech_key')
    region = config.get('azure_speech_region', 'eastus')
    if not key: return False

    try:
        speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
        speech_config.speech_synthesis_voice_name = voice
        audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)
        ssml = create_ssml(text, voice, rate=rate, pitch=pitch)
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: synthesizer.speak_ssml_async(ssml).get()
        )
        return result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted
    except:
        return False


async def openai_tts_worker(text, voice, output_path, config):
    """OpenAI API를 이용한 TTS 생성"""
    if not OPENAI_AVAILABLE: return False
    api_key = config.get('openai_api_key')
    if not api_key: return False

    try:
        client = OpenAI(api_key=api_key)
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice, # 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
            input=text
        )
        response.stream_to_file(output_path)
        return True
    except:
        return False


async def qwen_tts_worker(text, voice, output_path, config):
    """Qwen3-TTS (DashScope)를 이용한 TTS 생성"""
    if not QWEN_AVAILABLE: return False
    api_key = config.get('dashscope_api_key')
    if not api_key: return False

    try:
        from dashscope.audio.tts_v2 import SpeechSynthesizer
        import dashscope

        # API Key 설정 (전역 또는 인스턴스)
        dashscope.api_key = api_key

        # 스타일 분리 (예: sohee|playful)
        instruct = None
        if '|' in voice:
            voice, style_key = voice.split('|', 1)
            instruct = QWEN_STYLE_MAP.get(style_key)

        # 보이스 이름을 소문자로 변환 (DashScope는 소문자 권장)
        voice = voice.lower()

        # 남성 보이스인데 스타일(instruct)이 없는 경우 기본 남성 지침 추가
        if not instruct and voice in ['ryan', 'uncle_fu', 'aiden', 'mason']:
            instruct = QWEN_STYLE_MAP.get(voice)

        # Qwen3-TTS 모델 설정 (기본값: qwen3-tts-flash)
        model = config.get('qwen_model', 'qwen3-tts-flash')

        # DashScope v2 SDK에서는 synthesizer 생성 시점에 voice를 지정하거나,
        # call() 시점에 voice를 지정할 수 있습니다.
        # 여기서는 synthesizer 생성 시점에 기본값을 설정합니다.
        synthesizer = SpeechSynthesizer(model=model, voice=voice)

        # 오디오 파일로 저장
        def run_call():
            print(f"DEBUG: DashScope Call - Voice: {voice}, Instruct: {instruct}")
            # v2 SDK의 call 메서드 파라미터 확인: text 외에 voice를 명시적으로 전달
            # instruct는 parameters={'instruct': instruct} 형태로 전달 시도
            if instruct:
                return synthesizer.call(text, voice=voice, parameters={'instruct': instruct})
            return synthesizer.call(text, voice=voice)

        audio = await asyncio.get_event_loop().run_in_executor(
            None,
            run_call
        )

        if audio:
            with open(output_path, "wb") as f:
                f.write(audio)
            return True
        return False
    except Exception as e:
        print(f"Qwen TTS Error: {e}")
        return False


# --- FFmpeg Auto-configuration for moviepy/pydub ---
def configure_ffmpeg():
    """moviepy와 pydub이 FFmpeg를 찾을 수 있도록 환경 설정"""
    try:
        import os
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

        if ffmpeg_exe and os.path.exists(ffmpeg_exe):
            print(f"DEBUG: Found imageio-ffmpeg at: {ffmpeg_exe}")

            # 1. moviepy 설정 업데이트
            try:
                # moviepy 1.x
                from moviepy.config import change_settings
                change_settings({"FFMPEG_BINARY": ffmpeg_exe})
            except ImportError:
                # moviepy 2.x - 보통 자동으로 imageio_ffmpeg를 사용하지만 명시적으로는 다름
                # moviepy 2.x에서는 환경 변수를 통해 설정 가능
                os.environ["MOVIEPY_FFMPEG_BINARY"] = ffmpeg_exe
                print("DEBUG: moviepy 2.x detected, setting MOVIEPY_FFMPEG_BINARY env var")

            # 2. pydub을 위해 PATH에 추가
            ffmpeg_dir = os.path.dirname(ffmpeg_exe)
            if ffmpeg_dir not in os.environ["PATH"]:
                # 앞에 추가하여 우선순위 높임
                os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]

            # 3. pydub 전용 설정
            from pydub import AudioSegment
            # converter와 ffprobe 직접 지정 (확장자 포함 여부 주의)
            AudioSegment.converter = ffmpeg_exe

            # ffprobe가 없는 경우 ffmpeg을 대신 사용하거나 
            # pydub이 ffmpeg을 ffprobe처럼 사용할 수 있도록 시도
            ffprobe_exe = ffmpeg_exe.replace("ffmpeg.exe", "ffprobe.exe").replace("ffmpeg", "ffprobe")
            if os.path.exists(ffprobe_exe):
                AudioSegment.ffprobe = ffprobe_exe
                print(f"DEBUG: ffprobe found at: {ffprobe_exe}")
            else:
                print("DEBUG: ffprobe not found in same directory.")

            print("DEBUG: FFmpeg configured successfully using imageio-ffmpeg")
            return True
    except Exception as e:
        print(f"DEBUG: Failed to auto-configure FFmpeg: {e}")
    return False


# 초기화 시점에 설정 실행
configure_ffmpeg()

from pydub import AudioSegment

async def edge_tts_worker(text, voice, output_path, rate="+0%", pitch="+0Hz"):
    """Edge TTS를 이용한 무료 클라우드 TTS 생성"""
    try:
        # Edge TTS 파라미터 정규화
        edge_rate = rate if rate else "+0%"
        edge_pitch = pitch if pitch else "+0Hz"

        print(f"DEBUG: edge_tts_worker - Voice: {voice}, Rate: {edge_rate}, Pitch: {edge_pitch}")

        communicate = edge_tts.Communicate(text, voice, rate=edge_rate, pitch=edge_pitch)
        await communicate.save(output_path)
        return True
    except Exception as e:
        print(f"Edge TTS error for {voice}: {str(e)}. Trying fallback.")
        # 남성 보이스인 경우 남성 폴백으로 시도
        male_keywords = ['male', '남성', 'injoon', 'bongjin', 'gookmin', 'hyunsu', 'kiwoong', 'jinwoo', 'taehee', 'hyunsu']
        voice_lower = voice.lower()
        if any(k in voice_lower for k in male_keywords) or ('neural' in voice_lower and not any(k in voice_lower for k in ['sunhi', 'jimin', 'seohyeon', 'yujin', 'hyejin', 'jiyoon', 'seoyun'])):
            fallback_voice = "ko-KR-InJoonNeural"
        else:
            fallback_voice = "ko-KR-SunHiNeural"

        if voice != fallback_voice:
            try:
                print(f"DEBUG: edge_tts_worker fallback to {fallback_voice}")
                communicate = edge_tts.Communicate(text, fallback_voice, rate=rate, pitch=pitch)
                await communicate.save(output_path)
                return True
            except Exception as e2:
                print(f"Edge TTS fallback failed: {str(e2)}")
                return False
        return False


async def create_audio_and_srt(script_data, voice_map, output_name, output_dir=None, engine=None, rate="+0%", pitch="+0Hz", progress_callback=None, gap_duration=0.5):
    """전체 스크립트를 음성 파일로 만들고 SRT 자막 생성. gap_duration은 문장 간 무음 간격(초)"""
    import hashlib
    import shutil
    import io
    from pydub import AudioSegment

    config = load_config()
    use_azure = (config.get('use_azure_tts', False) and config.get('azure_speech_key')) or \
                (config.get('use_cloudflare_tts_proxy', False) and config.get('cloudflare_worker_url'))

    if output_dir:
        audio_dir = output_dir
    else:
        audio_dir = os.path.join(get_asset_dir(), "audio")
    os.makedirs(audio_dir, exist_ok=True)

    # 캐시 디렉토리 생성
    cache_dir = os.path.join(get_asset_dir(), "tts_cache")
    os.makedirs(cache_dir, exist_ok=True)

    final_audio_path = os.path.join(audio_dir, f"{output_name}.mp3")
    final_srt_path = os.path.join(audio_dir, f"{output_name}.srt")

    combined_audio = AudioSegment.empty()
    combined_srt_lines = []
    current_time_offset = timedelta(seconds=0)

    # 무음 세그먼트 생성
    silence = AudioSegment.silent(duration=int(gap_duration * 1000))

    if isinstance(script_data, str):
        script_data = [{'speaker': 'Narrator', 'text': script_data}]
        voice_map = {'Narrator': voice_map} if isinstance(voice_map, str) else voice_map

    total_lines = len(script_data)
    print(f"DEBUG: Starting TTS generation for {total_lines} lines")
    try:
        for idx, line_item in enumerate(script_data):
            # [추가] 매 루프마다 취소 여부 확인
            if progress_callback:
                # 40% ~ 70% 사이에서 진행률 표시
                progress_val = 40 + int((idx / total_lines) * 30)
                # progress_callback 내부에서 cancel_requested를 체크하고 
                # asyncio.CancelledError를 발생시키도록 되어 있음 (main.py 참조)
                await progress_callback(progress_val, f"음성 생성 중... ({idx+1}/{total_lines})")

            speaker = line_item.get('speaker', 'Narrator')
            raw_text = line_item.get('text', '')
            text_to_speak = clean_text(raw_text)
            # 빈 내레이션 = 의도된 무음 홀드 구간 (ASMR용). hold_sec만큼 무음 + 자막 표시
            hold_sec = 0
            try:
                hold_sec = float(line_item.get('hold_sec') or 0)
            except (TypeError, ValueError):
                hold_sec = 0
            hold_sec = min(max(hold_sec, 0), 15.0)
            if not text_to_speak:
                if hold_sec >= 1.0:
                    hold_subtitle = str(line_item.get('subtitle') or '').strip()
                    hold_seg = AudioSegment.silent(duration=int(hold_sec * 1000))
                    combined_audio += hold_seg
                    start_time = current_time_offset
                    end_time = current_time_offset + timedelta(seconds=hold_sec)
                    if hold_subtitle:
                        srt_line = f"{idx+1}\n{delta_to_time_str(start_time)} --> {delta_to_time_str(end_time)}\n{hold_subtitle}\n\n"
                        combined_srt_lines.append(srt_line)
                    if idx < total_lines - 1:
                        combined_audio += silence
                        current_time_offset = end_time + timedelta(seconds=gap_duration)
                    else:
                        current_time_offset = end_time
                    print(f"DEBUG: Silent hold {hold_sec}s at index {idx} (subtitle: {hold_subtitle[:20] if hold_subtitle else '-'})")
                    continue
                print(f"DEBUG: Skipping empty text at index {idx}")
                continue

            voice = voice_map.get(speaker, "ko-KR-SunHiNeural")

            # speaker_settings가 있으면 해당 화자의 rate, pitch 적용
            current_rate = rate
            current_pitch = pitch
            if isinstance(voice_map, dict) and 'settings' in voice_map:
                speaker_settings = voice_map['settings'].get(speaker, {})
                current_rate = speaker_settings.get('rate', rate)
                current_pitch = speaker_settings.get('pitch', pitch)

            # 캐시 키 생성 (텍스트, 목소리, 엔진, 속도, 피치 조합)
            cache_key = hashlib.md5(f"{text_to_speak}_{voice}_{engine}_{current_rate}_{current_pitch}".encode()).hexdigest()
            cache_path = os.path.join(cache_dir, f"{cache_key}.mp3")

            # 베이스 캐시 키 (속도/피치 제외 - 로컬 처리용)
            base_cache_key = hashlib.md5(f"{text_to_speak}_{voice}_{engine}_+0%_+0Hz".encode()).hexdigest()
            base_cache_path = os.path.join(cache_dir, f"{base_cache_key}.mp3")

            temp_segment_path = os.path.join(audio_dir, f"temp_{idx}.mp3")

            success = False

            # 0. Edge TTS 확인 (무료 - 로컬 처리보다 직접 생성이 품질이 좋음)
            is_edge = engine == 'edge' or (not engine and not config.get('use_azure_tts') and not config.get('use_openai_tts'))

            # 1. 완전 일치 캐시 확인 (0 토큰)
            if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
                print(f"DEBUG: Using exact cached TTS segment: {cache_key}")
                shutil.copy(cache_path, temp_segment_path)
                success = True

            # 2. 베이스 캐시가 있으면 로컬 처리 시도 (0 토큰)
            # 단, Edge TTS는 직접 생성함
            if not success and not is_edge and os.path.exists(base_cache_path) and os.path.getsize(base_cache_path) > 0:
                print(f"DEBUG: Base audio exists. Adjusting locally (0 Tokens): {base_cache_key}")
                success = adjust_audio_locally(base_cache_path, temp_segment_path, current_rate, current_pitch)
                if success:
                    # 로컬 처리된 결과도 캐시 저장
                    shutil.copy(temp_segment_path, cache_path)

            # 3. 캐시가 없으면 생성 (최초 1회만 토큰 소모)
            if not success:
                # 3.0 Edge TTS (무료 - 직접 생성하여 최상의 품질 유지)
                if is_edge:
                    try:
                        print(f"DEBUG: Edge TTS Direct Generation via worker - Index: {idx}, Voice: {voice}, Rate: {current_rate}, Pitch: {current_pitch}")

                        # edge_tts_worker를 사용하여 성별 폴백 지원
                        success = await edge_tts_worker(text_to_speak, voice, temp_segment_path, rate=current_rate, pitch=current_pitch)

                        if success and os.path.exists(temp_segment_path) and os.path.getsize(temp_segment_path) > 0:
                            # 생성된 파일 캐시 저장
                            shutil.copy(temp_segment_path, cache_path)
                        else:
                            print(f"DEBUG: Edge TTS via worker failed to create segment file for index {idx}")
                            success = False
                    except Exception as e:
                        print(f"DEBUG: Edge TTS Exception in create_audio_and_srt for index {idx}: {e}")
                        success = False

                # 3.1 유료 엔진용 베이스 버전 생성 (토큰 1회만 소모)
                if not success:
                        print(f"DEBUG: Generating base audio (1 Token) to allow free future adjustments: {base_cache_key}")
                        base_success = False

                        # 3.1.1 OpenAI Base
                        if not base_success and (engine == 'openai' or (not engine and config.get('use_openai_tts'))):
                            if config.get('openai_api_key'):
                                base_success = await openai_tts_worker(text_to_speak, voice, base_cache_path, config)

                        # 3.1.2 Azure Base
                        if not base_success and (engine == 'azure' or (not engine and use_azure)):
                            base_success = await azure_tts_worker(text_to_speak, voice, base_cache_path, config, rate="+0%", pitch="+0Hz")
                        # 3.1.3 Qwen Base
                        if not base_success and (engine == 'qwen' or (not engine and config.get('use_qwen_tts'))):
                            if config.get('dashscope_api_key'):
                                base_success = await qwen_tts_worker(text_to_speak, voice, base_cache_path, config)

                        # 3.1.4 폴백용 Edge TTS Base
                        if not base_success:
                            try:
                                communicate = edge_tts.Communicate(text_to_speak, voice)
                                await communicate.save(base_cache_path)
                                base_success = True
                            except Exception as e:
                                print(f"DEBUG: Fallback Edge TTS Base failed for index {idx}: {e}")

                        # 3.2 베이스 생성 성공했으면 로컬 조절
                        if base_success and os.path.exists(base_cache_path):
                            success = adjust_audio_locally(base_cache_path, temp_segment_path, current_rate, current_pitch)
                            if success:
                                shutil.copy(temp_segment_path, cache_path)

            if success:
                print(f"DEBUG: Segment {idx} success. File size: {os.path.getsize(temp_segment_path)}")

                # pydub은 ffprobe가 없으면 MP3를 직접 읽지 못하므로 WAV로 변환 후 로드
                temp_wav_path = temp_segment_path.replace(".mp3", ".wav")
                try:
                    import subprocess
                    import imageio_ffmpeg
                    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
                    subprocess.run([ffmpeg_exe, "-y", "-i", temp_segment_path, temp_wav_path], capture_output=True)

                    if os.path.exists(temp_wav_path):
                        segment = AudioSegment.from_wav(temp_wav_path)
                        combined_audio += segment

                        # 길이는 ffmpeg -i 로 정확하게 측정 (pydub duration_seconds도 가능하지만 안전하게)
                        duration_sec = get_audio_duration(temp_segment_path)
                        segment_duration = timedelta(seconds=duration_sec)

                        os.remove(temp_wav_path)
                    else:
                        raise Exception("Failed to convert MP3 to WAV for pydub")
                except Exception as e:
                    print(f"DEBUG: Failed to load segment {idx} into pydub: {e}")
                    # 폴백: 대략적인 길이 계산 (파일 크기 기반 또는 무음 처리)
                    success = False

            if success:
                start_time = current_time_offset
                end_time = current_time_offset + segment_duration

                srt_line = f"{idx+1}\n{delta_to_time_str(start_time)} --> {delta_to_time_str(end_time)}\n{text_to_speak}\n\n"
                combined_srt_lines.append(srt_line)

                # 문장 간 간격 추가 (마지막 문장이 아닐 때만)
                if idx < total_lines - 1:
                    combined_audio += silence
                    current_time_offset = end_time + timedelta(seconds=gap_duration)
                else:
                    current_time_offset = end_time
            else:
                print(f"CRITICAL: Failed to generate TTS for index {idx}. Speaker: {speaker}, Text: {text_to_speak[:30]}...")
                # 실패 시 빈 무음이라도 추가하여 인덱스 유지
                combined_audio += silence

                start_time = current_time_offset
                end_time = current_time_offset + timedelta(seconds=gap_duration)

                # 실패한 문장도 SRT에 추가 (타이밍은 gap_duration 만큼만 할당)
                srt_line = f"{idx+1}\n{delta_to_time_str(start_time)} --> {delta_to_time_str(end_time)}\n[TTS 생성 실패] {text_to_speak}\n\n"
                combined_srt_lines.append(srt_line)

                current_time_offset = end_time

            if os.path.exists(temp_segment_path):
                os.remove(temp_segment_path)

        print(f"DEBUG: TTS segments generation finished. Total duration: {current_time_offset.total_seconds()}s")
        combined_audio.export(final_audio_path, format="mp3")
        print(f"DEBUG: Exported final audio to {final_audio_path}. Size: {os.path.getsize(final_audio_path)}")

        # --- SRT Time Offset Correction ---
        # gap_duration을 반영하여 각 문장의 시작/종료 시간을 재계산
        # (이미 current_time_offset이 gap_duration을 포함하고 있으므로 combined_srt_lines를 그대로 사용해도 되지만, 
        #  루프 내에서 end_time 계산 시 gap_duration이 누락되었을 가능성을 위해 안전하게 current_time_offset 활용)

        with open(final_srt_path, "w", encoding="utf-8") as f:
            f.writelines(combined_srt_lines)

        return final_audio_path, final_srt_path
    except Exception as e:
        print(f"Error in create_audio_and_srt: {e}")
        raise e

    return final_audio_path, final_srt_path


if __name__ == "__main__":
    test_script = [
        {'speaker': 'BJ', 'text': '형님들 안녕하세요!'},
        {'speaker': 'Anchor', 'text': '반갑습니다. 뉴스입니다.'}
    ]
    voice_map = {'BJ': 'ko-KR-InJoonNeural', 'Anchor': 'ko-KR-SunHiNeural'}
    asyncio.run(create_audio_and_srt(test_script, voice_map, "test_multi"))
