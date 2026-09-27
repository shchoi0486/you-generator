import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Trash2,
  Download,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  api,
  type ScriptItem,
  type AppContent,
  type AppConfig,
  type SceneCandidates,
  type Article,
  type ProjectMeta,
  type ShortsReport,
  type ClipRef,
  type SceneLayout,
  type StickerItem,
  type StockVideo,
  type CaptionStyle,
  type ProviderKeyList,
  type ProviderPlan,
  API_BASE_URL,
  assetUrl
} from './services/api';
import Step1Input from './components/Step1Input';
import { buildCutInstructions, SUBTITLE_SIZES, scriptGroupOf, RECOMMENDED_SCRIPTS } from './components/VideoPresetPanel';
import type { ScriptFormatOption } from './components/VideoPresetPanel';
import VideoPresetPanel from './components/VideoPresetPanel';
import Step2Review from './components/Step2Review';
import Step3Voice from './components/Step3Voice';
import Step4Visual from './components/Step4Visual';
import Step5Timeline from './components/Step5Timeline';
import Step6Export from './components/Step6Export';
import VideoEditor from './components/VideoEditor';
import HubHome from './components/HubHome';
import MarketingHub from './components/MarketingHub';
import PostingHub from './components/PostingHub';
import LoadingOverlay from './components/LoadingOverlay';
import ProjectList from './components/ProjectList';
import SettingsManager from './components/SettingsManager';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StepItem from './components/StepItem';
import { calculateDuration } from './utils/timeUtils';
import { 
  customStyles, 
  subtitlePresets, 
  bgmLibrary, 
  sfxLibrary, 
  voiceOptions, 
  languages, 
  steps 
} from './constants/data';
import { EMPTY_RECIPE_PRESET, type RecipePresetState } from './constants/recipeOptions';


interface SrtItem { id: number; start: number; end: number; text: string; scene?: number }

/** 한 번에 표시할 자막 최대 글자수 */
export const SUBTITLE_MAX_CHARS = 16;

/** 긴 자막을 어절 경계에서 쪼갬.
 *  기계적 글자수 절단이 아니라 구(節) 단위로 끊는다:
 *  - 구두점(,.!?~…) 뒤에서 끊는 것을 우선
 *  - 조사만 남는 자투리(", 안", "더" 등 2글자 이하 꼬리)는 다음 조각으로 넘김
 *  - 구두점으로 닫히는 다음 어절이 여유분(+6자) 안에 들어오면 끌어옴
 *  한국어: 공백 우선, 장문 단어는 강제 절단 */
const splitSubtitleText = (text: string, maxChars: number): string[] => {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (t.length <= maxChars) return [t];
  const isClauseEnd = (w: string) => /[,.!?~…]+$/.test(w);
  const isDangling = (w: string) => w.length <= 2 && !/[,.!?~…]+$/.test(w);
  const hardCut = (w: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < w.length; i += maxChars) out.push(w.slice(i, i + maxChars));
    return out;
  };
  const words = t.split(' ');
  const chunks: string[] = [];
  let i = 0;
  let guard = 0;
  while (i < words.length && guard++ < 1000) {
    let cur = words[i++];
    // 탐욕 채우기 (단, 한 어절이 기준을 넘으면 강제 절단)
    if (cur.length > maxChars) {
      const cuts = hardCut(cur);
      chunks.push(...cuts.slice(0, -1));
      cur = cuts[cuts.length - 1];
    }
    while (i < words.length && (cur + ' ' + words[i]).length <= maxChars) {
      cur += ' ' + words[i++];
    }
    // 끌어오기: 다음 어절이 구를 닫으면 여유분 안에서 합침
    if (i < words.length) {
      const toks = cur.split(' ');
      const lastTok = toks[toks.length - 1];
      if (!isClauseEnd(lastTok) && isClauseEnd(words[i]) && (cur + ' ' + words[i]).length <= maxChars + 6) {
        cur += ' ' + words[i++];
      }
    }
    // 밀어내기: ", 안" 같은 자투리 꼬리는 다음 조각으로
    const toks = cur.split(' ');
    if (i < words.length && toks.length > 1) {
      const last = toks[toks.length - 1];
      if (last.endsWith(',') || isDangling(last)) {
        i -= 1;
        cur = toks.slice(0, -1).join(' ');
      }
    }
    if (cur) {
      chunks.push(cur);
    } else {
      // 빈 조각 방지: 다음 어절 강제 전진 (무한루프 가드)
      chunks.push(words[i++]);
    }
  }
  return chunks.filter(Boolean);
};

/** 긴 자막 엔트리를 시간 비례로 분할. scene 인덱스를 부여해 씬 매핑 유지 */
const splitLongSubtitles = (items: SrtItem[], scriptLen: number, maxChars: number = SUBTITLE_MAX_CHARS): SrtItem[] => {
  const out: SrtItem[] = [];
  let nextId = 1;
  items.forEach((item, i) => {
    const scene = item.scene ?? Math.min(i, Math.max(0, scriptLen - 1));
    const parts = splitSubtitleText(item.text, maxChars);
    if (parts.length <= 1) {
      out.push({ ...item, id: nextId++, scene });
      return;
    }
    const total = Math.max(0.001, item.end - item.start);
    const totalChars = parts.reduce((a, p) => a + p.length, 0) || 1;
    let t = item.start;
    parts.forEach((p, pi) => {
      const share = p.length / totalChars;
      // 마지막 조각은 남은 구간 전체 차지 (반올림 누적 방지)
      const dur = pi === parts.length - 1 ? Math.max(0.3, item.end - t) : Math.max(0.3, total * share);
      const end = pi === parts.length - 1 ? item.end : Math.min(item.end, t + dur);
      out.push({ id: nextId++, start: t, end: Math.max(end, t + 0.1), text: p, scene });
      t = end;
    });
  });
  return out;
};

const parseSrtText = (data: string): SrtItem[] => {
  const items: SrtItem[] = [];
  const blocks = data.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);

  const timeToSeconds = (t: string) => {
    const [h, m, s_ms] = t.split(':');
    const [s, ms] = s_ms.replace('.', ',').split(',');
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
  };

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length >= 3) {
      let timeLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLineIdx = i;
          break;
        }
      }

      if (timeLineIdx !== -1) {
        const timeMatch = lines[timeLineIdx].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);

        if (timeMatch) {
          const [ , startStr, endStr ] = timeMatch;
          const text = lines.slice(timeLineIdx + 1).join(' ').trim();
          const idLine = lines.slice(0, timeLineIdx).join('').trim();
          const id = parseInt(idLine, 10);

          items.push({
            id: isNaN(id) ? items.length + 1 : id,
            start: timeToSeconds(startStr),
            end: timeToSeconds(endStr),
            text: text
          });
        }
      }
    }
  }
  return items;
};


