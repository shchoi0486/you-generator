import asyncio
import os
import sys

# 프로젝트 루트 경로 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import assets_downloader

async def test_ddg_playwright():
    print("Testing DuckDuckGo Search (Playwright)...")
    keyword = "Korea landscape"
    results = await assets_downloader.get_duckduckgo_images_list(keyword, count=3)
    
    if not results:
        print("No results found.")
        return

    for i, url in enumerate(results):
        print(f"{i+1}: {url}")
        # 다운로드 테스트는 생략 (visual_engine에서 수행됨)

if __name__ == "__main__":
    asyncio.run(test_ddg_playwright())
