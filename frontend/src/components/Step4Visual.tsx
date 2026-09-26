import React from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  ArrowRight, 
  CheckCircle2, 
  Image as ImageIcon,
  Maximize,
  Search,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Loader2,
  Trash2,
  Plus,
  Library,
  X,
  Pencil,
  Edit2,
  Save,
  Upload,
  Film,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type AppContent,
  type SceneCandidates,
  type StockVideo,
  type RefineClip,
  type RefineResult,
  api,
  assetUrl
} from '../services/api';

interface Step4VisualProps {
  content: AppContent;
  activeSceneIndex: number;
  setActiveSceneIndex: (index: number) => void;
  selectedVisuals: Record<number, string[]>;
  setSelectedVisuals: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  visualCandidates: Record<number, SceneCandidates>;
  setVisualCandidates: React.Dispatch<React.SetStateAction<Record<number, SceneCandidates>>>;
  isGeneratingAll: boolean;
  generationProgress: { current: number; total: number };
  activeTask: 'ai' | 'search' | 'stock' | 'all' | null;
  stopGeneration: () => void;
  selectedAiModel: string;
  setSelectedAiModel: (model: string) => void;
  fetchAllCandidates: (force?: boolean) => void;
  fetchAllByType: (type: 'ai' | 'search' | 'stock', force?: boolean) => void;
  fetchCandidates: (index: number, type?: 'all' | 'ai' | 'search', model?: string, isAppend?: boolean, customKeyword?: string, refresh?: boolean) => void;
  editingSceneIndex: number | null;
  setEditingSceneIndex: (index: number | null) => void;
  editSceneValues: { keyword: string; description: string };
  setEditSceneValues: React.Dispatch<React.SetStateAction<{ keyword: string; description: string }>>;
  setContent: (content: AppContent) => void;
  setCurrentStep: (step: number) => void;
  zoomedImage: string | null;
  setZoomedImage: (url: string | null) => void;
  handleMoveToEdit: () => void;
  fetchingIndices: Set<string>;
  stockFetchRef?: React.MutableRefObject<((idx: number, silent?: boolean, force?: boolean) => Promise<void>) | null>;
  onRefineApply?: (idx: number, r: { narration_ko?: string; subtitles?: Array<{ text: string; start: number; end: number }>; sfx?: string }) => void;
  getSceneDuration?: (idx: number) => number;
  clipTrims: Record<number, Record<string, { in: number; out: number | null }>>;
  setClipTrims: React.Dispatch<React.SetStateAction<Record<number, Record<string, { in: number; out: number | null }>>>>;
  extraMedia: Record<number, StockVideo[]>;
  setExtraMedia: React.Dispatch<React.SetStateAction<Record<number, StockVideo[]>>>;
}

/** 클립당 최소 길이(초). 씬 길이를 이 값보다 짧게 쪼갤 수 없음 */
export const MIN_CLIP_SECONDS = 1.5;

