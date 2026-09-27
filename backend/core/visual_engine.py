import requests
import os
import random
import hashlib
import json
import base64
import time
import asyncio
import re
import uuid

from . import key_store
try:
    from . import assets_downloader
    from .assets_downloader import clean_keyword
except (ImportError, ValueError):
    import assets_downloader
    from assets_downloader import clean_keyword

try:
    from . import media_cache
except (ImportError, ValueError):
    import media_cache

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None
    print("Warning: 'duckduckgo-search' module not found. Web search will be disabled.")

try:
    import pollinations
except ImportError:
    pollinations = None
    # HTTP 폴백(generate_image_pollinations)이 있으므로 기능 제한 없음

try:
    import fal_client  # noqa: F401 (향후 fal.ai 영상 연동용으로 유지)
except ImportError:
    fal_client = None

import yaml
import matplotlib.pyplot as plt
import matplotlib
import io
import numpy as np

# Constants
ASPECT_RATIOS = {
    "16:9 (Youtube)": (1280, 720),
    "9:16 (Shorts)": (720, 1280),
    "1:1 (Square)": (1024, 1024),
    "3:4 (Portrait)": (768, 1024),
    "4:3 (Classic)": (1024, 768),
    "21:9 (Ultrawide)": (1536, 640)
}

AI_MODELS = {
    "Pollinations (Free, Fast)": "pollinations",
    "Z-Image-Turbo (Local, Free)": "zimage",
    "Cloudflare (Flux, Paid)": "cloudflare",
    "Stable Diffusion (Local)": "local_sd",
    "AI Horde (Free, Slow)": "horde"
}

SEARCH_ENGINES = {
    "Bing (Global)": "bing",
    "DuckDuckGo (Privacy)": "ddg"
}

IMAGE_STYLES = {
    "None (기본)": "",
    "Cinematic (영화 같은)": "cinematic lighting, dramatic atmosphere, movie scene, 4k, 8k, highly detailed, film grain, bokeh, professional cinematography",
    "Anime (애니메이션)": "anime style, cel shaded, vibrant colors, studio ghibli style, makoto shinkai style, 2d animation, flat color",
    "Digital Art (디지털 아트)": "digital art, concept art, trending on artstation, sharp focus, octane render, detailed illustration",
    "Photographic (실사)": "photorealistic, hyperrealistic, raw photo, dslr, 85mm lens, f1.8, soft lighting, sharp focus, 8k, highly detailed texture, professional photography",
    "Neon Punk (네온 펑크)": "cyberpunk, neon lights, futuristic, synthwave, retrofuturism, glowing lights, night city",
    "Oil Painting (유화)": "oil painting, thick brushstrokes, canvas texture, classic art style, impressionism, fine art",
    "Comic Book (만화책)": "comic book style, bold lines, halftone patterns, vibrant colors, graphic novel style, ink outlines",
    "3D Model (3D 렌더링)": "3d render, unreal engine 5, ray tracing, octane render, physically based rendering, 3d modeling, high poly"
}

# Matplotlib 설정 (한글 폰트 등)
# 윈도우의 경우 'Malgun Gothic', 리눅스/맥은 다른 폰트 필요할 수 있음
# 여기서는 윈도우 환경(Malgun Gothic)을 가정
matplotlib.rcParams['font.family'] = 'Malgun Gothic'
matplotlib.rcParams['axes.unicode_minus'] = False

try:
    from .config_utils import load_config, get_asset_dir
except (ImportError, ValueError):
    from config_utils import load_config, get_asset_dir

def create_graph_image(data, title, output_path, theme='light'):
    """
    딕셔너리 데이터를 받아 깔끔한 막대 그래프 이미지를 생성합니다.
    data: {'2023': 10, '2024': 20} (JSON/Dict)
    theme: 'light' or 'dark'
    """
    try:
        if not isinstance(data, dict):
            return None

        # 스타일: 깔끔한 화이트/그레이 톤 (뉴스/리포트 스타일)
        plt.style.use('default')
        fig, ax = plt.subplots(figsize=(12, 7))

        if theme == 'dark':
            bg_color = '#2c3e50'
            face_color = '#34495e'
            text_color = '#ecf0f1'
            grid_color = '#7f8c8d'
            bar_colors = ['#3498db', '#2980b9', '#1abc9c', '#16a085', '#bdc3c7']
        else:
            bg_color = '#f8f9fa'
            face_color = '#ffffff'
            text_color = '#2c3e50'
            grid_color = '#bdc3c7'
            bar_colors = ['#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7']

        # 배경색 설정
        fig.patch.set_facecolor(bg_color)
        ax.set_facecolor(face_color)

        labels = list(data.keys())
        values = list(data.values())

        # 색상 설정
        colors = bar_colors
        if len(values) > 5:
            if theme == 'dark':
                colors = plt.cm.GnBu(np.linspace(0.5, 1, len(values)))
            else:
                colors = plt.cm.Blues(np.linspace(0.5, 1, len(values)))

        bars = ax.bar(labels, values, color=colors[:len(labels)], edgecolor='none', width=0.6)

        # 타이틀 및 라벨 설정
        ax.set_title(title, fontsize=24, pad=25, fontweight='bold', color=text_color, fontfamily='Malgun Gothic')
        # x축 라벨 제거 (깔끔하게) 또는 조정
        ax.tick_params(axis='x', labelsize=14, labelcolor=text_color, rotation=0)
        ax.tick_params(axis='y', labelsize=12, labelcolor=grid_color)

        # 상단/우측 테두리 제거
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(grid_color)
        ax.spines['bottom'].set_color(grid_color)

        # 그리드 설정 (가로선만, 아주 연하게)
        ax.grid(axis='y', linestyle='-', alpha=0.2, color=grid_color)

        # 값 표시 (바 위에 텍스트)
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2.0, height + (max(values)*0.01), 
                    f'{height:,}', ha='center', va='bottom', fontsize=14, fontweight='bold', color=text_color)

        plt.tight_layout()
        plt.savefig(output_path, dpi=300, facecolor=bg_color, bbox_inches='tight')
        plt.close()
        return output_path
    except Exception as e:
        print(f"Graph generation error: {e}")
        return None

try:
    from . import assets_downloader
except (ImportError, ValueError):
    import assets_downloader

def search_web_image(keyword, cancel_check=None):
    """
    Playwright를 사용하여 빙/덕덕고 이미지 검색 (Single Result)
    """
    if cancel_check and cancel_check():
        raise InterruptedError("User requested cancellation")
    print(f"Searching web image for: {keyword}")

    # 1. Bing Image Search
    bing_image = assets_downloader.search_image_bing(keyword, cancel_check=cancel_check)
    if bing_image:
        print(f"Found Bing image: {bing_image}")
        return bing_image

    return None


async def search_web_images_list(keyword, count=5, engine="bing", cancel_check=None, use_cache=True, refresh=False):
    """
    빙과 덕덕고 엔진을 사용하여 최소 count개의 이미지 URL을 수집합니다.
    이미 정제된 키워드가 들어올 경우(부정어 포함) 그대로 사용합니다.
    캐시: (엔진, 검색어, 개수) 키로 URL 목록 재사용. refresh=True면 새로 검색.
    """
    if cancel_check and cancel_check():
        raise InterruptedError("User requested cancellation")

    print(f"Searching web images list for: {keyword} using {engine}")
    results = []

    # 캐시 조회 (URL 목록 재사용 — 다운로드/검색 비용 절감)
    cache_key = ""
    if use_cache and not refresh:
        cache_key = media_cache.make_key(engine, keyword, count)
        cached = media_cache.get("search", cache_key)
        if isinstance(cached, list) and len(cached) >= count:
            print(f"[Search] cache hit ({len(cached)} urls)")
            return cached[:count]

    # [수정] 이미 정제된 키워드(부정어 '-' 포함)가 들어오는 경우, 추가 정제 없이 그대로 사용
    if " -" in keyword:
        search_keyword = keyword
        fallback_base = keyword.split(" -")[0]
        print(f"[Search] Using pre-refined keyword: {search_keyword}")
    else:
        # 기존의 복잡한 정제 로직 (정제되지 않은 키워드가 들어올 경우를 대비한 하위 호환성)
        base_keyword = keyword
        is_korean = bool(re.search(r'[ㄱ-ㅎㅏ-ㅣ가-힣]', base_keyword))
        
        other_countries = [
            "미국", "USA", "America", "일본", "Japan", "중국", "China", "영국", "UK", "Britain",
            "프랑스", "France", "독일", "Germany", "러시아", "Russia", "베트남", "Vietnam", "태국", "Thailand",
            "유럽", "Europe", "아시아", "Asia", "북한", "North Korea", "대만", "Taiwan", "인도", "India",
            "캐나다", "Canada", "호주", "Australia", "브라질", "Brazil", "멕시코", "Mexico", "이탈리아", "Italy",
            "스페인", "Spain", "우크라이나", "Ukraine", "이스라엘", "Israel"
        ]

        clean_base = base_keyword
        ai_technical_terms = [
            "realistic", "4k", "8k", "detailed", "photography", "cinematic", "storytelling", 
            "wide shot", "close up", "high resolution", "highly detailed", "masterpiece",
            "rendering", "unreal engine", "octane render", "environment", "scene", "storytelling scene"
        ]
        
        words = clean_base.split()
        new_words = []
        for word in words:
            low_word = word.lower().strip(",.")
            if low_word in ["news", "newsing"]: continue
            if low_word in ["infographic", "chart", "graph", "graphic"]:
                new_words.append("visual")
                continue
            if low_word in ai_technical_terms: continue
            new_words.append(word)
        
        # [수정] 검색어가 너무 짧아지는 것을 방지 (최소 3단어 유지 시도)
        if len(new_words) < 3 and len(words) > len(new_words):
             # 기술적 용어 중에서도 의미가 있는 단어는 다시 추가
             for word in words:
                 if word.lower() in ["modern", "vessel", "ship", "building", "exterior", "interior"]:
                     if word not in new_words: new_words.append(word)
        
        if len(new_words) > 12: new_words = new_words[:12]
        clean_base = " ".join(new_words).strip()
        
        if not clean_base or clean_base.lower() == "news":
            clean_base = "business" if not is_korean else "직장인"

        has_other_country = any(country.lower() in clean_base.lower() for country in other_countries)
        korea_already_present = any(k in clean_base.lower() for k in ["한국", "korea", "south korea"])
        
        final_base = clean_base
        if not has_other_country and not korea_already_present and clean_base:
            if is_korean: final_base = f"한국 {clean_base}"
            else: final_base = f"Korea {clean_base}"
        
        if not final_base: final_base = "Korea" if not is_korean else "한국"
                
        if is_korean:
            exclude_beauty = ""
            if any(word in final_base for word in ["지친", "피곤", "야근", "힘든", "스트레스"]):
                exclude_beauty = " -화장 -모델 -beauty -makeup -cosmetic"
            search_keyword = f"{final_base}{exclude_beauty} -자막 -워터마크 -출처"
        else:
            exclude_beauty = ""
            if any(word in final_base.lower() for word in ["tired", "exhausted", "stressed", "overwhelmed", "late night"]):
                exclude_beauty = " -beauty -makeup -cosmetic -model"
            search_keyword = f"{final_base}{exclude_beauty} -watermark -logo -caption -자막 -워터마크"
        
        fallback_base = final_base
        print(f"[Search] Using refined keyword: {search_keyword}")

    async def try_engine(eng, current_count, current_keyword):
        if cancel_check and cancel_check():
            raise InterruptedError("User requested cancellation")
        eng_results = []
        # [추가] 검색어가 너무 길거나 복잡하면 결과가 안 나올 수 있으므로, 
        # 엔진별 특성에 맞춰 키워드 최적화
        target_keyword = current_keyword
        if eng in ["bing", "ddg"]:
            # 빙과 DDG는 부정 검색어(-)가 너무 많으면 결과가 잘 안 나옴 -> 최대 2개로 제한
            parts = current_keyword.split(" -")
            if len(parts) > 3:
                target_keyword = parts[0] + " -" + " -".join(parts[1:3])
            
            # [추가] 영문 검색어 우선 (해외 엔진은 영문 검색 결과가 훨씬 풍부함)
            # 이미 정제된 키워드는 영문일 가능성이 높지만, 한글이 섞여있다면 
            # 검색 품질 향상을 위해 정리 시도
        
        if eng == "bing":
            eng_results = await assets_downloader.get_bing_images_list(target_keyword, current_count, cancel_check=cancel_check)
        elif eng == "ddg":
            try:
                # [수정] DuckDuckGo도 Playwright 기반으로 전환하여 더 안정적으로 수집
                eng_results = await assets_downloader.get_duckduckgo_images_list(target_keyword, current_count, cancel_check=cancel_check)
            except Exception as e:
                print(f"DDG Search Error: {e}")
        # [수정] 구글 검색 비활성화 (사용자 요청)
        # elif eng == "google":
        #     eng_results = await assets_downloader.get_google_images_list(target_keyword, current_count, cancel_check=cancel_check)
        return eng_results

    # 1. Primary Engine with Refined Keyword
    results.extend(await try_engine(engine, count, search_keyword))
    
    # 2. Fallbacks if needed
    # [수정] 구글 제거 (빙/덕덕고만 사용)
    engines_to_try = ["bing", "ddg"]
    if engine in engines_to_try:
        engines_to_try.remove(engine)
    
    for fallback_eng in engines_to_try:
        if len(results) >= count:
            break
        needed = count - len(results)
        print(f"Need {needed} more results. Trying {fallback_eng}...")
        fallback_results = await try_engine(fallback_eng, needed, search_keyword)
        if not fallback_results and fallback_base != search_keyword:
             print(f"Fallback {fallback_eng} failed. Trying fallback base query: {fallback_base}")
             fallback_results = await try_engine(fallback_eng, needed, fallback_base)
        results.extend(fallback_results)
        
    # 중복 제거 (순서 유지)
    seen = set()
    unique_results = []
    for url in results:
        if url not in seen:
            unique_results.append(url)
            seen.add(url)

    out = unique_results[:count]
    if use_cache and cache_key and len(out) >= count:
        media_cache.put("search", cache_key, out)
    return out

