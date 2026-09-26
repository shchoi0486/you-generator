import React, { useState, useCallback, useMemo, useRef } from 'react';
import { 
  ChevronLeft, 
  Video, 
  Play, 
  Volume2,
  Type,
  Layout,
  Layers,
  Music,
  Image as ImageIcon,
  Share2,
  Folder,
  Plus,
  FileVideo,
  Upload,
  Maximize2,
  Pause,
  Sticker,
  Wand2,
  Subtitles,
  SlidersHorizontal,
  Settings2
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { type AppContent, type SceneCandidates, type ScriptItem, type ProjectMeta, type SceneLayout, type CaptionStyle, type StickerItem, assetUrl } from '../services/api';
import { customStyles } from '../constants/data';
import Timeline from './Timeline';
import PropertiesPanel from './PropertiesPanel';

interface VideoEditorProps {
  content: AppContent | null;
  setContent: React.Dispatch<React.SetStateAction<AppContent | null>>;
  loading: boolean;
  handleFinalRender: () => void;
  currentTime: number;
  videoDuration: number;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  sceneDurations: number[];
  calculateDuration: (text: string) => number;
  gapDuration: number;
  selectedVisuals: Record<number, string[]>;
  setSelectedVisuals: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  clipTrims: Record<number, Record<string, { in: number; out: number | null }>>;
  sceneLayouts: Record<number, SceneLayout>;
  setSceneLayouts: React.Dispatch<React.SetStateAction<Record<number, SceneLayout>>>;
  showSceneCaptions: boolean;
  setShowSceneCaptions: (v: boolean) => void;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  visualCandidates: Record<number, SceneCandidates>;
  setVisualCandidates: React.Dispatch<React.SetStateAction<Record<number, SceneCandidates>>>;
  subtitleStyle: {
    preset: string;
    position: string;
    show_subtitles: boolean;
    y_offset: number;
    x_offset: number;
    font: string;
    font_size: number;
    color: string;
    stroke_width: number;
    stroke_color: string;
    bg_color: string;
    text_align?: string;
  };
  setSubtitleStyle: React.Dispatch<React.SetStateAction<{
    preset: string;
    position: string;
    show_subtitles: boolean;
    y_offset: number;
    x_offset: number;
    font: string;
    font_size: number;
    color: string;
    stroke_width: number;
    stroke_color: string;
    bg_color: string;
    text_align?: string;
  }>>;
  srtData: { id: number; start: number; end: number; text: string }[];
  setSrtData: React.Dispatch<React.SetStateAction<{ id: number; start: number; end: number; text: string }[]>>;
  setSrtScriptSig: (sig: string | null) => void;
  editingSrtId: number | null;
  setEditingSrtId: (id: number | null) => void;
  setSceneDurations: React.Dispatch<React.SetStateAction<number[]>>;
  audioEdit: {
    bgm_path: string | null;
    bgm_volume: number;
    sfx_list: { path: string, time: number, volume: number }[];
  };
  setAudioEdit: React.Dispatch<React.SetStateAction<{ bgm_path: string | null; bgm_volume: number; sfx_list: { path: string, time: number, volume: number }[] }>>;
  bgmLibrary: { name: string, path: string }[];
  sfxLibrary: { name: string, path: string }[];
  getTimelineRange: (data: ScriptItem[] | undefined, currentIdx: number) => { start: string, end: string, duration: string };
  subtitlePresets: Record<string, { label: string, font_size: number, color: string, stroke_width: number, stroke_color: string, bg_color: string }>;
  aspectRatio: string;
  setAspectRatio: (ratio: string) => void;
  transition: { type: string; duration: number };
  setTransition: React.Dispatch<React.SetStateAction<{ type: string; duration: number }>>;
  videoFilter: string;
  setVideoFilter: (f: string) => void;
  sceneFilters: Record<number, string>;
  setSceneFilters: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  stickers: StickerItem[];
  setStickers: React.Dispatch<React.SetStateAction<StickerItem[]>>;
  audioUrl?: string;
  mediaFit: string;
  sceneFits: Record<number, string>;
  setSceneFits: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  mediaZoom: number;
  // Navigation Props
  showBackButton?: boolean;
  onBack?: () => void;
  backLabel?: string;
  title?: string;
  isStandalone?: boolean;
  showInitialProjectModal?: boolean;
  onCloseProjectModal?: () => void;
  handleNewProject?: (skipConfirm?: boolean) => void;
  handleLoadProject?: (id: string) => void;
}

interface AssetTabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

interface GeneratedImageItem {
  path: string;
  sceneIdx: number;
  candidate?: {
    url?: string;
  };
  source?: string;
}

export const isVideoSrc = (src: string) =>
  /\.(mp4|webm|mov)(\?|$)/i.test(src);

/** 화면 비율 정규화: 짧은 표기('9:16')와 정식 값('9:16 (Shorts)') 혼용 방지.
 *  설정 레일은 정식 값, 구 에디터 버튼은 짧은 값을 썼던 게 9:16 미반영의 원인. */
export const ASPECT_CANONICAL: Record<string, string> = {
  '16:9': '16:9 (Youtube)',
  '9:16': '9:16 (Shorts)',
  '1:1': '1:1 (Square)',
  '3:4': '3:4 (Portrait)',
  '16:9 (Youtube)': '16:9 (Youtube)',
  '9:16 (Shorts)': '9:16 (Shorts)',
  '1:1 (Square)': '1:1 (Square)',
  '3:4 (Portrait)': '3:4 (Portrait)',
};

export const normalizeAspect = (v: string): string =>
  ASPECT_CANONICAL[v] ?? '16:9 (Youtube)';

export const aspectCss = (v: string): string => {
  const c = normalizeAspect(v);
  if (c.startsWith('9:16')) return '9/16';
  if (c.startsWith('1:1')) return '1/1';
  if (c.startsWith('3:4')) return '3/4';
  return '16/9';
};

export const isPortraitAspect = (v: string): boolean => {
  const c = normalizeAspect(v);
  return c.startsWith('9:16') || c.startsWith('3:4');
};

export const resolveVisualSrc = (
  rawPath: string | undefined,
  idx: number,
  visualCandidates: Record<number, SceneCandidates>
): string => {
  if (!rawPath) return "";
  const candidate = visualCandidates[idx]?.ai?.find((v) => v.path === rawPath || v.url === rawPath) ||
                    visualCandidates[idx]?.search?.find((v) => v.path === rawPath || v.url === rawPath);
  let src = "";
  if (candidate && candidate.url) {
    src = assetUrl(candidate.url);
  } else if (rawPath.startsWith('http')) {
    src = rawPath;
  } else {
    const normalizedPath = rawPath.replace(/\\/g, '/');
    const assetsMatch = normalizedPath.match(/.*(\/assets\/.*)/);
    if (assetsMatch) {
      src = assetUrl(assetsMatch[1]);
    } else {
      const pathWithAssets = normalizedPath.startsWith('assets/') ? normalizedPath :
                             (normalizedPath.startsWith('/assets/') ? normalizedPath.substring(1) : `assets/${normalizedPath}`);
      src = assetUrl(`/${pathWithAssets}`);
    }
  }
  return src;
};

const AssetTabButton: React.FC<AssetTabButtonProps> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`w-full p-2 rounded-xl transition-all group flex flex-col items-center gap-1 ${
      active 
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
        : 'text-zinc-500 hover:text-indigo-600 hover:bg-indigo-500/5'
    }`}
    title={label}
  >
    <div className={`transition-transform group-hover:scale-110 ${active ? '' : 'text-zinc-400 group-hover:text-indigo-600'}`}>
      {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<LucideProps>, { size: 14 }) : icon}
    </div>
    <span className={`text-[7px] font-black uppercase tracking-tight truncate w-full text-center ${active ? 'text-white' : 'text-zinc-500 group-hover:text-indigo-600'}`}>
      {label}
    </span>
  </button>
);

type EditorTab = 'media' | 'sound' | 'text' | 'stickers' | 'effects' | 'transitions' | 'captions' | 'filters' | 'adjustment' | 'settings' | 'projects';

