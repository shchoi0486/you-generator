from pydub.utils import which
import imageio_ffmpeg
import os

print(f"pydub which ffmpeg: {which('ffmpeg')}")
print(f"pydub which ffprobe: {which('ffprobe')}")
print(f"imageio_ffmpeg exe: {imageio_ffmpeg.get_ffmpeg_exe()}")
print(f"PATH: {os.environ.get('PATH')}")