function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [projectId, setProjectId] = useState<string>(() => {
    return localStorage.getItem('video-creator-current-project-id') || `project-${Date.now()}`;
  });
  // 로컬 복원 완료 전 저장 이펙트 차단용 (빈 상태로 덮어쓰기 방지)
  const loadedRef = React.useRef(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeMenu, setActiveMenu] = useState('Home');
  // Home 허브: 'hubs' = 3개 허브 선택 화면, 'auto' = 기존 Step 1~6 자동화 영상 흐름
  const [homeHub, setHomeHub] = useState<'hubs' | 'auto'>('hubs');
  // Step1 내부 단계 (pick: 카테고리 선택 / input: 입력+설정) — 레일은 input에서만 표시
  const [step1Phase, setStep1Phase] = useState<'pick' | 'input'>('pick');
  // 제작 설정 레일 접기/펼치기 (접으면 위에 펼치기 버튼만)
  const [presetRailOpen, setPresetRailOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Data States
  const [url, setUrl] = useState('');
  const [directText, setDirectText] = useState('');
  const [projectName, setProjectName] = useState('새 프로젝트');
  const [duration, setDuration] = useState(60);
  const [templateId, setTemplateId] = useState('news_duo');
  // ShortsLab 상태 (스텝 이동해도 분석 결과 유지)
  const [shortsMode, setShortsMode] = useState<'file' | 'youtube'>('file');
  const [shortsYtUrl, setShortsYtUrl] = useState('');
  const [shortsHint, setShortsHint] = useState('');
  const [shortsReport, setShortsReport] = useState<ShortsReport | null>(null);
  const [shortsTopic, setShortsTopic] = useState('');
  const [shortsReference, setShortsReference] = useState('');
  const [shortsCategory, setShortsCategory] = useState('recipe_short');
  const [inputType, setInputType] = useState<'url' | 'text'>('url');
  const [article, setArticle] = useState<Article | null>(null);
  const [content, setContent] = useState<AppContent | null>(null); // script + scenes
  const [audio, setAudio] = useState<{
    url?: string;
    srtUrl?: string;
    audio_path?: string;
    srt_path?: string;
    [key: string]: unknown;
  } | null>(null); // audio url + srt url
  const [visualCandidates, setVisualCandidates] = useState<Record<number, SceneCandidates>>({});
  const [fetchingIndices, setFetchingIndices] = useState<Set<string>>(new Set());
  const fetchingIndicesRef = useRef<Set<string>>(new Set());
  // Actually, let's just use state for UI and ref for non-UI if needed. 
  // But usually state is enough.
  // Let's replace it with state only if it's not used in ways that require a ref (like in closures).

  const [selectedVisuals, setSelectedVisuals] = useState<Record<number, string[]>>({});
  // 클립별 in/out 트림: sceneIdx -> url -> {in, out}
  const [clipTrims, setClipTrims] = useState<Record<number, Record<string, { in: number; out: number | null }>>>({});
  // 씬별 화면 배치: scale(1=핏), x/y(화면 비율 오프셋)
  const [sceneLayouts, setSceneLayouts] = useState<Record<number, SceneLayout>>({});
  // 씬 자막(상단 밴드) 표시 여부 — Step2의 씬별 subtitle을 나레이션 자막과 별도 스타일로 표시
  const [showSceneCaptions, setShowSceneCaptions] = useState(true);
  // 스톡/업로드 미디어 목록: Step4 로컬에 두면 화면 이동 시 날아가므로 App에서 보유
  const [extraMedia, setExtraMedia] = useState<Record<number, StockVideo[]>>({});
  // 저장된 프로젝트 불러오기 경로로 4개 이상이 들어오는 경우 대비: 씬당 최대 3개로 정리
  const sanitizeSelectedVisuals = (v: Record<number, string[]>): Record<number, string[]> => {
    const out: Record<number, string[]> = {};
    Object.entries(v || {}).forEach(([k, arr]) => {
      if (Array.isArray(arr)) out[Number(k)] = [...new Set(arr)].slice(0, 3);
    });
    return out;
  };
  const [renderResult, setRenderResult] = useState<{
    videoUrl?: string;
    video_path?: string;
    srtUrl?: string;
    [key: string]: unknown;
  } | null>(null);
  const [progress, setProgress] = useState<{
    status?: string;
    progress?: number;
    message?: string;
    [key: string]: string | number | boolean | undefined | null;
  } | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  // 프로바이더 키 목록 (암호화 저장소 기준). 설정 화면과 가격 팝업이 공유한다.
  const [providerKeys, setProviderKeys] = useState<ProviderKeyList | null>(null);
  const [, setLoadingProviderKeys] = useState(false);
  // 모델 선택 계획 (1순위 + 편당 비용)
  const [plan, setPlan] = useState<ProviderPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
    const [planScenes, setPlanScenes] = useState(4);
  const [planI2v, setPlanI2v] = useState(0);
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({
    "BJ 이슈왕": "ko-KR-InJoonNeural",
    "박 앵커": "ko-KR-SunHiNeural"
  });
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);
  const [playingSpeaker, setPlayingSpeaker] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<'openai' | 'azure' | 'edge' | 'qwen' | 'minimax' | 'elevenlabs' | 'typecast'>('edge');
  // Typecast actor 목록 (설정된 키로 동적 로드)
  const [typecastActors, setTypecastActors] = useState<Array<{ label: string; value: string; lang?: string }>>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('ko');
  const [selectedAiModel, setSelectedAiModel] = useState<string>('pollinations');
  const [videoModel, setVideoModel] = useState<string>(() => {
    try { return localStorage.getItem('preset-video-model') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try { localStorage.setItem('preset-video-model', videoModel); } catch { /* 무시 */ }
  }, [videoModel]);
  const selectedAiModelRef = useRef(selectedAiModel);

  useEffect(() => {
    selectedAiModelRef.current = selectedAiModel;
  }, [selectedAiModel]);

  // ── 프로바이더 키 목록 (암호화 저장소) ──────────────────────
  // 키를 등록/삭제하면 즉시 다시 읽어야 배지·모델 수가 갱신된다.
  const refreshProviderKeys = useCallback(async () => {
    setLoadingProviderKeys(true);
    try {
      setProviderKeys(await api.getProviderKeys());
    } catch (e) {
      console.error('[providers] 목록 조회 실패', e);
    } finally {
      setLoadingProviderKeys(false);
    }
  }, []);

  useEffect(() => {
    void refreshProviderKeys();
  }, [refreshProviderKeys, activeMenu]);

  const refreshPlan = useCallback(async () => {
    setLoadingPlan(true);
    try {
      setPlan(await api.getProviderPlan({
        scenes: planScenes, i2v_scenes: planI2v, i2v_sec: 5,
      }));
    } catch (e) {
      console.error('[plan] 조회 실패', e);
    } finally {
      setLoadingPlan(false);
    }
  }, [planScenes, planI2v]);

  useEffect(() => { void refreshPlan(); }, [refreshPlan, activeMenu]);

  const [voiceSettings, setVoiceSettings] = useState<Record<string, { rate: string, pitch: string }>>({});
  const [gapDuration, setGapDuration] = useState<number>(0.5);
  const [playingSegmentIndex, setPlayingSegmentIndex] = useState<number | null>(null);
  const isPlayAllPreviewRef = useRef<boolean>(false);
  const [isPlayAllPreview, setIsPlayAllPreview] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const stopGenerationRef = useRef<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  // 진행 중인 수집 작업 종류 (버튼별 진행률 표시용: ai/search/stock/all/null)
  const [activeTask, setActiveTask] = useState<'ai' | 'search' | 'stock' | 'all' | null>(null);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const [editSceneValues, setEditSceneValues] = useState({ keyword: '', description: '' });
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [cfUsage, setCfUsage] = useState<{ neurons: number; limit: number; date: string; error?: string } | null>(null);
  const [isFetchingUsage, setIsFetchingUsage] = useState(false);

  // --- 편집기 관련 상태 ---
  const [subtitleStyle, setSubtitleStyle] = useState<{
    preset: string;
    font: string;
    font_size: number;
    color: string;
    stroke_color: string;
    stroke_width: number;
    bg_color: string;
    position: string;
    text_align?: string;
    animation?: string;
    y_offset: number;
    x_offset: number;
    show_subtitles: boolean;
  }>({
    preset: 'default',
    font: 'Noto Sans KR',
    font_size: 20,
    color: '#FFD76A',
    stroke_color: 'transparent',
    stroke_width: 0,
    bg_color: 'rgba(0,0,0,0.45)',
    position: 'bottom',
    text_align: 'center',
    animation: 'none',
    y_offset: 85,
    x_offset: 50,
    show_subtitles: true // 자막 표시 여부
  });

  // 상단 씬 자막 밴드 스타일 (하단 내레이션 자막과 별도)
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    font_size: 13,
    color: '#FFD76A',
    bg_color: 'rgba(0,0,0,0.45)',
    y_offset: 12,
    animation: 'none'
  });

  // 출력 효과: 장면 전환 + 전체 컬러 필터 (OpenCut식, 렌더에 반영)
  const [transition, setTransition] = useState<{ type: string; duration: number }>({ type: 'none', duration: 0.5 });
  const [videoFilter, setVideoFilter] = useState<string>('none');
  // 미디어 맞춤 + 배경 (전역 기본값) / 장면별 맞춤 오버라이드
  const [mediaFit, setMediaFit] = useState<'fit' | 'fill' | 'crop'>('fit');
  const [bgStyle, setBgStyle] = useState<'blur' | 'black' | 'color'>('blur');
  const [bgColor, setBgColor] = useState<string>('#000000');
  const [sceneFits, setSceneFits] = useState<Record<number, string>>({});
  const [zoomPct, setZoomPct] = useState<number>(100);
  // 장면별 개별 필터 + 스티커 오버레이
  const [sceneFilters, setSceneFilters] = useState<Record<number, string>>({});
  const [stickers, setStickers] = useState<StickerItem[]>([]);

  const [aspectRatio, setAspectRatio] = useState<string>("16:9 (Youtube)"); // 화면 비율 추가
  // 제작 전 설정 (VideoPresetPanel): 영상마다 제작 직전에 미리 정하는 프리셋
  const [cutSpeed, setCutSpeed] = useState<'fast' | 'slow'>('fast');
  const [scriptId, setScriptId] = useState<string>(() => {
    try {
      return localStorage.getItem('preset-script-id') || 'news_briefing';
    } catch { return 'news_briefing'; }
  });
  const [scriptOptions, setScriptOptions] = useState<ScriptFormatOption[]>([]);
  // 카테고리별 대본 포맷 목록 로드 + 카테고리 변경 시 ★ 추천으로 자동 리셋
  const fetchScriptOptions = React.useCallback(async (tplId: string, keepCurrent: boolean) => {
    const group = scriptGroupOf(tplId);
    try {
      const r = await api.getScriptFormats(group);
      const list = (r?.formats || []) as ScriptFormatOption[];
      if (list.length > 0) {
        setScriptOptions(list);
        const rec = (r?.recommended as string) || RECOMMENDED_SCRIPTS[group];
        setScriptId((prev) => (keepCurrent && list.some((f) => f.id === prev) ? prev : rec));
        return;
      }
    } catch { /* 폴백 */ }
    const rec = RECOMMENDED_SCRIPTS[group];
    setScriptOptions([{ id: rec, name: '추천 포맷', group, flow: '', desc: '', recommended: true }]);
    if (!keepCurrent) setScriptId(rec);
  }, []);
  useEffect(() => {
    fetchScriptOptions(templateId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { localStorage.setItem('preset-script-id', scriptId); } catch { /* 무시 */ }
  }, [scriptId]);
  const [voiceRate, setVoiceRate] = useState<string>('+0%');
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large'>('medium');
  // 모듈형 레시피 프롬프트 프리셋 (포맷/스타일/플랫폼/훅) — 전역 설정, 로컬+백엔드 config에 저장
  const [recipePreset, setRecipePreset] = useState<RecipePresetState>(() => {
    try {
      const raw = localStorage.getItem('recipe-prompt-preset');
      if (raw) {
        const p = JSON.parse(raw);
        // 영상 구조 선택 UI 제거 — 항상 자동
        return {
          format: 'auto',
          style: typeof p.style === 'string' ? p.style : 'realistic',
          platform: typeof p.platform === 'string' ? p.platform : 'youtube',
          hook: typeof p.hook === 'string' ? p.hook : 'random',
          preset: typeof p.preset === 'string' ? p.preset : 'random',
          tone: typeof p.tone === 'string' ? p.tone : '',
          structure: typeof p.structure === 'string' ? p.structure : '',
          cta: typeof p.cta === 'string' ? p.cta : '',
        };
      }
    } catch { /* 기본값 사용 */ }
    return { format: 'auto', style: 'realistic', platform: 'youtube', hook: 'random', preset: 'random', tone: '', structure: '', cta: '' };
  });
  useEffect(() => {
    try {
      localStorage.setItem('recipe-prompt-preset', JSON.stringify(recipePreset));
    } catch { /* 무시 */ }
  }, [recipePreset]);
  const [audioEdit, setAudioEdit] = useState<{
    bgm_path: string | null;
    bgm_volume: number;
    sfx_list: Array<{ path: string; time: number; volume: number }>;
  }>({
    bgm_path: null,
    bgm_volume: 0.2,
    sfx_list: []
  });
  const [srtData, setSrtData] = useState<Array<{ id: number; start: number; end: number; text: string }>>([]);
  // srtData 생성 시점의 대본 지문. 대본 수정 후 TTS 미재생성 시 자막 불일치 경고용
  const [srtScriptSig, setSrtScriptSig] = useState<string | null>(null);
  // 오디오 생성 시점의 대본 지문. 타임라인 구조편집 등으로 어긋나면 음성 재생성 경고용
  const [audioScriptSig, setAudioScriptSig] = useState<string | null>(null);
  const currentScriptSig = (content?.script || []).map((s) => `${s.speaker}:${s.text}`).join('\n');
  const audioStale = !!audio && audioScriptSig !== null && audioScriptSig !== currentScriptSig;
  const subsStale = !audioStale && srtData.length > 0 && srtScriptSig !== null && srtScriptSig !== currentScriptSig;
  const [sceneDurations, setSceneDurations] = useState<number[]>([]); // 각 장면의 길이 상태 추가
  const [editingSrtId, setEditingSrtId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [shouldShowEditorPicker, setShouldShowEditorPicker] = useState(false);



  const openEditorMenu = React.useCallback(() => {
    // 사이드바 Editor 클릭 시 팝업 없이 마지막 작업 화면으로 바로 이동.
    // 프로젝트 변경은 에디터 헤더의 '프로젝트 선택' 버튼에서.
    setShouldShowEditorPicker(false);
    setActiveMenu('Editor');
  }, []);

  // -------------------------


  // --- 편집기 재생 동기화 ---
  useEffect(() => {
    if (!mainAudioRef.current) return;
    
    const audio = mainAudioRef.current;
    
    if (isPlaying) {
      // Step 5에서 재생 시 오디오가 멈춰있으면 현재 위치에서 재생
      if (audio.paused) {
        audio.currentTime = currentTime;
        audio.play().catch(e => console.error("Playback failed:", e));
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!mainAudioRef.current) return;
    
    const audio = mainAudioRef.current;
    
    const handleTimeUpdate = () => {
      if (isPlaying) {
        setCurrentTime(audio.currentTime);
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isPlaying]);

  // BGM 동기화
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeekTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!bgmAudioRef.current) return;
    const bgm = bgmAudioRef.current;
    
    if (isPlaying && audioEdit.bgm_path) {
      // 재생 시작 시 또는 BGM 변경 시에만 현재 시간으로 동기화
      // 매번 동기화하면 재생이 뚝뚝 끊김
      if (bgm.paused || Math.abs(bgm.currentTime - (currentTime % (bgm.duration || 1))) > 0.5) {
        bgm.currentTime = currentTime % (bgm.duration || 1);
      }
      bgm.volume = audioEdit.bgm_volume;
      bgm.play().catch(() => {});
    } else {
      bgm.pause();
    }
  }, [isPlaying, audioEdit.bgm_path, audioEdit.bgm_volume, currentTime > lastSeekTimeRef.current + 1 || currentTime < lastSeekTimeRef.current]);

  // 재생 위치 변경 감지
  useEffect(() => {
    lastSeekTimeRef.current = currentTime;
  }, [currentTime]);

  // SFX 트리거
  useEffect(() => {
    if (!isPlaying) return;
    
    audioEdit.sfx_list.forEach(sfx => {
      // 현재 시간과 SFX 시간이 일치하면 재생 (오차 범위 0.1초)
      if (Math.abs(currentTime - sfx.time) < 0.1) {
        const sfxAudio = new Audio(assetUrl(sfx.path));
        sfxAudio.volume = sfx.volume;
        sfxAudio.play().catch(() => {});
      }
    });
  }, [currentTime, isPlaying, audioEdit.sfx_list]);
  // -------------------------

  // 전체 대본의 시간 범위를 계산하는 함수 (간격 포함)
  const getTimelineRange = React.useCallback((data: ScriptItem[] | undefined, currentIdx: number) => {
    if (!data || currentIdx < 0 || currentIdx >= data.length) {
      return { start: "0.0", end: "0.0", duration: "0.0" };
    }
    
    // 1. SRT 데이터가 있으면 SRT 우선 사용
    // 씬의 길이는 현재 자막 시작부터 다음 자막 시작까지 (공백 포함)로 계산해야 이미지 싱크가 맞음
    // 자막 분할로 srtData가 script보다 많을 수 있어 scene 필드 우선 매칭
    const scoped = (srtData || []).filter((s) => (s as { scene?: number }).scene === currentIdx);
    if (scoped.length > 0) {
      const start = scoped[0].start;
      const nextScoped = (srtData || []).filter((s) => (s as { scene?: number }).scene === currentIdx + 1);
      let end: number;
      if (nextScoped.length > 0) {
        end = nextScoped[0].start;
      } else if (currentIdx < data.length - 1 && srtData.length > 0) {
        // 다음 씬 자막이 없으면 (삭제됨) 그 다음 씬 시작 또는 마지막 end 사용
        const later = (srtData || []).filter((s) => ((s as { scene?: number }).scene ?? -1) > currentIdx);
        end = later.length > 0 ? later[0].start : scoped[scoped.length - 1].end;
      } else {
        end = scoped[scoped.length - 1].end + gapDuration;
      }
      const duration = end - start;
      return {
        start: start.toFixed(2),
        end: end.toFixed(2),
        duration: duration.toFixed(2)
      };
    }
    if (srtData && srtData.length === data.length) {
      const item = srtData[currentIdx];
      const start = item.start;
      let end = item.end;
      
      // 다음 자막이 있다면 다음 자막의 시작을 이 씬의 끝으로 간주하여 gap을 채움
      if (currentIdx < srtData.length - 1) {
        end = srtData[currentIdx + 1].start;
      } else {
        // 마지막 자막인 경우 끝에 gapDuration 정도 여유를 추가
        end = item.end + gapDuration;
      }
      
      const duration = end - start;
      
      return { 
        start: start.toFixed(2), 
        end: end.toFixed(2), 
        duration: duration.toFixed(2) 
      };
    }

    // 2. SRT 데이터가 없을 때만 기본 계산값 사용
    let start = 0;
    for (let i = 0; i < currentIdx; i++) {
      const item = data[i];
      const baseDur = calculateDuration(item.text);
      start += baseDur + gapDuration;
    }
    
    const durationValue = calculateDuration(data[currentIdx].text);
    // 이 경우도 다음 씬 시작까지가 총 길이 (기본 계산은 gapDuration을 포함하여 씬의 길이로 설정)
    const totalSceneDuration = durationValue + gapDuration;
    
    return { 
      start: start.toFixed(2), 
      end: (start + totalSceneDuration).toFixed(2), 
      duration: totalSceneDuration.toFixed(2) 
    };
  }, [srtData, gapDuration]);

  // 모든 트랙의 끝점 중 가장 큰 값을 비디오 총 길이로 설정
  useEffect(() => {
    let maxTime = 0;
    
    // 1. SRT 데이터 (자막)
    if (srtData && srtData.length > 0) {
      maxTime = Math.max(maxTime, srtData[srtData.length - 1].end);
    }
    
    // 2. SFX 리스트
    if (audioEdit && audioEdit.sfx_list && audioEdit.sfx_list.length > 0) {
      audioEdit.sfx_list.forEach(sfx => {
        maxTime = Math.max(maxTime, sfx.time + 1.0); 
      });
    }
    
    // 3. 장면 데이터 (비주얼)
    if (content?.scenes && content.scenes.length > 0) {
      const lastIdx = content.scenes.length - 1;
      const range = getTimelineRange(content.script, lastIdx);
      maxTime = Math.max(maxTime, parseFloat(range.end));
    }

    // 최소 길이는 10초 정도로 보장 (타임라인 조작을 위해)
    setVideoDuration(Math.max(maxTime, 10));
  }, [srtData, audioEdit, content?.scenes, getTimelineRange]);

  // Persistence: Fetch Projects List from Backend
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projectsData = await api.listProjects();
        if (projectsData) {
          setProjects(projectsData);
          localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsData));
        }
      } catch (e) {
        console.error('Failed to fetch projects list from backend', e);
      }
    };
    fetchProjects();
  }, []);

  // --- Persistence: Load from LocalStorage ---
  useEffect(() => {
    const handleMenuChange = (e: CustomEvent<{ detail: string }>) => {
      setActiveMenu(e.detail.detail);
    };
    window.addEventListener('changeMenu', handleMenuChange as EventListener);
    
    const handleTTSGenerationRequest = () => {
      if (handleGenerateTTSRef.current) {
        handleGenerateTTSRef.current();
      }
    };
    window.addEventListener('requestTTSGeneration', handleTTSGenerationRequest as EventListener);
    
    return () => {
      window.removeEventListener('changeMenu', handleMenuChange as EventListener);
      window.removeEventListener('requestTTSGeneration', handleTTSGenerationRequest as EventListener);
    };
  }, []);

  useEffect(() => {
    const savedData = localStorage.getItem(`video-creator-project-${projectId}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.currentStep) setCurrentStep(parsed.currentStep);
        if (parsed.activeMenu) setActiveMenu(parsed.activeMenu);
        if (parsed.url) setUrl(parsed.url);
        if (parsed.directText) setDirectText(parsed.directText);
        if (parsed.projectName) setProjectName(parsed.projectName);
        if (parsed.duration) setDuration(parsed.duration);
        if (parsed.inputType) setInputType(parsed.inputType);
        if (parsed.article) setArticle(parsed.article);
        if (parsed.content) setContent(parsed.content);
        if (parsed.audio) setAudio(parsed.audio);
        if (parsed.visualCandidates) setVisualCandidates(parsed.visualCandidates);
        if (parsed.selectedVisuals) setSelectedVisuals(sanitizeSelectedVisuals(parsed.selectedVisuals));
        if (parsed.extraMedia) setExtraMedia(parsed.extraMedia);
        if (parsed.clipTrims) setClipTrims(parsed.clipTrims);
        if (parsed.sceneLayouts) setSceneLayouts(parsed.sceneLayouts);
        if (typeof parsed.showSceneCaptions === 'boolean') setShowSceneCaptions(parsed.showSceneCaptions);
        if (parsed.voiceMap) setVoiceMap(parsed.voiceMap);
        if (parsed.selectedEngine) setSelectedEngine(parsed.selectedEngine);
        if (parsed.selectedLanguage) setSelectedLanguage(parsed.selectedLanguage);
        if (parsed.voiceSettings) setVoiceSettings(parsed.voiceSettings);
        if (parsed.gapDuration) setGapDuration(parsed.gapDuration);
        if (parsed.cutSpeed) setCutSpeed(parsed.cutSpeed);
        if (parsed.scriptId) setScriptId(parsed.scriptId);
        if (parsed.voiceRate) setVoiceRate(parsed.voiceRate);
        if (parsed.subtitleSize) setSubtitleSize(parsed.subtitleSize);
        if (parsed.srtData) setSrtData(parsed.srtData);
        if (parsed.captionStyle) setCaptionStyle((prev) => ({ ...prev, ...parsed.captionStyle }));
        if (parsed.transition) setTransition(parsed.transition);
        if (parsed.videoFilter) setVideoFilter(parsed.videoFilter);
        if (parsed.mediaFit) setMediaFit(parsed.mediaFit);
        if (parsed.zoomPct) setZoomPct(parsed.zoomPct);
        if (parsed.bgStyle) setBgStyle(parsed.bgStyle);
        if (parsed.bgColor) setBgColor(parsed.bgColor);
        if (parsed.sceneFits) setSceneFits(parsed.sceneFits);
        if (parsed.sceneFilters) setSceneFilters(parsed.sceneFilters);
        if (parsed.stickers) setStickers(parsed.stickers);
      } catch (e) {
        console.error('Failed to load project from localStorage', e);
      }
    } else if (projectId === 'default') {
      // Migrate old data if exists
      const oldData = localStorage.getItem('video-creator-project');
      if (oldData) {
        localStorage.setItem(`video-creator-project-${projectId}`, oldData);
        // Retry loading
        window.location.reload();
      }
    }
    loadedRef.current = true;
  }, [projectId]);

  // Persistence: Save to LocalStorage (로드 완료 전에는 저장 금지 — 복원 데이터 덮어쓰기 방지)
  useEffect(() => {
    if (!loadedRef.current) return;
    const projectData = {
      projectId,
      currentStep,
      activeMenu,
      url,
      directText,
      projectName,
      duration,
      inputType,
      article,
      content,
      audio,
      visualCandidates,
      selectedVisuals,
      voiceMap,
      selectedEngine,
      selectedLanguage,
      voiceSettings,
      gapDuration,
      cutSpeed,
      scriptId,
      voiceRate,
      subtitleSize,
      srtData,
      captionStyle,
      transition,
      videoFilter,
      sceneFilters,
      stickers,
      mediaFit,
      bgStyle,
      bgColor,
      sceneFits,
      zoomPct,
      // 프로젝트마다 달라야 하는 제작 설정. 빠져서 다른 프로젝트를 열면
      // 이전 프로젝트의 대본 프리셋/자막 스타일이 딸려 온다(실측).
      subtitleStyle,
      showSceneCaptions,
      recipePreset,
      lastModified: new Date().toISOString()
    };
    
    // Save project data (모바일 웹뷰 quota 초과 대비 — 실패해도 백엔드 저장은 별도 유지)
    try {
      localStorage.setItem(`video-creator-project-${projectId}`, JSON.stringify(projectData));
      localStorage.setItem('video-creator-current-project-id', projectId);
    } catch (e) {
      console.error('Failed to save project to localStorage (quota?):', e);
    }

    // Update projects list
    const projectsListStr = localStorage.getItem('video-creator-projects-list') || '[]';
    try {
      const projectsList = JSON.parse(projectsListStr);
      const index = projectsList.findIndex((p: { id: string }) => p.id === projectId);
      const projectMeta = { 
        id: projectId, 
        projectName: projectName, 
        lastModified: projectData.lastModified,
        currentStep: projectData.currentStep
      };
      
      if (index >= 0) {
        projectsList[index] = projectMeta;
      } else {
        projectsList.push(projectMeta);
      }
      localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsList));
    } catch (e) {
      console.error('Failed to update projects list', e);
    }
  }, [
    projectId, currentStep, activeMenu, url, directText, projectName, duration, 
    inputType, article, content, audio, visualCandidates, 
    selectedVisuals, clipTrims, sceneLayouts, showSceneCaptions, extraMedia, voiceMap, selectedEngine, selectedLanguage, 
    voiceSettings, gapDuration, cutSpeed, scriptId, voiceRate, subtitleSize, srtData, captionStyle,
    subtitleStyle, recipePreset,
    transition, videoFilter, sceneFilters, stickers, mediaFit, bgStyle, bgColor, sceneFits
  ]);

  // 새 대본이 오면 이전 주제의 시각 상태를 버린다 (같은 프로젝트에서 주제 변경 시
  // 옛날 후보/선택이 남아 bulk 수집 skip + 옛날 썸네일이 보이는 문제 방지).
  // 프로젝트 불러오기/타임라인 편집에서는 호출하지 않는다.
  const resetVisualState = React.useCallback(() => {
    setVisualCandidates({});
    setSelectedVisuals({});
    setExtraMedia({});
    setClipTrims({});
    setSceneLayouts({});
  }, []);

  const handleNewProject = React.useCallback((skipConfirm = false) => {
    if (skipConfirm || window.confirm('새 프로젝트를 시작하시겠습니까?')) {
      const newId = `project-${Date.now()}`;
      setProjectId(newId);
      setCurrentStep(1);
      setUrl('');
      setDirectText('');
      setProjectName('새 프로젝트');
      setDuration(60);
      setInputType('url');
      setStep1Phase('pick');
      setArticle(null);
      setContent(null);
      setAudio(null);
      setVisualCandidates({});
      setSelectedVisuals({});
      setClipTrims({});
      setSceneLayouts({});
      setExtraMedia({});
      setRenderResult(null);
      setError(null);
      setActiveMenu('Home');
      
      // Reset additional editor states
      setCaptionStyle({
        font_size: 13,
        color: '#FFD76A',
        bg_color: 'rgba(0,0,0,0.45)',
        y_offset: 12,
        animation: 'none'
      });
      setSubtitleStyle({
        preset: 'default',
        font: 'Noto Sans KR',
        // 70은 실수로 들어간 값이었다. 초기 상태(App.tsx:344)와 subtitlePresets.default
        // 의 font_size이 20이라 리셋하면 "기본/보통"을 고른 화면에 70px로 그려졌다.
        font_size: subtitlePresets.default?.font_size ?? 20,
        color: '#FFD76A',
        stroke_color: 'transparent',
        stroke_width: 0,
        bg_color: 'rgba(0,0,0,0.45)',
        position: 'bottom',
        text_align: 'center',
        animation: 'none',
        y_offset: 85,
        x_offset: 50,
        show_subtitles: true
      });
      setAspectRatio("16:9 (Youtube)");
      setCutSpeed('fast');
      setScriptId(RECOMMENDED_SCRIPTS[scriptGroupOf(templateId)]);
      setVoiceRate('+0%');
      setSubtitleSize('medium');
      setTransition({ type: 'none', duration: 0.5 });
      setVideoFilter('none');
      setMediaFit('fit');
      setZoomPct(100);
      setBgStyle('blur');
      setBgColor('#000000');
      setSceneFits({});
      setSceneFilters({});
      setStickers([]);
      setAudioEdit({
        bgm_path: null,
        bgm_volume: 0.2,
        sfx_list: []
      });
      setSrtData([]); setSrtScriptSig(null);
      setAudioScriptSig(null);
      setShortsReport(null); setShortsTopic(''); setShortsYtUrl(''); setShortsReference('');
      setSceneDurations([]);
      setEditingSrtId(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setVideoDuration(0);
    }
  }, []);

  const handleLoadProject = React.useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await api.getProject(id);
      if (data) {
        // Handle both top-level and meta-nested structures for compatibility
        const mergedData = { ...data, ...(data.meta || {}) };
        
        setProjectId(mergedData.projectId || id);
        
        if (mergedData.script || mergedData.scenes || mergedData.content) {
          setContent(mergedData.content || {
            script: mergedData.script || [],
            scenes: mergedData.scenes || []
          });
        }

        if (mergedData.currentStep) setCurrentStep(mergedData.currentStep);
        if (mergedData.url) setUrl(mergedData.url);
        if (mergedData.directText) setDirectText(mergedData.directText);
        if (mergedData.projectName) setProjectName(mergedData.projectName);
        if (mergedData.duration) setDuration(mergedData.duration);
        if (mergedData.inputType) setInputType(mergedData.inputType);
        if (mergedData.article) setArticle(mergedData.article);
        if (mergedData.audio) setAudio(mergedData.audio);
        if (mergedData.visualCandidates) setVisualCandidates(mergedData.visualCandidates);
        if (mergedData.selectedVisuals) setSelectedVisuals(sanitizeSelectedVisuals(mergedData.selectedVisuals));
        if (mergedData.extraMedia) setExtraMedia(mergedData.extraMedia);
        if (mergedData.clipTrims) setClipTrims(mergedData.clipTrims);
        if (mergedData.sceneLayouts) setSceneLayouts(mergedData.sceneLayouts);
        if (typeof mergedData.showSceneCaptions === 'boolean') setShowSceneCaptions(mergedData.showSceneCaptions);
        if (mergedData.voiceMap) setVoiceMap(mergedData.voiceMap);
        if (mergedData.selectedEngine) setSelectedEngine(mergedData.selectedEngine);
        if (mergedData.selectedLanguage) setSelectedLanguage(mergedData.selectedLanguage);
        if (mergedData.voiceSettings) setVoiceSettings(mergedData.voiceSettings);
        if (mergedData.gapDuration !== undefined) setGapDuration(mergedData.gapDuration);
        if (mergedData.cutSpeed) setCutSpeed(mergedData.cutSpeed);
        if (mergedData.scriptId) setScriptId(mergedData.scriptId);
        if (mergedData.voiceRate) setVoiceRate(mergedData.voiceRate);
        if (mergedData.subtitleSize) setSubtitleSize(mergedData.subtitleSize);
        if (mergedData.subtitleStyle) setSubtitleStyle(mergedData.subtitleStyle);
        if (mergedData.captionStyle) setCaptionStyle((prev) => ({ ...prev, ...mergedData.captionStyle }));
        // 대본 프리셋을 안 복원하면 다른 프로젝트를 열 때 이전 프로젝트의
        // 톤/구조/CTA가 딸려온다(저장 시 빠졌으므로 로드 시도 없었음).
        if (mergedData.recipePreset) {
          setRecipePreset({ ...EMPTY_RECIPE_PRESET, ...mergedData.recipePreset });
        }
        if (mergedData.transition) setTransition(mergedData.transition);
        if (mergedData.videoFilter) setVideoFilter(mergedData.videoFilter);
        if (mergedData.mediaFit) setMediaFit(mergedData.mediaFit);
        if (mergedData.zoomPct) setZoomPct(mergedData.zoomPct);
        if (mergedData.bgStyle) setBgStyle(mergedData.bgStyle);
        if (mergedData.bgColor) setBgColor(mergedData.bgColor);
        if (mergedData.sceneFits) setSceneFits(mergedData.sceneFits);
        if (mergedData.sceneFilters) setSceneFilters(mergedData.sceneFilters);
        if (mergedData.stickers) setStickers(mergedData.stickers);
        if (mergedData.aspectRatio) setAspectRatio(mergedData.aspectRatio);
        if (mergedData.audioEdit) setAudioEdit(mergedData.audioEdit);
        if (mergedData.srtData) {
          setSrtData(mergedData.srtData);
        } else {
          // Check localStorage as fallback
          const localSavedData = localStorage.getItem(`video-creator-project-${id}`);
          if (localSavedData) {
            try {
              const parsed = JSON.parse(localSavedData);
              if (parsed.srtData) setSrtData(parsed.srtData);
            } catch (e) {
              console.error('Failed to parse localStorage fallback', e);
            }
          }
        }
        if (mergedData.sceneDurations) setSceneDurations(mergedData.sceneDurations);
        
        setActiveMenu('Editor');
      }
    } catch (e) {
      console.error('Failed to load project', e);
      setError('프로젝트를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteProject = React.useCallback(async (id: string) => {
    if (!id) {
      setError('프로젝트 ID가 유효하지 않습니다.');
      return;
    }

    if (window.confirm('이 프로젝트를 삭제하시겠습니까?')) {
      try {
        console.log(`Deleting project: ${id}`);
        await api.deleteProject(id);
        localStorage.removeItem(`video-creator-project-${id}`);
        
        // Update projects list
        const projectsData = await api.listProjects();
        if (projectsData) {
          setProjects(projectsData);
          localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsData));
        } else {
          // If api.listProjects returns null, just filter out the deleted project locally
          setProjects(prev => {
            const newList = prev.filter(p => p.id !== id);
            localStorage.setItem('video-creator-projects-list', JSON.stringify(newList));
            return newList;
          });
        }
        
        if (id === projectId) {
          handleNewProject();
        }
        
        // Success feedback
        console.log(`Successfully deleted project: ${id}`);
        setSuccess('프로젝트가 성공적으로 삭제되었습니다.');
      } catch (e) {
        console.error('Failed to delete project', e);
        const errorMessage = e instanceof Error ? e.message : '알 수 없는 오류';
        setError(`프로젝트 삭제 중 오류가 발생했습니다: ${errorMessage}`);
      }
    }
  }, [handleNewProject, projectId]);

  const handleSaveProject = React.useCallback(async () => {
    setIsSaving(true);
    
    const projectData = {
      projectId,
      currentStep,
      activeMenu,
      url,
      directText,
      projectName,
      duration,
      inputType,
      article,
      content,
      audio,
      visualCandidates,
      selectedVisuals,
      voiceMap,
      selectedEngine,
      selectedLanguage,
      voiceSettings,
      gapDuration,
          cutSpeed,
          scriptId,
          voiceRate,
          subtitleStyle,
      aspectRatio,
      audioEdit,
      srtData,
      sceneDurations,
      lastModified: new Date().toISOString()
    };
    
    try {
      if (!projectId) {
        setError('프로젝트 ID가 없습니다. 새 프로젝트를 생성해주세요.');
        setIsSaving(false);
        return;
      }

      // 1. Save to LocalStorage (as backup)
      localStorage.setItem(`video-creator-project-${projectId}`, JSON.stringify(projectData));
      localStorage.setItem('video-creator-current-project-id', projectId);

      // 2. Save to Backend
      await api.saveProject({
        projectId: projectId,
        script: content?.script || [],
        scenes: content?.scenes || [],
        meta: {
          id: projectId,
          currentStep,
          activeMenu,
          url,
          directText,
          projectName,
          duration,
          inputType,
          article,
          audio,
      visualCandidates,
      selectedVisuals,
      clipTrims,
      sceneLayouts,
      showSceneCaptions,
      extraMedia,
      voiceMap,
          selectedEngine,
          selectedLanguage,
          voiceSettings,
      gapDuration,
          cutSpeed,
          scriptId,
          voiceRate,
          subtitleSize,
          subtitleStyle,
          captionStyle,
          aspectRatio,
          audioEdit,
          srtData,
          sceneDurations,
          transition,
          videoFilter,
          sceneFilters,
          stickers,
          mediaFit,
          bgStyle,
          bgColor,
          sceneFits,
          zoomPct,
          lastModified: new Date().toISOString()
        }
      });
      
      // Update projects list from backend
      const projectsData = await api.listProjects();
      if (projectsData) {
        setProjects(projectsData);
        localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsData));
      }
    } catch (e) {
      console.error('Failed to save project', e);
      setError('프로젝트 저장 중 오류가 발생했습니다.');
    } finally {
      setTimeout(() => {
        setIsSaving(false);
      }, 800);
    }
  }, [
    projectId, currentStep, activeMenu, url, directText, projectName, 
    duration, inputType, article, content, audio, visualCandidates, 
    selectedVisuals, voiceMap, selectedEngine, selectedLanguage, 
    voiceSettings, gapDuration, cutSpeed, scriptId, voiceRate, subtitleSize, subtitleStyle, captionStyle, aspectRatio, audioEdit,
    srtData, sceneDurations, transition, videoFilter, sceneFilters, stickers, mediaFit, bgStyle, bgColor, sceneFits, zoomPct
  ]);

  const updatePlayAllState = (val: boolean) => {
    isPlayAllPreviewRef.current = val;
    setIsPlayAllPreview(val);
  };





  const effectiveVoiceOptions = useMemo(() => ({
    ...voiceOptions,
    typecast: typecastActors.length > 0 ? typecastActors : voiceOptions.typecast,
  }), [typecastActors]);

  useEffect(() => {
    if (selectedEngine !== 'typecast' || typecastActors.length > 0) return;
    api.getTypecastActors()
      .then((d) => {
        const list = ((d as { actors?: Array<{ actor_id: string; label: string }> })?.actors || [])
          .map((a) => ({ label: `${a.label} (Typecast)`, value: a.actor_id, lang: 'ko' }));
        if (list.length > 0) setTypecastActors(list);
      })
      .catch(() => {});
  }, [selectedEngine, typecastActors.length]);

  const filteredVoices = useMemo(() => {
    return effectiveVoiceOptions[selectedEngine].filter(v =>
      !v.lang || v.lang === selectedLanguage
    );
  }, [selectedEngine, selectedLanguage, effectiveVoiceOptions]);

  useEffect(() => {
    if (content?.script) {
      const speakers = Array.from(new Set(
        Array.isArray(content.script)
          ? content.script.map((s: { speaker: string }) => s.speaker)
          : []
      )) as string[];
      const newVoiceMap = { ...voiceMap };
      let changed = false;

      const availableVoicesValues = effectiveVoiceOptions[selectedEngine].map(v => v.value);

      speakers.forEach(speaker => {
        const currentVoice = newVoiceMap[speaker];
        
        // 현재 엔진에서 지원하지 않는 목소리거나, 아직 설정되지 않은 경우 재설정
        if (!currentVoice || !availableVoicesValues.includes(currentVoice)) {
          // 엔진별 추천 기본값
          if (selectedEngine === 'qwen') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "ryan";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "sohee";
            else newVoiceMap[speaker] = "sohee";
          } else if (selectedEngine === 'edge') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj') || speaker.includes('진우')) newVoiceMap[speaker] = "ko-KR-InJoonNeural";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "ko-KR-HyunsuMultilingualNeural";
            else newVoiceMap[speaker] = "ko-KR-SunHiNeural";
          } else if (selectedEngine === 'azure') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj') || speaker.includes('진우')) newVoiceMap[speaker] = "ko-KR-JinwooNeural";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "ko-KR-HyejinNeural";
            else newVoiceMap[speaker] = "ko-KR-SunHiNeural";
          } else if (selectedEngine === 'minimax') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "male-qn-qingse";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "female-shaonv";
            else newVoiceMap[speaker] = "female-shaonv";
          } else if (selectedEngine === 'elevenlabs') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "pNInz6obpgDQGcFmaJgB";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "21m00Tcm4TlvDq8ikWAM";
            else newVoiceMap[speaker] = "21m00Tcm4TlvDq8ikWAM";
          } else if (selectedEngine === 'typecast') {
            // actor 목록은 키 등록 후 로드되므로 첫 항목으로 두고 사용자가 직접 선택
            newVoiceMap[speaker] = availableVoicesValues[0] || "";
          } else {
            newVoiceMap[speaker] = availableVoicesValues[0] || "";
          }
          changed = true;
        }
      });

      if (changed) {
        setVoiceMap(newVoiceMap);
      }
    }
  }, [content?.script, selectedEngine, voiceOptions, voiceMap]);

  const playVoiceSample = async (speaker: string, voiceValue: string, customText?: string) => {
    // 이미 재생 중인 경우
    if (audioRef.current) {
      const currentId = customText ? `segment-${customText.substring(0, 10)}` : speaker;
      const isSameSpeaker = playingSpeaker === currentId;
      
      // 전체 미리보기 중이었다면 중지
      if (isPlayAllPreviewRef.current) {
        updatePlayAllState(false);
        setPlayingSegmentIndex(null);
      }
      
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingSpeaker(null);
      
      // 같은 항목을 다시 누른 거라면 정지만 하고 종료 (토글 기능)
      if (isSameSpeaker) return;
    } else if (isPlayAllPreviewRef.current) {
      // audioRef.current는 없지만 전체 미리보기 중인 경우 (대기 중 등)
      updatePlayAllState(false);
      setPlayingSegmentIndex(null);
      setPlayingSpeaker(null);
    }

    // 메인 오디오 재생 중이면 중지
    if (mainAudioRef.current && !mainAudioRef.current.paused) {
      mainAudioRef.current.pause();
    }

    try {
      setIsPreviewLoading(customText ? `segment-${customText.substring(0, 10)}` : speaker);
      
      const previewText = customText || `안녕하세요, 저는 ${speaker} 입니다. 이 목소리가 마음에 드시나요?`;
      
      const settings = voiceSettings[speaker] || { rate: '+0%', pitch: '+0Hz' };
      const response = await api.previewTTS(previewText, voiceValue, selectedEngine, settings.rate, settings.pitch);
      if (!response || !response.audio_url) {
        throw new Error("미리보기 URL을 받지 못했습니다.");
      }
      
      const audioUrl = assetUrl(response.audio_url);
      console.log("Playing audio from:", audioUrl);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlayingSpeaker(customText ? `segment-${customText.substring(0, 10)}` : speaker);

      audio.onended = () => {
        audioRef.current = null;
        setPlayingSpeaker(null);
      };
      
      // 브라우저 정책으로 인해 play()가 거부될 수 있으므로 에러 처리 강화
      try {
        await audio.play();
      } catch (playError) {
        console.error("Audio play failed:", playError);
        setPlayingSpeaker(null);
        audioRef.current = null;
        // 재생 실패 시 사용자에게 직접 클릭하여 재생할 수 있는 방법이나 안내 제공 가능
        // 여기서는 단순 알림
        alert("브라우저 정책으로 인해 자동 재생이 차단되었습니다. 다시 한번 시도해 주세요.");
      }
    } catch (e: unknown) {
      console.error("Failed to generate preview", e);
      alert(`미리듣기 생성에 실패했습니다: ${(e as Error).message || "서버 상태를 확인해주세요."}`);
    } finally {
      setIsPreviewLoading(null);
    }
  };

  const playAllPreview = async () => {
    // 이미 재생 중인 경우 -> 중지
    if (isPlayAllPreviewRef.current) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      updatePlayAllState(false);
      setPlayingSegmentIndex(null);
      setPlayingSpeaker(null);
      return;
    }

    if (!content?.script || content.script.length === 0) return;

    // 메인 오디오 재생 중이면 중지
    if (mainAudioRef.current && !mainAudioRef.current.paused) {
      mainAudioRef.current.pause();
    }

    // 시작
    updatePlayAllState(true);
    
    try {
      const items = Array.isArray(content.script) ? content.script : Object.values(content.script);
      for (let i = 0; i < items.length; i++) {
        // 루프 시작 시 중지 체크
        if (!isPlayAllPreviewRef.current) break;

        const segment = items[i];
        setPlayingSegmentIndex(i);
        
        const speaker = typeof segment === 'object' && segment !== null ? (segment as { speaker?: string }).speaker || 'Narrator' : 'Narrator';
        const voiceValue = voiceMap[speaker] || (filteredVoices.length > 0 ? filteredVoices[0].value : 'ko-KR-SunHiNeural');
        const settings = voiceSettings[speaker] || { rate: '+0%', pitch: '+0Hz' };

        // 1. TTS 생성 요청
        setIsPreviewLoading(`segment-${typeof segment === 'object' && segment !== null && 'text' in segment ? (segment as { text: string }).text.substring(0, 10) : (segment as string).substring(0, 10)}`);
        const response = await api.previewTTS(
          typeof segment === 'object' && segment !== null && 'text' in segment
            ? (segment as { text: string }).text
            : String(segment),
          voiceValue,
          selectedEngine,
          settings.rate,
          settings.pitch
        );
        setIsPreviewLoading(null);

        if (!response?.audio_url) throw new Error("Audio URL missing");
        if (!isPlayAllPreviewRef.current) break; // 생성 중에 중지 체크

        // 2. 오디오 재생
        const audioUrl = assetUrl(response.audio_url);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setPlayingSpeaker(`segment-${typeof segment === 'object' && segment !== null && 'text' in segment ? (segment as { text: string }).text.substring(0, 10) : (segment as string).substring(0, 10)}`);

        await new Promise((resolve, reject) => {
          // 중지 감지용 인터벌
          const stopCheck = setInterval(() => {
            if (!isPlayAllPreviewRef.current) {
              clearInterval(stopCheck);
              resolve(false);
            }
          }, 100);

          audio.onended = () => {
            clearInterval(stopCheck);
            audioRef.current = null;
            setPlayingSpeaker(null);
            
            // 마지막 세그먼트가 아니면 간격 대기
            if (i < items.length - 1) {
              setTimeout(() => {
                resolve(true);
              }, gapDuration * 1000);
            } else {
              resolve(true);
            }
          };
          audio.onerror = (e) => {
            clearInterval(stopCheck);
            console.error("Audio error:", e);
            reject(e);
          };
          audio.play().catch(reject);
        });

        if (!isPlayAllPreviewRef.current) break;
      }
    } catch (err: unknown) {
      console.error("Play all failed:", err);
      alert(`재생 중 오류가 발생했습니다: ${(err as Error).message || "서버 상태를 확인해주세요."}`);
    } finally {
      updatePlayAllState(false);
      setPlayingSegmentIndex(null);
      setPlayingSpeaker(null);
      setIsPreviewLoading(null);
    }
  };

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
  }, []);

  const fetchCloudflareUsage = async () => {
    setIsFetchingUsage(true);
    try {
      const result = await api.getCloudflareUsage();
      setCfUsage(result);
    } catch (e) {
      console.error('Failed to fetch CF usage', e);
    } finally {
      setIsFetchingUsage(false);
    }
  };

  useEffect(() => {
    if (activeMenu === 'Settings') {
      fetchCloudflareUsage();
    }
  }, [activeMenu]);

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/events`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);
      } catch (err: unknown) {
        console.error('Failed to parse SSE event:', (err as Error).message || '서버 상태를 확인해주세요.');
      }
    };

    eventSource.onerror = (err: unknown) => {
      console.error('SSE connection error:', (err as Error).message || '서버 상태를 확인해주세요.');  
      alert('서버와의 연결이 끊어졌습니다. 다시 시도해주세요.');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleSaveConfig = async () => {
    if (!config) return;
    setLoading(true);
    try {
      // Azure 관련 플래그 자동 설정
      const updatedConfig = {
        ...config,
        use_cloudflare_tts_proxy: !!config.cloudflare_worker_url,
        use_azure_tts: !!config.cloudflare_worker_url
      };
      await api.updateConfig(updatedConfig);
      alert('설정이 성공적으로 저장되었습니다.');
    } catch (err: unknown) {
      alert('설정 저장 중 오류가 발생했습니다: ' + (err as Error).message || '서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };



  const handleCancelTask = async () => {
    try {
      await api.cancelTask();
      // 작업 중단 요청 후 로딩 상태 해제
      setLoading(false);
      // '전체 생성' 중이었다면 해당 플래그도 해제
      if (isGeneratingAll) {
        setIsGeneratingAll(false);
        setActiveTask(null);
        stopGenerationRef.current = true;
      }
    } catch (err: unknown) {
      console.error('Task cancellation failed:', err);
    }
  };

  const handleScrape = async () => {
    if (inputType === 'text') {
      if (!directText.trim()) return;
      setArticle({
        title: directText.split('\n')[0].substring(0, 50) + '...',
        full_text: directText
      });
      setCurrentStep(2);
      return;
    }

    if (!url) return;
    
    // Check for Ctrl/Command key during click
    const isSpecialClick = (window.event as unknown as MouseEvent)?.ctrlKey || (window.event as unknown as MouseEvent)?.metaKey;
    if (isSpecialClick) {
      window.open(url, '_blank');
      return;
    }

    setLoading(true);
    setError(null);
    // 초기 진행 상태 설정 (0%에서 멈춰있는 느낌 방지)
    setProgress({ step: 'scrape', status: 'starting', progress: 5, message: '뉴스 본문을 추출하기 위해 준비 중입니다...' });
    try {
      const data = await api.scrapeNews({ url });
      setArticle(data);
      setCurrentStep(2);
    } catch (err: unknown) {
      setError((err as Error).message || '뉴스 본문 추출 중 오류가 발생했습니다. 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!article) return;
    setLoading(true);
    setError(null);
    setSrtData([]); setSrtScriptSig(null); // 대본 재생성 시 자막 데이터 초기화
    setAudio(null); setAudioScriptSig(null); // 이전 대본의 음성이 남지 않도록 초기화
    // 초기 진행 상태 설정
    setProgress({ step: 'generate', status: 'starting', progress: 10, message: 'AI 대본 생성을 요청하고 있습니다...' });
    try {
      const result = await api.generateContent({ 
        article_text: article.full_text as string,
        duration: duration,
        template_id: templateId,
            custom_instructions: buildCutInstructions(cutSpeed),
            script_id: scriptId,
      });
      // 구 백엔드 호환: {"error": "..."} 형태로 올 수도 있다
      if (!result || (result as { error?: string }).error) {
        const errMsg = (result as { error?: string } | null)?.error || 'AI 대본 생성에 실패했습니다.';
        const isKeyIssue = errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid') || errMsg.includes('API 키');
        setError(isKeyIssue ? 'Gemini API 키가 유효하지 않습니다. 설정 화면에서 API 키를 확인해주세요.' : errMsg);
        if (isKeyIssue) setActiveMenu('Settings');
        return;
      }
      setContent(result);
      resetVisualState();
      // Stay in Step 2 for Review
      setCurrentStep(2);
    } catch (err: unknown) {
      const status = (err as Error & { status?: number }).status;
      const msg = (err as Error).message || 'AI 대본 생성 중 오류가 발생했습니다. 서버 상태를 확인해주세요.';
      const isKeyIssue = status === 401 || msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('API 키');
      setError(isKeyIssue ? 'Gemini API 키가 유효하지 않습니다. 설정 화면에서 API 키를 확인해주세요.' : msg);
      if (isKeyIssue) setActiveMenu('Settings');
    } finally {
      setLoading(false);
    }
  };

  // 숏폼 바로 만들기 (분석 스킵, 카테고리 기본 패턴 + 웹 근거)
  const handleShortsDirectCreate = async (topic: string, dur: number, category: string, reference: string = '') => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setSrtData([]); setSrtScriptSig(null);
    setAudio(null); setAudioScriptSig(null);
    setProgress({ step: 'generate', status: 'starting', progress: 10, message: 'AI 대본 생성을 요청하고 있습니다...' });
    try {
      const result = await api.createShorts({
        reference: reference || '',
        new_topic: topic.trim(),
        duration: dur,
        category,
        script_id: scriptId,
        ...(category === 'recipe_short' ? {
          ...(recipePreset.format && recipePreset.format !== 'auto' ? { format_id: recipePreset.format } : {}),
          style_id: recipePreset.style,
          platform_id: recipePreset.platform,
          hook_id: recipePreset.hook || 'random',
          preset_id: recipePreset.preset || 'random',
          ...(recipePreset.tone ? { tone_id: recipePreset.tone } : {}),
          ...(recipePreset.structure ? { structure_id: recipePreset.structure } : {}),
          ...(recipePreset.cta ? { cta_id: recipePreset.cta } : {}),
        } : {}),
      });
      const contentTyped = result as AppContent;
      const title = contentTyped.title || topic.trim().slice(0, 50);
      setArticle({ title, full_text: reference ? `${title}\n\n[원본 레시피]\n${reference.slice(0, 2000)}` : title });
      setContent(contentTyped);
      resetVisualState();
      setCurrentStep(2);
    } catch (err: unknown) {
      setError((err as Error).message || '대본 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 새로 생성된 오디오의 SRT를 즉시 자막 데이터에 반영 (TTS 재생성 직후 호출)
  const refreshSrtData = async (audioObj: { srtUrl?: unknown; srt_url?: unknown; srt_path?: unknown }): Promise<SrtItem[] | null> => {
    const rawSrtUrlValue = audioObj.srtUrl ?? audioObj.srt_url;
    const rawSrtUrl = typeof rawSrtUrlValue === 'string' ? rawSrtUrlValue : '';
    const srtPath = typeof audioObj.srt_path === 'string' ? audioObj.srt_path : '';
    if (!rawSrtUrl && !srtPath) return null;

    let srtUrl = "";
    if (rawSrtUrl) {
      srtUrl = assetUrl(rawSrtUrl);
    } else {
      // 백엔드는 보통 assets/audio/ 에 srt를 저장함
      const fileName = srtPath.split(/[\\/]/).pop();
      srtUrl = assetUrl(`/assets/audio/${fileName}`);
    }

    const response = await fetch(srtUrl as RequestInfo);
    if (!response.ok) {
      throw new Error(`Failed to fetch SRT: ${response.status} ${response.statusText}`);
    }
    const parsed = parseSrtText(await response.text());
    if (parsed.length === 0) return null;
    const split = splitLongSubtitles(parsed, content?.script.length ?? parsed.length);
    setSrtData(split);
    setSrtScriptSig((content?.script || []).map((s) => `${s.speaker}:${s.text}`).join('\n'));
    return split;
  };

  // Keep latest handleGenerateTTS for custom event
  const handleGenerateTTSRef = useRef<(() => Promise<void>) | null>(null);

  // Step4Visual의 스톡 검색을 전체 생성 루프에서 호출하기 위한 ref
  const stockFetchRef = useRef<((idx: number, silent?: boolean, force?: boolean) => Promise<void>) | null>(null);

  // 다듬기 결과 적용: 해당 씬 대본/자막 교체 + srtData 구간 교체 + 음성 무효화
  const onRefineApply = (idx: number, r: {
    narration_ko?: string;
    subtitles?: Array<{ text: string; start: number; end: number }>;
    sfx?: string;
  }) => {
    if (!content) return;
    const range = getTimelineRange(content.script, idx);
    const S = parseFloat(range.start);
    const E = parseFloat(range.end);
    const newScript = [...content.script];
    const si = newScript.findIndex((s) => s.scene_index === idx);
    if (si !== -1) {
      newScript[si] = {
        ...newScript[si],
        text: r.narration_ko ?? newScript[si].text,
        subtitle: (r.subtitles || []).map((s) => s.text).join(' / ') || newScript[si].subtitle,
        sfx: r.sfx ?? newScript[si].sfx,
      };
    }
    const maxId = srtData.reduce((m, s) => Math.max(m, s.id), 0);
    const fresh = (r.subtitles || [])
      .map((s, i) => {
        const st = S + Math.max(0, Number(s.start) || 0);
        const en = S + Math.max(Number(s.end) || 0, Number(s.start) || 0) + 0.5;
        return { id: maxId + 1 + i, start: st, end: Math.min(Math.max(en, st + 0.5), E), text: s.text, scene: idx };
      })
      .filter((s) => s.end > s.start);
    const kept = srtData.filter((s) => !(s.start >= S - 1e-6 && s.start < E - 1e-6));
    setSrtData([...kept, ...fresh].sort((a, b) => a.start - b.start));
    setContent({ ...content, script: newScript });
    setAudio(null);
    setAudioScriptSig(null);
  };
  
  /** 단계 이동 게이트: 앞 단계는 바로, 뒷 단계는 준비물이 있어야 이동한다.
   *  스텝퍼 클릭과 '이전' 버튼이 같은 규칙을 쓴다. */
  const goToStep = (stepId: number) => {
    if (loading) return;
    if (stepId === 2 && !article && !content) return;
    if (stepId === 3 && !content) return;
    if (stepId === 4 && !audio?.url) {
      handleGenerateTTS();
      return;
    }
    if (stepId === 5 && Object.keys(selectedVisuals).length === 0) return;
    setCurrentStep(stepId);
  };

  const handleGenerateTTS = async () => {
    if (!content?.script || content.script.length === 0) return;
    setLoading(true);
    setError(null);
    // setSrtData([]); // 음성 재생성 시 이전 자막 데이터를 지우면 타임라인이 초기화되므로 지우지 않음
    setProgress({ step: 'tts', status: 'starting', progress: 5, message: 'AI 음성 합성을 준비하고 있습니다...' });
    try {
      const voiceData = {
        ...voiceMap,
        settings: voiceSettings
      };

      const data = await api.generateTTS({ 
        script: content.script as { text: string; speaker: string; }[],
        voice_map: voiceData,
        engine: selectedEngine,
        rate: voiceRate,
        gap_duration: gapDuration,
        output_name: `audio_${Date.now()}`
      });
      if (data) {
        const mappedData = {
          ...data,
          url: data.audio_url || data.url,
          srtUrl: data.srt_url || data.srtUrl
        };
        setAudio(mappedData);
        setAudioScriptSig((content?.script || []).map((s) => `${s.speaker}:${s.text}`).join('\n'));
        // 새 오디오의 SRT를 자막 데이터에 즉시 반영 (이전 버전 잔류 방지)
        try {
          await refreshSrtData(mappedData);
        } catch (e) {
          console.error('SRT refresh after TTS failed:', e);
        }
        // Step 4로 무조건 이동하지 않고 현재 상태 유지
        if (currentStep < 4) setCurrentStep(4);
      }
    } catch (err: unknown) {
      setError((err as Error).message || '음성 생성 중 오류가 발생했습니다. 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleGenerateTTSRef.current = handleGenerateTTS;
  });

  const fetchCandidates = React.useCallback(async (index: number, type: 'all' | 'ai' | 'search' = 'all', forcedModel?: string, isAppend: boolean = false, customKeyword?: string, refresh: boolean = false) => {
    if (!content?.scenes || !content.scenes[index]) return;
    
    // 개별 타입별 로딩 상태 관리를 위해 키 생성
    const fetchKeys = type === 'all' ? [`${index}-ai`, `${index}-search`] : [`${index}-${type}`];
    
    // 이미 진행 중인 요청이 있는지 확인
    const isAnyFetching = fetchKeys.some(key => fetchingIndicesRef.current.has(key));
    if (!forcedModel && !customKeyword && isAnyFetching) {
      return;
    }

    // 로딩 상태 추가
    fetchKeys.forEach(key => fetchingIndicesRef.current.add(key));
    setFetchingIndices(new Set(fetchingIndicesRef.current));
    
    const scene = content.scenes[index];
    const currentModel = forcedModel || selectedAiModel;
    
    // 추가 생성 시에는 검색 키워드에 약간의 변주를 주어 다른 결과가 나오도록 유도
    let searchKeywords = customKeyword ? [customKeyword] : [scene.keyword];
    if (isAppend && type === 'search' && !customKeyword) {
      const variations = ['', ' 4k', ' high quality', ' cinematic', ' realistic', ' wallpaper'];
      const randomVariation = variations[Math.floor(Math.random() * variations.length)];
      searchKeywords = [scene.keyword + randomVariation];
    }
    
    try {
      if (!isAppend) {
        setVisualCandidates(prev => {
          const current = prev[index] || { ai: [], search: [], graph: [] };
          const shouldClearAi = (type === 'all' || type === 'ai') && current.ai.length === 0;
          const shouldClearSearch = (type === 'all' || type === 'search') && (current.search.length === 0 || !!customKeyword);

          return {
            ...prev,
            [index]: {
              ...current,
              ai: shouldClearAi ? [] : current.ai,
              search: shouldClearSearch ? [] : current.search
            }
          };
        });
      }

      const data = await api.getVisualCandidates({
        scene: {
          keyword: (scene as { keyword?: string }).keyword || '',
          description: scene.description,
          keywords: searchKeywords
        },
        index,
        project_id: projectId,
        // 추가 생성 시에는 1개씩만 요청
        ai_count: (type === 'all' || type === 'ai') ? (isAppend ? 1 : 1) : 0,
        search_count: (type === 'all' || type === 'search') ? (isAppend ? 1 : 5) : 0,
        ai_model: currentModel,
        use_cache: !refresh,
        // 추가 생성(isAppend)은 새 결과가 필요하므로 캐시를 우회 (키워드 변주와 무관하게)
        refresh: refresh || isAppend,
        // 백엔드 검색어 오염 방지: 프로젝트명이 기본값이면 기사 제목 사용, 둘 다 없으면 빈 문자열
        topic: (projectName && projectName !== '새 프로젝트') ? projectName : (article?.title || ''),
        visual_guide: (scene as { keyword?: string }).keyword || scene.description,
        // 카테고리별 비주얼 프리셋 (templates.py와 ID 공유)
        category: templateId === 'news_duo' || templateId === 'news_solo' ? 'news'
          : templateId.endsWith('_short') ? templateId
          : (shortsCategory || 'news'),
      });
      
      // 2. 결과 부분적 또는 전체적 업데이트
      setVisualCandidates(prev => {
        const current = prev[index] || { ai: [], search: [], graph: [] };
        
        let newAi = current.ai;
        if (type === 'all' || type === 'ai') {
          const incomingAi = data?.candidates?.ai || [];
          if (isAppend) {
            // 중복 제거 후 추가 (url 기준)
            const existingUrls = new Set(current.ai.map(item => item.url));
            const uniqueNewAi = incomingAi.filter((item: { url: string }) => !existingUrls.has(item.url));
            newAi = [...current.ai, ...uniqueNewAi];
          } else {
            newAi = incomingAi;
          }
        }

        let newSearch = current.search;
        if (type === 'all' || type === 'search') {
          const incomingSearch = data?.candidates?.search || [];
          if (isAppend) {
            // 중복 제거 후 추가 (url 기준)
            const existingUrls = new Set(current.search.map(item => item.url));
            const uniqueNewSearch = incomingSearch.filter((item: { url: string }) => !existingUrls.has(item.url));
            newSearch = [...current.search, ...uniqueNewSearch];
          } else {
            newSearch = incomingSearch;
          }
        }

        const newGraph = type === 'all' ? (data?.candidates?.graph || []) : current.graph;
        
        return {
          ...prev,
          [index]: {
            ...current,
            ai: newAi,
            search: newSearch,
            graph: newGraph
          }
        };
      });

      // 자동 선택 없음: 후보만 채우고 선택은 사용자가 직접 함
    } catch (err: unknown) {
      console.error(`Failed to fetch candidates for scene ${index}`, (err as Error).message || '서버 상태를 확인해주세요.');
    } finally {
      fetchKeys.forEach(key => fetchingIndicesRef.current.delete(key));
      setFetchingIndices(new Set(fetchingIndicesRef.current));
    }
  }, [content?.scenes, visualCandidates, projectId, selectedAiModel, article?.title, projectName, templateId, shortsCategory]);

  // 4단계 진입 시 혹은 장면 변경 시, 후보 이미지를 자동으로 가져오지 않도록 함 (사용자가 모델 선택 후 생성 버튼을 누를 때만 실행)
  // 기존 자동 생성 로직은 사용자의 요청에 의해 제거되었습니다.

  const fetchAllCandidates = React.useCallback(async (isRegenerate: boolean = false) => {
    if (!content?.scenes) return;
    const sceneCount = content.scenes.length;
    setIsGeneratingAll(true);
    setActiveTask('all');
    stopGenerationRef.current = false;
    setGenerationProgress({ current: 0, total: sceneCount });
    
    if (isRegenerate) {
      setSelectedVisuals({});
      setClipTrims({});
      setSceneLayouts({});
    }
    
    for (let i = 0; i < sceneCount; i++) {
      if (stopGenerationRef.current) break;
      
      // 이미 있는 이미지는 건너뜀 (다시 생성하기가 아닐 경우)
      if (!isRegenerate && visualCandidates[i] && visualCandidates[i].ai && visualCandidates[i].ai.length > 0) {
        setGenerationProgress(prev => ({ ...prev, current: i + 1 }));
        continue;
      }

      setGenerationProgress(prev => ({ ...prev, current: i + 1 }));
      // setActiveSceneIndex(i); // 현재 생성 중인 장면으로 포커스 이동 로직 제거 (사용자의 수동 선택 유지)
      
      // [개선] AI 생성과 웹 검색을 분리하여 호출함으로써 AI 결과가 먼저 화면에 반영되도록 함
      // 1. AI 이미지 생성 (비교적 빠름)
      await fetchCandidates(i, 'ai', selectedAiModelRef.current);

      if (stopGenerationRef.current) break;

      // 2. 웹 검색 수집 (Playwright 로직으로 인해 느림)
      await fetchCandidates(i, 'search');

      if (stopGenerationRef.current) break;

      // 3. 스톡 비디오 수집 (개별 생성도 그대로 가능, 실패해도 루프 계속)
      try {
        await stockFetchRef.current?.(i, true);
      } catch (e) {
        console.error(`Stock fetch failed for scene ${i}:`, e);
      }
    }

    setIsGeneratingAll(false);
    setActiveTask(null);
    setGenerationProgress({ current: 0, total: 0 });
  }, [content?.scenes, fetchCandidates, visualCandidates]);

  // 소스별 전체 수집: AI / 웹검색 이미지 / 스톡 비디오를 각각 전 장면에 실행
  // 헤더 버튼은 항상 강제 재생성 (씬별 ⟳는 단일 장면용). 캐시 우회 + 새로고침.
  const fetchAllByType = React.useCallback(async (type: 'ai' | 'search' | 'stock', force: boolean = false) => {
    if (!content?.scenes) return;
    const sceneCount = content.scenes.length;
    setIsGeneratingAll(true);
    setActiveTask(type);
    stopGenerationRef.current = false;
    setGenerationProgress({ current: 0, total: sceneCount });

    for (let i = 0; i < sceneCount; i++) {
      if (stopGenerationRef.current) break;
      setGenerationProgress(prev => ({ ...prev, current: i + 1 }));
      try {
        if (type === 'ai') {
          if (!force && visualCandidates[i]?.ai && visualCandidates[i].ai.length > 0) continue;
          await fetchCandidates(i, 'ai', selectedAiModelRef.current, false, undefined, force);
        } else if (type === 'search') {
          if (!force && visualCandidates[i]?.search && visualCandidates[i].search.length > 0) continue;
          await fetchCandidates(i, 'search', undefined, false, undefined, force);
        } else {
          await stockFetchRef.current?.(i, true, force);
        }
      } catch (e) {
        console.error(`Bulk ${type} fetch failed for scene ${i}:`, e);
      }
      if (stopGenerationRef.current) break;
    }

    setIsGeneratingAll(false);
    setActiveTask(null);
    setGenerationProgress({ current: 0, total: 0 });
  }, [content?.scenes, fetchCandidates, visualCandidates]);

  const stopGeneration = () => {
    stopGenerationRef.current = true;
    setIsGeneratingAll(false);
    setActiveTask(null);
  };

  const handleMoveToEdit = async () => {
    if (!audio || !selectedVisuals || !content?.scenes) return;
    setLoading(true);
    try {
      // SRT 파일 파싱 시도 (백엔드에 SRT 파싱 엔드포인트가 있다고 가정하거나 프론트에서 처리)
      // 여기서는 간단하게 SRT 파일 URL이 있으면 가져와서 파싱하는 로직 추가 가능
      // [개선] audio.srtUrl 또는 audio.srt_url 모두 지원하도록 수정
      const parsedData = await refreshSrtData(audio).catch((e) => {
        console.error("Failed to parse SRT:", e);
        return null;
      });
      if (parsedData && parsedData.length > 0) {
        const totalDuration = parsedData[parsedData.length - 1].end;
        setVideoDuration(totalDuration);

        // 각 장면의 초기 길이를 균등하게 분할
        if (content?.scenes) {
          const initialDurations = content.scenes.map(() => totalDuration / content.scenes.length);
          setSceneDurations(initialDurations);
        }
      }

      setCurrentStep(5);
    } catch (err: unknown) {
      setError((err as Error).message || '편집 단계로 이동 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (content?.script && srtData.length === 0) {
      const rawSrtData: SrtItem[] = [];
      content.script.forEach((item, idx) => {
        const range = getTimelineRange(content.script, idx);
        rawSrtData.push({
          id: idx + 1,
          start: parseFloat(range.start),
          end: parseFloat(range.end),
          text: item.text,
          scene: idx
        });
      });
      const newSrtData = splitLongSubtitles(rawSrtData, content.script.length);
      if (newSrtData.length > 0) {
        setSrtData(newSrtData);
        setSrtScriptSig((content?.script || []).map((s) => `${s.speaker}:${s.text}`).join('\n'));
      }
    }
  }, [content, srtData.length, getTimelineRange]);

  type RenderOverrides = {
    audio?: { url?: string; srtUrl?: string; audio_path?: string; srt_path?: string; [key: string]: unknown } | null;
    visuals?: Record<number, string[]>;
    content?: AppContent | null;
    srt?: SrtItem[];
    ranges?: Array<{ start: number; end: number; duration: number }>;
  };

  // 원클릭 자동 제작: Step1 입력 → 대본 → TTS → 비주얼 수집·선택 → 렌더까지 자동 연결.
  // 수동 모드의 "자동 선택 금지"와 별개로, 이 모드를 명시적으로 누른 경우에만 첫 후보를 자동 선택한다.
  const handleAutoMake = async (source: 'news' | 'shorts') => {
    setLoading(true);
    setError(null);
    try {
      // ---- 1. 대본 ----
      setProgress({ step: 'generate', status: 'starting', progress: 5, message: '자동 제작: 대본을 생성하고 있습니다...' });
      let contentData: AppContent | null = content;
      let articleData = article;
      let isNewContent = false;
      if (!contentData) {
        isNewContent = true;
        if (source === 'news') {
          if (inputType === 'text') {
            if (!directText.trim()) throw new Error('대본 본문을 입력해주세요.');
            articleData = { title: directText.split('\n')[0].substring(0, 50) + '...', full_text: directText };
            setArticle(articleData);
          } else {
            if (!url) throw new Error('기사 URL을 입력해주세요.');
            const scraped = await api.scrapeNews({ url });
            articleData = scraped;
            setArticle(scraped);
          }
          if (!articleData?.full_text) throw new Error('기사 본문을 가져오지 못했습니다.');
          const result = await api.generateContent({
            article_text: articleData.full_text as string,
            duration: duration,
            template_id: templateId,
        custom_instructions: buildCutInstructions(cutSpeed),
        script_id: scriptId,
          });
          if (!result || (result as { error?: string }).error) {
            throw new Error((result as { error?: string } | null)?.error || 'AI 대본 생성에 실패했습니다.');
          }
          contentData = result as AppContent;
        } else {
          if (!shortsTopic.trim()) throw new Error('주제를 입력해주세요.');
          const result = await api.createShorts({
            reference: shortsReference || '',
            new_topic: shortsTopic.trim(),
            duration,
            category: shortsCategory,
            script_id: scriptId,
            ...(shortsCategory === 'recipe_short' ? {
              ...(recipePreset.format && recipePreset.format !== 'auto' ? { format_id: recipePreset.format } : {}),
              style_id: recipePreset.style,
              platform_id: recipePreset.platform,
              hook_id: recipePreset.hook || 'random',
              preset_id: recipePreset.preset || 'random',
              ...(recipePreset.tone ? { tone_id: recipePreset.tone } : {}),
              ...(recipePreset.structure ? { structure_id: recipePreset.structure } : {}),
              ...(recipePreset.cta ? { cta_id: recipePreset.cta } : {}),
            } : {}),
          });
          const contentTyped = result as AppContent;
          const title = contentTyped.title || shortsTopic.trim().slice(0, 50);
          articleData = { title, full_text: title };
          setArticle(articleData);
          contentData = contentTyped;
        }
        setContent(contentData);
        if (isNewContent) resetVisualState();
        setSrtData([]); setSrtScriptSig(null);
        setAudio(null); setAudioScriptSig(null);
        setCurrentStep(2);
      }
      if (!contentData?.script || !contentData?.scenes) throw new Error('대본 생성에 실패했습니다.');

      // ---- 2. TTS ----
      setProgress({ step: 'tts', status: 'starting', progress: 5, message: '자동 제작: 음성을 생성하고 있습니다...' });
      const voiceData = { ...voiceMap, settings: voiceSettings };
      const ttsData = await api.generateTTS({
        script: contentData.script as { text: string; speaker: string; }[],
        voice_map: voiceData,
        engine: selectedEngine,
        rate: voiceRate,
        gap_duration: gapDuration,
        output_name: `audio_${Date.now()}`
      });
      if (!ttsData) throw new Error('음성 생성에 실패했습니다.');
      const mappedAudio = {
        ...ttsData,
        url: (ttsData as { audio_url?: string; url?: string }).audio_url || (ttsData as { url?: string }).url,
        srtUrl: (ttsData as { srt_url?: string; srtUrl?: string }).srt_url || (ttsData as { srtUrl?: string }).srtUrl
      };
      setAudio(mappedAudio);
      setAudioScriptSig(contentData.script.map((s) => `${s.speaker}:${s.text}`).join('\n'));
      setCurrentStep(3);

      // ---- 3. SRT 파싱 ----
      const rawSrtUrl = typeof mappedAudio.srtUrl === 'string' ? mappedAudio.srtUrl
        : (typeof mappedAudio.srt_path === 'string' ? '' : '');
      const srtPathStr = typeof mappedAudio.srt_path === 'string' ? mappedAudio.srt_path : '';
      let srtList: SrtItem[] = [];
      {
        let srtUrl = '';
        if (rawSrtUrl) {
          srtUrl = assetUrl(rawSrtUrl);
        } else if (srtPathStr) {
          const fileName = srtPathStr.split(/[\\/]/).pop();
          srtUrl = assetUrl(`/assets/audio/${fileName}`);
        }
        if (!srtUrl) throw new Error('자막 파일을 찾을 수 없습니다.');
        const response = await fetch(srtUrl as RequestInfo);
        if (!response.ok) throw new Error(`자막 로드 실패: ${response.status}`);
        const parsed = parseSrtText(await response.text());
        if (parsed.length === 0) throw new Error('자막 파싱에 실패했습니다.');
        srtList = splitLongSubtitles(parsed, contentData.script.length);
        setSrtData(srtList);
        setSrtScriptSig(contentData.script.map((s) => `${s.speaker}:${s.text}`).join('\n'));
      }
      const totalDuration = srtList[srtList.length - 1].end;
      setVideoDuration(totalDuration);
      if (contentData.scenes) {
        setSceneDurations(contentData.scenes.map(() => totalDuration / contentData.scenes.length));
      }

      // ---- 4. 비주얼 수집 + 첫 후보 자동 선택 ----
      setIsGeneratingAll(true);
      setActiveTask('all');
      stopGenerationRef.current = false;
      const sceneCount = contentData.scenes.length;
      setGenerationProgress({ current: 0, total: sceneCount });
      const newCandidates: Record<number, SceneCandidates> = {};
      const newExtra: Record<number, StockVideo[]> = {};
      const newSelected: Record<number, string[]> = {};
      const categoryFor = templateId === 'news_duo' || templateId === 'news_solo' ? 'news'
        : templateId.endsWith('_short') ? templateId
        : (shortsCategory || 'news');
      const topicName = (projectName && projectName !== '새 프로젝트') ? projectName : (articleData?.title || '');
      for (let i = 0; i < sceneCount; i++) {
        if (stopGenerationRef.current) break;
        setProgress({ step: 'visuals', status: 'starting', progress: 5, message: `자동 제작: 장면 ${i + 1}/${sceneCount} 소재를 모으고 있습니다...` });
        setGenerationProgress({ current: i + 1, total: sceneCount });
        const scene = contentData.scenes[i] as unknown as Record<string, unknown>;
        const keyword = String(scene.keyword || '');
        try {
          const vc = await api.getVisualCandidates({
            scene: { keyword, description: String(scene.description || ''), keywords: [keyword] },
            index: i,
            project_id: projectId,
            ai_count: 1,
            search_count: 5,
            ai_model: selectedAiModel,
            topic: topicName,
            visual_guide: keyword || String(scene.description || ''),
            category: categoryFor,
          });
          newCandidates[i] = {
            ai: vc?.candidates?.ai || [],
            search: vc?.candidates?.search || [],
            graph: vc?.candidates?.graph || [],
          };
        } catch (e) {
          console.error(`Auto visuals failed for scene ${i}:`, e);
          newCandidates[i] = { ai: [], search: [], graph: [] };
        }
        try {
          const base = String((scene.stock_query as string) || keyword || '').trim();
          const descHead = (!scene.stock_query && scene.description
            ? String(scene.description).split(',')[0].slice(0, 60).trim() : '');
          const kw = `${base} ${descHead}`.trim();
          const stockData = kw ? await api.getStockVideos(kw, 4) : { videos: [] };
          const vids: StockVideo[] = ((stockData as { videos?: StockVideo[] })?.videos || [])
            .map((v) => ({ ...v, kind: 'video', source: 'stock' }));
          newExtra[i] = vids;
        } catch (e) {
          console.error(`Auto stock failed for scene ${i}:`, e);
          newExtra[i] = [];
        }
        const first = newCandidates[i].ai[0]?.url
          || newCandidates[i].search[0]?.url
          || newExtra[i][0]?.url;
        if (first) newSelected[i] = [first];
      }
      setIsGeneratingAll(false);
      setActiveTask(null);
      setGenerationProgress({ current: 0, total: 0 });
      // 중단해도 모은 만큼은 state에 반영
      setVisualCandidates((prev) => ({ ...prev, ...newCandidates }));
      setExtraMedia((prev) => {
        const merged: Record<number, StockVideo[]> = { ...prev };
        Object.entries(newExtra).forEach(([k, v]) => {
          const idx = Number(k);
          const existing = new Set((merged[idx] || []).map((m) => m.url));
          merged[idx] = [...(merged[idx] || []), ...v.filter((m) => !existing.has(m.url))];
        });
        return merged;
      });
      const sanitized = sanitizeSelectedVisuals(newSelected);
      if (stopGenerationRef.current) {
        setSelectedVisuals((prev) => {
          const merged: Record<number, string[]> = { ...prev };
          Object.entries(sanitized).forEach(([k, v]) => {
            const idx = Number(k);
            if (!(merged[idx] || []).length) merged[idx] = v;
          });
          return merged;
        });
        setCurrentStep(4);
        return;
      }
      setSelectedVisuals(sanitized);
      setCurrentStep(5);

      // ---- 5. 전부 모였으면 바로 렌더 ----
      const complete = contentData.scenes.every((_, idx) => (sanitized[idx] || []).length > 0);
      if (!complete) {
        setError('일부 장면의 소재가 비어 있어 편집 단계에서 멈췄습니다. 직접 채운 뒤 내보내기를 눌러주세요.');
        return;
      }
      // 씬 구간 계산 (getTimelineRange의 SRT 분기 로직과 동일)
      const ranges = contentData.scenes.map((_, idx) => {
        const scoped = srtList.filter((s) => (s as { scene?: number }).scene === idx);
        if (scoped.length === 0) {
          return { start: 0, end: 0, duration: 0 };
        }
        const start = scoped[0].start;
        const nextScoped = srtList.filter((s) => ((s as { scene?: number }).scene ?? -1) === idx + 1);
        let end: number;
        if (nextScoped.length > 0) {
          end = nextScoped[0].start;
        } else if (idx < contentData.scenes.length - 1) {
          const later = srtList.filter((s) => (((s as { scene?: number }).scene ?? -1) > idx));
          end = later.length > 0 ? later[0].start : scoped[scoped.length - 1].end;
        } else {
          end = scoped[scoped.length - 1].end + gapDuration;
        }
        return { start, end, duration: Math.max(0, end - start) };
      });
      await handleFinalRender({
        audio: mappedAudio,
        visuals: sanitized,
        content: contentData,
        srt: srtList,
        ranges,
      });
    } catch (err: unknown) {
      setError((err as Error).message || '자동 제작 중 오류가 발생했습니다.');
      setIsGeneratingAll(false);
      setActiveTask(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalRender = async (overrides?: RenderOverrides) => {
    const audioData = overrides?.audio !== undefined ? overrides.audio : audio;
    const visualsData = overrides?.visuals ?? selectedVisuals;
    const contentData = overrides?.content !== undefined ? overrides.content : content;
    const srtList = overrides?.srt ?? srtData;
    if (!audioData || !contentData?.scenes) return;
    // 구간: 자동 모드에서 직접 계산한 값을 우선 사용 (state 비동기 문제 회피)
    const getRange = (idx: number) => {
      if (overrides?.ranges && overrides.ranges[idx]) return overrides.ranges[idx];
      const r = getTimelineRange(contentData.script, idx);
      return { start: parseFloat(r.start), end: parseFloat(r.end), duration: parseFloat(r.duration) };
    };
    setLoading(true);
    setError(null);
    setProgress({ step: 'render', status: 'starting', progress: 5, message: '최종 영상 렌더링을 준비하고 있습니다...' });
    try {
      // 자동 할당 없음: 비어 있는 씬이 있으면 렌더를 막고 직접 고르게 함
      const finalVisuals: Record<number, string[]> = { ...visualsData };
      const missingScenes: number[] = [];

      contentData.scenes.forEach((_, idx) => {
        if (!finalVisuals[idx] || finalVisuals[idx].length === 0) {
          missingScenes.push(idx + 1);
        }
      });

      if (missingScenes.length > 0) {
        alert(`아직 시각 자료가 없는 장면이 있습니다 (장면 ${missingScenes.join(', ')}). 각 장면에서 직접 선택해주세요.`);
        return;
      }

      // 백엔드 렌더링을 위해 이미지 리스트와 각 장면의 길이를 전달
      // 영상 클립은 in/out 트림을 함께 전달 ({path, in, out})
      const bg_images: Array<[Array<string | ClipRef>, number]> = contentData.scenes.map((_, idx) => {
        const range = getRange(idx);
        const trims = clipTrims[idx] || {};
        const layout = sceneLayouts[idx];
        const hasLayout = layout && (Math.abs(layout.scale - 1) > 1e-6 || Math.abs(layout.x) > 1e-6 || Math.abs(layout.y) > 1e-6);
        const clips = (finalVisuals[idx] || []).map((p) => {
          const t = trims[p];
          const hasTrim = t && (t.in > 0 || t.out != null);
          if (hasTrim || hasLayout) {
            return {
              path: p,
              ...(hasTrim ? { in: Math.max(0, t!.in || 0), out: t!.out } : {}),
              ...(hasLayout ? { scale: layout!.scale, x: layout!.x, y: layout!.y } : {}),
            };
          }
          return p;
        });
        return [
          clips,
          range.duration
        ];
      });

      // SRT 데이터를 다시 SRT 포맷으로 변환 (편집된 내용 반영)
      const formatSRT = (data: typeof srtList) => {
        return data.map(item => {
          const secondsToTime = (s: number) => {
            const h = Math.floor(s / 3600).toString().padStart(2, '0');
            const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
            const sec = Math.floor(s % 60).toString().padStart(2, '0');
            const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
            return `${h}:${m}:${sec},${ms}`;
          };
          return `${item.id}\n${secondsToTime(item.start)} --> ${secondsToTime(item.end)}\n${item.text}\n`;
        }).join('\n');
      };

      const editedSrtContent = formatSRT(srtList);

      // 씬 자막(상단 밴드): Step2의 씬별 subtitle을 씬 구간에 맞춰 전달
      const sceneCaptions = showSceneCaptions
        ? contentData.scenes.flatMap((scene, idx) => {
            const text = (scene.subtitle || '').trim();
            if (!text) return [];
            const range = getRange(idx);
            const start = range.start;
            const end = range.end;
            if (!(end > start)) return [];
            return [{ start, end, text }];
          })
        : [];

      const data = await api.renderVideo({
        audio_path: audioData.audio_path as string,
        srt_path: audioData.srt_path as string,
        bg_images: bg_images,
        output_name: `video_${Date.now()}`,
        subtitle_style: {
          ...subtitleStyle,
          bg_color: subtitleStyle.bg_color === 'transparent' ? undefined : subtitleStyle.bg_color
        },
        audio_edit: {
          ...audioEdit,
          bgm_path: audioEdit.bgm_path || undefined,
          sfx_list: audioEdit.sfx_list.map(s => ({
            ...s,
            path: s.path.replace('assets/', '') // 백엔드에서는 assets/ 제외한 경로 기대
          }))
        },
        edited_srt: editedSrtContent, // 백엔드에서 이 필드를 처리하도록 함
        aspect_ratio: aspectRatio, // 화면 비율 추가
        scene_captions: sceneCaptions,
        transition: transition,
        video_filter: videoFilter,
        scene_filters: sceneFilters,
        stickers: stickers,
        media_fit: mediaFit,
        scene_fits: sceneFits,
        bg_style: bgStyle,
        bg_color: bgColor,
        fit_zoom: zoomPct / 100,
        caption_style: {
          ...captionStyle,
          bg_color: captionStyle.bg_color === 'transparent' ? undefined : captionStyle.bg_color
        }
      });
      setRenderResult(data);
      setCurrentStep(6);
      if (activeMenu === 'Editor') {
        setActiveMenu('Home');
      }
    } catch (err: unknown) {
      setError((err as Error).message || '비디오 렌더링 중 오류가 발생했습니다. 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <style>{customStyles}</style>
      
      {/* Hidden Audio Elements for Preview */}
      <audio 
        ref={mainAudioRef} 
        src={typeof audio?.audio_url === 'string' ? assetUrl(audio.audio_url) : undefined} 
        className="hidden"
      />
      <audio 
        ref={bgmAudioRef} 
        src={audioEdit.bgm_path ? assetUrl(audioEdit.bgm_path) : undefined} 
        loop 
        className="hidden"
      />

      <Sidebar 
        activeMenu={activeMenu} 
        setActiveMenu={(menu) => {
          if (menu === 'Editor') {
            openEditorMenu();
          } else {
            setActiveMenu(menu);
          }
        }} 
      />

      {/* Right column: 헤더는 사이드바 바로 오른쪽에 고정, 레일은 헤더 아래 행에 도킹 */}
      <div className="flex-1 flex flex-col relative min-w-0 min-h-0 overflow-hidden">
        <Header
          activeMenu={activeMenu}
          handleNewProject={handleNewProject}
          handleSaveProject={handleSaveProject}
          isSaving={isSaving}
        />
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
      {/* 제작 설정 레일: 헤더 아래 행에 도킹. 카테고리를 고른 뒤(input)부터 표시. 접으면 펼치기 버튼만 */}
      {activeMenu === 'Home' && homeHub === 'auto' && currentStep === 1 && step1Phase === 'input' && (
        presetRailOpen ? (
        <aside className="w-80 shrink-0 h-full min-h-0 overflow-y-auto custom-scrollbar bg-white border-r border-gray-200 z-10">
          <button
            onClick={() => setPresetRailOpen(false)}
            title="제작 설정 접기 (펼치기 버튼만 남음)"
            className="sticky top-0 z-10 w-full flex items-center gap-2 bg-indigo-600 text-white px-4 py-3 hover:bg-indigo-700 transition-colors"
          >
            <SlidersHorizontal size={14} />
            <span className="text-sm font-extrabold">제작 설정</span>
            <ChevronLeft size={16} className="ml-auto" />
          </button>
          <VideoPresetPanel
            bare
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            duration={duration}
            setDuration={setDuration}
            cutSpeed={cutSpeed}
            setCutSpeed={setCutSpeed}
            scriptOptions={scriptOptions}
            scriptId={scriptId}
            onScriptChange={setScriptId}
            selectedEngine={selectedEngine}
            setSelectedEngine={setSelectedEngine}
            voiceRate={voiceRate}
            setVoiceRate={setVoiceRate}
            selectedAiModel={selectedAiModel}
            setSelectedAiModel={setSelectedAiModel}
            videoModel={videoModel}
            setVideoModel={setVideoModel}
            hasMinimaxKey={!!(config?.minimax_api_key as string)}
            hasFalKey={!!(config?.fal_key as string)}
            recipePreset={recipePreset}
            setRecipePreset={setRecipePreset}
            mediaFit={mediaFit}
            setMediaFit={setMediaFit}
            bgStyle={bgStyle}
            setBgStyle={setBgStyle}
            bgColor={bgColor}
            setBgColor={setBgColor}
            zoomPct={zoomPct}
            setZoomPct={setZoomPct}
            subtitlePreset={subtitleStyle.preset}
            onSubtitlePresetChange={(id) => setSubtitleStyle((prev) => {
              const preset = (subtitlePresets as Record<string, Partial<typeof prev>>)[id];
              const factor = SUBTITLE_SIZES.find((s) => s.id === subtitleSize)?.factor ?? 1;
              const base = (preset as { font_size?: number } | undefined)?.font_size ?? 20;
              return { ...prev, preset: id, ...preset, font_size: Math.round(base * factor) };
            })}
            subtitleSize={subtitleSize}
            onSubtitleSizeChange={(s) => {
              const prevFactor = SUBTITLE_SIZES.find((x) => x.id === subtitleSize)?.factor ?? 1;
              const factor = SUBTITLE_SIZES.find((x) => x.id === s)?.factor ?? 1;
              setSubtitleSize(s);
              setSubtitleStyle((prev) => {
                const base = (subtitlePresets as Record<string, { font_size: number }>)[prev.preset]?.font_size ?? 20;
                return { ...prev, font_size: Math.round(base * factor) };
              });
              // '자막 크기'라 적혀 있는데 상단 자막만 그대로면 절반만 바뀌어
              // 패널이 거짓말을 한다. 이전 배율 대비 비율을 상단에도 그대로 적용한다.
              setCaptionStyle((prev) => ({
                ...prev,
                font_size: Math.max(8, Math.round((prev.font_size || 13) * (factor / prevFactor))),
              }));
            }}
            showSubtitles={subtitleStyle.show_subtitles}
            onToggleSubtitles={(v) => setSubtitleStyle((prev) => ({ ...prev, show_subtitles: v }))}
            subtitleY={subtitleStyle.y_offset ?? 85}
            onSubtitleYChange={(y) => setSubtitleStyle((prev) => ({ ...prev, y_offset: y }))}
            captionStyle={captionStyle}
            setCaptionStyle={setCaptionStyle}
            showSceneCaptions={showSceneCaptions}
            setShowSceneCaptions={setShowSceneCaptions}
          />
          <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
            <button
              onClick={handleSaveProject}
              disabled={isSaving}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-extrabold hover:bg-indigo-700 disabled:bg-gray-300 shadow-lg shadow-indigo-200 transition-all"
            >
              {isSaving ? '저장 중...' : '설정 저장 완료'}
            </button>
          </div>
        </aside>
        ) : (
        <div className="shrink-0 h-full flex flex-col py-4 pl-0 z-10">
          <button
            onClick={() => setPresetRailOpen(true)}
            title="제작 설정 펼치기"
            className="flex items-center justify-center pl-1 pr-1.5 py-3 rounded-r-lg bg-white border border-l-0 border-gray-200 text-gray-400 hover:text-indigo-600 shadow-sm transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        )
      )}
      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 min-h-0 overflow-hidden">
        {/* Content Area — 자동화 흐름 전 단계 공통: 넓게 stretch */}
        <div className={`flex-1 pt-2 flex flex-col min-h-0 min-w-0 overflow-hidden ${activeMenu === 'Editor' || (activeMenu === 'Home' && homeHub === 'auto') ? 'pl-0 pr-2 md:pr-3 pb-1 items-stretch' : 'px-4 md:px-8 pb-6 items-center'}`}>
          <div className={`w-full flex-1 flex flex-col min-h-0 min-w-0 ${(activeMenu === 'Editor' || (activeMenu === 'Home' && homeHub === 'auto')) ? 'max-w-none' : 'max-w-7xl'}`}>
            {activeMenu === 'Home' ? (
              homeHub === 'hubs' ? (
              <HubHome
                onSelect={(hub) => {
                  if (hub === 'auto') setHomeHub('auto');
                  else if (hub === 'marketing') setActiveMenu('Marketing');
                  else setActiveMenu('Posting');
                }}
              />
              ) : (
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {/* Stepper (Sticky) — 전 단계 공통 크롬: 허브 버튼 내장 + 컴팩트 */}
                <div className="z-20 bg-white/95 backdrop-blur-md py-2 px-4 border border-gray-100 shadow-sm rounded-2xl shrink-0 mb-1">
                  <div className="max-w-none mx-auto flex items-center gap-3 relative">
                    <button
                      onClick={() => setHomeHub('hubs')}
                      title="허브로 돌아가기"
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-all"
                    >
                      ← 허브
                    </button>
                    {currentStep > 1 && (
                      <button
                        onClick={() => goToStep(currentStep - 1)}
                        title={`이전 단계로 (${currentStep - 1}. ${steps.find((s) => s.id === currentStep - 1)?.label ?? ''})`}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-all"
                      >
                        ← 이전
                      </button>
                    )}
                    <div className="flex-1 flex justify-between items-center relative">
                    <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0 mx-8 md:mx-16" />
                    {steps.map((step) => (
                      <StepItem
                        key={step.id}
                        number={step.id}
                        label={step.label}
                        active={currentStep === step.id}
                        completed={currentStep > step.id}
                        compact
                        onClick={() => goToStep(step.id)}
                      />
                    ))}
                    </div>
                  </div>
                </div>

                {/* Content Card */}
                <div className={`bg-white shadow-2xl shadow-gray-200/40 border border-gray-100 flex-1 relative flex flex-col min-h-0 overflow-hidden ${currentStep === 5 ? 'rounded-none shadow-none border-none' : 'rounded-3xl'}`}>
                  
                  <div className={`flex-1 flex flex-col min-h-0 ${currentStep !== 5 ? 'p-2 md:p-3' : ''}`}>
                    <LoadingOverlay 
                      loading={loading} 
                      progress={progress} 
                      handleCancelTask={handleCancelTask} 
                    />

                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 animate-in fade-in slide-in-from-top-2 duration-300">
                    <AlertCircle size={20} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-sm">오류 발생</p>
                      <p className="text-xs opacity-80 max-h-32 overflow-y-auto">
                        {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
                      </p>
                    </div>
                    <button
                      onClick={() => setError(null)}
                      aria-label="Clear error"
                      title="Clear error"
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                {success && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3 text-green-600 animate-in fade-in slide-in-from-top-2 duration-300">
                    <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-sm">성공</p>
                      <p className="text-xs opacity-80">
                        {success}
                      </p>
                    </div>
                    <button
                      onClick={() => setSuccess(null)}
                      aria-label="Clear success"
                      title="Clear success"
                      className="text-green-400 hover:text-green-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Step 1: URL or Text Input (Redesigned) */}
                {currentStep === 1 && (
                  <Step1Input 
                    projectName={projectName}
                    setProjectName={setProjectName}
                    inputType={inputType}
                    setInputType={setInputType}
                    url={url}
                    setUrl={setUrl}
                    directText={directText}
                    setDirectText={setDirectText}
                    duration={duration}
                    setDuration={setDuration}
                    templateId={templateId}
                    setTemplateId={setTemplateId}
                    shortsMode={shortsMode}
                    setShortsMode={setShortsMode}
                    shortsYtUrl={shortsYtUrl}
                    setShortsYtUrl={setShortsYtUrl}
                    shortsHint={shortsHint}
                    setShortsHint={setShortsHint}
                    shortsReport={shortsReport}
                    setShortsReport={setShortsReport}
                    shortsTopic={shortsTopic}
                    setShortsTopic={setShortsTopic}
                    shortsCategory={shortsCategory}
                    setShortsCategory={setShortsCategory}
                    shortsReference={shortsReference}
                    setShortsReference={setShortsReference}
                    onShortsComplete={(article, content) => {
                      setArticle(article);
                      setContent(content);
                      setSrtData([]); setSrtScriptSig(null);
                      setAudio(null); setAudioScriptSig(null);
                      setCurrentStep(2);
                    }}
                    onShortsDirectCreate={handleShortsDirectCreate}
                    handleScrape={handleScrape}
                    loading={loading}
                    onAutoMake={handleAutoMake}
                    recipePreset={recipePreset}
                    setRecipePreset={setRecipePreset}
                    phase={step1Phase}
                    setPhase={setStep1Phase}
                    onCategoryPick={(tplId) => fetchScriptOptions(tplId, false)}
                    scriptId={scriptId}
                  />
                )}

                {/* Step 2: Content Generation & Review */}
                {currentStep === 2 && article && (
                  <Step2Review 
                    article={article}
                    content={content}
                    duration={duration}
                    handleGenerate={handleGenerateContent}
                    setContent={setContent}
                    setAudio={setAudio}
                    setAudioScriptSig={setAudioScriptSig}
                    getTimelineRange={getTimelineRange}
                    setCurrentStep={setCurrentStep}
                    loading={loading}
                  />
                )}

                {/* Step 3: Voice Selection & TTS */}
                {currentStep === 3 && content && (
                  <Step3Voice
                    content={content}
                    voiceMap={voiceMap}
                    setVoiceMap={setVoiceMap}
                    voiceSettings={voiceSettings}
                    setVoiceSettings={setVoiceSettings}
                    selectedEngine={selectedEngine}
                    setSelectedEngine={setSelectedEngine}
                    selectedLanguage={selectedLanguage}
                    setSelectedLanguage={setSelectedLanguage}
                    gapDuration={gapDuration}
                    setGapDuration={setGapDuration}
                    handleGenerateTTS={handleGenerateTTS}
                    playAllPreview={playAllPreview}
                    isPlayAllPreview={isPlayAllPreview}
                    audio={audio && audio.url ? { url: audio.url } : null}
                    setAudio={setAudio}
                    setCurrentStep={setCurrentStep}
                    loading={loading}
                    isPreviewLoading={isPreviewLoading}
                    playingSpeaker={playingSpeaker}
                    playingSegmentIndex={playingSegmentIndex}
                    playVoiceSample={playVoiceSample}
                    getTimelineRange={getTimelineRange}
                    languages={languages}
                    voiceOptions={effectiveVoiceOptions}
                    filteredVoices={filteredVoices}
                    isStale={audioStale || subsStale}
                  />
                )}

                {/* Step 4: Visual Selection */}
                {currentStep === 4 && content && (
                  <Step4Visual
                    content={content}
                    activeSceneIndex={activeSceneIndex}
                    setActiveSceneIndex={setActiveSceneIndex}
                    selectedVisuals={selectedVisuals}
                    setSelectedVisuals={setSelectedVisuals}
                    visualCandidates={visualCandidates}
                    setVisualCandidates={setVisualCandidates}
                    isGeneratingAll={isGeneratingAll}
                    generationProgress={generationProgress}
                    activeTask={activeTask}
                    stopGeneration={stopGeneration}
                    selectedAiModel={selectedAiModel}
                    setSelectedAiModel={setSelectedAiModel}
                    fetchAllCandidates={fetchAllCandidates}
                    fetchAllByType={fetchAllByType}
                    fetchCandidates={fetchCandidates}
                    editingSceneIndex={editingSceneIndex}
                    setEditingSceneIndex={setEditingSceneIndex}
                    editSceneValues={editSceneValues}
                    setEditSceneValues={setEditSceneValues}
                    setContent={setContent}
                    setCurrentStep={setCurrentStep}
                    zoomedImage={zoomedImage}
                    setZoomedImage={setZoomedImage}
                    handleMoveToEdit={handleMoveToEdit}
                    fetchingIndices={fetchingIndices}
                    stockFetchRef={stockFetchRef}
                    getSceneDuration={(idx) => parseFloat(getTimelineRange(content.script, idx).duration)}
                    clipTrims={clipTrims}
                    setClipTrims={setClipTrims}
                    extraMedia={extraMedia}
                    setExtraMedia={setExtraMedia}
                    onRefineApply={onRefineApply}
                  />
                )}
                {/* Step 5: Advanced Video Editor */}
                {currentStep === 5 && content && (
                  <Step5Timeline
                    currentStep={currentStep}
                    setCurrentStep={setCurrentStep}
                    content={content}
                    setContent={setContent}
                    loading={loading}
                    handleFinalRender={handleFinalRender}
                    currentTime={currentTime}
                    videoDuration={videoDuration}
                    isPlaying={isPlaying}
                    setIsPlaying={setIsPlaying}
                    setCurrentTime={setCurrentTime}
                    sceneDurations={sceneDurations}
                    calculateDuration={calculateDuration}
                    gapDuration={gapDuration}
                    selectedVisuals={selectedVisuals}
                    setSelectedVisuals={setSelectedVisuals}
                    clipTrims={clipTrims}
                    sceneLayouts={sceneLayouts}
                    setSceneLayouts={setSceneLayouts}
                    showSceneCaptions={showSceneCaptions}
                    setShowSceneCaptions={setShowSceneCaptions}
                    captionStyle={captionStyle}
                    setCaptionStyle={setCaptionStyle}
                    visualCandidates={visualCandidates}
                    setVisualCandidates={setVisualCandidates}
                    subtitleStyle={subtitleStyle}
                    setSubtitleStyle={setSubtitleStyle}
                    srtData={srtData}
                    setSrtData={setSrtData}
                    setSrtScriptSig={setSrtScriptSig}
                    editingSrtId={editingSrtId}
                    setEditingSrtId={setEditingSrtId}
                    setSceneDurations={setSceneDurations}
                    audioEdit={audioEdit}
                    setAudioEdit={setAudioEdit}
                    bgmLibrary={bgmLibrary}
                    sfxLibrary={sfxLibrary}
                    getTimelineRange={getTimelineRange}
                    subtitlePresets={subtitlePresets}
                    aspectRatio={aspectRatio}
                    setAspectRatio={setAspectRatio}
                    transition={transition}
                    setTransition={setTransition}
                    videoFilter={videoFilter}
                    setVideoFilter={setVideoFilter}
                    sceneFilters={sceneFilters}
                    setSceneFilters={setSceneFilters}
                    stickers={stickers}
                    setStickers={setStickers}
                    mediaFit={mediaFit}
                    sceneFits={sceneFits}
                    setSceneFits={setSceneFits}
                    mediaZoom={zoomPct}
                    audioUrl={typeof audio?.url === 'string' ? assetUrl(audio.url) : undefined}
                  />
                )}

                {/* Step 6: Final Result */}
                {currentStep === 6 && renderResult && (
                  <Step6Export
                    renderResult={renderResult as { [key: string]: string | number | undefined; video_path?: string | undefined; videoUrl?: string | undefined; }}
                    handleNewProject={handleNewProject}
                  />
                )}
                  </div>
                </div>
              </div>
              )
            ) : activeMenu === 'Editor' ? (
              <VideoEditor 
                content={content}
                setContent={setContent}
                loading={loading}
                handleFinalRender={handleFinalRender}
                handleNewProject={handleNewProject}
                handleLoadProject={handleLoadProject}
                currentTime={currentTime}
                videoDuration={videoDuration}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                setCurrentTime={setCurrentTime}
                sceneDurations={sceneDurations}
                calculateDuration={calculateDuration}
                gapDuration={gapDuration}
                selectedVisuals={selectedVisuals}
                setSelectedVisuals={setSelectedVisuals}
                clipTrims={clipTrims}
                sceneLayouts={sceneLayouts}
                setSceneLayouts={setSceneLayouts}
                showSceneCaptions={showSceneCaptions}
                setShowSceneCaptions={setShowSceneCaptions}
                captionStyle={captionStyle}
                setCaptionStyle={setCaptionStyle}
                visualCandidates={visualCandidates}
                setVisualCandidates={setVisualCandidates}
                subtitleStyle={subtitleStyle}
                setSubtitleStyle={setSubtitleStyle}
                srtData={srtData}
                setSrtData={setSrtData}
                setSrtScriptSig={setSrtScriptSig}
                editingSrtId={editingSrtId}
                setEditingSrtId={setEditingSrtId}
                setSceneDurations={setSceneDurations}
                audioEdit={audioEdit}
                setAudioEdit={setAudioEdit}
                bgmLibrary={bgmLibrary}
                sfxLibrary={sfxLibrary}
                getTimelineRange={getTimelineRange}
                subtitlePresets={subtitlePresets}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                transition={transition}
                setTransition={setTransition}
                videoFilter={videoFilter}
                setVideoFilter={setVideoFilter}
                sceneFilters={sceneFilters}
                setSceneFilters={setSceneFilters}
                stickers={stickers}
                setStickers={setStickers}
                mediaFit={mediaFit}
                sceneFits={sceneFits}
                setSceneFits={setSceneFits}
                mediaZoom={zoomPct}
                audioUrl={typeof audio?.url === 'string' ? assetUrl(audio.url) : undefined}
                showBackButton={false}
                title="ADVANCED EDITOR"
                isStandalone={true}
                showInitialProjectModal={shouldShowEditorPicker}
                onCloseProjectModal={() => setShouldShowEditorPicker(false)}
              />
            ) : activeMenu === 'Projects' ? (
              /* Projects View */
              <ProjectList
                projectId={projectId}
                projects={projects}
                handleNewProject={handleNewProject}
                handleLoadProject={handleLoadProject}
                handleDeleteProject={handleDeleteProject}
              />
          ) : activeMenu === 'Settings' ? (
            <SettingsManager
              config={config}
              setConfig={setConfig}
              loading={loading}
              handleSaveConfig={handleSaveConfig}
              visibleKeys={visibleKeys}
              setVisibleKeys={setVisibleKeys}
              fetchCloudflareUsage={fetchCloudflareUsage}
              isFetchingUsage={isFetchingUsage}
                cfUsage={cfUsage}
                providerKeys={providerKeys}
                plan={plan}
                loadingPlan={loadingPlan}
                refreshPlan={refreshPlan}
                planScenes={planScenes}
                setPlanScenes={setPlanScenes}
                planI2v={planI2v}
                setPlanI2v={setPlanI2v}
              />
          ) : activeMenu === 'Marketing' ? (
            <MarketingHub />
          ) : activeMenu === 'Posting' ? (
            <PostingHub
              config={config}
              setConfig={setConfig}
              handleSaveConfig={handleSaveConfig}
            />
          ) : null}
        </div>
      </div>
    </main>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm transition-all duration-300 animate-in fade-in"
          onClick={() => setZoomedImage(null)}
        >
          <div className="absolute top-6 right-6 flex items-center gap-4">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = zoomedImage;
                link.download = `image_${Date.now()}.png`;
                link.click();
              }}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10"
              title="이미지 다운로드"
            >
              <Download size={24} />
            </button>
            <button 
              onClick={() => setZoomedImage(null)}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10"
              title="닫기"
            >
              <X size={24} />
            </button>
          </div>
          <div 
            className="max-w-[90vw] max-h-[90vh] relative group"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={zoomedImage} 
              alt="zoomed" 
              className="w-full h-full object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-300"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
