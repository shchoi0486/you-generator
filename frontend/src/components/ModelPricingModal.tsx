import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** 2026년 조사 기준 USD→KRW 환산 (표기용, 변동 가능) */
export const USD_KRW = 1370;
const krw = (usd: number) =>
  usd < 0.01 ? `약 ${Math.round(usd * USD_KRW)}원` : `약 ${Math.round(usd * USD_KRW).toLocaleString()}원`;

interface ImageRow { model: string; spec: string; per: string; krwNote: string; note: string; free?: boolean }
const IMAGE_ROWS: ImageRow[] = [
  { model: 'MiniMax image-01', spec: '1장', per: '$0.0035', krwNote: '약 5원', note: '매우 저렴' },
  { model: 'Nano Banana 2 1K', spec: '1장', per: '$0.067', krwNote: '약 92원', note: '품질/가격 균형' },
  { model: 'Nano Banana 2 2K', spec: '1장', per: '$0.101', krwNote: '약 138원', note: '고해상도' },
  { model: 'Nano Banana 2 4K', spec: '1장', per: '$0.151', krwNote: '약 207원', note: '고해상도' },
  { model: 'Nano Banana Pro 1K/2K', spec: '1장', per: '$0.134', krwNote: '약 183원', note: '고품질' },
  { model: 'Nano Banana Pro 4K', spec: '1장', per: '$0.24', krwNote: '약 328원', note: '고품질 4K' },
  { model: 'GPT Image 계열', spec: '토큰 기반', per: '조건별 상이', krwNote: '-', note: '이미지/프롬프트 토큰 과금' },
  { model: 'Pollinations', spec: '1장', per: '무료', krwNote: '0원', note: '워터마크 · 앱 기본값', free: true },
  { model: 'Cloudflare AI', spec: '1장', per: '무료', krwNote: '0원', note: 'neurons 소모', free: true },
  { model: 'AI Horde', spec: '1장', per: '무료', krwNote: '0원', note: '느림', free: true },
  { model: 'Local SD', spec: '1장', per: '무료', krwNote: '0원', note: '로컬 서버 필요', free: true },
];

interface VideoRow { model: string; res: string; perSec: number; }
const VIDEO_ROWS: VideoRow[] = [
  { model: 'Veo 3.1 Lite', res: '720p', perSec: 0.05 },
  { model: 'MiniMax H3', res: '768p', perSec: 0.08 },
  { model: 'Sora 2', res: '720p', perSec: 0.10 },
  { model: 'Veo 3.1 Fast', res: '720p', perSec: 0.10 },
  { model: 'Veo 3.1 Fast', res: '1080p', perSec: 0.12 },
  { model: 'MiniMax H3', res: '2K', perSec: 0.13 },
  { model: 'Sora 2 Pro', res: '720p', perSec: 0.30 },
  { model: 'Veo 3.1 Standard', res: '720/1080p', perSec: 0.40 },
  { model: 'Sora 2 Pro', res: '1024p', perSec: 0.50 },
  { model: 'Sora 2 Pro', res: '1080p', perSec: 0.70 },
];

const TTS_ROWS = [
  { model: 'MiniMax Turbo', spec: '$60 / 100만자', cost10k: '$0.60', note: '2,000자 ≈ 164원' },
  { model: 'MiniMax HD', spec: '$100 / 100만자', cost10k: '$1.00', note: '10,000자 ≈ 1,368원' },
  { model: 'ElevenLabs Flash/Turbo', spec: '$0.05 / 1,000자', cost10k: '$0.50', note: '10,000자 ≈ 684원' },
  { model: 'ElevenLabs v2/v3', spec: '$0.10 / 1,000자', cost10k: '$1.00', note: '10,000자 ≈ 1,368원' },
];

type TabId = 'image' | 'video' | 'tts' | 'scenario';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'image', label: '이미지' },
  { id: 'video', label: '영상' },
  { id: 'tts', label: 'TTS·대본' },
  { id: 'scenario', label: '30초 시나리오' },
];

const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <th className={`px-2.5 py-2 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider bg-gray-50 ${className}`}>
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`px-2.5 py-2 text-xs text-gray-700 border-t border-gray-100 ${className}`}>
    {children}
  </td>
);

