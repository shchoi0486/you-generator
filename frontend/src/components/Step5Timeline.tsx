import React from 'react';
import { type AppContent, type SceneCandidates, type ScriptItem, type SceneLayout, type CaptionStyle } from '../services/api';
import VideoEditor from './VideoEditor';

interface Step5TimelineProps {
  currentStep: number;
  setCurrentStep: (step: number) => void;
  content: AppContent | null;
  setContent: React.Dispatch<React.SetStateAction<AppContent | null>>;
  loading: boolean;
  handleFinalRender: () => void;
  currentTime: number;
  videoDuration: number;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  sceneDurations: number[];
  calculateDuration: (text: string) => number;
  gapDuration: number;
  selectedVisuals: Record<number, string[]>;
  setSelectedVisuals: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  clipTrims: Record<number, Record<string, { in: number; out: number | null }>>;
  sceneLayouts: Record<number, SceneLayout>;
  setSceneLayouts: React.Dispatch<React.SetStateAction<Record<number, SceneLayout>>>;
  showSceneCaptions: boolean;
  setShowSceneCaptions: (v: boolean) => void;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  visualCandidates: Record<number, SceneCandidates>;
  setVisualCandidates: React.Dispatch<React.SetStateAction<Record<number, SceneCandidates>>>;
  subtitleStyle: {
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
  };
  setSubtitleStyle: React.Dispatch<React.SetStateAction<{
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
  }>>;
  srtData: { id: number; start: number; end: number; text: string }[];
  setSrtData: React.Dispatch<React.SetStateAction<{ id: number; start: number; end: number; text: string }[]>>;
  setSrtScriptSig: (sig: string | null) => void;
  editingSrtId: number | null;
  setEditingSrtId: (id: number | null) => void;
  setSceneDurations: React.Dispatch<React.SetStateAction<number[]>>;
  audioEdit: {
    bgm_path: string | null;
    bgm_volume: number;
    sfx_list: { path: string, time: number, volume: number }[];
  };
  setAudioEdit: React.Dispatch<React.SetStateAction<{ bgm_path: string | null; bgm_volume: number; sfx_list: { path: string, time: number, volume: number }[] }>>;
  bgmLibrary: { name: string, path: string }[];
  sfxLibrary: { name: string, path: string }[];
  getTimelineRange: (data: ScriptItem[] | undefined, currentIdx: number) => { start: string, end: string, duration: string };
  subtitlePresets: Record<string, { label: string, font_size: number, color: string, stroke_width: number, stroke_color: string, bg_color: string }>;
  aspectRatio: string;
  setAspectRatio: (ratio: string) => void;
}

const Step5Timeline: React.FC<Step5TimelineProps> = (props) => {
  return (
    <VideoEditor 
      {...props}
      showBackButton={true}
      onBack={() => props.setCurrentStep(4)}
      backLabel="Back to Visuals"
      title="AUTO VIDEO STUDIO"
    />
  );
};

export default React.memo(Step5Timeline);
