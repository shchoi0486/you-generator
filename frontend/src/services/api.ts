export interface ScriptItem {
  scene_index: number;
  speaker: string;
  text: string;
  subtitle?: string;
  sfx?: string;
  hold_sec?: number;
}

export interface SceneItem {
  keyword: string;
  description: string;
  section?: string;
  stock_query?: string;
  filming_guide?: string;
  subtitle?: string;
  sfx?: string;
  [key: string]: unknown;
}

export interface AppContent {
  projectId?: string;
  projectName?: string;
  script: ScriptItem[];
  scenes: SceneItem[];
  total_duration?: number;
  target_duration?: number;
  warning?: string;
  title?: string;
  hook_idea?: string;
  tone_and_manner?: string;
  hashtags?: string[];
  recommended_length?: number;
  grounded?: boolean;
  sources?: Array<{ title: string; link: string }>;
  servings?: string;
  tools?: string[];
  total_cost_krw?: number;
}

export interface ProjectMeta {
  id: string;
  projectName: string;
  lastModified: string;
  currentStep: number;
  [key: string]: unknown;
}

export interface StockVideo {
  url: string;
  path: string;
  preview?: string;
  kind?: string;
  source?: string;
}

export interface ImageGenConfig {
  use_cloudflare?: boolean;
  use_pollinations?: boolean;
  use_ai_horde?: boolean;
  use_local_sd?: boolean;
  use_zimage?: boolean;
  cloudflare_account_id?: string;
  cloudflare_api_token?: string;
  pollinations_models?: string[];
  pollinations_min_interval?: number;
  gemini_image_model?: string;
  deepinfra_api_key?: string;
  deepinfra_image_model?: string;
  pexels_api_key?: string;
  [key: string]: unknown;
}

// 프리셋/축 ID. 12종 프리셋으로 교체하며 사라진 옛 ID(jachae_real 등)는 없다.
// 유니온으로 박아두면 프리셋을 추가/삭제할 때 여기서 컴파일 에러가 난다.
export type RecipePresetId =
  | 'random'
  | 'read_aloud' | 'read_aloud_problem'
  | 'childhood_noodle' | 'childhood_question'
  | 'chef_manuals' | 'chef_manuals_provoke'
  | 'moony_bracket' | 'moony_bracket_provoke'
  | 'shinzo_blunt' | 'shinzo_blunt_provoke'
  | 'ttukddik_banter' | 'ttukddik_banter_provoke';

export type RecipeToneId =
  | 'casual_first' | 'mz_blunt' | 'sensory' | 'retro' | 'authority'
  | 'self_deprecating' | 'polite_guide' | 'warm_recall'
  | 'instruction_mix' | 'bracket_quirk';

export type RecipeHookId =
  | 'random' | 'question' | 'provoke' | 'empathy' | 'number' | 'twist'
  | 'regret' | 'greeting';

export type RecipeStructureId =
  | 'fail_try' | 'conclusion_first' | 'silent_list' | 'problem_cause_fix';

export type RecipeCtaId =
  | 'save' | 'comment' | 'subscribe' | 'follow' | 'emotion' | 'ask_viewer';

// 백엔드 settings.yaml 의 recipe_prompt_preset 구조.
// 전부 선택 사항이다 — shorts_lab.py 가 없는 필드를preset 기본값으로 채운다.
// 특히 format은 'auto'가 정답이고, 누락돼도 'realistic'/'youtube'로 떨어진다.
export interface RecipePromptPreset {
  format?: string;
  style?: string;
  platform?: string;
  preset?: RecipePresetId | string;
  hook?: RecipeHookId | string;
  tone?: RecipeToneId | string;
  structure?: RecipeStructureId | string;
  cta?: RecipeCtaId | string;
}

