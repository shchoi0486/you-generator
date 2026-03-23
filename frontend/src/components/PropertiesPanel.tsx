import React from 'react';
import { type AppContent } from '../services/api';
import { 
  Type, 
  Music, 
  Volume2, 
  Settings2,
  Trash2,
  ChevronDown,
  RefreshCw
} from 'lucide-react';

type SelectedItemType = 'subtitle' | 'scene' | 'sfx' | 'bgm';
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
  [key: string]: string | number | boolean | undefined;
};
type SfxItem = { path: string; time: number; volume: number };
type AudioEditState = { bgm_path: string | null; bgm_volume: number; sfx_list: SfxItem[] };
type SrtItem = { id: number; start: number; end: number; text: string };
interface PropertiesPanelProps {
  selectedItem: SelectedItem;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  audioEdit: AudioEditState;
  setAudioEdit: React.Dispatch<React.SetStateAction<AudioEditState>>;
  onDelete: (id: string | number, type: 'subtitle' | 'sfx' | 'bgm') => void;
  subtitlePresets: Record<string, SubtitlePreset>;
  srtData: SrtItem[];
  setSrtData: React.Dispatch<React.SetStateAction<SrtItem[]>>;
  content: AppContent | null;
  setContent: React.Dispatch<React.SetStateAction<AppContent | null>>;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedItem,
  subtitleStyle,
  setSubtitleStyle,
  audioEdit,
  setAudioEdit,
  onDelete,
  subtitlePresets,
  srtData,
  setSrtData,
  content,
  setContent
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
        <div className="p-5 space-y-8">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-[11px] font-black text-zinc-700">타임라인에서 트랙 아이템을 선택하세요</p>
            <p className="text-[10px] text-zinc-500 mt-1">선택한 자막, 장면, 오디오의 속성이 여기 표시됩니다.</p>
          </div>
          <SubtitleSettings 
            subtitleStyle={subtitleStyle} 
            setSubtitleStyle={setSubtitleStyle} 
            subtitlePresets={subtitlePresets}
          />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (selectedItem.type) {
      case 'subtitle': {
        const item = srtData.find((s) => s.id === selectedItem.id);
        return (
          <div className="space-y-8">
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
                  
                  // Sync back to content.script if it exists
                  if (content?.script) {
                    const srtIdx = srtData.findIndex(s => s.id === selectedItem.id);
                    if (srtIdx !== -1 && content.script[srtIdx]) {
                      setContent(prev => {
                        if (!prev) return prev;
                        const newScript = [...prev.script];
                        newScript[srtIdx] = { ...newScript[srtIdx], text: newText };
                        return { ...prev, script: newScript };
                      });
                    }
                  }
                }}
                className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none h-32 text-zinc-700 placeholder:text-zinc-400"
                placeholder="Enter subtitle text..."
              />
            </div>
            
            <SubtitleSettings 
              subtitleStyle={subtitleStyle} 
              setSubtitleStyle={setSubtitleStyle} 
              subtitlePresets={subtitlePresets}
            />

            <button
              onClick={() => onDelete(selectedItem.id, 'subtitle')}
              className="w-full py-4 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500/80 hover:text-rose-500 rounded-2xl text-[10px] font-black flex items-center justify-center gap-3 transition-all border border-rose-500/10 hover:border-rose-500/30 group"
              title="Remove Subtitle"
            >
              <Trash2 size={14} className="group-hover:rotate-12 transition-transform" /> REMOVE SUBTITLE
            </button>
          </div>
        );
      }

      case 'scene': {
        const sceneIdx = typeof selectedItem.id === 'string' ? parseInt(selectedItem.id.split('-')[1]) : (selectedItem.id as number);
        const scene = content?.scenes?.[sceneIdx];
        const editorState: Record<string, unknown> = scene?.editor && typeof scene.editor === 'object' ? scene.editor as Record<string, unknown> : {};
        const scale = typeof editorState.scale === 'number' ? editorState.scale : 100;
        const posX = typeof editorState.posX === 'number' ? editorState.posX : 0;
        const posY = typeof editorState.posY === 'number' ? editorState.posY : 0;
        const rotation = typeof editorState.rotation === 'number' ? editorState.rotation : 0;
        const opacity = typeof editorState.opacity === 'number' ? editorState.opacity : 100;
        const blendMode = typeof editorState.blendMode === 'string' ? editorState.blendMode : 'normal';

        const updateSceneEditor = (patch: Record<string, number | string>) => {
          setContent((prev) => {
            if (!prev?.scenes || !Array.isArray(prev.scenes) || !prev.scenes[sceneIdx]) return prev;
            const nextScenes = [...prev.scenes];
            const currentScene = nextScenes[sceneIdx];
            const currentEditor = currentScene?.editor && typeof currentScene.editor === 'object' ? currentScene.editor : {};
            nextScenes[sceneIdx] = {
              ...currentScene,
              editor: {
                ...currentEditor,
                ...patch
              }
            };
            return { ...prev, scenes: nextScenes };
          });
        };

        return (
          <div className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                <div className="text-base font-semibold text-zinc-900">Content</div>
                <ChevronDown size={16} className="text-zinc-500" />
              </div>
              <div className="p-4">
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
                  <p className="text-sm font-black text-zinc-700">Scene {sceneIdx + 1}</p>
                  <p className="text-[11px] text-zinc-600 leading-relaxed wrap-break-word">
                    {content?.script?.[sceneIdx]?.text || '선택된 장면의 스크립트가 없습니다.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                <div className="text-base font-semibold text-zinc-900">Transform</div>
                <ChevronDown size={16} className="text-zinc-500" />
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500" title="Scale">Scale</label>
                  <input
                    type="number"
                    value={scale}
                    onChange={(e) => updateSceneEditor({ scale: Number(e.target.value) })}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                    title="Scale"
                    placeholder="Scale"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500" title="Position">Position</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={posX}
                      onChange={(e) => updateSceneEditor({ posX: Number(e.target.value) })}
                      title="X-Offset"
                      className="h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="X"
                    />
                    <input
                      type="number"
                      value={posY}
                      onChange={(e) => updateSceneEditor({ posY: Number(e.target.value) })}
                      title="Y-Offset"
                      className="h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Y"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500" title="Rotation">Rotation</label>
                  <input
                    type="number"
                    value={rotation}
                    onChange={(e) => updateSceneEditor({ rotation: Number(e.target.value) })}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                    title="Rotation"
                    placeholder="Rotation"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                <div className="text-base font-semibold text-zinc-900">Blending</div>
                <ChevronDown size={16} className="text-zinc-500" />
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500" title="Opacity">Opacity</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={opacity}
                    onChange={(e) => updateSceneEditor({ opacity: Number(e.target.value) })}
                    title="Opacity"
                    placeholder="Opacity"
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500" title="Blend mode">Blend mode</label>
                  <select
                    value={blendMode}
                    onChange={(e) => updateSceneEditor({ blendMode: e.target.value })}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-800 bg-zinc-50 outline-none focus:ring-1 focus:ring-indigo-500"
                    title="Blend mode"
                  >
                    <option value="normal">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'sfx': {
        const sfxIdx = typeof selectedItem.id === 'string' ? parseInt(selectedItem.id.split('-')[1]) : (selectedItem.id as number);
        const sfx = audioEdit.sfx_list[sfxIdx];
        return (
          <div className="space-y-8">
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
              className="w-full py-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 transition-all border border-rose-500/20 group"
              title="Remove Sound Effect"
            >
              <Trash2 size={14} className="group-hover:rotate-12 transition-transform" /> REMOVE SFX
            </button>
          </div>
        );
      }

      case 'bgm': {
        return (
          <div className="space-y-8">
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
              className="w-full py-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-black flex items-center justify-center gap-2 transition-all border border-rose-500/20 group"
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
}

const SubtitleSettings: React.FC<SubtitleSettingsProps> = ({ subtitleStyle, setSubtitleStyle, subtitlePresets }) => (
  <div className="space-y-6">
    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest" title="Subtitle Presets">Subtitle Presets</label>
      <div className="grid grid-cols-2 gap-2.5">
        {Object.entries(subtitlePresets).map(([id, preset]) => (
          <button
            key={id}
            onClick={() => setSubtitleStyle({ ...subtitleStyle, preset: id, ...preset })}
            className={`p-2.5 text-[9px] font-black rounded-xl border transition-all ${
              subtitleStyle.preset === id 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-400/50' 
                : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-800'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Y-Offset">
        Y-Offset
        <span className="text-indigo-500">{subtitleStyle.y_offset}%</span>
      </label>
      <input  
        title="Y-Offset"
        placeholder="Y-Offset"
        type="range" 
        min="0" 
        max="100" 
        value={subtitleStyle.y_offset}
        onChange={(e) => setSubtitleStyle({ ...subtitleStyle, y_offset: parseInt(e.target.value) })}
        className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
      />
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="X-Offset">
        X-Offset
        <span className="text-indigo-500">{subtitleStyle.x_offset || 0}%</span>
      </label>
      <input  
        title="X-Offset"
        placeholder="X-Offset"
        type="range" 
        min="0" 
        max="100" 
        value={subtitleStyle.x_offset || 0}
        onChange={(e) => setSubtitleStyle({ ...subtitleStyle, x_offset: parseInt(e.target.value) })}
        className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-indigo-600"
      />
    </div>

    <div className="space-y-3">
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Font Size">
        Font Size
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
      <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex justify-between" title="Text Color">Text Color</label>
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
          <p className="text-[8px] text-zinc-500 font-bold uppercase mt-0.5">Hex Code</p>
        </div>
      </div>
    </div>
  </div>
);

export default PropertiesPanel;
