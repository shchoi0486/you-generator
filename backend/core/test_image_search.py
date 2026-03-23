
import asyncio
import os
import sys
import re

# backend/core 폴더를 경로에 추가
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

# 부모 폴더(backend)도 추가 (필요한 경우)
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# 이제 절대 임포트로 시도
try:
    import assets_downloader
    import visual_engine
except ImportError:
    # 만약 위가 실패하면 현재 디렉토리 기준 임포트
    sys.path.insert(0, current_dir)
    import assets_downloader
    import visual_engine

async def test_keyword_extraction():
    """장면 설명에서 핵심 키워드 추출 로직 검증"""
    print("\n--- Testing Keyword Extraction ---")
    
    test_scenes = [
        {
            'keyword': 'Korean middle age roles',
            'description': 'Montage: Korean child studying at a table, elderly Korean parents walking in a park, a Korean adult looking at financial bills, representing multiple burdens, cinematic lighting, realistic, documentary photography, 4k, detailed environment, storytelling scene'
        },
        {
            'keyword': 'Office worker stress',
            'description': 'A Korean woman staring blankly at her office desk late at night, exhausted, cinematic lighting'
        },
        {
            'keyword': 'Subway commute',
            'description': 'Crowded Seoul subway at rush hour, Korean people tired, blurred motion'
        }
    ]
    
    for idx, scene in enumerate(test_scenes):
        print(f"\nScene {idx+1}:")
        print(f"Original Description: {scene['description'][:100]}...")
        
        # visual_engine.generate_scene_candidates 내부 로직을 모방하여 추출 결과 확인
        raw_keyword = scene.get('keyword', '')
        desc = scene.get('description', '')
        
        # [추가] Montage: 접두어 제거 및 문장 정리
        desc_clean = re.sub(r'^Montage:\s*', '', desc, flags=re.I)
        
        # 1. 인물(Who) 추출
        who_pattern = r'(Korean\s+(?:woman|man|lady|gentleman|office\s+worker|child|parent|elderly|adult|family)s?|한국\s+(?:여성|남성|직장인|사람|아이|부모|노인|성인|가족))'
        who_matches = re.findall(who_pattern, f"{raw_keyword} {desc_clean}", re.I)
        who_list = []
        for w in who_matches:
            if w.lower() not in [x.lower() for x in who_list]: who_list.append(w)
        who = " ".join(who_list[:2])
        
        # 2. 장소(Where) 추출
        where_pattern = r'(office|subway|street|home|desk|park|table|kitchen|사무실|지하철|거리|집|책상|공원|식탁|주방)s?'
        where_matches = re.findall(where_pattern, f"{raw_keyword} {desc_clean}", re.I)
        where_list = []
        for w in where_matches:
            if w.lower() not in [x.lower() for x in where_list]: where_list.append(w)
        where = " ".join(where_list[:2])
        
        # 3. 상황/감정(What/How) 추출
        how_pattern = r'(tired|exhausted|stressed|overwhelmed|night\s+work|disengaged|burden|studying|walking|looking|bill|지친|피곤한|힘든|야근|스트레스|부담|공부|산책|보는|고지서)s?'
        how_matches = re.findall(how_pattern, f"{raw_keyword} {desc_clean}", re.I)
        how_list = []
        for h in how_matches:
            if h.lower() not in [x.lower() for x in how_list]: how_list.append(h)
        how = " ".join(how_list[:3])
        
        combined_base = f"{who} {where} {how}".strip()
        
        # 번역 적용
        translation_map = {
            "한국 여성": "Korean woman", "한국 남성": "Korean man", "직장인": "office worker",
            "사무실": "office", "지하철": "subway", "야근": "night work", "지친": "tired", "피곤한": "exhausted",
            "아이": "child", "부모": "parents", "노인": "elderly", "성인": "adult", "가족": "family",
            "공원": "park", "식탁": "table", "공부": "studying", "산책": "walking", "부담": "burden", "고지서": "bills"
        }
        for ko, en in translation_map.items():
            combined_base = combined_base.replace(ko, en)
            
        search_base = combined_base
        
        # 중복 제거
        search_base_words = []
        for w in search_base.split():
            if w.lower() not in [x.lower() for x in search_base_words]:
                search_base_words.append(w)
        search_base = " ".join(search_base_words)

        print(f"Extracted Base Query: {search_base}")

async def test_searches():
    """실제 검색 엔진 동작 확인"""
    print("\n--- Testing Search Engines ---")
    
    # 1. Complex Case
    complex_kw = "Korean child parents table park studying walking burden -자막 -워터마크"
    print(f"\nTesting complex keyword: {complex_kw}")
    
    # Bing (fallback to DDG)
    print("Testing visual_engine.search_web_images_list (Bing Primary)...")
    results = await visual_engine.search_web_images_list(complex_kw, count=3, engine="bing")
    print(f"Results Found: {len(results)}")
    for i, url in enumerate(results):
        print(f"  {i+1}: {url[:80]}...")

    # Test visual_engine.generate_scene_candidates
    print("\nTesting visual_engine.generate_scene_candidates...")
    scene = {
        'keyword': 'Korean child parents table park',
        'description': 'Montage: Korean child studying at a table, elderly Korean parents walking in a park'
    }
    candidates = await visual_engine.generate_scene_candidates(scene, index=7, search_count=3)
    print(f"Candidates Found: {len(candidates.get('search', []))} Search candidates")
    for i, path in enumerate(candidates.get('search', [])):
        print(f"  {i+1}: {path}")

    # Bing Only
    print("\nTesting assets_downloader.get_bing_images_list...")
    bing_results = await assets_downloader.get_bing_images_list(complex_kw, count=3)
    print(f"Bing Results: {len(bing_results)}")
    for i, url in enumerate(bing_results):
        print(f"  {i+1}: {url[:80]}...")

if __name__ == "__main__":
    asyncio.run(test_keyword_extraction())
    asyncio.run(test_searches())
