
import os
import sys
from pydub import AudioSegment
import imageio_ffmpeg

def test_ffmpeg():
    print("Checking FFmpeg...")
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    print(f"FFmpeg exe: {ffmpeg_exe}")
    
    if not os.path.exists(ffmpeg_exe):
        print("ERROR: FFmpeg binary not found!")
        return
    
    # Configure pydub
    AudioSegment.converter = ffmpeg_exe
    
    try:
        # Create two silent segments and merge them
        print("Creating segments...")
        s1 = AudioSegment.silent(duration=1000)
        s2 = AudioSegment.silent(duration=1000)
        combined = s1 + s2
        
        test_out = "test_output.mp3"
        print(f"Exporting to {test_out}...")
        combined.export(test_out, format="mp3")
        
        if os.path.exists(test_out):
            print(f"SUCCESS: Exported {test_out}, size: {os.path.getsize(test_out)}")
            os.remove(test_out)
        else:
            print("ERROR: Export failed, file not created.")
            
    except Exception as e:
        print(f"EXCEPTION: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_ffmpeg()
