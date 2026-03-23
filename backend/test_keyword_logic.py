import asyncio
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'core'))
from core.assets_downloader import clean_keyword, _is_bad_image_url, get_naver_images_list

async def test_logic():
    print("--- 1. 키워드 전처리 테스트 ---")
    test_keywords = [
        "장면 1: 성공한 기업인의 모습, 깔끔한 사무실 배경",
        "Scene 3: 수익 그래프 상승 cinematic lighting 4k",
        "하락장 주식 차트 - dramatic atmosphere",
        "포상금 수여식 사진 (professional photography)",
        "news Medium shot of Korean",
        "Korean news anchor"
    ]
    for k in test_keywords:
        print(f"Original: {k}")
        print(f"Cleaned : {clean_keyword(k)}\n")

    print("--- 2. URL 필터링 테스트 (뉴스 허용, 워터마크 차단) ---")
    test_urls = [
        "https://imgnews.pstatic.net/image/123/2023/10/test_news_image.jpg", # 뉴스 도메인 (통과해야함)
        "https://example.com/images/watermark_sample.jpg", # 워터마크 포함 (차단해야함)
        "https://example.com/logo_design.png" # 키워드에 logo가 없으면 차단, 있으면 통과
    ]
    
    keyword1 = "일반 검색어"
    keyword2 = "logo design"
    
    for url in test_urls:
        print(f"URL: {url}")
        print(f"  Block (keyword='{keyword1}'): {_is_bad_image_url(url, keyword1)}")
        print(f"  Block (keyword='{keyword2}'): {_is_bad_image_url(url, keyword2)}\n")

    print("--- 3. 네이버 이미지 검색 필터링 (추천 섹션 제외) 테스트 ---")
    search_keyword = "수익 그래프"
    print(f"검색어: {search_keyword}")
    results = await get_naver_images_list(search_keyword, count=3)
    print(f"결과 개수: {len(results)}")
    for i, url in enumerate(results):
        print(f"  {i+1}: {url[:80]}...")

if __name__ == "__main__":
    asyncio.run(test_logic())
