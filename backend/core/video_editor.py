from moviepy import (
    AudioFileClip, ImageClip, VideoFileClip, concatenate_videoclips, vfx,
    TextClip, CompositeVideoClip, CompositeAudioClip
)
import os
import re
import subprocess
import tempfile
from .config_utils import get_export_dir, load_config


def get_audio_duration(audio_path):
    try:
        if not os.path.exists(audio_path):
            return 0
        with AudioFileClip(audio_path) as audio:
            return audio.duration
    except Exception as e:
        print(f"Error getting audio duration: {e}")
        return 0


def _resize_and_crop(clip, target_size=(1920, 1080)):
    """
    이미지를 대상 해상도에 맞춰 꽉 차게(Crop & Fill) 조정합니다.
    """
    w, h = clip.size
    target_w, target_h = target_size

    # 가로세로 비율 비교
    ratio = w / h
    target_ratio = target_w / target_h

    if ratio > target_ratio:
        # 이미지가 더 넓음 -> 세로를 맞추고 가로를 자름
        new_clip = clip.resized(height=target_h)
        # 중앙 자르기
        center_x = new_clip.w / 2
        new_clip = new_clip.cropped(
            x_center=center_x,
            y_center=target_h / 2,
            width=target_w,
            height=target_h
        )
    else:
        # 이미지가 더 좁음 -> 가로를 맞추고 세로를 자름
        new_clip = clip.resized(width=target_w)
        # 중앙 자르기
        center_y = new_clip.h / 2
        new_clip = new_clip.cropped(
            x_center=target_w / 2,
            y_center=center_y,
            width=target_w,
            height=target_h
        )

    return new_clip


def _resolve_media_path(p):
    """URL(/assets/..., http://localhost:8000/assets/...) → 절대 경로 변환."""
    if not p or not isinstance(p, str):
        return p
    if os.path.exists(p):
        return p
    q = p
    for prefix in ("http://localhost:8000", "http://127.0.0.1:8000"):
        if q.startswith(prefix):
            q = q[len(prefix):]
            break
    q = q.lstrip("/")
    if q.startswith("assets/"):
        q = q[len("assets/"):]
    try:
        from .config_utils import get_asset_dir
    except (ImportError, ValueError):
        from config_utils import get_asset_dir
    candidate = os.path.join(get_asset_dir(), q)
    if os.path.exists(candidate):
        return candidate
    return p


_VIDEO_EXTS = (".mp4", ".webm", ".mov", ".avi", ".mkv")


def _split_media_entry(entry):
    """bg_images 항목 정규화 → (path, trim_in, trim_out, layout).

    entry는 str 경로이거나 {"path":..., "in":..., "out":...,
    "scale":..., "x":..., "y":...} dict. layout은
    {"scale": 배율(1=핏), "x"/"y": 화면 비율 단위 오프셋} 또는 None.
    """
    if isinstance(entry, dict):
        p = entry.get("path", "")
        try:
            tin = float(entry.get("in", 0) or 0)
        except (TypeError, ValueError):
            tin = 0.0
        try:
            tout = entry.get("out", None)
            tout = float(tout) if tout is not None else None
        except (TypeError, ValueError):
            tout = None
        if tin < 0:
            tin = 0.0
        if tout is not None and tout <= tin:
            tout = None
        layout = None
        try:
            s = float(entry.get("scale", 1) or 1)
            x = float(entry.get("x", 0) or 0)
            y = float(entry.get("y", 0) or 0)
        except (TypeError, ValueError):
            s, x, y = 1.0, 0.0, 0.0
        s = min(max(s, 1.0), 3.0)
        x = min(max(x, -0.5), 0.5)
        y = min(max(y, -0.5), 0.5)
        if abs(s - 1.0) > 1e-6 or abs(x) > 1e-6 or abs(y) > 1e-6:
            layout = {"scale": s, "x": x, "y": y}
        return p, tin, tout, layout
    return entry, 0.0, None, None


