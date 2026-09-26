import React from 'react';
import { 
  Mic, 
  ChevronLeft, 
  Zap, 
  Play, 
  ArrowRight, 
  Settings, 
  RefreshCw,
  FileText
} from 'lucide-react';
import { type ScriptItem, type AppContent } from '../services/api';

interface Step3VoiceProps {
  content: AppContent | null;
  voiceMap: Record<string, string>;
  setVoiceMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  voiceSettings: Record<string, { rate: string, pitch: string }>;
  setVoiceSettings: React.Dispatch<React.SetStateAction<Record<string, { rate: string, pitch: string }>>>;
  selectedEngine: 'openai' | 'azure' | 'edge' | 'qwen' | 'minimax' | 'elevenlabs' | 'typecast';
  setSelectedEngine: (engine: 'openai' | 'azure' | 'edge' | 'qwen' | 'minimax' | 'elevenlabs' | 'typecast') => void;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
  gapDuration: number;
  setGapDuration: (duration: number) => void;
  handleGenerateTTS: () => void;
  playAllPreview: () => void;
  isPlayAllPreview: boolean;
  audio: { url: string } | null;
  setAudio: (audio: { url: string } | null) => void;
  setCurrentStep: (step: number) => void;
  loading: boolean;
  isPreviewLoading: string | null;
  playingSpeaker: string | null;
  playingSegmentIndex: number | null;
  playVoiceSample: (speaker: string, voice: string, customText?: string) => void;
  getTimelineRange: (data: ScriptItem[] | undefined, currentIdx: number) => { start: string, end: string, duration: string };
  languages: Array<{ label: string, value: string }>;
  voiceOptions: Record<'openai' | 'azure' | 'edge' | 'qwen' | 'minimax' | 'elevenlabs' | 'typecast', { label: string, value: string, lang?: string }[]>;
  filteredVoices: { label: string, value: string, lang?: string }[];
  isStale?: boolean;
}

