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

# 키가 제거된 설정 템플릿을 만든다(원본 settings.yaml 은 건드리지 않는다).
# 2026-09-27: 이 spec 이 config/settings.yaml 을 그대로 번들해 개발자의
# gemini/pexels/cloudflare 키가 배포물에 박히는 사고가 있었다.
_SCRUB_FN = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         'you-backend-onefile.spec')
with open(_SCRUB_FN, 'r', encoding='utf-8') as _f:
    _spec_src = _f.read()
_ns: dict = {}
exec(compile(_spec_src.split("try:\n    from PyInstaller.utils.hooks")[0],
             _SCRUB_FN, 'exec'), _ns)
_SRC_SETTINGS = os.path.join(os.path.abspath('config'), 'settings.yaml')
if not os.path.exists(_SRC_SETTINGS):
    _SRC_SETTINGS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 'config', 'settings.yaml')
_CLEAN_SETTINGS = _ns['_build_settings_template'](_SRC_SETTINGS)

a = Analysis(
    ['main.py'],
    pathex=[os.path.abspath('.')],
    binaries=azure_binaries,
    datas=[
        # 키가 제거된 템플릿. 사용자 키는 %LOCALAPPDATA% 에 암호화 저장된다.
        (_CLEAN_SETTINGS, 'config'),
        ('config/providers.yaml', 'config'),
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

# one-dir: faster startup, easier to debug than one-file.
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
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

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='you-backend',
)
