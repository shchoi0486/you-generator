
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from visual_engine import generate_scene_candidates, IMAGE_STYLES

# Mock scene
scene = {
    'type': 'ai_image',
    'keyword': 'Seoul Night',
    'description': 'A beautiful night view of Seoul city with N Tower',
    'data': {'2023': 10, '2024': 20}
}

print("Testing generate_scene_candidates...")
style_prompt = IMAGE_STYLES["Cinematic (영화 같은)"]
print(f"Style: {style_prompt}")

# Generate candidates
candidates = generate_scene_candidates(
    scene, 
    index=999, 
    ai_count=3, 
    search_count=3, 
    width=1280, 
    height=720, 
    style=style_prompt, 
    ai_model="pollinations", 
    search_engine="naver" # Naver search might fail if no browser, but we focus on AI
)

print("\nCandidates generated:")
print(f"AI: {len(candidates['ai'])}")
print(f"Search: {len(candidates['search'])}")
print(f"Graph: {len(candidates['graph'])}")

for i, path in enumerate(candidates['ai']):
    print(f"AI {i}: {path} (Exists: {os.path.exists(path)})")

if len(candidates['ai']) == 3:
    print("SUCCESS: Generated 3 AI images.")
else:
    print(f"FAILURE: Expected 3 AI images, got {len(candidates['ai'])}")
