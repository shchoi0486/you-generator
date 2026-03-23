import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  AlertCircle,
  CheckCircle2,
  Trash2,
  Download,
  X
} from 'lucide-react';
import { 
  api, 
  type ScriptItem, 
  type AppContent, 
  type AppConfig, 
  type SceneCandidates,
  type Article,
  type ProjectMeta
} from './services/api';
import Step1Input from './components/Step1Input';
import Step2Review from './components/Step2Review';
import Step3Voice from './components/Step3Voice';
import Step4Visual from './components/Step4Visual';
import Step5Timeline from './components/Step5Timeline';
import Step6Export from './components/Step6Export';
import VideoEditor from './components/VideoEditor';
import LoadingOverlay from './components/LoadingOverlay';
import ProjectList from './components/ProjectList';
import SettingsManager from './components/SettingsManager';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StepItem from './components/StepItem';
import { calculateDuration } from './utils/timeUtils';
import { 
  customStyles, 
  subtitlePresets, 
  bgmLibrary, 
  sfxLibrary, 
  voiceOptions, 
  languages, 
  steps 
} from './constants/data';




function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [projectId, setProjectId] = useState<string>(() => {
    return localStorage.getItem('video-creator-current-project-id') || `project-${Date.now()}`;
  });
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeMenu, setActiveMenu] = useState('Home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Data States
  const [url, setUrl] = useState('');
  const [directText, setDirectText] = useState('');
  const [projectName, setProjectName] = useState('새 프로젝트');
  const [duration, setDuration] = useState(60);
  const [inputType, setInputType] = useState<'url' | 'text'>('url');
  const [article, setArticle] = useState<Article | null>(null);
  const [content, setContent] = useState<AppContent | null>(null); // script + scenes
  const [audio, setAudio] = useState<{
    url?: string;
    srtUrl?: string;
    audio_path?: string;
    srt_path?: string;
    [key: string]: unknown;
  } | null>(null); // audio url + srt url
  const [visualCandidates, setVisualCandidates] = useState<Record<number, SceneCandidates>>({});
  const [fetchingIndices, setFetchingIndices] = useState<Set<string>>(new Set());
  const fetchingIndicesRef = useRef<Set<string>>(new Set());
  // Actually, let's just use state for UI and ref for non-UI if needed. 
  // But usually state is enough.
  // Let's replace it with state only if it's not used in ways that require a ref (like in closures).

  const [selectedVisuals, setSelectedVisuals] = useState<Record<number, string[]>>({});
  const [renderResult, setRenderResult] = useState<{
    videoUrl?: string;
    video_path?: string;
    srtUrl?: string;
    [key: string]: unknown;
  } | null>(null);
  const [progress, setProgress] = useState<{
    status?: string;
    progress?: number;
    message?: string;
    [key: string]: string | number | boolean | undefined | null;
  } | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({
    "BJ 이슈왕": "ko-KR-InJoonNeural",
    "박 앵커": "ko-KR-SunHiNeural"
  });
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);
  const [playingSpeaker, setPlayingSpeaker] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<'openai' | 'azure' | 'edge' | 'qwen'>('edge');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('ko');
  const [selectedAiModel, setSelectedAiModel] = useState<string>('pollinations');
  const selectedAiModelRef = useRef(selectedAiModel);

  useEffect(() => {
    selectedAiModelRef.current = selectedAiModel;
  }, [selectedAiModel]);
  const [voiceSettings, setVoiceSettings] = useState<Record<string, { rate: string, pitch: string }>>({});
  const [gapDuration, setGapDuration] = useState<number>(0.5);
  const [playingSegmentIndex, setPlayingSegmentIndex] = useState<number | null>(null);
  const isPlayAllPreviewRef = useRef<boolean>(false);
  const [isPlayAllPreview, setIsPlayAllPreview] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const stopGenerationRef = useRef<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const [editSceneValues, setEditSceneValues] = useState({ keyword: '', description: '' });
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [cfUsage, setCfUsage] = useState<{ neurons: number; limit: number; date: string; error?: string } | null>(null);
  const [isFetchingUsage, setIsFetchingUsage] = useState(false);

  // --- 편집기 관련 상태 ---
  const [subtitleStyle, setSubtitleStyle] = useState({
    preset: 'youtube',
    font: 'Noto Sans KR',
    font_size: 20,
    color: 'white',
    stroke_color: 'black',
    stroke_width: 2.0,
    bg_color: 'transparent',
    position: 'bottom',
    y_offset: 85,
    x_offset: 50,
    show_subtitles: true // 자막 표시 여부
  });

  const [aspectRatio, setAspectRatio] = useState<string>("16:9 (Youtube)"); // 화면 비율 추가
  const [audioEdit, setAudioEdit] = useState<{
    bgm_path: string | null;
    bgm_volume: number;
    sfx_list: Array<{ path: string; time: number; volume: number }>;
  }>({
    bgm_path: null,
    bgm_volume: 0.2,
    sfx_list: []
  });
  const [srtData, setSrtData] = useState<Array<{ id: number; start: number; end: number; text: string }>>([]);
  const [sceneDurations, setSceneDurations] = useState<number[]>([]); // 각 장면의 길이 상태 추가
  const [editingSrtId, setEditingSrtId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [shouldShowEditorPicker, setShouldShowEditorPicker] = useState(false);



  const openEditorMenu = React.useCallback(() => {
    setShouldShowEditorPicker(true);
    setActiveMenu('Editor');
  }, []);

  // -------------------------


  // --- 편집기 재생 동기화 ---
  useEffect(() => {
    if (!mainAudioRef.current) return;
    
    const audio = mainAudioRef.current;
    
    if (isPlaying) {
      // Step 5에서 재생 시 오디오가 멈춰있으면 현재 위치에서 재생
      if (audio.paused) {
        audio.currentTime = currentTime;
        audio.play().catch(e => console.error("Playback failed:", e));
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!mainAudioRef.current) return;
    
    const audio = mainAudioRef.current;
    
    const handleTimeUpdate = () => {
      if (isPlaying) {
        setCurrentTime(audio.currentTime);
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isPlaying]);

  // BGM 동기화
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeekTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!bgmAudioRef.current) return;
    const bgm = bgmAudioRef.current;
    
    if (isPlaying && audioEdit.bgm_path) {
      // 재생 시작 시 또는 BGM 변경 시에만 현재 시간으로 동기화
      // 매번 동기화하면 재생이 뚝뚝 끊김
      if (bgm.paused || Math.abs(bgm.currentTime - (currentTime % (bgm.duration || 1))) > 0.5) {
        bgm.currentTime = currentTime % (bgm.duration || 1);
      }
      bgm.volume = audioEdit.bgm_volume;
      bgm.play().catch(() => {});
    } else {
      bgm.pause();
    }
  }, [isPlaying, audioEdit.bgm_path, audioEdit.bgm_volume, currentTime > lastSeekTimeRef.current + 1 || currentTime < lastSeekTimeRef.current]);

  // 재생 위치 변경 감지
  useEffect(() => {
    lastSeekTimeRef.current = currentTime;
  }, [currentTime]);

  // SFX 트리거
  useEffect(() => {
    if (!isPlaying) return;
    
    audioEdit.sfx_list.forEach(sfx => {
      // 현재 시간과 SFX 시간이 일치하면 재생 (오차 범위 0.1초)
      if (Math.abs(currentTime - sfx.time) < 0.1) {
        const sfxAudio = new Audio(`http://localhost:8000/${sfx.path}`);
        sfxAudio.volume = sfx.volume;
        sfxAudio.play().catch(() => {});
      }
    });
  }, [currentTime, isPlaying, audioEdit.sfx_list]);
  // -------------------------

  // 전체 대본의 시간 범위를 계산하는 함수 (간격 포함)
  const getTimelineRange = React.useCallback((data: ScriptItem[] | undefined, currentIdx: number) => {
    if (!data || currentIdx < 0 || currentIdx >= data.length) {
      return { start: "0.0", end: "0.0", duration: "0.0" };
    }
    
    // 1. SRT 데이터가 있으면 SRT 우선 사용
    // 씬의 길이는 현재 자막 시작부터 다음 자막 시작까지 (공백 포함)로 계산해야 이미지 싱크가 맞음
    if (srtData && srtData.length === data.length) {
      const item = srtData[currentIdx];
      const start = item.start;
      let end = item.end;
      
      // 다음 자막이 있다면 다음 자막의 시작을 이 씬의 끝으로 간주하여 gap을 채움
      if (currentIdx < srtData.length - 1) {
        end = srtData[currentIdx + 1].start;
      } else {
        // 마지막 자막인 경우 끝에 gapDuration 정도 여유를 추가
        end = item.end + gapDuration;
      }
      
      const duration = end - start;
      
      return { 
        start: start.toFixed(2), 
        end: end.toFixed(2), 
        duration: duration.toFixed(2) 
      };
    }

    // 2. SRT 데이터가 없을 때만 기본 계산값 사용
    let start = 0;
    for (let i = 0; i < currentIdx; i++) {
      const item = data[i];
      const baseDur = calculateDuration(item.text);
      start += baseDur + gapDuration;
    }
    
    const durationValue = calculateDuration(data[currentIdx].text);
    // 이 경우도 다음 씬 시작까지가 총 길이 (기본 계산은 gapDuration을 포함하여 씬의 길이로 설정)
    const totalSceneDuration = durationValue + gapDuration;
    
    return { 
      start: start.toFixed(2), 
      end: (start + totalSceneDuration).toFixed(2), 
      duration: totalSceneDuration.toFixed(2) 
    };
  }, [srtData, gapDuration]);

  // 모든 트랙의 끝점 중 가장 큰 값을 비디오 총 길이로 설정
  useEffect(() => {
    let maxTime = 0;
    
    // 1. SRT 데이터 (자막)
    if (srtData && srtData.length > 0) {
      maxTime = Math.max(maxTime, srtData[srtData.length - 1].end);
    }
    
    // 2. SFX 리스트
    if (audioEdit && audioEdit.sfx_list && audioEdit.sfx_list.length > 0) {
      audioEdit.sfx_list.forEach(sfx => {
        maxTime = Math.max(maxTime, sfx.time + 1.0); 
      });
    }
    
    // 3. 장면 데이터 (비주얼)
    if (content?.scenes && content.scenes.length > 0) {
      const lastIdx = content.scenes.length - 1;
      const range = getTimelineRange(content.script, lastIdx);
      maxTime = Math.max(maxTime, parseFloat(range.end));
    }

    // 최소 길이는 10초 정도로 보장 (타임라인 조작을 위해)
    setVideoDuration(Math.max(maxTime, 10));
  }, [srtData, audioEdit, content?.scenes, getTimelineRange]);

  // Persistence: Fetch Projects List from Backend
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projectsData = await api.listProjects();
        if (projectsData) {
          setProjects(projectsData);
          localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsData));
        }
      } catch (e) {
        console.error('Failed to fetch projects list from backend', e);
      }
    };
    fetchProjects();
  }, []);

  // --- Persistence: Load from LocalStorage ---
  useEffect(() => {
    const handleMenuChange = (e: CustomEvent<{ detail: string }>) => {
      setActiveMenu(e.detail.detail);
    };
    window.addEventListener('changeMenu', handleMenuChange as EventListener);
    
    const handleTTSGenerationRequest = () => {
      if (handleGenerateTTSRef.current) {
        handleGenerateTTSRef.current();
      }
    };
    window.addEventListener('requestTTSGeneration', handleTTSGenerationRequest as EventListener);
    
    return () => {
      window.removeEventListener('changeMenu', handleMenuChange as EventListener);
      window.removeEventListener('requestTTSGeneration', handleTTSGenerationRequest as EventListener);
    };
  }, []);

  useEffect(() => {
    const savedData = localStorage.getItem(`video-creator-project-${projectId}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.currentStep) setCurrentStep(parsed.currentStep);
        if (parsed.activeMenu) setActiveMenu(parsed.activeMenu);
        if (parsed.url) setUrl(parsed.url);
        if (parsed.directText) setDirectText(parsed.directText);
        if (parsed.projectName) setProjectName(parsed.projectName);
        if (parsed.duration) setDuration(parsed.duration);
        if (parsed.inputType) setInputType(parsed.inputType);
        if (parsed.article) setArticle(parsed.article);
        if (parsed.content) setContent(parsed.content);
        if (parsed.audio) setAudio(parsed.audio);
        if (parsed.visualCandidates) setVisualCandidates(parsed.visualCandidates);
        if (parsed.selectedVisuals) setSelectedVisuals(parsed.selectedVisuals);
        if (parsed.voiceMap) setVoiceMap(parsed.voiceMap);
        if (parsed.selectedEngine) setSelectedEngine(parsed.selectedEngine);
        if (parsed.selectedLanguage) setSelectedLanguage(parsed.selectedLanguage);
        if (parsed.voiceSettings) setVoiceSettings(parsed.voiceSettings);
        if (parsed.gapDuration) setGapDuration(parsed.gapDuration);
        if (parsed.srtData) setSrtData(parsed.srtData);
      } catch (e) {
        console.error('Failed to load project from localStorage', e);
      }
    } else if (projectId === 'default') {
      // Migrate old data if exists
      const oldData = localStorage.getItem('video-creator-project');
      if (oldData) {
        localStorage.setItem(`video-creator-project-${projectId}`, oldData);
        // Retry loading
        window.location.reload();
      }
    }
  }, [projectId]);

  // Persistence: Save to LocalStorage
  useEffect(() => {
    const projectData = {
      projectId,
      currentStep,
      activeMenu,
      url,
      directText,
      projectName,
      duration,
      inputType,
      article,
      content,
      audio,
      visualCandidates,
      selectedVisuals,
      voiceMap,
      selectedEngine,
      selectedLanguage,
      voiceSettings,
      gapDuration,
      srtData,
      lastModified: new Date().toISOString()
    };
    
    // Save project data
    localStorage.setItem(`video-creator-project-${projectId}`, JSON.stringify(projectData));
    localStorage.setItem('video-creator-current-project-id', projectId);

    // Update projects list
    const projectsListStr = localStorage.getItem('video-creator-projects-list') || '[]';
    try {
      const projectsList = JSON.parse(projectsListStr);
      const index = projectsList.findIndex((p: { id: string }) => p.id === projectId);
      const projectMeta = { 
        id: projectId, 
        projectName: projectName, 
        lastModified: projectData.lastModified,
        currentStep: projectData.currentStep
      };
      
      if (index >= 0) {
        projectsList[index] = projectMeta;
      } else {
        projectsList.push(projectMeta);
      }
      localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsList));
    } catch (e) {
      console.error('Failed to update projects list', e);
    }
  }, [
    projectId, currentStep, activeMenu, url, directText, projectName, duration, 
    inputType, article, content, audio, visualCandidates, 
    selectedVisuals, voiceMap, selectedEngine, selectedLanguage, 
    voiceSettings, gapDuration, srtData
  ]);

  const handleNewProject = React.useCallback((skipConfirm = false) => {
    if (skipConfirm || window.confirm('새 프로젝트를 시작하시겠습니까?')) {
      const newId = `project-${Date.now()}`;
      setProjectId(newId);
      setCurrentStep(1);
      setUrl('');
      setDirectText('');
      setProjectName('새 프로젝트');
      setDuration(60);
      setInputType('url');
      setArticle(null);
      setContent(null);
      setAudio(null);
      setVisualCandidates({});
      setSelectedVisuals({});
      setRenderResult(null);
      setError(null);
      setActiveMenu('Home');
      
      // Reset additional editor states
      setSubtitleStyle({
        preset: 'youtube',
        font: 'Noto Sans KR',
        font_size: 70,
        color: 'white',
        stroke_color: 'black',
        stroke_width: 2.0,
        bg_color: 'transparent',
        position: 'bottom',
        y_offset: 85,
        x_offset: 50,
        show_subtitles: true
      });
      setAspectRatio("16:9 (Youtube)");
      setAudioEdit({
        bgm_path: null,
        bgm_volume: 0.2,
        sfx_list: []
      });
      setSrtData([]);
      setSceneDurations([]);
      setEditingSrtId(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setVideoDuration(0);
    }
  }, []);

  const handleLoadProject = React.useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await api.getProject(id);
      if (data) {
        // Handle both top-level and meta-nested structures for compatibility
        const mergedData = { ...data, ...(data.meta || {}) };
        
        setProjectId(mergedData.projectId || id);
        
        if (mergedData.script || mergedData.scenes || mergedData.content) {
          setContent(mergedData.content || {
            script: mergedData.script || [],
            scenes: mergedData.scenes || []
          });
        }

        if (mergedData.currentStep) setCurrentStep(mergedData.currentStep);
        if (mergedData.url) setUrl(mergedData.url);
        if (mergedData.directText) setDirectText(mergedData.directText);
        if (mergedData.projectName) setProjectName(mergedData.projectName);
        if (mergedData.duration) setDuration(mergedData.duration);
        if (mergedData.inputType) setInputType(mergedData.inputType);
        if (mergedData.article) setArticle(mergedData.article);
        if (mergedData.audio) setAudio(mergedData.audio);
        if (mergedData.visualCandidates) setVisualCandidates(mergedData.visualCandidates);
        if (mergedData.selectedVisuals) setSelectedVisuals(mergedData.selectedVisuals);
        if (mergedData.voiceMap) setVoiceMap(mergedData.voiceMap);
        if (mergedData.selectedEngine) setSelectedEngine(mergedData.selectedEngine);
        if (mergedData.selectedLanguage) setSelectedLanguage(mergedData.selectedLanguage);
        if (mergedData.voiceSettings) setVoiceSettings(mergedData.voiceSettings);
        if (mergedData.gapDuration !== undefined) setGapDuration(mergedData.gapDuration);
        if (mergedData.subtitleStyle) setSubtitleStyle(mergedData.subtitleStyle);
        if (mergedData.aspectRatio) setAspectRatio(mergedData.aspectRatio);
        if (mergedData.audioEdit) setAudioEdit(mergedData.audioEdit);
        if (mergedData.srtData) {
          setSrtData(mergedData.srtData);
        } else {
          // Check localStorage as fallback
          const localSavedData = localStorage.getItem(`video-creator-project-${id}`);
          if (localSavedData) {
            try {
              const parsed = JSON.parse(localSavedData);
              if (parsed.srtData) setSrtData(parsed.srtData);
            } catch (e) {
              console.error('Failed to parse localStorage fallback', e);
            }
          }
        }
        if (mergedData.sceneDurations) setSceneDurations(mergedData.sceneDurations);
        
        setActiveMenu('Editor');
      }
    } catch (e) {
      console.error('Failed to load project', e);
      setError('프로젝트를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteProject = React.useCallback(async (id: string) => {
    if (!id) {
      setError('프로젝트 ID가 유효하지 않습니다.');
      return;
    }

    if (window.confirm('이 프로젝트를 삭제하시겠습니까?')) {
      try {
        console.log(`Deleting project: ${id}`);
        await api.deleteProject(id);
        localStorage.removeItem(`video-creator-project-${id}`);
        
        // Update projects list
        const projectsData = await api.listProjects();
        if (projectsData) {
          setProjects(projectsData);
          localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsData));
        } else {
          // If api.listProjects returns null, just filter out the deleted project locally
          setProjects(prev => {
            const newList = prev.filter(p => p.id !== id);
            localStorage.setItem('video-creator-projects-list', JSON.stringify(newList));
            return newList;
          });
        }
        
        if (id === projectId) {
          handleNewProject();
        }
        
        // Success feedback
        console.log(`Successfully deleted project: ${id}`);
        setSuccess('프로젝트가 성공적으로 삭제되었습니다.');
      } catch (e) {
        console.error('Failed to delete project', e);
        const errorMessage = e instanceof Error ? e.message : '알 수 없는 오류';
        setError(`프로젝트 삭제 중 오류가 발생했습니다: ${errorMessage}`);
      }
    }
  }, [handleNewProject, projectId]);

  const handleSaveProject = React.useCallback(async () => {
    setIsSaving(true);
    
    const projectData = {
      projectId,
      currentStep,
      activeMenu,
      url,
      directText,
      projectName,
      duration,
      inputType,
      article,
      content,
      audio,
      visualCandidates,
      selectedVisuals,
      voiceMap,
      selectedEngine,
      selectedLanguage,
      voiceSettings,
      gapDuration,
      subtitleStyle,
      aspectRatio,
      audioEdit,
      srtData,
      sceneDurations,
      lastModified: new Date().toISOString()
    };
    
    try {
      if (!projectId) {
        setError('프로젝트 ID가 없습니다. 새 프로젝트를 생성해주세요.');
        setIsSaving(false);
        return;
      }

      // 1. Save to LocalStorage (as backup)
      localStorage.setItem(`video-creator-project-${projectId}`, JSON.stringify(projectData));
      localStorage.setItem('video-creator-current-project-id', projectId);

      // 2. Save to Backend
      await api.saveProject({
        projectId: projectId,
        script: content?.script || [],
        scenes: content?.scenes || [],
        meta: {
          id: projectId,
          currentStep,
          activeMenu,
          url,
          directText,
          projectName,
          duration,
          inputType,
          article,
          audio,
          visualCandidates,
          selectedVisuals,
          voiceMap,
          selectedEngine,
          selectedLanguage,
          voiceSettings,
          gapDuration,
          subtitleStyle,
          aspectRatio,
          audioEdit,
          srtData,
          sceneDurations,
          lastModified: new Date().toISOString()
        }
      });
      
      // Update projects list from backend
      const projectsData = await api.listProjects();
      if (projectsData) {
        setProjects(projectsData);
        localStorage.setItem('video-creator-projects-list', JSON.stringify(projectsData));
      }
    } catch (e) {
      console.error('Failed to save project', e);
      setError('프로젝트 저장 중 오류가 발생했습니다.');
    } finally {
      setTimeout(() => {
        setIsSaving(false);
      }, 800);
    }
  }, [
    projectId, currentStep, activeMenu, url, directText, projectName, 
    duration, inputType, article, content, audio, visualCandidates, 
    selectedVisuals, voiceMap, selectedEngine, selectedLanguage, 
    voiceSettings, gapDuration, subtitleStyle, aspectRatio, audioEdit, 
    srtData, sceneDurations
  ]);

  const updatePlayAllState = (val: boolean) => {
    isPlayAllPreviewRef.current = val;
    setIsPlayAllPreview(val);
  };





  const filteredVoices = useMemo(() => {
    return voiceOptions[selectedEngine].filter(v => 
      !v.lang || v.lang === selectedLanguage
    );
  }, [selectedEngine, selectedLanguage, voiceOptions]);

  useEffect(() => {
    if (content?.script) {
      const speakers = Array.from(new Set(
        Array.isArray(content.script)
          ? content.script.map((s: { speaker: string }) => s.speaker)
          : []
      )) as string[];
      const newVoiceMap = { ...voiceMap };
      let changed = false;

      const availableVoicesValues = voiceOptions[selectedEngine].map(v => v.value);

      speakers.forEach(speaker => {
        const currentVoice = newVoiceMap[speaker];
        
        // 현재 엔진에서 지원하지 않는 목소리거나, 아직 설정되지 않은 경우 재설정
        if (!currentVoice || !availableVoicesValues.includes(currentVoice)) {
          // 엔진별 추천 기본값
          if (selectedEngine === 'qwen') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj')) newVoiceMap[speaker] = "ryan";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "sohee";
            else newVoiceMap[speaker] = "sohee";
          } else if (selectedEngine === 'edge') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj') || speaker.includes('진우')) newVoiceMap[speaker] = "ko-KR-InJoonNeural";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "ko-KR-HyunsuMultilingualNeural";
            else newVoiceMap[speaker] = "ko-KR-SunHiNeural";
          } else if (selectedEngine === 'azure') {
            if (speaker.includes('이슈왕') || speaker.toLowerCase().includes('bj') || speaker.includes('진우')) newVoiceMap[speaker] = "ko-KR-JinwooNeural";
            else if (speaker.includes('앵커') || speaker.toLowerCase().includes('anchor')) newVoiceMap[speaker] = "ko-KR-HyejinNeural";
            else newVoiceMap[speaker] = "ko-KR-SunHiNeural";
          } else {
            newVoiceMap[speaker] = availableVoicesValues[0] || "";
          }
          changed = true;
        }
      });

      if (changed) {
        setVoiceMap(newVoiceMap);
      }
    }
  }, [content?.script, selectedEngine, voiceOptions, voiceMap]);

  const playVoiceSample = async (speaker: string, voiceValue: string, customText?: string) => {
    // 이미 재생 중인 경우
    if (audioRef.current) {
      const currentId = customText ? `segment-${customText.substring(0, 10)}` : speaker;
      const isSameSpeaker = playingSpeaker === currentId;
      
      // 전체 미리보기 중이었다면 중지
      if (isPlayAllPreviewRef.current) {
        updatePlayAllState(false);
        setPlayingSegmentIndex(null);
      }
      
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingSpeaker(null);
      
      // 같은 항목을 다시 누른 거라면 정지만 하고 종료 (토글 기능)
      if (isSameSpeaker) return;
    } else if (isPlayAllPreviewRef.current) {
      // audioRef.current는 없지만 전체 미리보기 중인 경우 (대기 중 등)
      updatePlayAllState(false);
      setPlayingSegmentIndex(null);
      setPlayingSpeaker(null);
    }

    // 메인 오디오 재생 중이면 중지
    if (mainAudioRef.current && !mainAudioRef.current.paused) {
      mainAudioRef.current.pause();
    }

    try {
      setIsPreviewLoading(customText ? `segment-${customText.substring(0, 10)}` : speaker);
      
      const previewText = customText || `안녕하세요, 저는 ${speaker} 입니다. 이 목소리가 마음에 드시나요?`;
      
      const settings = voiceSettings[speaker] || { rate: '+0%', pitch: '+0Hz' };
      const response = await api.previewTTS(previewText, voiceValue, selectedEngine, settings.rate, settings.pitch);
      if (!response || !response.audio_url) {
        throw new Error("미리보기 URL을 받지 못했습니다.");
      }
      
      const audioUrl = `http://localhost:8000${response.audio_url}`;
      console.log("Playing audio from:", audioUrl);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlayingSpeaker(customText ? `segment-${customText.substring(0, 10)}` : speaker);

      audio.onended = () => {
        audioRef.current = null;
        setPlayingSpeaker(null);
      };
      
      // 브라우저 정책으로 인해 play()가 거부될 수 있으므로 에러 처리 강화
      try {
        await audio.play();
      } catch (playError) {
        console.error("Audio play failed:", playError);
        setPlayingSpeaker(null);
        audioRef.current = null;
        // 재생 실패 시 사용자에게 직접 클릭하여 재생할 수 있는 방법이나 안내 제공 가능
        // 여기서는 단순 알림
        alert("브라우저 정책으로 인해 자동 재생이 차단되었습니다. 다시 한번 시도해 주세요.");
      }
    } catch (e: unknown) {
      console.error("Failed to generate preview", e);
      alert(`미리듣기 생성에 실패했습니다: ${(e as Error).message || "서버 상태를 확인해주세요."}`);
    } finally {
      setIsPreviewLoading(null);
    }
  };

  const playAllPreview = async () => {
    // 이미 재생 중인 경우 -> 중지
    if (isPlayAllPreviewRef.current) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      updatePlayAllState(false);
      setPlayingSegmentIndex(null);
      setPlayingSpeaker(null);
      return;
    }

    if (!content?.script || content.script.length === 0) return;

    // 메인 오디오 재생 중이면 중지
    if (mainAudioRef.current && !mainAudioRef.current.paused) {
      mainAudioRef.current.pause();
    }

    // 시작
    updatePlayAllState(true);
    
    try {
      const items = Array.isArray(content.script) ? content.script : Object.values(content.script);
      for (let i = 0; i < items.length; i++) {
        // 루프 시작 시 중지 체크
        if (!isPlayAllPreviewRef.current) break;

        const segment = items[i];
        setPlayingSegmentIndex(i);
        
        const speaker = typeof segment === 'object' && segment !== null ? (segment as { speaker?: string }).speaker || 'Narrator' : 'Narrator';
        const voiceValue = voiceMap[speaker] || (filteredVoices.length > 0 ? filteredVoices[0].value : 'ko-KR-SunHiNeural');
        const settings = voiceSettings[speaker] || { rate: '+0%', pitch: '+0Hz' };

        // 1. TTS 생성 요청
        setIsPreviewLoading(`segment-${typeof segment === 'object' && segment !== null && 'text' in segment ? (segment as { text: string }).text.substring(0, 10) : (segment as string).substring(0, 10)}`);
        const response = await api.previewTTS(
          typeof segment === 'object' && segment !== null && 'text' in segment
            ? (segment as { text: string }).text
            : String(segment),
          voiceValue,
          selectedEngine,
          settings.rate,
          settings.pitch
        );
        setIsPreviewLoading(null);

        if (!response?.audio_url) throw new Error("Audio URL missing");
        if (!isPlayAllPreviewRef.current) break; // 생성 중에 중지 체크

        // 2. 오디오 재생
        const audioUrl = `http://localhost:8000${response.audio_url}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setPlayingSpeaker(`segment-${typeof segment === 'object' && segment !== null && 'text' in segment ? (segment as { text: string }).text.substring(0, 10) : (segment as string).substring(0, 10)}`);

        await new Promise((resolve, reject) => {
          // 중지 감지용 인터벌
          const stopCheck = setInterval(() => {
            if (!isPlayAllPreviewRef.current) {
              clearInterval(stopCheck);
              resolve(false);
            }
          }, 100);

          audio.onended = () => {
            clearInterval(stopCheck);
            audioRef.current = null;
            setPlayingSpeaker(null);
            
            // 마지막 세그먼트가 아니면 간격 대기
            if (i < items.length - 1) {
              setTimeout(() => {
                resolve(true);
              }, gapDuration * 1000);
            } else {
              resolve(true);
            }
          };
          audio.onerror = (e) => {
            clearInterval(stopCheck);
            console.error("Audio error:", e);
            reject(e);
          };
          audio.play().catch(reject);
        });

        if (!isPlayAllPreviewRef.current) break;
      }
    } catch (err: unknown) {
      console.error("Play all failed:", err);
      alert(`재생 중 오류가 발생했습니다: ${(err as Error).message || "서버 상태를 확인해주세요."}`);
    } finally {
      updatePlayAllState(false);
      setPlayingSegmentIndex(null);
      setPlayingSpeaker(null);
      setIsPreviewLoading(null);
    }
  };

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
  }, []);

  const fetchCloudflareUsage = async () => {
    setIsFetchingUsage(true);
    try {
      const result = await api.getCloudflareUsage();
      setCfUsage(result);
    } catch (e) {
      console.error('Failed to fetch CF usage', e);
    } finally {
      setIsFetchingUsage(false);
    }
  };

  useEffect(() => {
    if (activeMenu === 'Settings') {
      fetchCloudflareUsage();
    }
  }, [activeMenu]);

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:8000/events');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);
      } catch (err: unknown) {
        console.error('Failed to parse SSE event:', (err as Error).message || '서버 상태를 확인해주세요.');
      }
    };

    eventSource.onerror = (err: unknown) => {
      console.error('SSE connection error:', (err as Error).message || '서버 상태를 확인해주세요.');  
      alert('서버와의 연결이 끊어졌습니다. 다시 시도해주세요.');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleSaveConfig = async () => {
    if (!config) return;
    setLoading(true);
    try {
      // Azure 관련 플래그 자동 설정
      const updatedConfig = {
        ...config,
        use_cloudflare_tts_proxy: !!config.cloudflare_worker_url,
        use_azure_tts: !!config.cloudflare_worker_url
      };
      await api.updateConfig(updatedConfig);
      alert('설정이 성공적으로 저장되었습니다.');
    } catch (err: unknown) {
      alert('설정 저장 중 오류가 발생했습니다: ' + (err as Error).message || '서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };



  const handleCancelTask = async () => {
    try {
      await api.cancelTask();
      // 작업 중단 요청 후 로딩 상태 해제
      setLoading(false);
      // '전체 생성' 중이었다면 해당 플래그도 해제
      if (isGeneratingAll) {
        setIsGeneratingAll(false);
        stopGenerationRef.current = true;
      }
    } catch (err: unknown) {
      console.error('Task cancellation failed:', err);
    }
  };

  const handleScrape = async () => {
    if (inputType === 'text') {
      if (!directText.trim()) return;
      setArticle({
        title: directText.split('\n')[0].substring(0, 50) + '...',
        full_text: directText
      });
      setCurrentStep(2);
      return;
    }

    if (!url) return;
    
    // Check for Ctrl/Command key during click
    const isSpecialClick = (window.event as unknown as MouseEvent)?.ctrlKey || (window.event as unknown as MouseEvent)?.metaKey;
    if (isSpecialClick) {
      window.open(url, '_blank');
      return;
    }

    setLoading(true);
    setError(null);
    // 초기 진행 상태 설정 (0%에서 멈춰있는 느낌 방지)
    setProgress({ step: 'scrape', status: 'starting', progress: 5, message: '뉴스 본문을 추출하기 위해 준비 중입니다...' });
    try {
      const data = await api.scrapeNews({ url });
      setArticle(data);
      setCurrentStep(2);
    } catch (err: unknown) {
      setError((err as Error).message || '뉴스 본문 추출 중 오류가 발생했습니다. 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!article) return;
    setLoading(true);
    setError(null);
    setSrtData([]); // 대본 재생성 시 자막 데이터 초기화
    // 초기 진행 상태 설정
    setProgress({ step: 'generate', status: 'starting', progress: 10, message: 'AI 대본 생성을 요청하고 있습니다...' });
    try {
      const result = await api.generateContent({ 
        article_text: article.full_text as string,
        duration: duration 
      });
      setContent(result);
      // Stay in Step 2 for Review
      setCurrentStep(2);
    } catch (err: unknown) {
      setError((err as Error).message || 'AI 대본 생성 중 오류가 발생했습니다. 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  // Keep latest handleGenerateTTS for custom event
  const handleGenerateTTSRef = useRef<(() => Promise<void>) | null>(null);
  
  const handleGenerateTTS = async () => {
    if (!content?.script || content.script.length === 0) return;
    setLoading(true);
    setError(null);
    // setSrtData([]); // 음성 재생성 시 이전 자막 데이터를 지우면 타임라인이 초기화되므로 지우지 않음
    setProgress({ step: 'tts', status: 'starting', progress: 5, message: 'AI 음성 합성을 준비하고 있습니다...' });
    try {
      const voiceData = {
        ...voiceMap,
        settings: voiceSettings
      };

      const data = await api.generateTTS({ 
        script: content.script as { text: string; speaker: string; }[],
        voice_map: voiceData,
        engine: selectedEngine,
        gap_duration: gapDuration,
        output_name: `audio_${Date.now()}`
      });
      if (data) {
        const mappedData = {
          ...data,
          url: data.audio_url || data.url,
          srtUrl: data.srt_url || data.srtUrl
        };
        setAudio(mappedData);
        // Step 4로 무조건 이동하지 않고 현재 상태 유지
        if (currentStep < 4) setCurrentStep(4);
      }
    } catch (err: unknown) {
      setError((err as Error).message || '음성 생성 중 오류가 발생했습니다. 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleGenerateTTSRef.current = handleGenerateTTS;
  });

  const fetchCandidates = React.useCallback(async (index: number, type: 'all' | 'ai' | 'search' = 'all', forcedModel?: string, isAppend: boolean = false, customKeyword?: string) => {
    if (!content?.scenes || !content.scenes[index]) return;
    
    // 개별 타입별 로딩 상태 관리를 위해 키 생성
    const fetchKeys = type === 'all' ? [`${index}-ai`, `${index}-search`] : [`${index}-${type}`];
    
    // 이미 진행 중인 요청이 있는지 확인
    const isAnyFetching = fetchKeys.some(key => fetchingIndicesRef.current.has(key));
    if (!forcedModel && !customKeyword && isAnyFetching) {
      return;
    }

    // 로딩 상태 추가
    fetchKeys.forEach(key => fetchingIndicesRef.current.add(key));
    setFetchingIndices(new Set(fetchingIndicesRef.current));
    
    const scene = content.scenes[index];
    const currentModel = forcedModel || selectedAiModel;
    
    // 추가 생성 시에는 검색 키워드에 약간의 변주를 주어 다른 결과가 나오도록 유도
    let searchKeywords = customKeyword ? [customKeyword] : [scene.keyword];
    if (isAppend && type === 'search' && !customKeyword) {
      const variations = ['', ' 4k', ' high quality', ' cinematic', ' realistic', ' wallpaper'];
      const randomVariation = variations[Math.floor(Math.random() * variations.length)];
      searchKeywords = [scene.keyword + randomVariation];
    }
    
    try {
      if (!isAppend) {
        setVisualCandidates(prev => {
          const current = prev[index] || { ai: [], search: [], graph: [] };
          const shouldClearAi = (type === 'all' || type === 'ai') && current.ai.length === 0;
          const shouldClearSearch = (type === 'all' || type === 'search') && (current.search.length === 0 || !!customKeyword);

          return {
            ...prev,
            [index]: {
              ...current,
              ai: shouldClearAi ? [] : current.ai,
              search: shouldClearSearch ? [] : current.search
            }
          };
        });
      }

      const data = await api.getVisualCandidates({ 
        scene: {
          description: scene.description,
          keywords: searchKeywords
        }, 
        index,
        project_id: projectId,
        // 추가 생성 시에는 1개씩만 요청
        ai_count: (type === 'all' || type === 'ai') ? (isAppend ? 1 : 1) : 0,
        search_count: (type === 'all' || type === 'search') ? (isAppend ? 1 : 5) : 0,
        ai_model: currentModel,
        topic: projectName,
        visual_guide: scene.description
      });
      
      // 2. 결과 부분적 또는 전체적 업데이트
      setVisualCandidates(prev => {
        const current = prev[index] || { ai: [], search: [], graph: [] };
        
        let newAi = current.ai;
        if (type === 'all' || type === 'ai') {
          const incomingAi = data?.candidates?.ai || [];
          if (isAppend) {
            // 중복 제거 후 추가 (url 기준)
            const existingUrls = new Set(current.ai.map(item => item.url));
            const uniqueNewAi = incomingAi.filter((item: { url: string }) => !existingUrls.has(item.url));
            newAi = [...current.ai, ...uniqueNewAi];
          } else {
            newAi = incomingAi;
          }
        }

        let newSearch = current.search;
        if (type === 'all' || type === 'search') {
          const incomingSearch = data?.candidates?.search || [];
          if (isAppend) {
            // 중복 제거 후 추가 (url 기준)
            const existingUrls = new Set(current.search.map(item => item.url));
            const uniqueNewSearch = incomingSearch.filter((item: { url: string }) => !existingUrls.has(item.url));
            newSearch = [...current.search, ...uniqueNewSearch];
          } else {
            newSearch = incomingSearch;
          }
        }

        const newGraph = type === 'all' ? (data?.candidates?.graph || []) : current.graph;
        
        return {
          ...prev,
          [index]: {
            ...current,
            ai: newAi,
            search: newSearch,
            graph: newGraph
          }
        };
      });

      // [개선] AI 결과가 있고 현재 선택된 이미지가 없으면 첫 번째 AI 이미지를 자동 선택
      // setVisualCandidates의 업데이트 완료 후 실행하기 위해 별도로 호출
      if (data?.candidates?.ai && data.candidates.ai.length > 0) {
        setSelectedVisuals(vPrev => {
          const currentSelection = vPrev[index] || [];
          if (currentSelection.length === 0) {
            return { ...vPrev, [index]: [data.candidates.ai[0].url] };
          }
          return vPrev;
        });
      } else if ((!data?.candidates?.ai || data.candidates.ai.length === 0) && data?.candidates?.search && data.candidates.search.length > 0) {
        // AI가 없고 검색 결과만 있을 경우 검색 결과의 첫 번째 이미지 선택
        setSelectedVisuals(vPrev => {
          const currentSelection = vPrev[index] || [];
          if (currentSelection.length === 0) {
            return { ...vPrev, [index]: [data.candidates.search[0].url] };
          }
          return vPrev;
        });
      }
    } catch (err: unknown) {
      console.error(`Failed to fetch candidates for scene ${index}`, (err as Error).message || '서버 상태를 확인해주세요.');
    } finally {
      fetchKeys.forEach(key => fetchingIndicesRef.current.delete(key));
      setFetchingIndices(new Set(fetchingIndicesRef.current));
    }
  }, [content?.scenes, visualCandidates, projectId, selectedAiModel]);

  // 4단계 진입 시 혹은 장면 변경 시, 후보 이미지를 자동으로 가져오지 않도록 함 (사용자가 모델 선택 후 생성 버튼을 누를 때만 실행)
  // 기존 자동 생성 로직은 사용자의 요청에 의해 제거되었습니다.

  const fetchAllCandidates = React.useCallback(async (isRegenerate: boolean = false) => {
    if (!content?.scenes) return;
    const sceneCount = content.scenes.length;
    setIsGeneratingAll(true);
    stopGenerationRef.current = false;
    setGenerationProgress({ current: 0, total: sceneCount });
    
    if (isRegenerate) {
      setSelectedVisuals({});
    }
    
    for (let i = 0; i < sceneCount; i++) {
      if (stopGenerationRef.current) break;
      
      // 이미 있는 이미지는 건너뜀 (다시 생성하기가 아닐 경우)
      if (!isRegenerate && visualCandidates[i] && visualCandidates[i].ai && visualCandidates[i].ai.length > 0) {
        setGenerationProgress(prev => ({ ...prev, current: i + 1 }));
        continue;
      }

      setGenerationProgress(prev => ({ ...prev, current: i + 1 }));
      // setActiveSceneIndex(i); // 현재 생성 중인 장면으로 포커스 이동 로직 제거 (사용자의 수동 선택 유지)
      
      // [개선] AI 생성과 웹 검색을 분리하여 호출함으로써 AI 결과가 먼저 화면에 반영되도록 함
      // 1. AI 이미지 생성 (비교적 빠름)
      await fetchCandidates(i, 'ai', selectedAiModelRef.current);
      
      if (stopGenerationRef.current) break;
      
      // 2. 웹 검색 수집 (Playwright 로직으로 인해 느림)
      await fetchCandidates(i, 'search');
    }
    
    setIsGeneratingAll(false);
    setGenerationProgress({ current: 0, total: 0 });
  }, [content?.scenes, fetchCandidates, visualCandidates]);

  const stopGeneration = () => {
    stopGenerationRef.current = true;
    setIsGeneratingAll(false);
  };

  const handleMoveToEdit = async () => {
    if (!audio || !selectedVisuals || !content?.scenes) return;
    setLoading(true);
    try {
      // SRT 파일 파싱 시도 (백엔드에 SRT 파싱 엔드포인트가 있다고 가정하거나 프론트에서 처리)
      // 여기서는 간단하게 SRT 파일 URL이 있으면 가져와서 파싱하는 로직 추가 가능
      // [개선] audio.srtUrl 또는 audio.srt_url 모두 지원하도록 수정
      const rawSrtUrlValue = audio.srtUrl ?? audio.srt_url;
      const rawSrtUrl = typeof rawSrtUrlValue === 'string' ? rawSrtUrlValue : '';
      const srtPath = typeof audio.srt_path === 'string' ? audio.srt_path : '';
      
      if (rawSrtUrl || srtPath) {
        try {
          let srtUrl = "";
          if (rawSrtUrl) {
            srtUrl = rawSrtUrl.startsWith('http') ? rawSrtUrl : `http://localhost:8000${rawSrtUrl.startsWith('/') ? '' : '/'}${rawSrtUrl}`;
          } else {
            // 백엔드는 보통 assets/audio/ 에 srt를 저장함
            const fileName = srtPath.split(/[\\/]/).pop();
            srtUrl = `http://localhost:8000/assets/audio/${fileName}`;
          }
          
          console.log("Fetching SRT from:", srtUrl);
          const response = await fetch(srtUrl as RequestInfo);
          if (!response.ok) {
            throw new Error(`Failed to fetch SRT: ${response.status} ${response.statusText}`);
          }
          const srtText = await response.text();
          
          // Robust SRT Parser
          const parseSRT = (data: string) => {
            const items: { id: number; start: number; end: number; text: string }[] = [];
            const blocks = data.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
            
            for (const block of blocks) {
              const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
              if (lines.length >= 3) {
                // Find time range line (usually second line, but could be first if ID is missing)
                let timeLineIdx = -1;
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].includes('-->')) {
                    timeLineIdx = i;
                    break;
                  }
                }

                if (timeLineIdx !== -1) {
                  const timeMatch = lines[timeLineIdx].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
                  
                  if (timeMatch) {
                    const [ , startStr, endStr ] = timeMatch;
                    
                    const timeToSeconds = (t: string) => {
                      const [h, m, s_ms] = t.split(':');
                      const [s, ms] = s_ms.replace('.', ',').split(',');
                      return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
                    };
                    
                    const text = lines.slice(timeLineIdx + 1).join(' ').trim();
                    const idLine = lines.slice(0, timeLineIdx).join('').trim();
                    const id = parseInt(idLine, 10);
                    
                    items.push({
                      id: isNaN(id) ? items.length + 1 : id,
                      start: timeToSeconds(startStr),
                      end: timeToSeconds(endStr),
                      text: text
                    });
                  }
                }
              }
            }
            return items;
          };
          
          const parsedData = parseSRT(srtText);
          setSrtData(parsedData);
          if (parsedData.length > 0) {
            const totalDuration = parsedData[parsedData.length - 1].end;
            setVideoDuration(totalDuration);
            
            // 각 장면의 초기 길이를 균등하게 분할
            if (content?.scenes) {
              const initialDurations = content.scenes.map(() => totalDuration / content.scenes.length);
              setSceneDurations(initialDurations);
            }
          }
        } catch (e) {
          console.error("Failed to parse SRT:", e);
        }
      }
      
      setCurrentStep(5);
    } catch (err: unknown) {
      setError((err as Error).message || '편집 단계로 이동 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (content?.script && srtData.length === 0) {
      const newSrtData: { id: number; start: number; end: number; text: string }[] = [];
      content.script.forEach((item, idx) => {
        const range = getTimelineRange(content.script, idx);
        newSrtData.push({
          id: idx + 1,
          start: parseFloat(range.start),
          end: parseFloat(range.end),
          text: item.text
        });
      });
      if (newSrtData.length > 0) {
        setSrtData(newSrtData);
      }
    }
  }, [content, srtData.length, getTimelineRange]);

  const handleFinalRender = async () => {
    if (!audio || !selectedVisuals || !content?.scenes) return;
    setLoading(true);
    setError(null);
    setProgress({ step: 'render', status: 'starting', progress: 5, message: '최종 영상 렌더링을 준비하고 있습니다...' });
    try {
      // [개선] 모든 장면에 대해 이미지가 선택되었는지 확인하고, 없으면 첫 번째 후보를 자동으로 할당
      const finalVisuals: Record<number, string[]> = { ...selectedVisuals };
      let missingCount = 0;
      
      content.scenes.forEach((_, idx) => {
        if (!finalVisuals[idx] || finalVisuals[idx].length === 0) {
          const candidates = visualCandidates[idx];
          if (candidates) {
            if (candidates.ai && candidates.ai.length > 0) {
              finalVisuals[idx] = [candidates.ai[0].path];
            } else if (candidates.search && candidates.search.length > 0) {
              finalVisuals[idx] = [candidates.search[0].path];
            } else {
              missingCount++;
            }
          } else {
            missingCount++;
          }
        }
      });

      if (missingCount > 0) {
        console.warn(`${missingCount}개 장면에 이미지가 없습니다. 검은색 배경으로 대체됩니다.`);
      }

      // 백엔드 렌더링을 위해 이미지 리스트와 각 장면의 길이를 전달
      const bg_images: Array<[string[], number]> = content.scenes.map((_, idx) => {
        const range = getTimelineRange(content.script, idx);
        return [
          finalVisuals[idx] || [],
          parseFloat(range.duration)
        ];
      });
      
      // SRT 데이터를 다시 SRT 포맷으로 변환 (편집된 내용 반영)
      const formatSRT = (data: typeof srtData) => {
        return data.map(item => {
          const secondsToTime = (s: number) => {
            const h = Math.floor(s / 3600).toString().padStart(2, '0');
            const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
            const sec = Math.floor(s % 60).toString().padStart(2, '0');
            const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
            return `${h}:${m}:${sec},${ms}`;
          };
          return `${item.id}\n${secondsToTime(item.start)} --> ${secondsToTime(item.end)}\n${item.text}\n`;
        }).join('\n');
      };

      const editedSrtContent = formatSRT(srtData);

      const data = await api.renderVideo({
        audio_path: audio.audio_path as string,
        srt_path: audio.srt_path as string,
        bg_images: bg_images,
        output_name: `video_${Date.now()}`,
        subtitle_style: {
          ...subtitleStyle,
          bg_color: subtitleStyle.bg_color === 'transparent' ? undefined : subtitleStyle.bg_color
        },
        audio_edit: {
          ...audioEdit,
          bgm_path: audioEdit.bgm_path || undefined,
          sfx_list: audioEdit.sfx_list.map(s => ({
            ...s,
            path: s.path.replace('assets/', '') // 백엔드에서는 assets/ 제외한 경로 기대
          }))
        },
        edited_srt: editedSrtContent, // 백엔드에서 이 필드를 처리하도록 함
        aspect_ratio: aspectRatio // 화면 비율 추가
      });
      setRenderResult(data);
      setCurrentStep(6);
      if (activeMenu === 'Editor') {
        setActiveMenu('Home');
      }
    } catch (err: unknown) {
      setError((err as Error).message || '비디오 렌더링 중 오류가 발생했습니다. 서버 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <style>{customStyles}</style>
      
      {/* Hidden Audio Elements for Preview */}
      <audio 
        ref={mainAudioRef} 
        src={audio?.audio_url ? `http://localhost:8000${audio.audio_url}` : undefined} 
        className="hidden"
      />
      <audio 
        ref={bgmAudioRef} 
        src={audioEdit.bgm_path ? `http://localhost:8000/${audioEdit.bgm_path}` : undefined} 
        loop 
        className="hidden"
      />

      <Sidebar 
        activeMenu={activeMenu} 
        setActiveMenu={(menu) => {
          if (menu === 'Editor') {
            openEditorMenu();
          } else {
            setActiveMenu(menu);
          }
        }} 
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden">
        <Header 
          activeMenu={activeMenu} 
          handleNewProject={handleNewProject} 
          handleSaveProject={handleSaveProject} 
          isSaving={isSaving} 
        />
        {/* Content Area */}
        <div className={`flex-1 pt-2 flex flex-col min-h-0 min-w-0 overflow-hidden ${activeMenu === 'Editor' || (activeMenu === 'Home' && currentStep === 5) ? 'pl-0 pr-2 md:pr-3 pb-0 items-stretch' : 'px-4 md:px-8 pb-6 items-center'}`}>
          <div className={`w-full flex-1 flex flex-col min-h-0 min-w-0 ${(activeMenu === 'Editor' || (activeMenu === 'Home' && currentStep === 5)) ? 'max-w-none' : 'max-w-7xl'}`}>
            {activeMenu === 'Home' ? (
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {/* Stepper (Sticky) */}
                <div className={`z-20 bg-white/95 backdrop-blur-md py-3 px-6 border border-gray-100 shadow-sm rounded-2xl shrink-0 ${currentStep === 5 ? 'mb-2' : 'mb-4'}`}>
                  <div className={`${currentStep === 5 ? 'max-w-none' : 'max-w-7xl'} mx-auto flex justify-between items-center relative`}>
                    <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0 mx-8 md:mx-16" />
                    {steps.map((step) => (
                      <StepItem 
                        key={step.id}
                        number={step.id}
                        label={step.label}
                        active={currentStep === step.id}
                        completed={currentStep > step.id}
                        onClick={() => {
                          // 각 단계별 요구사항 체크
                          if (loading) return;
                          
                          if (step.id === 2 && !article && !content) return;
                          if (step.id === 3 && !content) return;
                          if (step.id === 4 && !audio?.url) {
                            handleGenerateTTS();
                            return;
                          }
                          if (step.id === 5 && Object.keys(selectedVisuals).length === 0) return;
                          
                          setCurrentStep(step.id);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Content Card */}
                <div className={`bg-white shadow-2xl shadow-gray-200/40 border border-gray-100 flex-1 relative flex flex-col min-h-0 overflow-hidden ${currentStep === 5 ? 'rounded-none shadow-none border-none' : 'rounded-3xl'}`}>
                  
                  <div className={`flex-1 flex flex-col min-h-0 ${currentStep !== 5 ? 'p-4 md:p-6' : ''}`}>
                    <LoadingOverlay 
                      loading={loading} 
                      progress={progress} 
                      handleCancelTask={handleCancelTask} 
                    />

                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 animate-in fade-in slide-in-from-top-2 duration-300">
                    <AlertCircle size={20} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-sm">오류 발생</p>
                      <p className="text-xs opacity-80 max-h-32 overflow-y-auto">
                        {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
                      </p>
                    </div>
                    <button
                      onClick={() => setError(null)}
                      aria-label="Clear error"
                      title="Clear error"
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                {success && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3 text-green-600 animate-in fade-in slide-in-from-top-2 duration-300">
                    <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-sm">성공</p>
                      <p className="text-xs opacity-80">
                        {success}
                      </p>
                    </div>
                    <button
                      onClick={() => setSuccess(null)}
                      aria-label="Clear success"
                      title="Clear success"
                      className="text-green-400 hover:text-green-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Step 1: URL or Text Input (Redesigned) */}
                {currentStep === 1 && (
                  <Step1Input 
                    projectName={projectName}
                    setProjectName={setProjectName}
                    inputType={inputType}
                    setInputType={setInputType}
                    url={url}
                    setUrl={setUrl}
                    directText={directText}
                    setDirectText={setDirectText}
                    duration={duration}
                    setDuration={setDuration}
                    handleScrape={handleScrape}
                    loading={loading}
                  />
                )}

                {/* Step 2: Content Generation & Review */}
                {currentStep === 2 && article && (
                  <Step2Review 
                    article={article}
                    content={content}
                    duration={duration}
                    setDuration={setDuration}
                    handleGenerate={handleGenerateContent}
                    setContent={setContent}
                    setAudio={setAudio}
                    getTimelineRange={getTimelineRange}
                    setCurrentStep={setCurrentStep}
                    loading={loading}
                  />
                )}

                {/* Step 3: Voice Selection & TTS */}
                {currentStep === 3 && content && (
                  <Step3Voice
                    content={content}
                    voiceMap={voiceMap}
                    setVoiceMap={setVoiceMap}
                    voiceSettings={voiceSettings}
                    setVoiceSettings={setVoiceSettings}
                    selectedEngine={selectedEngine}
                    setSelectedEngine={setSelectedEngine}
                    selectedLanguage={selectedLanguage}
                    setSelectedLanguage={setSelectedLanguage}
                    gapDuration={gapDuration}
                    setGapDuration={setGapDuration}
                    handleGenerateTTS={handleGenerateTTS}
                    playAllPreview={playAllPreview}
                    isPlayAllPreview={isPlayAllPreview}
                    audio={audio && audio.url ? { url: audio.url } : null}
                    setAudio={setAudio}
                    setCurrentStep={setCurrentStep}
                    loading={loading}
                    isPreviewLoading={isPreviewLoading}
                    playingSpeaker={playingSpeaker}
                    playingSegmentIndex={playingSegmentIndex}
                    playVoiceSample={playVoiceSample}
                    getTimelineRange={getTimelineRange}
                    languages={languages}
                    voiceOptions={voiceOptions}
                    filteredVoices={filteredVoices}
                  />
                )}

                {/* Step 4: Visual Selection */}
                {currentStep === 4 && content && (
                  <Step4Visual
                    content={content}
                    activeSceneIndex={activeSceneIndex}
                    setActiveSceneIndex={setActiveSceneIndex}
                    selectedVisuals={selectedVisuals}
                    setSelectedVisuals={setSelectedVisuals}
                    visualCandidates={visualCandidates}
                    setVisualCandidates={setVisualCandidates}
                    isGeneratingAll={isGeneratingAll}
                    generationProgress={generationProgress}
                    stopGeneration={stopGeneration}
                    selectedAiModel={selectedAiModel}
                    setSelectedAiModel={setSelectedAiModel}
                    fetchAllCandidates={fetchAllCandidates}
                    fetchCandidates={fetchCandidates}
                    editingSceneIndex={editingSceneIndex}
                    setEditingSceneIndex={setEditingSceneIndex}
                    editSceneValues={editSceneValues}
                    setEditSceneValues={setEditSceneValues}
                    setContent={setContent}
                    setCurrentStep={setCurrentStep}
                    zoomedImage={zoomedImage}
                    setZoomedImage={setZoomedImage}
                    handleMoveToEdit={handleMoveToEdit}
                    fetchingIndices={fetchingIndices}
                  />
                )}
                {/* Step 5: Advanced Video Editor */}
                {currentStep === 5 && content && (
                  <Step5Timeline
                    currentStep={currentStep}
                    setCurrentStep={setCurrentStep}
                    content={content}
                    setContent={setContent}
                    loading={loading}
                    handleFinalRender={handleFinalRender}
                    currentTime={currentTime}
                    videoDuration={videoDuration}
                    isPlaying={isPlaying}
                    setIsPlaying={setIsPlaying}
                    setCurrentTime={setCurrentTime}
                    sceneDurations={sceneDurations}
                    calculateDuration={calculateDuration}
                    gapDuration={gapDuration}
                    selectedVisuals={selectedVisuals}
                    setSelectedVisuals={setSelectedVisuals}
                    visualCandidates={visualCandidates}
                    setVisualCandidates={setVisualCandidates}
                    subtitleStyle={subtitleStyle}
                    setSubtitleStyle={setSubtitleStyle}
                    srtData={srtData}
                    setSrtData={setSrtData}
                    editingSrtId={editingSrtId}
                    setEditingSrtId={setEditingSrtId}
                    setSceneDurations={setSceneDurations}
                    audioEdit={audioEdit}
                    setAudioEdit={setAudioEdit}
                    bgmLibrary={bgmLibrary}
                    sfxLibrary={sfxLibrary}
                    getTimelineRange={getTimelineRange}
                    subtitlePresets={subtitlePresets}
                    aspectRatio={aspectRatio}
                    setAspectRatio={setAspectRatio}
                  />
                )}

                {/* Step 6: Final Result */}
                {currentStep === 6 && renderResult && (
                  <Step6Export
                    renderResult={renderResult as { [key: string]: string | number | undefined; video_path?: string | undefined; videoUrl?: string | undefined; }}
                    handleNewProject={handleNewProject}
                  />
                )}
                  </div>
                </div>
              </div>
            ) : activeMenu === 'Editor' ? (
              <VideoEditor 
                content={content}
                setContent={setContent}
                loading={loading}
                handleFinalRender={handleFinalRender}
                handleNewProject={handleNewProject}
                handleLoadProject={handleLoadProject}
                currentTime={currentTime}
                videoDuration={videoDuration}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                setCurrentTime={setCurrentTime}
                sceneDurations={sceneDurations}
                calculateDuration={calculateDuration}
                gapDuration={gapDuration}
                selectedVisuals={selectedVisuals}
                setSelectedVisuals={setSelectedVisuals}
                visualCandidates={visualCandidates}
                setVisualCandidates={setVisualCandidates}
                subtitleStyle={subtitleStyle}
                setSubtitleStyle={setSubtitleStyle}
                srtData={srtData}
                setSrtData={setSrtData}
                editingSrtId={editingSrtId}
                setEditingSrtId={setEditingSrtId}
                setSceneDurations={setSceneDurations}
                audioEdit={audioEdit}
                setAudioEdit={setAudioEdit}
                bgmLibrary={bgmLibrary}
                sfxLibrary={sfxLibrary}
                getTimelineRange={getTimelineRange}
                subtitlePresets={subtitlePresets}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                showBackButton={false}
                title="ADVANCED EDITOR"
                isStandalone={true}
                showInitialProjectModal={shouldShowEditorPicker}
                onCloseProjectModal={() => setShouldShowEditorPicker(false)}
              />
            ) : activeMenu === 'Projects' ? (
              /* Projects View */
              <ProjectList
                projectId={projectId}
                projects={projects}
                handleNewProject={handleNewProject}
                handleLoadProject={handleLoadProject}
                handleDeleteProject={handleDeleteProject}
              />
          ) : activeMenu === 'Settings' ? (
            <SettingsManager
              config={config}
              setConfig={setConfig}
              loading={loading}
              handleSaveConfig={handleSaveConfig}
              visibleKeys={visibleKeys}
              setVisibleKeys={setVisibleKeys}
              fetchCloudflareUsage={fetchCloudflareUsage}
              isFetchingUsage={isFetchingUsage}
              cfUsage={cfUsage}
            />
          ) : null}
        </div>
      </div>
    </main>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm transition-all duration-300 animate-in fade-in"
          onClick={() => setZoomedImage(null)}
        >
          <div className="absolute top-6 right-6 flex items-center gap-4">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = zoomedImage;
                link.download = `image_${Date.now()}.png`;
                link.click();
              }}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10"
              title="이미지 다운로드"
            >
              <Download size={24} />
            </button>
            <button 
              onClick={() => setZoomedImage(null)}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10"
              title="닫기"
            >
              <X size={24} />
            </button>
          </div>
          <div 
            className="max-w-[90vw] max-h-[90vh] relative group"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={zoomedImage} 
              alt="zoomed" 
              className="w-full h-full object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-300"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
