import React from 'react';
import { type AppContent, type CaptionStyle, type StickerItem } from '../services/api';
import {
  Type,
  Music,
  Volume2,
  Settings2,
  Trash2,
  RefreshCw,
  X
} from 'lucide-react';
import SubtitlePresetSelect from './SubtitlePresetSelect';

type SelectedItemType = 'subtitle' | 'scene' | 'sfx' | 'bgm' | 'caption' | 'sticker';
type SelectedItem = { id: string | number; type: SelectedItemType } | null;
type SubtitlePreset = {
  label: string;
  font_size: number;
  color: string;
  stroke_width: number;
  stroke_color: string;
  bg_color: string;
};
type SubtitleStyle = {
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
  [key: string]: string | number | boolean | undefined;
};
type SfxItem = { path: string; time: number; volume: number };
type AudioEditState = { bgm_path: string | null; bgm_volume: number; sfx_list: SfxItem[] };
type SrtItem = { id: number; start: number; end: number; text: string };
type SceneLayoutState = { scale: number; x: number; y: number };
interface PropertiesPanelProps {
  selectedItem: SelectedItem;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  audioEdit: AudioEditState;
  setAudioEdit: React.Dispatch<React.SetStateAction<AudioEditState>>;
  onDelete: (id: string | number, type: 'subtitle' | 'sfx' | 'bgm' | 'sticker') => void;
  onDeselect?: () => void;
  subtitlePresets: Record<string, SubtitlePreset>;
  srtData: SrtItem[];
  setSrtData: React.Dispatch<React.SetStateAction<SrtItem[]>>;
  content: AppContent | null;
  setContent: React.Dispatch<React.SetStateAction<AppContent | null>>;
  showSceneCaptions: boolean;
  setShowSceneCaptions: (v: boolean) => void;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  sceneLayouts: Record<number, SceneLayoutState>;
  setSceneLayouts: React.Dispatch<React.SetStateAction<Record<number, SceneLayoutState>>>;
  sceneFilters: Record<number, string>;
  setSceneFilters: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  stickers: StickerItem[];
  setStickers: React.Dispatch<React.SetStateAction<StickerItem[]>>;
  sceneFits: Record<number, string>;
  setSceneFits: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  mediaFitDefault?: string;
}

const TYPE_META: Record<SelectedItemType, { label: string; color: string }> = {
  subtitle: { label: '하단 자막', color: 'bg-indigo-100 text-indigo-700' },
  caption: { label: '상단 자막', color: 'bg-amber-100 text-amber-700' },
  scene: { label: '장면', color: 'bg-blue-100 text-blue-700' },
  sfx: { label: '효과음', color: 'bg-emerald-100 text-emerald-700' },
  bgm: { label: '배경음악', color: 'bg-purple-100 text-purple-700' },
  sticker: { label: '스티커', color: 'bg-pink-100 text-pink-700' },
};

export const SCENE_FILTER_OPTIONS = [
  { id: 'none', label: '없음' },
  { id: 'bw', label: '흑백' },
  { id: 'vivid', label: '선명하게' },
  { id: 'bright', label: '밝게' },
  { id: 'cinematic', label: '시네마틱' },
];

