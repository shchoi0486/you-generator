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

export interface AppConfig {
  engine?: string;
  language?: string;
  openai_api_key?: string;
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
}

export interface TTSRequest {
  script: { text: string; speaker: string }[];
  voice_map: {
    [key: string]: string | Record<string, { rate: string; pitch: string }>;
  };
  output_name?: string;
  engine?: string;
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
  };
  aspect_ratio?: string;
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

  getStockVideos: async (keyword: string, count: number = 4) => {
    return handleFetch(`${API_BASE_URL}/visuals/stock-videos?keyword=${encodeURIComponent(keyword)}&count=${count}`, {});
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

  createShorts: async (data: { reference: string; new_topic: string; duration?: number; category?: string }) => {
    return handleFetch(`${API_BASE_URL}/shorts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
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
