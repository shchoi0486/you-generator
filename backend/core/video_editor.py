from moviepy import (
    AudioFileClip, ImageClip, concatenate_videoclips, vfx,
    TextClip, CompositeVideoClip, CompositeAudioClip
)
import os
import re
from .config_utils import get_export_dir


def get_audio_duration(audio_path):
    try:
        if not os.path.exists(audio_path):
            return 0
        with AudioFileClip(audio_path) as audio:
            return audio.duration
    except Exception as e:
        print(f"Error getting audio duration: {e}")
        return 0


def _resize_and_crop(clip, target_size=(1920, 1080)):
    """
    이미지를 대상 해상도에 맞춰 꽉 차게(Crop & Fill) 조정합니다.
    """
    w, h = clip.size
    target_w, target_h = target_size

    # 가로세로 비율 비교
    ratio = w / h
    target_ratio = target_w / target_h

    if ratio > target_ratio:
        # 이미지가 더 넓음 -> 세로를 맞추고 가로를 자름
        new_clip = clip.resized(height=target_h)
        # 중앙 자르기
        center_x = new_clip.w / 2
        new_clip = new_clip.cropped(
            x_center=center_x,
            y_center=target_h / 2,
            width=target_w,
            height=target_h
        )
    else:
        # 이미지가 더 좁음 -> 가로를 맞추고 세로를 자름
        new_clip = clip.resized(width=target_w)
        # 중앙 자르기
        center_y = new_clip.h / 2
        new_clip = new_clip.cropped(
            x_center=target_w / 2,
            y_center=center_y,
            width=target_w,
            height=target_h
        )

    return new_clip


def parse_srt(srt_path=None, srt_content=None):
    """SRT 파일 또는 내용을 파싱하여 (start, end, text) 리스트를 반환합니다."""
    content = ""
    if srt_content:
        content = srt_content
    elif srt_path and os.path.exists(srt_path):
        with open(srt_path, 'r', encoding='utf-8') as f:
            content = f.read()

    if not content:
        return []
    pattern = re.compile(
        r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n'
        r'(.*?)(?=\n\n|\n$|$)',
        re.DOTALL
    )
    matches = pattern.findall(content)

    def time_to_seconds(t_str):
        h, m, s_ms = t_str.split(':')
        s, ms = s_ms.split(',')
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    subtitles = []
    for m in matches:
        start = time_to_seconds(m[1])
        end = time_to_seconds(m[2])
        text = m[3].replace('\n', ' ').strip()
        subtitles.append((start, end, text))

    return subtitles