const ANIM_OPTIONS = [
  { id: 'none', label: '없음' },
  { id: 'fade', label: '페이드인' },
  { id: 'slide', label: '슬라이드업' },
  { id: 'typing', label: '타이핑' },
  { id: 'pulse', label: '펄스' },
];

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedItem,
  subtitleStyle,
  setSubtitleStyle,
  audioEdit,
  setAudioEdit,
  onDelete,
  onDeselect,
  subtitlePresets,
  srtData,
  setSrtData,
  content,
  setContent,
  showSceneCaptions,
  setShowSceneCaptions,
  captionStyle,
  setCaptionStyle,
  sceneLayouts,
  setSceneLayouts,
  sceneFilters,
  setSceneFilters,
  stickers,
  setStickers,
  sceneFits,
  setSceneFits,
  mediaFitDefault = 'fit'
}) => {
  if (!content) {
    return (
      <div className="flex flex-col h-full bg-zinc-50/50">
        <div className="flex items-center justify-between p-3 border-b border-zinc-200 bg-white shrink-0">
          <Settings2 size={18} className="text-zinc-500" />
          <h3 className="font-bold text-zinc-700 text-sm uppercase tracking-widest">Properties</h3>
        </div>
        <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-100 ring-1 ring-black/5">
            <Settings2 size={32} className="text-zinc-300" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">No Project Loaded</p>
            <p className="text-[10px] text-zinc-400 font-bold max-w-40 text-center">Load a project to edit properties</p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedItem) {
    return (
      <div className="w-full bg-white flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="p-4 border-b border-zinc-200 bg-white flex items-center gap-2">
          <Settings2 size={18} className="text-zinc-500" />
          <h3 className="font-bold text-zinc-700 text-sm uppercase tracking-widest">Properties</h3>
        </div>
        <div className="p-4 space-y-5">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-[11px] font-black text-zinc-700">타임라인에서 트랙 아이템을 선택하세요</p>
            <p className="text-[10px] text-zinc-500 mt-1">선택한 자막, 장면, 오디오의 속성이 여기 표시됩니다.</p>
          </div>
          <SubtitleSettings 
            subtitleStyle={subtitleStyle} 
            setSubtitleStyle={setSubtitleStyle} 
            subtitlePresets={subtitlePresets}
            showSceneCaptions={showSceneCaptions}
            setShowSceneCaptions={setShowSceneCaptions}
            captionStyle={captionStyle}
            setCaptionStyle={setCaptionStyle}
          />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (selectedItem.type) {
      case 'subtitle': {
        const item = srtData.find((s) => s.id === selectedItem.id);
        const anim = (subtitleStyle.animation ?? 'none');
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2" title="Subtitle Content">
                  <Type size={12} className="text-amber-500" /> Subtitle Content
                </label>
                <button
                  onClick={() => {
                    if (window.confirm('TTS를 다시 생성하시겠습니까? 전체 오디오가 재생성됩니다.')) {
                      // We need to trigger TTS generation here.
                      // The parent component needs to pass handleGenerateTTS down, or we can use a custom event.
                      const event = new CustomEvent('requestTTSGeneration');
                      window.dispatchEvent(event);
                    }
                  }}
                  className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1"
                  title="Regenerate Audio with this text"
                >
                  <RefreshCw size={10} /> REGENERATE TTS
                </button>
              </div>
              <textarea
                value={item?.text || ''}
                onChange={(e) => {
                  const newText = e.target.value;
                  // Update SRT Data
                  setSrtData((prev) => prev.map((s) => 
                    s.id === selectedItem.id ? { ...s, text: newText } : s
                  ));
                  
                  // Sync back to content.script if it exists (자막 분할 시 scene 기준)
                  if (content?.script) {
                    const srtIdx = srtData.findIndex(s => s.id === selectedItem.id);
                    const sc = srtIdx !== -1 ? ((srtData[srtIdx] as { scene?: number }).scene ?? srtIdx) : -1;
                    if (sc !== -1 && content.script[sc]) {
                      setContent(prev => {
                        if (!prev) return prev;
                        const newScript = [...prev.script];
                        newScript[sc] = { ...newScript[sc], text: newText };
                        return { ...prev, script: newScript };
                      });
                    }
                  }
                }}
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none h-20 text-zinc-700 placeholder:text-zinc-400"
                placeholder="Enter subtitle text..."
              />
            </div>

            <details className="rounded-xl border border-zinc-200 bg-zinc-50/50 overflow-hidden">
              <summary className="px-3 py-2.5 text-[10px] font-black text-zinc-600 uppercase tracking-widest cursor-pointer hover:text-indigo-600 select-none">
                표시 구간 (시작·종료·이동)
              </summary>
              <div className="px-3 pb-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[9px] font-bold text-zinc-400">시작</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={item?.start ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, parseFloat(e.target.value) || 0);
                      setSrtData((prev) => prev.map((s) =>
                        s.id === selectedItem.id ? { ...s, start: Math.min(v, s.end - 0.1) } : s
                      ));
                    }}
                    title="자막 시작 시간(초)"
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[9px] font-bold text-zinc-400">종료</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={item?.end ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, parseFloat(e.target.value) || 0);
                      setSrtData((prev) => prev.map((s) =>
                        s.id === selectedItem.id ? { ...s, end: Math.max(v, s.start + 0.1) } : s
                      ));
                    }}
                    title="자막 종료 시간(초)"
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-400">
                  길이 {item ? (item.end - item.start).toFixed(1) : '0.0'}초
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-zinc-500">
                    {(() => {
                      const idx = srtData.findIndex((s) => s.id === selectedItem.id);
                      return `자막 ${idx + 1} / ${srtData.length}`;
                    })()}
                  </span>
                  <button
                    onClick={() => {
                      const idx = srtData.findIndex((s) => s.id === selectedItem.id);
                      const prevItem = srtData[idx - 1];
                      if (prevItem) {
                        const event = new CustomEvent('selectTimelineItem', { detail: { id: prevItem.id, type: 'subtitle' } });
                        window.dispatchEvent(event);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all"
                    title="이전 자막으로 이동"
                  >
                    ← 이전
                  </button>
                  <button
                    onClick={() => {
                      const idx = srtData.findIndex((s) => s.id === selectedItem.id);
                      const nextItem = srtData[idx + 1];
                      if (nextItem) {
                        const event = new CustomEvent('selectTimelineItem', { detail: { id: nextItem.id, type: 'subtitle' } });
                        window.dispatchEvent(event);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all"
                    title="다음 자막으로 이동"
                  >
                    다음 →
                  </button>
                </div>
              </div>
              </div>
            </details>
            
            <SubtitleSettings
              subtitleStyle={subtitleStyle}
              setSubtitleStyle={setSubtitleStyle}
              subtitlePresets={subtitlePresets}
              showSceneCaptions={showSceneCaptions}
              setShowSceneCaptions={setShowSceneCaptions}
              captionStyle={captionStyle}
              setCaptionStyle={setCaptionStyle}
            />

            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest" title="Subtitle Animation">등장 효과 (렌더 반영)</label>
              <div className="grid grid-cols-3 gap-2">
                {ANIM_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSubtitleStyle({ ...subtitleStyle, animation: o.id })}
                    title={`${o.label} 효과 적용`}
                    className={`py-2 text-[10px] font-black rounded-xl border transition-all ${
                      anim === o.id
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => onDelete(selectedItem.id, 'subtitle')}
              className="w-full py-3 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500/80 hover:text-rose-500 rounded-2xl text-[10px] font-black flex items-center justify-center gap-3 transition-all border border-rose-500/10 hover:border-rose-500/30 group"
              title="Remove Subtitle"
            >
              <Trash2 size={14} className="group-hover:rotate-12 transition-transform" /> REMOVE SUBTITLE
            </button>
          </div>
        );
      }

      case 'caption': {
        const sceneIdx = typeof selectedItem.id === 'number' ? selectedItem.id : parseInt(String(selectedItem.id));
        const capValue = content?.scenes?.[sceneIdx]?.subtitle || '';
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2" title="Scene Caption Content">
                <Type size={12} className="text-amber-500" /> Scene Caption (Scene {sceneIdx + 1})
              </label>
              <p className="text-[9px] text-zinc-400 font-bold">상단 밴드에 표시되는 씬 요약 자막입니다. 하단 내레이션 자막과 별개입니다.</p>
              <textarea
                value={capValue}
                onChange={(e) => {
                  const newText = e.target.value;
                  setContent((prev) => {
                    if (!prev) return prev;
                    const newScenes = [...prev.scenes];
                    if (!newScenes[sceneIdx]) return prev;
                    newScenes[sceneIdx] = { ...newScenes[sceneIdx], subtitle: newText };
                    return { ...prev, scenes: newScenes };
                  });
                }}
                className="w-full p-4 bg-amber-50/50 border border-amber-200 rounded-2xl text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none h-20 text-zinc-700 placeholder:text-zinc-400"
                placeholder="씬 자막을 입력하세요 (비우면 표시 안 됨)"
              />
            </div>

            <CaptionStyleSettings captionStyle={captionStyle} setCaptionStyle={setCaptionStyle} />

            <button
              onClick={() => {
                setContent((prev) => {
                  if (!prev) return prev;
                  const newScenes = [...prev.scenes];
                  if (!newScenes[sceneIdx]) return prev;
                  newScenes[sceneIdx] = { ...newScenes[sceneIdx], subtitle: '' };
                  return { ...prev, scenes: newScenes };
                });
              }}
              className="w-full py-3 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500/80 hover:text-rose-500 rounded-2xl text-[10px] font-black flex items-center justify-center gap-3 transition-all border border-rose-500/10 hover:border-rose-500/30 group"
              title="Clear Scene Caption"
            >
              <Trash2 size={14} className="group-hover:rotate-12 transition-transform" /> CLEAR CAPTION
            </button>
          </div>
        );
      }

      case 'scene': {
        const sceneIdx = typeof selectedItem.id === 'string' ? parseInt(selectedItem.id.split('-')[1]) : (selectedItem.id as number);
        // 미리보기·렌더와 같은 값(sceneLayouts)을 직접 편집. 미리보기에서 드래그/코너 조절과 동기화됨.
        const layout = sceneLayouts[sceneIdx] ?? { scale: 1, x: 0, y: 0 };
        const setLayout = (patch: Partial<SceneLayoutState>) => {
          setSceneLayouts((prev) => ({
            ...prev,
            [sceneIdx]: {
              scale: patch.scale ?? prev[sceneIdx]?.scale ?? 1,
              x: patch.x ?? prev[sceneIdx]?.x ?? 0,
              y: patch.y ?? prev[sceneIdx]?.y ?? 0,
            },
          }));
        };
        const resetLayout = () => {
          setSceneLayouts((prev) => {
            const next = { ...prev };
            delete next[sceneIdx];
            return next;
          });
        };
        const scalePct = Math.round(layout.scale * 100);

        return (
          <div className="space-y-5">
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
              <p className="text-sm font-black text-zinc-700">Scene {sceneIdx + 1}</p>
              <p className="text-[11px] text-zinc-600 leading-relaxed wrap-break-word">
                {content?.script?.[sceneIdx]?.text || '선택된 장면의 스크립트가 없습니다.'}
              </p>
              <p className="text-[9px] text-zinc-400 font-bold">미리보기에서 드래그로 이동 · 코너점으로 확대/축소 · 휠로 확대/축소 · 더블클릭 초기화</p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Scale">
                크기
                <span className="text-indigo-500">{scalePct}%</span>
              </label>
              <input
                title="장면 크기"
                type="range"
                min="100"
                max="300"
                step="1"
                value={scalePct}
                onChange={(e) => setLayout({ scale: Math.min(3, Math.max(1, parseInt(e.target.value) / 100)) })}
                className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest" title="Position">위치 (%)</label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[9px] font-bold text-zinc-400">X {Math.round(layout.x * 100)}%</span>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={Math.round(layout.x * 100)}
                    onChange={(e) => setLayout({ x: parseInt(e.target.value) / 100 })}
                    title="X 위치"
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[9px] font-bold text-zinc-400">Y {Math.round(layout.y * 100)}%</span>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={Math.round(layout.y * 100)}
                    onChange={(e) => setLayout({ y: parseInt(e.target.value) / 100 })}
                    title="Y 위치"
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                  />
                </label>
              </div>
            </div>

            <button
              onClick={resetLayout}
              className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-2xl text-[10px] font-black transition-all"
              title="배치 초기화"
            >
              배치 초기화 (100% · 중앙)
            </button>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest" title="Scene Fit Override">미디어 맞춤 (이 장면만, 렌더 반영)</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: '', label: `기본값(${mediaFitDefault === 'crop' ? '꽉 채움' : mediaFitDefault === 'fill' ? '너비 채움' : '원본 유지'})` },
                  { id: 'fit', label: '원본 유지' },
                  { id: 'fill', label: '너비 채우기' },
                  { id: 'crop', label: '꽉 채우기' },
                ].map((o) => {
                  const cur = sceneFits[sceneIdx] ?? '';
                  return (
                    <button
                      key={o.id || 'default'}
                      onClick={() => setSceneFits((prev) => {
                        const next = { ...prev };
                        if (!o.id) delete next[sceneIdx];
                        else next[sceneIdx] = o.id;
                        return next;
                      })}
                      title={o.id ? `${o.label}로 고정` : '전역 기본값 따름'}
                      className={`py-2 text-[10px] font-black rounded-xl border transition-all ${
                        cur === o.id
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest" title="Scene Filter">장면 필터 (렌더 반영)</label>
              <select
                value={sceneFilters[sceneIdx] ?? 'none'}
                onChange={(e) => {
                  const v = e.target.value;
                  setSceneFilters((prev) => {
                    const next = { ...prev };
                    if (v === 'none') delete next[sceneIdx];
                    else next[sceneIdx] = v;
                    return next;
                  });
                }}
                title="장면 필터"
                className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {SCENE_FILTER_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        );
      }

      case 'sticker': {
        const stk = stickers.find((s) => s.id === String(selectedItem.id));
        if (!stk) {
          return (
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-center">
              <p className="text-[11px] font-bold text-zinc-500">삭제된 스티커입니다.</p>
            </div>
          );
        }
        const patch = (p: Partial<StickerItem>) => {
          setStickers((prev) => prev.map((s) => (s.id === stk.id ? { ...s, ...p } : s)));
        };
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest" title="Sticker Text">내용</label>
              <input
                type="text"
                value={stk.text}
                maxLength={20}
                onChange={(e) => patch({ text: e.target.value })}
                title="스티커 내용"
                className="w-full h-11 rounded-xl border border-zinc-200 px-3 text-sm font-black text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest" title="Sticker Color">글자색</label>
              <div className="flex items-center gap-2.5 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-300 shadow-sm shrink-0">
                  <input
                    title="Sticker Color"
                    type="color"
                    value={stk.color}
                    onChange={(e) => patch({ color: e.target.value })}
                    className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
                  />
                </div>
                <span className="text-[10px] font-mono text-zinc-600 uppercase">{stk.color}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Sticker Size">
                크기
                <span className="text-indigo-500">{stk.size}px</span>
              </label>
              <input
                title="Sticker Size"
                type="range"
                min="16"
                max="120"
                value={stk.size}
                onChange={(e) => patch({ size: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Sticker Position">
                세로 위치
                <span className="text-indigo-500">{stk.y}%</span>
              </label>
              <input
                title="Sticker Y"
                type="range"
                min="2"
                max="98"
                value={stk.y}
                onChange={(e) => patch({ y: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
              />
              <p className="text-[9px] text-zinc-400 font-bold">미리보기에서 드래그로도 이동할 수 있습니다.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-zinc-400">시작(초)</span>
                <input
                  type="number" step="0.1" min="0"
                  value={stk.start}
                  onChange={(e) => patch({ start: Math.max(0, parseFloat(e.target.value) || 0) })}
                  title="스티커 시작 시간"
                  className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-bold text-zinc-400">종료(초)</span>
                <input
                  type="number" step="0.1" min="0"
                  value={stk.end}
                  onChange={(e) => patch({ end: Math.max(stk.start + 0.1, parseFloat(e.target.value) || 0) })}
                  title="스티커 종료 시간"
                  className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
            </div>
            <p className="text-[9px] text-zinc-400 font-bold">씬 {stk.scene + 1} 구간 · 미리보기에서 클릭·드래그 가능</p>
            <button
              onClick={() => onDelete(selectedItem.id, 'sticker')}
              className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 transition-all border border-rose-500/20 group"
              title="Remove Sticker"
            >
              <Trash2 size={14} className="group-hover:rotate-12 transition-transform" /> REMOVE STICKER
            </button>
          </div>
        );
      }

      case 'sfx': {
        const sfxIdx = typeof selectedItem.id === 'string' ? parseInt(selectedItem.id.split('-')[1]) : (selectedItem.id as number);
        const sfx = audioEdit.sfx_list[sfxIdx];
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2" title="Audio Info">
                <Music size={12} className="text-emerald-500" /> Audio Info
              </label>
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
                <p className="text-[11px] font-black text-zinc-700 truncate">{sfx?.path?.split('/').pop()}</p>
                <p className="text-[9px] text-zinc-600 mt-1 font-bold">Sound Effect File</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2" title="Volume">
                <Volume2 size={12} className="text-emerald-500" /> Volume
              </label>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <input  
                    title="Volume"
                    placeholder="Volume"
                    type="range"
                    min="0"
                    max="200"
                    value={(sfx?.volume || 1) * 100}
                    onChange={(e) => {
                      const newVolume = parseInt(e.target.value) / 100;
                      setAudioEdit((prev) => ({
                        ...prev,
                        sfx_list: prev.sfx_list.map((s, i) => 
                          i === sfxIdx ? { ...s, volume: newVolume } : s
                        )
                      }));
                    }}
                    className="flex-1 h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[10px] font-black text-indigo-500 min-w-12 text-right bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">
                    {Math.round((sfx?.volume || 1) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onDelete(selectedItem.id, 'sfx')}
              className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 transition-all border border-rose-500/20 group"
              title="Remove Sound Effect"
            >
              <Trash2 size={14} className="group-hover:rotate-12 transition-transform" /> REMOVE SFX
            </button>
          </div>
        );
      }

      case 'bgm': {
        return (
          <div className="space-y-5">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2" title="Background Music">
                <Music size={12} className="text-purple-500" /> Background Music
              </label>
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
                <p className="text-[11px] font-black text-zinc-700 truncate">{audioEdit.bgm_path?.split('/').pop()}</p>
                <p className="text-[9px] text-zinc-600 mt-1 font-bold">Ambient Track</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2" title="Volume">
                <Volume2 size={12} className="text-purple-500" /> Volume
              </label>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <input  
                    title="Volume"
                    placeholder="Volume"
                    type="range"
                    min="0"
                    max="100"
                    value={audioEdit.bgm_volume * 100}
                    onChange={(e) => {
                      const newVolume = parseInt(e.target.value) / 100;
                      setAudioEdit((prev) => ({ ...prev, bgm_volume: newVolume }));
                    }}
                    className="flex-1 h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[10px] font-black text-indigo-500 min-w-12 text-right bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">
                    {Math.round(audioEdit.bgm_volume * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onDelete(selectedItem.id, 'bgm')}
              className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 transition-all border border-rose-500/20 group"
              title="Remove Background Music"
            >
              <Trash2 size={14} className="group-hover:rotate-12 transition-transform" /> REMOVE BGM
            </button>
          </div>
        );
      }
    }
  };

  return (
    <div className="w-full bg-white flex flex-col h-full overflow-y-auto custom-scrollbar z-30">
      <div className="p-3 border-b border-zinc-200 bg-white flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
            <Settings2 size={14} className="text-indigo-500" />
          </div>
          <h3 className="font-black text-[11px] text-zinc-700 uppercase tracking-[0.16em]">Properties</h3>
        </div>
        {selectedItem && (
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${TYPE_META[selectedItem.type].color}`}>
              {TYPE_META[selectedItem.type].label}
            </span>
            {onDeselect && (
              <button
                onClick={onDeselect}
                title="선택 해제 (Esc)"
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="p-4">
        {renderContent()}
      </div>
    </div>
  );
};

interface SubtitleSettingsProps {
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  subtitlePresets: Record<string, SubtitlePreset>;
  showSceneCaptions: boolean;
  setShowSceneCaptions: (v: boolean) => void;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
}

const CaptionStyleSettings: React.FC<{
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
}> = ({ captionStyle, setCaptionStyle }) => (
  <div className="space-y-3 rounded-xl border border-amber-200/60 bg-amber-50/40 p-3">
    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest" title="Caption Animation">등장 효과</label>
      <div className="grid grid-cols-3 gap-2">
        {ANIM_OPTIONS.map((o) => {
          const cur = captionStyle.animation ?? 'none';
          return (
            <button
              key={o.id}
              onClick={() => setCaptionStyle({ ...captionStyle, animation: o.id })}
              title={`${o.label} 효과 적용`}
              className={`py-1.5 text-[10px] font-black rounded-xl border transition-all ${
                cur === o.id
                  ? 'bg-amber-500 border-amber-500 text-white shadow'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Caption Font Size">
        Caption Size
        <span className="text-amber-600">{captionStyle.font_size}px</span>
      </label>
      <input
        title="Caption Font Size"
        placeholder="Caption Font Size"
        type="range"
        min="8"
        max="40"
        value={captionStyle.font_size}
        onChange={(e) => setCaptionStyle({ ...captionStyle, font_size: parseInt(e.target.value) })}
        className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-amber-500"
      />
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Caption Y Position">
        Caption Y
        <span className="text-amber-600">{captionStyle.y_offset}%</span>
      </label>
      <input
        title="Caption Y Position"
        placeholder="Caption Y Position"
        type="range"
        min="0"
        max="40"
        value={captionStyle.y_offset}
        onChange={(e) => setCaptionStyle({ ...captionStyle, y_offset: parseInt(e.target.value) })}
        className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-amber-500"
      />
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Caption Text Color">Caption Color</label>
      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-zinc-200">
        <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-300 shadow-sm shrink-0">
          <input
            title="Caption Text Color"
            placeholder="Caption Text Color"
            type="color"
            value={captionStyle.color}
            onChange={(e) => setCaptionStyle({ ...captionStyle, color: e.target.value })}
            className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
          />
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{captionStyle.color}</span>
          <p className="text-[8px] text-zinc-500 font-bold uppercase mt-0.5">Hex Code</p>
        </div>
      </div>
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Caption Background">
        Caption BG
        <button
          onClick={() => setCaptionStyle({ ...captionStyle, bg_color: captionStyle.bg_color === 'transparent' ? 'rgba(0,0,0,0.45)' : 'transparent' })}
          className="text-amber-600 hover:text-amber-700"
          title="배경 투명 전환"
        >
          {captionStyle.bg_color === 'transparent' ? '투명 → 배경켬' : '배경끔'}
        </button>
      </label>
      {captionStyle.bg_color !== 'transparent' && (
        <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-zinc-200">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-300 shadow-sm shrink-0">
            <input
              title="Caption Background Color"
              placeholder="Caption Background Color"
              type="color"
              value={(captionStyle.bg_color || '').startsWith('#') ? captionStyle.bg_color as string : '#000000'}
              onChange={(e) => setCaptionStyle({ ...captionStyle, bg_color: e.target.value })}
              className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
            />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{captionStyle.bg_color}</span>
            <p className="text-[8px] text-zinc-500 font-bold uppercase mt-0.5">Hex Code</p>
          </div>
        </div>
      )}
    </div>
  </div>
);

const SUBTITLE_FONTS = [
  'Noto Sans KR',
  'Pretendard',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'Black Han Sans',
  'Arial',
  'sans-serif',
];

const SUBTITLE_POSITIONS: Array<{ id: string; label: string; y: number }> = [
  { id: 'top', label: '상단', y: 12 },
  { id: 'middle', label: '중앙', y: 50 },
  { id: 'bottom', label: '하단', y: 85 },
];

const SubtitleSettings: React.FC<SubtitleSettingsProps> = ({ subtitleStyle, setSubtitleStyle, subtitlePresets, showSceneCaptions, setShowSceneCaptions, captionStyle, setCaptionStyle }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between bg-amber-50/60 border border-amber-200/60 rounded-xl px-3 py-2.5">
      <div>
        <p className="text-[10px] font-black text-zinc-700">씬 자막 밴드</p>
        <p className="text-[9px] text-zinc-500 font-bold">Step2 씬 subtitle을 상단에 별도 표시</p>
      </div>
      <button
        onClick={() => setShowSceneCaptions(!showSceneCaptions)}
        title="씬 자막 표시 전환"
        className={`relative w-9 h-5 rounded-full transition-all shrink-0 ${showSceneCaptions ? 'bg-amber-500' : 'bg-zinc-300'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showSceneCaptions ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
    {showSceneCaptions && (
      <CaptionStyleSettings captionStyle={captionStyle} setCaptionStyle={setCaptionStyle} />
    )}
    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest" title="Subtitle Presets">자막 스타일</label>
      <SubtitlePresetSelect
        value={subtitleStyle.preset}
        onChange={(id) => {
          const preset = (subtitlePresets as Record<string, Partial<typeof subtitleStyle>>)[id];
          if (preset) setSubtitleStyle({ ...subtitleStyle, preset: id, ...preset });
        }}
      />
      <p className="text-[9px] text-zinc-400 leading-relaxed">
        글자 크기·위치 조정은 &lsquo;제작 설정 &gt; 자막&rdquo;에서 합니다.
      </p>
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Font Size">
        크기
        <span className="text-indigo-500">{subtitleStyle.font_size}px</span>
      </label>
      <input
        title="Font Size"
        placeholder="Font Size"
        type="range"
        min="10"
        max="100"
        value={subtitleStyle.font_size}
        onChange={(e) => setSubtitleStyle({ ...subtitleStyle, font_size: parseInt(e.target.value) })}
        className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
      />
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Text Color">글자색</label>
      <div className="flex items-center gap-2.5 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
        <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-300 shadow-sm shrink-0">
          <input
            title="Text Color"
            placeholder="Text Color"
            type="color"
            value={subtitleStyle.color}
            onChange={(e) => setSubtitleStyle({ ...subtitleStyle, color: e.target.value })}
            className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
          />
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{subtitleStyle.color}</span>
        </div>
      </div>
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest" title="Position Preset">위치 (드래그로도 이동 가능)</label>
      <div className="grid grid-cols-3 gap-2">
        {SUBTITLE_POSITIONS.map((p) => {
          const active = Math.abs(subtitleStyle.y_offset - p.y) < 4;
          return (
            <button
              key={p.id}
              onClick={() => setSubtitleStyle({ ...subtitleStyle, position: p.id, y_offset: p.y })}
              title={`${p.label} (y ${p.y}%)`}
              className={`py-2 text-[10px] font-black rounded-xl border transition-all ${
                active
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>

    <details className="rounded-xl border border-zinc-200 bg-zinc-50/50 overflow-hidden">
      <summary className="px-3 py-2.5 text-[10px] font-black text-zinc-600 uppercase tracking-widest cursor-pointer hover:text-indigo-600 select-none">
        고급 설정 (폰트·정렬·외곽선·배경·미세 위치)
      </summary>
      <div className="px-3 pb-3 space-y-4">
    <div className="space-y-2">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest" title="Font Family">폰트</label>
      <select
        value={subtitleStyle.font}
        onChange={(e) => setSubtitleStyle({ ...subtitleStyle, font: e.target.value })}
        title="자막 폰트"
        className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-white outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {SUBTITLE_FONTS.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
    </div>

    <div className="space-y-2">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest" title="Text Align">정렬</label>
      <div className="grid grid-cols-3 gap-2">
        {[
          { id: 'left', label: '왼쪽' },
          { id: 'center', label: '가운데' },
          { id: 'right', label: '오른쪽' },
        ].map((a) => {
          const cur = (subtitleStyle.text_align ?? 'center');
          return (
            <button
              key={a.id}
              onClick={() => setSubtitleStyle({ ...subtitleStyle, text_align: a.id })}
              className={`py-2 text-[10px] font-black rounded-xl border transition-all ${
                cur === a.id
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>
    </div>

    <div className="space-y-2">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Y-Offset fine tune">
        세로 미세 조정
        <span className="text-indigo-500">{subtitleStyle.y_offset}%</span>
      </label>
      <input
        title="Y-Offset 미세 조정"
        placeholder="Y-Offset"
        type="range"
        min="0"
        max="100"
        value={subtitleStyle.y_offset}
        onChange={(e) => setSubtitleStyle({ ...subtitleStyle, y_offset: parseInt(e.target.value) })}
        className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
      />
    </div>

    <div className="space-y-2">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Stroke">
        외곽선
        <span className="text-indigo-500">{subtitleStyle.stroke_width}px</span>
      </label>
      <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-zinc-200">
        <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-300 shadow-sm shrink-0">
          <input
            title="Stroke Color"
            placeholder="Stroke Color"
            type="color"
            value={subtitleStyle.stroke_color === 'transparent' ? '#000000' : subtitleStyle.stroke_color}
            onChange={(e) => setSubtitleStyle({ ...subtitleStyle, stroke_color: e.target.value })}
            className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
          />
        </div>
        <input
          title="Stroke Width"
          placeholder="Stroke Width"
          type="range"
          min="0"
          max="5"
          step="0.5"
          value={subtitleStyle.stroke_width}
          onChange={(e) => setSubtitleStyle({ ...subtitleStyle, stroke_width: parseFloat(e.target.value) })}
          className="flex-1 h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
        />
      </div>
    </div>

    <div className="space-y-2">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Background">
        배경 박스
        <button
          onClick={() => setSubtitleStyle({ ...subtitleStyle, bg_color: subtitleStyle.bg_color === 'transparent' ? 'rgba(0,0,0,0.7)' : 'transparent' })}
          className="text-indigo-600 hover:text-indigo-700"
          title="배경 투명 전환"
        >
          {subtitleStyle.bg_color === 'transparent' ? '배경 켜기' : '투명하게'}
        </button>
      </label>
      {subtitleStyle.bg_color !== 'transparent' && (
        <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-zinc-200">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-300 shadow-sm shrink-0">
            <input
              title="Background Color"
              placeholder="Background Color"
              type="color"
              value={(subtitleStyle.bg_color || '').startsWith('#') ? subtitleStyle.bg_color as string : '#000000'}
              onChange={(e) => setSubtitleStyle({ ...subtitleStyle, bg_color: e.target.value })}
              className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] cursor-pointer border-none p-0 bg-transparent"
            />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{subtitleStyle.bg_color}</span>
            <p className="text-[8px] text-zinc-500 font-bold uppercase mt-0.5">최종 렌더에도 반영됨</p>
          </div>
        </div>
      )}
    </div>
      </div>
    </details>
  </div>
);

export default PropertiesPanel;
