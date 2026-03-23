import asyncio
from playwright.async_api import async_playwright
import urllib.parse
import os
import re
import yaml
import json


def load_settings():
    parent_dir = os.path.dirname(os.path.dirname(__file__))
    settings_path = os.path.join(parent_dir, 'config', 'settings.yaml')
    try:
        with open(settings_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception:
        return {}


async def ensure_login(page, engine="google"):
    """
    사용자 규칙에 따른 로그인 관리 로직
    1. 로그인 URL로 이동
    2. 로그인 여부 확인
    3. 필요시 로그인 진행 (세션 저장/불러오기)
    """
    settings = load_settings()
    auth_path = os.path.join(os.getcwd(), f"auth_{engine}.json")

    # 엔진별 로그인 URL 설정
    login_url = settings.get('login_url', 'https://nid.naver.com/nidlogin.login')
    if engine == "google":
        login_url = "https://accounts.google.com/ServiceLogin"
    elif engine == "bing":
        login_url = "https://login.live.com/"

    print(f"[Login] Moving to login URL: {login_url}")
    try:
        await page.goto(login_url, wait_until='domcontentloaded', timeout=10000)
    except:
        pass

    # 로그인 상태 확인 (간단하게 프로필 이미지나 특정 버튼 존재 여부로 판단)
    # 실제로는 엔진별로 다른 셀렉터가 필요하지만, 여기서는 규칙 준수를 위한 구조 구축에 집중
    is_logged_in = False
    try:
        if engine == "google":
            is_logged_in = await page.query_selector("a[href*='SignOut']") is not None
        elif engine == "bing":
            is_logged_in = await page.query_selector("#mste_id_userbar_signout") is not None
    except:
        pass

    if is_logged_in:
        print(f"[Login] Already logged in to {engine}. Saving session...")
        # 세션 저장 (auth.json)
        await page.context.storage_state(path=auth_path)
        return True
    else:
        print(f"[Login] Not logged in to {engine}. Proceeding as guest or attempting login bypass...")
        # 로그인 실패 시 auth.json 지우고 다시 시도 (규칙)
        if os.path.exists(auth_path):
            os.remove(auth_path)
        return False


def clean_keyword(prompt):
    """
    검색어에서 불필요한 문구(장면 1:, 쉼표 이후 설명 등)를 제거하고 핵심 키워드만 추출합니다.
    이미 정제된 키워드(부정어 '-' 포함)가 들어오는 경우 그대로 반환합니다.
    """
    if not prompt:
        return ""

    # [수정] 이미 정제된 키워드(부정어 '-' 포함)가 들어오는 경우, 추가 정제 없이 그대로 사용
    if " -" in prompt:
        return prompt

    # 1. "장면 3: ", "Scene 1:" 등 제거
    cleaned = re.sub(r'(장면|Scene|scene)\s*\d+[:\s]*', '', prompt)

    # 2. 이미지 생성용 기술적 키워드 제거 및 뉴스 관련 키워드 제거 (사용자 요청)
    # [수정] 검색어에서 핵심 명사는 절대 제거하지 않도록 필터링 강화
    tech_keywords = [
        "cinematic lighting", "dramatic atmosphere", "4k", "8k",
        "highly detailed",
        "film grain", "bokeh", "professional cinematography", "photorealistic", 
        "hyperrealistic", "raw photo", "dslr", "85mm lens", "f1.8",
        "soft lighting",
        "sharp focus", "highly detailed texture", "professional photography",
        "trending on artstation", "octane render", "unreal engine", "concept art",
        "digital art", "illustration", "anime style", "studio ghibli", "cel shaded",
        # "of" 는 제거 대상에서 제외 (핵심 명사 연결어일 수 있음)
        # 뉴스룸/기자 관련 키워드 제거
        "newsroom", "studio", "reporter", "journalist", "anchor", "announcer", 
        "news desk", "breaking news", "broadcast", "television station", "tv studio",
        "news set", "anchor desk", "news ticker", "press conference",
        "POV", "first person", "1st person", "point of view", "holding", "hand", "finger", "arm",
        "손", "손가락", "팔", "1인칭", "시점",
        "뉴스룸", "기자", "아나운서", "뉴스 데스크", "방송국", "스튜디오", "앵커",
        "기자 회견", "속보", "뉴스 세트"
    ]
    for tech in tech_keywords:
        cleaned = re.sub(rf'\b{tech}\b', '', cleaned, flags=re.IGNORECASE)

    # 쉼표는 검색어 구분자로 활용 (공백으로 변환)
    cleaned = cleaned.replace(",", " ")

    # 마침표가 문장 끝에 있는 경우 제거 (단, 4.k 등 중간에 있는 경우는 유지)
    if cleaned.endswith("."):
        cleaned = cleaned[:-1]

    # 4. 특수문자 제거 (검색어에 방해되는 기호들, 단 - 는 검색 연산자이므로 유지)
    cleaned = re.sub(r"[\(\)\[\]\{\}\"\']", "", cleaned)

    cleaned = cleaned.strip()

    # 만약 모든 단어가 제거되어 빈 문자열이 되었다면, 원본에서 최소한의 정보만 추출하여 반환
    if not cleaned:
        fallback = prompt.split(',')[0].split('.')[0].split('-')[0].strip()
        fallback = re.sub(r'(장면|Scene|scene)\s*\d+[:\s]*', '', fallback)
        return fallback.strip()

    return cleaned


def _is_bad_image_url(url, keyword):
    """이미지 URL이 부적절한지 (워터마크, 자막, 로고 등) 확인합니다."""
    url_lower = url.lower()

    # 1. 뉴스 도메인 필터링 해제
    # 사용자의 요청에 따라 뉴스 관련 도메인이나 키워드 차단을 하지 않습니다.
    # 단, 워터마크나 자막 등 품질 저하 요소는 계속 필터링할 수 있도록 유지합니다.

    # 2. 이미지 확장자가 없는 경우나 아이콘 등 제외
    if not any(ext in url_lower for ext in [".jpg", ".jpeg", ".png", ".webp"]):
        if "data:image/" not in url_lower:  # Base64는 허용
            return True

    # 3. 특정 키워드 포함 필터링 (품질 위주 + 사용자 요청에 따른 뉴스룸/기자 제외)
    # [수정] 'thumb'은 이미지 검색 썸네일에 흔히 포함되므로 제외
    bad_keywords = [
        "logo", "watermark", "icon", "caption", "subtitle", "label", "credit",
        "자막", "출처", "캡처",
        # 뉴스룸/기자 관련 키워드 (이미지 내용 필터링)
        "newsroom", "studio", "reporter", "journalist", "anchor", "announcer", 
        "newsdesk", "breakingnews", "broadcast", "tvstudio",
        "뉴스룸", "기자", "아나운서", "뉴스데스크", "방송국", "스튜디오", "앵커"
    ]

    # 4. 방송사 로고나 자막이 많은 연예/스포츠 보도 자료 필터링 강화
    # 하지만 "news", "뉴스", "기사" 등은 차단 목록에서 완전히 제외하여 최신 보도 자료 이미지 활용도를 높입니다.
    for bad in bad_keywords:
        if bad in url_lower:
            # 키워드 자체가 검색어에 포함되어 있으면 예외적으로 허용 (예: 'logo design' 검색 시)
            if bad not in keyword.lower():
                print(f"[Filter] Blocking image with bad keyword: {bad} "
                      f"(URL: {url[:60]}...)")
                return True

    return False


# async def get_google_images_list(keyword, count=3, cancel_check=None):
#     """구글 이미지 검색에서 상위 N개의 이미지 URL을 가져옵니다."""
#     if cancel_check and cancel_check():
#         raise InterruptedError("User requested cancellation")
#     # 검색어 정제
#     clean_k = clean_keyword(keyword)
#     if not clean_k: clean_k = keyword

#     try:
#         async with async_playwright() as p:
#             # Force Chrome instead of default Chromium
#             auth_path = os.path.join(os.getcwd(), "auth_google.json")

#             # auth.json 파일이 있으면 불러오기 (규칙)
#             storage_state = auth_path if os.path.exists(auth_path) else None

#             browser = await p.chromium.launch(
#                 headless=True,
#                 args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
#             )
#             context = await browser.new_context(
#                 user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
#                 storage_state=storage_state
#             )
#             page = await context.new_page()

#             # 사용자 규칙: 항상 로그인 URL부터 이동할 것
#             await ensure_login(page, "google")

#             encoded_keyword = urllib.parse.quote(clean_k)
#             # tbm=isch 는 구형 이미지 검색, tbs=islt:l (Large) 등을 추가할 수 있음
#             search_url = f"https://www.google.com/search?q={encoded_keyword}&tbm=isch"

#             try:
#                 # 구글은 'networkidle'이 더 안정적일 때가 있음
#                 await page.goto(search_url, wait_until='networkidle', timeout=15000)
#             except:
#                 try:
#                     await page.goto(search_url, wait_until='domcontentloaded', timeout=15000)
#                 except:
#                     await page.goto(search_url, wait_until='load', timeout=15000)

#             title = await page.title()
#             print(f"[Search] Google page title: {title}")

#             # 구글은 때때로 동의 페이지(Consent)를 보여줌
#             if "Before you continue" in title or "consent" in title.lower() or "동의" in title:
#                 print(f"[Search] Google consent page detected, attempting to bypass...")
#                 try:
#                     # 'Accept all' 버튼 클릭 시도 (다양한 언어/버전 대응)
#                     # m7896, VfPpkd-Lg-Me 등 다양한 클래스 대응
#                     buttons = await page.query_selector_all("button")
#                     for btn in buttons:
#                         text = await btn.inner_text()
#                         if any(x in text.lower() for x in ["accept", "agree", "동의", "수락", "모두 수락"]):
#                             await btn.click()
#                             await page.wait_for_load_state("networkidle", timeout=5000)
#                             break
#                 except:
#                     pass

#             # [수정] 스크롤을 약간 내려서 지연 로딩 이미지들을 활성화
#             await page.evaluate("window.scrollBy(0, 1000)")
#             await asyncio.sleep(2)

#             try:
#                 # 구글 이미지 검색 결과 영역 대기 (더 유연하게)
#                 # rg_i 는 아주 오래된 셀렉터, YQ4gaf 가 최신
#                 # i4WSpb, mB7n9c 등 다양한 클래스 대응
#                 await page.wait_for_selector("img.YQ4gaf, img.rg_i, img.mB7n9c, img.i4WSpb, [data-results-container] img", timeout=10000)
#             except:
#                 print(f"[Search] Google selector timeout for: {clean_k}")
#                 # HTML 구조 분석을 위한 로그
#                 html_snippet = await page.evaluate("document.body.innerHTML.substring(0, 500)")
#                 print(f"[Debug] Google HTML snippet: {html_snippet}...")
#                 pass

#             # 구글 이미지 썸네일 셀렉터 보강
#             # YQ4gaf 가 최신 (G-Image-Grid), mB7n9c 등
#             # [수정] 셀렉터를 더 포괄적으로 변경
#             images = await page.query_selector_all("img.YQ4gaf, img.rg_i, img.mB7n9c, img.i4WSpb, div#islrg img, div.islrc img, [data-results-container] img, img[data-src], img[src*='gstatic'], img[src*='encrypted-tbn0']")
#             print(f"[Search] Google found {len(images)} potential image elements")
#             results = []

#             for img in images:
#                 if cancel_check and cancel_check():
#                     raise InterruptedError("User requested cancellation")
#                 if len(results) >= count:
#                     break
#                 try:
#                     # src뿐만 아니라 data-src (지연 로딩)도 확인
#                     src = await img.get_attribute("src")
#                     data_src = await img.get_attribute("data-src")

#                     # src가 data:image/인 경우 data-src가 있으면 그걸 우선 사용
#                     target_url = src
#                     if not src or src.startswith("data:image/"):
#                         if data_src and data_src.startswith("http"):
#                             target_url = data_src
                    
#                     # [추가] src가 gstatic (thumbnail)인 경우에도 data-src가 원본일 수 있음
#                     if src and "gstatic.com" in src and data_src and data_src.startswith("http"):
#                         target_url = data_src

#                     if not target_url:
#                         continue
                    
#                     # [수정] 썸네일(gstatic)도 결과가 없으면 허용 (사용자가 아예 안 나온다고 했으므로)
#                     if target_url.startswith("http") or target_url.startswith("data:image/"):
#                          if _is_bad_image_url(target_url, keyword):
#                             continue
#                          if target_url not in results:
#                             results.append(target_url)
#                 except:
#                     continue

#             await browser.close()
#             return results
#     except Exception as e:
#         print(f"Playwright error (Google List): {e}")
#         return []


async def get_bing_images_list(keyword, count=3, cancel_check=None):
    """빙 이미지 검색에서 상위 N개의 이미지 URL을 가져옵니다."""
    if cancel_check and cancel_check():
        raise InterruptedError("User requested cancellation")
    # 검색어 정제
    clean_k = clean_keyword(keyword)
    if not clean_k: clean_k = keyword

    try:
        async with async_playwright() as p:
            # Force Chrome instead of default Chromium
            auth_path = os.path.join(os.getcwd(), "auth_bing.json")

            # auth.json 파일이 있으면 불러오기 (규칙)
            storage_state = auth_path if os.path.exists(auth_path) else None

            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
            )
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                storage_state=storage_state
            )
            page = await context.new_page()

            # [수정] Bing 검색 시 불필요한 로그인 단계 제거 (사용자 요청 반영)
            # await ensure_login(page, "bing")

            encoded_keyword = urllib.parse.quote(clean_k)
            search_url = f"https://www.bing.com/images/search?q={encoded_keyword}&first=1&scenario=ImageBasicHover"
            print(f"[Search] Navigating to Bing: {search_url}")

            # networkidle 사용 (단, 타임아웃 15초로 제한)
            try:
                await page.goto(search_url, wait_until='domcontentloaded', timeout=15000)
            except Exception as e:
                print(f"[Search] Bing Navigation timeout/error: {e}")
                await page.goto(search_url, wait_until='load', timeout=10000)

            # [추가] Bing의 경우 종종 'Safe Search'나 다른 팝업이 뜰 수 있음
            try:
                # 'Accept' 버튼이나 'Close' 버튼 등이 있으면 클릭 시도
                popups = await page.query_selector_all("button.b_ad, .b_popup button")
                for btn in popups:
                    await btn.click()
            except:
                pass

            title = await page.title()
            print(f"[Search] Bing page title: {title}")

            # [수정] Bing 검색 시 가끔 팝업이 검색을 가릴 수 있으므로, 
            # 검색 후 명시적으로 메인 컨텐츠 영역이 보일 때까지 대기
            try:
                # 빙 이미지 검색 결과 영역 대기 (더 길게 10초)
                await page.wait_for_selector(".mimg, .iusc, img[data-src]", timeout=10000)
            except:
                print(f"[Search] Bing selector timeout for: {clean_k}")
                # HTML 구조 확인을 위해 바디 클래스 등 출력
                body_class = await page.evaluate("document.body.className")
                print(f"[Debug] Bing body class: {body_class}")
                pass

            # [수정] 스크롤을 여러 번 나누어서 내려서 더 많은 이미지가 로딩되도록 유도
            for _ in range(3):
                await page.evaluate("window.scrollBy(0, 500)")
                await asyncio.sleep(0.5)

            # [수정] 고화질 원본 이미지 URL 추출 로직 강화
            # Bing은 .iusc 클래스의 m 속성에 원본 URL 정보를 JSON으로 담고 있음
            elements = await page.query_selector_all(".iusc")
            results = []

            for el in elements:
                if cancel_check and cancel_check():
                    raise InterruptedError("User requested cancellation")
                if len(results) >= count:
                    break
                try:
                    m_attr = await el.get_attribute("m")
                    if m_attr:
                        import json
                        m_data = json.loads(m_attr)
                        murl = m_data.get("murl") # 원본 이미지 URL
                        if murl and murl.startswith("http") and not _is_bad_image_url(murl, keyword):
                            if murl not in results:
                                results.append(murl)
                except:
                    continue

            # 원본 URL을 충분히 못 찾았을 경우만 기존 썸네일/Base64 로직 사용
            if len(results) < count:
                # [수정] 더 포괄적인 셀렉터 추가
                images = await page.query_selector_all(".mimg, .iusc img, .dgControl img, #mmComponent_images_1 img, #imgid_container img, img[data-src], img.mimg")
                print(f"[Search] Bing found {len(images)} potential image elements (fallback)")

                for img in images:
                    if cancel_check and cancel_check():
                        raise InterruptedError("User requested cancellation")
                    if len(results) >= count:
                        break
                    try:
                        # src, data-src, data-lowres-src 등 다양한 속성 확인
                        src = await img.get_attribute("src")
                        data_src = await img.get_attribute("data-src")
                        data_lowres = await img.get_attribute("data-lowres-src")

                        target_url = src
                        if not src or src.startswith("data:image/"):
                            if data_src and data_src.startswith("http"):
                                target_url = data_src
                            elif data_lowres and data_lowres.startswith("http"):
                                target_url = data_lowres

                        if not target_url or (not target_url.startswith("http") and not target_url.startswith("data:image/")):
                            continue

                        if _is_bad_image_url(target_url, keyword):
                            continue

                        if target_url not in results:
                            results.append(target_url)
                    except:
                        continue

            await browser.close()
            return results
    except Exception as e:
        print(f"Playwright error (Bing List): {e}")
        return []


