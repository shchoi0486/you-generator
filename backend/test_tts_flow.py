
import asyncio
import os
import sys

# 프로젝트 루트 또는 backend 디렉토리를 path에 추가
current_dir = os.getcwd()
if os.path.basename(current_dir) == 'backend':
    sys.path.append(current_dir)
    from core.tts_engine import create_audio_and_srt
else:
    sys.path.append(os.path.join(current_dir, 'backend'))
    from core.tts_engine import create_audio_and_srt

async def test_full_tts_flow():
    test_script = [
        {'speaker': 'Narrator', 'text': '안녕하세요, 이것은 전체 TTS 생성 흐름 테스트입니다.'},
        {'speaker': 'Narrator', 'text': '두 번째 문장입니다. MP3에서 WAV로 변환하는 로직이 잘 작동하는지 확인합니다.'}
    ]
    voice_map = {'Narrator': 'ko-KR-SunHiNeural'}
    output_name = "test_flow_result"
    
    print("DEBUG: Starting full TTS flow test...")
    try:
        audio_path, srt_path = await create_audio_and_srt(
            test_script, 
            voice_map, 
            output_name,
            engine='edge' # 무료 엔진 사용
        )
        
        print(f"DEBUG: Success!")
        print(f"DEBUG: Audio Path: {audio_path} (Size: {os.path.getsize(audio_path)})")
        print(f"DEBUG: SRT Path: {srt_path} (Size: {os.path.getsize(srt_path)})")
        
        # SRT 내용 확인
        with open(srt_path, 'r', encoding='utf-8') as f:
            print("DEBUG: SRT Content:")
            print(f.read())
            
    except Exception as e:
        print(f"DEBUG: Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_full_tts_flow())
