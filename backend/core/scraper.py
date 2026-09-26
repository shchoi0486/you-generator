import asyncio
import os
import yaml
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
import requests
from bs4 import BeautifulSoup
import traceback


def load_settings():
    parent_dir = os.path.dirname(os.path.dirname(__file__))
    settings_path = os.path.join(parent_dir, 'config', 'settings.yaml')
    with open(settings_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


async def check_login_and_setup(crawler, settings):
    """로그인 상태를 확인하고 필요한 경우 로그인을 진행합니다."""
    login_url = settings.get(
        'login_url', 'https://nid.naver.com/nidlogin.login'
    )
    check_selector = settings.get('login_check_selector', '.gnb_my')
    auth_path = os.path.join(os.getcwd(), "auth.json")

    # 1. 로그인 URL로 이동하여 상태 확인
    print(f"Checking login status at {login_url}...")

    # Crawl4AI를 사용하여 로그인 페이지 체크
    result = await crawler.arun(
        url=login_url,
        config=CrawlerRunConfig(
            session_id="news_session",
            cache_mode="bypass"
        )
    )

    # 로그인 여부 판단 (로그인 시에만 나타나는 요소가 있는지 확인)
    is_logged_in = check_selector in result.html if result.success else False

    if is_logged_in:
        print("Already logged in. Proceeding...")
        # 성공 시 auth.json 파일 생성 (규칙 준수용)
        if not os.path.exists(auth_path):
            with open(auth_path, 'w') as f:
                f.write('{"status": "logged_in"}')
        return True
    else:
        print("Not logged in or login failed. Redirecting to login page...")
        # 로그인에 실패하면 auth.json을 지우고 다시 로그인 시도할 것 (규칙)
        if os.path.exists(auth_path):
            print(f"Login failed. Deleting {auth_path} and retrying...")
            os.remove(auth_path)

        # 실제 로그인 세션이 업데이트되도록 URL로 이동 (사용자가 직접 브라우저 조작할 수 있는 환경 가정)
        return False


async def get_news_content(url, cancel_check=None):
    """
    URL에서 뉴스 본문을 마크다운 형식으로 추출합니다.
    0차 시도: 네이버 블로그 전용 추출 (JS 껍데기 우회, PostView 직접 요청)
    1차 시도: Crawl4AI (Playwright 기반)
    2차 시도: Requests + BeautifulSoup (백업)
    """
    # 0. 네이버 블로그: 본문이 iframe/JS로 로드되므로 PostView를 직접 요청
    if 'blog.naver.com' in url:
        try:
            blog_text = _scrape_naver_blog(url)
            if blog_text and len(blog_text.strip()) > 200:
                print("Naver blog scraping success")
                return blog_text
            print("Naver blog scraping too short, fallback to generic flow...")
        except Exception as e:
            print(f"Naver blog scraping failed: {e}. Fallback to generic flow...")

    # 1. Domain-specific selectors (requests first for speed & precision)
    # Crawl4AI often captures sidebars/footers which confuses the AI.
    # So we try requests + precise selectors first for known major news sites.

    domain_selectors = {
        'news.naver.com': ['#dic_area', '#newsct_article', '#articeBody'],
        'n.news.naver.com': ['#dic_area', '#newsct_article', '#articeBody'],
        'news.nate.com': ['#realArtcContents', '.view_cont', '#articleView'],
        'v.daum.net': ['.article_view', '#harmonyContainer'],
        'news.daum.net': ['.article_view', '#harmonyContainer'],
        'yna.co.kr': ['.article-txt', '#articleWrap'],
        'chosun.com': ['section.article-body', '.article-body'],
        'joongang.co.kr': ['#article_body'],
        'donga.com': ['.article_txt'],
        'hani.co.kr': ['.article-text'],
        'khan.co.kr': ['.art_body'],
        'mk.co.kr': ['.art_txt'],
        'hankyung.com': ['#articletxt']
    }

    # Check if URL matches any known domain
    matched_domain = None
    for domain in domain_selectors:
        if domain in url:
            matched_domain = domain
            break

    if matched_domain:
        if cancel_check and cancel_check():
            raise asyncio.CancelledError("User requested cancellation")

        print(
            f"Matched known domain: {matched_domain}. "
            "Using Requests + BeautifulSoup..."
        )
        try:
            headers = {
                'User-Agent': (
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/91.0.4472.124 Safari/537.36'
                )
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')

            # Title
            title_tag = soup.find('title')
            title = title_tag.get_text(strip=True) if title_tag else "No Title"

            # Body
            article_body = None
            for selector in domain_selectors[matched_domain]:
                article_body = soup.select_one(selector)
                if article_body:
                    break

            if article_body:
                # Remove unwanted elements (ads, captions, etc.)
                for tag in article_body.select(
                    'script, style, iframe, .ad, .advertisement, '
                    '.caption, .img_desc'
                ):
                    tag.decompose()

                content = f"# {title}\n\n"
                # Extract text with newlines
                text = article_body.get_text(separator="\n\n", strip=True)
                content += text
                print("Domain-specific scraping success")
                return content
            else:
                print(
                    "Domain-specific selector failed "
                    "(element not found). Fallback to Crawl4AI..."
                )
        except Exception as e:
            print(
                f"Domain-specific scraping failed: {e}. "
                "Fallback to Crawl4AI..."
            )

    if cancel_check and cancel_check():
        raise asyncio.CancelledError("User requested cancellation")

    print(f"Attempting to crawl {url} with Crawl4AI...")
    try:
        settings = load_settings()

        # 브라우저 설정 (크롬 사용 및 세션 관리)
        browser_config = BrowserConfig(
            browser_type="chromium",
            channel="chrome",
            headless=True,
            use_managed_browser=True,
            user_data_dir=os.path.join(
                os.getcwd(), "chrome_profile"
            )  # 세션 유지를 위한 프로필 디렉토리
        )

        # Crawl4AI 시도
        async with AsyncWebCrawler(config=browser_config) as crawler:
            # 로그인 체크 로직 추가
            await check_login_and_setup(crawler, settings)

            # 실제 크롤링
            run_config = CrawlerRunConfig(
                session_id="news_session",
                user_agent=(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/91.0.4472.124 Safari/537.36'
                ),
                cache_mode="bypass"  # 매번 새로운 페이지를 긁어오도록 설정
            )
            result = await crawler.arun(url=url, config=run_config)
            if result.success:
                print("Crawl4AI success")
                return result.markdown
            else:
                print(f"Crawl4AI failed: {result.error_message}")
    except Exception as e:
        print(f"Crawl4AI exception: {e}")
        traceback.print_exc()

    print("Falling back to Requests + BeautifulSoup...")
    try:
        # 백업: 단순 HTML 파싱
        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/91.0.4472.124 Safari/537.36'
            )
        }
        response = requests.get(url, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # 네이버 뉴스 등 일반적인 본문 추출 시도
        # 네이버 뉴스: dic_area, newsct_article
        content = ""

        # 제목
        title_tag = soup.find('title')
        title = title_tag.get_text() if title_tag else "No Title"
        content += f"# {title}\n\n"

        # 본문 후보군
        article_body = (
            soup.select_one('#dic_area') or
            soup.select_one('#newsct_article') or
            soup.select_one('.article_view') or
            soup.select_one('article') or
            soup.body
        )

        if article_body:
            # 텍스트만 추출 (마크다운 흉내)
            for p in article_body.find_all(['p', 'div', 'br']):
                text = p.get_text(strip=True)
                if text:
                    content += f"{text}\n\n"
        else:
            content += soup.get_text(separator="\n\n", strip=True)

        print("Fallback scraping success")
        return content

    except Exception as e:
        print(f"Fallback scraping failed: {e}")
        return None


def _scrape_naver_blog(url):
    """네이버 블로그 본문 추출 (동기, requests 전용).

    blog.naver.com 페이지는 JS 껍데기라 본문이 iframe에 있다.
    PostView.naver를 직접 요청하면 서버 렌더된 본문을 받을 수 있다.
    반환: "# 제목\\n\\n본문" 또는 None.
    """
    import re as _re
    from urllib.parse import urlparse as _urlparse, parse_qs as _parse_qs

    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/120.0.0.0 Safari/537.36'
        ),
        'Referer': 'https://blog.naver.com/',
    }

    blog_id, log_no = None, None
    parsed = _urlparse(url)
    qs = _parse_qs(parsed.query)
    if qs.get('blogId') and qs.get('logNo'):
        blog_id, log_no = qs['blogId'][0], qs['logNo'][0]
    else:
        m = _re.search(r'blog\.naver\.com/([^/?#]+)/(\d+)', url)
        if m:
            blog_id, log_no = m.group(1), m.group(2)
    if not blog_id or not log_no:
        return None

    candidates = [
        f"https://blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}",
        f"https://m.blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}",
    ]
    title, body_text = "", ""
    for target in candidates:
        try:
            resp = requests.get(target, headers=headers, timeout=12)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')

            # 제목: 스마트에디터 제목 → 구에디터 제목 → og:title → title 태그 순
            if not title:
                for sel in ('.se-title-text', '.pcol1 .htitle span', '.post_tit', '.tit_h3'):
                    el = soup.select_one(sel)
                    if el and el.get_text(strip=True):
                        title = el.get_text(strip=True)
                        break
            if not title:
                og = soup.select_one('meta[property="og:title"]')
                if og and og.get('content'):
                    title = og['content'].strip()
            if not title:
                t = soup.find('title')
                if t and t.get_text(strip=True):
                    title = t.get_text(strip=True)
            title = _re.sub(r'\s*:\s*네이버 블로그\s*$', '', title or '').strip()

            # 본문: 스마트에디터 → 구에디터 순
            body_el = (
                soup.select_one('.se-main-container')
                or soup.select_one('#postViewArea')
                or soup.select_one('#postListBody')
                or soup.select_one('.post-body')
            )
            if body_el:
                for tag in body_el.select('script, style, iframe'):
                    tag.decompose()
                body_text = body_el.get_text(separator="\n", strip=True)
            if body_text and len(body_text.strip()) > 200:
                break
        except Exception as e:
            print(f"Naver blog candidate failed ({target}): {e}")
            continue

    body_text = (body_text or '').strip()
    if len(body_text) <= 200:
        return None
    # 이미지 설명 등 빈 줄 정리 + 제로폭/제어문자 제거
    body_text = _re.sub(r'[\u200b\u200c\u200d\ufeff\x00-\x08\x0b\x0c\x0e-\x1f]', '', body_text)
    lines = [ln.strip() for ln in body_text.splitlines()]
    lines = [ln for ln in lines if ln]
    return f"# {title or '네이버 블로그 레시피'}\n\n" + "\n".join(lines)


if __name__ == "__main__":
    # Test the scraper
    async def main():
        test_url = "https://n.news.naver.com/article/215/0001242516"  # Example URL
        content = await get_news_content(test_url)
        if content:
            print(content[:500])

    asyncio.run(main())
