export interface ScriptItem {
  scene_index: number;
  speaker: string;
  text: string;
}

export interface SceneItem {
  keyword: string;
  description: string;
  [key: string]: unknown;
}

export interface AppContent {
  projectId?: string;
  projectName?: string;
  script: ScriptItem[];
  scenes: SceneItem[];
}

export interface ProjectMeta {
  id: string;
  projectName: string;
  lastModified: string;
  currentStep: number;
  [key: string]: unknown;
}

export interface ImageGenConfig {
  use_cloudflare?: boolean;
  use_pollinations?: boolean;
  use_ai_horde?: boolean;
  use_local_sd?: boolean;
  use_zimage?: boolean;
  cloudflare_account_id?: string;
  cloudflare_api_token?: string;
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

const API_BASE_URL = 'http://localhost:8000';

export interface NewsRequest {
  url: string;
}

export interface GenerateRequest {
  article_text: string;
  custom_instructions?: string;
  duration?: number;
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
}

export interface RenderRequest {
  audio_path: string;
  srt_path: string;
  bg_images: string[][] | Array<[string[], number]>; // 2D 리스트 또는 [이미지리스트, 길이] 튜플 리스트
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
      
      throw new Error(errorMessage);
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
