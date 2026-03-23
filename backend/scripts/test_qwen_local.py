import asyncio
import os
import sys

# 프로젝트 루트 경로 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.tts_engine import qwen_local_tts_worker
from core.config_utils import load_config

async def test_qwen_local():
    print("Checking Qwen-TTS Local availability...")
    try:
        from qwen_tts import Qwen3TTSModel
        print("Qwen-TTS package is available.")
    except ImportError:
        print("Qwen-TTS package NOT found. Please install it first.")
        return

    config = load_config()
    # 테스트를 위해 강제로 로컬 Qwen 사용 설정
    config['use_local_qwen'] = True
    
    test_text = "안녕하세요, 소희의 장난끼 넘치는 목소리 테스트 중입니다! 잘 들리시나요?"
    test_voice = "sohee|playful" # 새로 추가된 스타일 보이스
    output_path = "qwen_local_test_style.wav"
    
    print(f"Generating audio with Qwen Local (Voice: {test_voice})...")
    success = await qwen_local_tts_worker(test_text, test_voice, output_path, config)
    
    if success:
        print(f"Success! Audio saved to: {os.path.abspath(output_path)}")
    else:
        print("Failed to generate audio with Qwen Local.")

if __name__ == "__main__":
    asyncio.run(test_qwen_local())
