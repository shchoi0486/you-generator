import React from 'react';
import { 
  Settings, Save, Loader2, Key, Zap, Eye, EyeOff, 
  ImagePlus, Mic, Cloud, ImageIcon, Video, RefreshCw 
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
  cfUsage: { error?: string; neurons: number; limit: number } | null;
}

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
                    <p className="text-[10px] text-red-500 font-medium">오류: {cfUsage.error}</p>
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