def _resize_and_fit(clip, target_size=(1920, 1080), duration=None, layout=None,
                    fit_mode='fit', bg_style='blur', bg_color=(0, 0, 0)):
    """전면 배치 + 배경 합성.

    fit_mode='fit': 원본 비율 유지 + 배경 합성 (레터박스 대체).
    fit_mode='fill': 너비를 꽉 채움 (가로 여백 없음). 세로가 넘치면 위아래 크롭,
        모자라면 배경 합성. 세로 출력에서 가로 소스는 fit과 동일.
    fit_mode='crop': 화면을 꽉 채우도록 잘라냄 (여백 없음).
    bg_style: 'blur' (원본 확대 블러) / 'black' / 'color' (bg_color 단색).
    layout={"scale": 배율(>=1), "x"/"y": 화면 비율 단위 오프셋}.
    """
    import numpy as np
    tw, th = int(target_size[0]), int(target_size[1])
    w, h = clip.size
    scale = 1.0
    ox, oy = 0.0, 0.0
    if isinstance(layout, dict):
        try:
            scale = min(max(float(layout.get("scale", 1) or 1), 1.0), 3.0)
            ox = min(max(float(layout.get("x", 0) or 0), -0.5), 0.5)
            oy = min(max(float(layout.get("y", 0) or 0), -0.5), 0.5)
        except (TypeError, ValueError):
            scale, ox, oy = 1.0, 0.0, 0.0
    dur = duration or clip.duration or 1.0
    if fit_mode == 'crop':
        # 화면을 꽉 채우도록 확대 후 중앙(오프셋 반영) 크롭
        s = max(tw / w, th / h) * scale
        fg = clip.resized(height=max(1, int(round(h * s))))
        fw, fh = fg.size  # fw >= tw 보장
        cx = (fw - tw) / 2 - ox * tw
        cy = (fh - th) / 2 - oy * th
        cx = min(max(cx, 0), max(0, fw - tw))
        cy = min(max(cy, 0), max(0, fh - th))
        try:
            cropped = fg.cropped(x1=cx, y1=cy, width=tw, height=th)
        except Exception:
            cropped = fg
        return cropped.with_duration(dur)
    if fit_mode == 'fill':
        # 너비 채우기: 가로 여백을 없앤다. 세로가 넘치면 위아래 크롭.
        s = (tw / w) * scale
        fg = clip.resized(height=max(1, int(round(h * s))))
        fw, fh = fg.size  # fw >= tw 보장
        if fh > th:
            cy = (fh - th) / 2 - oy * th
            cy = min(max(cy, 0), max(0, fh - th))
            try:
                cropped = fg.cropped(x1=0, y1=cy, width=tw, height=th)
            except Exception:
                cropped = fg
            return cropped.with_duration(dur)
        # 세로가 모자라면 아래 배경 합성 경로로 (fg 그대로 사용)
    else:
        s = min(tw / w, th / h) * scale
        nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
        fg = clip.resized(height=nh)
        fw, fh = fg.size
    # 배경 (블러 / 검정 / 단색)
    if bg_style == 'color':
        try:
            bg_rgb = _parse_bg_color(bg_color) or (0, 0, 0)
            if isinstance(bg_rgb, str):
                pass  # hex/색상 이름은 PIL이 직접 처리
            elif isinstance(bg_rgb, (tuple, list)) and len(bg_rgb) >= 3:
                bg_rgb = tuple(int(float(c)) for c in bg_rgb[:3])
            else:
                bg_rgb = (0, 0, 0)
        except Exception:
            bg_rgb = (0, 0, 0)
        import numpy as _np2
        bg = ImageClip(_np2.zeros((th, tw, 3), dtype=_np2.uint8)).with_duration(dur)
        # 단색 채우기: 검정 캔버스 위에 색상 오버레이와 동일 효과
        try:
            from PIL import Image as _PILImage
            bg = ImageClip(_np2.array(_PILImage.new("RGB", (tw, th), bg_rgb))).with_duration(dur)
        except Exception as e:
            print(f"Warning: solid background failed, using black: {e}")
    elif bg_style == 'black':
        bg = ImageClip(np.zeros((th, tw, 3), dtype=np.uint8)).with_duration(dur)
    else:
        bg = None
    if bg is None:
        # 블러 배경 (실패 시 검은 배경)
        try:
            from PIL import Image, ImageFilter
            frame = None
            try:
                src_dur = clip.duration or 0
                t = src_dur / 2 if src_dur > 0.02 else 0
                frame = clip.get_frame(min(max(t, 0), max(src_dur - 0.01, 0)))
            except Exception:
                frame = None
            if frame is None:
                # ImageClip 원본 배열 폴백 (get_frame 실패 시)
                raw = getattr(clip, 'img', None)
                if raw is not None:
                    frame = raw
            if frame is None:
                raise RuntimeError("no frame for blur background")
            img = Image.fromarray(frame).convert("RGB")
            cs = max(tw / img.width, th / img.height)
            bg_img = img.resize(
                (max(1, int(img.width * cs)), max(1, int(img.height * cs))),
                Image.BILINEAR,
            )
            x0 = max(0, (bg_img.width - tw) // 2)
            y0 = max(0, (bg_img.height - th) // 2)
            bg_img = bg_img.crop((x0, y0, x0 + tw, y0 + th)).filter(
                ImageFilter.GaussianBlur(25)
            )
            bg = ImageClip(np.array(bg_img)).with_duration(dur)
        except Exception as e:
            print(f"Warning: Blur background failed, using black: {e}")
            bg = ImageClip(np.zeros((th, tw, 3), dtype=np.uint8)).with_duration(dur)
    px = (tw - fw) / 2 + ox * tw
    py = (th - fh) / 2 + oy * th
    comp = CompositeVideoClip(
        [bg, fg.with_position((px, py))], size=(tw, th)
    ).with_duration(dur)
    return comp
# 장면마다 줌인/줌아웃/좌우 팬을 순환 적용해 스틸 이미지에 카메라 움직임을 부여합니다.
_KENBURNS_EFFECTS = ("zoom_in", "zoom_out", "pan_lr", "pan_rl")
_KENBURNS_ZOOM_RANGE = 0.12  # 줌 배율 변화폭 (1.0 <-> 1.12, 방송용으로 은은하게)


def _get_ffmpeg_exe():
    """시스템 ffmpeg 우선, 없으면 imageio-ffmpeg 내장 바이너리 사용."""
    import shutil
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def _render_kenburns_clip(img_path, duration, target_size, effect, fps, tmpdir):
    """단일 이미지를 Ken Burns 효과가 적용된 임시 mp4로 렌더링. 실패 시 예외 발생."""
    tw, th = int(target_size[0]), int(target_size[1])
    import math
    # 올림으로 프레임 수를 잡아야 요청 길이보다 짧아지지 않음 (싱크 드리프트 방지)
    frames = max(1, int(math.ceil(duration * fps)))
    zr = _KENBURNS_ZOOM_RANGE

    # 입력 analytical: 2배로 키워 crop (zoompan 떨림 방지)
    uw, uh = tw * 2, th * 2
    if effect == "zoom_in":
        z_expr, x_expr, y_expr = f"1+{zr}*on/{frames}", "(iw-iw/zoom)/2", "(ih-ih/zoom)/2"
    elif effect == "zoom_out":
        z_expr, x_expr, y_expr = f"{1 + zr}-{zr}*on/{frames}", "(iw-iw/zoom)/2", "(ih-ih/zoom)/2"
    elif effect == "pan_lr":
        z_expr, x_expr, y_expr = f"{1 + zr}", f"(iw-iw/zoom)*on/{frames}", "(ih-ih/zoom)/2"
    else:  # pan_rl
        z_expr, x_expr, y_expr = f"{1 + zr}", f"(iw-iw/zoom)*(1-on/{frames})", "(ih-ih/zoom)/2"

    vf = (
        f"scale={uw}:{uh}:force_original_aspect_ratio=increase,"
        f"crop={uw}:{uh},"
        f"zoompan=z='{z_expr}':x='{x_expr}':y='{y_expr}':d={frames}:s={tw}x{th}:fps={fps}"
    )
    fd, tmp_path = tempfile.mkstemp(prefix="kb_", suffix=".mp4", dir=tmpdir)
    os.close(fd)
    cmd = [
        _get_ffmpeg_exe(), "-y",
        "-loop", "1", "-framerate", str(fps), "-i", img_path,
        "-vf", vf,
        "-frames:v", str(frames),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
        "-pix_fmt", "yuv420p",
        tmp_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=duration * 10 + 90)
    except subprocess.TimeoutExpired:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"Ken Burns render timeout ({effect})")
    if proc.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        err = (proc.stderr or "")[-500:]
        raise RuntimeError(f"Ken Burns render failed ({effect}): {err}")
    return tmp_path


def _make_bg_clip(img_path, duration, target_size, effect_idx, fps, tmpdir, tmp_files, kb_enabled, trim_in=0.0, trim_out=None, layout=None,
                  fit_mode='fit', bg_style='blur', bg_color=(0, 0, 0), fit_zoom=1.0):
    """배경 클립 생성. Ken Burns 실패/비활성 시 핏(fit)/필(fill)/크롭 방식으로 폴백.

    trim_in/trim_out: 영상 소스 내 사용할 구간(초). out이 None이면 in+duration까지.
    layout: {"scale","x","y"} 전면 배치 조정. None이면 중앙 핏.
    fit_mode: 'fit'(원본 비율+배경) / 'fill'(너비 채우기) / 'crop'(꽉 채우기).
    fit_zoom: 전역 확대 배율(1.0~2.0). layout scale과 곱해진다. 1 초과 시 KB 생략.
    crop이면 KB 없이 커버.
    """
    try:
        _fz = float(fit_zoom or 1.0)
    except (TypeError, ValueError):
        _fz = 1.0
    _fz = min(max(_fz, 1.0), 2.0)
    if isinstance(layout, dict):
        try:
            _ls = float(layout.get("scale", 1) or 1)
        except (TypeError, ValueError):
            _ls = 1.0
        layout = {**layout, "scale": _ls * _fz}
    elif _fz > 1.0:
        layout = {"scale": _fz, "x": 0, "y": 0}
    _use_kb = bool(kb_enabled) and _fz <= 1.01
    img_path = _resolve_media_path(img_path)
    # 동영상 배경: 트림 구간 추출 후 길이 맞춤(루프/자름) + 리사이즈, Ken Burns 불필요
    if isinstance(img_path, str) and img_path.lower().endswith(_VIDEO_EXTS):
        try:
            vclip = VideoFileClip(img_path)
            start = max(0.0, trim_in or 0.0)
            if vclip.duration and start >= vclip.duration:
                start = 0.0
            end = trim_out if (trim_out is not None and trim_out > start) else None
            if end is not None and vclip.duration:
                end = min(end, vclip.duration)
            if start > 0 or end is not None:
                vclip = vclip.subclipped(start, end) if end is not None else vclip.subclipped(start)
            if vclip.duration and vclip.duration >= duration:
                vclip = vclip.subclipped(0, duration)
            else:
                import math
                n = max(2, math.ceil(duration / (vclip.duration or duration)))
                vclip = concatenate_videoclips([vclip] * n).subclipped(0, duration)
            vclip = _resize_and_fit(vclip, target_size, duration, layout,
                                      fit_mode=fit_mode, bg_style=bg_style, bg_color=bg_color)
            print(f"DEBUG: Video background used: {os.path.basename(img_path)} (trim {start}-{end})")
            return vclip
        except Exception as e:
            print(f"Warning: Video background failed, trying first frame: {e}")
            try:
                tmp = VideoFileClip(img_path)
                frame = tmp.get_frame(0)
                tmp.close()
                clip = ImageClip(frame).with_duration(duration)
                return _resize_and_fit(clip, target_size, duration, layout,
                                       fit_mode=fit_mode, bg_style=bg_style, bg_color=bg_color)
            except Exception as e2:
                print(f"Warning: First-frame fallback failed: {e2}")
                raise
    if _use_kb and fit_mode != 'crop' and duration >= 1.0:
        effect = _KENBURNS_EFFECTS[effect_idx % len(_KENBURNS_EFFECTS)]
        try:
            tmp_path = _render_kenburns_clip(img_path, duration, target_size, effect, fps, tmpdir)
            tmp_files.append(tmp_path)
            clip = VideoFileClip(tmp_path)
            # 프레임 단위 반올림 오차를 잘라 정확한 길이로 맞춤 (누적 싱크 방지)
            if clip.duration and clip.duration > duration + 1e-3:
                clip = clip.subclipped(0, duration)
            print(f"DEBUG: Ken Burns applied ({effect}) to {os.path.basename(img_path)}")
            return clip
        except Exception as e:
            print(f"Warning: Ken Burns failed, using static image: {e}")
    clip = ImageClip(img_path)
    clip = clip.with_duration(duration)
    clip = _resize_and_fit(clip, target_size, duration, layout,
                           fit_mode=fit_mode, bg_style=bg_style, bg_color=bg_color)
    return clip


def parse_srt(srt_path=None, srt_content=None):
    """SRT 파일 또는 내용을 파싱하여 (start, end, text) 리스트를 반환합니다."""
    content = ""
    if srt_content:
        content = srt_content
    elif srt_path and os.path.exists(srt_path):
        with open(srt_path, 'r', encoding='utf-8') as f:
            content = f.read()

    if not content:
        return []
    pattern = re.compile(
        r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n'
        r'(.*?)(?=\n\n|\n$|$)',
        re.DOTALL
    )
    matches = pattern.findall(content)

    def time_to_seconds(t_str):
        h, m, s_ms = t_str.split(':')
        s, ms = s_ms.split(',')
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    subtitles = []
    for m in matches:
        start = time_to_seconds(m[1])
        end = time_to_seconds(m[2])
        text = m[3].replace('\n', ' ').strip()
        subtitles.append((start, end, text))

    return subtitles


def _parse_bg_color(value):
    """프론트 자막 bg_color('transparent' / '#hex' / 'rgba(r,g,b,a)')를
    Pillow(moviepy TextClip)가 받는 형식으로 변환. 배경 없음이면 None.

    Pillow는 CSS식 'rgba(0,0,0,0.7)' 문자열을 받지 못해(ValueError) 튜플로 변환한다.
    """
    if not value:
        return None
    if isinstance(value, (tuple, list)):
        return tuple(value)
    s = str(value).strip()
    if not s or s.lower() == 'transparent':
        return None
    m = re.match(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$', s, re.IGNORECASE)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a = m.group(4)
        if a is None:
            return (r, g, b)
        try:
            af = float(a)
        except ValueError:
            af = 1.0
        alpha = int(af * 255) if af <= 1.0 else int(min(af, 255))
        return (r, g, b, max(0, min(alpha, 255)))
    return s


def _ck_char_width(ch, font_size):
    """한글/한자/전각 = 전각(1.0), 그 외 반각(0.55), 공백(0.35).
    기존 0.7 일괄 추정은 한글에서 과소평가라 줄이 넘치고
    PIL caption이 단어 중간을 끊었다 ('만드/는' 사고의 원인)."""
    o = ord(ch)
    if ch == ' ':
        return font_size * 0.35
    if (0x1100 <= o <= 0x11FF) or (0x3130 <= o <= 0x318F) or (0xAC00 <= o <= 0xD7A3) \
            or (0x4E00 <= o <= 0x9FFF) or (0x3040 <= o <= 0x30FF) \
            or (0xFF00 <= o <= 0xFFEF) or (0x3000 <= o <= 0x303F):
        return font_size * 1.0
    return font_size * 0.55


def _wrap_keep_all(text, font_size, max_width, max_lines=2):
    """어절(keep-all) 줄바꿈: 단어를 절대 쪼개지 않고(긴 URL만 예외),
    마지막 줄 외톨이 1어절이면 윗줄에서 한 어절 내려 균등 배분한다.
    자막 wrap_text와 캡션 _cap_wrap이 함께 쓰는 단일 구현.
    명시적 줄바꿈(\\n)은 그대로 보존하고 줄마다 독립적으로 감는다.
    (상단 밴드가 재료+분량 목록을 여러 줄로 표시할 수 있어야 한다)

    max_lines: 어절만 줄여 max_lines를 넘으면 글자를 줄여 맞춘다.
    값이 None이면 줄 수를 강제하지 않는다(기존 동작)."""
    raw = (text or '').replace('\r\n', '\n').replace('\r', '\n')
    if not raw.strip():
        return ''
    try:
        fs = max(1.0, float(font_size))
    except (TypeError, ValueError):
        fs = 20.0

    def _wrap_all(limit):
        try:
            lim = max(1.0, float(limit))
        except (TypeError, ValueError):
            lim = 10 ** 9
        space_w = fs * 0.35

        def _wsum(w):
            return sum(_ck_char_width(c, fs) for c in w)

        def _wrap_segment(seg):
            words = seg.split()
            if not words:
                return []
            lines, cur, cur_w = [], [], 0.0
            for wd in words:
                ww = _wsum(wd)
                if ww > lim:
                    if cur:
                        lines.append(' '.join(cur))
                        cur, cur_w = [], 0.0
                    part, pw = '', 0.0
                    for ch in wd:
                        cw = _ck_char_width(ch, fs)
                        if part and pw + cw > lim:
                            lines.append(part)
                            part, pw = '', 0.0
                        part += ch
                        pw += cw
                    if part:
                        cur, cur_w = [part], pw
                    continue
                add = ww if not cur else space_w + ww
                if cur and cur_w + add > lim:
                    lines.append(' '.join(cur))
                    cur, cur_w = [wd], ww
                else:
                    cur.append(wd)
                    cur_w += add
            if cur:
                lines.append(' '.join(cur))

            # 외톨이 뒷줄 해소: 마지막 줄이 1어절(또는 4자 이하)이면 윗줄 끝어절을 내려보냄.
            # 내려간 줄이 폭 제한을 넘으면 원복하고 중단한다 (오버플로 0 보장).
            while len(lines) >= 2:
                last_toks = lines[-1].split()
                if len(last_toks) != 1 and len(lines[-1]) > 4:
                    break
                prev_toks = lines[-2].split()
                if len(prev_toks) <= 1:
                    break
                moved = prev_toks.pop()
                new_last = moved + ' ' + lines[-1]
                if _wsum(new_last) > lim:
                    break
                lines[-2] = ' '.join(prev_toks)
                lines[-1] = new_last
                if not lines[-2]:
                    lines.pop(-2)
                    break
            return lines

        out = []
        for seg in raw.split('\n'):
            out.extend(_wrap_segment(seg) if seg.strip() else [''])
        return out

    lines = _wrap_all(max_width * 0.94 if max_width else max_width)

    if max_lines and len(lines) > max_lines:
        # 어절만으로는 줄 수를 못 맞추므로 폰트를 줄인다. 의미 단위가 쪼개지지
        # 않아서 읽는 사람 입장에서 자연스럽다(사용자 보고: '고기를 냄비에 넣고 까지').
        for _ in range(14):
            fs *= 0.92
            if fs < 8:
                break
            cand = _wrap_all(max_width * 0.94 if max_width else max_width)
            if len(cand) <= max_lines:
                lines = cand
                break
    return '\n'.join(lines)


def _fade_mask_in(clip, d):
    """마스크 페이드인 (자막/캡션/스티커 등장용). moviepy 내장 FadeIn은
    마스크가 아니라 색상을 페이드해서 흰 자막에 먹지 않으므로 직접 구현."""
    try:
        m = getattr(clip, 'mask', None)
        if m is None:
            return clip
        faded = m.transform(lambda gf, t, _d=d: gf(t) * (min(1.0, t / _d) if t < _d else 1.0))
        return clip.with_mask(faded)
    except Exception as e:
        print(f"Warning: fade animation failed: {e}")
        return clip


def _pulse_clip(clip, period=0.8):
    """불투명 펄스 (강조용)."""
    try:
        import numpy as _np
        m = getattr(clip, 'mask', None)
        if m is None:
            return clip
        pulsed = m.transform(
            lambda gf, t, _p=period: gf(t) * (0.65 + 0.35 * (0.5 + 0.5 * _np.sin(2 * _np.pi * t / _p)))
        )
        return clip.with_mask(pulsed)
    except Exception as e:
        print(f"Warning: pulse animation failed: {e}")
        return clip


def _typewriter_clip(clip, reveal=0.6):
    """타이핑 reveal (왼쪽→오른쪽 마스크 와이프)."""
    try:
        import numpy as _np
        m = getattr(clip, 'mask', None)
        if m is None:
            return clip
        w, h = m.size
        xx = _np.tile(_np.linspace(0, 1, max(1, w), dtype=_np.float64), (max(1, h), 1))
        feather = 0.06

        def _wipe(gf, t, _xx=xx, _r=reveal):
            p = min(1.0, t / _r) if t < _r else 1.0
            lo, hi = p - feather, p + feather
            wmask = _np.clip((hi - _xx) / max(1e-6, hi - lo), 0, 1)
            return gf(t) * wmask

        return clip.with_mask(m.transform(_wipe))
    except Exception as e:
        print(f"Warning: typewriter animation failed: {e}")
        return clip


def _apply_text_animation(clip, anim, duration):
    """none/fade/slide/pulse/typing 중 하나를 텍스트 클립에 적용."""
    anim = str(anim or 'none').lower()
    if anim == 'fade':
        return _fade_mask_in(clip, max(0.1, min(0.4, duration * 0.3)))
    if anim == 'pulse':
        return _pulse_clip(clip)
    if anim == 'typing':
        return _typewriter_clip(clip, reveal=max(0.2, min(0.8, duration * 0.4)))
    return clip


def _filter_effects(name):
    """필터명 → with_effects용 이펙트 리스트."""
    n = str(name or 'none').lower()
    if n == 'bw':
        return [vfx.BlackAndWhite()]
    if n == 'vivid':
        return [vfx.LumContrast(contrast=20)]
    if n == 'bright':
        return [vfx.GammaCorrection(0.8)]
    if n == 'cinematic':
        return [vfx.GammaCorrection(1.15), vfx.LumContrast(contrast=10)]
    return []


def assemble_final_video(
    audio_path, srt_path, bg_images, output_path,
    subtitle_style=None, audio_edit=None, edited_srt=None,
    aspect_ratio="16:9 (Youtube)",  # 추가
    scene_captions=None,  # [{start, end, text}] 씬별 상단 자막 밴드 (나레이션 자막과 별도 스타일)
    caption_style=None,  # {font_size, color, bg_color, y_offset} 상단 밴드 스타일
    transition=None,  # {type: 'none'|'crossfade', duration: 초} 장면 전환
    video_filter="none",  # 전체 컬러 필터: none/bw/vivid/bright/cinematic
    scene_filters=None,  # 장면별 필터: {sceneIdx: filterName}
    stickers=None,  # 스티커 오버레이: [{text, start, end, y_pct, size, color}]
    media_fit='fit',  # 전역 미디어 맞춤: fit(원본 유지) / fill(너비 채우기) / crop(꽉 채우기)
    scene_fits=None,  # 장면별 맞춤 오버라이드: {sceneIdx: 'fit'|'fill'|'crop'}
    bg_style='blur',  # 배경 처리: blur / black / color
    bg_color=(0, 0, 0),  # bg_style=color 일 때 단색 (hex/rgba 문자열도 허용)
    fit_zoom=1.0,  # 전역 확대 배율 (1.0~2.0, fit/fill에서 "약간 더 차게")
    progress_callback=None, cancel_check=None
):
    # 배경색 정규화 (문자열 허용)
    _bg_color = _parse_bg_color(bg_color)
    if _bg_color is None:
        _bg_color = (0, 0, 0)
    if isinstance(_bg_color, (tuple, list)) and len(_bg_color) >= 3:
        _bg_color = tuple(_bg_color[:3])
    _bg_style = str(bg_style or 'blur').lower()
    if _bg_style not in ('blur', 'black', 'color'):
        _bg_style = 'blur'
    _media_fit = str(media_fit or 'fit').lower()
    if _media_fit not in ('fit', 'fill', 'crop'):
        _media_fit = 'fit'
    _fits_map = scene_fits if isinstance(scene_fits, dict) else {}

    try:
        _fit_zoom = float(fit_zoom or 1.0)
    except (TypeError, ValueError):
        _fit_zoom = 1.0
    _fit_zoom = min(max(_fit_zoom, 1.0), 2.0)

    def _scene_fit(idx):
        v = str(_fits_map.get(idx, _fits_map.get(str(idx), '')) or '').lower()
        return v if v in ('fit', 'fill', 'crop') else _media_fit
    """
    오디오, 자막, 배경 이미지를 합쳐 최종 영상을 생성합니다.
    subtitle_style: {
        preset, font, font_size, color, stroke_color,
        stroke_width, bg_color, y_offset, show_subtitles
    }
    audio_edit: {bgm_path, bgm_volume, sfx_list: [{path, time, volume}]}
    edited_srt: 직접 수정한 SRT 내용 (문자열)
    aspect_ratio: "16:9 (Youtube)", "9:16 (Shorts)", etc.
    """
    try:
        from .visual_engine import ASPECT_RATIOS
        
        # 오디오 파일 로드
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        main_audio = AudioFileClip(audio_path)
        total_duration = main_audio.duration

        # 1. 오디오 편집 (BGM, SFX 추가)
        if progress_callback:
            progress_callback(5, "오디오 리소스를 준비하고 있습니다...")

        audio_clips = [main_audio]
        # ... (생략 가능하지만 전체 로직 유지를 위해 그대로 둠)

        if audio_edit:
            # BGM 추가
            bgm_path = audio_edit.get('bgm_path')
            # 상대 경로인 경우 절대 경로로 변환 시도
            if bgm_path and not os.path.isabs(bgm_path):
                from .config_utils import get_asset_dir
                bgm_path = os.path.join(
                    get_asset_dir(), bgm_path.replace('assets/', '')
                )

            if bgm_path and os.path.exists(bgm_path):
                if progress_callback:
                    progress_callback(
                        7,
                        f"배경 음악을 로드하고 있습니다: "
                        f"{os.path.basename(bgm_path)}"
                    )
                bgm = AudioFileClip(bgm_path).with_volume_scaled(
                    audio_edit.get('bgm_volume', 0.2)
                )
                # 영상 길이에 맞춰 루프하거나 자름
                if bgm.duration < total_duration:
                    bgm = bgm.with_duration(total_duration).fx(vfx.loop)
                else:
                    bgm = bgm.subclipped(0, total_duration)
                audio_clips.append(bgm)

            # SFX 추가
            sfx_list = audio_edit.get('sfx_list', [])
            for s_idx, sfx_info in enumerate(sfx_list):
                if progress_callback and len(sfx_list) > 0:
                    progress_callback(
                        7 + int((s_idx / len(sfx_list)) * 5),
                        f"효과음을 준비 중입니다 ({s_idx+1}/{len(sfx_list)})"
                    )
                
                sfx_path = sfx_info.get('path')
                # 상대 경로인 경우 절대 경로로 변환 시도
                if sfx_path and not os.path.isabs(sfx_path):
                    from .config_utils import get_asset_dir
                    sfx_path = os.path.join(
                        get_asset_dir(), sfx_path.replace('assets/', '')
                    )

                if sfx_path and os.path.exists(sfx_path):
                    sfx = AudioFileClip(sfx_path).with_volume_scaled(
                        sfx_info.get('volume', 1.0)
                    )
                    start_time = sfx_info.get('time', 0)
                    if start_time < total_duration:
                        sfx = sfx.with_start(start_time)
                        audio_clips.append(sfx)

        if len(audio_clips) > 1:
            final_audio = CompositeAudioClip(audio_clips)
        else:
            final_audio = main_audio

        if progress_callback:
            progress_callback(15, "영상 트랙 리소스를 준비하고 있습니다...")

        # 2. 이미지 클립 생성
        clips = []
        scene_groups: dict = {}
        if not bg_images:
            raise ValueError("No background images provided")

        # [수정] aspect_ratio에 따른 대상 해상도 설정
        target_size = ASPECT_RATIOS.get(aspect_ratio, (1280, 720))
        # 만약 (1280, 720) 처럼 작다면 고품질을 위해 1.5배 스케일링 (1920x1080급)
        if target_size[0] < 1920 and target_size[1] < 1920:
            if target_size[0] > target_size[1]: # Landscape
                scale = 1920 / target_size[0]
            else: # Portrait
                scale = 1920 / target_size[1]
            target_size = (int(target_size[0] * scale), int(target_size[1] * scale))

        # Ken Burns 설정 로드 (video_settings.kenburns / fps)
        try:
            _vconf = (load_config().get('video_settings', {}) or {})
        except Exception:
            _vconf = {}
        kb_enabled = _vconf.get('kenburns', True)
        fps = int(_vconf.get('fps', 24) or 24)
        kb_tmpdir = os.path.join(get_export_dir(), ".kb_tmp")
        os.makedirs(kb_tmpdir, exist_ok=True)
        kb_tmp_files = []
        if kb_enabled:
            print(f"DEBUG: Ken Burns enabled (fps={fps})")
        else:
            print("DEBUG: Ken Burns disabled, using static images")

        print(f"DEBUG: Rendering video with aspect_ratio: {aspect_ratio}, size: {target_size}")
        print(f"DEBUG: Received bg_images type: {type(bg_images)}, length: {len(bg_images)}")
        if len(bg_images) > 0:
            print(f"DEBUG: First bg_image element: {bg_images[0]}")

        # bg_images가 [(paths, duration), ...] 또는 [paths, ...] 형식인지 확인
        # paths는 단일 경로(str)이거나 경로 리스트(List[str])일 수 있음
        def check_has_durations(data):
            if not data or not isinstance(data, list):
                return False
            first = data[0]
            # [ ["path1", "path2"], 5.0 ] 또는 [ "path1", 5.0 ] 형식인지 확인
            return (
                isinstance(first, (tuple, list)) and 
                len(first) == 2 and 
                (isinstance(first[1], (int, float)))
            )

        has_durations = check_has_durations(bg_images)
        print(f"DEBUG: bg_images format has_durations={has_durations}")

        if not has_durations:
            duration_per_scene = total_duration / len(bg_images)
            for idx, scene_visuals in enumerate(bg_images):
                if progress_callback:
                    p = 20 + int((idx / len(bg_images)) * 10)
                    progress_callback(p, f"영상 장면을 구성하고 있습니다... ({idx+1}/{len(bg_images)})")

                if cancel_check and cancel_check():
                    raise InterruptedError("User requested cancellation")
                
                # scene_visuals가 리스트인 경우와 단일 문자열인 경우 모두 대응
                paths = scene_visuals if isinstance(scene_visuals, list) else [scene_visuals]
                if not paths: 
                    print(f"DEBUG: Scene {idx} has no images, using placeholder")
                    continue
                
                duration_per_image = duration_per_scene / len(paths)
                # 클립당 최소 노출 가드 (이미지 2.5초 / 영상 1.5초):
                # 씬 길이는 오디오 기준 고정이라 균등 분할을 유지하고,
                # 기준 미달이면 로그로 남긴다 (프론트에서 추가 차단).
                _has_vid = any(
                    (e if isinstance(e, str) else (e.get('path', '') if isinstance(e, dict) else '')).lower().endswith(('.mp4', '.webm', '.mov'))
                    for e in paths
                )
                _min_need = 1.5 if _has_vid else 2.5
                if duration_per_image < _min_need:
                    print(f"[Scene {idx}] Short clips: {duration_per_image:.1f}s each ({len(paths)} clips in {duration_per_scene:.1f}s scene)")
                for entry in paths:
                    img_path, trim_in, trim_out, layout = _split_media_entry(entry)
                    resolved = _resolve_media_path(img_path)
                    if resolved and os.path.exists(resolved):
                        try:
                            clip = _make_bg_clip(
                                resolved, duration_per_image, target_size,
                                idx, fps, kb_tmpdir, kb_tmp_files, kb_enabled,
                                trim_in, trim_out, layout,
                                fit_mode=_scene_fit(idx), bg_style=_bg_style, bg_color=_bg_color,
                                fit_zoom=_fit_zoom
                            )
                            clips.append(clip)
                            scene_groups.setdefault(idx, []).append(clip)
                        except Exception as e:
                            print(f"Error: Failed to process image {img_path}: {e}")
                    else:
                        print(f"Warning: Image path does not exist: {img_path}")
        else:
            current_time_acc = 0
            for idx, (scene_visuals, duration) in enumerate(bg_images):
                if progress_callback:
                    p = 20 + int((idx / len(bg_images)) * 10)
                    progress_callback(p, f"영상 장면을 구성하고 있습니다... ({idx+1}/{len(bg_images)})")

                if cancel_check and cancel_check():
                    raise InterruptedError("User requested cancellation")

                paths = scene_visuals if isinstance(scene_visuals, list) else [scene_visuals]
                if not paths: 
                    print(f"DEBUG: Scene {idx} has no images, duration: {duration}")
                    current_time_acc += duration
                    continue
                
                duration_per_image = duration / len(paths)
                _has_vid2 = any(
                    (e if isinstance(e, str) else (e.get('path', '') if isinstance(e, dict) else '')).lower().endswith(('.mp4', '.webm', '.mov'))
                    for e in paths
                )
                if duration_per_image < (1.5 if _has_vid2 else 2.5):
                    print(f"[Scene {idx}] Short clips: {duration_per_image:.1f}s each ({len(paths)} clips in {duration:.1f}s scene)")
                for entry in paths:
                    img_path, trim_in, trim_out, layout = _split_media_entry(entry)
                    resolved = _resolve_media_path(img_path)
                    if resolved and os.path.exists(resolved):
                        try:
                            clip = _make_bg_clip(
                                resolved, duration_per_image, target_size,
                                idx, fps, kb_tmpdir, kb_tmp_files, kb_enabled,
                                trim_in, trim_out, layout,
                                fit_mode=_scene_fit(idx), bg_style=_bg_style, bg_color=_bg_color,
                                fit_zoom=_fit_zoom
                            )
                            # concatenate 대신 start_time을 지정하여 Composite에 넣을 수도 있지만
                            # 여기서는 순서대로 concatenate 하기 위해 clips에 추가
                            clips.append(clip)
                            scene_groups.setdefault(idx, []).append(clip)
                            current_time_acc += duration_per_image
                        except Exception as e:
                            print(f"Error: Failed to process image {img_path}: {e}")
                            current_time_acc += duration_per_image
                    else:
                        print(f"Warning: Image path does not exist: {img_path}")
                        current_time_acc += duration_per_image

        if progress_callback:
            progress_callback(30, "자막 트랙을 준비하고 있습니다...")

        # [수정] 이미지가 하나도 없는 경우 폴백 이미지(검은 화면) 생성
        if not clips:
            print("Warning: No valid image clips created. Using black background.")
            import numpy as np
            
            # 검은색 배경 이미지 생성
            black_img = np.zeros((target_size[1], target_size[0], 3), dtype=np.uint8)
            black_clip = ImageClip(black_img).with_duration(total_duration)
            clips.append(black_clip)

        bg_video = concatenate_videoclips(clips, method="compose")

        if bg_video.duration < total_duration:
            last_frame = clips[-1].with_duration(
                total_duration - bg_video.duration
            )
            bg_video = concatenate_videoclips([bg_video, last_frame])
        elif bg_video.duration > total_duration:
            bg_video = bg_video.subclipped(0, total_duration)

        # 장면 전환 (크로스페이드) + 장면별 필터: 씬 그룹 단위로 처리.
        # 전환은 각 그룹 꼬리를 x초 얼린 뒤 겹쳐 붙이므로 전체 길이는 그대로 유지되고
        # 자막/오디오 절대 시간도 어긋나지 않는다.
        try:
            _trans = transition if isinstance(transition, dict) else {}
            _trans_on = (_trans.get('type', 'none') == 'crossfade')
            try:
                _trans_x = float(_trans.get('duration', 0.5) or 0)
            except (TypeError, ValueError):
                _trans_x = 0.0
            _ordered = [scene_groups[k] for k in sorted(scene_groups.keys()) if scene_groups.get(k)]
            _scene_keys = sorted([k for k in scene_groups.keys() if scene_groups.get(k)])
            _sf = scene_filters if isinstance(scene_filters, dict) else {}
            _has_scene_filter = any(str(_sf.get(k, 'none') or 'none').lower() != 'none' for k in _scene_keys)
            if (_trans_on and len(_ordered) > 1 and _trans_x > 0.05) or _has_scene_filter:
                _groups = []
                for _gi2, _g in enumerate(_ordered):
                    _gc = concatenate_videoclips(_g, method="compose") if len(_g) > 1 else _g[0]
                    _fname = str(_sf.get(_scene_keys[_gi2], 'none') or 'none').lower()
                    _fx = _filter_effects(_fname)
                    if _fx:
                        try:
                            _gc = _gc.with_effects(_fx)
                            print(f"DEBUG: scene {_scene_keys[_gi2]} filter: {_fname}")
                        except Exception as _fe2:
                            print(f"Warning: scene filter failed ({_fname}): {_fe2}")
                    _groups.append(_gc)
                _min_d = min([(g.duration or 0) for g in _groups])
                if _trans_on and len(_groups) > 1 and _trans_x > 0.05 and _min_d > 0:
                    _trans_x = min(_trans_x, 1.0, max(0.05, _min_d / 2))
                    import numpy as _np
                    _ext = []
                    _ok = True
                    for _gi, _g in enumerate(_groups):
                        if _gi < len(_groups) - 1:
                            try:
                                _tail = _g.get_frame(max(0, (_g.duration or 0) - 0.05))
                                _freeze = ImageClip(_np.array(_tail)).with_duration(_trans_x)
                                _g = concatenate_videoclips([_g, _freeze])
                            except Exception as _te:
                                print(f"Warning: transition tail failed for scene {_gi}: {_te}")
                                _ok = False
                                break
                        _ext.append(_g)
                    if _ok:
                        _pos = [_ext[0].with_start(0)]
                        _t_acc = (_ext[0].duration or 0) - _trans_x
                        for _g in _ext[1:]:
                            _pos.append(_g.with_start(_t_acc).with_effects([vfx.CrossFadeIn(_trans_x)]))
                            _t_acc += (_g.duration or 0) - _trans_x
                        bg_video = CompositeVideoClip(_pos, size=target_size).with_duration(total_duration)
                        print(f"DEBUG: crossfade transition applied (x={_trans_x:.2f}s, {len(_groups)} scenes)")
                    else:
                        bg_video = concatenate_videoclips(_groups, method="compose")
                        if (bg_video.duration or 0) < total_duration:
                            _lf = _groups[-1].with_duration(total_duration - (bg_video.duration or 0))
                            bg_video = concatenate_videoclips([bg_video, _lf])
                        elif (bg_video.duration or 0) > total_duration:
                            bg_video = bg_video.subclipped(0, total_duration)
                elif _has_scene_filter:
                    bg_video = concatenate_videoclips(_groups, method="compose")
                    if (bg_video.duration or 0) < total_duration:
                        _lf = _groups[-1].with_duration(total_duration - (bg_video.duration or 0))
                        bg_video = concatenate_videoclips([bg_video, _lf])
                    elif (bg_video.duration or 0) > total_duration:
                        bg_video = bg_video.subclipped(0, total_duration)
        except Exception as _tre:
            print(f"Warning: transition/scene-filter failed, using plain cuts: {_tre}")

        # 전체 컬러 필터 (배경 비디오에만 적용, 자막은 영향 없음)
        try:
            _vf = str(video_filter or 'none').lower()
            if _vf == 'bw':
                bg_video = bg_video.with_effects([vfx.BlackAndWhite()])
            elif _vf == 'vivid':
                bg_video = bg_video.with_effects([vfx.LumContrast(contrast=20)])
            elif _vf == 'bright':
                bg_video = bg_video.with_effects([vfx.GammaCorrection(0.8)])
            elif _vf == 'cinematic':
                bg_video = bg_video.with_effects([vfx.GammaCorrection(1.15), vfx.LumContrast(contrast=10)])
            if _vf != 'none':
                print(f"DEBUG: video filter applied: {_vf}")
        except Exception as _fe:
            print(f"Warning: video filter failed: {_fe}")

        # 3. 자막 생성
        final_clips = [bg_video]

        # subtitle_style이 있거나 edited_srt가 있는 경우 자막 처리
        subtitle_style = subtitle_style or {}
        show_subtitles = subtitle_style.get('show_subtitles', True)
        
        has_subtitle_input = subtitle_style or edited_srt
        has_srt_source = edited_srt or (srt_path and os.path.exists(srt_path))
        
        if show_subtitles and has_subtitle_input and has_srt_source:
            subtitles = parse_srt(srt_path=srt_path, srt_content=edited_srt)

            # [개선] 폰트 호환성 체크 로직 추가 (Windows 환경 대응 강화)
            def get_compatible_font(font_name):
                import platform
                import os
                from PIL import ImageFont
                
                system = platform.system()
                
                # 윈도우 환경 대응
                if system == 'Windows':
                    win_font_dir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
                    
                    # 폰트 이름별 시도할 파일명 리스트
                    font_file_map = {
                        'Noto Sans KR': ['NotoSansKR-VF.ttf', 'NotoSansKR-Regular.otf', 'NotoSansKR-Medium.otf'],
                        'Malgun Gothic': ['malgun.ttf', 'malgunbd.ttf'],
                        'Arial': ['arial.ttf'],
                        'Garamond': ['gara.ttf']
                    }
                    
                    # 1. 요청된 폰트 이름으로 직접 시도 (시스템에 등록된 경우)
                    try:
                        ImageFont.truetype(font_name, 10)
                        return font_name
                    except:
                        pass
                    
                    # 2. 맵핑된 파일명으로 윈도우 폰트 디렉토리에서 찾기
                    if font_name in font_file_map:
                        for f_file in font_file_map[font_name]:
                            f_path = os.path.join(win_font_dir, f_file)
                            if os.path.exists(f_path):
                                try:
                                    ImageFont.truetype(f_path, 10)
                                    return f_path
                                except:
                                    continue
                    
                    # 3. 폰트 이름 + 확장자로 시도
                    for ext in ['.ttf', '.otf']:
                        f_path = os.path.join(win_font_dir, font_name + ext)
                        if os.path.exists(f_path):
                            try:
                                ImageFont.truetype(f_path, 10)
                                return f_path
                            except:
                                continue
                                
                    # 4. 마지막 수단: 맑은 고딕 (윈도우 표준 한글 폰트)
                    fallback_path = os.path.join(win_font_dir, "malgun.ttf")
                    if os.path.exists(fallback_path):
                        return fallback_path
                        
                    return "Arial"
                    
                return font_name

            # 프리셋 값 = 프론트 subtitlePresets 정의가 source of truth.
            # 예전처럼 여기서 preset명으로 font_size/color를 하드코딩 덮어쓰기 금지
            # (레일 미리보기·에디터 미리보기·최종 렌더가 달라지는 원인).
            # 자막크기(배율)는 프론트에서 font_size에 이미 반영되어 전달된다.
            style_config = {
                'font': get_compatible_font(subtitle_style.get('font', 'Noto Sans KR')),
                'font_size': subtitle_style.get('font_size', 20),
                'color': subtitle_style.get('color', 'white'),
                'stroke_color': subtitle_style.get('stroke_color', 'black'),
                'stroke_width': subtitle_style.get('stroke_width', 2.0),
                'bg_color': _parse_bg_color(subtitle_style.get('bg_color')),
                'text_align': subtitle_style.get('text_align', 'center') or 'center',
                'method': 'caption'
            }

            y_pos_pct = subtitle_style.get('y_offset', 85) / 100.0

            # 텍스트 줄바꿈 함수 (어절 경계에서 끊고, 외톨이 1어절 뒷줄 방지)
            def wrap_text(text, font_size, max_width):
                # 어절 단위(keep-all) 공용 구현으로 위임 (한글 전각폭 + 외톨이 해소).
                # 2줄을 넘으면 어절을 쪼개지 않고 폰트를 줄여 맞춘다 -> 의미 단위 보존.
                return _wrap_keep_all(text, font_size, max_width, max_lines=2)

            for s_idx, (start, end, text) in enumerate(subtitles):
                if progress_callback and len(subtitles) > 0:
                    p = 30 + int((s_idx / len(subtitles)) * 10)
                    progress_callback(p, f"자막을 생성 중입니다... ({s_idx+1}/{len(subtitles)})")

                if not text:
                    continue

                duration = end - start
                if duration <= 0:
                    continue
                    
                # 화면 너비의 80%를 최대 너비로 설정
                max_text_width = target_size[0] * 0.8

                # 프론트 미리보기와 렌더가 일치해야 한다.
                # 프리셋 font_size는 '미리보기 px'(1080p 기준) 값이므로
                # 그대로 두고 높이 비율로만 스케일한다. 예전처럼 0.6을 곱하면
                # 렌더가 미리보기보다 훨씬 작아져 제작 설정과 다르게 보인다.
                scale_factor = target_size[1] / 1080.0
                actual_font_size = int(style_config['font_size'] * scale_factor)

                # 가독성 하한/상한 (비례 결과를 깨지 않는 범위에서만)
                actual_font_size = max(16, min(actual_font_size, 160))

                wrapped_text = wrap_text(text, actual_font_size, max_text_width)

                _sub_kwargs = dict(
                    text=wrapped_text,
                    font=style_config['font'],
                    font_size=actual_font_size,
                    color=style_config['color'],
                    stroke_color=style_config['stroke_color'],
                    stroke_width=style_config['stroke_width'],
                    method='label',  # caption 대신 label 사용 (자동 스케일링 방지)
                    text_align=style_config.get('text_align', 'center') or 'center'
                )
                if style_config.get('bg_color'):
                    _sub_kwargs['bg_color'] = style_config['bg_color']
                    _sub_kwargs['margin'] = (
                        max(8, int(actual_font_size * 0.6)),
                        max(4, int(actual_font_size * 0.25)),
                    )
                try:
                    txt_clip = TextClip(**_sub_kwargs).with_duration(duration).with_start(start)
                except Exception as text_e:
                    print(
                        f"Warning: TextClip failed with "
                        f"method='label': {text_e}"
                    )
                    # 실패 시 예비 옵션
                    txt_clip = TextClip(**_sub_kwargs).with_duration(duration).with_start(start)
                # y_offset = 중앙 기준 (에디터 미리보기와 동일 앵커): 클립 높이 절반 보정
                try:
                    _sub_h = float(getattr(txt_clip, 'h', 0) or 0)
                except Exception:
                    _sub_h = 0.0
                _sub_y = target_size[1] * y_pos_pct
                _sub_y_top = max(0.0, min(target_size[1] - _sub_h, _sub_y - _sub_h / 2.0))
                txt_clip = txt_clip.with_position(('center', _sub_y_top))

                # 등장 애니메이션 (none/fade/slide/pulse/typing)
                try:
                    _anim = str(subtitle_style.get('animation', 'none') or 'none').lower()
                    if _anim == 'slide':
                        txt_clip = txt_clip.with_position(
                            lambda t, _y=_sub_y_top: ('center', _y - 30 * max(0.0, 1.0 - t / 0.35))
                        )
                    elif _anim != 'none':
                        txt_clip = _apply_text_animation(txt_clip, _anim, duration)
                except Exception as _ae:
                    print(f"Warning: subtitle animation failed: {_ae}")

                final_clips.append(txt_clip)

        # 씬 자막 밴드 (상단, 독립 레이어): Step2의 씬별 subtitle을
        # caption_style(프론트 편집값)로 표시, 없으면 기본값
        if scene_captions:
            _cs = caption_style if isinstance(caption_style, dict) else {}
            try:
                _cap_base = float(_cs.get('font_size', 13) or 13)
            except (TypeError, ValueError):
                _cap_base = 13.0
            # 미리보기 px 기준 → 출력 해상도 스케일.
            # 예전처럼 가로(1080) 기준에 1.5를 곱하면 세로로 긴 화면에서
            # 캡션이 오히려 작아져 제작 설정 스펙과 다르게 보인다.
            # 하한을 낮춰 높이 비례가 깨지지 않게 한다.
            _scale = target_size[1] / 1080.0
            cap_font_size = max(10, min(int(_cap_base * _scale), 120))
            try:
                cap_y_ratio = float(_cs.get('y_offset', 12) or 0) / 100.0
            except (TypeError, ValueError):
                cap_y_ratio = 0.12
            cap_y = target_size[1] * min(max(cap_y_ratio, 0.0), 0.4)
            cap_color = str(_cs.get('color', '#FFD76A') or '#FFD76A')
            cap_bg = _cs.get('bg_color', 'rgba(0,0,0,0.45)')
            cap_font = (subtitle_style.get('font', 'Noto Sans KR')
                        if isinstance(subtitle_style, dict) else 'Noto Sans KR')
            try:
                from PIL import ImageFont
                try:
                    ImageFont.truetype(cap_font, 10)
                except Exception:
                    import platform as _pf
                    if _pf.system() == 'Windows':
                        _wd = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
                        for _cand in ('malgun.ttf', 'NotoSansKR-Regular.otf', 'arial.ttf'):
                            _fp = os.path.join(_wd, _cand)
                            if os.path.exists(_fp):
                                try:
                                    ImageFont.truetype(_fp, 10)
                                    cap_font = _fp
                                    break
                                except Exception:
                                    continue
            except Exception:
                pass

            def _cap_wrap(text, fsize, max_w):
                # 자막과 동일한 어절 단위(keep-all) 공용 구현으로 위임.
                # 상단 밴드는 재료+분량 목록이므로 3줄까지 허용한다.
                return _wrap_keep_all(text, fsize, max_w, max_lines=3)

            for c_idx, cap in enumerate(scene_captions):
                try:
                    c_start = float(cap.get("start", 0))
                    c_end = float(cap.get("end", 0))
                    c_text = str(cap.get("text", "")).strip()
                except (TypeError, ValueError, AttributeError):
                    continue
                if not c_text or c_end <= c_start:
                    continue
                c_wrapped = _cap_wrap(c_text, cap_font_size, target_size[0] * 0.8)
                try:
                    _cap_kwargs = dict(
                        text=c_wrapped,
                        font=cap_font,
                        font_size=cap_font_size,
                        color=cap_color,
                        stroke_color='black',
                        stroke_width=1,
                        method='label',
                        text_align='center'
                    )
                    if cap_bg and cap_bg != 'transparent':
                        _cap_bg = _parse_bg_color(cap_bg)
                        if _cap_bg:
                            _cap_kwargs['bg_color'] = _cap_bg
                            _cap_kwargs['margin'] = (
                                max(6, int(cap_font_size * 0.5)),
                                max(3, int(cap_font_size * 0.2)),
                            )
                    cap_clip = TextClip(**_cap_kwargs).with_duration(
                        c_end - c_start
                    ).with_start(c_start)
                    # y_offset = 중앙 기준 (에디터 미리보기와 동일 앵커)
                    try:
                        _cap_h = float(getattr(cap_clip, 'h', 0) or 0)
                    except Exception:
                        _cap_h = 0.0
                    _cap_y_top = max(0.0, min(target_size[1] - _cap_h, cap_y - _cap_h / 2.0))
                    cap_clip = cap_clip.with_position(('center', _cap_y_top))
                    try:
                        _cap_anim = str((_cs.get('animation', 'none') if isinstance(_cs, dict) else 'none') or 'none').lower()
                        _cap_dur = max(0.1, c_end - c_start)
                        if _cap_anim == 'slide':
                            cap_clip = cap_clip.with_position(
                                lambda t, _y=_cap_y_top: ('center', _y - 20 * max(0.0, 1.0 - t / 0.3))
                            )
                        elif _cap_anim != 'none':
                            cap_clip = _apply_text_animation(cap_clip, _cap_anim, _cap_dur)
                    except Exception as _cae:
                        print(f"Warning: caption animation failed: {_cae}")
                    final_clips.append(cap_clip)
                except Exception as cap_e:
                    print(f"Warning: Scene caption {c_idx} failed: {cap_e}")

        # 스티커 오버레이 (짧은 텍스트/이모지, 장면 구간에 표시)
        _stickers = stickers if isinstance(stickers, list) else []
        if _stickers:
            _stk_font = get_compatible_font(
                (subtitle_style or {}).get('font', 'Noto Sans KR')
            ) if isinstance(subtitle_style, dict) else get_compatible_font('Noto Sans KR')
            try:
                _base_fs = int((subtitle_style or {}).get('font_size', 20)) if isinstance(subtitle_style, dict) else 20
            except (TypeError, ValueError):
                _base_fs = 20
            _scale_f = target_size[1] / 1080.0
            for _si, _st in enumerate(_stickers):
                try:
                    if not isinstance(_st, dict):
                        continue
                    _stext = str(_st.get('text', '')).strip()
                    if not _stext:
                        continue
                    _s = max(0.0, float(_st.get('start', 0)))
                    _e = float(_st.get('end', _s + 2.0))
                    if not (_e > _s):
                        continue
                    try:
                        _ssize = max(16, min(120, int(float(_st.get('size', 36)) * _scale_f * 0.6)))
                    except (TypeError, ValueError):
                        _ssize = 36
                    _scolor = str(_st.get('color', 'white') or 'white')
                    try:
                        _sy = float(_st.get('y_pct', 50) or 50) / 100.0
                    except (TypeError, ValueError):
                        _sy = 0.5
                    _sclip = TextClip(
                        text=_stext, font=_stk_font, font_size=_ssize,
                        color=_scolor, stroke_color='black', stroke_width=1,
                        method='label', text_align='center',
                    ).with_duration(_e - _s).with_start(_s).with_position(
                        ('center', target_size[1] * min(max(_sy, 0.0), 1.0))
                    )
                    try:
                        _sclip = _apply_text_animation(
                            _sclip, str(_st.get('animation', 'fade') or 'fade'), _e - _s
                        )
                    except Exception:
                        pass
                    final_clips.append(_sclip)
                except Exception as _se:
                    print(f"Warning: sticker {_si} failed: {_se}")

        # 최종 영상 합성
        final_video = CompositeVideoClip(
            final_clips, size=target_size
        ).with_audio(final_audio)

        # 출력 디렉토리 확인
        output_dir = os.path.dirname(output_path)
        if not output_dir:
            output_dir = get_export_dir()
            output_path = os.path.join(
                output_dir, os.path.basename(output_path)
            )

        os.makedirs(output_dir, exist_ok=True)

        # 최종 영상 생성
        logger = "bar" # MoviePy standard logger
        if progress_callback:
            try:
                from proglog import TqdmProgressBarLogger
                import time

                class CustomLogger(TqdmProgressBarLogger):
                    def __init__(self):
                        super().__init__()
                        self.last_update_time = 0
                        self.last_progress = 40
                        self.start_time = time.time()

                    def callback(self, **changes):
                        if cancel_check and cancel_check():
                            raise InterruptedError(
                                "User requested cancellation"
                            )
                        super().callback(**changes)

                    def bars_callback(self, bar, attr, value, old_value=None):
                        # progress_callback을 통해 진행률 업데이트 (40% ~ 98% 구간으로 매핑)
                        if bar == "t":  # 't' is main progress bar
                            try:
                                total = self.bars[bar]['total']
                                if total and total > 0:
                                    # 40%부터 시작하여 렌더링 진행률을 58% 구간에 매핑 (40 + 58 = 98)
                                    ratio = float(value) / float(total)
                                    
                                    # [수정] 진행률 정체 현상 해결을 위한 보정 로직
                                    # 실제 렌더링 속도가 느릴 경우 시간 기반으로 아주 조금씩이라도 올라가게 함 (심리적 효과)
                                    time_passed = time.time() - self.start_time
                                    time_bonus = min(5, time_passed / 10) # 최대 5%까지 시간 보너스
                                    
                                    current_progress = int(40 + (ratio * 58) + time_bonus)
                                    
                                    # 범위 제한
                                    current_progress = max(40, min(98, current_progress))
                                    
                                    current_time = time.time()
                                    # 0.2초마다 혹은 진행률이 올라갔을 때 업데이트 (더 빈번하게 업데이트)
                                    if (current_time - self.last_update_time > 0.2) or (current_progress > self.last_progress):
                                        self.last_update_time = current_time
                                        self.last_progress = current_progress
                                        progress_callback(current_progress, f"최종 비디오를 렌더링하고 있습니다... ({current_progress}%)")
                            except Exception as e:
                                print(f"Logger error: {e}")

                logger = CustomLogger()
            except ImportError:
                print("proglog not installed, using default logger")
        elif cancel_check:
            try:
                from proglog import TqdmProgressBarLogger
                class CancelOnlyLogger(TqdmProgressBarLogger):
                    def callback(self, **changes):
                        if cancel_check and cancel_check():
                            raise InterruptedError("User requested cancellation")
                        super().callback(**changes)
                logger = CancelOnlyLogger()
            except ImportError:
                print("proglog not installed, using default logger")

        # 렌더링 성능 최적화: threads=4 (또는 자동), preset="ultrafast" (속도 우선)
        # 프로덕션에서는 "medium" 또는 "fast"가 좋지만, 사용자 피드백에 따라 속도를 우선시함
        final_video.write_videofile(
            output_path, 
            fps=24, 
            codec="libx264", 
            audio_codec="aac",
            threads=os.cpu_count() or 4,
            preset="ultrafast",
            logger=logger
        )

        # 리소스 해제
        main_audio.close()
        if len(audio_clips) > 1:
            final_audio.close()
        final_video.close()
        for _c in clips:
            try:
                _c.close()
            except Exception:
                pass

        # Ken Burns 임시 파일 정리
        for _tmp in kb_tmp_files:
            try:
                if os.path.exists(_tmp):
                    os.remove(_tmp)
            except Exception:
                pass

        return True

    except Exception as e:
        print(f"Error assembling video: {e}")
        import traceback
        traceback.print_exc()
        return False
