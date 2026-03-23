from moviepy import AudioFileClip
import imageio_ffmpeg
from moviepy.config import change_settings
import os
import asyncio
import edge_tts

async def test_moviepy_duration():
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    change_settings({"FFMPEG_BINARY": ffmpeg_exe})
    
    # Create a small mp3
    test_mp3 = "test_duration_moviepy.mp3"
    communicate = edge_tts.Communicate("Hello world", "en-US-GuyNeural")
    await communicate.save(test_mp3)
    
    try:
        print(f"File created: {test_mp3}, size: {os.path.getsize(test_mp3)}")
        clip = AudioFileClip(test_mp3)
        print(f"Duration: {clip.duration} seconds")
        clip.close()
    except Exception as e:
        print(f"Error getting duration with moviepy: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if os.path.exists(test_mp3):
            os.remove(test_mp3)

if __name__ == "__main__":
    asyncio.run(test_moviepy_duration())