def assemble_final_video(
    audio_path, srt_path, bg_images, output_path,
    subtitle_style=None, audio_edit=None, edited_srt=None,
    aspect_ratio="16:9 (Youtube)",  # 추가
    progress_callback=None, cancel_check=None
):
    """
    오디오, 자막, 배경 이미지를 합쳐 최종 영상을 생성합니다.
    subtitle_style: {
        preset, font, font_size, color, stroke_color,
        stroke_width, bg_color, y_offset, show_subtitles
    }
    audio_edit: {bgm_path, bgm_volume, sfx_list: [{path, time, volume}]}
    edited_srt: 직접 수정한 SRT 내용 (문자열)
    aspect_ratio: "16:9 (Youtube)", "9:16 (Shorts)", etc.
    """
    try:
        from .visual_engine import ASPECT_RATIOS
        
        # 오디오 파일 로드
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        main_audio = AudioFileClip(audio_path)
        total_duration = main_audio.duration

        # 1. 오디오 편집 (BGM, SFX 추가)
        if progress_callback:
            progress_callback(5, "오디오 리소스를 준비하고 있습니다...")

        audio_clips = [main_audio]
        # ... (생략 가능하지만 전체 로직 유지를 위해 그대로 둠)

        if audio_edit:
            # BGM 추가
            bgm_path = audio_edit.get('bgm_path')
            # 상대 경로인 경우 절대 경로로 변환 시도
            if bgm_path and not os.path.isabs(bgm_path):
                from .config_utils import get_asset_dir
                bgm_path = os.path.join(
                    get_asset_dir(), bgm_path.replace('assets/', '')
                )

            if bgm_path and os.path.exists(bgm_path):
                if progress_callback:
                    progress_callback(
                        7,
                        f"배경 음악을 로드하고 있습니다: "
                        f"{os.path.basename(bgm_path)}"
                    )
                bgm = AudioFileClip(bgm_path).with_volume_scaled(
                    audio_edit.get('bgm_volume', 0.2)
                )
                # 영상 길이에 맞춰 루프하거나 자름
                if bgm.duration < total_duration:
                    bgm = bgm.with_duration(total_duration).fx(vfx.loop)
                else:
                    bgm = bgm.subclipped(0, total_duration)
                audio_clips.append(bgm)

            # SFX 추가
            sfx_list = audio_edit.get('sfx_list', [])
            for s_idx, sfx_info in enumerate(sfx_list):
                if progress_callback and len(sfx_list) > 0:
                    progress_callback(
                        7 + int((s_idx / len(sfx_list)) * 5),
                        f"효과음을 준비 중입니다 ({s_idx+1}/{len(sfx_list)})"
                    )
                
                sfx_path = sfx_info.get('path')
                # 상대 경로인 경우 절대 경로로 변환 시도
                if sfx_path and not os.path.isabs(sfx_path):
                    from .config_utils import get_asset_dir
                    sfx_path = os.path.join(
                        get_asset_dir(), sfx_path.replace('assets/', '')
                    )

                if sfx_path and os.path.exists(sfx_path):
                    sfx = AudioFileClip(sfx_path).with_volume_scaled(
                        sfx_info.get('volume', 1.0)
                    )
                    start_time = sfx_info.get('time', 0)
                    if start_time < total_duration:
                        sfx = sfx.with_start(start_time)
                        audio_clips.append(sfx)

        if len(audio_clips) > 1:
            final_audio = CompositeAudioClip(audio_clips)
        else:
            final_audio = main_audio

        if progress_callback:
            progress_callback(15, "영상 트랙 리소스를 준비하고 있습니다...")

        # 2. 이미지 클립 생성
        clips = []
        if not bg_images:
            raise ValueError("No background images provided")

        # [수정] aspect_ratio에 따른 대상 해상도 설정
        target_size = ASPECT_RATIOS.get(aspect_ratio, (1280, 720))
        # 만약 (1280, 720) 처럼 작다면 고품질을 위해 1.5배 스케일링 (1920x1080급)
        if target_size[0] < 1920 and target_size[1] < 1920:
             if target_size[0] > target_size[1]: # Landscape
                 scale = 1920 / target_size[0]
             else: # Portrait
                 scale = 1920 / target_size[1]
             target_size = (int(target_size[0] * scale), int(target_size[1] * scale))

        print(f"DEBUG: Rendering video with aspect_ratio: {aspect_ratio}, size: {target_size}")
        print(f"DEBUG: Received bg_images type: {type(bg_images)}, length: {len(bg_images)}")
        if len(bg_images) > 0:
            print(f"DEBUG: First bg_image element: {bg_images[0]}")

        # bg_images가 [(paths, duration), ...] 또는 [paths, ...] 형식인지 확인
        # paths는 단일 경로(str)이거나 경로 리스트(List[str])일 수 있음
        def check_has_durations(data):
            if not data or not isinstance(data, list):
                return False
            first = data[0]
            # [ ["path1", "path2"], 5.0 ] 또는 [ "path1", 5.0 ] 형식인지 확인
            return (
                isinstance(first, (tuple, list)) and 
                len(first) == 2 and 
                (isinstance(first[1], (int, float)))
            )

        has_durations = check_has_durations(bg_images)
        print(f"DEBUG: bg_images format has_durations={has_durations}")

        if not has_durations:
            duration_per_scene = total_duration / len(bg_images)
            for idx, scene_visuals in enumerate(bg_images):
                if progress_callback:
                    p = 20 + int((idx / len(bg_images)) * 10)
                    progress_callback(p, f"영상 장면을 구성하고 있습니다... ({idx+1}/{len(bg_images)})")

                if cancel_check and cancel_check():
                    raise InterruptedError("User requested cancellation")
                
                # scene_visuals가 리스트인 경우와 단일 문자열인 경우 모두 대응
                paths = scene_visuals if isinstance(scene_visuals, list) else [scene_visuals]
                if not paths: 
                    print(f"DEBUG: Scene {idx} has no images, using placeholder")
                    continue
                
                duration_per_image = duration_per_scene / len(paths)
                for img_path in paths:
                    if img_path and os.path.exists(img_path):
                        try:
                            clip = ImageClip(img_path)
                            clip = clip.with_duration(duration_per_image)
                            clip = _resize_and_crop(clip, target_size)
                            clips.append(clip)
                        except Exception as e:
                            print(f"Error: Failed to process image {img_path}: {e}")
                    else:
                        print(f"Warning: Image path does not exist: {img_path}")
        else:
            current_time_acc = 0
            for idx, (scene_visuals, duration) in enumerate(bg_images):
                if progress_callback:
                    p = 20 + int((idx / len(bg_images)) * 10)
                    progress_callback(p, f"영상 장면을 구성하고 있습니다... ({idx+1}/{len(bg_images)})")

                if cancel_check and cancel_check():
                    raise InterruptedError("User requested cancellation")

                paths = scene_visuals if isinstance(scene_visuals, list) else [scene_visuals]
                if not paths: 
                    print(f"DEBUG: Scene {idx} has no images, duration: {duration}")
                    current_time_acc += duration
                    continue
                
                duration_per_image = duration / len(paths)
                for img_path in paths:
                    if img_path and os.path.exists(img_path):
                        try:
                            clip = ImageClip(img_path).with_duration(duration_per_image)
                            clip = _resize_and_crop(clip, target_size)
                            # concatenate 대신 start_time을 지정하여 Composite에 넣을 수도 있지만
                            # 여기서는 순서대로 concatenate 하기 위해 clips에 추가
                            clips.append(clip)
                            current_time_acc += duration_per_image
                        except Exception as e:
                            print(f"Error: Failed to process image {img_path}: {e}")
                            current_time_acc += duration_per_image
                    else:
                        print(f"Warning: Image path does not exist: {img_path}")
                        current_time_acc += duration_per_image

        if progress_callback:
            progress_callback(30, "자막 트랙을 준비하고 있습니다...")

        # [수정] 이미지가 하나도 없는 경우 폴백 이미지(검은 화면) 생성
        if not clips:
            print("Warning: No valid image clips created. Using black background.")
            import numpy as np
            
            # 검은색 배경 이미지 생성
            black_img = np.zeros((target_size[1], target_size[0], 3), dtype=np.uint8)
            black_clip = ImageClip(black_img).with_duration(total_duration)
            clips.append(black_clip)

        bg_video = concatenate_videoclips(clips, method="compose")

        if bg_video.duration < total_duration:
            last_frame = clips[-1].with_duration(
                total_duration - bg_video.duration
            )
            bg_video = concatenate_videoclips([bg_video, last_frame])
        elif bg_video.duration > total_duration:
            bg_video = bg_video.subclipped(0, total_duration)

        # 3. 자막 생성
        final_clips = [bg_video]

        # subtitle_style이 있거나 edited_srt가 있는 경우 자막 처리
        subtitle_style = subtitle_style or {}
        show_subtitles = subtitle_style.get('show_subtitles', True)
        
        has_subtitle_input = subtitle_style or edited_srt
        has_srt_source = edited_srt or (srt_path and os.path.exists(srt_path))
        
        if show_subtitles and has_subtitle_input and has_srt_source:
            subtitles = parse_srt(srt_path=srt_path, srt_content=edited_srt)

            # [개선] 폰트 호환성 체크 로직 추가 (Windows 환경 대응 강화)
            def get_compatible_font(font_name):
                import platform
                import os
                from PIL import ImageFont
                
                system = platform.system()
                
                # 윈도우 환경 대응
                if system == 'Windows':
                    win_font_dir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
                    
                    # 폰트 이름별 시도할 파일명 리스트
                    font_file_map = {
                        'Noto Sans KR': ['NotoSansKR-VF.ttf', 'NotoSansKR-Regular.otf', 'NotoSansKR-Medium.otf'],
                        'Malgun Gothic': ['malgun.ttf', 'malgunbd.ttf'],
                        'Arial': ['arial.ttf'],
                        'Garamond': ['gara.ttf']
                    }
                    
                    # 1. 요청된 폰트 이름으로 직접 시도 (시스템에 등록된 경우)
                    try:
                        ImageFont.truetype(font_name, 10)
                        return font_name
                    except:
                        pass
                    
                    # 2. 맵핑된 파일명으로 윈도우 폰트 디렉토리에서 찾기
                    if font_name in font_file_map:
                        for f_file in font_file_map[font_name]:
                            f_path = os.path.join(win_font_dir, f_file)
                            if os.path.exists(f_path):
                                try:
                                    ImageFont.truetype(f_path, 10)
                                    return f_path
                                except:
                                    continue
                    
                    # 3. 폰트 이름 + 확장자로 시도
                    for ext in ['.ttf', '.otf']:
                        f_path = os.path.join(win_font_dir, font_name + ext)
                        if os.path.exists(f_path):
                            try:
                                ImageFont.truetype(f_path, 10)
                                return f_path
                            except:
                                continue
                                
                    # 4. 마지막 수단: 맑은 고딕 (윈도우 표준 한글 폰트)
                    fallback_path = os.path.join(win_font_dir, "malgun.ttf")
                    if os.path.exists(fallback_path):
                        return fallback_path
                        
                    return "Arial"
                    
                return font_name

            # 프리셋별 기본 스타일 설정
            preset = subtitle_style.get('preset', 'youtube')
            
            style_config = {
                'font': get_compatible_font(subtitle_style.get('font', 'Noto Sans KR')),
                'font_size': subtitle_style.get('font_size', 20),
                'color': subtitle_style.get('color', 'white'),
                'stroke_color': subtitle_style.get('stroke_color', 'black'),
                'stroke_width': subtitle_style.get('stroke_width', 2.0),
                'method': 'caption'
            }

            # 프리셋 특화 스타일
            if preset == 'news':
                style_config.update({
                    'font_size': 16,
                    'bg_color': 'rgba(0,0,0,0.7)',
                    'stroke_width': 0
                })
            elif preset == 'cinematic':
                style_config.update({
                    'font': 'Garamond',
                    'font_size': 14,
                    'color': '#EEEEEE'
                })
            elif preset == 'neon':
                style_config.update({
                    'color': '#00FF00',
                    'stroke_color': '#FF00FF',
                    'stroke_width': 4,
                    'font_size': 22
                })

            y_pos_pct = subtitle_style.get('y_offset', 85) / 100.0

            # 텍스트 줄바꿈 함수 (한국어 및 영문 텍스트 길이에 맞춰 자동 줄바꿈)
            def wrap_text(text, font_size, max_width):
                # 대략적으로 1글자당 너비를 계산하여 줄바꿈
                # 픽셀 단위 폰트 크기이므로, 평균적으로 한 글자의 너비를 font_size의 0.7 정도로 가정
                avg_char_width = font_size * 0.7
                max_chars_per_line = max(1, int(max_width / avg_char_width))
                
                words = text.split()
                lines = []
                current_line = []
                current_len = 0
                
                for word in words:
                    # 단어 하나가 max_chars_per_line보다 길면 강제로 쪼개는 로직이 필요할 수도 있으나
                    # 보통 띄어쓰기 기준으로 처리
                    if current_len + len(word) > max_chars_per_line and current_line:
                        lines.append(" ".join(current_line))
                        current_line = [word]
                        current_len = len(word)
                    else:
                        current_line.append(word)
                        current_len += len(word) + 1
                        
                if current_line:
                    lines.append(" ".join(current_line))
                
                return "\n".join(lines)

            for s_idx, (start, end, text) in enumerate(subtitles):
                if progress_callback and len(subtitles) > 0:
                    p = 30 + int((s_idx / len(subtitles)) * 10)
                    progress_callback(p, f"자막을 생성 중입니다... ({s_idx+1}/{len(subtitles)})")

                if not text:
                    continue

                duration = end - start
                if duration <= 0:
                    continue
                    
                # 화면 너비의 80%를 최대 너비로 설정
                max_text_width = target_size[0] * 0.8
                
                # 프론트엔드에서 넘겨준 폰트 크기가 화면 높이에 비례하도록 보정 (선택적)
                # 프론트엔드가 1920x1080 기준으로 폰트 크기를 설정했다고 가정
                # 예: 70이면 1080 해상도에서 70픽셀. 
                base_height = 1080.0
                
                # 자막 크기를 좀 더 작고 보기 좋게 보정 (사용자 요청 반영: 너무 크다)
                # 70 * (해상도 비율) * 0.6 정도로 축소
                scale_factor = target_size[1] / base_height
                actual_font_size = int(style_config['font_size'] * scale_factor * 0.6)
                
                # 최소/최대 폰트 크기 보장 (가독성 유지)
                actual_font_size = max(24, min(actual_font_size, 60))

                wrapped_text = wrap_text(text, actual_font_size, max_text_width)

                try:
                    txt_clip = TextClip(
                        text=wrapped_text,
                        font=style_config['font'],
                        font_size=actual_font_size,
                        color=style_config['color'],
                        stroke_color=style_config['stroke_color'],
                        stroke_width=style_config['stroke_width'],
                        method='label',  # caption 대신 label 사용 (자동 스케일링 방지)
                        text_align='center'
                    ).with_duration(duration).with_start(start).with_position(
                        ('center', target_size[1] * y_pos_pct)
                    )
                except Exception as text_e:
                    print(
                        f"Warning: TextClip failed with "
                        f"method='label': {text_e}"
                    )
                    # 실패 시 예비 옵션
                    txt_clip = TextClip(
                        text=wrapped_text,
                        font=style_config['font'],
                        font_size=actual_font_size,
                        color=style_config['color'],
                        stroke_color=style_config['stroke_color'],
                        stroke_width=style_config['stroke_width'],
                        method='label',
                        text_align='center'
                    ).with_duration(duration).with_start(start).with_position(
                        ('center', target_size[1] * y_pos_pct)
                    )

                final_clips.append(txt_clip)

        # 최종 영상 합성
        final_video = CompositeVideoClip(
            final_clips, size=target_size
        ).with_audio(final_audio)

        # 출력 디렉토리 확인
        output_dir = os.path.dirname(output_path)
        if not output_dir:
            output_dir = get_export_dir()
            output_path = os.path.join(
                output_dir, os.path.basename(output_path)
            )

        os.makedirs(output_dir, exist_ok=True)

        # 최종 영상 생성
        logger = "bar" # MoviePy standard logger
        if progress_callback:
            try:
                from proglog import TqdmProgressBarLogger
                import time

                class CustomLogger(TqdmProgressBarLogger):
                    def __init__(self):
                        super().__init__()
                        self.last_update_time = 0
                        self.last_progress = 40
                        self.start_time = time.time()

                    def callback(self, **changes):
                        if cancel_check and cancel_check():
                            raise InterruptedError(
                                "User requested cancellation"
                            )
                        super().callback(**changes)

                    def bars_callback(self, bar, attr, value, old_value=None):
                        # progress_callback을 통해 진행률 업데이트 (40% ~ 98% 구간으로 매핑)
                        if bar == "t":  # 't' is main progress bar
                            try:
                                total = self.bars[bar]['total']
                                if total and total > 0:
                                    # 40%부터 시작하여 렌더링 진행률을 58% 구간에 매핑 (40 + 58 = 98)
                                    ratio = float(value) / float(total)
                                    
                                    # [수정] 진행률 정체 현상 해결을 위한 보정 로직
                                    # 실제 렌더링 속도가 느릴 경우 시간 기반으로 아주 조금씩이라도 올라가게 함 (심리적 효과)
                                    time_passed = time.time() - self.start_time
                                    time_bonus = min(5, time_passed / 10) # 최대 5%까지 시간 보너스
                                    
                                    current_progress = int(40 + (ratio * 58) + time_bonus)
                                    
                                    # 범위 제한
                                    current_progress = max(40, min(98, current_progress))
                                    
                                    current_time = time.time()
                                    # 0.2초마다 혹은 진행률이 올라갔을 때 업데이트 (더 빈번하게 업데이트)
                                    if (current_time - self.last_update_time > 0.2) or (current_progress > self.last_progress):
                                        self.last_update_time = current_time
                                        self.last_progress = current_progress
                                        progress_callback(current_progress, f"최종 비디오를 렌더링하고 있습니다... ({current_progress}%)")
                            except Exception as e:
                                print(f"Logger error: {e}")

                logger = CustomLogger()
            except ImportError:
                print("proglog not installed, using default logger")
        elif cancel_check:
            try:
                from proglog import TqdmProgressBarLogger
                class CancelOnlyLogger(TqdmProgressBarLogger):
                    def callback(self, **changes):
                        if cancel_check and cancel_check():
                            raise InterruptedError("User requested cancellation")
                        super().callback(**changes)
                logger = CancelOnlyLogger()
            except ImportError:
                print("proglog not installed, using default logger")

        # 렌더링 성능 최적화: threads=4 (또는 자동), preset="ultrafast" (속도 우선)
        # 프로덕션에서는 "medium" 또는 "fast"가 좋지만, 사용자 피드백에 따라 속도를 우선시함
        final_video.write_videofile(
            output_path, 
            fps=24, 
            codec="libx264", 
            audio_codec="aac",
            threads=os.cpu_count() or 4,
            preset="ultrafast",
            logger=logger
        )

        # 리소스 해제
        main_audio.close()
        if len(audio_clips) > 1:
            final_audio.close()
        final_video.close()

        return True

    except Exception as e:
        print(f"Error assembling video: {e}")
        import traceback
        traceback.print_exc()
        return False