const ModelPricingModal: React.FC<{
  initialTab?: TabId;
  onClose: () => void;
}> = ({ initialTab = 'image', onClose }) => {
  const [tab, setTab] = React.useState<TabId>(initialTab);
  // 레일(aside z-10) 안에 렌더되므로 포털로 body에 띄워 스테퍼(z-20)보다 위에 표시
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-extrabold text-gray-900 flex-1">AI 모델 가격비교표</p>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700" title="닫기">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-1.5 px-5 pt-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5 overflow-y-auto custom-scrollbar">
          {tab === 'image' && (
            <table className="w-full border border-gray-200 rounded-xl overflow-hidden">
              <thead><tr><Th>모델</Th><Th>기준</Th><Th>장당</Th><Th>원화</Th><Th>비고</Th></tr></thead>
              <tbody>
                {IMAGE_ROWS.map((r) => (
                  <tr key={r.model} className={r.free ? 'bg-emerald-50/50' : ''}>
                    <Td className="font-bold">{r.model}</Td>
                    <Td>{r.spec}</Td>
                    <Td className="font-bold tabular-nums">{r.per}</Td>
                    <Td className="tabular-nums">{r.krwNote}</Td>
                    <Td className="text-gray-500">{r.note}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'video' && (
            <>
              <table className="w-full border border-gray-200 rounded-xl overflow-hidden">
                <thead><tr><Th>모델</Th><Th>해상도</Th><Th>$/sec</Th><Th>5초</Th><Th>10초</Th></tr></thead>
                <tbody>
                  {VIDEO_ROWS.map((r, i) => (
                    <tr key={`${r.model}-${r.res}-${i}`}>
                      <Td className="font-bold">{r.model}</Td>
                      <Td>{r.res}</Td>
                      <Td className="font-bold tabular-nums">${r.perSec.toFixed(2)}</Td>
                      <Td className="tabular-nums">${(r.perSec * 5).toFixed(2)} · {krw(r.perSec * 5)}</Td>
                      <Td className="tabular-nums">${(r.perSec * 10).toFixed(2)} · {krw(r.perSec * 10)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                실제 비용의 핵심은 최종 길이가 아니라 재생성 횟수입니다. 장면당 3회 재생성하면 ×3배가 됩니다.
              </p>
            </>
          )}
          {tab === 'tts' && (
            <>
              <table className="w-full border border-gray-200 rounded-xl overflow-hidden">
                <thead><tr><Th>TTS 모델</Th><Th>요금</Th><Th>10,000자</Th><Th>비고</Th></tr></thead>
                <tbody>
                  {TTS_ROWS.map((r) => (
                    <tr key={r.model}>
                      <Td className="font-bold">{r.model}</Td>
                      <Td className="tabular-nums">{r.spec}</Td>
                      <Td className="font-bold tabular-nums">{r.cost10k}</Td>
                      <Td className="text-gray-500">{r.note}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-gray-500 font-medium bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                대본(LLM) 비용은 1편당 1~30원 수준으로 사실상 무시해도 됩니다. 중요한 것은 품질·한국어 자연스러움·반복 생성 횟수입니다.
              </p>
            </>
          )}
          {tab === 'scenario' && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500">30초 쇼츠 1편 가정: 이미지 6장 + 각 5초 영상화(30초) + TTS 2,000자 · 최종 채택본 1회 기준</p>
              {[
                { name: 'A안 · 초저가', rows: [['대본', 'GPT-5.6 Luna', '~수 원'], ['이미지', 'MiniMax image-01 × 6', '약 29원'], ['영상', 'MiniMax H3 768P × 30초', '약 3,283원'], ['TTS', 'MiniMax Turbo 2,000자', '약 164원']], total: '약 3,500원' },
                { name: 'B안 · Google 중심', rows: [['대본', 'Gemini Flash', '수 원 수준'], ['이미지', 'Nano Banana 2 1K × 6', '약 552원'], ['영상', 'Veo 3.1 Fast 720p × 30초', '약 4,104원'], ['TTS', '별도', '별도']], total: '약 4,700원 + TTS' },
                { name: 'C안 · OpenAI 중심', rows: [['대본', 'GPT', '수~수십 원'], ['이미지', 'GPT Image', '옵션별 상이'], ['영상', 'Sora 2 720p × 30초', '약 4,104원'], ['TTS', 'OpenAI TTS', '별도']], total: '약 4천~수천 원대' },
              ].map((s) => (
                <div key={s.name} className="rounded-xl border border-gray-200 overflow-hidden">
                  <p className="px-3 py-2 text-xs font-extrabold text-gray-800 bg-gray-50 border-b border-gray-100">{s.name}</p>
                  {s.rows.map(([k, v, c]) => (
                    <div key={k} className="flex items-center gap-2 px-3 py-1.5 text-xs border-t border-gray-50 first:border-t-0">
                      <span className="w-12 font-bold text-gray-400">{k}</span>
                      <span className="flex-1 text-gray-700">{v}</span>
                      <span className="font-bold text-gray-800 tabular-nums">{c}</span>
                    </div>
                  ))}
                  <p className="px-3 py-2 text-xs font-extrabold text-indigo-600 bg-indigo-50/60 border-t border-indigo-100">합계 {s.total}</p>
                </div>
              ))}
              <p className="text-[11px] text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                재생성을 많이 하면 2~5배까지 올라갈 수 있습니다. 이미지 중심+TTS만 쓰면 수백 원 이하로도 가능합니다.
              </p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
            2026년 조사 기준 · 환율 약 1,370원 · API 공식가 기준이며 실제 청구와 다를 수 있습니다.
            영상 모델 가격은 오디오 포함 여부에 따라 달라질 수 있으니 도입 전 공식 가격표를 확인하세요.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default React.memo(ModelPricingModal);