const VideoEditor: React.FC<VideoEditorProps> = ({
  content,
  setContent,
  loading = false,
  handleFinalRender,
  currentTime,
  videoDuration,
  isPlaying,
  setIsPlaying,
  setCurrentTime,
  selectedVisuals,
  setSelectedVisuals,
  clipTrims,
  sceneLayouts,
  setSceneLayouts,
  showSceneCaptions,
  setShowSceneCaptions,
  captionStyle,
  setCaptionStyle,
  visualCandidates,
  setVisualCandidates,
  subtitleStyle,
  setSubtitleStyle,
  srtData,
  setSrtData,
  setSrtScriptSig,
  setEditingSrtId,
  setSceneDurations,
  audioEdit,
  setAudioEdit,
  bgmLibrary,
  sfxLibrary,
  getTimelineRange,
  subtitlePresets,
  aspectRatio,
  setAspectRatio,
  transition,
  setTransition,
  videoFilter,
  setVideoFilter,
  sceneFilters,
  setSceneFilters,
  stickers,
  setStickers,
  audioUrl,
  mediaFit,
  sceneFits,
  setSceneFits,
  mediaZoom,
  showBackButton = false,
  onBack,
  backLabel = "Back",
  title = "ADVANCED EDITOR",
  isStandalone = false,
  showInitialProjectModal = false,
  onCloseProjectModal,
  handleNewProject,
  handleLoadProject
}) => {
  const [activeTab, setActiveTab] = useState<EditorTab>('media');
  const [searchQuery, setSearchQuery] = useState('');
  const [stickerDraft, setStickerDraft] = useState('');
  const [selectedItem, setSelectedItem] = useState<{ id: string | number; type: 'subtitle' | 'scene' | 'sfx' | 'bgm' | 'caption' | 'sticker' } | null>(null);
  const [dragScene, setDragScene] = useState<number | null>(null);
  const dragRef = useRef<{ idx: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(showInitialProjectModal);

  // Sync state with prop
  React.useEffect(() => {
    if (showInitialProjectModal) {
      setShowProjectModal(true);
    }
  }, [showInitialProjectModal]);

  // PropertiesPanel의 이전/다음 자막 이동 버튼용
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string | number; type: 'subtitle' | 'scene' | 'sfx' | 'bgm' | 'caption' | 'sticker' }>).detail;
      if (detail && detail.id !== undefined && detail.type) {
        setSelectedItem({ id: detail.id, type: detail.type });
      }
    };
    window.addEventListener('selectTimelineItem', handler as EventListener);
    return () => window.removeEventListener('selectTimelineItem', handler as EventListener);
  }, []);

  // 구 짧은 표기로 저장된 비율을 정식으로 정규화 (9:16 미반영 수정)
  React.useEffect(() => {
    const canonical = normalizeAspect(aspectRatio);
    if (canonical !== aspectRatio) setAspectRatio(canonical);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowProjectModal(false);
    onCloseProjectModal?.();
  }, [onCloseProjectModal]);

  // Subtitle dragging states
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Layout resizing states (percentages)
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(22); // 좌/우 패널 축소로 미리보기 확대
  const [rightWidth, setRightWidth] = useState(22);
  const [timelineHeight, setTimelineHeight] = useState(184); // 기본 타임라인 축소

  const startTimelineResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = timelineHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentDeltaY = startY - moveEvent.clientY;
      let newHeight = startHeight + currentDeltaY;
      if (newHeight < 120) newHeight = 120;
      if (newHeight > 420) newHeight = 420;
      setTimelineHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [timelineHeight]);

  const startLeftResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      
      let newWidth = startWidth + deltaPercent;
      if (newWidth < 15) newWidth = 15;
      if (newWidth > 40) newWidth = 40;
      
      if (100 - newWidth - rightWidth < 20) {
        newWidth = 100 - rightWidth - 20;
      }
      
      setLeftWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [leftWidth, rightWidth]);

  const startRightResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const deltaX = startX - moveEvent.clientX; // moving left increases right width
      const deltaPercent = (deltaX / containerWidth) * 100;
      
      let newWidth = startWidth + deltaPercent;
      if (newWidth < 15) newWidth = 15;
      if (newWidth > 40) newWidth = 40;
      
      if (100 - leftWidth - newWidth < 20) {
        newWidth = 100 - leftWidth - 20;
      }
      
      setRightWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [leftWidth, rightWidth]);

  // Subtitle Dragging Logic
  const handleSubtitleMouseDown = useCallback((e: React.MouseEvent, srtId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedItem({ id: srtId, type: 'subtitle' });
    setIsDraggingSubtitle(true);

    if (videoContainerRef.current) {
      const containerRect = videoContainerRef.current.getBoundingClientRect();
      const currentXPercent = subtitleStyle.x_offset ?? 50;
      const currentYPercent = subtitleStyle.y_offset ?? 90;
      
      const currentX = containerRect.left + (containerRect.width * currentXPercent / 100);
      const currentY = containerRect.top + (containerRect.height * currentYPercent / 100);

      setDragOffset({
        x: e.clientX - currentX,
        y: e.clientY - currentY
      });
    }
  }, [subtitleStyle.x_offset, subtitleStyle.y_offset]);

  const handleSubtitleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSubtitle || !videoContainerRef.current) return;
    
    const containerRect = videoContainerRef.current.getBoundingClientRect();
    
    // Calculate percentage based on container dimensions and offset
    let xPercent = ((e.clientX - dragOffset.x - containerRect.left) / containerRect.width) * 100;
    let yPercent = ((e.clientY - dragOffset.y - containerRect.top) / containerRect.height) * 100;
    
    // Clamp to 0-100%
    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));
    
    setSubtitleStyle((prev) => ({
      ...prev,
      x_offset: xPercent,
      y_offset: yPercent
    }));
  }, [isDraggingSubtitle, dragOffset, setSubtitleStyle]);

  const handleSubtitleMouseUp = useCallback(() => {
    setIsDraggingSubtitle(false);
  }, []);

  React.useEffect(() => {
    if (isDraggingSubtitle) {
      document.addEventListener('mousemove', handleSubtitleMouseMove);
      document.addEventListener('mouseup', handleSubtitleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleSubtitleMouseMove);
      document.removeEventListener('mouseup', handleSubtitleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleSubtitleMouseMove);
      document.removeEventListener('mouseup', handleSubtitleMouseUp);
    };
  }, [isDraggingSubtitle, handleSubtitleMouseMove, handleSubtitleMouseUp]);

  // Caption Dragging Logic (상단 자막 밴드: 세로 이동, OpenCut식 직접 드래그)
  const capDragRef = useRef<{ startY: number; baseY: number; moved: boolean } | null>(null);
  const handleCaptionPointerDown = useCallback((e: React.PointerEvent, sceneIdx: number) => {
    e.stopPropagation();
    setSelectedItem({ id: sceneIdx, type: 'caption' });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    capDragRef.current = { startY: e.clientY, baseY: captionStyle.y_offset ?? 7, moved: false };
  }, [captionStyle.y_offset]);
  const handleCaptionPointerMove = useCallback((e: React.PointerEvent) => {
    const d = capDragRef.current;
    if (!d || !videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    if (rect.height <= 0) return;
    const dyPct = ((e.clientY - d.startY) / rect.height) * 100;
    if (!d.moved && Math.abs(e.clientY - d.startY) < 3) return;
    d.moved = true;
    const ny = Math.max(0, Math.min(40, d.baseY + dyPct));
    setCaptionStyle((prev) => ({ ...prev, y_offset: Math.round(ny * 10) / 10 }));
  }, [setCaptionStyle]);
  const handleCaptionPointerUp = useCallback(() => {
    capDragRef.current = null;
  }, []);

  // Scene corner-resize Logic (OpenCut식 코너 핸들 확대/축소)
  const resizeRef = useRef<{ startDist: number; baseScale: number } | null>(null);
  const handleCornerPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedItem({ id: idx, type: 'scene' });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (!videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startDist = Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy));
    const baseScale = sceneLayouts[idx]?.scale ?? 1;
    resizeRef.current = { startDist, baseScale };
  }, [sceneLayouts]);
  const handleCornerPointerMove = useCallback((e: React.PointerEvent, idx: number) => {
    const r = resizeRef.current;
    if (!r || !videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy));
    const ns = Math.min(3, Math.max(1, r.baseScale * (dist / r.startDist)));
    setSceneLayouts((prev) => ({
      ...prev,
      [idx]: { scale: Math.round(ns * 100) / 100, x: prev[idx]?.x ?? 0, y: prev[idx]?.y ?? 0 },
    }));
  }, [setSceneLayouts]);
  const handleCornerPointerUp = useCallback(() => {
    resizeRef.current = null;
  }, []);

  // Esc로 선택 해제
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // force show editor UI if isStandalone is true, even if menu doesn't match perfectly
  // This helps when the parent might be slightly out of sync but wants to show this component.
  
  console.log('VideoEditor rendering, content:', !!content, 'isStandalone:', isStandalone);

  const projectsListStr = localStorage.getItem('video-creator-projects-list') || '[]';
  let projectsList: ProjectMeta[] = [];
  try {
    projectsList = JSON.parse(projectsListStr).sort((a: ProjectMeta, b: ProjectMeta) => {
      const timeA = a.lastModified ? new Date(a.lastModified as string).getTime() : 0;
      const timeB = b.lastModified ? new Date(b.lastModified as string).getTime() : 0;
      return timeB - timeA;
    });
  } catch (e) {
    console.error('Failed to parse projects list', e);
  }

  const handleDeleteItem = useCallback((id?: string | number, type?: 'subtitle' | 'sfx' | 'bgm' | 'caption' | 'sticker') => {
    const targetType = type || selectedItem?.type;
    const targetId = id !== undefined ? id : selectedItem?.id;

    if (!targetType || targetId === undefined) return;

    if (targetType === 'sticker') {
      setStickers((prev) => prev.filter((s) => s.id !== String(targetId)));
      setSelectedItem(null);
      return;
    }

    if (targetType === 'caption' && content) {
      const sceneIdx = typeof targetId === 'number' ? targetId : parseInt(String(targetId));
      setContent((prev) => {
        if (!prev?.scenes?.[sceneIdx]) return prev;
        const newScenes = [...prev.scenes];
        newScenes[sceneIdx] = { ...newScenes[sceneIdx], subtitle: '' };
        return { ...prev, scenes: newScenes };
      });
      setSelectedItem(null);
      return;
    }

    if (targetType === 'subtitle' && content) {
      const targetIdx = srtData.findIndex(s => s.id === targetId);
      if (targetIdx !== -1) {
        const target = srtData[targetIdx];
        const si = (target as { scene?: number }).scene ?? targetIdx;
        const chunkCount = srtData.filter((s) => (s as { scene?: number }).scene === si).length;
        // A. Update SRT Data (자막 조각만 삭제)
        const updatedSrtData = srtData.filter(s => s.id !== targetId);
        setSrtData(updatedSrtData);
        setEditingSrtId(null);

        // 분할되지 않은 단일 자막이면 기존처럼 씬까지 함께 삭제
        if (chunkCount <= 1) {
          // B. Update Content
          const updatedScript = content.script.filter((_, idx) => idx !== si);
          const updatedScenes = content.scenes.filter((_, idx) => idx !== si);

          updatedScript.forEach((item, idx) => {
            item.scene_index = idx;
          });

          setContent({
            script: updatedScript,
            scenes: updatedScenes
          });
          // 자막 데이터와 대본이 함께 바뀌었으므로 서명 동기화 (오경고 방지)
          setSrtScriptSig(updatedScript.map((s) => `${s.speaker}:${s.text}`).join('\n'));

          // Update Selected Visuals & Candidates
          const newSelectedVisuals: Record<number, string[]> = {};
          const newVisualCandidates: Record<number, SceneCandidates> = {};

          Object.entries(selectedVisuals).forEach(([idxStr, visuals]) => {
            const idx = parseInt(idxStr);
            if (idx < si) {
              newSelectedVisuals[idx] = visuals;
            } else if (idx > si) {
              newSelectedVisuals[idx - 1] = visuals;
            }
          });

          Object.entries(visualCandidates).forEach(([idxStr, candidates]) => {
            const idx = parseInt(idxStr);
            if (idx < si) {
              newVisualCandidates[idx] = candidates;
            } else if (idx > si) {
              newVisualCandidates[idx - 1] = candidates;
            }
          });

          setSelectedVisuals(newSelectedVisuals);
          setVisualCandidates(newVisualCandidates);

          // D. Reset Scene Durations
          setSceneDurations([]);
        }
        // 분할된 조각 삭제는 자막만 제거 (씬·대본 유지)
      }
    } else if (targetType === 'sfx') {
      const idx = typeof targetId === 'string' ? parseInt(targetId.split('-')[1]) : (targetId as number);
      setAudioEdit((prev) => ({
        ...prev,
        sfx_list: prev.sfx_list.filter((_, i) => i !== idx)
      }));
    } else if (targetType === 'bgm') {
      setAudioEdit((prev) => ({ ...prev, bgm_path: null }));
    }
    setSelectedItem(null);
  }, [selectedItem, srtData, content, selectedVisuals, visualCandidates, setSrtData, setEditingSrtId, setContent, setSelectedVisuals, setVisualCandidates, setSceneDurations, setAudioEdit, setStickers]);

  // Sticker Dragging Logic (세로 이동)
  const stickerDragRef = useRef<{ startY: number; baseY: number } | null>(null);
  const handleStickerPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setSelectedItem({ id, type: 'sticker' });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const cur = stickers.find((s) => s.id === id);
    stickerDragRef.current = { startY: e.clientY, baseY: cur?.y ?? 50 };
  }, [stickers]);
  const handleStickerPointerMove = useCallback((e: React.PointerEvent, id: string) => {
    const d = stickerDragRef.current;
    if (!d || !videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    if (rect.height <= 0) return;
    const ny = Math.max(2, Math.min(98, d.baseY + ((e.clientY - d.startY) / rect.height) * 100));
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, y: Math.round(ny * 10) / 10 } : s)));
  }, [setStickers]);
  const handleStickerPointerUp = useCallback(() => {
    stickerDragRef.current = null;
  }, []);

  // 현재 재생 위치의 장면 인덱스 (스티커 추가용)
  const currentSceneIdx = (() => {
    if (!content?.scenes) return 0;
    const idx = (content.scenes || []).findIndex((_, sIdx) => {
      const r = getTimelineRange(content?.script, sIdx);
      return currentTime >= parseFloat(r.start) && currentTime <= parseFloat(r.end);
    });
    return idx === -1 ? 0 : idx;
  })();

  const addSticker = useCallback((text: string) => {
    const t = text.trim().slice(0, 20);
    if (!t || !content?.scenes) return;
    const r = getTimelineRange(content?.script, currentSceneIdx);
    const s = parseFloat(r.start);
    const e = parseFloat(r.end);
    const id = `stk-${Date.now()}`;
    setStickers((prev) => [...prev, {
      id, text: t, scene: currentSceneIdx,
      start: Math.round(s * 10) / 10, end: Math.round(e * 10) / 10,
      y: 50, size: 36, color: '#FFFFFF',
    }]);
    setSelectedItem({ id, type: 'sticker' });
  }, [content, currentSceneIdx, getTimelineRange, setStickers]);

  const allGeneratedImages = useMemo(() => {
    if (!content?.scenes) return [];
    const items = content.scenes.flatMap((scene, sceneIdx) => {
      const aiImages = scene.ai_images;
      if (!Array.isArray(aiImages)) return [];
      return aiImages
        .map((img) => {
          if (!img || typeof img !== 'object') return null;
          const raw = img as Record<string, unknown>;
          const candidateRaw = raw.candidate;
          const candidate = candidateRaw && typeof candidateRaw === 'object'
            ? (candidateRaw as { url?: string })
            : undefined;
          return {
            ...raw,
            path: typeof raw.path === 'string' ? raw.path : '',
            sceneIdx,
            candidate
          } as GeneratedImageItem;
        })
        .filter((img): img is GeneratedImageItem => img !== null);
    }
    );
    // Step4에서 고른 검색/그래프 후보도 라이브러리에 합류 (씬 장면 풀과 중복 제외)
    try {
      const seen = new Set(items.map((i) => i.path).filter(Boolean));
      (['ai', 'search', 'graph'] as const).forEach((kind) => {
        Object.entries(visualCandidates || {}).forEach(([sIdx, cands]) => {
          const list = ((cands as unknown) as Record<string, Array<{ path?: string; url?: string }>>)[kind] || [];
          list.forEach((c) => {
            const key = (c && (c.path || c.url)) || '';
            if (!key || seen.has(key)) return;
            seen.add(key);
            items.push({
              path: key,
              sceneIdx: Number(sIdx) || 0,
              candidate: { url: c.url || key },
              source: kind,
            });
          });
        });
      });
    } catch { /* 후보 합류 실패해도 장면 풀은 표시 */ }
    return items;
  }, [content, visualCandidates]);

  return (
    <div className="flex-1 w-full flex flex-col min-h-0 min-w-0 bg-white text-zinc-800 font-sans">
      <style>{customStyles}</style>
      {/* Project Selection Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-zinc-100 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
                  <Video size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-zinc-900 tracking-tight">시작하기</h2>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">새 프로젝트를 만들거나 기존 프로젝트를 불러오세요</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Options Section */}
                <div className="flex flex-col gap-6">
                  {/* New Project Option */}
                  <button
                    onClick={() => {
                      handleNewProject?.(true);
                      handleCloseModal();
                    }}
                    className="group flex flex-col items-center text-center p-6 rounded-3xl border-2 border-zinc-100 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all duration-300"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm">
                      <Plus size={28} />
                    </div>
                    <h3 className="text-base font-black text-zinc-900 mb-1">새 프로젝트</h3>
                    <p className="text-[10px] font-bold text-zinc-500">새로운 영상을 처음부터 제작합니다</p>
                  </button>

                  {/* Continue Current Option (Only if content exists) */}
                  {content && (
                    <button
                      onClick={() => handleCloseModal()}
                      className="group flex flex-col items-center text-center p-6 rounded-3xl border-2 border-indigo-100 bg-indigo-50/20 hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-300"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-3 group-hover:scale-110 group-hover:rotate-3 shadow-md shadow-indigo-500/20">
                        <Play size={28} className="ml-1" />
                      </div>
                      <h3 className="text-base font-black text-zinc-900 mb-1">현재 작업 계속하기</h3>
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-tighter italic">작업 중인 프로젝트가 있습니다</p>
                    </button>
                  )}
                </div>

                {/* Load Project Option */}
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest px-2">최근 프로젝트</h3>
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {projectsList.length > 0 ? (
                      projectsList.map((project) => (
                        <button
                          key={project.id}
                          onClick={() => {
                            handleLoadProject?.(project.id as string);
                            handleCloseModal();
                          }}
                          className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-100 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                            <FileVideo size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-black text-zinc-900 truncate">{project.projectName || '제목 없는 프로젝트'}</h4>
                            <p className="text-[10px] font-bold text-zinc-400">
                              {project.lastModified ? new Date(project.lastModified).toLocaleString() : '날짜 정보 없음'}
                            </p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                        <Folder size={24} className="text-zinc-300 mb-2" />
                        <p className="text-[10px] font-bold text-zinc-400">저장된 프로젝트가 없습니다</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end">
              <button 
                onClick={() => handleCloseModal()}
                className="px-6 py-2 text-xs font-black text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-widest"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar - OpenCut 스타일 라이트 모드 (Step5 공간 확보용 슬림) */}
            <div className="h-10 bg-white border-b border-zinc-200 flex flex-wrap items-center justify-between px-4 shrink-0 z-50 shadow-sm min-w-0 gap-y-1">
        <div className="flex items-center gap-8 min-w-0">
          <div className="flex items-center gap-3 pr-8 border-r border-zinc-200 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-white/10">
              <Video size={16} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <h2 className="text-sm font-black text-blue-900 tracking-tighter leading-none">{title}</h2>
              <p className="text-[8px] font-bold text-zinc-500 mt-0.5 tracking-widest uppercase">Production Suite</p>
            </div>
          </div>
          
          {showBackButton && (
            <div className="flex items-center gap-2 bg-blue-100 p-1 rounded-xl border border-blue-200 shrink-0">
              <button 
                onClick={onBack}
                className="px-4 py-1.5 hover:bg-blue-200 text-blue-700 hover:text-blue-900 font-bold rounded-lg transition-all flex items-center gap-2 text-[11px] group"
              >
                <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" /> 
                {backLabel}
              </button>
            </div>
          )}

          <button 
            onClick={() => setShowProjectModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-[10px] transition-all border border-zinc-200 shadow-sm shrink-0"
            title="Project Selection"
          >
            <Folder size={14} /> 프로젝트 선택
          </button>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 ml-auto">
          <div className="flex items-center gap-1 bg-blue-100 p-1 rounded-xl border border-blue-200 scale-90 sm:scale-100">
            {[
              { short: '16:9', full: '16:9 (Youtube)' },
              { short: '9:16', full: '9:16 (Shorts)' },
              { short: '1:1', full: '1:1 (Square)' },
              { short: '3:4', full: '3:4 (Portrait)' },
            ].map((o) => (
              <button
                key={o.full}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${normalizeAspect(aspectRatio) === o.full ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-700 hover:bg-blue-100'}`}
                onClick={() => setAspectRatio(o.full)}
                title={o.full}
              >
                {o.short}
              </button>
            ))}
          </div>
          
          <button 
            onClick={handleFinalRender}
            disabled={loading}
            className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 text-white rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-[0.1em] sm:tracking-[0.2em] shadow-xl shadow-indigo-500/20 transition-all active:scale-95 group shrink-0"
          >
            <Share2 size={16} className="group-hover:rotate-12 transition-transform" /> Export
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 min-w-0 p-2 pt-1 bg-zinc-50/50 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 min-w-0 gap-2">
          <div className="flex-1 flex min-h-0 min-w-0 mr-2" ref={containerRef}>
            <div className="flex h-full min-w-0 shrink-0 gap-2" style={{ width: `calc(${leftWidth}% - 8px)` }}>
              <div className="w-[56px] bg-blue-50/80 backdrop-blur-sm border border-zinc-200 rounded-2xl flex flex-col items-center py-4 gap-4 shrink-0 z-40 shadow-sm overflow-y-auto no-scrollbar max-h-full">
                <div className="flex flex-col gap-2 w-full px-1.5">
                  <AssetTabButton active={activeTab === 'media'} onClick={() => setActiveTab('media')} icon={<ImageIcon size={16} />} label="Media" />
                  <AssetTabButton active={activeTab === 'sound'} onClick={() => setActiveTab('sound')} icon={<Music size={16} />} label="Sound" />
                  <AssetTabButton active={activeTab === 'text'} onClick={() => setActiveTab('text')} icon={<Type size={16} />} label="Text" />
                  <AssetTabButton active={activeTab === 'stickers'} onClick={() => setActiveTab('stickers')} icon={<Sticker size={16} />} label="Stickers" />
                  <AssetTabButton active={activeTab === 'effects'} onClick={() => setActiveTab('effects')} icon={<Wand2 size={16} />} label="Effects" />
                  <AssetTabButton active={activeTab === 'transitions'} onClick={() => setActiveTab('transitions')} icon={<Layout size={16} />} label="Transitions" />
                  <AssetTabButton active={activeTab === 'captions'} onClick={() => setActiveTab('captions')} icon={<Subtitles size={16} />} label="Captions" />
                  <AssetTabButton active={activeTab === 'filters'} onClick={() => setActiveTab('filters')} icon={<Layers size={16} />} label="Filters" />
                  <AssetTabButton active={activeTab === 'adjustment'} onClick={() => setActiveTab('adjustment')} icon={<SlidersHorizontal size={16} />} label="Adjustment" />
                  <AssetTabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings2 size={16} />} label="Settings" />
                </div>
                
                <div className="mt-auto flex flex-col items-center gap-2 w-full px-1 pb-2">
                  <button className="w-full p-2 text-zinc-600 hover:text-indigo-500 hover:bg-indigo-50/50 rounded-xl transition-all group flex flex-col items-center gap-1" title="Layers">
                    <Layers size={16} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[7px] font-black uppercase tracking-tight">Layers</span>
                  </button>
                  <div className="w-9 h-9 rounded-2xl bg-blue-100 border border-blue-300 flex items-center justify-center overflow-hidden hover:border-blue-500 transition-all cursor-pointer group hover:shadow-md hover:shadow-blue-500/20 shrink-0">
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center text-[10px] font-black text-white group-hover:scale-110 transition-transform">AI</div>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 bg-white border border-zinc-200 rounded-xl flex flex-col shrink-0 overflow-hidden shadow-sm z-30">
                <div className="p-3 border-b border-zinc-200 bg-gradient-to-b from-blue-50/50 to-transparent">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.16em]">
                      {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Library
                    </h3>
                  </div>
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search resources..." 
                      className="w-full bg-zinc-100 border border-zinc-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-zinc-500 text-zinc-800 shadow-sm"
                    />
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {activeTab === 'projects' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2 px-1">
                          Quick Actions
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => handleNewProject?.()}
                            className="flex-1 min-w-[60px] flex flex-col items-center gap-1 p-1.5 bg-white border border-zinc-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 transition-all group shadow-sm text-center"
                            title="Create New Video"
                          >
                            <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shrink-0">
                              <Plus size={12} />
                            </div>
                            <span className="text-[8px] font-black text-zinc-800 uppercase tracking-tight leading-tight">New</span>
                          </button>

                          <button 
                            onClick={() => {
                              // Handle local upload
                            }}
                            className="flex-1 min-w-[60px] flex flex-col items-center gap-1 p-1.5 bg-white border border-zinc-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group shadow-sm text-center"
                            title="Upload Local"
                          >
                            <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform shrink-0">
                              <Upload size={12} />
                            </div>
                            <span className="text-[8px] font-black text-zinc-800 uppercase tracking-tight leading-tight">Upload</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-zinc-100">
                        <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2 px-1">
                          My Projects
                        </h4>
                        <div className="grid grid-cols-1 gap-1.5">
                          {projectsList.length === 0 ? (
                            <div className="py-6 text-center bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                              <p className="text-[10px] font-bold text-zinc-400">No projects found</p>
                            </div>
                          ) : (
                            projectsList
                              .filter(p => !searchQuery || p.projectName.toLowerCase().includes(searchQuery.toLowerCase()))
                              .map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => handleLoadProject?.(p.id)}
                                  className={`flex items-center justify-between p-1.5 rounded-xl border transition-all group shadow-sm ${
                                    content?.projectId === p.id 
                                      ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400/20' 
                                      : 'bg-white border-zinc-200 hover:border-blue-400 hover:bg-blue-50/30'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                      content?.projectId === p.id ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-500 group-hover:bg-blue-100 group-hover:text-blue-600'
                                    }`}>
                                      <Folder size={11} />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0">
                                      <span className={`text-[9px] font-black uppercase tracking-tight truncate w-full ${
                                        content?.projectId === p.id ? 'text-blue-900' : 'text-zinc-800'
                                      }`}>
                                        {p.projectName || 'Untitled Project'}
                                      </span>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[6px] text-zinc-400 font-bold">
                                          {new Date(p.lastModified).toLocaleDateString()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {content?.projectId === p.id && (
                                    <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
                                  )}
                                </button>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'media' && (
                     <div className="space-y-6">
                       <div className="space-y-2">
                         <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2 px-1">
                           Quick Actions
                         </h4>
                         <div className="flex flex-wrap gap-2">
                           <button 
                             onClick={() => handleNewProject?.()}
                             className="flex-1 min-w-[60px] flex flex-col items-center gap-1 p-1.5 bg-white border border-zinc-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 transition-all group shadow-sm text-center"
                             title="Create New Video"
                           >
                             <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shrink-0">
                               <Plus size={12} />
                             </div>
                             <span className="text-[8px] font-black text-zinc-800 uppercase tracking-tight leading-tight">New</span>
                           </button>

                           <button 
                             onClick={() => setActiveTab('projects')}
                             className="flex-1 min-w-[60px] flex flex-col items-center gap-1 p-1.5 bg-white border border-zinc-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50/50 transition-all group shadow-sm text-center"
                             title="Load Project"
                           >
                             <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform shrink-0">
                               <Folder size={12} />
                             </div>
                             <span className="text-[8px] font-black text-zinc-800 uppercase tracking-tight leading-tight">Load</span>
                           </button>

                           <button 
                             onClick={() => {
                               // Handle local upload
                             }}
                             className="flex-1 min-w-[60px] flex flex-col items-center gap-1 p-1.5 bg-white border border-zinc-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group shadow-sm text-center"
                             title="Upload Local"
                           >
                             <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform shrink-0">
                               <Upload size={12} />
                             </div>
                             <span className="text-[8px] font-black text-zinc-800 uppercase tracking-tight leading-tight">Upload</span>
                           </button>
                         </div>
                       </div>

                       <div className="pt-2 border-t border-zinc-100">
                        <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2 px-1">
                          <ImageIcon size={12} /> Project Media
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          {!content && (
                            <div className="col-span-2 py-12 flex flex-col items-center justify-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                              <ImageIcon size={24} className="text-zinc-300 mb-2" />
                              <span className="text-[9px] font-bold text-zinc-400">Load a project first</span>
                            </div>
                          )}
                          {allGeneratedImages
                            .filter(img => !searchQuery || img.path.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map((img, idx) => {
                              let src = "";
                              if (img.candidate && img.candidate.url) {
                                src = assetUrl(img.candidate.url);
                              } else if (img.path.startsWith('http')) {
                                src = img.path;
                              } else {
                                const normalizedPath = img.path.replace(/\\/g, '/');
                                const assetsMatch = normalizedPath.match(/.*(\/assets\/.*)/);
                                if (assetsMatch) {
                                  src = assetUrl(assetsMatch[1]);
                                } else {
                                  const pathWithAssets = normalizedPath.startsWith('assets/') ? normalizedPath :
                                                        (normalizedPath.startsWith('/assets/') ? normalizedPath.substring(1) : `assets/${normalizedPath}`);
                                  src = assetUrl(`/${pathWithAssets}`);
                                }
                              }
                              return (
                                <div
                                  key={idx}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'media', path: img.path }));
                                  }}
                                  className="group relative aspect-video bg-zinc-100 rounded-lg overflow-hidden border border-zinc-300 hover:border-blue-500 transition-all cursor-grab active:cursor-grabbing shadow-sm"
                                  title="클릭: 현재 장면에 배치/해제 · 드래그: 타임라인에 배치"
                                  onClick={() => {
                                    // 클릭 = 현재 장면(선택된 씬 or 재생 위치 씬)에 배치/해제
                                    const target = selectedItem?.type === 'scene' && typeof selectedItem.id === 'number'
                                      ? selectedItem.id
                                      : currentSceneIdx;
                                    const key = img.path;
                                    if (!key) return;
                                    setSelectedVisuals((prev) => {
                                      const cur = prev[target] || [];
                                      if (cur.includes(key)) {
                                        return { ...prev, [target]: cur.filter((u) => u !== key) };
                                      }
                                      if (cur.length >= 3) {
                                        alert('한 장면당 최대 3개까지 배치할 수 있습니다.');
                                        return prev;
                                      }
                                      // 클립당 최소 노출 가드 (이미지 2.5초 / 영상 1.5초)
                                      try {
                                        const r = getTimelineRange(content?.script, target);
                                        const dur = parseFloat(r.duration) || 0;
                                        const urls = [...cur, key];
                                        const minSec = urls.some((u) => isVideoSrc(u)) ? 1.5 : 2.5;
                                        if (dur > 0 && dur / urls.length < minSec) {
                                          const ok = window.confirm(
                                            `씬 길이(${dur.toFixed(1)}초)에 배치하면 클립당 ${(dur / urls.length).toFixed(1)}초로 짧아집니다.\n` +
                                            `화면만 빠르게 전환하는 B-roll 연출로 사용하시겠습니까?`
                                          );
                                          if (!ok) return prev;
                                        }
                                      } catch { /* 시간 계산 실패해도 배치 허용 */ }
                                      return { ...prev, [target]: [...cur, key] };
                                    });
                                    setSelectedItem({ id: target, type: 'scene' });
                                  }}
                                >
                                  <img src={src} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Asset" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Play size={16} className="text-white fill-white" />
                                  </div>
                                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-black text-white border border-white/10">
                                    S{img.sceneIdx + 1}
                                  </div>
                                  {(() => {
                                    const placed = Object.entries(selectedVisuals || {})
                                      .filter(([, urls]) => (urls as string[]).includes(img.path))
                                      .map(([s]) => Number(s) + 1);
                                    if (placed.length === 0) return null;
                                    return (
                                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-indigo-600 rounded text-[8px] font-black text-white shadow">
                                        ✓ S{placed.join(',S')}
                                      </div>
                                    );
                                  })()}
                                  {img.source && img.source !== 'ai' && (
                                    <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-black text-amber-300 border border-white/10">
                                      {img.source === 'search' ? '검색' : img.source === 'graph' ? '그래프' : img.source}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'sound' && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Background Music</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {!content && (
                            <div className="py-12 flex flex-col items-center justify-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                              <Music size={24} className="text-zinc-300 mb-2" />
                              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">No Active Project</span>
                              <p className="text-[8px] text-zinc-400 font-bold mt-1">Load a project to add audio</p>
                            </div>
                          )}
                          {content && bgmLibrary.map((bgm, idx) => (
                            <div 
                              key={idx} 
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'bgm', path: bgm.path }));
                              }}
                              className={`group p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                audioEdit.bgm_path === bgm.path 
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                                  : 'bg-white border-zinc-200 text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50/40'
                              }`}
                              onClick={() => setAudioEdit(prev => ({ ...prev, bgm_path: bgm.path }))}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${audioEdit.bgm_path === bgm.path ? 'bg-white/20' : 'bg-zinc-100 text-zinc-600 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                  <Music size={12} />
                                </div>
                                <span className="text-[10px] font-black truncate">{bgm.name}</span>
                              </div>
                              {audioEdit.bgm_path === bgm.path && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_white]" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Sound Effects</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {!content && (
                            <div className="py-12 flex flex-col items-center justify-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                              <Volume2 size={24} className="text-zinc-300 mb-2" />
                              <span className="text-[9px] font-bold text-zinc-400">Load a project first</span>
                            </div>
                          )}
                          {content && sfxLibrary.map((sfx, idx) => (
                            <div 
                              key={idx} 
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'sfx', path: sfx.path }));
                              }}
                              className="group p-2 rounded-xl bg-white border border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all cursor-pointer flex items-center justify-between"
                              onClick={() => {
                                setAudioEdit(prev => ({
                                  ...prev,
                                  sfx_list: [...prev.sfx_list, { path: sfx.path, time: currentTime, volume: 1 }]
                                }));
                              }}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                                  <Volume2 size={12} />
                                </div>
                                <span className="text-[10px] font-black truncate">{sfx.name}</span>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
                                  <Play size={10} fill="currentColor" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'text' && (
                    <div className="space-y-6">
                      <div className="py-12 flex flex-col items-center justify-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                        <Type size={24} className="text-zinc-300 mb-2" />
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Typography Assets</span>
                        <p className="text-[8px] text-zinc-400 font-bold mt-1 text-center px-4">Text overlays and titles will be available here.</p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'stickers' && (
                    <div className="space-y-4">
                      <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">
                        스티커 (짧은 텍스트·이모지, 렌더에 반영)
                      </h4>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={stickerDraft}
                          onChange={(e) => setStickerDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { addSticker(stickerDraft); setStickerDraft(''); } }}
                          placeholder="예: 👍 최고!"
                          maxLength={20}
                          title="스티커 내용"
                          className="flex-1 min-w-0 bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => { addSticker(stickerDraft); setStickerDraft(''); }}
                          disabled={!stickerDraft.trim()}
                          title="현재 장면에 스티커 추가"
                          className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-[11px] font-black hover:bg-indigo-700 disabled:bg-zinc-200 transition-all shrink-0"
                        >
                          추가
                        </button>
                      </div>
                      <p className="text-[9px] text-zinc-400 font-bold px-1">현재 재생 위치의 장면 구간에 추가됩니다.</p>
                      <div className="space-y-1.5">
                        {stickers.length === 0 && (
                          <p className="text-[10px] text-zinc-400 font-bold text-center py-4">스티커가 없습니다</p>
                        )}
                        {stickers.map((stk) => {
                          const active = selectedItem?.type === 'sticker' && selectedItem.id === stk.id;
                          return (
                            <button
                              key={stk.id}
                              onClick={() => setSelectedItem({ id: stk.id, type: 'sticker' })}
                              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${
                                active ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-zinc-200 hover:border-zinc-300'
                              }`}
                            >
                              <span className="text-sm font-black text-zinc-800 truncate flex-1">{stk.text}</span>
                              <span className="text-[9px] font-bold text-zinc-400 shrink-0">S{stk.scene + 1}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'transitions' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">
                          장면 전환 (렌더에 반영)
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'none', label: '자르기' },
                            { id: 'crossfade', label: '크로스페이드' },
                          ].map((o) => (
                            <button
                              key={o.id}
                              onClick={() => setTransition((prev) => ({ ...prev, type: o.id }))}
                              className={`py-2 text-[10px] font-black rounded-xl border transition-all ${
                                transition.type === o.id
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                  : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {transition.type === 'crossfade' && (
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between">
                            전환 길이
                            <span className="text-indigo-500">{transition.duration.toFixed(1)}초</span>
                          </label>
                          <input
                            title="전환 길이"
                            type="range"
                            min="0.2"
                            max="1"
                            step="0.1"
                            value={transition.duration}
                            onChange={(e) => setTransition((prev) => ({ ...prev, duration: parseFloat(e.target.value) }))}
                            className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                          />
                          <p className="text-[9px] text-zinc-400 font-bold leading-relaxed">장면 길이는 그대로 유지되고 겹치는 구간만 블렌딩됩니다. 자막·음성 타이밍은 어긋나지 않습니다.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'filters' && (
                    <div className="space-y-4">
                      <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">
                        전체 컬러 필터 (렌더에 반영)
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'none', label: '없음' },
                          { id: 'bw', label: '흑백' },
                          { id: 'vivid', label: '선명하게' },
                          { id: 'bright', label: '밝게' },
                          { id: 'cinematic', label: '시네마틱' },
                        ].map((o) => (
                          <button
                            key={o.id}
                            onClick={() => setVideoFilter(o.id)}
                            className={`py-2 text-[10px] font-black rounded-xl border transition-all ${
                              videoFilter === o.id
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-zinc-400 font-bold leading-relaxed px-1">배경 영상에만 적용되고 자막에는 영향이 없습니다.</p>
                    </div>
                  )}

                  {activeTab === 'effects' && (
                    <div className="space-y-4">
                      <h4 className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">
                        자막 등장 효과 (렌더에 반영)
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'none', label: '없음' },
                          { id: 'fade', label: '페이드인' },
                          { id: 'slide', label: '슬라이드업' },
                          { id: 'typing', label: '타이핑' },
                          { id: 'pulse', label: '펄스' },
                        ].map((o) => {
                          const cur = (subtitleStyle as { animation?: string }).animation ?? 'none';
                          return (
                            <button
                              key={o.id}
                              onClick={() => setSubtitleStyle((prev) => ({ ...prev, animation: o.id }))}
                              className={`py-2 text-[10px] font-black rounded-xl border transition-all ${
                                cur === o.id
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                  : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                              }`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-zinc-400 font-bold leading-relaxed px-1">미리보기에서도 같은 효과로 표시됩니다. 상단 자막은 속성 패널에서 설정합니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div 
              className="w-2 cursor-col-resize flex items-center justify-center group z-50 shrink-0"
              onMouseDown={startLeftResize}
            >
              <div className="w-0.5 h-8 bg-zinc-300 group-hover:bg-indigo-500 rounded-full transition-colors" />
            </div>

            <div className="flex-1 flex flex-col bg-zinc-50 relative min-w-0 border border-zinc-200 rounded-xl overflow-hidden">
              {/* Video Preview Header - Project Title */}
              <div className="h-10 bg-white border-b border-zinc-200 flex items-center px-4 shrink-0 z-10">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-[11px] font-black text-indigo-600 uppercase tracking-widest truncate">
                    {content ? (content.projectName || 'Untitled Project') : 'No Project Loaded'}
                  </span>
                </div>
              </div>

              <div
                className="flex-1 flex flex-col items-center justify-center p-2 relative min-h-0 min-w-0 overflow-hidden"
                onClick={() => setSelectedItem(null)} // Click outside to deselect
              >
                  <div 
                    ref={videoContainerRef}
                    className="relative shadow-[0_0_30px_rgba(0,0,0,0.1)] transition-all duration-500 border border-zinc-300 shrink-0"
                    style={{
                      aspectRatio: aspectCss(aspectRatio),
                      maxHeight: '100%',
                      maxWidth: '100%',
                      width: isPortraitAspect(aspectRatio) ? 'auto' : '100%',
                      height: '100%',
                      backgroundColor: '#f8fafc'
                    }}
                  >
              {!content && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50/80 backdrop-blur-sm border-2 border-dashed border-zinc-200 m-4 rounded-3xl">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-6 border border-zinc-100 ring-1 ring-black/5">
                    <FileVideo size={32} className="text-blue-500" />
                  </div>
                  <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-2">No Active Project</h4>
                  <p className="text-[10px] text-zinc-500 font-bold max-w-[200px] text-center leading-relaxed">
                    Select a project from the left panel or start a new one to begin editing.
                  </p>
                </div>
              )}
              {content?.scenes?.map((_scene, idx) => {
                const range = getTimelineRange(content?.script, idx);
                const startTime = parseFloat(range.start);
                const endTime = parseFloat(range.end);
                
                if (currentTime >= startTime && currentTime <= endTime) {
                  const visuals = selectedVisuals[idx] ?? [];
                  // 씬 구간을 선택된 클립 수만큼 등분 → 현재 재생 위치의 클립을 표시
                  const segCount = Math.max(1, visuals.length);
                  const segLen = (endTime - startTime) / segCount;
                  const segIdx = Math.min(segCount - 1, Math.max(0, Math.floor((currentTime - startTime) / segLen)));
                  const segUrl = visuals[segIdx];
                  const src = resolveVisualSrc(segUrl, idx, visualCandidates);
                  const trim = (segUrl && clipTrims[idx]?.[segUrl]) || { in: 0, out: null };
                  const trimIn = Math.max(0, trim.in || 0);
                  const trimOut = trim.out != null && trim.out > trimIn ? trim.out : null;
                  const layout = sceneLayouts[idx] || { scale: 1, x: 0, y: 0 };
                  const layoutModified = Math.abs(layout.scale - 1) > 1e-6 || Math.abs(layout.x) > 1e-6 || Math.abs(layout.y) > 1e-6;

                  const isSceneSelected = selectedItem?.type === 'scene' && selectedItem.id === idx;
                  // 렌더와 동일한 맞춤으로 미리보기 (fit=포함 / fill=너비 채움·넘치면 크롭 / crop=꽉 채움)
                  // 확대(zoom)는 렌더에서 layout scale에 곱해지므로 미리보기도 동일 적용
                  const effFit = sceneFits[idx] ?? mediaFit;
                  const effScale = (layout.scale || 1) * (mediaZoom / 100);
                  const fitClass = effFit === 'fit' ? 'object-contain' : 'object-cover';
                  return (
                    <div
                      key={idx}
                      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black"
                      onClick={(e) => { e.stopPropagation(); setSelectedItem({ id: idx, type: 'scene' }); }}
                    >
                      {isSceneSelected && (
                        <>
                          <div className="absolute inset-0 z-[80] pointer-events-none ring-2 ring-inset ring-indigo-400" />
                          {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                            <div
                              key={corner}
                              onPointerDown={(e) => handleCornerPointerDown(e, idx)}
                              onPointerMove={(e) => handleCornerPointerMove(e, idx)}
                              onPointerUp={handleCornerPointerUp}
                              onPointerCancel={handleCornerPointerUp}
                              title="드래그로 확대/축소"
                              className={`absolute z-[81] w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-full shadow-md touch-none select-none ${
                                corner === 'tl' ? '-top-1 -left-1 cursor-nwse-resize' :
                                corner === 'tr' ? '-top-1 -right-1 cursor-nesw-resize' :
                                corner === 'bl' ? '-bottom-1 -left-1 cursor-nesw-resize' :
                                '-bottom-1 -right-1 cursor-nwse-resize'
                              }`}
                            />
                          ))}
                        </>
                      )}
                      {src ? (
                        <>
                          <div
                            className="absolute inset-0 flex items-center justify-center touch-none select-none"
                            style={{
                              transform: `translate(${layout.x * 100}%, ${layout.y * 100}%) scale(${effScale})`,
                              cursor: dragScene === idx ? 'grabbing' : 'grab',
                            }}
                            title="드래그로 이동 · 휠로 확대/축소 · 더블클릭 초기화"
                            onPointerDown={(e) => {
                              (e.target as Element).setPointerCapture?.(e.pointerId);
                              dragRef.current = { idx, startX: e.clientX, startY: e.clientY, baseX: layout.x, baseY: layout.y };
                              setDragScene(idx);
                            }}
                            onPointerMove={(e) => {
                              const d = dragRef.current;
                              if (!d || d.idx !== idx) return;
                              const frame = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
                              if (!frame || frame.width <= 0 || frame.height <= 0) return;
                              const nx = Math.min(0.5, Math.max(-0.5, d.baseX + (e.clientX - d.startX) / frame.width));
                              const ny = Math.min(0.5, Math.max(-0.5, d.baseY + (e.clientY - d.startY) / frame.height));
                              setSceneLayouts((prev) => ({
                                ...prev,
                                [idx]: { scale: prev[idx]?.scale ?? 1, x: nx, y: ny },
                              }));
                            }}
                            onPointerUp={() => { dragRef.current = null; setDragScene(null); }}
                            onPointerCancel={() => { dragRef.current = null; setDragScene(null); }}
                            onWheel={(e) => {
                              const ns = Math.min(3, Math.max(1, layout.scale * Math.exp(-e.deltaY * 0.0015)));
                              setSceneLayouts((prev) => ({
                                ...prev,
                                [idx]: { scale: ns, x: prev[idx]?.x ?? 0, y: prev[idx]?.y ?? 0 },
                              }));
                            }}
                            onDoubleClick={() => {
                              setSceneLayouts((prev) => {
                                const next = { ...prev };
                                delete next[idx];
                                return next;
                              });
                            }}
                          >
                            {isVideoSrc(src) ? (
                              <video
                                key={`${src}#${trimIn}-${trimOut ?? ''}`}
                                src={src}
                                className={`w-full h-full ${fitClass} pointer-events-none`}
                                muted loop playsInline preload="auto" autoPlay
                                ref={(el) => {
                                  if (!el) return;
                                  if (el.currentTime < trimIn || (trimOut != null && el.currentTime >= trimOut)) {
                                    try { el.currentTime = trimIn; } catch {}
                                  }
                                  if (isPlaying) {
                                    el.play().catch(() => {});
                                  } else {
                                    el.pause();
                                  }
                                }}
                                onTimeUpdate={(e) => {
                                  const el = e.currentTarget;
                                  if (trimOut != null && el.currentTime >= trimOut) {
                                    try { el.currentTime = trimIn; } catch {}
                                  }
                                }}
                              />
                            ) : (
                              <img
                                src={src}
                                className={`w-full h-full ${fitClass} pointer-events-none`}
                                alt={`Scene ${idx + 1}`}
                                draggable={false}
                              />
                            )}
                          </div>
                          {layoutModified && (
                            <button
                              onClick={() => {
                                setSceneLayouts((prev) => {
                                  const next = { ...prev };
                                  delete next[idx];
                                  return next;
                                });
                              }}
                              className="absolute bottom-2 left-2 z-10 px-2 py-0.5 bg-black/60 hover:bg-black/80 text-white text-[10px] font-bold rounded-md"
                              title="배치 초기화"
                            >
                              {Math.round(layout.scale * 100)}% · 초기화
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full bg-zinc-100 flex flex-col items-center justify-center gap-4 border border-zinc-300">
                          <ImageIcon size={48} className="text-zinc-400 animate-pulse" />
                          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">No visual selected</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}

              {/* Subtitle Overlay */}
              {subtitleStyle.show_subtitles && srtData.map((srt) => {
                if (currentTime >= srt.start && currentTime <= srt.end) {
                  const isSelected = selectedItem?.type === 'subtitle' && selectedItem.id === srt.id;
                  const subAnim = ((subtitleStyle as { animation?: string }).animation ?? 'none');
                  return (
                    <div
                      key={`${srt.id}-${subAnim}`}
                      className="absolute flex justify-center text-center z-[100] pointer-events-none"
                      style={{ 
                        top: `${subtitleStyle.y_offset ?? 90}%`,
                        left: `${subtitleStyle.x_offset ?? 50}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 'max-content',
                        maxWidth: '90%',
                      }}
                    >
                      <div
                        onMouseDown={(e) => handleSubtitleMouseDown(e, srt.id)}
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ id: srt.id, type: 'subtitle' }); setEditingSrtId(srt.id); }}
                        title="자막 (클릭해서 선택)"
                        className={`relative inline-block pointer-events-auto cursor-move ${
                          isSelected ? 'ring-1 ring-white ring-offset-0 border border-white border-dashed bg-black/20' : ''
                        }`}
                        style={{
                          padding: isSelected ? '4px 8px' : '0'
                        }}
                      >
                        {/* Handles when selected */}
                        {isSelected && (
                          <>
                            <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white rounded-full shadow-sm" />
                            <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white rounded-full shadow-sm" />
                            <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white rounded-full shadow-sm" />
                            <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white rounded-full shadow-sm" />
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-sm flex items-center justify-center">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.5 2v6h-6M2.13 15.57a10 10 0 1 0 5.57-12.89l-4.43 3.32"/>
                              </svg>
                            </div>
                          </>
                        )}
                        <span
                          style={{
                            fontSize: `${subtitleStyle.font_size}px`,
                            color: subtitleStyle.color,
                            fontFamily: subtitleStyle.font,
                            textAlign: (((subtitleStyle as { text_align?: string }).text_align ?? 'center') as 'left' | 'center' | 'right'),
                            WebkitTextStroke: `${subtitleStyle.stroke_width}px ${subtitleStyle.stroke_color}`,
                            backgroundColor: subtitleStyle.bg_color !== 'transparent' ? subtitleStyle.bg_color : undefined,
                            padding: subtitleStyle.bg_color !== 'transparent' ? '4px 12px' : '0',
                            borderRadius: '8px',
                            lineHeight: 1.4,
                            fontWeight: 'bold',
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                            display: 'inline-block',
                            maxWidth: '100%',
                            wordBreak: 'keep-all',
                            overflowWrap: 'break-word',
                            animation: subAnim === 'none' ? undefined : `${subAnim === 'slide' ? 'subSlideUp' : subAnim === 'typing' ? 'subTyping' : subAnim === 'pulse' ? 'subPulse' : 'subFadeIn'} 0.35s ease-out`,
                            ...(subAnim === 'typing' ? { overflow: 'hidden' as const, whiteSpace: 'nowrap' as const } : {}),
                            ...(subAnim === 'pulse' ? { animation: 'subPulse 0.8s ease-in-out infinite' } : {}),
                          }}
                        >
                          {srt.text}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              })}

              {/* Scene Caption Band (상단): 씬별 subtitle을 나레이션 자막과 다른 스타일로 */}
              {showSceneCaptions && (() => {
                const sceneIdx = (content?.scenes || []).findIndex((_, idx) => {
                  const r = getTimelineRange(content?.script, idx);
                  return currentTime >= parseFloat(r.start) && currentTime <= parseFloat(r.end);
                });
                const capText = sceneIdx !== -1 ? (content?.scenes[sceneIdx]?.subtitle || '').trim() : '';
                if (!capText) return null;
                const isCapSelected = selectedItem?.type === 'caption' && selectedItem.id === sceneIdx;
                const capAnim = ((captionStyle as { animation?: string }).animation ?? 'none');
                return (
                  <div
                    key={`scenecap-${sceneIdx}-${capAnim}`}
                    className="absolute flex justify-center text-center z-[90] pointer-events-none"
                    style={{ top: `${captionStyle.y_offset ?? 7}%`, left: '50%', transform: 'translate(-50%, -50%)', width: 'max-content', maxWidth: '80%' }}
                  >
                    <span
                      onPointerDown={(e) => handleCaptionPointerDown(e, sceneIdx)}
                      onPointerMove={(e) => handleCaptionPointerMove(e)}
                      onPointerUp={handleCaptionPointerUp}
                      onPointerCancel={handleCaptionPointerUp}
                      onClick={(e) => { e.stopPropagation(); setSelectedItem({ id: sceneIdx, type: 'caption' }); }}
                      title="씬 자막 (드래그로 상하 이동 · 클릭해서 수정)"
                      className={`pointer-events-auto cursor-move touch-none select-none ${isCapSelected ? 'ring-1 ring-amber-300 ring-offset-0 border border-amber-300 border-dashed bg-black/20' : ''}`}
                      style={{
                        fontSize: `${captionStyle.font_size}px`,
                        color: captionStyle.color,
                        fontFamily: subtitleStyle.font,
                        WebkitTextStroke: '1px black',
                        backgroundColor: captionStyle.bg_color !== 'transparent' ? captionStyle.bg_color : undefined,
                        padding: captionStyle.bg_color !== 'transparent' ? '3px 10px' : '0',
                        borderRadius: '8px',
                        lineHeight: 1.4,
                        fontWeight: 'bold',
                        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                        display: 'inline-block',
                        maxWidth: '100%',
                        wordBreak: 'keep-all',
                        overflowWrap: 'break-word',
                        animation: capAnim === 'none' ? undefined : `${capAnim === 'slide' ? 'subSlideUp' : capAnim === 'typing' ? 'subTyping' : capAnim === 'pulse' ? 'subPulse' : 'subFadeIn'} 0.3s ease-out`
                      }}
                    >
                      {capText}
                    </span>
                  </div>
                );
              })()}

              {/* Sticker Overlays */}
              {stickers.filter((st) => currentTime >= st.start && currentTime <= st.end).map((st) => {
                const isStkSelected = selectedItem?.type === 'sticker' && selectedItem.id === st.id;
                return (
                  <div
                    key={st.id}
                    className="absolute flex justify-center text-center z-[95] pointer-events-none"
                    style={{ top: `${st.y ?? 50}%`, left: '50%', transform: 'translate(-50%, -50%)', width: 'max-content', maxWidth: '90%' }}
                  >
                    <span
                      onPointerDown={(e) => handleStickerPointerDown(e, st.id)}
                      onPointerMove={(e) => handleStickerPointerMove(e, st.id)}
                      onPointerUp={handleStickerPointerUp}
                      onPointerCancel={handleStickerPointerUp}
                      onClick={(e) => { e.stopPropagation(); setSelectedItem({ id: st.id, type: 'sticker' }); }}
                      title="스티커 (드래그로 이동 · 클릭해서 수정)"
                      className={`pointer-events-auto cursor-move touch-none select-none ${isStkSelected ? 'ring-1 ring-indigo-300 ring-offset-0 border border-indigo-300 border-dashed bg-black/20 rounded-lg' : ''}`}
                      style={{
                        fontSize: `${st.size ?? 36}px`,
                        color: st.color ?? '#FFFFFF',
                        fontFamily: subtitleStyle.font,
                        WebkitTextStroke: '1px black',
                        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                        fontWeight: 'bold',
                        display: 'inline-block',
                        maxWidth: '100%',
                        animation: 'subFadeIn 0.3s ease-out',
                      }}
                    >
                      {st.text}
                    </span>
                  </div>
                );
              })}
            </div>

            </div>

            {/* Video Preview Controls - Bottom Fixed */}
            <div className="h-10 bg-white border-t border-zinc-200 flex items-center justify-between px-4 shrink-0 z-20 relative">
              {/* Left: Time Display */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-zinc-500 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-200 shadow-sm">
                <span className="text-blue-600">
                  {new Date(currentTime * 1000).toISOString().substring(11, 19)}
                </span>
                <span className="text-zinc-300">/</span>
                <span className="text-zinc-400">
                  {new Date(videoDuration * 1000).toISOString().substring(11, 19)}
                </span>
              </div>

              {/* Center: Play/Pause Button */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-8 h-8 hover:bg-zinc-100 rounded-xl transition-all active:scale-90 group flex items-center justify-center bg-zinc-50 border border-zinc-200 shadow-sm"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={14} className="text-zinc-800 fill-zinc-800" />
                  ) : (
                    <Play size={14} className="text-zinc-800 fill-zinc-800 ml-0.5" />
                  )}
                </button>
              </div>

              {/* Right: Maximize Button */}
              <button
                onClick={() => {
                  const el = videoContainerRef.current;
                  if (!el) return;
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  } else if (el.requestFullscreen) {
                    el.requestFullscreen().catch(() => {});
                  }
                }}
                className="w-8 h-8 hover:bg-zinc-100 rounded-xl transition-all text-zinc-500 hover:text-zinc-800 bg-zinc-50 border border-zinc-200 shadow-sm flex items-center justify-center"
                title="전체화면으로 미리보기 (다시 누르면 해제)"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

              <div 
                className="w-2 cursor-col-resize flex items-center justify-center group z-50 shrink-0"
                onMouseDown={startRightResize}
              >
                <div className="w-0.5 h-8 bg-zinc-300 group-hover:bg-indigo-500 rounded-full transition-colors" />
              </div>

              <div 
                className="min-w-0 bg-white border border-zinc-200 rounded-xl flex flex-col shrink-0 overflow-hidden shadow-sm z-40"
                style={{ width: `calc(${rightWidth}% - 8px)` }}
              >
                <PropertiesPanel
                  selectedItem={selectedItem}
                  subtitleStyle={subtitleStyle}
                  setSubtitleStyle={setSubtitleStyle}
                  showSceneCaptions={showSceneCaptions}
                  setShowSceneCaptions={setShowSceneCaptions}
                  captionStyle={captionStyle}
                  setCaptionStyle={setCaptionStyle}
                  audioEdit={audioEdit}
                  setAudioEdit={setAudioEdit}
                  onDelete={handleDeleteItem}
                  onDeselect={() => setSelectedItem(null)}
                  subtitlePresets={subtitlePresets}
                  srtData={srtData}
                  setSrtData={setSrtData}
                  content={content}
                  setContent={setContent}
                  sceneLayouts={sceneLayouts}
                  setSceneLayouts={setSceneLayouts}
                  sceneFilters={sceneFilters}
                  setSceneFilters={setSceneFilters}
                  stickers={stickers}
                  setStickers={setStickers}
                  sceneFits={sceneFits}
                  setSceneFits={setSceneFits}
                  mediaFitDefault={mediaFit}
                />
              </div>
            </div>

          <div 
            className="w-full h-2 cursor-row-resize flex items-center justify-center group z-30 shrink-0 -mt-1"
            onMouseDown={startTimelineResize}
          >
            <div className="h-0.5 w-16 bg-zinc-300 group-hover:bg-indigo-500 rounded-full transition-colors" />
          </div>

          <div 
            className="bg-white border border-zinc-200 rounded-xl flex flex-col shrink-0 z-20 w-full overflow-hidden min-w-0 mr-2"
            style={{ height: `${timelineHeight}px` }}
          >
            <Timeline 
              currentTime={currentTime}
              videoDuration={videoDuration}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              setCurrentTime={setCurrentTime}
              srtData={srtData}
              setSrtData={setSrtData}
              setSrtScriptSig={setSrtScriptSig}
              setEditingSrtId={setEditingSrtId}
              content={content}
              setContent={setContent}
              selectedVisuals={selectedVisuals}
              setSelectedVisuals={setSelectedVisuals}
              visualCandidates={visualCandidates}
              setVisualCandidates={setVisualCandidates}
              getTimelineRange={getTimelineRange}
              audioEdit={audioEdit}
              setAudioEdit={setAudioEdit}
              setSceneDurations={setSceneDurations}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              onDelete={handleDeleteItem}
              audioUrl={audioUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VideoEditor);
