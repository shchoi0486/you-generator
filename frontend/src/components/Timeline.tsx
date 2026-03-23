import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Type, 
  Image as ImageIcon, 
  Music, 
  Volume2, 
  Play, 
  Pause,
  ZoomIn,
  ZoomOut,
  Scissors,
  Trash2,
  Clock,
  ArrowLeftToLine,
  ArrowRightToLine,
  Unlink,
  Copy,
  Snowflake,
  Bookmark,
  Magnet,
  Link,
  SplitSquareHorizontal,
  Wand2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { type AppContent, type SceneCandidates, type ScriptItem } from '../services/api';

interface TimelineItemProps {
  id: string | number;
  start: number;
  duration: number;
  zoom: number;
  color: string;
  label?: string;
  onUpdate: (start: number, duration: number) => void;
  onDelete?: () => void;
  isSelected?: boolean;
  onClick?: () => void;
  minDuration?: number;
  snapPoints?: number[];
  onDrop?: (data: { type: string; path: string; [key: string]: unknown }) => void;
  children?: React.ReactNode;
  className?: string;
  isSplitMode?: boolean;
}

const TimelineItem: React.FC<TimelineItemProps & { isSplitMode?: boolean }> = ({
  start,
  duration,
  zoom,
  color,
  label,
  onUpdate,
  onDelete,
  isSelected,
  onClick,
  minDuration = 0.1,
  snapPoints = [],
  onDrop,
  children,
  className = "",
  isSplitMode = false,
}) => {
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'drag' | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    // If split mode is active, let the event bubble up to handleTimelineClick
    if (isSplitMode) {
      onClick?.(); // Still trigger selection
      return;
    }

    // e.stopPropagation(); // Don't stop propagation to allow background click (handleTimelineClick) to move playhead
    onClick?.(); // Trigger selection immediately on mouse down
    
    setIsResizing('drag');
    
    const startX = e.clientX;
    const initialStart = start;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSeconds = deltaX / zoom;
      let newStart = Math.max(0, initialStart + deltaSeconds);
      
      // Snapping logic
      if (snapPoints && snapPoints.length > 0) {
        const snapThreshold = 10 / zoom; // 10 pixels in seconds
        for (const snapPoint of snapPoints) {
          if (Math.abs(newStart - snapPoint) < snapThreshold) {
            newStart = snapPoint;
            break;
          }
          if (Math.abs((newStart + duration) - snapPoint) < snapThreshold) {
            newStart = snapPoint - duration;
            break;
          }
        }
      }
      
      onUpdate(newStart, duration);
    };

    const onMouseUp = () => {
      setIsResizing(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResize = (direction: 'left' | 'right', e: React.MouseEvent) => {
    if (isSplitMode) return; // Allow split mode clicks to pass through to timeline background
    e.stopPropagation();
    onClick?.(); // Ensure selection even when resizing starts
    setIsResizing(direction);
    
    const startX = e.clientX;
    const initialStart = start;
    const initialDuration = duration;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSeconds = deltaX / zoom;

      if (direction === 'left') {
        let newStart = Math.max(0, Math.min(initialStart + initialDuration - minDuration, initialStart + deltaSeconds));
        let newDuration = initialDuration + (initialStart - newStart);
        
        // Snapping logic for resize left
        if (snapPoints && snapPoints.length > 0) {
          const snapThreshold = 10 / zoom;
          for (const snapPoint of snapPoints) {
            if (Math.abs(newStart - snapPoint) < snapThreshold) {
              newStart = snapPoint;
              newDuration = initialDuration + (initialStart - newStart);
              break;
            }
          }
        }
        
        onUpdate(newStart, newDuration);
      } else {
        let newDuration = Math.max(minDuration, initialDuration + deltaSeconds);
        const newEnd = initialStart + newDuration;

        // Snapping logic for resize right
        if (snapPoints && snapPoints.length > 0) {
          const snapThreshold = 10 / zoom;
          for (const snapPoint of snapPoints) {
            if (Math.abs(newEnd - snapPoint) < snapThreshold) {
              newDuration = snapPoint - initialStart;
              break;
            }
          }
        }
        
        onUpdate(initialStart, newDuration);
      }
    };

    const onMouseUp = () => {
      setIsResizing(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <motion.div
      className={`absolute rounded cursor-move border transition-all group timeline-grid-bg ${
        isSelected ? 'z-20 ring-2 ring-indigo-500 ring-offset-1 shadow-lg' : 'z-10 shadow-sm'
      } ${color} ${isResizing ? 'shadow-2xl scale-[1.01] opacity-90 z-30' : ''} ${isDragOver ? 'ring-2 ring-white scale-[1.02] z-40' : ''} ${className}`}
      style={{ left: `${start * zoom}px`, width: `${duration * zoom}px` }}
      onMouseDown={handleDragMouseDown}
      onClick={() => {
        // Only trigger click selection if not resizing or dragging
        if (!isResizing) {
          onClick?.();
        }
      }}
      onDragOver={(e: React.DragEvent) => {
        if (onDrop) {
          e.preventDefault();
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e: React.DragEvent) => {
        if (onDrop) {
          e.preventDefault();
          setIsDragOver(false);
          try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            onDrop(data);
          } catch (err) {
            console.error("Drop failed:", err);
          }
        }
      }}
    >
      {/* Left Resize Handle */}
      <div
        className="absolute left-0 top-0 w-2 h-full cursor-ew-resize hover:bg-black/20 z-30 rounded-l flex items-center justify-center transition-colors"
        onMouseDown={(e) => handleResize('left', e)}
      >
        <div className="w-0.5 h-3 bg-black/10 rounded-full" />
      </div>

      <div className="flex-1 h-full px-1 truncate text-[10px] font-bold select-none flex items-center justify-between overflow-hidden pointer-events-none">
        {children || (
          <div className="flex-1 px-2 flex items-center justify-between overflow-hidden">
            <span className="truncate">{label}</span>
            {onDelete && isSelected && (
              <button
                title="Delete item"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onDelete(); 
                }}
                className="p-1 hover:bg-black/10 rounded transition-colors pointer-events-auto"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right Resize Handle */}
      <div
        className="absolute right-0 top-0 w-2 h-full cursor-ew-resize hover:bg-black/20 z-30 rounded-r flex items-center justify-center transition-colors"
        onMouseDown={(e) => handleResize('right', e)}
      >
        <div className="w-0.5 h-3 bg-black/10 rounded-full" />
      </div>
    </motion.div>
  );
};

interface TimelineProps {
  currentTime: number;
  videoDuration: number;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  srtData: { id: number; start: number; end: number; text: string }[];
  setSrtData: React.Dispatch<React.SetStateAction<{ id: number; start: number; end: number; text: string }[]>>;
  setEditingSrtId: (id: number | null) => void;
  content: AppContent | null;
  setContent: React.Dispatch<React.SetStateAction<AppContent | null>>;
  selectedVisuals: Record<number, string[]>;
  setSelectedVisuals: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  visualCandidates: Record<number, SceneCandidates>;
  setVisualCandidates: React.Dispatch<React.SetStateAction<Record<number, SceneCandidates>>>;
  setSceneDurations: React.Dispatch<React.SetStateAction<number[]>>;
  audioEdit: {
    bgm_path: string | null;
    bgm_volume: number;
    sfx_list: { path: string; time: number; volume: number }[];
  };
  setAudioEdit: React.Dispatch<React.SetStateAction<{
    bgm_path: string | null;
    bgm_volume: number;
    sfx_list: { path: string; time: number; volume: number }[];
  }>>;
  getTimelineRange: (script: ScriptItem[] | undefined, idx: number) => { start: string; end: string; duration: string };
  selectedItem: { id: string | number; type: 'subtitle' | 'scene' | 'sfx' | 'bgm' } | null;
  setSelectedItem: (item: { id: string | number; type: 'subtitle' | 'scene' | 'sfx' | 'bgm' } | null) => void;
  onDelete: (id?: string | number, type?: 'subtitle' | 'sfx' | 'bgm') => void;
}

const Timeline: React.FC<TimelineProps> = ({
  currentTime,
  videoDuration,
  isPlaying,
  setIsPlaying,
  setCurrentTime,
  srtData,
  setSrtData,
  setEditingSrtId,
  content,
  setContent,
  selectedVisuals,
  setSelectedVisuals,
  visualCandidates,
  setVisualCandidates,
  setSceneDurations,
  audioEdit,
  setAudioEdit,
  getTimelineRange,
  selectedItem,
  setSelectedItem,
  onDelete
}) => {
  const [zoom, setZoom] = useState(100); // pixels per second (Increased default zoom)
  const [headerWidth, setHeaderWidth] = useState(144); // Track header width
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingSfx, setIsDraggingSfx] = useState(false);
  const [isDraggingBgm, setIsDraggingBgm] = useState(false);
  const [isDraggingVisual, setIsDraggingVisual] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);

  // Track heights state
  const [trackHeights] = useState({
    sub: 32,
    vis: 32,
    bgm: 32,
    sfx: 32
  });

  // Debug srtData
  useEffect(() => {
    if (srtData.length > 0) {
      console.log("Timeline: srtData loaded:", srtData.length, "items");
    }
  }, [srtData]);

  const [autoSnap, setAutoSnap] = useState(true); // Auto Snapping 기능 상태
  const [rippleEdit, setRippleEdit] = useState(false); // Ripple Editing 기능 상태
  const [bookmarks, setBookmarks] = useState<number[]>([]); // Bookmarks state
  const containerRef = useRef<HTMLDivElement>(null);

  const startHeaderResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = headerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let newWidth = startWidth + deltaX;
      if (newWidth < 80) newWidth = 80;
      if (newWidth > 300) newWidth = 300;
      setHeaderWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [headerWidth]);

  const formatTimeHelper = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const deciseconds = Math.floor((time % 1) * 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${deciseconds}`;
  }, []);

  const maxTimelineDuration = Math.max(
    videoDuration,
    srtData.length > 0 ? srtData[srtData.length - 1].end : 0,
    audioEdit.sfx_list.length > 0 ? Math.max(...audioEdit.sfx_list.map(s => s.time + 2)) : 0,
    30
  );

  const handleSyncVisuals = useCallback(() => {
    // Reset scene durations to follow subtitles
    setSceneDurations([]);
    setSelectedItem(null);
  }, [setSceneDurations, setSelectedItem]);

  const handleSplit = useCallback((mode: 'both' | 'left' | 'right' = 'both', splitTime?: number) => {
    const timeToUse = splitTime !== undefined ? splitTime : currentTime;
    
    // [수정] 자막 선택 로직 강화 - 즉시 선택되지 않는 문제 해결
    // 1. 현재 선택된 아이템이 있다면 그것을 우선순위로 함
    // 2. 선택된 게 없다면 현재 시간(Playhead) 위치의 자막을 찾음
    let targetSrtIdx = -1;
    
    if (selectedItem?.type === 'subtitle') {
      targetSrtIdx = srtData.findIndex(s => s.id === selectedItem.id);
    }
    
    if (targetSrtIdx === -1) {
      targetSrtIdx = srtData.findIndex(s => timeToUse >= s.start && timeToUse <= s.end);
    }

    if (targetSrtIdx !== -1 && content) {
      const targetSrt = srtData[targetSrtIdx];
      
      if (timeToUse > targetSrt.start && timeToUse < targetSrt.end) {
        if (mode === 'left') {
          if (timeToUse >= targetSrt.end) return;
          const updatedSrtData = [...srtData];
          updatedSrtData[targetSrtIdx] = { ...targetSrt, start: timeToUse };
          setSrtData(updatedSrtData);
          
          setSceneDurations(prev => {
            const next = [...prev];
            if (next.length === 0) {
              content.script.forEach((_, i) => {
                const r = getTimelineRange(content.script, i);
                next[i] = parseFloat(r.duration);
              });
            }
            next[targetSrtIdx] = targetSrt.end - timeToUse;
            return next;
          });
          return;
        } else if (mode === 'right') {
          if (timeToUse <= targetSrt.start) return;
          const updatedSrtData = [...srtData];
          updatedSrtData[targetSrtIdx] = { ...targetSrt, end: timeToUse };
          setSrtData(updatedSrtData);
          
          setSceneDurations(prev => {
            const next = [...prev];
            if (next.length === 0) {
              content.script.forEach((_, i) => {
                const r = getTimelineRange(content.script, i);
                next[i] = parseFloat(r.duration);
              });
            }
            next[targetSrtIdx] = timeToUse - targetSrt.start;
            return next;
          });
          return;
        }

        // Mode 'both': original split logic
        // A. Update SRT Data
        const newSrtId = Math.max(...srtData.map(s => s.id), 0) + 1;
        const newSrt = {
          id: newSrtId,
          start: timeToUse,
          end: targetSrt.end,
          text: targetSrt.text // Initially same text
        };

        const updatedSrtData = [...srtData];
        updatedSrtData[targetSrtIdx] = { ...targetSrt, end: timeToUse };
        updatedSrtData.splice(targetSrtIdx + 1, 0, newSrt);
        setSrtData(updatedSrtData);

        // B. Update Content (Script & Scenes)
        const updatedScript = [...content.script];
        const updatedScenes = [...content.scenes];
        
        const scriptItem = updatedScript[targetSrtIdx];
        const sceneItem = updatedScenes[targetSrtIdx];

        if (scriptItem && sceneItem) {
          const newScriptItem = { ...scriptItem };
          const newSceneItem = { ...sceneItem };

          updatedScript.splice(targetSrtIdx + 1, 0, newScriptItem);
          updatedScenes.splice(targetSrtIdx + 1, 0, newSceneItem);

          // Update scene_index for all items
          updatedScript.forEach((item, idx) => {
            item.scene_index = idx;
          });

          setContent({
            script: updatedScript,
            scenes: updatedScenes
          });

          // C. Update Selected Visuals & Candidates
          // Shift all indices after targetSrtIdx
          const newSelectedVisuals: Record<number, string[]> = {};
          const newVisualCandidates: Record<number, SceneCandidates> = {};

          Object.entries(selectedVisuals).forEach(([idxStr, visuals]) => {
            const idx = parseInt(idxStr);
            if (idx <= targetSrtIdx) {
              newSelectedVisuals[idx] = visuals;
            } else {
              newSelectedVisuals[idx + 1] = visuals;
            }
          });
          // Duplicate visual for the new split part
          newSelectedVisuals[targetSrtIdx + 1] = selectedVisuals[targetSrtIdx] || [];

          Object.entries(visualCandidates).forEach(([idxStr, candidates]) => {
            const idx = parseInt(idxStr);
            if (idx <= targetSrtIdx) {
              newVisualCandidates[idx] = candidates;
            } else {
              newVisualCandidates[idx + 1] = candidates;
            }
          });
          // Duplicate candidates for the new split part
          newVisualCandidates[targetSrtIdx + 1] = visualCandidates[targetSrtIdx] || { ai: [], search: [], graph: [] };

          setSelectedVisuals(newSelectedVisuals);
          setVisualCandidates(newVisualCandidates);

          // D. Set Scene Durations explicitly for both parts
          setSceneDurations(prev => {
            const next = [...prev];
            if (next.length === 0) {
              content.script.forEach((_, i) => {
                const r = getTimelineRange(content.script, i);
                next[i] = parseFloat(r.duration);
              });
            }
            // Insert new duration
            next.splice(targetSrtIdx + 1, 0, targetSrt.end - timeToUse);
            // Update current duration
            next[targetSrtIdx] = timeToUse - targetSrt.start;
            return next;
          });
          
          setSelectedItem({ id: newSrtId, type: 'subtitle' });
          setEditingSrtId(newSrtId);
          return;
        }
      }
    }

    // 2. Handle SFX split
    if (selectedItem?.type === 'sfx') {
      const sfxIdx = parseInt(selectedItem.id.toString().replace('sfx-', ''));
      const targetSfx = audioEdit.sfx_list[sfxIdx];
      
      if (targetSfx && timeToUse > targetSfx.time && timeToUse < targetSfx.time + 2) {
        if (mode === 'left') {
          setAudioEdit(prev => {
            const newList = [...prev.sfx_list];
            newList[sfxIdx] = { ...targetSfx, time: timeToUse };
            return { ...prev, sfx_list: newList };
          });
        } else if (mode === 'right') {
          // SFX doesn't have a strict end time in our simple model (fixed 2s duration for UI), 
          // but we can just leave it as is or remove it if right cut means it ends at current time
          // For simplicity, we just shorten it visually by doing nothing or moving it
        } else {
          // both
          setAudioEdit(prev => {
            const newList = [...prev.sfx_list];
            newList.splice(sfxIdx + 1, 0, { ...targetSfx, time: timeToUse });
            return { ...prev, sfx_list: newList };
          });
        }
      }
    }
  }, [srtData, selectedItem, currentTime, content, selectedVisuals, visualCandidates, setSrtData, setEditingSrtId, setContent, setSelectedVisuals, setVisualCandidates, setSceneDurations, getTimelineRange, setSelectedItem, audioEdit, setAudioEdit]);

  const handleSeparateAudio = useCallback(() => {
    if (!content) return;
    const sceneIdx = content.scenes.findIndex((_, idx) => {
      const range = getTimelineRange(content.script, idx);
      return currentTime > parseFloat(range.start) && currentTime < parseFloat(range.end);
    });

    if (sceneIdx !== -1) {
      const visuals = selectedVisuals[sceneIdx];
      if (visuals && visuals.length > 0) {
        // Find the first video visual
        const videoPath = visuals.find(v => v.endsWith('.mp4') || v.endsWith('.webm'));
        if (videoPath) {
          setAudioEdit(prev => ({
            ...prev,
            sfx_list: [
              ...prev.sfx_list,
              { path: videoPath, time: currentTime, volume: 1.0 }
            ]
          }));
        }
      }
    }
  }, [content, currentTime, getTimelineRange, selectedVisuals, setAudioEdit]);

  const handleDuplicate = useCallback(() => {
    if (!selectedItem) return;
    
    if (selectedItem.type === 'subtitle') {
      const targetIdx = srtData.findIndex(s => s.id === selectedItem.id);
      if (targetIdx !== -1) {
        const target = srtData[targetIdx];
        const duration = target.end - target.start;
        const newSrtId = Math.max(...srtData.map(s => s.id), 0) + 1;
        
        const newSrt = {
          ...target,
          id: newSrtId,
          start: target.end,
          end: target.end + duration
        };

        const updatedSrtData = [...srtData];
        // Shift all subsequent items by duration
        for (let i = targetIdx + 1; i < updatedSrtData.length; i++) {
          updatedSrtData[i] = {
            ...updatedSrtData[i],
            start: updatedSrtData[i].start + duration,
            end: updatedSrtData[i].end + duration
          };
        }
        updatedSrtData.splice(targetIdx + 1, 0, newSrt);
        setSrtData(updatedSrtData);

        if (content) {
          const updatedScript = [...content.script];
          const updatedScenes = [...content.scenes];
          updatedScript.splice(targetIdx + 1, 0, { ...updatedScript[targetIdx] });
          updatedScenes.splice(targetIdx + 1, 0, { ...updatedScenes[targetIdx] });
          
          updatedScript.forEach((item, idx) => item.scene_index = idx);
          setContent({ script: updatedScript, scenes: updatedScenes });

          const newSelectedVisuals: Record<number, string[]> = {};
          const newVisualCandidates: Record<number, SceneCandidates> = {};
          
          Object.entries(selectedVisuals).forEach(([idxStr, visuals]) => {
            const idx = parseInt(idxStr);
            if (idx <= targetIdx) newSelectedVisuals[idx] = visuals;
            else newSelectedVisuals[idx + 1] = visuals;
          });
          newSelectedVisuals[targetIdx + 1] = selectedVisuals[targetIdx] || [];

          Object.entries(visualCandidates).forEach(([idxStr, candidates]) => {
            const idx = parseInt(idxStr);
            if (idx <= targetIdx) newVisualCandidates[idx] = candidates;
            else newVisualCandidates[idx + 1] = candidates;
          });
          newVisualCandidates[targetIdx + 1] = visualCandidates[targetIdx] || { ai: [], search: [], graph: [] };

          setSelectedVisuals(newSelectedVisuals);
          setVisualCandidates(newVisualCandidates);
          setSceneDurations([]);
        }
      }
    } else if (selectedItem.type === 'sfx') {
      const sfxIdx = parseInt(selectedItem.id.toString().replace('sfx-', ''));
      const target = audioEdit.sfx_list[sfxIdx];
      if (target) {
        setAudioEdit(prev => {
          const newList = [...prev.sfx_list];
          newList.splice(sfxIdx + 1, 0, { ...target, time: target.time + 2 });
          return { ...prev, sfx_list: newList };
        });
      }
    }
  }, [selectedItem, srtData, setSrtData, content, setContent, selectedVisuals, setSelectedVisuals, visualCandidates, setVisualCandidates, setSceneDurations, audioEdit, setAudioEdit]);

  const handleFreezeFrame = useCallback(() => {
    // For freeze frame, we duplicate the current scene but it will act as an image
    handleDuplicate();
  }, [handleDuplicate]);

  const handleAddBookmark = useCallback(() => {
    setBookmarks(prev => {
      const newBookmarks = [...prev, currentTime];
      return Array.from(new Set(newBookmarks)).sort((a, b) => a - b);
    });
  }, [currentTime]);

  const handleTimelineClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    
    // Check if we clicked on the timeline area or one of its children that should trigger seek
    const target = e.target as HTMLElement;
    const isTimelineArea = target === e.currentTarget || target.closest('.timeline-grid-bg');
    
    if (!isTimelineArea) {
       // However, if we're in split mode, we WANT to trigger split even on items
       if (!isSplitMode) return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const x = clientX - rect.left + containerRef.current.scrollLeft;
    
    const time = Math.max(0, Math.min(maxTimelineDuration, x / zoom));
    setCurrentTime(time);

    // If split mode is active, trigger split at this position
    if (isSplitMode) {
      handleSplit('both', time); // Use specific time to be accurate
      setIsSplitMode(false);
    }
  }, [maxTimelineDuration, zoom, setCurrentTime, isSplitMode, handleSplit]);

  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
  }, []);

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const contentX = e.clientX - rect.left + containerRef.current.scrollLeft;
      const time = Math.max(0, Math.min(maxTimelineDuration, contentX / zoom));
      setCurrentTime(time);
    };

    const onMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingPlayhead, maxTimelineDuration, zoom, setCurrentTime]);

  const snapPoints = React.useMemo(() => {
    const points = [0, videoDuration, currentTime];
    srtData.forEach(s => {
      points.push(s.start);
      points.push(s.end);
    });
    audioEdit.sfx_list.forEach(s => {
      points.push(s.time);
      points.push(s.time + 2); // Default 2s for SFX
    });
    return Array.from(new Set(points));
  }, [currentTime, srtData, audioEdit.sfx_list, videoDuration]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        handleSplit();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedItem && !isPlaying) {
          onDelete(selectedItem.id, selectedItem.type === 'scene' ? undefined : selectedItem.type as 'subtitle' | 'sfx' | 'bgm');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying, onDelete, handleSplit, selectedItem]);

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden select-none">
      {/* Header / Toolbar */}
      <div className="h-10 bg-white border-b border-zinc-200 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-zinc-100 text-zinc-600 hover:text-indigo-600'}`}
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black text-indigo-500 tracking-tighter">
                {new Date(currentTime * 1000).toISOString().substr(14, 5)}
              </span>
              <span className="text-[9px] font-mono text-zinc-500">
                / {new Date(videoDuration * 1000).toISOString().substr(14, 5)}
              </span>
            </div>
          </div>

          <div className="h-5 w-px bg-zinc-200" />

          <div className="flex items-center gap-1.5">
            <button 
              title="Split timeline"
              onClick={() => setIsSplitMode(!isSplitMode)}
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all border ${
                isSplitMode 
                  ? 'bg-red-100 text-red-600 border-red-200' 
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 hover:text-zinc-800'
              }`}
            >
              <Scissors size={14} className={isSplitMode ? 'animate-pulse' : ''} />
            </button>
            <button 
              title="Split timeline both sides"
              onClick={() => handleSplit('both')}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200"
            >
              <SplitSquareHorizontal size={14} />
            </button>
            <button 
              title="Split timeline left side"
              onClick={() => handleSplit('left')}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200"
            >
              <ArrowLeftToLine size={14} />
            </button>
            <button 
              title="Split timeline right side"
              onClick={() => handleSplit('right')}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200"
            >
              <ArrowRightToLine size={14} />
            </button>
            
            <div className="h-4 w-px bg-zinc-200 mx-1" />

            <button 
              title="Separate audio from video"
              onClick={handleSeparateAudio}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200"
            >
              <Unlink size={14} />
            </button>
            <button 
              title="Duplicate selected item"
              onClick={handleDuplicate}
              disabled={!selectedItem}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Copy size={14} />
            </button>
            <button 
              title="Freeze selected frame"
              onClick={handleFreezeFrame}
              disabled={!selectedItem}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Snowflake size={14} />
            </button>
            <button 
              title="Add bookmark"
              onClick={handleAddBookmark}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200 rounded-lg transition-all border border-zinc-200"
            >
              <Bookmark size={14} />
            </button>

            <div className="h-4 w-px bg-zinc-200 mx-1" />
            <button 
              title="Delete selected item"
              onClick={() => selectedItem && onDelete(selectedItem.id, selectedItem.type as 'subtitle' | 'sfx' | 'bgm')}
              disabled={!selectedItem}
              className="flex items-center justify-center w-7 h-7 bg-zinc-100 text-zinc-500 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <button 
              title="Toggle auto snap"
              onClick={() => setAutoSnap(!autoSnap)}
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all border ${
                autoSnap ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-200 hover:text-zinc-700'
              }`}
            >
              <Magnet size={14} />
            </button>
            <button 
              title="Toggle ripple edit"
              onClick={() => setRippleEdit(!rippleEdit)}
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all border ${
                rippleEdit ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-200 hover:text-zinc-700'
              }`}
            >
              <Link size={14} />
            </button>
          </div>

          <div className="h-5 w-px bg-zinc-200" />

          <div className="flex items-center gap-2 bg-zinc-100 px-2.5 py-0.5 rounded-xl border border-zinc-200">
            <ZoomOut size={12} className="text-zinc-500 cursor-pointer hover:text-zinc-700" onClick={() => setZoom(prev => Math.max(10, prev - 10))} />
            <input 
              title="Zoom timeline"
              type="range" 
              min="10" 
              max="200" 
              value={zoom} 
              onChange={(e) => setZoom(parseInt(e.target.value))}
              className="w-20 accent-indigo-600 h-1 bg-zinc-200 rounded-full appearance-none cursor-pointer"
            />
            <ZoomIn size={12} className="text-zinc-500 cursor-pointer hover:text-zinc-700" onClick={() => setZoom(prev => Math.min(200, prev + 10))} />
          </div>

          <button 
            title="Sync visuals with subtitles"
            onClick={handleSyncVisuals}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-all border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white"
          >
            <Wand2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Track Headers (Fixed Left) */}
        <div 
          title="Track headers"
          className="bg-zinc-50 border-r border-zinc-200 flex flex-col shrink-0 z-30 relative timeline-grid-bg"
          style={{ width: `${headerWidth}px` }}
        >
          <div className="h-6 border-b border-zinc-200 bg-zinc-50 flex items-center px-3 shrink-0">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Tracks</span>
          </div>
          <div className="flex flex-col">
            {/* Track 1: Subtitles */}
            <div 
              title="Subtitles track"
              style={{ height: `${trackHeights.sub}px` }} className="flex items-center px-2 border-b border-zinc-200 group hover:bg-zinc-100 transition-colors gap-2 shrink-0 timeline-grid-bg">
              <div className="w-4 h-4 bg-amber-500/10 text-amber-500 rounded flex items-center justify-center shrink-0"><Type size={10} /></div>
            </div>
            
            {/* Track 2: Visuals */}
            <div 
              title="Visuals track"
              style={{ height: `${trackHeights.vis}px` }} className="flex items-center px-2 border-b border-zinc-200 group hover:bg-zinc-100 transition-colors gap-2 shrink-0 timeline-grid-bg">
              <div className="w-4 h-4 bg-indigo-500/10 text-indigo-500 rounded flex items-center justify-center shrink-0"><ImageIcon size={10} /></div>
            </div>

            {/* Track 3: BGM */}
            <div 
              title="BGM track"
              style={{ height: `${trackHeights.bgm}px` }} className="flex items-center px-2 border-b border-zinc-200 group hover:bg-zinc-100 transition-colors gap-2 shrink-0 timeline-grid-bg">
              <div className="w-4 h-4 bg-purple-500/10 text-purple-500 rounded flex items-center justify-center shrink-0"><Music size={10} /></div>
            </div>

            {/* Track 4: SFX */}
            <div 
              title="SFX track"
              style={{ height: `${trackHeights.sfx}px` }} className="flex items-center px-2 border-b border-zinc-200 group hover:bg-zinc-100 transition-colors gap-2 shrink-0 timeline-grid-bg">
              <div className="w-4 h-4 bg-emerald-500/10 text-emerald-500 rounded flex items-center justify-center shrink-0"><Volume2 size={10} /></div>
            </div>
          </div>
          
          {/* Header Resizer */}
          <div 
            className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-40"
            onMouseDown={startHeaderResize}
          />
        </div>

        {/* Scrollable Timeline Area */}
        <div 
          ref={containerRef}
          className={`flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar bg-white timeline-grid-bg ${isSplitMode ? 'cursor-crosshair' : ''}`}
          onClick={handleTimelineClick}
        >
          {!content && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center bg-zinc-50/60 backdrop-blur-[1px]">
               <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-lg border border-zinc-100 flex items-center justify-center ring-1 ring-black/5">
                    <Clock size={24} className="text-zinc-300" />
                  </div>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Load a project to see timeline</span>
               </div>
            </div>
          )}
          <div 
            title="Timeline area"
            className="h-full relative timeline-grid-bg"
            style={{ width: `${maxTimelineDuration * zoom + 160}px` }}
          >
            {/* Time Ruler */}
            <div className="h-6 border-b border-zinc-200 sticky top-0 bg-white/95 backdrop-blur-md z-20 overflow-hidden timeline-grid-bg">
              {Array.from({ length: Math.ceil(maxTimelineDuration / 5) + 1 }).map((_, i) => (
                <div 
                  key={i} 
                  className="absolute top-0 flex flex-col items-start"
                  style={{ left: `${i * 5 * zoom}px` }}
                >
                  <div className="h-3 w-px bg-zinc-400 mt-0" />
                  <span className="text-[8px] font-mono text-zinc-500 pl-1.5 mt-0.5 font-bold leading-none">
                    {Math.floor(i * 5 / 60)}:{(i * 5 % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              ))}
              {/* Minor ticks (every 1 second) */}
              {Array.from({ length: Math.ceil(maxTimelineDuration) }).map((_, i) => (
                i % 5 !== 0 && (
                  <div 
                    key={i} 
                    className="absolute top-0 h-1.5 w-px bg-zinc-200"
                    style={{ left: `${i * zoom}px` }}
                  />
                )
              ))}
              
              {/* Bookmarks */}
              {bookmarks.map((time, i) => (
                <div 
                  title={`Bookmark at ${formatTimeHelper(time)}`}
                  key={`bookmark-${i}`} 
                  className="absolute top-0 w-0 h-full flex justify-center z-30 group cursor-pointer"
                  style={{ left: `${time * zoom}px` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentTime(time);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setBookmarks(prev => prev.filter(t => t !== time));
                  }}
                >
                  <div className="w-px h-full bg-blue-400" />
                  <Bookmark size={10} className="absolute top-0 text-blue-500 fill-blue-500" />
                  <div className="absolute top-3 opacity-0 group-hover:opacity-100 bg-blue-500 text-white text-[8px] px-1 py-0.5 rounded shadow-sm transition-opacity whitespace-nowrap pointer-events-none">
                    {formatTimeHelper(time)}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid Background */}
            <div 
              title="Timeline grid background"
              className="absolute inset-0 pointer-events-none opacity-[0.03]"
              style={{ 
                backgroundImage: `linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)`,
                backgroundSize: `${zoom}px 100%, 100% 48px`,
                top: '24px'
              }}
            />

            {/* Tracks Content Area */}
            <div className="relative pt-0">
              {/* Subtitle Track */}
              <div 
                title="Subtitle track"
                style={{ height: `${trackHeights.sub}px` }} className="relative border-b border-zinc-800/10 timeline-grid-bg">
                {srtData.map((srt) => (
                  <TimelineItem
                    key={`srt-${srt.id}`}
                    id={srt.id}
                    start={srt.start}
                    duration={srt.end - srt.start}
                    zoom={zoom}
                    color={selectedItem?.type === 'subtitle' && selectedItem.id === srt.id ? "bg-amber-400 border-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.4)]" : "bg-amber-100 border-amber-300 hover:bg-amber-200"}
                    label={srt.text}
                    isSelected={selectedItem?.type === 'subtitle' && selectedItem.id === srt.id}
                    isSplitMode={isSplitMode}
                    onClick={() => setSelectedItem({ id: srt.id, type: 'subtitle' })}
                    snapPoints={autoSnap ? snapPoints.filter(p => p !== srt.start && p !== srt.end) : []}
                    onUpdate={(newStart, newDuration) => {
                      const newEnd = newStart + newDuration;
                      const oldDuration = srt.end - srt.start;
                      const durationDiff = newDuration - oldDuration;
                      const startDiff = newStart - srt.start;
                      const offset = startDiff + durationDiff;
                      
                      // 1. Update SRT Data
                      setSrtData(prev => {
                        const srtIdx = prev.findIndex(s => s.id === srt.id);
                        return prev.map((s, i) => {
                          if (i === srtIdx) {
                            return { ...s, start: newStart, end: newEnd };
                          }
                          if (rippleEdit && i > srtIdx) {
                            return { ...s, start: s.start + offset, end: s.end + offset };
                          }
                          return s;
                        });
                      });

                      // 2. Sync with Scene Durations
                      const srtIdx = srtData.findIndex(s => s.id === srt.id);
                      if (srtIdx !== -1) {
                        setSceneDurations(prev => {
                          const next = [...prev];
                          if (next.length === 0 && content) {
                            content.script.forEach((_, i) => {
                              const r = getTimelineRange(content.script, i);
                              next[i] = parseFloat(r.duration);
                            });
                          }
                          next[srtIdx] = newDuration;
                          return next;
                        });

                        // If start changed, adjust previous scene (only if not ripple editing)
                        if (!rippleEdit && Math.abs(startDiff) > 0.01 && srtIdx > 0) {
                          setSceneDurations(prev => {
                            const next = [...prev];
                            const prevRange = getTimelineRange(content?.script, srtIdx - 1);
                            const prevStart = parseFloat(prevRange.start);
                            next[srtIdx - 1] = Math.max(0.1, newStart - prevStart);
                            return next;
                          });
                        }
                      }
                    }}
                    onDelete={() => onDelete(srt.id, 'subtitle')}
                    className="inset-y-1 h-[calc(100%-8px)] rounded-md border-2"
                  >
                    <div className="flex items-center gap-1.5 px-2 w-full h-full overflow-hidden">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-600 shadow-[0_0_4px_rgba(245,158,11,0.5)] shrink-0" />
                      <span className="truncate text-zinc-900 font-bold tracking-tight text-[10px]">{srt.text}</span>
                    </div>
                  </TimelineItem>
                ))}
              </div>

              {/* Visual Track */}
              <div 
                title="Visual track"
                style={{ height: `${trackHeights.vis}px` }}
                className={`relative border-b border-zinc-200 transition-colors timeline-grid-bg ${isDraggingVisual ? 'bg-indigo-100' : 'bg-indigo-50/40'}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingVisual(true);
                }}
                onDragLeave={() => setIsDraggingVisual(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingVisual(false);
                  try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.type === 'media' && content?.scenes) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const time = x / zoom;
                      
                      // Find which scene this time corresponds to
                      const sceneIdx = content.scenes.findIndex((_, idx) => {
                        const range = getTimelineRange(content?.script, idx);
                        return time >= parseFloat(range.start) && time <= parseFloat(range.end);
                      });

                      if (sceneIdx !== -1) {
                        setSelectedVisuals(prev => ({
                          ...prev,
                          [sceneIdx]: [data.path]
                        }));
                      }
                    }
                  } catch (err) {
                    console.error("Visual drop failed:", err);
                  }
                }}
              >
                {content?.scenes?.map((_, idx) => {
                  const range = getTimelineRange(content?.script, idx);
                  const start = parseFloat(range.start);
                  const duration = parseFloat(range.duration);
                  const selected = selectedVisuals[idx];
                  const firstImgPath = selected?.[0];
                  
                  // Image Preview Resolution
                  let previewSrc = null;
                  if (firstImgPath) {
                    const candidate = visualCandidates[idx]?.ai?.find((v: { path: string; url?: string }) => v.path === firstImgPath || v.url === firstImgPath) || 
                                      visualCandidates[idx]?.search?.find((v: { path: string; url?: string }) => v.path === firstImgPath || v.url === firstImgPath);
                    
                    if (candidate && candidate.url) {
                      previewSrc = candidate.url.startsWith('http') ? candidate.url : `http://localhost:8000${candidate.url.startsWith('/') ? '' : '/'}${candidate.url}`;
                    } else if (firstImgPath.startsWith('http')) {
                      previewSrc = firstImgPath;
                    } else {
                      // Normalize path and ensure it starts with /assets/ if it's a relative path
                      const normalizedPath = firstImgPath.replace(/\\/g, '/');
                      const assetsMatch = normalizedPath.match(/.*(\/assets\/.*)/);
                      if (assetsMatch) {
                        previewSrc = `http://localhost:8000${assetsMatch[1]}`;
                      } else {
                        const pathWithAssets = normalizedPath.startsWith('assets/') ? normalizedPath : 
                                              (normalizedPath.startsWith('/assets/') ? normalizedPath.substring(1) : `assets/${normalizedPath}`);
                        previewSrc = `http://localhost:8000/${pathWithAssets}`;
                      }
                    }
                    
                    if (previewSrc && previewSrc.includes('/assets/assets/')) {
                      previewSrc = previewSrc.replace('/assets/assets/', '/assets/');
                    }
                  }

                  return (
                    <TimelineItem
                      key={`scene-${idx}`}
                      id={idx}
                      start={start}
                      duration={duration}
                      zoom={zoom}
                      color={selectedItem?.type === 'scene' && selectedItem.id === idx ? "bg-indigo-200 border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.2)]" : "bg-white border-zinc-300 hover:bg-zinc-100"}
                      isSelected={selectedItem?.type === 'scene' && selectedItem.id === idx}
                      isSplitMode={isSplitMode}
                      onClick={() => setSelectedItem({ id: idx, type: 'scene' })}
                      snapPoints={autoSnap ? snapPoints.filter(p => p !== start && p !== (start + duration)) : []}
                      onDrop={(data) => {
                        if (data.type === 'media') {
                          setSelectedVisuals(prev => ({
                            ...prev,
                            [idx]: [data.path]
                          }));
                        }
                      }}
                      onUpdate={(newStart, newDuration) => {
                        const newEnd = newStart + newDuration;

                        // 1. Update current scene duration
                        setSceneDurations(prev => {
                          const next = [...prev];
                          if (next.length === 0 && content?.script) {
                            content.script.forEach((_, i) => {
                              const r = getTimelineRange(content.script, i);
                              next[i] = parseFloat(r.duration);
                            });
                          }
                          next[idx] = newDuration;
                          return next;
                        });

                        // 2. Adjust SRT to match scene
                        setSrtData(prev => {
                          const next = [...prev];
                          if (next[idx]) {
                            next[idx] = { ...next[idx], start: newStart, end: newEnd };
                          }
                          return next;
                        });

                        // 3. If start changed, we need to adjust previous scene's end
                        if (Math.abs(newStart - start) > 0.01 && idx > 0) {
                          setSceneDurations(prev => {
                            const next = [...prev];
                            const prevRange = getTimelineRange(content?.script, idx - 1);
                            const prevStart = parseFloat(prevRange.start);
                            next[idx - 1] = Math.max(0.1, newStart - prevStart);
                            return next;
                          });
                        }
                      }}
                      className="inset-y-1 h-[calc(100%-8px)] rounded-md overflow-hidden"
                    >
                      <div className="relative w-full h-full group/scene">
                        {previewSrc ? (
                          <img src={previewSrc} className="w-full h-full object-cover opacity-60 group-hover/scene:opacity-100 transition-opacity duration-500" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-100">
                            <ImageIcon size={14} className="text-zinc-400" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-1">
                          <span className="text-[7px] font-black text-white/70 tracking-tighter uppercase">Scene {idx + 1}</span>
                        </div>
                      </div>
                    </TimelineItem>
                  );
                })}
              </div>

              {/* BGM Track */}
              <div 
                title="BGM track"
                style={{ height: `${trackHeights.bgm}px` }}
                className={`relative border-b border-zinc-200 transition-colors timeline-grid-bg ${isDraggingBgm ? 'bg-purple-100' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingBgm(true);
                }}
                onDragLeave={() => setIsDraggingBgm(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingBgm(false);
                  try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.type === 'bgm') {
                      setAudioEdit(prev => ({
                        ...prev,
                        bgm_path: data.path
                      }));
                    }
                  } catch (err) {
                    console.error("BGM drop failed:", err);
                  }
                }}
              >
                {audioEdit.bgm_path && (
                  <div title="Audio Edit track">
                    <TimelineItem
                    id="bgm-0"
                    start={0}
                    duration={videoDuration || 300}
                    zoom={zoom}
                    color={selectedItem?.type === 'bgm' ? "bg-purple-200 border-purple-500" : "bg-purple-50 border-purple-200"}
                    label={audioEdit.bgm_path.split('/').pop() || 'Background Music'}
                    isSelected={selectedItem?.type === 'bgm'}
                    isSplitMode={isSplitMode}
                    onClick={() => setSelectedItem({ id: 'bgm-0', type: 'bgm' })}
                    onUpdate={() => {}}
                    onDelete={() => onDelete('bgm-0', 'bgm')}
                    className="inset-y-1 h-[calc(100%-8px)] rounded-md"
                  >
                    <div className="flex items-center gap-1.5 px-2 h-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                      <span className="truncate text-purple-700 font-bold text-[8px]">{audioEdit.bgm_path.split('/').pop()}</span>
                    </div>
                  </TimelineItem>
                </div>
              )}
              </div>

              {/* SFX Track */}
              <div 
                title="SFX track"
                style={{ height: `${trackHeights.sfx}px` }}
                className={`relative border-b border-zinc-200 transition-colors timeline-grid-bg ${isDraggingSfx ? 'bg-emerald-100' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingSfx(true);
                }}
                onDragLeave={() => setIsDraggingSfx(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingSfx(false);
                  try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.type === 'sfx') {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const time = x / zoom;
                      setAudioEdit(prev => ({
                        ...prev,
                        sfx_list: [...prev.sfx_list, { path: data.path, time: time, volume: 1 }]
                      }));
                    }
                  } catch (err) {
                    console.error("SFX drop failed:", err);
                  }
                }}
              >
                {audioEdit.sfx_list.map((sfx, idx) => (
                  <TimelineItem
                    key={`sfx-${idx}`}
                    id={`sfx-${idx}`}
                    start={sfx.time}
                    duration={2} // Default 2s for SFX
                    zoom={zoom}
                    color={selectedItem?.type === 'sfx' && selectedItem.id === `sfx-${idx}` ? "bg-emerald-200 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-emerald-50 border-emerald-200"}
                    label={sfx.path.split('/').pop()}
                    isSelected={selectedItem?.type === 'sfx' && selectedItem.id === `sfx-${idx}`}
                    isSplitMode={isSplitMode}
                    onClick={() => setSelectedItem({ id: `sfx-${idx}`, type: 'sfx' })}
                    snapPoints={autoSnap ? snapPoints.filter(p => p !== sfx.time && p !== (sfx.time + 2)) : []}
                    onUpdate={(newStart) => {
                      const offset = newStart - sfx.time;
                      setAudioEdit(prev => ({
                        ...prev,
                        sfx_list: prev.sfx_list.map((s, i) => {
                          if (i === idx) return { ...s, time: newStart };
                          if (rippleEdit && i > idx) return { ...s, time: s.time + offset };
                          return s;
                        })
                      }));
                    }}
                    onDelete={() => onDelete(`sfx-${idx}`, 'sfx')}
                    className="inset-y-1 h-[calc(100%-8px)] rounded-md"
                  >
                    <div className="flex items-center gap-1.5 px-2 h-full">
                      <Volume2 size={10} className="text-emerald-600" />
                      <span className="truncate text-emerald-700 font-bold text-[8px]">{sfx.path.split('/').pop()}</span>
                    </div>
                  </TimelineItem>
                ))}
              </div>
            </div>

            {/* Playhead */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] z-40 cursor-ew-resize group"
              style={{ left: `${currentTime * zoom}px` }}
              onMouseDown={handlePlayheadMouseDown}
            >
              {/* Playhead Handle (Rectangular like CapCut/Premiere) */}
              <div className="absolute -top-1 -left-[5px] w-[11px] h-[14px] bg-red-500 rounded-b-sm border-x border-b border-red-400/30 flex items-center justify-center shadow-lg group-hover:h-4 transition-all duration-200" title="Playhead handle">
                <div className="w-[1px] h-2 bg-white/40" />
                {/* Time Tooltip on Hover */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-500 text-[10px] font-black text-white px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap shadow-xl scale-90 group-hover:scale-100 origin-bottom">
                  {formatTimeHelper(currentTime)}
                </div>
              </div>
              {/* Invisible wider hit area for easier dragging */}
              <div className="absolute top-0 bottom-0 -left-2 w-4 cursor-ew-resize" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Timeline);
