# PyInstaller spec for the Tauri sidecar binary.
#
# Build (Windows, in backend/ with deps installed):
#   pip install pyinstaller
#   pyinstaller you-backend-onefile.spec
# Then copy/rename the output to the sidecar name Tauri expects:
#   frontend/src-tauri/binaries/you-backend-x86_64-pc-windows-msvc.exe
#
# NOTE: moviepy/imageio-ffmpeg download an ffmpeg binary at runtime on first
# use; on an offline PC, pre-seed it or imageio_ffmpeg's binary.
#
# ─────────────────────────────────────────────────────────────────────────
# API 키 금지 (매우 중요)
#   사용자의 API 키는 %LOCALAPPDATA%/YouGenerator/config/settings.yaml 에
#   저장된다(암호화: data/provider_keys.enc). 절대 빌드에 포함하지 않는다.
#
#   2026-09-27 실제로 이 문제가 있었다: config/settings.yaml 을 그대로
#   datas 에 넣어 빌드하니 개발자의 gemini/pexels/cloudflare 키 3개가
#   배포물에 박혔다. exe 를 받은 사람이 그 키로 그 개발자 계정 과금을 발생시킨다.
#
#   아래 _build_settings_template() 이 빌드 시점에 키를 비운 사본을 만들어
#   번들한다. 원본 config/settings.yaml 은 건드리지 않는다.
# ─────────────────────────────────────────────────────────────────────────

import os
import re
import tempfile

import yaml

# 키가 들어갈 수 있는 항목(값을 빈 문자열로 만든다). 여기 없으면 기본적으로 비운다.
_SECRET_KEYS = (
    "gemini_api_key", "openai_api_key", "minimax_api_key", "fal_api_key",
    "kling_api_key", "seedream_api_key", "deepseek_api_key", "qwen_api_key",
    "elevenlabs_api_key", "azure_speech_key", "cloudflare_api_token",
    "pexels_api_key", "pollinations_api_key", "tavily_api_key",
)
_NESTED_SECRET_HINTS = (
    "key", "token", "secret", "password", "account_id", "worker_url",
)


def _is_secret(key: str) -> bool:
    if key in _SECRET_KEYS:
        return True
    k = str(key).lower()
    return any(h in k for h in _NESTED_SECRET_HINTS)


def _build_settings_template(src: str) -> str:
    """키를 전부 비운 settings 사본을 만든다(원본은 수정하지 않는다)."""
    with open(src, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    removed = []

    def scrub(node):
        if isinstance(node, dict):
            for k in list(node.keys()):
                if _is_secret(k) and node[k] not in (None, "", [], {}):
                    removed.append(str(k))
                    node[k] = ""
                else:
                    scrub(node[k])
        elif isinstance(node, list):
            for x in node:
                scrub(x)

    scrub(data)

    # 사용자에게 첫 실행 시 키를 넣으라고 안내하는 표시를 남긴다.
    if isinstance(data.get("image_gen"), dict):
        data["image_gen"].setdefault("_key_help",
                                    "API 키는 앱의 'API 키' 화면에서 등록하세요. "
                                    "이 파일에 직접 써도 되지만 암호화되지 않습니다.")

    fd, dst = tempfile.mkstemp(suffix=".yaml", prefix="settings_clean_")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=True,
                       default_flow_style=False)
    print(f"[spec] settings.yaml 템플릿 생성: {dst}")
    if removed:
        print(f"[spec] 제거한 키 항목 {len(removed)}개: {', '.join(sorted(set(removed)))}")
    else:
        print("[spec] 제거할 키가 없었다 (이미 비어 있음)")
    return dst


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

_SRC_SETTINGS = os.path.join(os.path.abspath('config'), 'settings.yaml')
if os.path.exists(_SRC_SETTINGS):
    _CLEAN_SETTINGS = _build_settings_template(_SRC_SETTINGS)
else:
    _CLEAN_SETTINGS = _build_settings_template(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config', 'settings.yaml'))

a = Analysis(
    ['main.py'],
    pathex=[os.path.abspath('.')],
    binaries=azure_binaries,
    datas=[
        # 키가 제거된 설정 템플릿. 사용자 키는 %LOCALAPPDATA% 에 암호화되어 저장된다.
        (_CLEAN_SETTINGS, 'config'),
        # 프로바이더 레지스트리는 키가 없는 순수 데이터라 포함한다.
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