def _clean_prompt_text(text):
    if not text:
        return ""
    return " ".join(str(text).replace("\n", " ").split()).strip()


def _is_action_driven_scene(text):
    if not text:
        return False
    lower_text = text.lower()
    english_tokens = [
        "walking", "checking", "buying", "selling", "moving", "entering", "leaving",
        "working", "commuters", "workers", "shoppers", "crowd", "queue", "traffic",
        "loading", "unloading", "operating", "inspecting", "discussing",
        "inside", "through", "during", "at"
    ]
    korean_tokens = [
        "출근", "퇴근", "이동", "점검", "확인", "검사", "구매", "쇼핑", "운영",
        "작업", "장면", "모습", "중", "하는", "대기", "통행", "탑승", "하차"
    ]
    return any(token in lower_text for token in english_tokens) or any(token in text for token in korean_tokens)


def _build_news_broll_scene(description, keyword):
    normalized_description = _clean_prompt_text(description)
    normalized_keyword = _clean_prompt_text(keyword)
    if not normalized_description:
        normalized_description = normalized_keyword
    if not normalized_keyword:
        normalized_keyword = "Seoul, South Korea"

    scene_action = normalized_description
    
    # 수정: 무조건 사람을 넣지 않음. 묘사에 사람이 들어갈 때만 행동을 추가. 
    person_keywords = ["person", "man", "woman", "people", "adult", "worker", "사람", "남성", "여성", "직장인", "군인", "시민"]
    needs_people = any(pk in scene_action.lower() for pk in person_keywords)
    
    if needs_people and not _is_action_driven_scene(scene_action):
        scene_action = f"People engaging in {normalized_keyword} with natural movement"

    # 수정: 무조건 뉴스룸이나 한국 성인을 강제하지 않고 범용적인 고품질 B-roll 스타일로 변경 
    base_prompt = (
        "high quality b-roll footage, cinematic composition, realistic environment, 4k, 8k, "
        f"subject or location: {normalized_keyword}, "
        f"scene description: {scene_action}"
    )
    
    return base_prompt


# --- FLUX / SDXL-Turbo prose 프롬프트 빌더 ---
# 근거: BFL 공식 프롬프팅 가이드 + SDXL-Turbo 특성
#  - 자연어 산문, 주제 우선 배치 (앞 토큰 가중치가 높음)
#  - 30~80단어, 60단어 이하 권장 (SDXL-Turbo CLIP 77토큰 컷 대응)
#  - 네거티브 프롬프트 미지원 → 긍정 서술로만 구성
#  - 품질 수식어 1~2개로 제한 (filler는 오히려 독)
_FLUX_FILLER_PATTERNS = [
    r'cinematic lighting', r'dramatic lighting', r'soft lighting',
    r'ultra\s*realistic', r'hyper\s*realistic', r'photo\s*realistic', r'realistic',
    r'documentary photography', r'professional photography', r'professional cinematography',
    r'editorial quality', r'highly detailed texture', r'highly detailed', r'sharp texture detail',
    r'sharp focus', r'\b4k\b', r'\b8k\b', r'detailed environment', r'storytelling scene',
    r'highly aesthetic[^,]*', r'purely visual[^,]*', r'purely scenic[^,]*', r'pure landscape[^,]*',
    r'vast environment[^,]*', r'full scene view', r'full screen[^,]*', r'full frame[^,]*',
    r'wide establishing shot', r'extreme long shot', r'distant third-person camera',
    r'pure documentary scene', r'natural daily life', r'real world location',
    r'cinematic composition', r'realistic environment', r'cinematic detail',
    r'textless', r'wordless', r'blank surfaces', r'clean background', r'clean composition',
    r'unobstructed foreground', r'eye-level perspective',
]

_FLUX_SHOT_HEAD_PATTERN = r'^\s*(wide shot|medium shot|establishing shot|aerial view|aerial shot|bird[\s-]?eye view|close-up|close up|over-the-shoulder shot|low-angle shot|high-angle shot|dutch angle|point-of-view shot|wide[\s-]angle shot|full body shot)\s+of\s+([^,]+),?\s*'

_KO_TO_EN_LOCATION = {
    "서울": "Seoul", "한국": "South Korea", "대한민국": "South Korea",
    "아파트": "apartment complex", "시장": "traditional market", "마트": "grocery store",
    "사무실": "office", "지하철": "subway station", "거리": "street", "정부": "government",
    "청사": "government building", "시민": "citizens", "쇼핑객": "shoppers", "상인": "merchants",
    "물가": "rising prices", "가격": "prices", "야경": "at night", "도시": "city",
    "공장": "factory", "식료품": "groceries", "채소": "vegetables", "주택": "residential houses",
    "도심": "downtown", "광장": "public plaza", "지도": "map", "가정": "family home",
    "출근": "morning commute", "퇴근": "evening commute", "국회": "National Assembly",
    "은행": "bank", "상점": "shops", "식당": "restaurant", "학교": "school",
    "병원": "hospital", "공원": "park", "다리": "bridge", "강": "river", "산": "mountain",
}


# 모델별 프롬프트 프리셋 라우팅
#  flux   : FLUX.1-schnell 계열 (pollinations-flux/deepinfra/cloudflare) - 산문 60단어, 네거티브 없음
#  turbo  : SDXL-Turbo (pollinations-turbo) - 더 짧고 단순하게 40단어, 네거티브 없음
#  gemini : Nano Banana - 90단어, 짧은 인용문구 허용, 네거티브 없음
#  sd     : SD 계열 (local/horde/zimage) - 태그형 + 네거티브 프롬프트 유효
MODEL_FAMILY_MAP = {
    "pollinations": "turbo",  # 기본 순서 turbo 우선 (설정에서 변경 가능)
    "turbo": "turbo",
    "flux": "flux",
    "cloudflare": "flux",
    "deepinfra": "flux",
    "gemini": "gemini",
}

# 간판/자막 등 문자 렌더링 위험 요소 (약한 모델은 blank로 회피)
TEXT_RISK_PATTERN = r'signage|billboards?|scoreboards?|\blabels?|banner|poster|marquee|간판|전광판|표지판|현수막|플래카드'


# 카테고리별 비주얼 프리셋 (대본 카테고리 ID와 공유: templates.py)
# - style_booster: AI 생성 프롬프트에 주제 바로 뒤에 붙는 긍정 서술
# - search_neg_ko/en: 웹 이미지 검색 부정어 (Bing -연산자)
# - junk_words: 검색어에서 제거하는 마케팅 수식어 (정확 토큰 매치)
# - sd_negative_add: SD 계열 네거티브 프롬프트 추가분
CATEGORY_VISUAL = {
    "recipe": {
        "style_booster": "mouth-watering 8k food photography, steam rising, vibrant colors",
        "search_neg_ko": "-자막 -워터마크 -로고 -글자",
        "search_neg_en": "-watermark -logo -caption -text",
        "junk_words": ["배달비", "아끼는", "초간단", "충격적인", "극강의", "미친", "대박", "초스피드", "핵꿀팁", "간단", "쉬운", "맛있는", "맛집", "꿀맛", "존맛"],
        "sd_negative_add": "text, watermark, logo, human face, blurry",
    },
    "review": {
        "style_booster": "commercial product photography, clean studio lighting, sharp focus",
        "search_neg_ko": "-자막 -워터마크 -로고 -합성",
        "search_neg_en": "-watermark -logo -caption -text",
        "junk_words": ["솔직", "리얼", "찐", "후기", "추천", "대박", "가성비", "꿀템", "내돈내산"],
        "sd_negative_add": "text, watermark, logo, messy background, blurry",
    },
    "knowledge": {
        "style_booster": "clean 3D isometric illustration, infographic style, minimal background",
        "search_neg_ko": "-자막 -워터마크 -로고",
        "search_neg_en": "-watermark -logo -caption",
        "junk_words": [],
        "sd_negative_add": "text, watermark, photorealistic human, blurry",
    },
    "news": {
        "style_booster": "",
        "search_neg_ko": "-자막 -워터마크 -손 -손가락 -팔 -사람 -인물 -기자 -뉴스룸 -스튜디오",
        "search_neg_en": "-hands -fingers -arms -human -person -reporter -newsroom -studio -자막 -워터마크",
        "junk_words": [],
        "sd_negative_add": "",
    },
    "travel": {
        "style_booster": "breathtaking travel photography, golden hour glow, vivid natural colors",
        "search_neg_ko": "-자막 -워터마크 -로고 -글자",
        "search_neg_en": "-watermark -logo -caption -text",
        "junk_words": ["초대박", "극강", "미친", "대박", "핵꿀팁", "인생샷", "여기안가면후회"],
        "sd_negative_add": "text, watermark, logo, blurry",
    },
}


