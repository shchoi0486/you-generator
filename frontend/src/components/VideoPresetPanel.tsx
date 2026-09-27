import React from 'react';
import {
  Monitor,
  Smartphone,
  Square,
  Clock,
  Scissors,
  FileText,
  Mic,
  Gauge,
  Image as ImageIcon,
  Captions,
  Hammer,
  Type,
  Clapperboard,
} from 'lucide-react';
import SubtitlePresetSelect, { subtitlePreviewStyle, type SubtitlePresetDef } from './SubtitlePresetSelect';
import ModelPricingModal from './ModelPricingModal';
import { subtitlePresets } from '../constants/data';
import {
  FALLBACK_RECIPE_OPTIONS,
  DURATION_PRESETS,
  type RecipePresetState,
} from '../constants/recipeOptions';
import type { CaptionStyle } from '../services/api';
import { api } from '../services/api';

// 대본 다양화 선택지는 백엔드 /shorts/recipe-options 를 단일 출처로 삼는다.
// 아래 FALLBACK은 그 API가 죽었을 때만 쓴다(오프라인/백엔드 미기동 대비).
// 목록은 ../constants/recipeOptions 에서 공유한다 — 여기와 ShortsLab에 복붙돼
// 있어 한쪽만 고쳐 4개 프리셋의 훅이 UI에 안 뜨는 버그가 났다.
// 프리셋에 길이가 없는 게 설계다. 길이는 DURATION_PRESETS로 따로 고른다.
const FALLBACK_OPTIONS = FALLBACK_RECIPE_OPTIONS as unknown as typeof FALLBACK_RECIPE_OPTIONS;

async function fetchRecipeOptions() {
  // 로컬호스트를 직접 박으면 패키징(Tauri) 빌드에서 백엔드 주소가 꼬인다.
  // 공통 API 클라이언트를 타야 설정을 한 곳에서만 바꾼다.
  try {
    return await api.getRecipeOptions();
  } catch { /* 폴백 사용 */ }
  return null;
}

export type CutSpeed = 'fast' | 'slow';
export type ScriptFormat = 'hook' | 'summary' | 'story';
export type EngineId = 'edge' | 'qwen' | 'openai' | 'azure' | 'minimax' | 'elevenlabs' | 'typecast';
export type SubtitleSize = 'small' | 'medium' | 'large';

export const ASPECT_OPTIONS: Array<{ label: string; value: string; icon: React.FC<{ size: number; className?: string }> }> = [
  { label: '16:9', value: '16:9 (Youtube)', icon: Monitor },
  { label: '9:16', value: '9:16 (Shorts)', icon: Smartphone },
  { label: '1:1', value: '1:1 (Square)', icon: Square },
  { label: '3:4', value: '3:4 (Portrait)', icon: Smartphone },
];

// 실측에서 30초·1분·3분·5분·10분이 압도적이다. 1.5분(90초)은 사용 빈도가 낮아 제외.
// 값은 ../constants/recipeOptions 에서 온다(백엔드 포맷 5단계와 한 곳에서 유지).
export { DURATION_PRESETS };

export type ScriptGroup = 'cooking' | 'product' | 'knowledge' | 'travel' | 'news' | 'shorts_lab';

export interface ScriptFormatOption {
  id: string;
  name: string;
  group: string;
  flow: string;
  desc: string;
  recommended: boolean;
}

/** 템플릿 ID → 대본 포맷 그룹. 매칭 없으면 cooking(기본). */
export function scriptGroupOf(templateId: string): ScriptGroup {
  if (templateId === 'review_short') return 'product';
  if (templateId === 'knowledge_short') return 'knowledge';
  if (templateId === 'travel_short') return 'travel';
  if (templateId === 'news_duo' || templateId === 'news_solo') return 'news';
  if (templateId === 'shorts_lab') return 'shorts_lab';
  return 'cooking';
}

/** 백엔드 fallback용 그룹별 추천 ID (백엔드 DEFAULTS와 동일 유지) */
export const RECOMMENDED_SCRIPTS: Record<ScriptGroup, string> = {
  cooking: 'cooking_tutorial',
  product: 'product_problem',
  knowledge: 'knowledge_3point',
  travel: 'travel_course',
  news: 'news_briefing',
  shorts_lab: 'lab_structure',
};

export const ENGINE_OPTIONS: Array<{ id: EngineId; label: string }> = [
  { id: 'edge', label: 'Edge' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'azure', label: 'Azure' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'typecast', label: 'Typecast' },
];

export const AI_MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pollinations', label: 'Pollinations (무료 · 워터마크)' },
  { value: 'cloudflare', label: 'Cloudflare AI (무료 · neurons)' },
  { value: 'deepinfra', label: 'FLUX schnell (DeepInfra · 약 0.6원/장)' },
  { value: 'gemini', label: 'Google Nano Banana (유료 · 장당 과금)' },
  { value: 'horde', label: 'AI Horde (무료 · 느림)' },
  { value: 'local_sd', label: 'Local SD (로컬 서버 필요)' },
  { value: 'zimage', label: 'Z-Image (CUDA GPU 필요)' },
];

