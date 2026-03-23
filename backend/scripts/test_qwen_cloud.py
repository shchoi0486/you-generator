import asyncio
import os
import sys

# 프로젝트 루트 경로 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.tts_engine import qwen_tts_worker
from core.config_utils import load_config

async def test_qwen_cloud():
    print("Testing Qwen-TTS Cloud (DashScope)...")
    
    config = load_config()
    api_key = config.get('dashscope_api_key')
    
    if not api_key:
        print("DashScope API Key not found in config. Please check settings.yaml")
        return

    test_voices = ["sohee", "ryan", "ana"]
    test_text = "안녕하세요, {voice} 목소리 테스트 중입니다. 잘 들리시나요?"
    
    for voice in test_voices:
        output_path = f"qwen_cloud_test_{voice}.mp3"
        print(f"Generating audio with Qwen Cloud (Voice: {voice})...")
        success = await qwen_tts_worker(test_text.format(voice=voice), voice, output_path, config)
        
        if success:
            print(f"Success! {voice} audio saved to: {os.path.abspath(output_path)}")
        else:
            print(f"Failed to generate audio for {voice} with Qwen Cloud.")

if __name__ == "__main__":
    asyncio.run(test_qwen_cloud())