/** /shorts/recipe-options 응답. 프론트 폴백(constants/recipeOptions)과 항목이 1:1이다. */
export interface RecipeOptions {
  formats?: Array<{ id: string; name: string; desc: string; target_sec?: number }>;
  styles: Array<{ id: string; name: string; desc: string }>;
  platforms: Array<{ id: string; name: string; desc: string }>;
  hooks: Array<{ id: string; name: string; desc: string }>;
  presets: Array<{
    id: string; name: string; desc: string;
    hook?: string; tone?: string; structure?: string; cta?: string;
  }>;
  tones: Array<{ id: string; name: string; desc: string }>;
  structures: Array<{ id: string; name: string; desc: string }>;
  ctas: Array<{ id: string; name: string; desc: string }>;
  defaults?: {
    format: string; style: string; platform: string;
    hook: string; preset: string;
    duration_presets?: number[];
  };
}

/** /providers/pricing 응답의 한 행. providers.yaml 이 단일 출처다. */
export interface ProviderRow {
  id: string;
  label: string;
  adapter: string | null;
  unit: string;
  usd: number | null;
  krw: string;
  quality: number | null;
  speed: string | null;
  modes: string[];
  max_refs: number;
  /** 실제로 참조 이미지를 반영함이 눈으로 확인된 경로인지. */
  i2i_verified: boolean;
  res?: string | null;
  max_sec?: number | null;
  enabled: boolean;
  byok: boolean;
  needs_key: boolean;
  key_env: string | null;
  /** byok | settings | env | none */
  key_source: string;
  has_key: boolean;
  /** enabled 이고 키도 있다 = 지금 바로 쓸 수 있다 */
  ready: boolean;
  adapter_implemented: boolean;
  signup: string | null;
  notes: string;
}

export interface ProviderPricing {
  usd_krw: number;
  image: ProviderRow[];
  video: ProviderRow[];
  tts: ProviderRow[];
  llm: ProviderRow[];
  tiers: Record<string, {
    label: string;
    desc: string;
    i2i_allowed: boolean;
    images: string[];
    videos: string[];
  }>;
  security: { encrypted: boolean; method: string; warning: string | null; store_path: string; count: number };
}

export interface ProviderKeyRow {
  id: string;
  label: string;
  uses: string;
  signup: string | null;
  required: boolean;
  tier_hint: string;
  /** secret = 마스킹 필요, url = 비밀값 아님, plain = 공개 값 */
  kind: 'secret' | 'url' | 'plain';
  has_key: boolean;
  /** 앞 4 / 끝 2 만 남긴 값. 평문 키는 절대 오지 않는다. */
  masked: string | null;
  source: string;
  /** 이 키를 쓰는 항목 전체 */
  enables: string[];
  /** 어댑터가 있고 켜져 있어서 '지금 바로' 쓸 수 있는 항목 */
  usable_now: string[];
  usable_count: number;
  enables_count: number;
}

export interface ProviderKeyList {
  keys: ProviderKeyRow[];
  security: ProviderPricing['security'];
  overrides: ProviderOverrides;
  i2i: {
    capable: string[];
    verified: string[];
    ready: string[];
    available: boolean;
    reason: string;
  };
  i2v?: ProviderCapability['i2v'];
  tts: ProviderCapability['tts'];
}

export interface ProviderCapability {
  i2i: ProviderKeyList['i2i'];
  i2v: {
    providers: {
      id: string;
      label: string;
      adapter: string | null;
      adapter_ok: boolean;
      enabled: boolean;
      has_key: boolean;
      needs_key: boolean;
      key_env: string | null;
      cost_per_sec: number | null;
      res: string | null;
      max_sec: number | null;
    }[];
    ready: string[];
    need_key: string[];
    missing_adapter: string[];
    note: string;
  };
  modes: Record<string, Record<string, string[]>>;
  tts: {
    providers: {
      id: string;
      label: string;
      adapter: string | null;
      adapter_ok: boolean;
      enabled: boolean;
      has_key: boolean;
      needs_key: boolean;
      key_env: string | null;
      cost_per_1m_chars: number | null;
      free: boolean;
    }[];
    ready: string[];
    free_ready: string[];
    need_key: string[];
    missing_adapter: string[];
  };
}

export interface ProviderOverrides {
  path: string;
  enabled: Record<string, boolean>;
  pinned: Record<string, boolean>;
}