async def get_duckduckgo_images_list(keyword, count=3, cancel_check=None):
    """덕덕고 이미지 검색에서 상위 N개의 이미지 URL을 가져옵니다 (Playwright 사용)."""
    if cancel_check and cancel_check():
        raise InterruptedError("User requested cancellation")
    # 검색어 정제
    clean_k = clean_keyword(keyword)
    if not clean_k: clean_k = keyword

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
            )
            # User-Agent 설정
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            # 덕덕고 이미지 검색 URL
            search_url = f"https://duckduckgo.com/?q={urllib.parse.quote(clean_k)}&iax=images&ia=images"
            print(f"[Search] Navigating to DDG: {search_url}")
            
            await page.goto(search_url, wait_until='domcontentloaded', timeout=15000)

            try:
                # 이미지 결과 영역 대기
                await page.wait_for_selector(".tile--img__img, .js-images-link img", timeout=10000)
            except:
                print(f"[Search] DDG selector timeout for: {clean_k}")
                pass

            # 스크롤
            for _ in range(2):
                await page.evaluate("window.scrollBy(0, 500)")
                await asyncio.sleep(0.5)

            # 이미지 URL 추출
            images = await page.query_selector_all(".tile--img__img, .js-images-link img, img.tile--img__img")
            print(f"[Search] DDG found {len(images)} potential image elements")
            
            results = []
            for img in images:
                if cancel_check and cancel_check():
                    raise InterruptedError("User requested cancellation")
                if len(results) >= count:
                    break
                try:
                    src = await img.get_attribute("src")
                    data_src = await img.get_attribute("data-src")
                    
                    target_url = src
                    if not src or src.startswith("data:image/"):
                        if data_src and data_src.startswith("http"):
                            target_url = data_src
                    
                    if not target_url or not target_url.startswith("http"):
                        # DDG는 가끔 //proxy-image.duckduckgo.com/ 형태의 URL을 사용함
                        if target_url and target_url.startswith("//"):
                            target_url = "https:" + target_url
                        else:
                            continue

                    if _is_bad_image_url(target_url, keyword):
                        continue

                    if target_url not in results:
                        results.append(target_url)
                except:
                    continue

            await browser.close()
            return results
    except Exception as e:
        print(f"Playwright error (DDG List): {e}")
        return []