const Step4Visual: React.FC<Step4VisualProps> = ({ 
  content,
  activeSceneIndex,
  setActiveSceneIndex,
  selectedVisuals,
  setSelectedVisuals,
  visualCandidates,
  setVisualCandidates,
  isGeneratingAll,
  generationProgress,
  activeTask,
  stopGeneration,
  selectedAiModel,
  setSelectedAiModel,
  fetchAllByType,
  fetchCandidates,
  editingSceneIndex,
  setEditingSceneIndex,
  editSceneValues,
  setEditSceneValues,
  setContent,
  setCurrentStep,
  zoomedImage,
  setZoomedImage,
  handleMoveToEdit,
  fetchingIndices,
  stockFetchRef,
  onRefineApply,
  getSceneDuration,
  clipTrims,
  setClipTrims,
  extraMedia,
  setExtraMedia
}) => {
  const [fetchingStock, setFetchingStock] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const edgeTimer = React.useRef<number | null>(null);
  const stopEdgeScroll = () => {
    if (edgeTimer.current) { clearInterval(edgeTimer.current); edgeTimer.current = null; }
  };
  const startEdgeScroll = (key: string, dir: 1 | -1) => {
    stopEdgeScroll();
    edgeTimer.current = window.setInterval(() => {
      rowRefs.current[key]?.scrollBy({ left: dir * 28 });
    }, 30);
  };
  const edgeBtn = "absolute top-1/2 -translate-y-1/2 z-20 w-7 h-10 items-center justify-center rounded-full bg-white/90 shadow-md border border-gray-100 text-gray-500 hover:text-indigo-600 hidden group-hover/row:flex";
  const rowArrow = (rowKey: string, dir: 1 | -1) => (
    <button
      key={`edge-${dir}`}
      aria-label={dir === 1 ? '오른쪽으로 스크롤' : '왼쪽으로 스크롤'}
      className={`${edgeBtn} ${dir === 1 ? 'right-1' : 'left-1'}`}
      onMouseEnter={() => startEdgeScroll(rowKey, dir)}
      onMouseLeave={stopEdgeScroll}
      onClick={() => rowRefs.current[rowKey]?.scrollBy({ left: dir * 360, behavior: 'smooth' })}
    >
      {dir === 1 ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
    </button>
  );
  const [refineOpen, setRefineOpen] = React.useState(false);
  const [refineLoading, setRefineLoading] = React.useState(false);
  const [stockProgress, setStockProgress] = React.useState({ current: 0, total: 0 });
  // 확대 모달의 미디어 종류 (URL 확장자 판별 대신 아이템 기준으로 판단)
  const [zoomKind, setZoomKind] = React.useState<'video' | 'image'>('image');
  const closeZoom = () => { setZoomedImage(null); };
  const [refineResult, setRefineResult] = React.useState<RefineResult | null>(null);
  const [refineError, setRefineError] = React.useState<string | null>(null);

  const fullUrl = (u: string) => assetUrl(u);

  const fetchStockFor = async (idx: number, silent: boolean = false, force: boolean = false) => {
    const scene = content.scenes[idx];
    const base = (scene?.stock_query || scene?.keyword || '').trim();
    // stock_query가 없으면 description 첫 구절을 덧붙여 씬별 고유 쿼리로 만듦
    const descHead = (!scene?.stock_query && scene?.description
      ? scene.description.split(',')[0].slice(0, 60).trim() : '');
    const kw = `${base} ${descHead}`.trim();
    if (!kw) return;
    // 이미 결과가 있으면 건너뜀 (중복 수집 방지). 강제 새로고침이 아닐 때만.
    if (!force && (extraMedia[idx] || []).length > 0) return;
    if (fetchingStock) return;
    if (!silent) setFetchingStock(true);
    try {
      const data = await api.getStockVideos(kw, 4, force);
      const vids: StockVideo[] = (data?.videos || []).map((v: StockVideo) => ({ ...v, kind: 'video', source: 'stock' }));
      if (vids.length > 0) {
        setExtraMedia((prev) => {
          const existing = new Set((prev[idx] || []).map((m) => m.url));
          const fresh = vids.filter((v) => !existing.has(v.url));
          if (fresh.length === 0) return prev;
          return { ...prev, [idx]: [...(prev[idx] || []), ...fresh] };
        });
        // 자동 선택 없음: 사용자가 직접 고름
      }
    } catch (e) {
      if (silent) {
        console.error(`Stock fetch failed for scene ${idx}:`, (e as Error).message);
      } else {
        alert(`스톡 비디오 검색 실패: ${(e as Error).message} (Pexels API 키 확인)`);
      }
    } finally {
      if (!silent) setFetchingStock(false);
    }
  };

  if (stockFetchRef) stockFetchRef.current = fetchStockFor;

  const fetchStock = async () => {
    if (fetchingStock) return;
    setFetchingStock(true);
    setStockProgress({ current: 0, total: content.scenes.length });
    try {
      for (let i = 0; i < content.scenes.length; i++) {
        await fetchStockFor(i, true, true);
        setStockProgress({ current: i + 1, total: content.scenes.length });
      }
    } finally {
      setFetchingStock(false);
      setStockProgress({ current: 0, total: 0 });
    }
  };

  const openRefine = () => {
    setRefineResult(null);
    setRefineError(null);
    setRefineOpen(true);
  };

  const runRefine = async () => {
    const idx = activeSceneIndex;
    const scriptItem = content.script.find((s) => s.scene_index === idx);
    const scene = content.scenes[idx] as unknown as Record<string, unknown>;
    const urls = selectedVisuals[idx] || [];
    if (urls.length === 0) {
      setRefineError('다듬기에 쓸 클립을 먼저 선택하세요 (최대 3개).');
      return;
    }
    const aiSearch = [
      ...((visualCandidates[idx]?.ai || []).map((v: { url?: string; path?: string }) => ({ ...v, source: 'ai' }))),
      ...((visualCandidates[idx]?.search || []).map((v: { path: string; url?: string }) => ({ ...v, source: 'search' }))),
    ];
    const clips: RefineClip[] = urls.slice(0, 3).map((u) => {
      const extra = (extraMedia[idx] || []).find((m) => m.url === u);
      if (extra) {
        const isUp = u.includes('/uploads/');
        return {
          url: u,
          kind: extra.kind === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(u) ? 'video' : 'image',
          source: isUp ? 'upload' : 'stock',
          note: isUp ? '' : String(scene?.keyword || ''),
        };
      }
      const found = aiSearch.find((v) => v.url === u || (v as { path?: string }).path === u);
      return { url: u, kind: 'image', source: (found as { source?: string } | undefined)?.source || 'ai', note: '' };
    });
    setRefineLoading(true);
    setRefineError(null);
    try {
      const data = await api.refineScene({
        scene: {
          section: String(scene?.section || ''),
          speaker: scriptItem?.speaker || 'BJ 이슈왕',
          text: scriptItem?.text || '',
          subtitle: scriptItem?.subtitle || '',
          duration: Number(scene?.time_end || 0) - Number(scene?.time_start || 0),
        },
        clips,
        topic: String((content as unknown as Record<string, unknown>)?.projectName || ''),
      });
      setRefineResult(data as RefineResult);
    } catch (e) {
      setRefineError((e as Error).message || '다듬기에 실패했습니다.');
    } finally {
      setRefineLoading(false);
    }
  };

  const handleUpload = async (f: File) => {
    if (!f || uploading) return;
    setUploading(true);
    try {
      const data = await api.uploadAsset(f);
      const isVideo = /\.(mp4|webm|mov)$/i.test(data.url || '');
      const item: StockVideo = { url: data.url, path: data.path, preview: data.url, kind: isVideo ? 'video' : 'image', source: 'upload' };
      setExtraMedia((prev) => ({ ...prev, [activeSceneIndex]: [...(prev[activeSceneIndex] || []), item] }));
      setSelectedVisuals((prev) => {
        const cur = prev[activeSceneIndex] || [];
        if (cur.length >= 3 || cur.includes(data.url)) return prev;
        if (!canAddClip(activeSceneIndex, cur.length, minSecFor(activeSceneIndex, data.url))) return prev;
        return { ...prev, [activeSceneIndex]: [...cur, data.url] };
      });
    } catch (e) {
      alert(`업로드 실패: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const stockItems = (extraMedia[activeSceneIndex] || []).filter((m) => (m.source || 'stock') !== 'upload');
  const uploadItems = (extraMedia[activeSceneIndex] || []).filter((m) => (m.source || 'stock') === 'upload');

  const sceneDurationFor = (idx: number): number => {
    try {
      const d = getSceneDuration?.(idx) ?? 0;
      return Number.isFinite(d) ? d : 0;
    } catch {
      return 0;
    }
  };

  // 클립당 최소 노출 시간: 이미지 2.5초 / 영상 1.5초 (시청자 인지 기준)
  // 씬 길이는 오디오(SRT) 기준 고정이라 균등 분할한다.
  // 기준 미달이면 막지 않고 B-roll식 빠른 전환로 쓸지 사용자에게 확인한다.
  const canAddClip = (idx: number, currentLen: number, minSec: number = MIN_CLIP_SECONDS): boolean => {
    const dur = sceneDurationFor(idx);
    if (dur > 0 && dur / (currentLen + 1) < minSec) {
      const per = (dur / (currentLen + 1)).toFixed(1);
      return window.confirm(
        `씬 길이(${dur.toFixed(1)}초)에 클립을 추가하면 클립당 ${per}초로 짧아집니다.\n` +
        `나레이션은 그대로 두고 화면만 빠르게 전환하는 B-roll 연출로 사용하시겠습니까?`
      );
    }
    return true;
  };

  const isVideoUrl = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);
  // 씬에 영상이 하나라도 섞이면 영상 기준(1.5초), 아니면 이미지 기준(2.5초)
  const minSecFor = (idx: number, newUrl?: string): number => {
    const urls = [...(selectedVisuals[idx] || [])];
    if (newUrl && !urls.includes(newUrl)) urls.push(newUrl);
    return urls.some((u) => isVideoUrl(u)) ? 1.5 : 2.5;
  };

  const moveClip = (idx: number, url: string, dir: -1 | 1) => {
    setSelectedVisuals((prev) => {
      const current = prev[idx] || [];
      const pos = current.indexOf(url);
      const next = pos + dir;
      if (pos < 0 || next < 0 || next >= current.length) return prev;
      const arr = [...current];
      [arr[pos], arr[next]] = [arr[next], arr[pos]];
      return { ...prev, [idx]: arr };
    });
  };

  const renderExtraCard = (item: StockVideo) => {
    const isSelected = selectedVisuals[activeSceneIndex]?.includes(item.url);
    const isVideo = item.kind === 'video';
    return (
      <div
        key={item.url}
        onClick={() => {
          setSelectedVisuals((prev) => {
            const current = prev[activeSceneIndex] || [];
            if (current.includes(item.url)) {
              return {
                ...prev,
                [activeSceneIndex]: current.filter((u) => u !== item.url),
              };
            }
            if (current.length >= 3) {
              alert('한 장면당 최대 3개까지 선택할 수 있습니다.');
              return prev;
            }
            if (!canAddClip(activeSceneIndex, current.length, minSecFor(activeSceneIndex, item.url))) return prev;
            return {
              ...prev,
              [activeSceneIndex]: [...current, item.url],
            };
          });
        }}
        className={`group relative aspect-video w-40 sm:w-44 shrink-0 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
          isSelected
            ? 'border-indigo-600 ring-8 ring-indigo-50 shadow-2xl scale-[1.02] z-10'
            : 'border-gray-50 hover:border-indigo-200 hover:shadow-xl shadow-md'
        }`}
      >
        {isVideo ? (
          <video
            src={fullUrl(item.url)}
            poster={item.preview && item.preview.startsWith('http') ? item.preview : undefined}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onMouseOver={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
            onMouseOut={(e) => (e.target as HTMLVideoElement).pause()}
          />
        ) : (
          <img src={fullUrl(item.url)} className="w-full h-full object-cover" alt="" loading="lazy" />
        )}
        {isVideo && (
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-black rounded-md">VIDEO</span>
        )}
        {isSelected && (
          <div className="absolute top-2 right-2 bg-indigo-600 text-white w-5 h-5 flex items-center justify-center rounded-full shadow-lg ring-2 ring-white/20 text-[10px] font-black z-20">
            {(selectedVisuals[activeSceneIndex]?.indexOf(item.url) || 0) + 1}
          </div>
        )}
        {isSelected && (selectedVisuals[activeSceneIndex]?.length || 0) > 1 && (
          <div className="absolute bottom-2 right-2 flex gap-1 z-20" onClick={(e) => e.stopPropagation()}>
            <button
              title="앞으로 이동"
              onClick={(e) => { e.stopPropagation(); moveClip(activeSceneIndex, item.url, -1); }}
              className="w-5 h-5 rounded-md bg-black/60 hover:bg-black/80 text-white text-[10px] font-black flex items-center justify-center"
            >
              ‹
            </button>
            <button
              title="뒤로 이동"
              onClick={(e) => { e.stopPropagation(); moveClip(activeSceneIndex, item.url, 1); }}
              className="w-5 h-5 rounded-md bg-black/60 hover:bg-black/80 text-white text-[10px] font-black flex items-center justify-center"
            >
              ›
            </button>
          </div>
        )}
        {/* Action Buttons (이미지 검색 카드와 동일: 삭제 + 크게 보기) */}
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExtraMedia((prev) => ({
                ...prev,
                [activeSceneIndex]: (prev[activeSceneIndex] || []).filter((m) => m.url !== item.url),
              }));
              setSelectedVisuals((prev) => ({
                ...prev,
                [activeSceneIndex]: (prev[activeSceneIndex] || []).filter((u) => u !== item.url),
              }));
            }}
            className="p-1.5 bg-red-500/80 hover:bg-red-500 backdrop-blur-md text-white rounded-lg transition-all hover:scale-110 border border-white/10 shadow-lg"
            title="삭제"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomKind(item.kind === 'video' ? 'video' : 'image');
              setZoomedImage(fullUrl(item.url));
            }}
            className="p-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-lg transition-all hover:scale-110 border border-white/10 shadow-lg"
            title="크게 보기"
          >
            <Maximize size={12} />
          </button>
        </div>
        {isSelected && isVideo && (
          <div
            className="absolute bottom-1.5 left-1.5 flex items-center gap-1 z-20 bg-black/60 rounded-md px-1.5 py-0.5"
            onClick={(e) => e.stopPropagation()}
            title="원본 영상에서 사용할 구간 (시작~종료, 초)"
          >
            <span className="text-white/60 text-[9px] font-bold">시작</span>
            <input
              type="number" min={0} step={0.5}
              value={clipTrims[activeSceneIndex]?.[item.url]?.in ?? 0}
              onChange={(e) => {
                const v = Math.max(0, parseFloat(e.target.value) || 0);
                setClipTrims((prev) => {
                  const cur = prev[activeSceneIndex]?.[item.url];
                  const out = cur?.out ?? null;
                  return {
                    ...prev,
                    [activeSceneIndex]: {
                      ...(prev[activeSceneIndex] || {}),
                      // 종료점이 시작점보다 짧아지지 않게 보정
                      [item.url]: { in: v, out: out != null && out <= v ? v + 0.5 : out },
                    },
                  };
                });
              }}
              className="w-9 bg-transparent text-white text-[9px] font-bold outline-none"
            />
            <span className="text-white/60 text-[9px]">~</span>
            <span className="text-white/60 text-[9px] font-bold">종료</span>
            <input
              type="number" min={0} step={0.5}
              value={clipTrims[activeSceneIndex]?.[item.url]?.out ?? ''}
              placeholder="끝"
              onChange={(e) => {
                const raw = e.target.value;
                const curIn = clipTrims[activeSceneIndex]?.[item.url]?.in ?? 0;
                const v = raw === '' ? null : Math.max(curIn + 0.5, parseFloat(raw) || 0);
                setClipTrims((prev) => ({
                  ...prev,
                  [activeSceneIndex]: {
                    ...(prev[activeSceneIndex] || {}),
                    [item.url]: { in: prev[activeSceneIndex]?.[item.url]?.in ?? 0, out: v },
                  },
                }));
              }}
              className="w-9 bg-transparent text-white text-[9px] font-bold outline-none placeholder:text-white/40"
            />
            <span className="text-white/60 text-[9px] font-bold">초</span>
          </div>
        )}
      </div>
    );
  };

  if (!content) return null;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Step 3 Concept Header */}
      <div className="flex items-center justify-between shrink-0 px-6 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Library size={18} />
          </div>
          <h2 className="text-lg font-bold text-gray-900">시각 자료 선택</h2>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentStep(3)}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1.5 text-[10px] font-bold transition-colors whitespace-nowrap"
          >
            <ChevronLeft size={14} />
            목소리 설정
          </button>
          
          <div className="h-4 w-px bg-gray-200 mx-1"></div>
          
          <div className="flex items-center gap-3">
            {isGeneratingAll && (
              <div className="flex items-center gap-2 bg-indigo-50 px-2.5 py-1.5 rounded-xl border border-indigo-100/50 shrink-0">
                <div className="w-16 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-500"
                    style={{ width: `${generationProgress.total > 0 ? (generationProgress.current / generationProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[9px] font-black text-indigo-600 tabular-nums">
                  {generationProgress.total > 0 ? Math.round((generationProgress.current / generationProgress.total) * 100) : 0}%
                </span>
                <button
                  onClick={stopGeneration}
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="생성 중단"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mr-2">
                  <select 
                    value={selectedAiModel}
                    onChange={(e) => setSelectedAiModel(e.target.value)}
                    className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 focus:border-indigo-500 outline-none transition-all cursor-pointer hover:border-gray-300"
                    title="이미지 생성 모델 선택"
                  >
                    <option value="pollinations">Pollinations (무료 · 워터마크)</option>
                    <option value="cloudflare">Cloudflare AI (무료 · neurons)</option>
                    <option value="deepinfra">FLUX schnell (DeepInfra · 약 0.6원/장)</option>
                    <option value="gemini">Google Nano Banana (유료 · 장당 과금)</option>
                    <option value="horde">AI Horde (무료 · 느림)</option>
                    <option value="local_sd">Local SD (로컬 서버 필요)</option>
                    <option value="zimage">Z-Image (CUDA GPU 필요)</option>
                  </select>
                </div>

                {/* 소스별 전체 수집 아이콘 버튼 (각 버튼에 진행률 표시, 화면 가리지 않음) */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => fetchAllByType('ai', true)}
                    title="모든 장면 AI 이미지 새로 생성"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border border-indigo-200 text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 bg-white whitespace-nowrap"
                  >
                    <Sparkles size={14} className={(activeTask === 'ai' || activeTask === 'all') && isGeneratingAll ? 'animate-spin' : ''} />
                    AI {(activeTask === 'ai' || activeTask === 'all') && isGeneratingAll && generationProgress.total > 0
                      ? `${Math.round((generationProgress.current / generationProgress.total) * 100)}%`
                      : ''}
                  </button>

                  <button
                    onClick={() => fetchAllByType('search', true)}
                    title="모든 장면 웹 이미지 새로 검색"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border border-sky-200 text-sky-600 hover:border-sky-300 hover:bg-sky-50 bg-white whitespace-nowrap"
                  >
                    <Search size={14} className={(activeTask === 'search' || activeTask === 'all') && isGeneratingAll ? 'animate-spin' : ''} />
                    이미지 {(activeTask === 'search' || activeTask === 'all') && isGeneratingAll && generationProgress.total > 0
                      ? `${Math.round((generationProgress.current / generationProgress.total) * 100)}%`
                      : ''}
                  </button>

                  <button
                    onClick={fetchStock}
                    disabled={fetchingStock}
                    title="모든 장면 스톡 비디오 새로 검색"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border border-emerald-200 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 bg-white whitespace-nowrap disabled:opacity-50"
                  >
                    <Film size={14} className={fetchingStock || ((activeTask === 'stock' || activeTask === 'all') && isGeneratingAll) ? 'animate-spin' : ''} />
                    스톡영상 {(stockProgress.total > 0)
                      ? `${Math.round((stockProgress.current / stockProgress.total) * 100)}%`
                      : ((activeTask === 'stock' || activeTask === 'all') && isGeneratingAll && generationProgress.total > 0)
                        ? `${Math.round((generationProgress.current / generationProgress.total) * 100)}%`
                        : ''}
                  </button>

                  <label
                    title="직접 찍은 영상/사진을 현재 장면에 넣기"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border border-violet-200 text-violet-600 hover:border-violet-300 hover:bg-violet-50 bg-white whitespace-nowrap cursor-pointer"
                  >
                    <Upload size={14} className={uploading ? 'animate-pulse' : ''} />
                    내 파일
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm,video/quicktime"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }}
                    />
                  </label>
                </div>
          </div>

          <div className="h-4 w-px bg-gray-200 mx-1"></div>

          <div className="flex items-center gap-2">
            <div className="px-2 py-1 bg-gray-50 rounded-lg border border-gray-100 mr-1">
              <span className="text-[10px] font-bold text-gray-500">
                선택됨: <span className="text-indigo-600">{Object.keys(selectedVisuals).length}</span>/{content.scenes.length}
              </span>
            </div>
            {Object.keys(selectedVisuals).length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('모든 장면의 선택을 해제할까요? (후보 목록은 유지됩니다)')) {
                    setSelectedVisuals({});
                  }
                }}
                title="전 장면 선택 해제 (후보 목록은 유지)"
                className="px-2 py-2 rounded-lg text-[11px] font-bold text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all whitespace-nowrap"
              >
                선택 초기화
              </button>
            )}
            <button 
              onClick={handleMoveToEdit}
              disabled={Object.keys(selectedVisuals).length < content.scenes.length}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100"
            >
              편집 단계로 이동
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden bg-white">
        {/* Left: Scene List */}
        <div className="w-[340px] border-r border-gray-100 bg-gray-50/20 flex flex-col shrink-0 overflow-hidden h-full">
          <div className="p-2 border-b border-gray-50">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Library size={12} />
              장면 리스트
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 custom-scrollbar">
            {content.scenes.map((scene, idx) => {
              const isSelected = activeSceneIndex === idx;
              const hasVisual = selectedVisuals[idx] && selectedVisuals[idx].length > 0;
              const firstAiImage = visualCandidates[idx]?.ai?.[0]?.url;
              const displayImageUrl = hasVisual ? selectedVisuals[idx][0] : firstAiImage;
              
              return (
                <button
                  key={idx}
                  onClick={() => setActiveSceneIndex(idx)}
                  className={`w-full text-left p-1.5 rounded-xl transition-all border flex items-center gap-3 ${
                    isSelected 
                    ? 'bg-white border-indigo-600 shadow-sm ring-1 ring-indigo-600/5' 
                    : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200'
                  }`}
                >
                  {/* Thumbnail Preview */}
                  <div className={`shrink-0 w-12 h-8 rounded-lg overflow-hidden bg-gray-100 border border-gray-100 flex items-center justify-center relative ${isSelected ? 'ring-2 ring-indigo-50' : ''}`}>
                    {displayImageUrl ? (
                      /\.(mp4|webm|mov)(\?|$)/i.test(displayImageUrl) ? (
                        <video
                          src={assetUrl(displayImageUrl)}
                          className="w-full h-full object-cover"
                          key={displayImageUrl}
                          muted loop playsInline preload="metadata" autoPlay
                        />
                      ) : (
                        <img
                          src={assetUrl(displayImageUrl)}
                          className="w-full h-full object-cover"
                          alt=""
                          key={displayImageUrl} // URL 변경 시 이미지 강제 갱신
                        />
                      )
                    ) : (
                      <ImageIcon size={12} className="text-gray-300" />
                    )}

                    {/* Loading Overlay */}
                    {(fetchingIndices.has(`${idx}-ai`) || fetchingIndices.has(`${idx}-search`)) && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <Loader2 size={12} className="text-indigo-600 animate-spin" />
                      </div>
                    )}

                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded shadow-sm flex items-center justify-center text-[6px] font-black z-20 ${
                      isSelected ? 'bg-indigo-600 text-white' : 'bg-white/80 text-gray-400'
                    }`}>
                      {idx + 1}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={`text-[11px] font-black truncate min-w-0 max-w-[42%] ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                        {scene.keyword}
                      </p>
                      <span className="text-[10px] text-gray-300 font-light shrink-0">|</span>
                      <p className="text-[10px] text-gray-400 truncate flex-1 min-w-0 font-medium">
                        {scene.description}
                      </p>
                      {hasVisual && !fetchingIndices.has(`${idx}-ai`) && !fetchingIndices.has(`${idx}-search`) && (() => {
                        const urls = selectedVisuals[idx] || [];
                        const vidCount = urls.filter((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u)).length;
                        const imgCount = urls.length - vidCount;
                        const label = [
                          imgCount > 0 ? `이미지 ${imgCount}` : '',
                          vidCount > 0 ? `영상 ${vidCount}` : '',
                        ].filter(Boolean).join(' · ');
                        // 클립당 노출 시간 = 씬 길이 ÷ 클립 수 (오디오 기준 고정이라 균등 분할)
                        const dur = sceneDurationFor(idx);
                        const per = urls.length > 0 && dur > 0 ? dur / urls.length : 0;
                        const minNeed = vidCount > 0 ? 1.5 : 2.5;
                        const tooShort = urls.length > 1 && per > 0 && per < minNeed;
                        return (
                          <span className="flex items-center gap-1 shrink-0 ml-auto" title={urls.length > 1 && dur > 0 ? `씬 ${dur.toFixed(1)}초 ÷ ${urls.length}개 = 클립당 ${per.toFixed(1)}초` : label}>
                            <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-1 py-px whitespace-nowrap">
                              {label}{urls.length > 1 && per > 0 ? ` · 각 ${per.toFixed(1)}초` : ''}
                            </span>
                            {tooShort
                              ? <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1 py-px whitespace-nowrap">짧음</span>
                              : <CheckCircle2 size={10} className="text-green-500 shrink-0" />}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Candidates Area */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Compressed Scene Context & Controls */}
          <div className="px-4 py-1.5 bg-white shrink-0 border-b border-gray-50/50 shadow-sm relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {editingSceneIndex === activeSceneIndex ? (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-2 p-3 bg-indigo-50/30 rounded-2xl border border-indigo-100/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-wider italic">
                        장면 {activeSceneIndex + 1}
                      </div>
                      <input 
                        type="text"
                        value={editSceneValues.keyword}
                        onChange={(e) => setEditSceneValues(prev => ({ ...prev, keyword: e.target.value }))}
                        className="flex-1 px-3 py-1.5 bg-white border border-indigo-100/50 rounded-xl text-xs font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
                        placeholder="키워드 (예: 서울 번화가 야경)"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <textarea 
                        value={editSceneValues.description}
                        onChange={(e) => setEditSceneValues(prev => ({ ...prev, description: e.target.value }))}
                        className="flex-1 px-3 py-2 bg-white border border-indigo-100/50 rounded-xl text-xs font-medium focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm resize-none h-20"
                        placeholder="장면 설명/프롬프트"
                      />
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => {
                            const newScenes = [...content.scenes];
                            newScenes[activeSceneIndex] = {
                              ...newScenes[activeSceneIndex],
                              keyword: editSceneValues.keyword,
                              description: editSceneValues.description
                            };
                            setContent({ ...content, scenes: newScenes });
                            setEditingSceneIndex(null);
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[11px] font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                        >
                          <Save size={14} />
                          저장
                        </button>
                        <button 
                          onClick={() => setEditingSceneIndex(null)}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-400 rounded-xl text-[11px] font-black hover:text-gray-600 transition-all border border-gray-100"
                        >
                          <X size={14} />
                          취소
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-4 py-0.5 flex-wrap"
                  >
                    {/* Keyword Section */}
                    <div className="flex items-center gap-2.5 shrink-0 group">
                      <div className="shrink-0 bg-indigo-600 text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-sm uppercase tracking-wider italic">
                        장면 {activeSceneIndex + 1}
                      </div>
                      <h3 className="text-sm font-black text-gray-900 tracking-tight">
                        {content.scenes[activeSceneIndex].keyword}
                      </h3>
                      <button 
                        onClick={() => {
                          setEditingSceneIndex(activeSceneIndex);
                          setEditSceneValues({
                            keyword: content.scenes[activeSceneIndex].keyword,
                            description: content.scenes[activeSceneIndex].description
                          });
                        }}
                        className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="키워드 수정"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>

                    <div className="h-4 w-px bg-gray-200 shrink-0 mx-1" />

                    {/* Description Section */}
                    <div className="flex-1 flex items-center gap-3 min-w-0 group relative">
                      <p className="text-[13px] text-gray-500 font-medium leading-relaxed truncate">
                        {content.scenes[activeSceneIndex].description}
                      </p>
                      
                      <button 
                        onClick={() => {
                          setEditingSceneIndex(activeSceneIndex);
                          setEditSceneValues({
                            keyword: content.scenes[activeSceneIndex].keyword,
                            description: content.scenes[activeSceneIndex].description
                          });
                        }}
                        className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        title="가이드 수정"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>

                    {/* Quick Action */}
                    <button 
                      onClick={() => fetchCandidates(activeSceneIndex, 'all', selectedAiModel)}
                      className="ml-auto flex items-center gap-2 px-2 py-0.5 rounded-xl text-[10px] font-black transition-all border border-indigo-100 text-indigo-600 hover:bg-indigo-50 bg-white whitespace-nowrap shadow-sm active:scale-95"
                    >
                      <RefreshCw size={14} className={(fetchingIndices.has(`${activeSceneIndex}-ai`) || fetchingIndices.has(`${activeSceneIndex}-search`)) ? "animate-spin" : ""} />
                      다시 생성
                    </button>
                    <button
                      onClick={openRefine}
                      title="선택한 클립을 참고해 이 씬 대본만 다듬기"
                      className="flex items-center gap-2 px-2 py-0.5 rounded-xl text-[10px] font-black transition-all border border-amber-200 text-amber-600 hover:bg-amber-50 bg-white whitespace-nowrap shadow-sm active:scale-95"
                    >
                      <Sparkles size={14} />
                      대본 다듬기
                    </button>
                  {(() => {
                    const line = content.script.find((s) => s.scene_index === activeSceneIndex)?.text || '';
                    const guide = (content.scenes[activeSceneIndex] as { filming_guide?: string })?.filming_guide || '';
                    if (!line && !guide) return null;
                    return (
                      <div className="w-full mt-0.5 flex items-start gap-3 px-1">
                        {line ? (
                          <div className="flex-1 flex items-start gap-1.5 min-w-0">
                            <span className="shrink-0 px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded-md text-[9px] font-black">자막</span>
                            <p className="text-[10px] text-gray-600 font-medium leading-snug truncate" title={line}>{line}</p>
                          </div>
                        ) : null}
                        {guide ? (
                          <div className="flex-1 flex items-start gap-1.5 min-w-0">
                            <span className="shrink-0 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[9px] font-black">촬영</span>
                            <p className="text-[10px] text-gray-600 font-medium leading-snug truncate" title={guide}>{guide}</p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                  </motion.div>
                )}
              </div>
            </div>
          </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 custom-scrollbar">
          <div className="flex flex-col gap-0">
                {[
                  { title: 'AI 생성 이미지', items: visualCandidates[activeSceneIndex]?.ai || [], Icon: Sparkles, type: 'ai' },
                  { title: '웹 검색 이미지', items: visualCandidates[activeSceneIndex]?.search || [], Icon: Cloud, type: 'search' }
                ].map((section, sIdx) => (
                  <div key={sIdx} className={`flex flex-col gap-2 ${section.type === 'search' ? 'mt-2 pt-2 border-t border-gray-50' : ''}`}>
                    <div className="flex items-center justify-between px-1 pt-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1 rounded-lg ${section.type === 'ai' ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-sky-500 text-white shadow-sky-100'} shadow-md`}>
                          <section.Icon size={12} />
                        </div>
                        <div>
                          <h4 className="text-[11px] font-black text-gray-900 tracking-tight leading-none">{section.title}</h4>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[8.5px] text-gray-400 font-bold tracking-tighter">
                              {section.items?.length || 0}개 발견
                            </span>
                            <div className="w-0.5 h-0.5 rounded-full bg-gray-200" />
                            <span className="text-[8.5px] text-indigo-500 font-black uppercase tracking-widest">
                              {section.type === 'ai' ? selectedAiModel : '전체 검색'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                          <div className={`w-1 h-1 rounded-full ${fetchingIndices.has(`${activeSceneIndex}-${section.type}`) ? 'bg-amber-400 animate-pulse' : 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]'}`} />
                          <span className="text-[8.5px] font-black text-gray-500 uppercase tracking-widest">
                            {fetchingIndices.has(`${activeSceneIndex}-${section.type}`) ? '생성 중' : '안정'}
                          </span>
                        </div>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setVisualCandidates(prev => {
                              const current = prev[activeSceneIndex] || { ai: [], search: [], graph: [] };
                              return {
                                ...prev,
                                [activeSceneIndex]: {
                                  ...current,
                                  ai: section.type === 'ai' ? [] : current.ai,
                                  search: section.type === 'search' ? [] : current.search
                                }
                              };
                            });
                            fetchCandidates(activeSceneIndex, section.type as 'ai' | 'search', selectedAiModel, false, undefined, true);
                          }}
                          disabled={fetchingIndices.has(`${activeSceneIndex}-${section.type}`)}
                          className="p-1 rounded-lg bg-white text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all border border-gray-100 shadow-sm disabled:opacity-50 active:scale-90"
                          title="새로고침 (캐시 무시하고 새로 수집)"
                        >
                          <RefreshCw size={11} className={fetchingIndices.has(`${activeSceneIndex}-${section.type}`) ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence mode="popLayout" initial={false}>
                      {section.items && section.items.length > 0 ? (
                        <motion.div 
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          ref={(el) => { rowRefs.current.ai = el; }}
                          className="flex gap-3 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group/row relative"
                        >
                          {rowArrow('ai', -1)}
                          {section.items.map((candidate, cIdx) => {
                            const isSelected = selectedVisuals[activeSceneIndex]?.includes(candidate.url);
                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                                transition={{ 
                                  type: "spring",
                                  stiffness: 200,
                                  damping: 25,
                                  delay: cIdx * 0.03
                                }}
                                key={candidate.url}
                                className={`group relative aspect-video w-40 sm:w-44 shrink-0 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                                  isSelected 
                                  ? 'border-indigo-600 ring-8 ring-indigo-50 shadow-2xl scale-[1.02] z-10' 
                                  : 'border-gray-50 hover:border-indigo-200 hover:shadow-xl shadow-md'
                                }`}
                                onClick={() => {
                                  setSelectedVisuals(prev => {
                                    const current = prev[activeSceneIndex] || [];
                                    const isAlreadySelected = current.includes(candidate.url);
                                    
                                    if (isAlreadySelected) {
                                      // 해제: 선택된 목록에서 제거
                                      return {
                                        ...prev,
                                        [activeSceneIndex]: current.filter(url => url !== candidate.url)
                                      };
                                    } else {
                                      // 추가: 장면당 최대 3개
                                      if (current.length >= 3) {
                                        alert('한 장면당 최대 3개까지 선택할 수 있습니다.');
                                        return prev;
                                      }
                                      if (!canAddClip(activeSceneIndex, current.length, minSecFor(activeSceneIndex, candidate.url))) return prev;
                                      return {
                                        ...prev,
                                        [activeSceneIndex]: [...current, candidate.url]
                                      };
                                    }
                                  });
                                }}
                              >
                                <img
                                  src={assetUrl(candidate.url)}
                                  className={`w-full h-full object-cover transition-transform duration-1000 ${isSelected ? 'scale-110' : 'group-hover:scale-115'}`}
                                  alt=""
                                  loading="lazy"
                                />
                                <div className={`absolute inset-0 bg-gradient-to-t transition-opacity duration-500 ${isSelected ? 'from-indigo-900/60 opacity-100' : 'from-black/90 opacity-0 group-hover:opacity-100'}`} />
                                
                                {/* Selection Indicator (Number based on selection order) */}
                                {isSelected && (
                                  <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute top-2 right-2 bg-indigo-600 text-white w-5 h-5 flex items-center justify-center rounded-full shadow-lg ring-2 ring-white/20 text-[10px] font-black z-20"
                                  >
                                    {(selectedVisuals[activeSceneIndex]?.indexOf(candidate.url) || 0) + 1}
                                  </motion.div>
                                )}
                                {isSelected && (selectedVisuals[activeSceneIndex]?.length || 0) > 1 && (
                                  <div className="absolute top-2 left-2 flex gap-1 z-20" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      title="앞으로 이동"
                                      onClick={(e) => { e.stopPropagation(); moveClip(activeSceneIndex, candidate.url, -1); }}
                                      className="w-5 h-5 rounded-md bg-black/60 hover:bg-black/80 text-white text-[10px] font-black flex items-center justify-center"
                                    >
                                      ‹
                                    </button>
                                    <button
                                      title="뒤로 이동"
                                      onClick={(e) => { e.stopPropagation(); moveClip(activeSceneIndex, candidate.url, 1); }}
                                      className="w-5 h-5 rounded-md bg-black/60 hover:bg-black/80 text-white text-[10px] font-black flex items-center justify-center"
                                    >
                                      ›
                                    </button>
                                  </div>
                                )}

                                {/* Action Buttons (Simplified and Positioned at corners) */}
                                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 z-20">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVisualCandidates(prev => {
                                        const current = prev[activeSceneIndex];
                                        const list = section.type === 'ai' ? current.ai : current.search;
                                        return {
                                          ...prev,
                                          [activeSceneIndex]: {
                                            ...current,
                                            [section.type]: list.filter((_, i) => i !== cIdx)
                                          }
                                        };
                                      });
                                    }}
                                    className="p-1.5 bg-red-500/80 hover:bg-red-500 backdrop-blur-md text-white rounded-lg transition-all hover:scale-110 border border-white/10 shadow-lg"
                                    title="삭제"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setZoomKind('image');
                                      setZoomedImage(assetUrl(candidate.url));
                                    }}
                                    className="p-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-lg transition-all hover:scale-110 border border-white/10 shadow-lg"
                                    title="크게 보기"
                                  >
                                    <Maximize size={12} />
                                  </button>
                                </div>
                              </motion.div>
                            );
                          })}
                          
                          {/* Add More Card */}
                          {!fetchingIndices.has(`${activeSceneIndex}-${section.type}`) && (
                            <motion.button 
                              layout
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchCandidates(activeSceneIndex, section.type as 'ai' | 'search', section.type === 'ai' ? selectedAiModel : undefined, true);
                              }}
                              className="group relative aspect-video w-32 sm:w-36 shrink-0 rounded-2xl border-2 border-dashed border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center gap-2 bg-gray-50/10 shadow-sm hover:shadow-indigo-50"
                              title={`${section.title} 추가 생성/검색`}
                            >
                              <div className="w-10 h-10 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 group-hover:text-indigo-600 group-hover:scale-110 transition-all shadow-md group-hover:shadow-lg">
                                <Plus size={20} strokeWidth={3} />
                              </div>
                              <div className="text-center">
                                <span className="block text-[11px] font-black text-gray-500 group-hover:text-indigo-700 uppercase tracking-widest">추가 생성</span>
                              </div>
                            </motion.button>
                          )}

                          {/* Loading Card - Only shown during explicit 'Generate More' (isAppend) or if list is empty */}
                          {fetchingIndices.has(`${activeSceneIndex}-${section.type}`) && (section.items.length === 0 || isGeneratingAll === false) && (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="aspect-video w-32 sm:w-36 shrink-0 rounded-2xl border-2 border-indigo-100 bg-indigo-50/10 flex flex-col items-center justify-center gap-4 animate-pulse shadow-sm"
                            >
                              <div className="w-12 h-12 rounded-2xl bg-indigo-100/50 flex items-center justify-center">
                                <Loader2 size={28} className="text-indigo-600 animate-spin" />
                              </div>
                              <div className="text-center space-y-1">
                                <span className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest">생성 중</span>
                              </div>
                            </motion.div>
                          )}
                          {rowArrow('ai', 1)}
                        </motion.div>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-3 bg-gray-50/30 rounded-2xl border-2 border-gray-100 border-dashed text-gray-400 px-4 py-3"
                        >
                          <Search size={18} className="opacity-40 text-indigo-600 shrink-0" />
                          <p className="text-[11px] font-bold text-gray-500 flex-1">발견된 이미지가 없습니다</p>
                          <button 
                            onClick={() => fetchCandidates(activeSceneIndex, section.type as 'ai' | 'search', selectedAiModel)}
                            className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 active:scale-95 flex items-center gap-1.5 shrink-0"
                          >
                            <Sparkles size={13} />
                            지금 생성하기
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                {/* 스톡 비디오 (결과 그리드) */}
                <div className="shrink-0 flex flex-col gap-2 mt-2 pt-2 border-t border-gray-50">
        <div className="flex items-center justify-between px-1 pt-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-lg bg-emerald-600 text-white shadow-md">
              <Film size={12} />
            </div>
            <div>
              <h4 className="text-[11px] font-black text-gray-900 tracking-tight leading-none">스톡 비디오</h4>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[8.5px] text-gray-400 font-bold tracking-tighter">
                  {stockItems.length}개 보유
                </span>
                <div className="w-0.5 h-0.5 rounded-full bg-gray-200" />
                <span className="text-[8.5px] text-indigo-500 font-black uppercase tracking-widest">
                  Pexels
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
              <div className={`w-1 h-1 rounded-full ${fetchingStock ? 'bg-amber-400 animate-pulse' : 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]'}`} />
              <span className="text-[8.5px] font-black text-gray-500 uppercase tracking-widest">
                {fetchingStock ? '생성 중' : '안정'}
              </span>
            </div>
            <button
              onClick={() => fetchStockFor(activeSceneIndex, false, true)}
              disabled={fetchingStock}
              title="현재 장면만 스톡 추가 검색 (캐시 무시)"
              className="p-1 rounded-lg bg-white text-gray-400 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all border border-gray-100 shadow-sm disabled:opacity-50 active:scale-90"
            >
              <RefreshCw size={11} className={fetchingStock ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
                  {stockItems.length > 0 ? (
                    <div ref={(el) => { rowRefs.current.stock = el; }} className="flex gap-3 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group/row relative">
                      {rowArrow('stock', -1)}
                      {stockItems.map((item) => renderExtraCard(item))}
                      {rowArrow('stock', 1)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-gray-50/30 rounded-2xl border-2 border-gray-100 border-dashed text-gray-400 px-4 py-3">
                      <Search size={18} className="opacity-40 text-emerald-600 shrink-0" />
                      <p className="text-[11px] font-bold text-gray-500 flex-1">스톡 비디오가 없습니다</p>
                      <button
                        onClick={() => fetchStockFor(activeSceneIndex)}
                        disabled={fetchingStock}
                        className="px-4 py-1.5 bg-emerald-600 text-white rounded-xl text-[11px] font-black hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 active:scale-95 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                      >
                        <Search size={13} />
                        스톡 검색
                      </button>
                    </div>
                  )}
                </div>
                {/* 내 파일 */}
                <div className="shrink-0 flex flex-col gap-2 mt-2 pt-2 border-t border-gray-50">
                  <div className="flex items-center justify-between px-1 pt-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1 rounded-lg bg-indigo-600 text-white shadow-md">
                        <Upload size={12} />
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black text-gray-900 tracking-tight leading-none">내 파일</h4>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[8.5px] text-gray-400 font-bold tracking-tighter">
                            {uploadItems.length}개 보유
                          </span>
                          <div className="w-0.5 h-0.5 rounded-full bg-gray-200" />
                          <span className="text-[8.5px] text-indigo-500 font-black uppercase tracking-widest">
                            내 디바이스
                          </span>
                        </div>
                      </div>
                    </div>
                    <label
                      title="내 파일에 직접 파일 추가"
                      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border border-indigo-100 text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 bg-white whitespace-nowrap cursor-pointer"
                    >
                      <Upload size={11} className={uploading ? 'animate-pulse' : ''} />
                      추가
                      <input
                        type="file"
                        accept="image/*,video/mp4,video/webm,video/quicktime"
                        className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }}
                      />
                    </label>
                  </div>
                  {uploadItems.length > 0 ? (
                    <div ref={(el) => { rowRefs.current.upload = el; }} className="flex gap-3 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group/row relative">
                      {rowArrow('upload', -1)}
                      {uploadItems.map((item) => renderExtraCard(item))}
                      {rowArrow('upload', 1)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-gray-50/30 rounded-2xl border-2 border-gray-100 border-dashed text-gray-400 px-4 py-3">
                      <Upload size={18} className="opacity-40 text-indigo-600 shrink-0" />
                      <p className="text-[11px] font-bold text-gray-500 flex-1">직접 찍은 영상·사진을 올리면 여기에 표시됩니다</p>
                      <label
                        title="내 파일 직접 업로드"
                        className="shrink-0 flex items-center gap-1 px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 active:scale-95 cursor-pointer"
                      >
                        {uploading && <Loader2 size={13} className="animate-spin" />}
                        업로드
                        <input
                          type="file"
                          accept="image/*,video/mp4,video/webm,video/quicktime"
                          className="hidden"
                          onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }}
                        />
                      </label>
                    </div>
                  )}
                </div>
        </div>
        </div>
      </div>

      {/* Refine Modal */}
      {refineOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRefineOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Sparkles size={16} className="text-amber-500" />
              <p className="text-sm font-bold text-gray-800 flex-1">
                씬 {activeSceneIndex + 1} 대본 다듬기
                <span className="ml-2 text-[11px] font-medium text-gray-400">선택 클립 {(selectedVisuals[activeSceneIndex] || []).length}개 참고 · 분량·수치는 잠금</span>
              </p>
              <button onClick={() => setRefineOpen(false)} className="p-1 text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-gray-500">현재 대본</p>
                <p className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700">
                  {content.script.find((s) => s.scene_index === activeSceneIndex)?.text || '(없음)'}
                </p>
              </div>
              {!refineResult && (
                <button
                  onClick={runRefine}
                  disabled={refineLoading || (selectedVisuals[activeSceneIndex] || []).length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:bg-gray-200 transition-all"
                >
                  {refineLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  클립 분석 후 다듬기 실행
                </button>
              )}
              {refineError && (
                <p className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600">{refineError}</p>
              )}
              {refineResult?.mismatch_warning ? (
                <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                  <p className="text-xs font-black text-amber-700">클립-대본 불일치 (대본은 그대로 둠)</p>
                  <p className="text-[11px] text-amber-700">{refineResult.mismatch_warning}</p>
                </div>
              ) : null}
              {refineResult && (
                <div className="space-y-3">
                  {(refineResult.clip_notes || []).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-500">클립 분석</p>
                      {(refineResult.clip_notes || []).map((n, i) => (
                        <p key={i} className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">{n}</p>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-700">다듬어진 나레이션</p>
                    <p className="px-3 py-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs font-bold text-gray-900 leading-relaxed">
                      {refineResult.narration_ko || '(변경 없음)'}
                    </p>
                  </div>
                  {(refineResult.subtitles || []).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-700">자막 분할</p>
                      {(refineResult.subtitles || []).map((s, i) => (
                        <p key={i} className="text-[11px] text-gray-600">
                          <span className="font-bold text-teal-600">[{Number(s.start || 0).toFixed(1)}s-{Number(s.end || 0).toFixed(1)}s]</span> {s.text}
                        </p>
                      ))}
                    </div>
                  )}
                  {refineResult.sfx ? (
                    <p className="text-[11px] text-gray-600"><span className="font-black text-amber-600">효과음 </span>{refineResult.sfx}</p>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 mr-auto">적용 후 3단계에서 TTS를 다시 생성하세요.</p>
              <button
                onClick={() => setRefineOpen(false)}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-xl text-xs font-bold hover:border-gray-300"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  if (refineResult && onRefineApply) {
                    onRefineApply(activeSceneIndex, refineResult);
                    setRefineOpen(false);
                  }
                }}
                disabled={!refineResult || !onRefineApply}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:bg-gray-200"
              >
                이대로 적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Modal (이미지 + 스톡 비디오 공용) */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
          onClick={closeZoom}
        >
          <div className="absolute top-6 right-6 flex gap-2 z-10">
            <a
              href={zoomedImage}
              download
              title="원본 다운로드"
              onClick={(e) => e.stopPropagation()}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all"
            >
              <Download size={20} />
            </a>
            <button
              title="확대 이미지 닫기"
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all"
              onClick={closeZoom}
            >
              <X size={24} />
            </button>
          </div>
          {(zoomKind === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(zoomedImage)) ? (
            <video
              key={zoomedImage}
              src={zoomedImage}
              controls
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onError={() => alert('비디오를 불러오지 못했습니다. 파일이 삭제되었을 수 있습니다. 스톡을 다시 검색해주세요.')}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-500"
            />
          ) : (
            <img
              src={zoomedImage}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-500"
              alt="Zoomed"
            />
          )}
        </div>
      )}
    </div>
    </div>
  );
};

export default React.memo(Step4Visual);