export interface ProviderPlanRow {
  id: string;
  label: string;
  adapter: string | null;
  /**
   * yes = 실제 코드가 있음
   * stub = 껍데기
   * missing = 어댑터 없음
   * config = 어댑터가 아니라 설정(config)으로 관리되는 경로(대본)
   */
  adapter_state: 'yes' | 'stub' | 'missing' | 'config';
  enabled: boolean;
  enabled_by_user: boolean;
  needs_key: boolean;
  has_key: boolean;
  key_env: string | null;
  modes: string[];
  i2i_verified?: boolean;
  cost_usd: number | null;
  unit: string;
  /** null 이면 장당 비용이 아니라 '별도 과금' (토큰 등) */
  cost_krw: number | null;
  quality?: number;
  res?: string;
  tier_ranked: boolean;
  /** 사용자가 '1순위로 고정' 한 항목 */
  pinned: boolean;
  /** 화면/실행 순서에서의 위치 (1 = 1순위) */
  rank?: number;
  /** 대본 1편(60초) 기준 예상 비용. known=false 면 미측정. */
  script_cost?: {
    krw: number | null;
    usd: number | null;
    known: boolean;
    label_krw?: string;
    note?: string;
    script_in?: number;
    script_out?: number;
    script_reasoning?: number;
    samples?: number;
  };
  notes: string;
  /** 켜짐 + 키 있음 + 어댑터 있음 = 실제로 써도 되는 상태 */
  ready: boolean;
}

export interface ProviderPlan {
  usd_krw: number;
  /** 표시 순서: 대본 → 이미지 → 영상 → 음성 */
  kind_order: string[];
  kinds: Record<string, {
    label: string;
    rows: ProviderPlanRow[];
    /** 전체 모델 수 (펼침 여부와 무관) */
    model_count: number;
    model_on: number;
    model_ready: number;
    /** 키 없이 바로 쓸 수 있는 무료 모델 수 */
    free_count: number;
    paid_count: number;
    key_count: number;
    /** 이 종류에 쓰이는 키. 그 키가 여는 모델이 models 에 들어 있다. */
    key_groups: Array<{
      key_env: string | null;
      label: string;
      uses: string;
      signup: string | null;
      required: boolean;
      tier_hint: string;
      kind: 'secret' | 'url' | 'plain' | 'none';
      has_key: boolean;
      masked: string | null;
      models: ProviderPlanRow[];
    }>;
    /** 키를 넣어야 열리는 그룹 (접혀 있음) */
    key_groups_rest: Array<{
      key_env: string | null;
      label: string;
      uses: string;
      signup: string | null;
      required: boolean;
      tier_hint: string;
      kind: 'secret' | 'url' | 'plain' | 'none';
      has_key: boolean;
      masked: string | null;
      models: ProviderPlanRow[];
    }>;
  }>;
  totals: Record<string, {
    usd: number;
    krw: number;
    /** fixed = 편당 고정액 / separate = 사용량 비례 별도 과금 / none = 사용 안 함 */
    billed: 'fixed' | 'separate' | 'none';
    first: string | null;
    first_label: string;
    unit: string;
    note: string;
  }>;
  /** 장당 환산이 가능한 항목(이미지·영상·음성)의 합계 */
  fixed_krw: number;
  total_krw: number;
  total_usd: number;
  /** 대본이 토큰 과금이라 합계에 포함되지 않음 */
  llm_separate: boolean;
  has_cost: boolean;
  cost_warning: string;
}

export interface ToggleResult {
  ok: boolean;
  kind: string;
  id: string;
  enabled: boolean;
  has_key: boolean;
  adapter: string | null;
  warnings: string[];
  note: string;
}

export interface AppConfig {
  engine?: string;
  language?: string;
  openai_api_key?: string;
  minimax_api_key?: string;
  elevenlabs_api_key?: string;
  typecast_api_key?: string;
  recipe_prompt_preset?: RecipePromptPreset;
  image_gen?: ImageGenConfig;
  [key: string]: unknown;
}

export interface VisualCandidate {
  path: string;
  url: string;
}