# 장면 무드 → 조명/팔레트 부스터. LLM이 visual.mood에 적는 영문 태그와 매칭.
# (대사 감정과 장면 내용에 맞는 분위기를 이미지 프롬프트에 주입)
MOOD_LIGHTING = [
    (("warm", "cozy", "happy", "joy", "comfort", "homely", "따뜻", "기쁨", "행복", "포근"),
     "warm golden lighting, cozy atmosphere"),
    (("tense", "urgent", "dramatic", "intense", "suspense", "긴장", "긴급", "극적"),
     "dramatic high-contrast lighting, tense atmosphere"),
    (("sad", "melancholy", "gloomy", "lonely", "슬픔", "우울", "쓸쓸"),
     "soft overcast lighting, melancholic blue-gray tones"),
    (("mysterious", "dark", "eerie", "noir", "신비", "미스터리", "어두운"),
     "moody low-key lighting, mysterious shadows"),
    (("fresh", "bright", "energetic", "lively", "활기", "상쾌", "밝은", "생기"),
     "bright airy daylight, vibrant energetic mood"),
    (("calm", "peaceful", "serene", "quiet", "평온", "고요", "평화"),
     "soft diffused lighting, calm serene mood"),
    (("romantic", "로맨틱", "설렘"),
     "soft romantic lighting, warm pink tones"),
    (("scary", "horror", "fear", "공포", "무서운"),
     "dark horror lighting, deep shadows"),
    (("funny", "comic", "playful", "유머", "재미", "익살"),
     "bright playful lighting, cheerful vivid colors"),
    (("luxury", "premium", "elegant", "고급", "럭셔리"),
     "luxurious soft spotlight, elegant premium mood"),
]


def mood_booster(mood):
    """무드 태그에서 조명/팔레트 부스터 문자열 반환. 매칭 없으면 빈 문자열."""
    m = (mood or "").lower()
    if not m.strip():
        return ""
    for keywords, booster in MOOD_LIGHTING:
        if any(k in m for k in keywords):
            return booster
    return ""


def normalize_visual_category(cat):
    """대본 템플릿 ID/한글명 → visual 카테고리 키. 모르면 news(기존 동작)."""
    c = (cat or "").strip().lower()
    if c in ("recipe", "recipe_short", "요리", "레시피"):
        return "recipe"
    if c in ("review", "review_short", "리뷰", "제품"):
        return "review"
    if c in ("knowledge", "knowledge_short", "지식", "정보"):
        return "knowledge"
    if c in ("travel", "travel_short", "여행", "브이로그", "vlog"):
        return "travel"
    return "news"


def _build_flux_prose_prompt(description, keyword="", style="", family="flux", category="news", mood=""):
    """FLUX / SDXL-Turbo용 짧은 산문 프롬프트 (주제 우선, 60단어 이하)."""
    text = " ".join(str(description or "").replace("\n", " ").split())

    # 1. 샷 헤드 1개만 보존 (다양성은 Gemini가 담당, 여기선 중복만 제거)
    shot_head = ""
    m = re.match(_FLUX_SHOT_HEAD_PATTERN, text, flags=re.IGNORECASE)
    if m:
        shot_head = m.group(1).strip().lower()
        subject_lead = m.group(2).strip()
        text = (subject_lead + ", " + text[m.end():].strip()).strip(" ,")

    # 2. POV/손 관련 단어 삭제 (네거티브 대신 그냥 뺌)
    pov_terms = [
        r'\bPOV\b', r'\bfirst person\b', r'\b1st person\b', r'\bpoint of view\b',
        r'\bholding\b', r'\btouching\b', r'\bpointing\b', r'\bhands\b', r'\bfingers\b',
        r'\barms\b', r'\bhand\b', r'\bfinger\b', r'\barm\b',
    ]
    for term in pov_terms:
        text = re.sub(term, '', text, flags=re.IGNORECASE)

    # 2b. 읽을 수 있는 문자 묘사는 blank 라벨로 치환 (약한 모델의 가짜 글리프 방지)
    text = re.sub(
        r'[A-Za-z ]*language text on [^,]+', 'blank labels with no readable text',
        text, flags=re.IGNORECASE,
    )

    # 3. filler 품질 수식어 삭제
    for pat in _FLUX_FILLER_PATTERNS:
        text = re.sub(pat, '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+', ' ', text).replace(' ,', ',').strip(' ,.')

    # 문장 조각들을 쉼표 기준으로 정리 (빈 조각 제거)
    parts = [p.strip(' .') for p in text.split(',')]
    parts = [p for p in parts if len(p.split()) >= 2]
    text = ", ".join(parts)

    # 4. 한글 키워드 → 영문 로케이션 큐 (description에 없는 것만)
    lowered = text.lower()
    loc_terms = []
    for ko, en in _KO_TO_EN_LOCATION.items():
        if len(ko) == 1:
            ko_hit = re.search(r'(?<![가-힣])' + ko + r'(?![가-힣])', keyword or '')
        else:
            ko_hit = ko in (keyword or '')
        if ko_hit and en.lower() not in lowered:
            loc_terms.append(en)
            lowered += " " + en.lower()
    # 그래프/데이터 장면은 추상 시각화로 명시 (한글 잔재 제거)
    if re.search(r'그래프|차트|통계|\bgraph\b|\bchart\b|\bstatistics\b', (keyword or "") + " " + str(description or ""), flags=re.IGNORECASE):
        if "data visualization" not in lowered:
            loc_terms.append("abstract 3D data visualization with glowing lines on dark background")

    if loc_terms:
        text = f"{text}, {', '.join(loc_terms)}" if text else ", ".join(loc_terms)

    # 4c. 카테고리 스타일 부스터 (주제 바로 뒤, 앞 토큰 가중치 활용)
    booster = CATEGORY_VISUAL.get(category, CATEGORY_VISUAL["news"])["style_booster"]
    if booster and booster.lower() not in text.lower():
        text = f"{text}, {booster}" if text else booster

    # 4d. 무드 부스터 (대사 감정·장면 분위기에 맞는 조명/팔레트)
    mb = mood_booster(mood)
    if mb and mb.lower() not in text.lower():
        text = f"{text}, {mb}" if text else mb

    # 4b. 간판/전광판 등 문자 위험 요소가 있으면 blank 명시 (긍정 서술)
    #     Nano Banana는 인용된 짧은 문구까지만 허용, 그 외는 전부 blank
    text_has_risk = re.search(TEXT_RISK_PATTERN, text, flags=re.IGNORECASE) is not None
    if text_has_risk and "blank" not in text.lower():
        text = f"{text}, blank signs and billboards with no readable text" if text else "blank signs with no readable text"

    # 5. 조립: [샷 헤드] + 주제 산문 + [스타일] + 짧은 품질 꼬리 1개
    segments = []
    if shot_head:
        segments.append(shot_head + " of")
    if text:
        segments.append(text.rstrip('.'))
    if style:
        segments.append(f"{style} style")
    segments.append("documentary film still, natural light")
    prompt = ", ".join(s for s in segments if s)

    # 6. 단어 캡 (앞=주제 유지, turbo는 더 짧게)
    cap = 40 if family == "turbo" else 60
    words = prompt.split()
    if len(words) > cap:
        prompt = " ".join(words[:cap])
    return prompt.strip()


def _build_gemini_prompt(description, keyword="", style="", category="news", mood=""):
    """Nano Banana용 프롬프트 (공식 가이드: 산문 + 짧은 인용문구 + 폰트 지정, 90단어 이하).

    Nano Banana 2는 한글 포함 다국어 렌더링이 되므로, description에 이미
    따옴표로 묶인 짧은 문구가 있을 때만 살리고 나머지는 blank 처리한다.
    """
    text = " ".join(str(description or "").replace("\n", " ").split())

    # 따옴표 인용문구 추출 (25자 초과면 잘라서 blank扱い)
    quoted = re.findall(r'"([^"]{1,25})"', text)
    text = re.sub(r'"[^"]*"', '', text)

    # POV/손 단어 삭제
    for term in [r'\bPOV\b', r'\bfirst person\b', r'\bholding\b', r'\bhands\b', r'\bfingers\b', r'\barms\b']:
        text = re.sub(term, '', text, flags=re.IGNORECASE)
    # filler 정리 (Gemini는 이해력이 좋아 과도한 삭제 불필요, 품질구만 솎음)
    for pat in [r'\b4k\b', r'\b8k\b', r'storytelling scene', r'detailed environment']:
        text = re.sub(pat, '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+', ' ', text).replace(' ,', ',').strip(' ,.')
    parts = [p.strip(' .') for p in text.split(',')]
    parts = [p for p in parts if len(p.split()) >= 2]
    text = ", ".join(parts)

    segments = [text.rstrip('.')] if text else []
    # 카테고리 스타일 부스터 (주제 바로 뒤)
    booster = CATEGORY_VISUAL.get(category, CATEGORY_VISUAL["news"])["style_booster"]
    if booster and booster.lower() not in " ".join(segments).lower():
        segments.append(booster)
    # 무드 부스터 (대사 감정·장면 분위기에 맞는 조명/팔레트)
    mb = mood_booster(mood)
    if mb and mb.lower() not in " ".join(segments).lower():
        segments.append(mb)
    # 짧은 인용문구는 폰트 지정과 함께 유지 (25자 이하만)
    for q in quoted[:2]:
        segments.append(f'a sign reading "{q}" in bold sans-serif, high contrast')
    if re.search(TEXT_RISK_PATTERN, text, flags=re.IGNORECASE) and not quoted:
        segments.append("all other signs and billboards blank with no readable text")
    if style:
        segments.append(f"{style} style")
    segments.append("photorealistic, natural light")
    prompt = ", ".join(s for s in segments if s)

    words = prompt.split()
    if len(words) > 90:
        prompt = " ".join(words[:90])
    return prompt.strip()