# async def get_google_image_high_res(keyword, cancel_check=None):
#     """구글 이미지 검색 (고화질 하나)"""
#     if cancel_check and cancel_check():
#         raise InterruptedError("User requested cancellation")
#     # 검색어 정제
#     clean_k = clean_keyword(keyword)
#     if not clean_k: clean_k = keyword
# 
#     try:
#         async with async_playwright() as p:
#             user_data_dir = os.path.join(os.getcwd(), "chrome_profile")
#             browser = await p.chromium.launch_persistent_context(
#                 user_data_dir,
#                 channel="chrome",
#                 headless=True,
#                 args=['--no-sandbox', '--disable-setuid-sandbox'],
#                 user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
#             )
#             page = await browser.new_page()
# 
#             encoded_keyword = urllib.parse.quote(clean_k)
#             search_url = f"https://www.google.com/search?q={encoded_keyword}&tbm=isch"
# 
#             await page.goto(search_url, wait_until='networkidle')
# 
#             try:
#                 await page.wait_for_selector("div#islrg", timeout=5000)
#             except:
#                 await browser.close()
#                 return None
# 
#             images = await page.query_selector_all("img.rg_i, img.YQ4gaf, div#islrg img")
# 
#             for img in images:
#                 try:
#                     src = await img.get_attribute("src")
#                     if src and src.startswith("http") and "encrypted-tbn0.gstatic.com" not in src:
#                         await browser.close()
#                         return src
#                 except:
#                     continue
# 
#             await browser.close()
#             return None
#     except Exception as e:
#         print(f"Playwright error (Google): {e}")
#         return None