export interface SceneCandidates {
  ai: VisualCandidate[];
  search: VisualCandidate[];
  graph: VisualCandidate[];
}

export interface Article {
  title?: string;
  content?: string;
  url?: string;
  summary?: string;
  full_text?: string;
  [key: string]: unknown;
}

export interface ShortsReport {
  hook_summary?: string;
  hook_first3s?: string[];
  content_pattern?: Array<{ phase: string; label: string; detail: string }>;
  transcript_approx?: string;
  visual_notes?: string[];
  why_it_works?: string[];
  hashtags?: string[];
  suggested_duration?: number;
  tone?: string;
  storyboard?: Array<{
    speaker: string;
    text: string;
    visual?: { type?: string; keyword?: string; description?: string };
  }>;
  source_type?: string;
  video_id?: string;
  stats?: {
    views?: string; likes?: string; comments?: string;
    title?: string; channel?: string; published_at?: string;
  } | null;
  stats_note?: string;
  [key: string]: unknown;
}

export interface RefineClip {
  url: string;
  kind: string;
  source: string;
  note: string;
}

export interface RefineResult {
  clip_notes?: string[];
  narration_ko?: string;
  subtitles?: Array<{ text: string; start: number; end: number }>;
  sfx?: string;
  mismatch_warning?: string;
}

/** 백엔드 베이스 URL. 데스크톱 포장 시 환경변수로 주입 (기본 localhost:8000).
 *  이 파일의 apiBase()/assetUrl()을 통해서만 참조할 것. 각 컴포넌트에 하드코딩 금지. */
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL) ||
  'http://localhost:8000';

/** 로컬 에셋 경로(/assets/...)를 절대 URL로 변환. http(s)는 그대로 통과. */
export const assetUrl = (u: string | undefined | null): string => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const norm = String(u).replace(/\\/g, '/').replace('/assets/assets/', '/assets/');
  return `${API_BASE_URL}${norm.startsWith('/') ? '' : '/'}${norm}`;
};

export interface NewsRequest {
  url: string;
}

export interface GenerateRequest {
  article_text: string;
  custom_instructions?: string;
  duration?: number;
  template_id?: string;
  script_id?: string;
}

export interface ScriptFormatOption {
  id: string;
  name: string;
  group: string;
  flow: string;
  desc: string;
  recommended: boolean;
}

export interface TTSRequest {
  script: { text: string; speaker: string }[];
  voice_map: {
    [key: string]: string | Record<string, { rate: string; pitch: string }>;
  };
  output_name?: string;
  engine?: string;
  rate?: string;
  pitch?: string;
  gap_duration?: number;
}

export interface VisualCandidateRequest {
  scene: {
    description: string;
    keyword?: string;
    keywords?: string[];
    style?: string;
    duration?: number;
  };
  index: number;
  project_id?: string;
  ai_count?: number;
  search_count?: number;
  style?: string;
  ai_model?: string;
  topic?: string;
  visual_guide?: string;
  category?: string;
  use_cache?: boolean;
  refresh?: boolean;
}

export interface ClipTrim {
  in: number; // 소스 내 시작 오프셋(초)
  out: number | null; // 소스 내 종료 오프셋(초), null이면 시작+슬롯길이
}

export interface ClipRef {
  path: string;
  in?: number;
  out?: number | null;
  scale?: number;
  x?: number;
  y?: number;
}

export interface SceneLayout {
  scale: number; // 1 = 핏 기준
  x: number; // 화면 너비 비율 오프셋 (-0.5 ~ 0.5)
  y: number; // 화면 높이 비율 오프셋 (-0.5 ~ 0.5)
}

export interface CaptionStyle {
  font_size: number;
  color: string;
  bg_color?: string;
  y_offset: number;
  animation?: string;
}

export interface StickerItem {
  id: string;
  text: string;
  scene: number;
  start: number;
  end: number;
  y: number;
  size: number;
  color: string;
}