/** 영상 생성 모델 (백엔드 연동 전 — 선택+키 유지만 가능) */
export const VIDEO_MODEL_OPTIONS: Array<{ value: string; label: string; key: 'minimax' | 'fal' }> = [
  { value: 'minimax_h3_768p', label: 'MiniMax H3 768p ($0.08/s)', key: 'minimax' },
  { value: 'minimax_h3_2k', label: 'MiniMax H3 2K ($0.13/s)', key: 'minimax' },
  { value: 'veo_lite', label: 'Veo 3.1 Lite 720p ($0.05/s) · fal', key: 'fal' },
  { value: 'veo_fast', label: 'Veo 3.1 Fast 720p ($0.10/s) · fal', key: 'fal' },
  { value: 'veo_standard', label: 'Veo 3.1 Standard ($0.40/s) · fal', key: 'fal' },
  { value: 'sora_2', label: 'Sora 2 720p ($0.10/s) · fal', key: 'fal' },
  { value: 'sora_2_pro', label: 'Sora 2 Pro (~$0.70/s) · fal', key: 'fal' },
];

export const SUBTITLE_SIZES: Array<{ id: SubtitleSize; label: string; factor: number }> = [
  { id: 'small', label: '작게', factor: 0.8 },
  { id: 'medium', label: '보통', factor: 1.0 },
  { id: 'large', label: '크게', factor: 1.3 },
];

/** 상단 자막 밴드 스타일 프리셋 */
export const CAPTION_PRESETS: Array<{ id: string; name: string; style: Partial<CaptionStyle> }> = [
  { id: 'default', name: '기본', style: { font_size: 13, color: '#FFD76A', bg_color: 'rgba(0,0,0,0.45)' } },
  { id: 'white', name: '화이트', style: { font_size: 13, color: '#FFFFFF', bg_color: 'rgba(0,0,0,0.55)' } },
  { id: 'box', name: '블랙박스', style: { font_size: 14, color: '#FFFFFF', bg_color: 'rgba(0,0,0,0.85)' } },
  { id: 'breaking', name: '속보', style: { font_size: 14, color: '#FFFFFF', bg_color: 'rgba(220,38,38,0.92)' } },
  { id: 'paper', name: '페이퍼', style: { font_size: 13, color: '#18181B', bg_color: 'rgba(255,255,255,0.95)' } },
];

const ASPECT_CSS: Record<string, string> = {
  '16:9 (Youtube)': '16 / 9',
  '9:16 (Shorts)': '9 / 16',
  '1:1 (Square)': '1 / 1',
  '3:4 (Portrait)': '3 / 4',
};

/** 컷 전환 속도 → 대본 생성용 추가 지시문 (대본 포맷은 SCRIPT 레이어로 별도 전달) */
export function buildCutInstructions(cutSpeed: CutSpeed): string {
  return cutSpeed === 'fast'
    ? '컷 전환: 씬당 4~6초 분량으로 잘게 쪼개서 빠르게 전환한다.'
    : '컷 전환: 씬당 8~12초 분량으로 여유 있게 배치하고 느리게 전환한다.';
}

interface VideoPresetPanelProps {
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  cutSpeed: CutSpeed;
  setCutSpeed: (v: CutSpeed) => void;
  scriptOptions: ScriptFormatOption[];
  scriptId: string;
  onScriptChange: (id: string) => void;
  selectedEngine: string;
  setSelectedEngine: (e: EngineId) => void;
  voiceRate: string;
  setVoiceRate: (v: string) => void;
  selectedAiModel: string;
  setSelectedAiModel: (v: string) => void;
  videoModel: string;
  setVideoModel: (v: string) => void;
  hasMinimaxKey: boolean;
  hasFalKey: boolean;
  subtitlePreset: string;
  onSubtitlePresetChange: (id: string) => void;
  subtitleSize: SubtitleSize;
  onSubtitleSizeChange: (s: SubtitleSize) => void;
  showSubtitles: boolean;
  onToggleSubtitles: (v: boolean) => void;
  subtitleY: number;
  onSubtitleYChange: (y: number) => void;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  showSceneCaptions: boolean;
  setShowSceneCaptions: (v: boolean) => void;
  mediaFit: 'fit' | 'fill' | 'crop';
  setMediaFit: (v: 'fit' | 'fill' | 'crop') => void;
  bgStyle: 'blur' | 'black' | 'color';
  setBgStyle: (v: 'blur' | 'black' | 'color') => void;
  bgColor: string;
  setBgColor: (v: string) => void;
  zoomPct: number;
  setZoomPct: (v: number) => void;
  /** 도킹 레일용: 바깥 카드 장식 없이 내용만 렌더 */
  bare?: boolean;
  /** 대본 다양화 선택 (레시피 카테고리 전용) */
  recipePreset?: RecipePresetState;
  setRecipePreset?: (p: RecipePresetState) => void;
}

