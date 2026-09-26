import React from 'react';
import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { subtitlePresets } from '../constants/data';

export interface SubtitlePresetDef {
  label: string;
  font_size: number;
  color: string;
  stroke_color: string;
  stroke_width: number;
  bg_color: string;
  font?: string;
  animation?: string;
}

/** 프리셋을 웹 미리보기용 인라인 스타일로 변환 (외곽선은 가독성을 위해 축소) */
export function subtitlePreviewStyle(preset: SubtitlePresetDef): CSSProperties {
  const hasStroke = preset.stroke_width > 0 && preset.stroke_color !== 'transparent';
  const hasBg = preset.bg_color !== 'transparent';
  return {
    color: preset.color,
    fontSize: 13,
    fontWeight: 800,
    fontFamily: preset.font,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    wordBreak: 'keep-all',
    ...(hasStroke
      ? { WebkitTextStroke: `${Math.min(preset.stroke_width, 1)}px ${preset.stroke_color}` }
      : { textShadow: '0 1px 3px rgba(0,0,0,0.8)' }),
    ...(hasBg
      ? { backgroundColor: preset.bg_color, padding: '3px 12px', borderRadius: 9999 }
      : {}),
  };
}

interface SubtitlePresetSelectProps {
  value: string;
  onChange: (id: string) => void;
}

const PresetRowView: React.FC<{
  preset: SubtitlePresetDef;
  active: boolean;
}> = ({ preset, active }) => (
  <div
    className={`w-full flex items-center gap-3 px-2.5 py-1.5 rounded-xl border transition-all text-left ${
      active
        ? 'bg-indigo-50/60 border-indigo-500 ring-1 ring-indigo-500/30'
        : 'bg-white border-gray-200'
    }`}
  >
    <span className={`w-14 shrink-0 text-xs font-black ${active ? 'text-indigo-700' : 'text-gray-500'}`}>
      {preset.label}
    </span>
    <span className="flex-1 flex items-center justify-center h-9 rounded-lg bg-zinc-900 overflow-hidden px-2">
      <span style={subtitlePreviewStyle(preset)}>자막 미리보기</span>
    </span>
  </div>
);

const PresetRow: React.FC<{
  preset: SubtitlePresetDef;
  active: boolean;
  onPick: () => void;
}> = ({ preset, active, onPick }) => (
  <button
    onClick={onPick}
    title={`${preset.label} 스타일 적용`}
    className="w-full text-left hover:[&>div]:border-indigo-300"
  >
    <PresetRowView preset={preset} active={active} />
  </button>
);

/** 드롭다운형 자막 프리셋 셀렉터. 닫힌 상태는 현재 선택 1행 + 목록은 펼쳐서 선택 */
const SubtitlePresetSelect: React.FC<SubtitlePresetSelectProps> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const entries = Object.entries(subtitlePresets) as Array<[string, SubtitlePresetDef]>;
  const current = (subtitlePresets as Record<string, SubtitlePresetDef>)[value] ?? entries[0][1];

  return (
    <div className="relative">
      <div
        onClick={() => setOpen(!open)}
        title="자막 템플릿 선택"
        className="w-full rounded-xl border border-gray-200 bg-white p-1 hover:border-indigo-300 transition-all cursor-pointer"
      >
        <PresetRowView preset={current} active={false} />
        <ChevronDown
          size={14}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open && (
        <>
          <button
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0"
          />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-gray-200 bg-white shadow-xl p-1.5 space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar">
            {entries.map(([id, preset]) => (
              <PresetRow
                key={id}
                preset={preset}
                active={value === id}
                onPick={() => {
                  onChange(id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(SubtitlePresetSelect);
