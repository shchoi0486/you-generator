import React from 'react';
import { 
  Settings, Save, Loader2, Key, Zap, Eye, EyeOff, 
  ImagePlus, Mic, Cloud, ImageIcon, Video, RefreshCw, 
  ChevronUp, ChevronDown, Plus, X, Search
} from 'lucide-react';
import { type AppConfig, type ImageGenConfig } from '../services/api';

interface SettingsManagerProps {
  config: AppConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig | null>>;
  loading: boolean;
  handleSaveConfig: () => void;
  visibleKeys: Record<string, boolean>;
  setVisibleKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  fetchCloudflareUsage: () => void;
  isFetchingUsage: boolean;
  cfUsage: { error?: string; detail?: string; neurons: number; limit: number } | null;
}

const TEXT_MODEL_COSTS: Array<{ id: string; label: string; cost: string }> = [
  { id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite', cost: '입력 $0.30 / 출력 $2.50' },
  { id: 'gemini-3.7-flash', label: '3.7 Flash', cost: '입력 $0.75 / 출력 $3.75' },
  { id: 'gemini-3.8-flash', label: '3.8 Flash', cost: '입력 $0.75 / 출력 $3.75' },
  { id: 'gemini-3.6-flash', label: '3.6 Flash (품질 추천)', cost: '입력 $1.50 / 출력 $7.50' },
  { id: 'gemini-3.5-flash', label: '3.5 Flash', cost: '입력 $1.50 / 출력 $9.00' },
];

const DEFAULT_TEXT_MODEL_ORDER = TEXT_MODEL_COSTS.map((m) => m.id);

const SettingsManager: React.FC<SettingsManagerProps> = ({
  config,
  setConfig,
  loading,
  handleSaveConfig,
  visibleKeys,
  setVisibleKeys,
  fetchCloudflareUsage,
  isFetchingUsage,
  cfUsage
}) => {
  return (
    <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 p-4 md:p-10 flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Settings size={20} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">설정</h2>
        </div>
        <button 
          onClick={handleSaveConfig}
          disabled={loading}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          설정 저장
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* 대본 생성 및 공통 API 키 관리 카드 */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">대본 생성 및 공통 API</h3>
                  <p className="text-xs text-gray-500 font-medium">Gemini 및 주요 서비스 인증 설정</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6 flex-1">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" /> Gemini API Key
                  </label>
                  <div className="relative">
                    <input 
                      type={visibleKeys.gemini ? "text" : "password"} 
                      value={(config?.gemini_api_key as string) ?? ''} 
                      onChange={(e) => setConfig(prev => prev ? { ...prev, gemini_api_key: e.target.value } : null)}
                      placeholder="AIzaSy..."
                      className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
                    />
                    <button 
                      type="button"
                      onClick={() => setVisibleKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      {visibleKeys.gemini ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                                {/* Gemini 텍스트 모델 순서 (가성비 순 시도·폴백) */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" /> Gemini 텍스트 모델 순서
                  </label>
                  <p className="text-[10px] text-gray-400">앞부터 시도, 실패 시 다음으로 폴백. 1M 토큰당 USD — 대본 생성은 출력 위주라 출력 요금이 핵심.</p>
                  {(() => {
                    const enabled = ((config?.gemini_text_models as string[]) ?? DEFAULT_TEXT_MODEL_ORDER).filter((id) => TEXT_MODEL_COSTS.some((m) => m.id === id));
                    const disabled = TEXT_MODEL_COSTS.filter((m) => !enabled.includes(m.id));
                    const move = (idx: number, dir: -1 | 1) => {
                      const next = [...enabled];
                      const j = idx + dir;
                      if (j < 0 || j >= next.length) return;
                      [next[idx], next[j]] = [next[j], next[idx]];
                      setConfig((prev) => (prev ? { ...prev, gemini_text_models: next } : null));
                    };
                    const remove = (id: string) => {
                      setConfig((prev) => (prev ? { ...prev, gemini_text_models: enabled.filter((x) => x !== id) } : null));
                    };
                    const add = (id: string) => {
                      setConfig((prev) => (prev ? { ...prev, gemini_text_models: [...enabled, id] } : null));
                    };
                    return (
                      <div className="space-y-1.5">
                        {enabled.map((id, idx) => {
                          const meta = TEXT_MODEL_COSTS.find((m) => m.id === id)!;
                          return (
                            <div key={id} className="flex items-center gap-2 px-3 py-2 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                              <span className="text-[10px] font-black text-indigo-400 w-4">{idx + 1}</span>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-gray-800">{meta.label}</p>
                                <p className="text-[10px] text-gray-400 tabular-nums">{meta.cost}</p>
                              </div>
                              <button type="button" aria-label="위로" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-30"><ChevronUp size={14} /></button>
                              <button type="button" aria-label="아래로" onClick={() => move(idx, 1)} disabled={idx === enabled.length - 1} className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-30"><ChevronDown size={14} /></button>
                              <button type="button" aria-label="제외" onClick={() => remove(id)} className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
                            </div>
                          );
                        })}
                        {disabled.map((m) => (
                          <button key={m.id} type="button" onClick={() => add(m.id)} className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-all">
                            <Plus size={14} />
                            <span className="text-xs font-bold">{m.label}</span>
                            <span className="text-[10px] tabular-nums ml-auto">{m.cost}</span>
                          </button>
                        ))}
                        {enabled.length === 0 && (
                          <p className="text-[11px] text-red-500 font-bold">모델을 1개 이상 켜야 대본 생성이 됩니다.</p>
                        )}
                      </div>
                    );
                  })()}
                </div>

<div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <ImagePlus size={14} className="text-purple-500" /> FAL API Key
                  </label>
                  <div className="relative">
                    <input 
                      type={visibleKeys.fal ? "text" : "password"} 
                      value={(config?.fal_key as string) ?? ''}
                      onChange={(e) => setConfig(prev => prev ? { ...prev, fal_key: e.target.value } : null)}
                      placeholder="fal_..."
                      className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-sm"
                    />
                    <button 
                      type="button"
                      onClick={() => setVisibleKeys(prev => ({ ...prev, fal: !prev.fal }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      {visibleKeys.fal ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 웹 검색 (RAG) + YouTube Data API */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                  <Search size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">웹 근거 검색 + YouTube 통계</h3>
                  <p className="text-xs text-gray-500 font-medium">없어도 DDG 무료 검색으로 동작. Naver·Tavily가 있으면 우선 사용</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-blue-600" />
                <span className="text-sm font-bold text-gray-800">API 키 (선택)</span>
              </div>
              {[
                { key: 'naver_client_id', label: 'Naver Client ID', ph: 'Naver Developers 무료 발급' },
                { key: 'naver_client_secret', label: 'Naver Client Secret', ph: 'Naver Developers 무료 발급' },
                { key: 'tavily_api_key', label: 'Tavily API Key', ph: 'tavily.com 무료 크레딧' },
                { key: 'youtube_api_key', label: 'YouTube Data API Key', ph: 'Google Cloud 무료 할당량' },
              ].map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500">{f.label}</label>
                  <input
                    type="password"
                    aria-label={f.label}
                    value={((config as Record<string, unknown> | null)?.[f.key] as string) ?? ''}
                    onChange={(e) => setConfig((prev) => (prev ? { ...prev, [f.key]: e.target.value || null } : null))}
                    placeholder={f.ph}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* TTS (음성 생성) 설정 카드 */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Mic size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">TTS (음성 생성) API 설정</h3>
                  <p className="text-xs text-gray-500 font-medium">Azure(Cloudflare) 및 OpenAI TTS 구성</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6 flex-1">
              {/* Azure via Cloudflare Workers */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Cloud size={16} className="text-indigo-600" />
                  <span className="text-sm font-bold text-gray-800">Azure TTS (via Cloudflare Workers)</span>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500">Cloudflare Worker URL</label>
                  <input 
                    type="text" 
                    value={(config?.cloudflare_worker_url as string) ?? ''} 
                    onChange={(e) => setConfig(prev => prev ? { ...prev, cloudflare_worker_url: e.target.value } : null)}
                    placeholder="https://your-worker.workers.dev"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs"
                  />
                  <p className="text-[10px] text-gray-400">보안을 위해 Azure Key와 Region은 Cloudflare Worker 환경 변수에 설정하세요.</p>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* OpenAI TTS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-green-500" />
                  <span className="text-sm font-bold text-gray-800">OpenAI TTS API</span>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500">OpenAI API Key</label>
                  <div className="relative">
                    <input 
                      type={visibleKeys.openai_tts ? "text" : "password"} 
                      value={config?.openai_api_key ?? ''} 
                      onChange={(e) => setConfig(prev => prev ? { ...prev, openai_api_key: e.target.value } : null)}
                      placeholder="sk-..."
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs"
                    />
                    <button 
                      type="button"
                      onClick={() => setVisibleKeys(prev => ({ ...prev, openai_tts: !prev.openai_tts }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      {visibleKeys.openai_tts ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">OpenAI 엔진을 사용할 경우에만 입력이 필요합니다.</p>
                </div>
              </div>

              {/* MiniMax TTS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-indigo-500" />
                  <span className="text-sm font-bold text-gray-800">MiniMax TTS API</span>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500">MiniMax API Key</label>
                  <div className="relative">
                    <input
                      type={visibleKeys.minimax_tts ? "text" : "password"}
                      value={config?.minimax_api_key ?? ''}
                      onChange={(e) => setConfig(prev => prev ? { ...prev, minimax_api_key: e.target.value } : null)}
                      placeholder="eyJ..."
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setVisibleKeys(prev => ({ ...prev, minimax_tts: !prev.minimax_tts }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      {visibleKeys.minimax_tts ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">MiniMax 엔진을 사용할 경우에만 입력이 필요합니다.</p>
                </div>
              </div>

              {/* ElevenLabs TTS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-emerald-500" />
                  <span className="text-sm font-bold text-gray-800">ElevenLabs TTS API</span>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500">ElevenLabs API Key</label>
                  <div className="relative">
                    <input
                      type={visibleKeys.elevenlabs_tts ? "text" : "password"}
                      value={config?.elevenlabs_api_key ?? ''}
                      onChange={(e) => setConfig(prev => prev ? { ...prev, elevenlabs_api_key: e.target.value } : null)}
                      placeholder="sk_..."
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setVisibleKeys(prev => ({ ...prev, elevenlabs_tts: !prev.elevenlabs_tts }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      {visibleKeys.elevenlabs_tts ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">ElevenLabs 엔진을 사용할 경우에만 입력이 필요합니다.</p>
                </div>
              </div>

              {/* Typecast TTS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-amber-500" />
                  <span className="text-sm font-bold text-gray-800">Typecast TTS API</span>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500">Typecast API Key</label>
                  <div className="relative">
                    <input
                      type={visibleKeys.typecast_tts ? "text" : "password"}
                      value={config?.typecast_api_key ?? ''}
                      onChange={(e) => setConfig(prev => prev ? { ...prev, typecast_api_key: e.target.value } : null)}
                      placeholder="Bearer Token..."
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setVisibleKeys(prev => ({ ...prev, typecast_tts: !prev.typecast_tts }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      {visibleKeys.typecast_tts ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">Typecast 엔진을 사용할 경우에만 입력이 필요합니다. 키 등록 후 목소리 목록을 불러옵니다.</p>
                </div>
              </div>
            </div>
          </div>

          {/* 이미지 생성 설정 카드 */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">이미지 생성 설정</h3>
                  <p className="text-xs text-gray-500 font-medium">Cloudflare 및 로컬 SD 엔진 관리</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6 flex-1">
              {/* 엔진별 인증 정보 (접기/펼치기) */}
              <details className="rounded-2xl border border-gray-100 bg-gray-50/50 overflow-hidden">
                <summary className="px-4 py-3 text-xs font-bold text-gray-600 cursor-pointer hover:text-gray-900 select-none">
                  엔진별 인증 정보 (Cloudflare / Local SD / API 키)
                </summary>
                <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">CF Account ID</label>
                  <input 
                    type="text" 
                    aria-label="CF Account ID"
                    value={(config?.image_gen?.cloudflare_account_id as string) ?? ''} 
                    onChange={(e) => setConfig(prev => {
                      if (!prev) return null;
                      const currentImageGen = prev.image_gen || {};
                      return { 
                        ...prev, 
                        image_gen: { ...currentImageGen, cloudflare_account_id: e.target.value } 
                      };
                    })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="Cloudflare Account ID"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">CF API Token</label>
                  <input 
                    type="password"
                    aria-label="CF API Token"
                    value={(config?.image_gen?.cloudflare_api_token as string) ?? ''} 
                    onChange={(e) => setConfig(prev => {
                      if (!prev) return null;
                      const currentImageGen = prev.image_gen || {};
                      return { 
                        ...prev, 
                        image_gen: { ...currentImageGen, cloudflare_api_token: e.target.value } 
                      };
                    })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="Cloudflare API Token"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Local SD URL</label>
                  <input 
                    type="text" 
                    value={(config?.image_gen?.local_sd_url as string) ?? ''} 
                    onChange={(e) => setConfig(prev => {
                      if (!prev) return null;
                      const currentImageGen = prev.image_gen || {};
                      return { 
                        ...prev, 
                        image_gen: { ...currentImageGen, local_sd_url: e.target.value } 
                      };
                    })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="http://127.0.0.1:7860"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Z-Image-Turbo Model</label>
                  <input 
                    type="text" 
                    value={(config?.image_gen?.zimage_model_id as string) ?? ''} 
                    onChange={(e) => setConfig(prev => {
                      if (!prev) return null;
                      const currentImageGen = prev.image_gen || {};
                      return { 
                        ...prev, 
                        image_gen: { ...currentImageGen, zimage_model_id: e.target.value } 
                      };
                    })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="Tongyi-MAI/Z-Image-Turbo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Cloudflare', key: 'use_cloudflare' },
                  { label: 'Pollinations', key: 'use_pollinations' },
                  { label: 'AI Horde', key: 'use_ai_horde' },
                  { label: 'Local SD', key: 'use_local_sd' },
                  { label: 'Z-Image-Turbo', key: 'use_zimage' }
                ].map((engine) => {
                  const isEnabled = config?.image_gen?.[engine.key as keyof ImageGenConfig];
                  return (
                    <div 
                      key={engine.key} 
                      onClick={() => {
                        setConfig(prev => {
                          if (!prev) return null;
                          const imageGen = prev.image_gen || {};
                          return {
                            ...prev,
                            image_gen: { ...imageGen, [engine.key]: !imageGen[engine.key as keyof ImageGenConfig] }
                          };
                        });
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isEnabled ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                    >
                      <span className={`text-xs font-bold ${isEnabled ? 'text-purple-700' : 'text-gray-500'}`}>{engine.label}</span>
                      <div className={`w-7 h-3.5 rounded-full relative transition-colors ${isEnabled ? 'bg-purple-600' : 'bg-gray-200'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${isEnabled ? 'left-4' : 'left-0.5'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pollinations 모델 순서 + 요청 간격 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Pollinations 모델 순서</label>
                  <input
                    type="text"
                    aria-label="Pollinations 모델 순서"
                    value={((config?.image_gen?.pollinations_models as string[]) ?? ['turbo', 'flux']).join(', ')}
                    onChange={(e) => setConfig(prev => {
                      if (!prev) return null;
                      const currentImageGen = prev.image_gen || {};
                      const models = e.target.value.split(',').map(m => m.trim()).filter(m => m.length > 0);
                      return {
                        ...prev,
                        image_gen: { ...currentImageGen, pollinations_models: models }
                      };
                    })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="turbo, flux"
                  />
                  <p className="text-[9px] text-gray-400">공식 지원: flux, turbo. 순서대로 시도.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">요청 간격 (초)</label>
                  <input
                    type="number"
                    aria-label="Pollinations 요청 간격"
                    min={5}
                    max={60}
                    value={(config?.image_gen?.pollinations_min_interval as number) ?? 16}
                    onChange={(e) => setConfig(prev => {
                      if (!prev) return null;
                      const currentImageGen = prev.image_gen || {};
                      const v = parseInt(e.target.value, 10);
                      return {
                        ...prev,
                        image_gen: { ...currentImageGen, pollinations_min_interval: isNaN(v) ? 16 : v }
                      };
                    })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="16"
                  />
                  <p className="text-[9px] text-gray-400">무료 티어는 15초에 1요청. 낮추면 429 발생.</p>
                </div>
              </div>

              {/* Gemini 이미지 모델 선택 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">Gemini 이미지 모델 (Nano Banana)</label>
                <select
                  aria-label="Gemini 이미지 모델"
                  value={(config?.image_gen?.gemini_image_model as string) ?? 'gemini-3.1-flash-lite-image'}
                  onChange={(e) => setConfig(prev => {
                    if (!prev) return null;
                    const currentImageGen = prev.image_gen || {};
                    return {
                      ...prev,
                      image_gen: { ...currentImageGen, gemini_image_model: e.target.value }
                    };
                  })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="gemini-3.1-flash-lite-image">2 Lite — 가장 저렴·빠름 (권장)</option>
                  <option value="gemini-3.1-flash-image">2 — 고품질 4K·문자 렌더링</option>
                </select>
                <p className="text-[9px] text-gray-400">같은 Gemini API 키 사용, 키 추가 불필요. 정확한 과금은 AI Studio 청구서 확인.</p>
              </div>

              {/* DeepInfra API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">DeepInfra API Key</label>
                <input
                  type="password"
                  aria-label="DeepInfra API Key"
                  value={(config?.image_gen?.deepinfra_api_key as string) ?? ''}
                  onChange={(e) => setConfig(prev => {
                    if (!prev) return null;
                    const currentImageGen = prev.image_gen || {};
                    return {
                      ...prev,
                      image_gen: { ...currentImageGen, deepinfra_api_key: e.target.value || undefined }
                    };
                  })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="DeepInfra 키 (FLUX schnell 장당 약 0.6원)"
                />
                <p className="text-[9px] text-gray-400">deepinfra.com 가입 후 발급. FLUX.1-schnell 고정.</p>
              </div>

              {/* Pexels API Key (스톡 비디오) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600">Pexels API Key</label>
                <input
                  type="password"
                  aria-label="Pexels API Key"
                  value={(config?.image_gen?.pexels_api_key as string) ?? ''}
                  onChange={(e) => setConfig(prev => {
                    if (!prev) return null;
                    const currentImageGen = prev.image_gen || {};
                    return {
                      ...prev,
                      image_gen: { ...currentImageGen, pexels_api_key: e.target.value || undefined }
                    };
                  })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="pexels.com 무료 발급 (스톡 비디오 검색용)"
                />
                <p className="text-[9px] text-gray-400">pexels.com → API 무료 발급. 없으면 스톡 검색 불가.</p>
              </div>
                </div>
              </details>

              {/* Cloudflare Usage Monitoring */}
              {config?.image_gen?.use_cloudflare && (
                <div className="mt-4 p-4 bg-purple-50/50 rounded-2xl border border-purple-100/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cloud size={16} className="text-purple-600" />
                      <span className="text-sm font-bold text-purple-900">Cloudflare Workers AI 사용량</span>
                    </div>
                    <button 
                      type="button"
                      aria-label="Cloudflare 사용량 새로고침"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchCloudflareUsage();
                      }}
                      disabled={isFetchingUsage}
                      className="p-1.5 hover:bg-purple-100 rounded-lg text-purple-600 transition-colors"
                    >
                      <RefreshCw size={14} className={isFetchingUsage ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  
                  {cfUsage?.error ? (
                    <div className="space-y-1">
                      <p className="text-[10px] text-red-500 font-medium">오류: {cfUsage.error}</p>
                      {cfUsage.detail && (
                        <p className="text-[9px] text-red-400 font-mono break-all max-h-20 overflow-y-auto bg-white p-1.5 rounded border border-red-100">{cfUsage.detail}</p>
                      )}
                    </div>
                  ) : cfUsage ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Daily Neurons</p>
                          <p className="text-lg font-black text-purple-900 tabular-nums">
                            {cfUsage.neurons.toLocaleString()} <span className="text-xs font-bold text-purple-400">/ {cfUsage.limit.toLocaleString()}</span>
                          </p>
                        </div>
                        <span className="text-[10px] font-black text-purple-600 bg-white px-2 py-0.5 rounded-md border border-purple-100 shadow-sm">
                          {Math.round((cfUsage.neurons / cfUsage.limit) * 100)}% 사용
                        </span>
                      </div>
                      {(() => {
                        const usageRatio = cfUsage.neurons / (cfUsage.limit || 1);
                        const progressValue = Math.min(100, Math.round(usageRatio * 100));
                        return (
                          <div className="w-full bg-white h-2 rounded-full overflow-hidden border border-purple-100 shadow-inner">
                            <div 
                              role="progressbar"
                              aria-label="Cloudflare Workers AI Neurons 사용량"
                              aria-valuenow={progressValue}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              className={`h-full transition-all duration-500 ease-out ${
                                usageRatio > 0.9 ? 'bg-red-500' : 
                                usageRatio > 0.7 ? 'bg-amber-500' : 'bg-purple-500'
                              }`}
                              style={{ width: `${progressValue}%` }}
                            />
                          </div>
                        );
                      })()}
                      <p className="text-[9px] text-purple-400 font-medium text-right">* 무료 티어는 매일 10,000 Neurons까지 무료입니다.</p>
                    </div>
                  ) : (
                    <div className="h-10 flex items-center justify-center">
                      <Loader2 className="animate-spin text-purple-300" size={20} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 영상 생성 및 기타 설정 카드 */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                  <Video size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">영상 생성 및 기타</h3>
                  <p className="text-xs text-gray-500 font-medium">크롤러 및 렌더링 세부 설정</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6 flex-1">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-orange-50/50 rounded-2xl border border-orange-100/50">
                  <div className="space-y-0.5">
                    <span className="text-sm font-bold text-orange-900">크롤러 상세 로그</span>
                    <p className="text-[11px] text-orange-600">스크래핑 과정을 터미널에 상세히 출력</p>
                  </div>
                  <button 
                    type="button"
                    aria-label="크롤러 상세 로그 토글"
                    onClick={() => setConfig(prev => prev ? { ...prev, crawler_verbose: !prev.crawler_verbose } : null)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${config?.crawler_verbose ? 'bg-orange-600' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${config?.crawler_verbose ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-orange-50/50 rounded-2xl border border-orange-100/50">
                  <div className="space-y-0.5">
                    <span className="text-sm font-bold text-orange-900">Ken Burns 효과</span>
                    <p className="text-[11px] text-orange-600">장면마다 줌인/줌아웃/좌우 팬 순환 적용 (끄면 정지 이미지)</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Ken Burns 효과 토글"
                    onClick={() => setConfig(prev => {
                      if (!prev) return null;
                      const videoSettings = (prev.video_settings as Record<string, unknown>) || {};
                      return { ...prev, video_settings: { ...videoSettings, kenburns: !videoSettings.kenburns } };
                    })}
                    className={`w-10 h-5 rounded-full relative transition-colors ${((config?.video_settings as Record<string, unknown> | undefined)?.kenburns !== false) ? 'bg-orange-600' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${((config?.video_settings as Record<string, unknown> | undefined)?.kenburns !== false) ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="space-y-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <Video size={16} className="text-orange-500" />
                    <span className="text-sm font-bold text-gray-800">AI 영상 생성 API</span>
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-50 border border-amber-200 text-amber-600">준비중</span>
                  </div>
                  <label className="text-[11px] font-bold text-gray-500">영상 생성 프로바이더 (연동 후 사용)</label>
                  <select
                    value={((config?.video_gen as Record<string, unknown> | undefined)?.provider as string) ?? 'fal_ai'}
                    onChange={(e) => setConfig(prev => {
                      if (!prev) return null;
                      const vg = (prev.video_gen as Record<string, unknown>) || {};
                      return { ...prev, video_gen: { ...vg, provider: e.target.value } };
                    })}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-orange-500 cursor-pointer"
                    title="영상 생성 프로바이더"
                  >
                    <option value="fal_ai">fal.ai (Veo/Sora/Hailuo 통합) — FAL 키 재사용</option>
                    <option value="minimax_h3">MiniMax H3 직접 연동</option>
                    <option value="veo_direct">Google Veo 직접 연동</option>
                    <option value="sora_direct">OpenAI Sora 직접 연동</option>
                  </select>
                  <p className="text-[10px] text-gray-400">키는 위 FAL API Key (또는 MiniMax API Key) 항목에 저장해 두면 연동 시 그대로 사용합니다. 백엔드 영상 파이프라인 연결 전에는 선택만 저장됩니다.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">로그인 체크 셀렉터</label>
                  <input 
                    type="text" 
                    value={(config?.login_check_selector as string) ?? ''} 
                    onChange={(e) => setConfig(prev => prev ? { ...prev, login_check_selector: e.target.value } : null)}
                    placeholder=".gnb_my"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:bg-white outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SettingsManager);
