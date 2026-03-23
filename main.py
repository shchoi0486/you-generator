import asyncio
import os
import sys
import yaml
from scraper import get_news_content
from generator import generate_full_package
from tts_engine import create_audio_and_srt
from visual_engine import download_ai_image
from video_editor import assemble_final_video

def load_config():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(base_dir, 'config', 'settings.yaml')
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)

async def main():
    print("=== AutoVideoSystem Start ===")
    
    # 1. Configuration
    config = load_config()
    api_key = config.get('gemini_api_key')
    if not api_key or api_key == "YOUR_GEMINI_API_KEY":
        print("Error: Gemini API Key not set in config/settings.yaml")
        print("Please edit config/settings.yaml and add your API key.")
        return

    # 2. Input URL
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        # Default behavior or prompt if interactive
        # url = input("Enter News URL: ")
        print("Usage: python main.py <news_url>")
        return

    print(f"1. Scraping URL: {url}...")
    article_text = await get_news_content(url)
    if not article_text:
        print("Failed to scrape content.")
        return
    print("   Scraping done.")

    print("2. Generating Script & Scenes (Gemini)...")
    generated_data = generate_full_package(article_text, api_key)
    if not generated_data:
        print("Failed to generate script.")
        return
    
    script = generated_data.get('script', [])
    scene_guide = generated_data.get('scene_guide', [])
    print(f"   Generated {len(script)} lines of script and {len(scene_guide)} scenes.")

    print("3. Generating Audio & SRT (Edge-TTS)...")
    full_text = ""
    for line in script:
        speaker = line.get('speaker', 'Narrator')
        text = line.get('text', '')
        full_text += f"{speaker}: {text}\n"
    
    # Use Park Anchor's voice
    voice = config.get('voice_settings', {}).get('park_anchor', 'ko-KR-InJoonNeural')
    audio_path, srt_path = await create_audio_and_srt(full_text, voice, "final_audio")
    
    if not audio_path:
        print("Failed to generate audio.")
        return
    print(f"   Audio saved to {audio_path}")

    print("4. Downloading Background Images (Pollinations)...")
    bg_images = []
    
    # Check if scene_guide has time info
    use_durations = False
    if scene_guide and 'time_start' in scene_guide[0] and 'time_end' in scene_guide[0]:
        use_durations = True

    for i, scene in enumerate(scene_guide):
        keyword = scene.get('keyword', 'news background')
        print(f"   Downloading image for: {keyword}")
        img_path = download_ai_image(keyword, i)
        
        if img_path:
            if use_durations:
                start = scene.get('time_start', 0)
                end = scene.get('time_end', 10)
                duration = max(1, end - start) # Minimum 1 second
                bg_images.append((img_path, duration))
            else:
                bg_images.append(img_path)
    
    if not bg_images:
        print("No images downloaded.")
        return

    print("5. Assembling Video (MoviePy)...")
    output_path = "output_video.mp4"
    success = assemble_final_video(audio_path, srt_path, bg_images, output_path)
    
    if success:
        print(f"=== Video Generation Complete: {output_path} ===")
    else:
        print("=== Video Generation Failed ===")

if __name__ == "__main__":
    if sys.platform == "win32":
        # Playwright requires ProactorEventLoop on Windows
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