export interface RenderRequest {
  audio_path: string;
  srt_path: string;
  bg_images: string[][] | Array<[Array<string | ClipRef>, number]>; // 2D 리스트 또는 [이미지리스트, 길이] 튜플 리스트
  output_name?: string;
  subtitle_style?: {
    preset: string;
    font: string;
    font_size: number;
    color: string;
    stroke_color: string;
    stroke_width: number;
    bg_color?: string;
    text_align?: string;
    animation?: string;
    y_offset: number;
    show_subtitles: boolean;
  };
  audio_edit?: {
    bgm_path?: string;
    bgm_volume: number;
    sfx_list: Array<{ path: string; time: number; volume: number }>;
  };
  edited_srt?: string;
  scene_captions?: Array<{ start: number; end: number; text: string }>;
  caption_style?: {
    font_size: number;
    color: string;
    bg_color?: string;
    y_offset: number;
    animation?: string;
  };
  aspect_ratio?: string;
  transition?: { type: string; duration: number };
  video_filter?: string;
  scene_filters?: Record<number, string>;
  stickers?: StickerItem[];
  media_fit?: string;
  scene_fits?: Record<number, string>;
  bg_style?: string;
  bg_color?: string;
  fit_zoom?: number;
}

const handleFetch = async (url: string, options: RequestInit) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      let errorMessage = 'Request failed';
      
      if (typeof errorData.detail === 'string') {
        errorMessage = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errorMessage = errorData.detail.map((err: { loc: string[]; msg: string }) => `${err.loc.join('.')}: ${err.msg}`).join(', ');
      } else if (typeof errorData.detail === 'object') {
        errorMessage = JSON.stringify(errorData.detail);
      } else {
        errorMessage = `Status ${response.status}: ${response.statusText}`;
      }

      // 402/401은 대본 문제가 아니라 결제·키 문제다. 사용자가 원인을 알 수 있게
      // 앞에 한 줄 붙인다(실측: 429가 '모델 응답 파싱 실패'로만 떠서 막막했다).
      if (response.status === 402) {
        errorMessage = `AI 한도 초과 · ${errorMessage}`;
      } else if (response.status === 401) {
        errorMessage = `인증 실패 · ${errorMessage}`;
      } else if (response.status === 429) {
        errorMessage = `요청이 너무 많습니다 · ${errorMessage}`;
      }

      throw Object.assign(new Error(errorMessage), { status: response.status });
    }
    return response.json();
  } catch (error: unknown) {
    // 브라우저 새로고침이나 중단으로 인한 오류는 무시하거나 콘솔에만 출력
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Failed to fetch')) {
      console.warn('Network request was interrupted (likely refresh or navigation):', url);
      // 무시할 수 있는 수준의 에러이므로 특별한 처리를 하지 않음
      return null;
    }
    throw error;
  }
};

