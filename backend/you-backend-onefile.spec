# PyInstaller spec for the Tauri sidecar binary.
#
# Build (Windows, in backend/ with deps installed):
#   pip install pyinstaller
#   pyinstaller you-backend.spec
# Then copy/rename the output dir to the sidecar name Tauri expects:
#   frontend/src-tauri/binaries/you-backend-x86_64-pc-windows-msvc.exe  (one-file)
#   frontend/src-tauri/binaries/you-backend-x86_64-pc-windows-msvc/     (one-dir, exe inside)
#
# NOTE: moviepy/imageio-ffmpeg download an ffmpeg binary at runtime on first
# use; on an offline PC, pre-seed it or bundle imageio_ffmpeg's binary.
# API keys live in %LOCALAPPDATA%/YouGenerator/config/settings.yaml (see
# core/config_utils.py) — never bundle real keys.

import os

try:
    from PyInstaller.utils.hooks import collect_dynamic_libs, copy_metadata
    # Azure Speech SDK 네이티브 DLL (ctypes 로딩이라 자동 수집 안 됨)
    azure_binaries = collect_dynamic_libs('azure.cognitiveservices.speech')
    # importlib.metadata.version() 호출 패키지들의 dist-info
    extra_datas = []
    for _pkg in ('imageio', 'imageio-ffmpeg', 'moviepy', 'pillow', 'numpy'):
        try:
            extra_datas += copy_metadata(_pkg)
        except Exception as _e:
            print(f"WARNING: copy_metadata({_pkg}) failed: {_e}")
except Exception as e:
    print(f"WARNING: hook collect failed: {e}")
    azure_binaries = []
    extra_datas = []

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=[os.path.abspath('.')],
    binaries=azure_binaries,
    datas=[
        # default settings template (user copy lives in %LOCALAPPDATA%/YouGenerator)
        ('config/settings.yaml', 'config'),
    ] + extra_datas,
    hiddenimports=[
        'moviepy',
        'moviepy.video.io.VideoFileClip',
        'moviepy.audio.io.AudioFileClip',
        'imageio_ffmpeg',
        'imageio',
        'PIL',
        'pydub',
        'yaml',
        'httpx',
        'edge_tts',
        'google.generativeai',
        'fastapi',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.protocols.http.auto',
        'multipart',
        'pydantic',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# one-file: Tauri externalBin은 단일 파일을 요구하므로 번들용은 one-file.
# 개발용은 you-backend.spec (one-dir)이 시작이 빠르다.
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='you-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # sidecar logs go to the Tauri log stream; set False to hide window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
