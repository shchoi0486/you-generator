from pydub import AudioSegment
import imageio_ffmpeg
import os
import subprocess

def test_pydub_wav_no_ffprobe():
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    AudioSegment.converter = ffmpeg_exe
    # Simulate missing ffprobe
    AudioSegment.ffprobe = "nonexistent_ffprobe"
    
    # Create a small wav using ffmpeg
    test_wav = "test_pydub.wav"
    subprocess.run([ffmpeg_exe, "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", test_wav])
    
    try:
        print(f"File created: {test_wav}, size: {os.path.getsize(test_wav)}")
        segment = AudioSegment.from_wav(test_wav)
        print(f"Success! Duration: {segment.duration_seconds} seconds")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if os.path.exists(test_wav):
            os.remove(test_wav)

if __name__ == "__main__":
    test_pydub_wav_no_ffprobe()
