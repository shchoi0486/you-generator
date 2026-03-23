from pydub import AudioSegment
import imageio_ffmpeg
import os
import asyncio
import edge_tts

async def test_pydub_duration():
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    AudioSegment.converter = ffmpeg_exe
    
    # Create a small mp3
    test_mp3 = "test_duration.mp3"
    communicate = edge_tts.Communicate("Hello world", "en-US-GuyNeural")
    await communicate.save(test_mp3)
    
    try:
        print(f"File created: {test_mp3}, size: {os.path.getsize(test_mp3)}")
        segment = AudioSegment.from_file(test_mp3, format="mp3")
        print(f"Duration: {segment.duration_seconds} seconds")
    except Exception as e:
        print(f"Error getting duration: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if os.path.exists(test_mp3):
            os.remove(test_mp3)

if __name__ == "__main__":
    asyncio.run(test_pydub_duration())
