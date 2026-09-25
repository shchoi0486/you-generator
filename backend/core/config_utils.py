import os
import sys

try:
    import yaml
except ImportError:
    yaml = None

def get_base_dir():
    # C:\youtube\AutoVideoSystem\backend\core\config_utils.py -> C:\youtube\AutoVideoSystem\backend
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _writable_root():
    """번들(PyInstaller frozen)에서는 사용자 데이터 디렉토리 사용.
    개발 모드에서는 기존 동작(프로젝트 루트) 유지."""
    if getattr(sys, 'frozen', False):
        base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
        return os.path.join(base, 'YouGenerator')
    return os.path.dirname(get_base_dir())

def load_config():
    base_dir = get_base_dir()
    candidates = [
        os.path.join(base_dir, 'config', 'settings.yaml'),
        # Fallback if config is in root
        os.path.join(os.path.dirname(base_dir), 'config', 'settings.yaml'),
    ]
    if getattr(sys, 'frozen', False):
        # 번들: 사용자 데이터 디렉토리의 설정을 우선 사용
        candidates.insert(0, os.path.join(_writable_root(), 'config', 'settings.yaml'))
        try:
            import sys as _sys
            meipass = getattr(_sys, '_MEIPASS', None)
            if meipass:
                candidates.append(os.path.join(meipass, 'config', 'settings.yaml'))
        except Exception:
            pass

    for config_path in candidates:
        if config_path and os.path.exists(config_path):
            if yaml is None:
                return {}
            with open(config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f) or {}
    return {}

def get_asset_dir():
    # Move assets to data/assets
    root_dir = _writable_root()
    asset_dir = os.path.join(root_dir, 'data', 'assets')
    os.makedirs(asset_dir, exist_ok=True)
    return asset_dir

def get_export_dir():
    root_dir = _writable_root()
    export_dir = os.path.join(root_dir, 'data', 'exports')
    os.makedirs(export_dir, exist_ok=True)
    return export_dir