const Step3Voice: React.FC<Step3VoiceProps> = ({
  content,
  voiceMap,
  setVoiceMap,
  voiceSettings,
  setVoiceSettings,
  selectedEngine,
  setSelectedEngine,
  selectedLanguage,
  setSelectedLanguage,
  gapDuration,
  setGapDuration,
  handleGenerateTTS,
  playAllPreview,
  isPlayAllPreview,
  audio,
  setAudio,
  setCurrentStep,
  loading,
  isPreviewLoading,
  playingSpeaker,
  playingSegmentIndex,
  playVoiceSample,
  getTimelineRange,
  languages,
  voiceOptions,
  filteredVoices,
  isStale = false
}) => {
  // 대본이 바뀌어 음성/자막이 어긋나면 다음 단계 버튼이 재생성을 겸함.
  // 경고 배너 없이 버튼 하나로 처리 (재생성 후 handleGenerateTTS가 Step4로 이동).
  const needsGen = !audio?.url || isStale;
  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Mic size={18} />
          </div>
          <h2 className="text-lg font-bold text-gray-900">음성 생성 및 설정</h2>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentStep(2)}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1.5 text-[10px] font-bold transition-colors whitespace-nowrap"
          >
            <ChevronLeft size={14} />
            대본 수정
          </button>
          
          <div className="h-4 w-px bg-gray-200 mx-1"></div>
          
          <button 
            onClick={handleGenerateTTS}
            disabled={loading}
            className="text-indigo-600 hover:text-indigo-700 disabled:text-gray-300 flex items-center gap-1.5 text-[10px] font-bold transition-all whitespace-nowrap"
          >
            <Zap size={14} className={loading ? 'animate-pulse' : ''} />
            전체 음성 생성
          </button>

          <button 
            onClick={playAllPreview}
            disabled={loading}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border whitespace-nowrap ${
              isPlayAllPreview 
              ? 'bg-red-50 border-red-200 text-red-600 shadow-sm' 
              : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-200 hover:text-indigo-600'
            }`}
          >
            {isPlayAllPreview ? (
              <div className="flex gap-0.5 items-end h-3">
                <div className="w-0.5 bg-red-500 animate-bounce h-full"></div>
                <div className="w-0.5 bg-red-500 animate-bounce h-2/3 delay-200"></div>
              </div>
            ) : (
              <Play size={14} fill="currentColor" />
            )}
            {isPlayAllPreview ? '미리듣기 중지' : '전체 미리듣기'}
          </button>

          <div className="h-4 w-px bg-gray-200 mx-1"></div>

          <button
            onClick={() => {
              if (needsGen) {
                handleGenerateTTS();
              } else {
                setCurrentStep(4);
              }
            }}
            disabled={loading}
            title={needsGen ? '현재 대본으로 음성을 생성하고 다음 단계로 이동' : '다음 단계로 이동'}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100"
          >
            {needsGen ? '음성 생성 및 이동' : '시각화 단계로 이동'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Column: Voice Settings (4 columns) */}
        <div className="lg:col-span-4 flex flex-col min-h-0">
          <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col h-full min-h-0">
            <div className="flex flex-col gap-2.5 shrink-0 mb-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Settings size={13} className="text-indigo-600" />
                  엔진 및 언어
                </h3>
                <div className="flex bg-gray-100 p-0.5 rounded-lg gap-0.5">
                  {languages.map((lang) => (
                    <button
                      key={lang.value}
                      onClick={() => setSelectedLanguage(lang.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-black transition-all ${
                        selectedLanguage === lang.value 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

                <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'edge', label: 'Edge' },
                  { id: 'qwen', label: 'Qwen' },
                  { id: 'openai', label: 'OpenAI' },
                  { id: 'azure', label: 'Azure' },
                  { id: 'minimax', label: 'MiniMax' },
                  { id: 'elevenlabs', label: 'ElevenLabs' },
                  { id: 'typecast', label: 'Typecast' }
                ].map((engine) => (
                  <button
                    key={engine.id}
                    onClick={() => {
                      const newEngine = engine.id as 'openai' | 'azure' | 'edge' | 'qwen' | 'minimax' | 'elevenlabs' | 'typecast';
                      setSelectedEngine(newEngine);
                      
                      const newVoiceMap = { ...voiceMap };
                      const currentSpeakers = content?.script 
                        ? Array.from(new Set(content.script.map((s: { speaker: string }) => s.speaker))) as string[]
                        : Object.keys(voiceMap);

                      currentSpeakers.forEach(speaker => {
                        if (newEngine === 'qwen') {
                          if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "ryan";
                          else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "sohee";
                          else newVoiceMap[speaker] = "sohee";
                        } else if (newEngine === 'edge') {
                          if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "ko-KR-InJoonNeural";
                          else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "ko-KR-HyunsuMultilingualNeural";
                          else newVoiceMap[speaker] = "ko-KR-SunHiNeural";
                        } else if (newEngine === 'azure') {
                          if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj') || speaker.includes('진우')) newVoiceMap[speaker] = "ko-KR-JinwooNeural";
                          else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "ko-KR-HyejinNeural";
                          else newVoiceMap[speaker] = "ko-KR-SunHiNeural";
                        } else if (newEngine === 'openai') {
                          if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "echo";
                          else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "nova";
                          else newVoiceMap[speaker] = "alloy";
                        } else if (newEngine === 'minimax') {
                          if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "male-qn-qingse";
                          else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "female-shaonv";
                          else newVoiceMap[speaker] = "female-shaonv";
                        } else if (newEngine === 'elevenlabs') {
                          if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "pNInz6obpgDQGcFmaJgB";
                          else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "21m00Tcm4TlvDq8ikWAM";
                          else newVoiceMap[speaker] = "21m00Tcm4TlvDq8ikWAM";
                        } else if (newEngine === 'typecast') {
                          const list = voiceOptions[newEngine as keyof typeof voiceOptions].filter(v => !v.lang || v.lang === selectedLanguage);
                          newVoiceMap[speaker] = (list.length > 0 ? list[0] : voiceOptions[newEngine as keyof typeof voiceOptions][0])?.value || "";
                        } else {
                          const available = voiceOptions[newEngine as keyof typeof voiceOptions].filter(v => !v.lang || v.lang === selectedLanguage);
                          newVoiceMap[speaker] = (available.length > 0 ? available[0] : voiceOptions[newEngine as keyof typeof voiceOptions][0]).value;
                        }
                      });
                      setVoiceMap(newVoiceMap);
                      setAudio(null); // 엔진 변경 시 오디오 초기화
                    }}
                    className={`px-2 py-1.5 rounded-lg text-[12px] font-bold transition-all border ${
                      selectedEngine === engine.id 
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm' 
                      : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {engine.label}
                  </button>
                ))}
              </div>
              {selectedEngine === 'typecast' && filteredVoices.length === 0 && (
                <p className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  설정에서 Typecast API 키를 입력하면 목소리 목록을 불러옵니다.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2.5 pb-10">
              {(() => {
                const speakers = content?.script 
                  ? Array.from(new Set(content.script.map((s: { speaker: string }) => s.speaker))) as string[]
                  : Object.keys(voiceMap);
                
                return speakers.map((speaker: string) => {
                  const currentVoice = voiceMap[speaker] || filteredVoices[0]?.value || voiceOptions[selectedEngine][0]?.value || '';
                  
                  return (
                    <div key={speaker} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-gray-700 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                          {speaker}
                        </label>
                        <button 
                          onClick={() => playVoiceSample(speaker, currentVoice)}
                          disabled={isPreviewLoading === speaker}
                          className={`flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded-md transition-all ${
                            isPreviewLoading === speaker
                            ? 'bg-gray-200 text-gray-400'
                            : playingSpeaker === speaker
                            ? 'bg-red-50 text-red-600'
                            : 'bg-white border border-gray-200 text-indigo-600 hover:border-indigo-200'
                          }`}
                        >
                          {isPreviewLoading === speaker ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : playingSpeaker === speaker ? (
                            <div className="flex gap-0.5 items-end h-2.5">
                              <div className="w-0.5 bg-red-500 animate-bounce h-full"></div>
                              <div className="w-0.5 bg-red-500 animate-bounce h-2/3 delay-200"></div>
div                            </div>
                          ) : (
                            <Play size={10} fill="currentColor" />
                          )}
                          {playingSpeaker === speaker ? '정지' : '샘플'}
                        </button>
                      </div>

                      <select 
                        aria-label={`${speaker} 목소리 선택`}
                        value={currentVoice}
                        onChange={(e) => {
                          setVoiceMap(prev => ({ ...prev, [speaker]: e.target.value }));
                          setAudio(null); // 목소리 변경 시 오디오 초기화
                        }}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                      >
                        {filteredVoices.length > 0 ? (
                          filteredVoices.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))
                        ) : (
                          <option disabled>목소리 없음</option>
                        )}
                      </select>

                      <div className="grid grid-cols-2 gap-3 pt-0.5">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                            <span>속도</span>
                            <span className="text-indigo-600 font-bold">{(voiceSettings[speaker]?.rate || '+0%').replace('+', '')}</span>
                          </div>
                          <input 
                            aria-label={`${speaker} 속도 조절`}
                            type="range" min="-50" max="50" step="5"
                            value={parseInt((voiceSettings[speaker]?.rate || '+0%').replace('%', ''))}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const rateStr = val >= 0 ? `+${val}%` : `${val}%`;
                              setVoiceSettings(prev => ({
                                ...prev,
                                [speaker]: { ...(prev[speaker] || { pitch: '+0Hz' }), rate: rateStr }
                              }));
                            }}
                            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                            <span>텐션</span>
                            <span className="text-indigo-600 font-bold">{(voiceSettings[speaker]?.pitch || '+0Hz').replace('+', '')}</span>
                          </div>
                          <input 
                            aria-label={`${speaker} 텐션 조절`}
                            type="range" min="-20" max="20" step="1"
                            value={parseInt((voiceSettings[speaker]?.pitch || '+0Hz').replace('Hz', ''))}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const pitchStr = val >= 0 ? `+${val}Hz` : `${val}Hz`;
                              setVoiceSettings(prev => ({
                                ...prev,
                                [speaker]: { ...(prev[speaker] || { rate: '+0%' }), pitch: pitchStr }
                              }));
                            }}
                            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Right Column: Script Preview & Generation (8 columns) */}
        <div className="lg:col-span-8 flex flex-col min-h-0 h-full relative">
          {content?.script ? (
            <div className="bg-white rounded-2xl border border-gray-100 flex flex-col h-full min-h-0 shadow-sm overflow-hidden">
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <FileText size={14} className="text-indigo-600" />
                  대본 구간별 미리듣기
                  {content?.script && (
                    <span className="ml-2 text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                      전체: {getTimelineRange(content.script, content.script.length - 1).end}s
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter" aria-label="간격 조절">간격</span>
                    <input 
                      aria-label="간격 조절"
                      type="range" min="0" max="3" step="0.1" 
                      value={gapDuration} 
                      onChange={(e) => setGapDuration(parseFloat(e.target.value))}
                      className="w-12 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-[10px] font-bold text-indigo-600 w-4">{gapDuration}s</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1 min-h-0 bg-gray-50/20 pb-10">
                {((Array.isArray(content.script) ? content.script : Object.values(content.script)) as ScriptItem[]).map((item: ScriptItem, idx: number) => {
                  const speaker = item.speaker || 'Narrator';
                  const voiceValue = voiceMap[speaker] || filteredVoices[0]?.value || voiceOptions[selectedEngine][0]?.value || '';
                  const isSegmentPlaying = playingSpeaker === `segment-${item.text.substring(0, 10)}` || playingSegmentIndex === idx;
                  const isSegmentLoading = isPreviewLoading === `segment-${item.text.substring(0, 10)}`;
                  
                  return (
                    <div key={idx} className={`flex items-start gap-2 p-1.5 px-2.5 border rounded-lg transition-all group ${
                      isSegmentPlaying 
                      ? 'bg-white border-indigo-200 shadow-sm' 
                      : 'bg-white/50 border-gray-100 hover:bg-white hover:border-gray-200'
                    }`}>
                      <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                        <span className="text-[9px] font-black text-gray-300 tabular-nums">{(idx + 1).toString().padStart(2, '0')}</span>
                        <button 
                          onClick={() => playVoiceSample(speaker, voiceValue, item.text)}
                          disabled={isSegmentLoading}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                            isSegmentLoading
                            ? 'bg-gray-100 text-gray-400'
                            : isSegmentPlaying
                            ? 'bg-red-50 text-red-600'
                            : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
                          }`}
                        >
                          {isSegmentLoading ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : isSegmentPlaying ? (
                            <div className="flex gap-0.5 items-end h-2.5">
                              <div className="w-0.5 bg-red-500 animate-bounce h-full"></div>
                              <div className="w-0.5 bg-red-500 animate-bounce h-2/3 delay-200"></div>  
div                            </div>
                          ) : (
                            <Play size={12} fill="currentColor" />
                          )}
                        </button>
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter ${
                            speaker.includes('이슈왕') ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            {speaker}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                            {getTimelineRange(content.script, idx).start}s - {getTimelineRange(content.script, idx).end}s
                          </span>
                        </div>
                        <p className={`text-[12px] leading-relaxed font-medium transition-colors ${isSegmentPlaying ? 'text-gray-900' : 'text-gray-600'}`}>
                          {item.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
                <FileText size={32} />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">대본이 없습니다</h3>
              <p className="text-xs text-gray-400">이전 단계에서 대본을 먼저 생성해 주세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(Step3Voice);