async def get_bing_image_high_res(keyword, cancel_check=None):
    """빙 이미지 검색 (고화질 하나)"""
    if cancel_check and cancel_check():
        raise InterruptedError("User requested cancellation")
    # 검색어 정제
    clean_k = clean_keyword(keyword)
    if not clean_k: clean_k = keyword

    try:
        async with async_playwright() as p:
            auth_path = os.path.join(os.getcwd(), "auth_bing.json")
            storage_state = auth_path if os.path.exists(auth_path) else None

            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
            )
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                storage_state=storage_state
            )
            page = await context.new_page()

            encoded_keyword = urllib.parse.quote(clean_k)
            search_url = f"https://www.bing.com/images/search?q={encoded_keyword}"

            try:
                await page.goto(search_url, wait_until='domcontentloaded', timeout=10000)
            except:
                await page.goto(search_url, wait_until='load', timeout=10000)

            try:
                await page.wait_for_selector(".mimg", timeout=5000)
            except:
                await browser.close()
                return None

            images = await page.query_selector_all(".mimg")

            for img in images:
                try:
                    src = await img.get_attribute("src")
                    if src and src.startswith("http"):
                        await browser.close()
                        return src
                except:
                    continue

            await browser.close()
            return None
    except Exception as e:
        print(f"Playwright error (Bing): {e}")
        return None


def search_image_google(keyword, cancel_check=None):
    """Synchronous wrapper for Google image search"""
    try:
        return asyncio.run(get_google_image_high_res(keyword, cancel_check=cancel_check))
    except Exception as e:
        print(f"Asyncio run error: {e}")
        return None


def search_image_bing(keyword, cancel_check=None):
    """Synchronous wrapper for Bing image search"""
    try:
        return asyncio.run(get_bing_image_high_res(keyword, cancel_check=cancel_check))
    except Exception as e:
        print(f"Asyncio run error: {e}")
        return None


def search_images_google_list(keyword, count=3, cancel_check=None):
    """Synchronous wrapper for Google image list search"""
    try:
        return asyncio.run(get_google_images_list(keyword, count, cancel_check=cancel_check))
    except Exception as e:
        print(f"Asyncio run error (Google List): {e}")
        return []


def search_images_bing_list(keyword, count=3, cancel_check=None):
    """Synchronous wrapper for Bing image list search"""
    try:
        return asyncio.run(get_bing_images_list(keyword, count, cancel_check=cancel_check))
    except Exception as e:
        print(f"Asyncio run error (Bing List): {e}")
        return []