const activeBtn = 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200';
const idleBtn = 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600';

/** 세로 레일용 섹션. 레퍼런스처럼 항상 펼침 고정 (접기 없음) */
const RailSection: React.FC<{
  order: number;
  icon: React.ReactNode;
  title: string;
  /** @deprecated 항상 펼침으로 변경되어 표시하지 않음 (호출부 호환용) */
  summary?: string;
  /** @deprecated 항상 펼침으로 변경되어 무시됨 (호출부 호환용) */
  defaultOpen?: boolean;
  /** 제목 오른쪽 액션 (예: 가격비교 링크) */
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ order, icon, title, action, children }) => {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-black flex items-center justify-center shrink-0">
          {order}
        </span>
        <span className="text-indigo-500 shrink-0">{icon}</span>
        <span className="text-xs font-extrabold text-gray-800">{title}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="px-4 pb-4 pt-0.5 space-y-2">{children}</div>
    </div>
  );
};

const PriceLink: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    title="AI 모델 가격비교표 열기"
    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 hover:underline"
  >
    가격비교표
  </button>
);

/** 상단 자막 밴드용 드롭다운 (하단 자막 셀렉터와 같은 미리보기 형태) */
const CaptionPresetSelect: React.FC<{
  value: string;
  onChange: (id: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const current = CAPTION_PRESETS.find((p) => p.id === value) ?? CAPTION_PRESETS[0];
  const toPreview = (color: string | undefined, bg: string | undefined): SubtitlePresetDef => ({
    label: '',
    font_size: 13,
    color: color ?? '#FFD76A',
    stroke_color: 'transparent',
    stroke_width: 0,
    bg_color: bg ?? 'transparent',
  });
  return (
    <div className="relative">
      <div
        onClick={() => setOpen(!open)}
        title="상단 자막 스타일 선택"
        className="w-full rounded-xl border border-gray-200 bg-white p-1 hover:border-indigo-300 transition-all cursor-pointer"
      >
        <div className="w-full flex items-center gap-3 px-2.5 py-1.5">
          <span className="w-14 shrink-0 text-xs font-black text-gray-500">{current.name}</span>
          <span className="flex-1 flex items-center justify-center h-9 rounded-lg bg-zinc-900 overflow-hidden px-2">
            <span style={subtitlePreviewStyle(toPreview(current.style.color, current.style.bg_color))}>상단 미리보기</span>
          </span>
        </div>
      </div>
      {open && (
        <>
          <button
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0"
          />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-gray-200 bg-white shadow-xl p-1.5 space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar">
            {CAPTION_PRESETS.map((p) => {
              const active = value === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); }}
                  title={`${p.name} 스타일 적용`}
                  className={`w-full flex items-center gap-3 px-2.5 py-1.5 rounded-xl border transition-all text-left ${
                    active ? 'bg-indigo-50/60 border-indigo-500 ring-1 ring-indigo-500/30' : 'bg-white border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <span className={`w-14 shrink-0 text-xs font-black ${active ? 'text-indigo-700' : 'text-gray-500'}`}>
                    {p.name}
                  </span>
                  <span className="flex-1 flex items-center justify-center h-9 rounded-lg bg-zinc-900 overflow-hidden px-2">
                    <span style={subtitlePreviewStyle(toPreview(p.style.color, p.style.bg_color))}>상단 미리보기</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

/** 모델별 필요 키 안내 */
const IMAGE_KEY_HINTS: Record<string, string> = {
  pollinations: '키 불필요 · 바로 동작',
  cloudflare: 'CF 계정 ID + API 토큰 필요',
  deepinfra: 'DeepInfra API 키 필요',
  gemini: 'Gemini API 키 필요',
  horde: '키 불필요(익명) · 느림',
  local_sd: '로컬 SD 서버 필요',
  zimage: '로컬 CUDA GPU + 모델 필요',
};

const goSettings = () => {
  window.dispatchEvent(new CustomEvent('changeMenu', { detail: { detail: 'Settings' } }));
};

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] text-gray-400 font-medium leading-relaxed">{children}</p>
);

/** 자막 상하 위치 슬라이더 (y_offset %, 중앙 기준 — 에디터·렌더와 동일 앵커) */
const YSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-bold text-gray-500 w-12 shrink-0">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={Math.round(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      title={`${label} 위치: ${Math.round(value)}% (위에서부터)`}
      className="flex-1 h-1 accent-indigo-600 cursor-pointer"
    />
    <span className="text-[10px] font-black text-indigo-600 w-9 text-right shrink-0">{Math.round(value)}%</span>
  </div>
);

const VideoPresetPanel: React.FC<VideoPresetPanelProps> = ({
  aspectRatio,
  setAspectRatio,
  duration,
  setDuration,
  cutSpeed,
  setCutSpeed,
  scriptOptions,
  scriptId,
  onScriptChange,
  selectedEngine,
  setSelectedEngine,
  voiceRate,
  setVoiceRate,
  selectedAiModel,
  setSelectedAiModel,
  videoModel,
  setVideoModel,
  hasMinimaxKey,
  hasFalKey,
  mediaFit,
  setMediaFit,
  bgStyle,
  setBgStyle,
  bgColor,
  setBgColor,
  zoomPct,
  setZoomPct,
  subtitlePreset,
  onSubtitlePresetChange,
  subtitleSize,
  onSubtitleSizeChange,
  showSubtitles,
  onToggleSubtitles,
  subtitleY,
  onSubtitleYChange,
  captionStyle,
  setCaptionStyle,
  showSceneCaptions,
  setShowSceneCaptions,
  bare = false,
  recipePreset,
  setRecipePreset,
}) => {
  const [pricingTab, setPricingTab] = React.useState<null | 'image' | 'video'>(null);
  // 상단 자막 프리셋 ID. 예전엔 captionStyle의 색/배경에서 ID를 역산했는데,
  // PropertiesPanel에서 배경을 transparent로 바꾸면 어떤 항목에도 안 맞아
  // 화면엔 '기본'이라고 떠 있고 실제 스타일과 어긋났다. ID를 직접 들고 있는다.
  const [captionPresetId, setCaptionPresetId] = React.useState<string>(() => {
    const hit = CAPTION_PRESETS.find(
      (p) => p.style.color === captionStyle.color && p.style.bg_color === captionStyle.bg_color
    );
    return hit?.id ?? CAPTION_PRESETS[0].id;
  });
  const [recipeOptions, setRecipeOptions] = React.useState<typeof FALLBACK_OPTIONS | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetchRecipeOptions().then((o) => {
      if (alive && o?.presets) setRecipeOptions(o);
    });
    return () => { alive = false; };
  }, []);
  const opts = recipeOptions || FALLBACK_OPTIONS;
  const activePresetName = opts.presets.find((p) => p.id === (recipePreset?.preset || 'random'))?.name || '매번 변경';
  const currentScript = scriptOptions.find((f) => f.id === scriptId) ?? scriptOptions.find((f) => f.recommended) ?? scriptOptions[0];
  const engineName = ENGINE_OPTIONS.find((e) => e.id === selectedEngine)?.label ?? selectedEngine;
  const sizeName = SUBTITLE_SIZES.find((s) => s.id === subtitleSize)?.label ?? '';

  return (
    <div className={bare ? 'bg-white overflow-hidden' : 'rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm'}>
      <RailSection order={1} icon={<Monitor size={13} />} title="화면 비율" summary={aspectRatio.split(' ')[0]}>
        <div className="grid grid-cols-4 gap-1.5">
          {ASPECT_OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = aspectRatio === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setAspectRatio(o.value)}
                title={o.value}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[11px] font-black transition-all ${active ? activeBtn : idleBtn}`}
              >
                <Icon size={15} />
                {o.label}
              </button>
            );
          })}
        </div>
        <div className="border-t border-gray-100 pt-2 space-y-1">
          <p className="text-[11px] font-extrabold text-gray-700">미디어 맞춤 <span className="font-medium text-gray-400">(전 장면 기본값)</span></p>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: 'fit', label: '원본 유지', hint: '원본 비율 그대로 + 아래 배경으로 여백 처리' },
              { id: 'fill', label: '너비 채우기', hint: '가로 여백 없이 너비 가득 (위아래만 잘림/여백)' },
              { id: 'crop', label: '꽉 채우기', hint: '여백 없이 화면 가득 채움 (가장자리 잘림)' },
            ] as const).map((o) => (
              <button
                key={o.id}
                onClick={() => setMediaFit(o.id)}
                title={o.hint}
                className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all ${mediaFit === o.id ? activeBtn : idleBtn}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Hint>
            {mediaFit === 'fit' && '원본 비율 그대로 + 아래 배경으로 여백 처리'}
            {mediaFit === 'fill' && '가로 여백 없이 너비 가득 채움'}
            {mediaFit === 'crop' && '여백 없이 화면 가득 채움 (가장자리 잘림)'}
          </Hint>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-500 flex justify-between">
              확대
              <span className="text-indigo-500">{zoomPct}%</span>
            </label>
            <input
              title="확대 (100~200%)"
              type="range"
              min="100"
              max="200"
              step="5"
              value={zoomPct}
              onChange={(e) => setZoomPct(parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
            />
            <Hint>100%에서 조금씩 올리면 세로로 더 차게 (Crop 없이 여백 줄이기)</Hint>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-2 space-y-1">
          <p className="text-[11px] font-extrabold text-gray-700">배경 처리 <span className="font-medium text-gray-400">(Fit 여백용)</span></p>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: 'blur', label: '블러' },
              { id: 'black', label: '검은색' },
              { id: 'color', label: '단색' },
            ] as const).map((o) => (
              <button
                key={o.id}
                onClick={() => setBgStyle(o.id)}
                title={`${o.label} 배경`}
                className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all ${bgStyle === o.id ? activeBtn : idleBtn}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {bgStyle === 'color' && (
            <div className="flex items-center gap-2.5 bg-gray-50 p-2 rounded-xl border border-gray-200">
              <div className="w-7 h-7 rounded-lg overflow-hidden border border-zinc-300 shadow-sm shrink-0">
                <input
                  title="배경 단색"
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-600 uppercase">{bgColor}</span>
            </div>
          )}
          <Hint>{bgStyle === 'blur' ? '원본을 확대·블러 처리한 동적 배경 (움직임 따라감)' : bgStyle === 'black' ? '검은색 배경' : '선택한 단색 배경'}</Hint>
        </div>
      </RailSection>

      <RailSection order={2} icon={<Clock size={13} />} title="영상 길이" summary={`${duration}초`}>
        <div className="grid grid-cols-3 gap-1.5">
          {DURATION_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => setDuration(s)}
              className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all ${duration === s ? activeBtn : idleBtn}`}
            >
              {s >= 60 ? `${s / 60}분` : `${s}초`}
            </button>
          ))}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">직접 입력</span>
          <input
            type="number"
            min={15}
            max={3600}
            value={duration}
            // 0이 들어갈 수 있었다. 백엔드는 int(duration or 40)로 조용히 40초를
            // 대입하므로 화면엔 "0초"인데 생성은 40초가 된다(비정상).
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isNaN(n)) return;
              setDuration(Math.min(3600, Math.max(15, n)));
            }}
            placeholder="초 단위 입력"
            title="영상 길이(초). 15~3600"
            className="w-full pl-16 pr-10 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-indigo-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">sec</span>
        </div>
      </RailSection>

      <RailSection order={3} icon={<Scissors size={13} />} title="컷 전환 속도" summary={cutSpeed === 'fast' ? '빠르게' : '느리게'}>
        <div className="flex p-1 bg-gray-50 border border-gray-200 rounded-xl">
          {(['fast', 'slow'] as CutSpeed[]).map((v) => (
            <button
              key={v}
              onClick={() => setCutSpeed(v)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                cutSpeed === v ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {v === 'fast' ? '빠르게' : '느리게'}
            </button>
          ))}
        </div>
        <Hint>{cutSpeed === 'fast' ? '~5초마다 컷 전환 (씬을 잘게)' : '~10초마다 컷 전환 (씬을 여유 있게)'}</Hint>
      </RailSection>

      <RailSection order={4} icon={<FileText size={13} />} title="대본 포맷" summary={currentScript?.name ?? ''}>
        <select
          value={currentScript?.id ?? ''}
          onChange={(e) => onScriptChange(e.target.value)}
          title="대본 포맷 선택"
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-indigo-500 cursor-pointer"
        >
          {scriptOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.recommended ? `★ 추천 · ${f.name}` : f.name}
            </option>
          ))}
        </select>
        <Hint>{currentScript?.flow}</Hint>
        {scriptOptions.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400">다른 포맷</p>
            <div className="flex flex-wrap gap-1.5">
              {scriptOptions.filter((f) => f.id !== currentScript?.id).map((f) => (
                <button
                  key={f.id}
                  onClick={() => onScriptChange(f.id)}
                  title={f.flow}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-all"
                >
                  {f.recommended ? `★ ${f.name}` : f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </RailSection>

      <RailSection order={5} icon={<Clapperboard size={13} />} title="대본 다양화" summary={activePresetName}>
        {recipePreset && setRecipePreset ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {opts.presets.map((p) => {
                const on = (recipePreset.preset || 'random') === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      // 프리셋의 축을 state에 굳히지 않는다. 굳히면 그 스냅샷이
                      // 명시 파라미터로 계속 전송되어, 나중에 서버가 프리셋 톤을
                      // 바꿔도 브라우저가 옛 값을 덮어써 영영 못 본다(실측 구조).
                      // 빈 문자열 = '오버라이드 없음'으로 두고 서버가 프리셋 값으로
                      // 채우게 한다(백엔드 우선순위: 파라미터 > 프리셋 > 저장값).
                      setRecipePreset({
                        ...recipePreset,
                        preset: p.id,
                        hook: '', tone: '', structure: '', cta: '',
                      });
                    }}
                    title={p.desc}
                    className={`text-left px-3 py-2 rounded-lg border transition-all ${on ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-gray-200 bg-white hover:border-indigo-300'}`}
                  >
                    <p className={`text-xs font-bold ${on ? 'text-indigo-700' : 'text-gray-700'}`}>{p.name}</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{p.desc}</p>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <p className="text-[10px] font-bold text-gray-500 mb-1">스타일</p>
                <select
                  value={recipePreset.style}
                  onChange={(e) => setRecipePreset({ ...recipePreset, style: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 outline-none focus:border-indigo-500"
                >
                  {opts.styles.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 mb-1">플랫폼</p>
                <select
                  value={recipePreset.platform}
                  onChange={(e) => setRecipePreset({ ...recipePreset, platform: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 outline-none focus:border-indigo-500"
                >
                  {opts.platforms.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <details className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <summary className="px-3 py-2 text-[11px] font-bold text-gray-500 cursor-pointer hover:text-indigo-600">
                개별 조정 (톤·구조·훅·CTA)
              </summary>
              <div className="px-3 py-2.5 space-y-2.5 border-t border-gray-100">
                {/* 프리셋 축은 state에 저장하지 않는다(빈 값=오버라이드 없음).
                    그래서 '실제로 무엇이 적용되는지'는 여기서 계산해서 보여줘야 한다. */}
                {(() => {
                  const _p = opts.presets.find((x) => x.id === (recipePreset.preset || 'random')) as
                    { tone?: string; structure?: string; hook?: string; cta?: string } | undefined;
                  const _eff = {
                    tone: recipePreset.tone || _p?.tone || '',
                    structure: recipePreset.structure || _p?.structure || '',
                    hook: recipePreset.hook || _p?.hook || '',
                    cta: recipePreset.cta || _p?.cta || '',
                  };
                  const _dirty = Object.keys(_eff).some((k) => recipePreset[k as keyof typeof _eff]);
                  if (!_p) return null;
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                      <p className="text-[10px] font-bold text-gray-500">
                        적용 중: {opts.tones.find((t) => t.id === _eff.tone)?.name || '프리셋 지정'}
                      </p>
                      {_dirty ? (
                        <button
                          onClick={() => setRecipePreset({ ...recipePreset, hook: '', tone: '', structure: '', cta: '' })}
                          className="text-[10px] font-bold text-indigo-600 hover:underline"
                          title="개별 조정을 지우고 프리셋에 정해진 조합을 그대로 쓴다"
                        >
                          프리셋값으로 되돌리기
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-gray-400">프리셋 값 그대로</span>
                      )}
                    </div>
                  );
                })()}
                <div>
                  <p className="text-[10px] font-bold text-gray-500 mb-1">내레이션 톤</p>
                  <div className="flex flex-wrap gap-1">
                    {opts.tones.map((t) => {
                      const _on = (recipePreset.tone || (opts.presets.find((x) => x.id === (recipePreset.preset || 'random')) as { tone?: string } | undefined)?.tone) === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setRecipePreset({ ...recipePreset, tone: t.id })}
                          title={t.desc}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${_on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 mb-1">대본 구조</p>
                  <div className="flex flex-wrap gap-1">
                    {opts.structures.map((s) => {
                      const _on = (recipePreset.structure || (opts.presets.find((x) => x.id === (recipePreset.preset || 'random')) as { structure?: string } | undefined)?.structure) === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setRecipePreset({ ...recipePreset, structure: s.id })}
                          title={s.desc}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${_on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 mb-1">오프닝 훅</p>
                  <div className="flex flex-wrap gap-1">
                    {opts.hooks.map((h) => {
                      const _on = (recipePreset.hook || (opts.presets.find((x) => x.id === (recipePreset.preset || 'random')) as { hook?: string } | undefined)?.hook) === h.id;
                      return (
                        <button
                          key={h.id}
                          onClick={() => setRecipePreset({ ...recipePreset, hook: h.id })}
                          title={h.desc}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${_on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                        >
                          {h.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 mb-1">마무리 CTA</p>
                  <div className="flex flex-wrap gap-1">
                    {opts.ctas.map((c) => {
                      const _on = (recipePreset.cta || (opts.presets.find((x) => x.id === (recipePreset.preset || 'random')) as { cta?: string } | undefined)?.cta) === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setRecipePreset({ ...recipePreset, cta: c.id })}
                          title={c.desc}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${_on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>
          </div>
        ) : (
          <Hint>요리/레시피 카테고리에서만 표시됩니다</Hint>
        )}
      </RailSection>

      <RailSection order={6} icon={<Mic size={13} />} title="기본 음성 엔진" summary={engineName}>
        <select
          value={selectedEngine}
          onChange={(e) => setSelectedEngine(e.target.value as EngineId)}
          title="기본 음성 엔진 선택"
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-indigo-500 cursor-pointer"
        >
          {ENGINE_OPTIONS.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
        <Hint>화자별 목소리는 3단계에서 세부 조정</Hint>
      </RailSection>

      <RailSection order={7} icon={<Gauge size={13} />} title="음성 빠르기" summary={voiceRate === '+0%' ? '보통' : '빠르게'}>
        <div className="flex p-1 bg-gray-50 border border-gray-200 rounded-xl">
          {[
            { label: '보통', value: '+0%' },
            { label: '빠르게', value: '+15%' },
          ].map((o) => (
            <button
              key={o.value}
              onClick={() => setVoiceRate(o.value)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                voiceRate === o.value ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </RailSection>

      <RailSection
        order={8}
        icon={<ImageIcon size={13} />}
        title="이미지 생성 모델"
        summary={AI_MODEL_OPTIONS.find((m) => m.value === selectedAiModel)?.label.split(' ')[0] ?? ''}
        action={<PriceLink onClick={() => setPricingTab('image')} />}
      >
        <select
          value={selectedAiModel}
          onChange={(e) => setSelectedAiModel(e.target.value)}
          title="이미지 생성 모델 선택"
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-indigo-500 cursor-pointer"
        >
          {AI_MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <Hint>
          {IMAGE_KEY_HINTS[selectedAiModel] ?? ''}{' · '}
          <button onClick={goSettings} title="Settings로 이동" className="font-bold text-indigo-500 hover:text-indigo-700 hover:underline">
            Settings에서 입력
          </button>
        </Hint>
      </RailSection>

      <RailSection order={9} icon={<Clapperboard size={13} />} title="영상 생성 모델" summary={VIDEO_MODEL_OPTIONS.find((m) => m.value === videoModel)?.label.split(' (')[0] ?? '미선택'} action={<PriceLink onClick={() => setPricingTab('video')} />}>
        <select
          value={videoModel}
          onChange={(e) => setVideoModel(e.target.value)}
          title="영상 생성 모델 선택"
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="">모델 선택</option>
          {VIDEO_MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {(() => {
          const sel = VIDEO_MODEL_OPTIONS.find((m) => m.value === videoModel);
          if (!sel) return <Hint>장면에 쓸 AI 영상 모델을 고르세요</Hint>;
          const needMinimax = sel.key === 'minimax';
          const hasKey = needMinimax ? hasMinimaxKey : hasFalKey;
          if (!hasKey) {
            return (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] font-bold text-amber-700">
                  {needMinimax ? 'MiniMax API 키' : 'fal.ai API 키'}를 먼저 입력하세요
                </p>
                <button
                  onClick={goSettings}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 transition-all"
                >
                  Settings에서 키 입력하기
                </button>
              </div>
            );
          }
          return <Hint>백엔드 영상 파이프라인 연결 후 이 모델로 생성됩니다</Hint>;
        })()}
      </RailSection>

      <RailSection order={10} icon={<Captions size={13} />} title="자막 설정" summary={subtitlePreset}>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-gray-700">상단 자막 <span className="font-medium text-gray-400">(씬 요약 밴드)</span></p>
            <button
              onClick={() => setShowSceneCaptions(!showSceneCaptions)}
              title="상단 자막 표시 전환"
              className={`relative w-9 h-5 rounded-full transition-all shrink-0 ${showSceneCaptions ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showSceneCaptions ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
          <CaptionPresetSelect
            value={captionPresetId}
            onChange={(id) => {
              const p = CAPTION_PRESETS.find((x) => x.id === id);
              if (!p) return;
              setCaptionPresetId(id);
              // factor를 곱해야 '자막 크기' 설정과 어긋나지 않는다
              // (PropertiesPanel 쪽은 factor를 빼고 그대로 덮어써서 값이 갈렸다)
              const factor = SUBTITLE_SIZES.find((s) => s.id === subtitleSize)?.factor ?? 1;
              setCaptionStyle((prev) => ({
                ...prev,
                ...p.style,
                font_size: Math.round((p.style.font_size ?? 13) * factor),
              }));
            }}
          />
          <Hint>문구는 Step2 장면 카드의 TOP 입력란에서 입력</Hint>
          <YSlider
            label="상단 위치"
            value={captionStyle.y_offset ?? 12}
            min={2}
            max={30}
            onChange={(v) => setCaptionStyle((prev) => ({ ...prev, y_offset: v }))}
          />
        </div>
        <div className="border-t border-gray-100 pt-2 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-gray-700">하단 자막 <span className="font-medium text-gray-400">(대본·TTS)</span></p>
            <button
              onClick={() => onToggleSubtitles(!showSubtitles)}
              title="하단 자막 포함 전환"
              className={`relative w-9 h-5 rounded-full transition-all shrink-0 ${showSubtitles ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showSubtitles ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
          <SubtitlePresetSelect value={subtitlePreset} onChange={onSubtitlePresetChange} />
          <Hint>{showSubtitles ? '하단 자막 포함해서 렌더' : '하단 자막 없이 렌더'}</Hint>
          <YSlider
            label="하단 위치"
            value={subtitleY}
            min={60}
            max={97}
            onChange={onSubtitleYChange}
          />
        </div>
      </RailSection>

      <RailSection order={11} icon={<Type size={13} />} title="자막 크기" summary={sizeName}>
        <div className="flex p-1 bg-gray-50 border border-gray-200 rounded-xl">
          {SUBTITLE_SIZES.map((s) => (
            <button
              key={s.id}
              onClick={() => onSubtitleSizeChange(s.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                subtitleSize === s.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Hint>화면 높이 대비 글자 크기입니다. 템플릿 기본 크기에 배율 적용</Hint>
      </RailSection>

      <RailSection order={12} icon={<Monitor size={13} />} title="화면 미리보기" summary={aspectRatio.split(' ')[0]}>
        {(() => {
          const base = (subtitlePresets as Record<string, SubtitlePresetDef>)[subtitlePreset];
          const factor = SUBTITLE_SIZES.find((s) => s.id === subtitleSize)?.factor ?? 1;
          const scaled = base ? { ...base, font_size: Math.round(base.font_size * factor) } : null;
          const cap = CAPTION_PRESETS.find((p) => captionStyle.color === p.style.color && captionStyle.bg_color === p.style.bg_color)
            ?? { style: { color: captionStyle.color, bg_color: captionStyle.bg_color } };
          const isPortrait = aspectRatio.startsWith('9:16') || aspectRatio.startsWith('3:4');
          // 16:9 가로 샘플 미디어로 맞춤 방식 시연 (fit=포함+배경 / crop=꽉 참)
          const stageBg = bgStyle === 'color' ? bgColor : bgStyle === 'black' ? '#000000' : 'rgba(60,60,70,0.55)';
          return (
            <>
              <div className="flex justify-center rounded-xl bg-gray-50 border border-gray-100 p-3">
                <div
                  className="relative rounded-lg bg-zinc-900 overflow-hidden"
                  style={{
                    aspectRatio: ASPECT_CSS[aspectRatio] ?? '16 / 9',
                    ...(isPortrait ? { height: 200 } : { width: '100%' }),
                    background: bgStyle === 'blur' ? 'linear-gradient(135deg, #3a3a45, #1c1c22)' : undefined,
                    backgroundColor: bgStyle === 'blur' ? undefined : stageBg,
                  }}
                >
                  <div
                    className="absolute bg-zinc-500/70 border border-dashed border-white/40 rounded-sm"
                    style={
                      mediaFit === 'crop'
                        ? { inset: 0 }
                        : mediaFit === 'fill'
                          ? { left: 0, right: 0, top: '24%', bottom: '24%' }
                          : isPortrait
                            ? { left: '8%', right: '8%', top: `${Math.max(4, 32 - (zoomPct - 100) * 0.3)}%`, bottom: '32%' }
                            : { left: '22%', right: '22%', top: `${Math.max(2, 12 - (zoomPct - 100) * 0.12)}%`, bottom: '12%' }
                    }
                    title={mediaFit === 'crop' ? '꽉 채우기' : mediaFit === 'fill' ? '너비 채우기' : `원본 유지 + 확대 ${zoomPct}%`}
                  />
                  {showSceneCaptions && (
                    <span className="absolute left-0 right-0 flex justify-center px-2" style={{ top: `${captionStyle.y_offset ?? 12}%`, transform: 'translateY(-50%)' }}>
                      <span style={subtitlePreviewStyle({ label: '', font_size: 13, color: cap.style.color ?? '#FFD76A', stroke_color: 'transparent', stroke_width: 0, bg_color: cap.style.bg_color ?? 'transparent' })}>
                        상단 미리보기
                      </span>
                    </span>
                  )}
                  {showSubtitles && scaled && (
                    <span className="absolute left-0 right-0 flex justify-center px-2" style={{ top: `${subtitleY}%`, transform: 'translateY(-50%)' }}>
                      <span style={subtitlePreviewStyle(scaled)}>
                        자막 미리보기
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <Hint>{aspectRatio} · {mediaFit === 'fit' ? `원본 유지+${zoomPct}%` : mediaFit === 'fill' ? '너비 채우기' : '꽉 채우기'} · 배경 {bgStyle === 'blur' ? '블러' : bgStyle === 'black' ? '검은색' : '단색'} · 상·하단 자막 표시</Hint>
            </>
          );
        })()}
      </RailSection>

      <RailSection order={13} icon={<Hammer size={13} />} title="추가 설정" summary="준비중" defaultOpen={false}>
        {['내 레퍼런스 (0/9)', '영상 생성 모델', '유튜브 채널 연결'].map((t) => (
          <div
            key={t}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-dashed border-gray-200 text-[11px] font-bold text-gray-400"
          >
            {t}
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
              <Hammer size={10} />
              준비중
            </span>
          </div>
        ))}
      </RailSection>
      {pricingTab && (
        <ModelPricingModal initialTab={pricingTab} onClose={() => setPricingTab(null)} />
      )}
    </div>
  );
};

export default React.memo(VideoPresetPanel);