export const api = {
  getCloudflareUsage: async () => {
    return handleFetch(`${API_BASE_URL}/cloudflare/usage`, {});
  },
  getConfig: async () => {
    return handleFetch(`${API_BASE_URL}/config`, {});
  },
  
  updateConfig: async (config: AppConfig) => {
    return handleFetch(`${API_BASE_URL}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },

  scrapeNews: async (data: NewsRequest) => {
    return handleFetch(`${API_BASE_URL}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  generateContent: async (data: GenerateRequest) => {
    return handleFetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  uploadAsset: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return handleFetch(`${API_BASE_URL}/uploads`, {
      method: 'POST',
      body: form,
    });
  },

  getStockVideos: async (keyword: string, count: number = 4, refresh: boolean = false) => {
    return handleFetch(`${API_BASE_URL}/visuals/stock-videos?keyword=${encodeURIComponent(keyword)}&count=${count}&refresh=${refresh ? 'true' : 'false'}`, {});
  },

  getPromptTemplate: async (category: string) => {
    return handleFetch(`${API_BASE_URL}/shorts/prompt-template?category=${encodeURIComponent(category)}`, {});
  },

  analyzeShortsMedia: async (file: File, hint?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (hint) form.append('hint', hint);
    return handleFetch(`${API_BASE_URL}/shorts/analyze-media`, {
      method: 'POST',
      body: form,
    });
  },

  analyzeShortsUrl: async (url: string) => {
    return handleFetch(`${API_BASE_URL}/shorts/analyze-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  },

  createShorts: async (data: { reference: string; new_topic: string; duration?: number; category?: string; format_id?: string; style_id?: string; platform_id?: string; script_id?: string; hook_id?: string; preset_id?: string; tone_id?: string; structure_id?: string; cta_id?: string }) => {
    return handleFetch(`${API_BASE_URL}/shorts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  getRecipeOptions: async (): Promise<RecipeOptions> => {
    return handleFetch(`${API_BASE_URL}/shorts/recipe-options`, {});
  },

  getRecipePromptPreview: async (format: string, style: string, platform: string, hook: string = 'random', durationSec: number = 60, preset: string = 'random', tone?: string, structure?: string, cta?: string) => {
    const q = `format_id=${encodeURIComponent(format)}&style_id=${encodeURIComponent(style)}&platform_id=${encodeURIComponent(platform)}&hook_id=${encodeURIComponent(hook)}&duration_sec=${encodeURIComponent(String(durationSec))}&preset_id=${encodeURIComponent(preset)}`
      + (tone ? `&tone_id=${encodeURIComponent(tone)}` : '')
      + (structure ? `&structure_id=${encodeURIComponent(structure)}` : '')
      + (cta ? `&cta_id=${encodeURIComponent(cta)}` : '');
    return handleFetch(`${API_BASE_URL}/shorts/recipe-prompt-preview?${q}`, {});
  },

  getScriptFormats: async (category: string) => {
    return handleFetch(`${API_BASE_URL}/shorts/script-formats?category=${encodeURIComponent(category)}`, {});
  },

  refineScene: async (data: { scene: Record<string, unknown>; clips: RefineClip[]; topic?: string; category?: string }) => {
    return handleFetch(`${API_BASE_URL}/shorts/refine-scene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  generateTTS: async (data: TTSRequest) => {
    return handleFetch(`${API_BASE_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  getVisualCandidates: async (data: VisualCandidateRequest) => {
    return handleFetch(`${API_BASE_URL}/visuals/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  renderVideo: async (data: RenderRequest) => {
    return handleFetch(`${API_BASE_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  cancelTask: async (taskId: string = "all") => {
    return handleFetch(`${API_BASE_URL}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
  },

  previewTTS: async (text: string, voice: string, engine?: string, rate?: string, pitch?: string) => {
    return handleFetch(`${API_BASE_URL}/tts/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, engine, rate, pitch }),
    });
  },

  getTypecastActors: async (): Promise<{ actors: Array<{ actor_id: string; label: string }> }> => {
    return handleFetch(`${API_BASE_URL}/tts/typecast-actors`, {});
  },

  // ── 프로바이더 가격/키 (BYOK) ─────────────────────────────
  // 가격표는 providers.yaml 이 단일 출처다. 프론트에 하드코딩하지 않는다.
  getProviderPricing: async (): Promise<ProviderPricing> => {
    return handleFetch(`${API_BASE_URL}/providers/pricing`, {});
  },

  getProviderKeys: async (): Promise<ProviderKeyList> => {
    return handleFetch(`${API_BASE_URL}/providers/keys`, {});
  },

  /** 키 저장. value 를 빈 문자열로 보내면 삭제된다. */
  saveProviderKey: async (keyId: string, value: string): Promise<{
    ok: boolean;
    key_id: string;
    deleted: boolean;
    masked: string | null;
    enabled_now: string[];
    /** 차단되진 않지만 '보통과 다른 형식' 이라는 안내 */
    format_note?: string | null;
    message: string;
    note: string;
  }> => {
    return handleFetch(`${API_BASE_URL}/providers/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_id: keyId, value }),
    });
  },

  /**
   * 형식 + 실제 API 호출 검증. 과금 없이 가능한 범위에서만 호출한다.
   * value 를 빈 문자열로 보내면 '이미 저장된 키' 를 검증한다.
   */
  validateProviderKey: async (keyId: string, value: string): Promise<{
    ok: boolean;
    stage: string;
    message: string;
    format_note?: string | null;
    using_stored?: boolean;
  }> => {
    return handleFetch(`${API_BASE_URL}/providers/keys/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_id: keyId, value }),
    });
  },

  /** 우선순위를 한 칸 위(-1)/아래(1)로. providers.yaml 은 안 바뀐다. */
  moveProviderOrder: async (kind: string, id: string, delta: -1 | 1): Promise<{
    ok: boolean;
    moved: boolean;
    error?: string;
    order?: string[];
  }> => {
    return handleFetch(`${API_BASE_URL}/providers/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, delta }),
    });
  },

  /** 누적 LLM 비용 (모델별 토큰/금액). */
  getLLMCost: async () => {
    return handleFetch(`${API_BASE_URL}/providers/cost`, { method: 'GET' });
  },

  /** 프로바이더 1개로 실제 생성 1회(과금됨). 어댑터 동작 확인용. */
  testProvider: async (kind: string, providerId: string, prompt?: string) => {
    return handleFetch(`${API_BASE_URL}/providers/keys/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, provider_id: providerId, prompt }),
    });
  },

  getProviderCapability: async (): Promise<ProviderCapability> => {
    return handleFetch(`${API_BASE_URL}/providers/keys/capability`, {});
  },

  /** 이 PC 에 저장된 활성 오버라이드. */
  getProviderOverrides: async (): Promise<ProviderOverrides> => {
    return handleFetch(`${API_BASE_URL}/providers/overrides`, {});
  },

  /** TTS 1회 생성 + 미리듣기. 과금된다(짧은 문장). */
  testTTS: async (body: { provider_id?: string; text?: string; voice?: string }): Promise<{
    ok: boolean;
    message: string;
    bytes: number;
    audio_url?: string | null;
    diagnostic?: Record<string, unknown>;
  }> => {
    return handleFetch(`${API_BASE_URL}/providers/tts/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  /** 모델 선택 계획: 1순위가 무엇이고 얼마가 듣는지. */
  getProviderPlan: async (opts: {
    scenes?: number; i2v_scenes?: number; i2v_sec?: number;
  } = {}): Promise<ProviderPlan> => {
    const q = new URLSearchParams({
      scenes: String(opts.scenes ?? 4),
      i2v_scenes: String(opts.i2v_scenes ?? 0),
      i2v_sec: String(opts.i2v_sec ?? 5),
    });
    return handleFetch(`${API_BASE_URL}/providers/plan?${q.toString()}`, {});
  },

  /** 모델 켜기/끄기. providers.yaml 은 건드리지 않는다. */
  toggleProvider: async (
    kind: string,
    id: string,
    enabled: boolean,
    pinned = false
  ): Promise<ToggleResult> => {
    return handleFetch(`${API_BASE_URL}/providers/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, enabled, pinned }),
    });
  },

  /** 폴백 체인에서 이 모델을 맨 앞에 고정/해제 */
  pinProvider: async (kind: string, id: string, pinned: boolean) => {
    return handleFetch(`${API_BASE_URL}/providers/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, pinned }),
    });
  },

  /** 이 키를 쓰는 모델을 한 번에 켠다. */
  autoEnableProviders: async (keyId: string) => {
    return handleFetch(`${API_BASE_URL}/providers/auto-enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_id: keyId }),
    });
  },

  /** 오버라이드 전부 해제 → providers.yaml 기본값으로 복귀 */
  resetProviderOverrides: async () => {
    return handleFetch(`${API_BASE_URL}/providers/reset`, { method: 'POST' });
  },

  // Project Management API
  saveProject: async (data: AppContent & { meta?: ProjectMeta }) => {
    return handleFetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  listProjects: async () => {
    return handleFetch(`${API_BASE_URL}/projects`, {});
  },

  getProject: async (projectId: string) => {
    return handleFetch(`${API_BASE_URL}/projects/${projectId}`, {});
  },

  deleteProject: async (projectId: string) => {
    return handleFetch(`${API_BASE_URL}/projects/${projectId}`, {
      method: 'DELETE',
    });
  },
};