def refine_ai_prompt(description, keyword="", style="", model="", category="news", mood=""):
    category = normalize_visual_category(category)
    style_prompt_prefix = f"({style}), " if style else ""
    mood_text = mood_booster(mood)
    
    # [유지] 뉴스룸, 기자 등 특정 키워드 강제 제거 (뉴스 카테고리만.
    # 요리/리뷰의 "studio lighting" 같은 정상 표현까지 지워버리는 것 방지)
    if category == "news":
        news_keywords = [ 
            "newsroom", "studio", "reporter", "journalist", "anchor", "announcer", 
            "news desk", "breaking news", "broadcast", "television station", "tv studio", 
            "news set", "anchor desk", "news ticker", "press conference", 
            "뉴스룸", "기자", "아나운서", "뉴스 데스크", "방송국", "스튜디오", "앵커", 
            "기자 회견", "속보", "뉴스 세트" 
        ] 
        
        for nk in news_keywords: 
            if re.search(r'[a-zA-Z]', nk): 
                pattern = rf'\b{nk}\b' 
            else: 
                pattern = rf'{nk}' 
            description = re.sub(pattern, '', description, flags=re.IGNORECASE).strip() 
            if keyword: 
                keyword = re.sub(pattern, '', keyword or "", flags=re.IGNORECASE).strip() 

    # --- 모델별 프리셋 라우팅 ---
    # 구형 태그 조립 경로(아래)는 local_sd/horde/zimage 전용으로 유지.
    family = MODEL_FAMILY_MAP.get(model, "sd")
    if family in ("flux", "turbo"):
        return _build_flux_prose_prompt(description, keyword, style, family=family, category=category, mood=mood)
    if family == "gemini":
        return _build_gemini_prompt(description, keyword, style, category=category, mood=mood)

    # [수정] 뉴스룸 억제 구문도 부정어 대신 긍정어(풍경/사물 집중)로 변경 
    if not any(word in description.lower() for word in ["nature", "landscape", "abstract"]): 
        description += ", pure documentary scene, natural daily life, real world location" 

    # 🌟 [핵심 수정] "No hands, No POV" 단어를 완전히 삭제하고 "멀리서 찍은 3인칭 샷"을 강제합니다. 
    if not any(word in description.lower() for word in ["person", "man", "woman", "people", "worker"]): 
        description += ", wide establishing shot, extreme long shot, distant third-person camera, purely scenic, pure landscape, vast environment, full scene view" 
    else: 
        description += ", full body shot, wide angle shot, distant third-person camera, people seen from a distance, natural environment" 

    # [유지] 1인칭 시점을 유발하는 '단어' 자체를 입력값에서 삭제 
    forbidden_pov_terms = [ 
        r'\bPOV\b', r'\bfirst person\b', r'\b1st person\b', r'\bpoint of view\b', 
        r'\bholding\b', r'\btouching\b', r'\bpointing\b', r'\bhands\b', r'\bfingers\b', 
        r'\barms\b', r'\bhand\b', r'\bfinger\b', r'\barm\b' 
    ] 
    for term in forbidden_pov_terms: 
        description = re.sub(term, '', description, flags=re.IGNORECASE).strip() 
        keyword = re.sub(term, '', keyword or "", flags=re.IGNORECASE).strip() 

    description = re.sub(r'\s+', ' ', description).replace(', ,', ',').strip() 

    # [수정] 그래프/차트 역시 손 단어를 빼고 '풀 스크린 뷰'를 강조 
    hard_to_draw_keywords = ["그래프", "차트", "통계", "수익률", "지수", "상승", "하락", "매출", "graph", "chart", "statistics", "revenue", "index", "growth", "data"] 
    is_hard_to_draw = any(hk in description.lower() for hk in hard_to_draw_keywords) or any(hk in (keyword or "").lower() for hk in hard_to_draw_keywords) 
    
    if is_hard_to_draw: 
        if any(k in description or k in (keyword or "") for k in ["그래프", "chart", "graph", "차트"]): 
            description = description.replace("그래프", "추상적인 3D 데이터 시각화").replace("graph", "abstract 3D data visualization").replace("chart", "abstract business trend visualization") 
            description += ", full frame abstract visualization, glowing lines, dark background, highly aesthetic, purely visual, wide establishing shot, full screen visualization ONLY" 
        
        if any(k in description or k in (keyword or "") for k in ["돈", "money", "포상금", "수익", "revenue"]): 
            description = description.replace("돈", "부와 성공을 상징하는 추상적 묘사").replace("money", "abstract representation of wealth").replace("포상금", "award and success") 
        
        description += ", highly aesthetic composition, purely visual, wordless, blank surfaces" 

    broll_scene_prompt = _build_news_broll_scene(description, keyword) 
    
    person_keywords = ["person", "man", "woman", "girl", "boy", "people", "adult", "politician", "face", "portrait"] 
    is_person_focused = any(pk in description.lower() for pk in person_keywords) or any(pk in (keyword or "").lower() for pk in person_keywords) 
    
    bokeh_effect = "slight depth of field for person emphasis, " if is_person_focused else "sharp focus on entire scene, pure landscape view, " 
    
    is_flux = model in ["cloudflare", "flux", "pollinations"] 
    flux_text_suppression = "" 
    if is_flux: 
        # 🌟 [핵심 수정] Flux 모델용 지시어에서도 Hand, POV 단어를 완전히 뺐습니다. 
        # 또한 텍스트, 간판, 국적 혼동 방지를 위해 한국 국기(Taegeukgi)와 건축양식을 명시합니다.
        # 한국 외교부 등 특정 건물의 경우, 그 명칭(South Korean Ministry of Foreign Affairs)을 직접 언급하되 텍스트는 빼도록 합니다.
        flux_text_suppression = ( 
            "Wide establishing shot, distant third-person camera. Purely visual imagery. " 
            "NO TEXT, NO LETTERS, NO SIGNAGE, NO WORDS on any surfaces. "
            "Blank building exterior without any symbols or names. "
            "South Korean flag (Taegeukgi) visible on a flagpole. "
            "Modern South Korean architecture, Seoul city background. "
            "Highly aesthetic scene, textless, purely visual. " 
        ) 

    # 🌟 [핵심 수정] 배경 설명에서도 부정어 삭제 및 긍정어(넓은 샷)로 대체 
    korean_identity_boost = ( 
        "Cinematic wide establishing shot, eye-level perspective, professional documentary photography. " 
        "Distant camera view, unobstructed foreground, clean composition. " 
        f"{bokeh_effect}High detail, cinematic lighting, 8k photo, sharp focus." 
    ) 
    
    quality_boost = "realistic skin and materials, natural perspective" 
    
    # [유지] 로컬 SD나 Horde 등 네거티브가 먹히는 구형 모델을 위해 네거티브 가중치(1.8) 강화 
    base_negative = ( 
        "(hands:1.8), (fingers:1.8), (arms:1.8), (human:1.3), (person:1.3), (interaction:1.5), " 
        "(POV:1.8), (first person perspective:1.8), (1st person:1.8), (holding:1.8), (point of view:1.8), " 
        "touching screen, pointing finger, pointing at camera, arms in foreground, hands in foreground, " 
        "text, words, letters, signage, banners, logos, watermark, labels, " 
        "Chinese characters, Japanese characters, Kanji, Hanzi, foreign text, " 
        "numbers, digits, data labels, axis labels, " 
        "monitor, screen, display, computer, laptop, " 
        "blurry, distorted, low quality, bad anatomy, " 
        "sign, placard, poster, protest sign, banner, billboard, flyer, " 
        "extra limbs, malformed hands, mutated fingers, fused fingers, " 
        "Chinese architecture, Japanese architecture, Pagoda, Torii gate, " 
        "Western people, Caucasian features, blonde hair, blue eyes, " 
        "extra hands, extra fingers, mutated hands, deformed hands, multiple arms, " 
        "extra limbs, malformed limbs, missing arms, missing legs, " 
        "fused fingers, too many fingers, long fingers, cloned fingers, " 
        "low quality, worst quality, blurry, distorted, deformed, bad anatomy" 
    ) 

    style_lower = style.lower() if style else "" 
    if "anime" in style_lower or "comic" in style_lower or "illustration" in style_lower: 
        negative_prompt = base_negative + ", photorealistic, realistic, photograph" 
    else: 
        negative_prompt = base_negative + ", cartoon, illustration, drawing, painting, anime, sketch"
    # 카테고리별 SD 네거티브 추가
    sd_add = CATEGORY_VISUAL.get(category, CATEGORY_VISUAL["news"])["sd_negative_add"]
    if sd_add:
        negative_prompt = negative_prompt + ", " + sd_add 

    mood_suffix = f", {mood_text}" if mood_text and mood_text.lower() not in broll_scene_prompt.lower() else ""
    if is_flux:
        refined = f"{flux_text_suppression}, {style_prompt_prefix}{broll_scene_prompt}, {korean_identity_boost}, {quality_boost}{mood_suffix}"
    else:
        refined = f"{style_prompt_prefix}{broll_scene_prompt}, {korean_identity_boost}, {quality_boost}{mood_suffix}"

    return f"{refined} --no {negative_prompt}"



def _split_positive_negative_prompt(prompt):
    positive = prompt
    negative = ""
    if " --no " in prompt:
        parts = prompt.split(" --no ", 1)
        positive = parts[0]
        negative = parts[1]
    return positive, negative


_ZIMAGE_PIPELINE = None
_ZIMAGE_MODEL_ID = None


def generate_image_zimage(prompt, output_path, model_id="Tongyi-MAI/Z-Image-Turbo", width=1280, height=720, seed=None, steps=9):
    try:
        import torch
        from diffusers import ZImagePipeline
    except Exception as e:
        print(f"Z-Image dependencies unavailable: {e}")
        return None

    if not torch.cuda.is_available():
        print("Z-Image requires CUDA GPU.")
        return None

    global _ZIMAGE_PIPELINE, _ZIMAGE_MODEL_ID
    try:
        if _ZIMAGE_PIPELINE is None or _ZIMAGE_MODEL_ID != model_id:
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

            # ModelScope를 통한 다운로드 시도 (HuggingFace 우회)
            try:
                from modelscope import snapshot_download
                print(f"Attempting to download {model_id} from ModelScope...")
                model_dir = snapshot_download(model_id)
                print(f"Model downloaded from ModelScope to: {model_dir}")
                load_path = model_dir
            except Exception as ms_e:
                print(f"ModelScope download failed or not installed: {ms_e}. Falling back to default loader.")
                load_path = model_id

            _ZIMAGE_PIPELINE = ZImagePipeline.from_pretrained(
                load_path,
                torch_dtype=dtype,
                low_cpu_mem_usage=False
            )
            _ZIMAGE_PIPELINE.to("cuda")
            _ZIMAGE_MODEL_ID = model_id

        positive, negative = _split_positive_negative_prompt(prompt)
        if seed is None:
            seed = random.randint(1, 1000000)
        generator = torch.Generator(device="cuda").manual_seed(seed)
        call_args = {
            "prompt": positive,
            "width": width,
            "height": height,
            "num_inference_steps": steps,
            "guidance_scale": 0.0,
            "generator": generator
        }
        if negative:
            call_args["negative_prompt"] = negative

        try:
            result = _ZIMAGE_PIPELINE(**call_args)
        except TypeError:
            call_args.pop("negative_prompt", None)
            result = _ZIMAGE_PIPELINE(**call_args)

        image = result.images[0]
        image.save(output_path)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            print(f"Generated with Z-Image - Saved to {output_path}")
            return output_path
        print("Z-Image output too small.")
    except Exception as e:
        print(f"Z-Image generation failed: {e}")
    return None

# --- Google Gemini 이미지 생성 (Nano Banana) ---
# 같은 Gemini API 키로 호출. 가성비: 2.5-flash-image 공식 $0.039/장,
# 3.1-flash-lite-image가 그보다 저렴·빠름 (정확한 과금은 AI Studio 청구서 확인).
# 모델 ID가 키/리전에서 막히면(404) 구 모델로 자동 폴백.
GEMINI_IMAGE_MODELS_FALLBACK = [
    "gemini-3.1-flash-lite-image",
    "gemini-3.1-flash-image",
]


