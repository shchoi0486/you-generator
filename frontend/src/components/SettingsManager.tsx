import React from 'react';
import {
  Settings, Save, Loader2, Video, RefreshCw, Cloud, Sliders, ChevronDown,
} from 'lucide-react';
import {
  api, API_BASE_URL, type AppConfig, type ProviderKeyList, type ProviderPlan,
} from '../services/api';
import ModelPlanCard from './ModelPlanCard';

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
  providerKeys: ProviderKeyList | null;
  plan: ProviderPlan | null;
  loadingPlan: boolean;
  refreshPlan: () => void | Promise<void>;
  planScenes: number;
  setPlanScenes: (n: number) => void;
  planI2v: number;
  setPlanI2v: (n: number) => void;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({
  config,
  setConfig,
  loading,
  handleSaveConfig,
  fetchCloudflareUsage,
  isFetchingUsage,
  cfUsage,
  providerKeys,
  plan,
  loadingPlan,
  refreshPlan,
  planScenes,
  setPlanScenes,
  planI2v,
  setPlanI2v,
}) => {
  const img = (config?.image_gen ?? {}) as Record<string, unknown>;
  const patchImg = (k: string, v: unknown) =>
    setConfig((prev) => (prev ? { ...prev, image_gen: { ...(prev.image_gen ?? {}), [k]: v } } : null));
  const vids = (config?.video_settings as Record<string, unknown>) ?? {};

  // ── 프로바이더별 전용 설정 슬롯 ──────────────────────────────
  // 같은 프로바이더의 키와 설정을 한 드롭다운 안에 모은다.
  const extras: Record<string, React.ReactNode> = {

    gemini_api_key: (
      <div className="space-y-2">
        <p className="text-[10px] text-gray-400">
          대본 모델 목록·가격·켜기/끄기는 위 <b>대본 카드</b>에서 합니다.
          (providers.yaml 이 단일 출처입니다)
        </p>
        <div className="pt-1">
          <label className="text-[11px] font-bold text-gray-600">Gemini 이미지 모델 (Nano Banana)</label>
          <select
            value={(img.gemini_image_model as string) ?? 'gemini-3.1-flash-lite-image'}
            onChange={(e) => patchImg('gemini_image_model', e.target.value)}
            className="mt-1 w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] outline-none focus:border-indigo-400"
          >
            <option value="gemini-3.1-flash-lite-image">Nano Banana 2 Lite — 가장 저렴·빠름 (권장)</option>
            <option value="gemini-3.1-flash-image">Nano Banana 2 — 고품질 4K·문자 렌더링</option>
          </select>
          <p className="text-[9.5px] text-gray-400 mt-0.5">같은 키 사용. 키 추가 불필요.</p>
        </div>
      </div>
    ),

    pollinations_api_key: (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-gray-600">모델 순서</label>
          <input
            type="text"
            value={((img.pollinations_models as string[]) ?? ['turbo', 'flux']).join(', ')}
            onChange={(e) => patchImg('pollinations_models', e.target.value.split(',').map((m) => m.trim()).filter(Boolean))}
            className="mt-1 w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] outline-none focus:border-indigo-400 font-mono"
            placeholder="turbo, flux"
          />
          <p className="text-[9.5px] text-gray-400 mt-0.5">공식 지원: flux, turbo</p>
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-600">요청 간격 (초)</label>
          <input
            type="number"
            min={5}
            max={60}
            value={(img.pollinations_min_interval as number) ?? 16}
            onChange={(e) => patchImg('pollinations_min_interval', isNaN(parseInt(e.target.value, 10)) ? 16 : parseInt(e.target.value, 10))}
            className="mt-1 w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] outline-none focus:border-indigo-400"
          />
          <p className="text-[9.5px] text-gray-400 mt-0.5">15초에 1요청. 낮추면 429</p>
        </div>
      </div>
    ),

    cloudflare_api_token: (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Workers AI', key: 'use_cloudflare' },
            { label: 'Pollinations', key: 'use_pollinations' },
            { label: 'AI Horde', key: 'use_ai_horde' },
            { label: 'Local SD', key: 'use_local_sd' },
            { label: 'Z-Image', key: 'use_zimage' },
          ].map((e) => {
            const on = !!img[e.key];
            return (
              <button
                key={e.key}
                onClick={() => patchImg(e.key, !on)}
                className={`px-2.5 py-1 rounded-lg border text-[10.5px] font-bold transition-colors ${
                  on ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
              >
                {on ? '● ' : '○ '}{e.label}
              </button>
            );
          })}
        </div>
        {!!img.use_cloudflare && (
          <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                <Cloud size={12} /> Workers AI 사용량
              </span>
              <button onClick={fetchCloudflareUsage} disabled={isFetchingUsage} className="p-1 text-indigo-600 hover:bg-indigo-100 rounded" aria-label="사용량 새로고침">
                <RefreshCw size={12} className={isFetchingUsage ? 'animate-spin' : ''} />
              </button>
            </div>
            {cfUsage?.error ? (
              <p className="text-[10px] text-red-600">{cfUsage.error}</p>
            ) : cfUsage ? (
              <>
                <p className="text-[10px] text-indigo-500 tabular-nums">
                  {cfUsage.neurons.toLocaleString()} / {cfUsage.limit.toLocaleString()} neurons
                </p>
                <div className="w-full bg-white h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cfUsage.neurons / (cfUsage.limit || 1) > 0.9 ? 'bg-red-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, Math.round((cfUsage.neurons / (cfUsage.limit || 1)) * 100))}%` }}
                  />
                </div>
              </>
            ) : (
              <Loader2 size={12} className="animate-spin text-indigo-300" />
            )}
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold text-gray-600">Account ID (사용량 조회용)</label>
          <p className="text-[9.5px] text-gray-400">키 항목 옆에서 등록하세요. 여기는 안내만.</p>
        </div>
      </div>
    ),

    cloudflare_worker_url: (
      <p className="text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
        Azure 키 대신 이 URL 로 TTS 를 중계합니다. 2026-09-27 실측 결과 워커가
        <b> 401</b> 을 반환해 현재 비활성 상태입니다. 워커를 고치면 다시 켜집니다.
      </p>
    ),

    azure_speech_key: (
      <p className="text-[10.5px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2">
        직접 Azure 키를 넣을 수도 있지만, 보통은 <b>Cloudflare Worker 에 두고 URL 만</b> 등록합니다
        (키가 브라우저를 거치지 않으므로 더 안전).
      </p>
    ),
  };

  // TTS 미리듣기. 음성 프로바이더 행의 '미리듣기' 버튼이 이걸 부른다.
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [ttsBusy, setTtsBusy] = React.useState<string | null>(null);
  const [ttsMsg, setTtsMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const testTTS = async (label: string) => {
    const p = (providerKeys?.tts?.providers ?? []).find(
      (x) => x.label === label && x.has_key && x.adapter_ok);
    if (!p) {
      setTtsMsg({ ok: false, text: '키가 있고 코드가 연결된 TTS 를 찾지 못했습니다.' });
      return;
    }
    setTtsBusy(label);
    setTtsMsg(null);
    try {
      const r = await api.testTTS({
        provider_id: p.id,
        text: '안녕하세요. 음성 미리듣기입니다.',
      });
      if (r.ok && r.audio_url) {
        setTtsMsg({ ok: true, text: `${p.label} 생성 완료 — 재생합니다` });
        if (audioRef.current) {
          audioRef.current.src = `${API_BASE_URL}${r.audio_url}`;
          void audioRef.current.play().catch(() => {
            setTtsMsg({ ok: false, text: '재생이 차단됐습니다. 음성 생성은 성공했습니다.' });
          });
        }
      } else {
        const d = r.diagnostic as { error?: string } | undefined;
        setTtsMsg({ ok: false, text: `${r.message}${d?.error ? ` — ${d.error}` : ''}` });
      }
    } catch (e) {
      setTtsMsg({ ok: false, text: (e as Error).message });
    } finally { setTtsBusy(null); }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 p-4 md:p-8 flex-1 flex flex-col overflow-hidden min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Settings size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">설정</h2>
            <p className="text-[11px] text-gray-500">키는 이 PC 에만 저장됩니다</p>
          </div>
        </div>
        <button
          onClick={handleSaveConfig}
          disabled={loading}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 text-sm"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          설정 저장
        </button>
      </div>

      {/* 본문: 2열(모델 카드 내부). 키와 모델이 한 블록이라 별도 우측 열이 없다. */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-8">
        <div className="space-y-5 max-w-6xl">
          <ModelPlanCard
            plan={plan}
            loading={loadingPlan}
              onRefresh={refreshPlan}
              scenes={planScenes}
              onScenes={setPlanScenes}
              i2vScenes={planI2v}
              onI2v={setPlanI2v}
              onTestTTS={testTTS}
          />

          {/* 미리듣기 결과 (해당 음성 행의 버튼을 눌렀을 때만 보인다) */}
          {(ttsMsg || ttsBusy) && (
            <div className={`px-4 py-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
              ttsMsg?.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-red-700 bg-red-50 border-red-200'}`}>
              {ttsBusy ? <Loader2 size={12} className="animate-spin" /> : null}
              <span className="flex-1">{ttsMsg?.text ?? `${ttsBusy} 생성 중...`}</span>
              {ttsMsg && (
                <button onClick={() => setTtsMsg(null)} className="text-[10px] underline opacity-60">
                  닫기
                </button>
              )}
            </div>
          )}
          <audio ref={audioRef} className="hidden" />

          {/* 프로바이더별 전용 설정 (모델 순서 · 요청 간격 · 사용량 등) */}
          <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
            <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-gray-50 list-none">
              <ChevronDown size={14} className="text-gray-400 transition-transform group-open:rotate-180" />
              <Sliders size={15} className="text-gray-500" />
              <span className="text-[13px] font-bold text-gray-800">프로바이더 세부 설정</span>
              <span className="text-[10px] text-gray-400">모델 순서 · 요청 간격 · 사용량</span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {Object.entries(extras).map(([k, node]) => (
                <div key={k}>
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">{k}</p>
                  {node}
                </div>
              ))}
            </div>
          </details>

          {/* 영상 생성 경로: 모델 선택 카드가 영상 프로바이더를 이미 보여주므로
              여기서는 '파이프라인 설정' 만 남긴다. */}
          <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
            <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-gray-50 list-none">
              <ChevronDown size={14} className="text-gray-400 transition-transform group-open:rotate-180" />
              <Video size={15} className="text-orange-500" />
              <span className="text-[13px] font-bold text-gray-800">파이프라인 설정</span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              <Toggle
                label="Ken Burns 효과"
                hint="장면마다 줌·팬. 끄면 정지 이미지"
                on={vids.kenburns !== false}
                onToggle={() => setConfig((prev) => (prev
                  ? { ...prev, video_settings: { ...(prev.video_settings as Record<string, unknown> ?? {}), kenburns: vids.kenburns === false } }
                  : null))}
              />
              <Toggle
                label="크롤러 상세 로그"
                hint="스크래핑 과정을 상세 출력"
                on={!!config?.crawler_verbose}
                onToggle={() => setConfig((prev) => (prev ? { ...prev, crawler_verbose: !prev.crawler_verbose } : null))}
              />
              <div>
                <label className="text-[11px] font-bold text-gray-600">로그인 체크 셀렉터</label>
                <input
                  type="text"
                  value={(config?.login_check_selector as string) ?? ''}
                  onChange={(e) => setConfig((prev) => (prev ? { ...prev, login_check_selector: e.target.value } : null))}
                  placeholder=".gnb_my"
                  className="mt-1 w-full px-2.5 py-2 bg-white border border-gray-200 rounded-lg text-[11px] outline-none focus:border-orange-400"
                />
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

/** 작은 토글 스위치 */
const Toggle: React.FC<{ label: string; hint?: string; on: boolean; onToggle: () => void }> =
  ({ label, hint, on, onToggle }) => (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-left"
    >
      <div className="min-w-0">
        <p className="text-[11.5px] font-bold text-gray-700">{label}</p>
        {hint && <p className="text-[9.5px] text-gray-400">{hint}</p>}
      </div>
      <span className={`w-8 h-4 rounded-full relative shrink-0 transition-colors ${on ? 'bg-indigo-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${on ? 'left-4.5' : 'left-0.5'}`} />
      </span>
    </button>
  );

export default React.memo(SettingsManager);
