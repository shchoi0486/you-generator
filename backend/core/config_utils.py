import os
import yaml

def get_base_dir():
    # C:\youtube\AutoVideoSystem\backend\core\config_utils.py -> C:\youtube\AutoVideoSystem\backend
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_config():
    base_dir = get_base_dir()
    config_path = os.path.join(base_dir, 'config', 'settings.yaml')
    if not os.path.exists(config_path):
        # Fallback if config is in root
        config_path = os.path.join(os.path.dirname(base_dir), 'config', 'settings.yaml')
    
    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f) or {}

def get_asset_dir():
    # Move assets to data/assets
    root_dir = os.path.dirname(get_base_dir())
    asset_dir = os.path.join(root_dir, 'data', 'assets')
    os.makedirs(asset_dir, exist_ok=True)
    return asset_dir

def get_export_dir():
    root_dir = os.path.dirname(get_base_dir())
    export_dir = os.path.join(root_dir, 'data', 'exports')
    os.makedirs(export_dir, exist_ok=True)
    return export_dir