def generate_image_gemini(prompt, output_path, api_key, model=None, width=1280, height=720):
    """
    Google Gemini API 네이티브 이미지 생성.
    REST generateContent → inlineData(base64) 디코딩 저장. 워터마크 없음(SynthID만 내장).
    """
    try:
        if not api_key:
            print("Gemini API key missing for image generation.")
            return None

        positive, _neg = _split_positive_negative_prompt(prompt)
        # 화면비 힌트는 프롬프트에 자연어로 (씬은 보통 16:9)
        if width >= height and "16:9" not in positive and "widescreen" not in positive.lower():
            positive = f"{positive}, 16:9 widescreen aspect ratio"

        candidates = []
        if model:
            candidates.append(model)
        for m in GEMINI_IMAGE_MODELS_FALLBACK:
            if m not in candidates:
                candidates.append(m)

        last_err = ""
        for m in candidates:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
                body = {
                    "contents": [{"parts": [{"text": positive}]}],
                    "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
                }
                resp = requests.post(
                    url,
                    headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                    json=body,
                    timeout=120,
                )
                if resp.status_code == 404:
                    last_err = f"{m}: not available (404), trying next"
                    print(f"Gemini image model {m} unavailable, fallback...")
                    continue
                if resp.status_code != 200:
                    last_err = f"{m}: HTTP {resp.status_code} - {resp.text[:200]}"
                    print(f"Gemini image failed: {last_err}")
                    break  # 키/과금 문제는 다른 모델로도 동일하므로 중단
                data = resp.json()
                for cand in data.get("candidates", []):
                    content = cand.get("content", {}) or {}
                    for part in content.get("parts", []):
                        inline = part.get("inlineData") or part.get("inline_data")
                        if inline and inline.get("data"):
                            with open(output_path, "wb") as f:
                                f.write(base64.b64decode(inline["data"]))
                            if os.path.getsize(output_path) > 1000:
                                print(f"Generated with Gemini ({m}) - Saved to {output_path}")
                                return output_path
                            print("Gemini output too small.")
                            return None
                last_err = f"{m}: no image in response"
                print(f"Gemini image ({m}): response had no image data.")
                return None
            except requests.exceptions.Timeout:
                last_err = f"{m}: timeout"
                print(f"Gemini image ({m}) timeout (120s).")
                return None
            except Exception as e:
                last_err = f"{m}: {e}"
                print(f"Gemini image ({m}) error: {e}")
                return None
        print(f"Gemini image generation failed: {last_err}")
    except Exception as e:
        print(f"Gemini image error: {e}")
    return None


def generate_image_deepinfra(prompt, output_path, api_key, model=None, width=1280, height=720):
    """
    DeepInfra OpenAI-호환 이미지 API (FLUX.1-schnell 기본).
    요금: schnell $0.0005 × (w/1024) × (h/1024) → 1280×720 ≈ $0.00044 (약 0.6원/장).
    """
    try:
        if not api_key:
            print("DeepInfra API key missing.")
            return None

        positive, _neg = _split_positive_negative_prompt(prompt)
        model_id = model or "black-forest-labs/FLUX-1-schnell"

        sizes_to_try = [f"{width}x{height}", "1024x1024"]
        last_err = ""
        for size in sizes_to_try:
            try:
                resp = requests.post(
                    "https://api.deepinfra.com/v1/openai/images/generations",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"prompt": positive, "model": model_id, "size": size, "n": 1},
                    timeout=120,
                )
                if resp.status_code == 401:
                    print("DeepInfra: invalid API key (401).")
                    return None
                if resp.status_code != 200:
                    last_err = f"HTTP {resp.status_code} - {resp.text[:200]}"
                    print(f"DeepInfra ({size}) failed: {last_err}")
                    continue
                data = resp.json()
                items = data.get("data", []) if isinstance(data, dict) else []
                if items and items[0].get("b64_json"):
                    with open(output_path, "wb") as f:
                        f.write(base64.b64decode(items[0]["b64_json"]))
                    if os.path.getsize(output_path) > 1000:
                        print(f"Generated with DeepInfra ({model_id}, {size}) - Saved to {output_path}")
                        return output_path
                    print("DeepInfra output too small.")
                    return None
                last_err = "no image in response"
                print("DeepInfra: response had no image data.")
                return None
            except requests.exceptions.Timeout:
                last_err = "timeout"
                print("DeepInfra timeout (120s).")
                return None
        print(f"DeepInfra generation failed: {last_err}")
    except Exception as e:
        print(f"DeepInfra error: {e}")
    return None


def generate_image_local_sd(prompt, output_path, sd_url="http://127.0.0.1:7860", width=1280, height=720):
    """
    Local Stable Diffusion (Automatic1111) API
    """
    try:
        # 프롬프트에서 --no 뒷부분 분리 (네거티브 프롬프트)
        positive, negative = _split_positive_negative_prompt(prompt)

        payload = {
            "prompt": positive,
            "negative_prompt": negative,
            "steps": 25, # 품질 위해 스텝 수 증가
            "width": width,
            "height": height,
            "sampler_name": "DPM++ 2M Karras", # 더 좋은 샘플러
            "cfg_scale": 7,
            "seed": -1 # Random seed
        }
        response = requests.post(f"{sd_url}/sdapi/v1/txt2img", json=payload, timeout=60)
        if response.status_code == 200:
            r = response.json()
            image_data = base64.b64decode(r['images'][0])
            with open(output_path, 'wb') as f:
                f.write(image_data)
            print("Generated with Local SD")
            return output_path
    except Exception as e:
        print(f"Local SD failed: {e}")
    return None

def generate_image_cloudflare(prompt, output_path, account_id, api_token, width=1024, height=768):
    """
    Cloudflare Workers AI (Requires Account ID & API Token)
    Upgraded to Flux-1-Schnell for higher quality
    """
    try:
        if not account_id or not api_token:
            print("Cloudflare credentials missing.")
            return None

        # Upgraded model from SDXL to Flux-1-Schnell
        model = "@cf/black-forest-labs/flux-1-schnell"
        print(f"Requesting Cloudflare AI ({model})...")
        url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }

        # Split negative prompt if present
        positive, negative = _split_positive_negative_prompt(prompt)

        # [수정] flux-1-schnell 스키마는 prompt 외 속성 거부 → prompt만 전송
        payload = {"prompt": positive}

        response = requests.post(url, headers=headers, json=payload, timeout=90)

        if response.status_code == 200:
            # Flux-1-Schnell via Cloudflare returns a JSON with image data or binary
            # Check response content type
            if "application/json" in response.headers.get("Content-Type", ""):
                result = response.json()
                if "result" in result and "image" in result["result"]:
                    import base64
                    image_data = base64.b64decode(result["result"]["image"])
                    with open(output_path, "wb") as f:
                        f.write(image_data)
                else:
                    print(f"Cloudflare Flux output unexpected format: {result}")
                    return None
            else:
                # Binary response
                with open(output_path, "wb") as f:
                    f.write(response.content)

            if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                print(f"Generated with Cloudflare Flux - Saved to {output_path}")
                return output_path
            else:
                print("Cloudflare output too small.")
        else:
            print(f"Cloudflare AI failed: {response.status_code} - {response.text}")

    except Exception as e:
        print(f"Cloudflare AI error: {e}")

    return None

def generate_image_pollinations(prompt, output_path, seed=None, width=1280, height=720):
    """
    Pollinations.ai (Free API) - Uses official python library if available, else requests
    """
    # 1. Try using the official library first (More reliable)
    if pollinations:
        try:
            # Split negative prompt if present
            final_prompt = prompt
            negative = None
            if " --no " in prompt:
                parts = prompt.split(" --no ")
                final_prompt = parts[0]
                negative = parts[1]

            if seed is None:
                seed = random.randint(1, 100000)

            # Try flux first, if fails, try turbo
            models_to_try = ["flux", "turbo"]

            for model_name in models_to_try:
                try:
                    print(f"Generating with Pollinations Lib (Model: {model_name})...")
                    image_obj = pollinations.Image(
                        prompt=final_prompt,
                        negative=negative,
                        model=model_name,
                        width=width,
                        height=height,
                        seed=seed
                    )

                    # Check if it saved to a file
                    generated_file = getattr(image_obj, 'file', None)
                    # print(f"Pollinations Lib ({model_name}) generated file path: {generated_file}")

                    if generated_file and os.path.exists(generated_file):
                        # Move/Rename to output_path
                        if os.path.exists(output_path):
                            os.remove(output_path)
                        os.rename(generated_file, output_path)
                        print(f"Generated with Pollinations (Lib/{model_name}) - Saved to {output_path}")
                        return output_path
                    elif hasattr(image_obj, 'save'):
                        image_obj.save(output_path)
                        if os.path.exists(output_path):
                            print(f"Generated with Pollinations (Lib/{model_name}/Save) - Saved to {output_path}")
                            return output_path

                    print(f"Pollinations Lib ({model_name}) failed to create file.")

                except Exception as e:
                    print(f"Pollinations Library ({model_name}) failed: {e}")

            print("All Pollinations Lib models failed. Falling back to requests...")

        except Exception as e:
            print(f"Pollinations Library logic failed: {e}. Falling back to requests...")

    # 2. Fallback to Requests (Old method)
    try:
        # [설정] Pollinations 모델 순서 + 요청 간 최소 간격 (무료 티어: IP당 15초에 1요청)
        global _pollinations_last_request
        try:
            _pollinations_last_request
        except NameError:
            _pollinations_last_request = 0.0
        try:
            _img_conf = load_config().get('image_gen', {})
        except Exception:
            _img_conf = {}
        _models_cfg = _img_conf.get('pollinations_models', ["turbo", "flux"])
        if isinstance(_models_cfg, str):
            _models_cfg = [m.strip() for m in _models_cfg.split(",") if m.strip()]
        if not _models_cfg:
            _models_cfg = ["turbo", "flux"]
        try:
            _min_interval = float(_img_conf.get('pollinations_min_interval', 16))
        except (TypeError, ValueError):
            _min_interval = 16.0

        def _pace_pollinations():
            global _pollinations_last_request
            wait = _min_interval - (time.time() - _pollinations_last_request)
            if wait > 0:
                print(f"[Pollinations] Pacing: waiting {wait:.0f}s (free tier 1 req / 15s)...")
                time.sleep(wait)

        # 1. Clean up prompt
        final_prompt = prompt
        negative = ""
        if " --no " in prompt:
            parts = prompt.split(" --no ")
            final_prompt = parts[0]
            negative = parts[1]

        # [수정] 과도하게 긴 프롬프트는 Pollinations 500 유발 → 단어 경계에서 450자로 단축
        final_prompt = " ".join(final_prompt.split())
        if len(final_prompt) > 450:
            cut = final_prompt[:450].rsplit(" ", 1)[0]
            final_prompt = cut if cut else final_prompt[:450]
            print(f"[Pollinations] Prompt truncated to {len(final_prompt)} chars")

        safe_prompt = requests.utils.quote(final_prompt)
        safe_negative = requests.utils.quote(negative)

        if seed is None:
            seed = random.randint(1, 100000)

        # 2. Construct URL (모델 순서 + 요청 간격은 설정에서 관리)
        models = [m for m in _models_cfg if m]

        for mi, model in enumerate(models):
            # [수정] 연속 요청 rate-limit(429) 완화: 매 요청 전 최소 간격 강제
            _pace_pollinations()
            # 429 시 같은 모델 1회 재시도 (대기 후)
            for attempt in range(2):
                try:
                    # Base URL
                    url = f"https://image.pollinations.ai/prompt/{safe_prompt}?width={width}&height={height}&seed={seed}&nologo=true&model={model}"
                    if negative:
                         url += f"&negative={safe_negative}"

                    # 3. Request
                    print(f"Requesting Pollinations (Web/{model}): {url[:100]}...")
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://pollinations.ai/',
                        'Origin': 'https://pollinations.ai'
                    }

                    # Increase timeout to 60s for Flux
                    _pollinations_last_request = time.time()
                    response = requests.get(url, headers=headers, timeout=60)

                    if response.status_code == 200:
                        content_type = response.headers.get('Content-Type', '')
                        if 'image' in content_type:
                            with open(output_path, "wb") as f:
                                f.write(response.content)

                            # Check file size
                            if os.path.getsize(output_path) > 1000:
                                print(f"Generated with Pollinations ({model}) - Saved to {output_path}")
                                return output_path
                            else:
                                print(f"Pollinations output too small: {os.path.getsize(output_path)} bytes")
                        else:
                            print(f"Pollinations returned non-image: {content_type}")
                        break  # 200이면 재시도 불필요
                    elif response.status_code == 429:
                        print(f"Pollinations ({model}) rate limited (429). Waiting {max(8, int(_min_interval))}s before retry {attempt + 1}/2...")
                        time.sleep(max(8, int(_min_interval)))
                        continue  # 같은 모델 재시도
                    elif response.status_code == 530:
                         print(f"Pollinations ({model}) failed with status 530 (Server Error/Blocked). Skipping other models.")
                         return None  # 서버 차단/다운 시 다른 모델 시도 중단
                    else:
                        print(f"Pollinations ({model}) failed with status {response.status_code}")
                        break  # 500 등은 다음 모델로
                except Exception as e:
                     print(f"Pollinations ({model}) error: {e}")
                     break

    except Exception as e:
        print(f"Pollinations failed: {e}")

    return None

def generate_image_ai_horde(prompt, output_path, width=1024, height=768):
    """
    AI Horde (Free, Distributed) - Fallback
    """
    try:
        # Check for Anonymous Key
        api_key = "0000000000" # Anonymous key
        is_anonymous = api_key == "0000000000"

        # Adjust resolution for Anonymous usage to avoid Kudos requirements
        # Limit max dimension to ~768 if anonymous
        if is_anonymous:
            max_dim = 768
            if width > max_dim or height > max_dim:
                ratio = width / height
                if width > height:
                    width = max_dim
                    height = int(max_dim / ratio)
                else:
                    height = max_dim
                    width = int(max_dim * ratio)
                print(f"Resized for AI Horde (Anonymous): {width}x{height}")

        # AI Horde requires width/height to be multiples of 64
        # Use rounding to nearest 64
        width = int((width + 32) // 64) * 64
        height = int((height + 32) // 64) * 64

        # Ensure minimum size
        if width < 64: width = 64
        if height < 64: height = 64

        headers = {
            "apikey": api_key, 
            "Client-Agent": "AutoVideoSystem:v1.0:unknown",
            "Content-Type": "application/json"
        }

        # Split negative prompt
        positive = prompt
        negative = ""
        if " --no " in prompt:
            parts = prompt.split(" --no ")
            positive = parts[0]
            negative = parts[1]

        # Construct payload
        # Note: 'models' can be left empty to allow any model, or specify generic ones
        # We use a safe list or specific reliable models if needed. 
        # For now, let's try with empty models list to maximize worker availability, 
        # or use "stable_diffusion" which is a category.

        payload = {
            "prompt": f"{positive} ### {negative}" if negative else positive,
            "params": {
                "steps": 20, # Reduced steps for speed
                "n": 1,
                "width": width,
                "height": height,
                "cfg_scale": 7.0,
                "sampler_name": "k_dpmpp_2m",
                "karras": True
            },
            "nsfw": False,
            "censor_nsfw": True,
            "trusted_workers": False,
            "models": [], # Allow any model for faster pickup
            "r2": True 
        }

        print(f"Requesting AI Horde: {width}x{height}...")
        req = requests.post("https://stablehorde.net/api/v2/generate/async", json=payload, headers=headers)

        if req.status_code != 202:
            print(f"AI Horde Request Failed: {req.status_code} - {req.text}")
            return None

        uuid = req.json()['id']
        print(f"AI Horde Job ID: {uuid}. Waiting for generation...")

        # 2. Polling for result
        start_time = time.time()
        while time.time() - start_time < 180: # Increased to 3 minutes
            time.sleep(5)
            try:
                check_url = f"https://stablehorde.net/api/v2/generate/check/{uuid}"
                check = requests.get(check_url)

                if check.status_code != 200:
                    continue

                check_data = check.json()

                if check_data['done']:
                    status_url = f"https://stablehorde.net/api/v2/generate/status/{uuid}"
                    status = requests.get(status_url)

                    if status.status_code != 200:
                        print(f"AI Horde Status Failed: {status.status_code}")
                        break

                    gens = status.json().get('generations', [])
                    if gens:
                        img_url = gens[0]['img']
                        print(f"Downloading Horde Image: {img_url}")
                        img_resp = requests.get(img_url)
                        if img_resp.status_code == 200:
                            with open(output_path, "wb") as f:
                                f.write(img_resp.content)
                            print(f"Generated with AI Horde - Saved to {output_path}")
                            return output_path
                    else:
                         print("AI Horde returned no generations.")
                    break

                # print(f"Horde Status: {check_data.get('wait_time', 'unknown')}s remaining...")

            except Exception as e:
                print(f"AI Horde Polling Error: {e}")
                time.sleep(2)

    except Exception as e:
        print(f"AI Horde failed: {e}")
    return None



def download_visual_content(scene, index, output_dir=None, cancel_check=None):
    """
    기존 단일 이미지 생성 함수 (렌더링용)
    """
    if cancel_check and cancel_check():
        raise InterruptedError("User requested cancellation")
    # Ensure directories exist
    if output_dir:
        bg_dir = output_dir
    else:
        bg_dir = os.path.join(get_asset_dir(), "backgrounds")
    os.makedirs(bg_dir, exist_ok=True)

    config = load_config()
    scene_type = scene.get('type', 'ai_image')
    keyword = scene.get('keyword', 'news background')
    description = scene.get('description', keyword)

    # --- 1. Graph Generation ---
    if scene_type == 'graph':
        graph_data = scene.get('data', {})
        if graph_data and isinstance(graph_data, dict):
            path = os.path.join(bg_dir, f"bg_{index}_graph.png")
            result = create_graph_image(graph_data, keyword, path)
            if result:
                return result
        print(f"Graph generation failed or no data. Fallback to AI image.")
        scene_type = 'ai_image'

    # --- 2. Search (Web) ---
    if scene_type == 'search':
        if cancel_check and cancel_check():
            raise InterruptedError("User requested cancellation")
        # 2-1. Web Search
        web_image_url = search_web_image(keyword, cancel_check=cancel_check)
        if web_image_url:
            try:
                path = os.path.join(bg_dir, f"bg_{index}_web.jpg")
                response = requests.get(web_image_url, timeout=10)
                if response.status_code == 200:
                    with open(path, "wb") as f:
                        f.write(response.content)
                    return path
            except Exception as e:
                print(f"Web image download failed: {e}")

        print("Search failed. Fallback to AI image.")
        scene_type = 'ai_image'

    # --- 3. AI Image Generation ---
    prompt_base = description if len(description) > len(keyword) else keyword
    
    img_conf = config.get('image_gen', {})
    
    # Determine model first to pass to refine_ai_prompt
    model_type = "pollinations"
    if img_conf.get('use_zimage', False): model_type = "zimage"
    elif img_conf.get('use_cloudflare', False): model_type = "cloudflare"
    elif img_conf.get('use_local_sd', False): model_type = "local_sd"
    elif img_conf.get('use_ai_horde', False): model_type = "horde"
    
    refined_prompt = refine_ai_prompt(prompt_base, keyword, model=model_type)

    if img_conf.get('use_zimage', False):
        path = os.path.join(bg_dir, f"bg_{index}_zimage.jpg")
        zimage_model_id = img_conf.get('zimage_model_id', "Tongyi-MAI/Z-Image-Turbo")
        zimage_steps = int(img_conf.get('zimage_steps', 9))
        res = generate_image_zimage(refined_prompt, path, model_id=zimage_model_id, width=1280, height=720, steps=zimage_steps)
        if res: return res

    if img_conf.get('use_cloudflare', False):
        path = os.path.join(bg_dir, f"bg_{index}_cf.jpg")
        res = generate_image_cloudflare(refined_prompt, path, img_conf.get('cloudflare_account_id'), img_conf.get('cloudflare_api_token'))
        if res: return res
        
    if img_conf.get('use_local_sd', False):
        path = os.path.join(bg_dir, f"bg_{index}_local.jpg")
        res = generate_image_local_sd(refined_prompt, path, img_conf.get('local_sd_url', "http://127.0.0.1:7860"))
        if res: return res

    if img_conf.get('use_pollinations', True):
        path = os.path.join(bg_dir, f"bg_{index}_pollinations.jpg")
        res = generate_image_pollinations(refined_prompt, path)
        if res: return res

    if img_conf.get('use_ai_horde', True):
        path = os.path.join(bg_dir, f"bg_{index}_horde.jpg")
        res = generate_image_ai_horde(refined_prompt, path)
        if res: return res

    return None


def search_pexels_videos(keyword, count=4, use_cache=True, refresh=False):
    """Pexels 스톡 비디오 검색 → mp4 로컬 다운로드. [{url, path, preview}]
    캐시: (쿼리, 개수) 키로 결과 재사용. 파일명은 URL 해시라 중복 다운로드 없음."""
    config = load_config()
    img_conf = config.get("image_gen", {})
    api_key = key_store.resolve_key("pexels_api_key", config, env="PEXELS_API_KEY")
    if not api_key:
        raise ValueError("Pexels API 키가 없습니다. 설정 화면에서 입력하세요 (pexels.com 무료 발급).")

    preview_base = os.path.join(get_asset_dir(), "previews", "stock")
    os.makedirs(preview_base, exist_ok=True)

    stock_key = ""
    if use_cache and not refresh:
        stock_key = media_cache.make_key(keyword, count)
        cached = media_cache.get("stock", stock_key)
        if isinstance(cached, list) and cached and all(
            isinstance(v, dict) and os.path.exists(v.get("path", "")) for v in cached
        ):
            print(f"[Pexels] cache hit ({len(cached)} videos)")
            return cached

    def _query(q):
        resp = requests.get(
            "https://api.pexels.com/videos/search",
            headers={"Authorization": api_key},
            params={"query": q, "per_page": count, "orientation": "landscape", "size": "medium"},
            timeout=20,
        )
        if resp.status_code == 401:
            raise ValueError("Pexels API 키가 유효하지 않습니다 (401).")
        if resp.status_code != 200:
            raise ValueError(f"Pexels 검색 실패: HTTP {resp.status_code}")
        return resp.json().get("videos", [])

    videos = _query(keyword)
    if not videos and re.search(r"[ㄱ-힣]", keyword or ""):
        # 한글 쿼리 실패 시 영문 변환 재시도
        en_q = keyword
        for ko, en in _KO_TO_EN_LOCATION.items():
            en_q = en_q.replace(ko, f" {en} ")
        en_q = " ".join(en_q.split())
        print(f"[Pexels] Retry with English query: {en_q}")
        videos = _query(en_q)

    results = []
    for idx, v in enumerate(videos[:count]):
        files = [f for f in (v.get("video_files") or []) if (f.get("link") or "").endswith(".mp4")]
        if not files:
            continue
        big = [f for f in files if (f.get("width") or 0) >= 1280]
        pick = min(big, key=lambda f: f["width"]) if big else max(files, key=lambda f: f.get("width") or 0)
        try:
            dl = requests.get(pick["link"], timeout=60)
            if dl.status_code != 200 or len(dl.content) < 50000:
                continue
            # URL 해시 파일명: 같은 영상은 한 번만 저장 (씬 달라도 재사용)
            path = media_cache.hashed_media_path("stock", pick["link"], "mp4")
            if not (os.path.exists(path) and os.path.getsize(path) > 0):
                with open(path, "wb") as f:
                    f.write(dl.content)
            rel = os.path.relpath(path, get_asset_dir())
            results.append({
                "url": f"/assets/{rel.replace(os.sep, '/')}",
                "path": path,
                "preview": v.get("image", ""),
            })
            print(f"[Pexels] Saved {os.path.basename(path)} ({len(dl.content)//1024}KB)")
        except Exception as e:
            print(f"[Pexels] Download failed: {e}")
    if stock_key and results:
        media_cache.put("stock", stock_key, results)
    return results


async def generate_scene_candidates(scene, index, project_id="default", ai_count=1, search_count=5, generate_ai=True, generate_search=True, width=1280, height=720, style="", ai_model="pollinations", search_engine="bing", topic="", visual_guide="", cancel_check=None, category="", use_cache=True, refresh=False):
    """
    UI 미리보기용으로 AI 후보(ai_count)와 검색 후보(search_count)를 생성/수집하여 반환합니다.
    """
    if cancel_check and cancel_check():
        raise InterruptedError("User requested cancellation")

    # 프로젝트별 하위 폴더 생성하여 이미지 충돌 방지
    preview_base = os.path.join(get_asset_dir(), "previews")
    preview_dir = os.path.join(preview_base, project_id)
    os.makedirs(preview_dir, exist_ok=True)

    config = load_config()
    img_conf = config.get('image_gen', {})
    
    # [수정] 장면 번호나 불필요한 수식어 제거
    keyword = clean_keyword(scene.get('keyword', 'news'))
    description = clean_keyword(scene.get('description', keyword))
    
    # [추가] 주제어(topic)와 비주얼 가이드(visual_guide) 정제
    clean_topic = clean_keyword(topic) if topic else ""
    # visual_guide에서 original keyword만 추출 시도 (괄호 안의 내용 등)
    clean_visual = visual_guide
    if visual_guide and "(" in visual_guide and ")" in visual_guide:
        # "Original: (Keyword)" 패턴 대응
        match = re.search(r'\((.*?)\)', visual_guide)
        if match:
            clean_visual = match.group(1)
    clean_visual = clean_keyword(clean_visual) if clean_visual else ""

    # 카테고리 정규화 (대본 템플릿 ID와 공유, 모르면 news = 기존 동작)
    vcat = normalize_visual_category(category)

    selected_ai_model = ai_model
    if selected_ai_model == "pollinations" and img_conf.get('use_zimage', False) and not img_conf.get('use_pollinations', True):
        selected_ai_model = "zimage"

    candidates = {'ai': [], 'search': [], 'graph': []}

    # 0. Graph Candidate (if data exists)
    if 'data' in scene and scene['data']:
         try:
            # 1. Light Theme
            path1 = os.path.join(preview_dir, f"scene_{index}_graph_light.png")
            result1 = create_graph_image(scene['data'], keyword, path1, theme='light')
            if result1:
                candidates['graph'].append(result1)

            # 2. Dark Theme
            path2 = os.path.join(preview_dir, f"scene_{index}_graph_dark.png")
            result2 = create_graph_image(scene['data'], keyword, path2, theme='dark')
            if result2:
                candidates['graph'].append(result2)
         except Exception as e:
            print(f"Graph gen error: {e}")

    # [수정] 장면 번호나 불필요한 수식어 제거 (AI 프롬프트용)
    keyword = clean_keyword(scene.get('keyword', 'news'))
    description = clean_keyword(scene.get('description', keyword))

    # 1. AI Image Candidates
    if generate_ai:
        for i in range(ai_count):
            if cancel_check and cancel_check():
                raise InterruptedError("User requested cancellation")
            refined = refine_ai_prompt(description, keyword, style, model=selected_ai_model, category=vcat, mood=scene.get('mood', ''))
            ai_key = media_cache.make_key(selected_ai_model, refined, width, height)
            if use_cache and not refresh:
                hit = media_cache.get("ai", ai_key)
                if isinstance(hit, str) and os.path.exists(hit):
                    print(f"[AI] cache hit scene {index}")
                    candidates['ai'].append(hit)
                    continue
            # 파일명에 시드나 랜덤값을 추가하여 갱신 시 새로운 이미지가 보이도록 유도
            seed = random.randint(1, 1000000)
            path = os.path.join(preview_dir, f"scene_{index}_ai_{i}_{seed}.jpg")

            res = None
            if selected_ai_model == "pollinations":
                res = generate_image_pollinations(refined, path, seed=seed, width=width, height=height)
            elif selected_ai_model == "zimage":
                zimage_model_id = img_conf.get('zimage_model_id', "Tongyi-MAI/Z-Image-Turbo")
                zimage_steps = int(img_conf.get('zimage_steps', 9))
                res = generate_image_zimage(refined, path, model_id=zimage_model_id, width=width, height=height, seed=seed, steps=zimage_steps)
            elif selected_ai_model in ("local", "local_sd"):
                res = generate_image_local_sd(refined, path, img_conf.get('local_sd_url', "http://127.0.0.1:7860"), width=width, height=height)
            elif selected_ai_model == "cloudflare":
                cf_acc = img_conf.get('cloudflare_account_id')
                cf_token = img_conf.get('cloudflare_api_token')
                res = generate_image_cloudflare(refined, path, cf_acc, cf_token, width=width, height=height)
            elif selected_ai_model == "horde":
                res = generate_image_ai_horde(refined, path, width=width, height=height)
            elif selected_ai_model == "gemini":
                res = generate_image_gemini(
                    refined, path,
                    key_store.resolve_key("gemini_api_key", config,
                                         env="GEMINI_API_KEY"),
                    model=img_conf.get('gemini_image_model'),
                    width=width, height=height,
                )
            elif selected_ai_model == "deepinfra":
                res = generate_image_deepinfra(
                    refined, path,
                    img_conf.get('deepinfra_api_key'),
                    model=img_conf.get('deepinfra_image_model'),
                    width=width, height=height,
                )

            if not res and selected_ai_model != "pollinations":
                res = generate_image_pollinations(refined, path, seed=seed, width=width, height=height)

            if res:
                if use_cache:
                    media_cache.put("ai", ai_key, res)
                candidates['ai'].append(res)
            else:
                 print(f"Failed to generate AI image for scene {index}, iteration {i} (All methods failed)")

    # 2. Search Candidates
    if generate_search:
        # [수정] 검색용 키워드는 너무 과하게 정제하면 핵심 단어(지하철, 출근길 등)가 사라질 수 있음
        # [개편] 사용자 요청: TOPIC과 Visual Guide(original keyword) 우선 사용
        raw_keyword = scene.get('keyword') or ''
        if not raw_keyword:
            # 구 프론트 호환: keywords 리스트(첫 원소가 실제 짧은 키워드) 폴백
            kw_list = [k for k in (scene.get('keywords') or []) if k and str(k).strip()]
            if kw_list:
                raw_keyword = str(kw_list[0])
        desc = scene.get('description', '') or ''
        desc_clean = re.sub(r'^Montage:\s*', '', desc, flags=re.I)

        # [수정] generic topic(기본 프로젝트명 등)은 검색어 오염원이므로 무시
        GENERIC_TOPICS = {'새 프로젝트', '프로젝트', '새프로젝트', 'new project', 'untitled', 'project', 'test', '제목 없음'}
        if clean_topic and (clean_topic.strip().lower() in GENERIC_TOPICS or len(clean_topic.strip()) <= 1):
            clean_topic = ''
        # [수정] visual_guide가 긴 영문 description 그대로면 앞 5단어 잘라쓰기 금지 → 아래 추출 로직으로 넘김
        clean_visual_for_combo = clean_visual
        if clean_visual and len(clean_visual.split()) > 8 and not raw_keyword:
            clean_visual_for_combo = ''
        
        # 0. 우선순위: scene keyword를 맨 앞에 (가장 중요), topic/visual은 보조
        if raw_keyword or clean_topic or clean_visual_for_combo:
            # topic과 visual에서 핵심 단어만 추출 (중복 제거)
            combined_words = []
            for text in [raw_keyword, clean_topic, clean_visual_for_combo]:
                if not text: continue
                for w in text.split():
                    if w.lower() not in [x.lower() for x in combined_words] and len(w) > 1:
                        combined_words.append(w)

            # 카테고리별 검색 오염어 제거 (요리/리뷰: 마케팅 수식어)
            junk = CATEGORY_VISUAL.get(vcat, CATEGORY_VISUAL["news"])["junk_words"]
            if junk:
                junk_lower = {j.lower() for j in junk}
                combined_words = [w for w in combined_words if w.lower() not in junk_lower]
            
            search_base = " ".join(combined_words[:8])
            print(f"[Search] Using Topic/Visual based keywords: {search_base}")
        else:
            # 기존 추출 로직 (fallback)
            # Montage: 접두어 제거 및 문장 정리
            desc_clean = re.sub(r'^Montage:\s*', '', desc, flags=re.I)
            
            # 1. 인물(Who) 추출 - 더 유연한 패턴으로 개선 (Korean 위치 상관없이 추출)
            # 먼저 인물 유형(Role)을 추출
            roles = r'(middle\s*age|adult|woman|man|lady|gentleman|office\s+worker|shoppers?|merchants?|citizens?|child|parent|elderly|family|elder|senior|grandparent|grandmother|grandfather|중년|성인|여성|남성|직장인|쇼핑객|상인|시민|사람|아이|부모|노인|할머니|할아버지|가족)'
            role_matches = re.findall(roles, f"{raw_keyword} {desc_clean}", re.I)
            
            # 중복 제거 및 "Korean" 접두어 부여
            who_list = []
            is_korean_context = bool(re.search(r'(Korean|한국|서울|South\s*Korea)', f"{raw_keyword} {desc_clean}", re.I))
            
            for r in role_matches:
                r_clean = r.strip()
                if not r_clean: continue
                
                # "Korean" 접두어가 없으면 붙여줌 (한국 맥락인 경우)
                if is_korean_context and not re.search(r'(Korean|한국)', r_clean, re.I):
                    # 영문인 경우 Korean 붙임, 한글인 경우 한국 붙임
                    if re.search(r'[a-zA-Z]', r_clean):
                        r_clean = f"Korean {r_clean}"
                    else:
                        r_clean = f"한국 {r_clean}"
                
                if r_clean.lower() not in [x.lower() for x in who_list]:
                    who_list.append(r_clean)
            
            # [수정] elderly(노인), parent(부모), middle age(중년) 키워드가 있으면 우선순위를 높임
            priority_keywords = ['elderly', 'parent', 'middle', 'senior', 'grand', '노인', '부모', '중년', '할머니', '할아버지']
            who_list.sort(key=lambda x: any(pk in x.lower() for pk in priority_keywords), reverse=True)
            
            who = " ".join(who_list[:4]) # 인물 키워드 추출 개수 확대
            
            # 2. 장소(Where) 추출 - 더 포괄적인 패턴으로 확장
            where_pattern = r'(office|subway|street|home|desk|park|table|kitchen|city|seoul|korea|building|skyscraper|markets?|mart|store|apartment|사무실|지하철|거리|집|책상|공원|식탁|주방|서울|한국|빌딩|건물|시장|마트|상점|아파트)s?'
            where_matches = re.findall(where_pattern, f"{raw_keyword} {desc_clean}", re.I)
            where_list = []
            for w in where_matches:
                if w.lower() not in [x.lower() for x in where_list]: where_list.append(w)
            where = " ".join(where_list[:3])
            
            # 3. 상황/감정(What/How) 추출 - 더 포괄적인 패턴으로 확장
            how_pattern = r'(tired|exhausted|stressed|overwhelmed|night|dark|glowing|emergency|situation|disengaged|burden|studying|walking|looking|bill|role|prices?|rising|vegetables?|tax|graph|지친|피곤한|힘든|야근|야경|긴급|상황|스트레스|부담|공부|산책|보는|고지서|역할|물가|가격|상승|채소|세금|그래프)s?'
            how_matches = re.findall(how_pattern, f"{raw_keyword} {desc_clean}", re.I)
            how_list = []
            for h in how_matches:
                if h.lower() not in [x.lower() for x in how_list]: how_list.append(h)
            how = " ".join(how_list[:5]) # 상황 키워드 비중 확대
            
            # 핵심 키워드 조합 (Who + Where + How)
            combined_base = f"{who} {where} {how}".strip()
            
            # [추가] 추출된 키워드가 너무 부실하거나 (예: "office" 한 단어) 특정 핵심 단어가 누락된 경우 보완
            # 특히 "Seoul", "skyline", "night", "city" 등 풍경/도시 관련 키워드 보존
            if len(combined_base.split()) < 2 or (len(combined_base.split()) < 3 and "office" in combined_base.lower()) or "skyline" in f"{raw_keyword} {desc_clean}".lower():
                # 장소/상황 관련 추가 패턴
                extra_pattern = r'(skyline|cityscape|landscape|night\s*view|building|skyscraper|emergency|situation|야경|도시|풍경|긴급|상황|office\s*windows|dramatic\s*lighting)s?'
                extra_matches = re.findall(extra_pattern, f"{raw_keyword} {desc_clean}", re.I)
                extra_list = []
                for ex in extra_matches:
                    if ex.lower() not in [x.lower() for x in extra_list]: extra_list.append(ex)
                
                if extra_list:
                    # 기존 combined_base와 합치되 중복 제거
                    for item in extra_list:
                        if item.lower() not in combined_base.lower():
                            combined_base = f"{combined_base} {item}".strip()

            # 영문 변환 (검색 엔진 최적화)
            if combined_base:
                # 한글이 포함되어 있다면 영문 핵심 키워드로 변환 시도 (이미지 검색 품질 향상)
                translation_map = {
                    "한국 여성": "Korean woman", "한국 남성": "Korean man", "직장인": "office worker",
                    "사무실": "office", "지하철": "subway", "야근": "night work", "지친": "tired", "피곤한": "exhausted",
                    "아이": "child", "부모": "parents", "노인": "elderly", "성인": "adult", "가족": "family",
                    "공원": "park", "식탁": "table", "공부": "studying", "산책": "walking", "부담": "burden", "고지서": "bills",
                    "중년": "middle aged", "역할": "role", "할머니": "grandmother", "할아버지": "grandfather",
                    "노인": "senior", "어르신": "elderly", "야경": "night view", "도시": "city", "풍경": "landscape",
                    "긴급": "emergency", "상황": "situation", "시장": "market", "쇼핑객": "shoppers",
                    "상인": "merchant", "시민": "citizens", "물가": "prices", "가격": "price",
                    "상승": "rising", "채소": "vegetables", "세금": "tax", "그래프": "graph",
                    "아파트": "apartment", "조명": "lights", "도심": "downtown"
                }
                for ko, en in translation_map.items():
                    combined_base = combined_base.replace(ko, en)
                
                search_base = combined_base
            else:
                # 위 패턴으로 추출 실패 시 기존 방식(앞 6단어) 사용하되 불용어 제거
                clean_text = re.sub(r'\b(of|a|the|an|is|are|at|in|on|with|by|from)\b', '', f"{raw_keyword} {desc_clean}", flags=re.I).strip()
                # Montage 같은 단어 제거
                clean_text = re.sub(r'\b(Montage|Scene|Shot)\b', '', clean_text, flags=re.I).strip()
                search_base = " ".join(clean_text.split()[:6])

        if not search_base or search_base.lower() in ['news', 'none']:
            search_base = "Korean office worker tired"
        
        # [수정] 너무 짧으면 추가 보강
        if len(search_base.split()) < 3:
            # 감정/장소 단어만 살짝 보강
            emotion_pattern = r'([가-힣]{2,}(?:한|된|은|는)|tired|exhausted|stressed|burden|struggling)'
            context_pattern = r'([가-힣]{2,}(?:역|실|길|장|처)|subway|office|street|park|home)'
            
            emotions = re.findall(emotion_pattern, desc_clean)
            contexts = re.findall(context_pattern, desc_clean)
            
            added_terms = []
            for emo in emotions[:1]:
                if emo not in search_base: added_terms.append(emo)
            for ctx in contexts[:1]:
                if ctx not in search_base: added_terms.append(ctx)
                
            if added_terms:
                search_base = f"{search_base} {' '.join(added_terms)}"

        # " - " (공백 포함 대시)만 분리하여 부가 정보 제거
        search_base = search_base.split(' - ')[0].replace(',', ' ').strip()
        
        # [추가] 중복 단어 제거 (예: "Korean woman Korean woman")
        search_base_words = []
        for w in search_base.split():
            if w.lower() not in [x.lower() for x in search_base_words]:
                search_base_words.append(w)
        search_base = " ".join(search_base_words)
        
        if not search_base or search_base.lower() == 'news':
            # description에서 최소한의 키워드만 추출 시도 (뉴스 대신 더 구체적인 키워드)
            desc = scene.get('description', 'news')
            search_base = clean_keyword(desc)
            if not search_base or search_base.lower() == 'news':
                # 여전히 news면 description의 첫 3개 단어라도 사용
                search_base = " ".join(desc.split()[:3])

        # Determine language
        is_korean = bool(re.search(r'[ㄱ-ㅎㅏ-ㅣ가-힣]', search_base))

        # 카테고리별 검색 부정어 (뉴스용 -기자 -뉴스룸 등이 요리에 새는 것 방지)
        cat_neg = CATEGORY_VISUAL.get(vcat, CATEGORY_VISUAL["news"])
        if is_korean:
            # 한국어/영어 모두 Bing 최우선 (사용자 요청: Google/Naver 제거)
            search_engine = "bing"
            search_keyword = f"{search_base} {cat_neg['search_neg_ko']}"
        else:
            # 영어여도 Bing/DDG를 위해 한국어 정제어 추가 + 강력한 부정어 추가
            search_engine = "bing"
            search_keyword = f"{search_base} {cat_neg['search_neg_en']}"
        
        # [추가] 데이터 시각화나 추상적 이미지인 경우 부정어 강화
        if any(word in search_base.lower() for word in ["data", "visualization", "graph", "chart", "abstract", "network", "digital"]):
            search_keyword += " -interaction -touching -pointing -monitor -screen"
        
        print(f"[Search] Scene {index} - Original Keyword: {raw_keyword or scene.get('keyword')} (category={vcat})")
        print(f"[Search] Scene {index} - Base Query: {search_base}")
        print(f"[Search] Enhanced search query for scene {index}: {search_keyword} using {search_engine}")
        
        # [수정] 한국어/영어 모두 구글을 기본으로, 사용자 요청에 따라 정제된 키워드 사용
        res_list = await search_web_images_list(search_keyword, count=search_count, engine=search_engine, cancel_check=cancel_check, use_cache=use_cache, refresh=refresh)

        # Download the images to local preview dir
        for idx, img_url in enumerate(res_list):
            if cancel_check and cancel_check():
                raise InterruptedError("User requested cancellation")
            try:
                # Basic validation of URL (Allow http and data:image/)
                if not img_url or (not img_url.startswith("http") and not img_url.startswith("data:image/")):
                    continue

                ext = "jpg"
                if ".png" in img_url: ext = "png"
                elif ".webp" in img_url: ext = "webp"
                elif "data:image/png" in img_url: ext = "png"
                elif "data:image/webp" in img_url: ext = "webp"

                # URL 해시 기반 경로: 같은 이미지는 한 번만 다운로드
                path = media_cache.hashed_media_path(f"scene_{project_id}", img_url, ext)

                print(f"[Search] Processing candidate {idx} for scene {index}: {img_url[:60]}...")
                if os.path.exists(path) and os.path.getsize(path) > 0:
                    print(f"[Search] file cache hit scene {index}")
                    candidates['search'].append(path)
                    continue
                
                if img_url.startswith("data:image/"):
                    # Handle Base64 image
                    try:
                        header, data = img_url.split(",", 1)
                        image_data = base64.b64decode(data)
                        with open(path, "wb") as f:
                            f.write(image_data)
                        candidates['search'].append(path)
                        print(f"[Search] Successfully saved base64 candidate {idx}")
                    except Exception as b64e:
                        print(f"[Search] Base64 decode error for candidate {idx}: {b64e}")
                else:
                    # Download with timeout and User-Agent (to avoid blocking)
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                        "Referer": "https://www.bing.com/" # Bing 출처인 척 하여 hotlinking 방지 우회 시도
                    }
                    try:
                        response = requests.get(img_url, timeout=7, headers=headers)
                        if response.status_code == 200:
                            with open(path, "wb") as f:
                                f.write(response.content)
                            
                            # Store as dictionary with timestamp for cache busting if needed
                            candidates['search'].append(path)
                        else:
                            print(f"[Search] Failed to download candidate {idx}: HTTP {response.status_code} for {img_url[:60]}")
                            
                            # [추가] 원본 다운로드 실패 시 썸네일 URL이라도 시도 (Bing 등에서 원본 링크가 깨진 경우 대비)
                            # 썸네일 URL은 보통 assets_downloader에서 함께 가져오지 않으므로, 
                            # 현재는 로깅만 하고 추후 assets_downloader 구조 변경 시 연동 가능
                    except requests.exceptions.Timeout:
                        print(f"[Search] Timeout downloading candidate {idx}: {img_url[:60]}")
                    except Exception as download_err:
                        print(f"[Search] Error downloading candidate {idx}: {download_err}")
            except Exception as e:
                print(f"Search image download error for scene {index}, candidate {idx}: {e}")

    return candidates

def get_visual_source(scene_or_keyword):
    # Backward compatibility
    if isinstance(scene_or_keyword, dict):
        scene = scene_or_keyword
        keyword = scene.get('keyword', 'news')
    else:
        keyword = scene_or_keyword
        scene = {'type': 'ai_image', 'keyword': keyword}

    # Just return one candidate using download_visual_content
    # Use hash for cache
    hash_key = hashlib.md5(f"{keyword}".encode('utf-8')).hexdigest()
    base_dir = os.path.dirname(os.path.abspath(__file__))
    preview_dir = os.path.join(base_dir, "assets", "previews")
    return download_visual_content(scene, hash_key, output_dir=preview_dir)
