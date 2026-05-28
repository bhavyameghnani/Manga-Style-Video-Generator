import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { api, resolveMediaUrl } from '../lib/api';
import type { Story, StoryPanel, StoryRead } from '../lib/types';
import {
  ArrowLeft, ChevronLeft, ChevronRight, BookOpen,
  MessageSquare, Zap, FileText, BookMarked, Loader2,
  Maximize2, Minimize2, List, Play, Pause, Volume2
} from 'lucide-react';

interface Props {
  story: Story;
  onClose: () => void;
}

const panelTypeIcons: Record<string, any> = {
  cover: BookMarked,
  narration: FileText,
  dialogue: MessageSquare,
  action: Zap,
  summary: BookOpen,
};

function estimatePanelDurationMs(panel: StoryPanel) {
  const text = panel.narrative_text.trim();
  const wordCount = text ? text.split(/\s+/).length : 8;
  return Math.min(14000, Math.max(3500, wordCount * 420));
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function MangaReader({ story, onClose }: Props) {
  const { profile } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const lastAudioUrlRef = useRef('');
  const [panels, setPanels] = useState<StoryPanel[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<StoryRead | null>(null);
  const [showPanelList, setShowPanelList] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState('');

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadReader = async () => {
      setLoading(true);
      setImageLoaded(false);
      setIsNarrating(false);
      setPlaybackError('');
      clearFallbackTimer();
      audioRef.current?.pause();

      try {
        const [panelData, existingRead] = await Promise.all([
          api.getStoryPanels(story.id),
          api.getOrCreateStoryRead(story.id),
        ]);
        if (cancelled) return;
        setPanels(panelData);
        setRead(existingRead);
        if (panelData.length > 0) {
          setCurrentIndex(Math.min(existingRead.last_panel_read - 1, panelData.length - 1));
        } else {
          setCurrentIndex(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadReader();

    return () => {
      cancelled = true;
      clearFallbackTimer();
      audioRef.current?.pause();
    };
  }, [story.id, clearFallbackTimer]);

  const updateReadProgress = useCallback(async (panelIndex: number) => {
    if (!profile || !read) return;
    const panelNum = panelIndex + 1;
    const isCompleted = panelNum >= panels.length;
    const data = await api.updateReadProgress(read.id, {
      last_panel_read: panelNum,
      completed: isCompleted,
    });
    setRead(data);
  }, [read, panels.length, profile]);

  const goToPanel = useCallback((index: number) => {
    if (index < 0 || index >= panels.length) return;
    setCurrentIndex(index);
    setImageLoaded(false);
    updateReadProgress(index);
    setShowPanelList(false);
  }, [panels.length, updateReadProgress]);

  const goNext = () => goToPanel(currentIndex + 1);
  const goPrev = () => goToPanel(currentIndex - 1);

  const currentPanel = panels[currentIndex];
  const hasNarration = panels.some(panel => Boolean(panel.narration_audio_url));
  const progress = panels.length > 0 ? Math.round(((currentIndex + 1) / panels.length) * 100) : 0;
  const narrationProgress = audioDuration > 0 ? Math.min(100, (audioProgress / audioDuration) * 100) : 0;

  const finishCurrentNarration = useCallback(() => {
    clearFallbackTimer();
    setAudioProgress(0);
    setAudioDuration(0);
    if (currentIndex < panels.length - 1) {
      goToPanel(currentIndex + 1);
      return;
    }
    setIsNarrating(false);
    updateReadProgress(currentIndex);
  }, [clearFallbackTimer, currentIndex, goToPanel, panels.length, updateReadProgress]);

  const toggleNarration = () => {
    if (isNarrating) {
      setIsNarrating(false);
      audioRef.current?.pause();
      clearFallbackTimer();
      return;
    }

    setPlaybackError('');
    setIsNarrating(true);
  };

  useEffect(() => {
    setAudioProgress(0);
    setAudioDuration(0);
  }, [currentIndex]);

  useEffect(() => {
    clearFallbackTimer();

    const audio = audioRef.current;
    if (!isNarrating || !currentPanel) {
      audio?.pause();
      return;
    }

    if (currentPanel.narration_audio_url && audio) {
      const audioUrl = resolveMediaUrl(currentPanel.narration_audio_url);
      if (lastAudioUrlRef.current !== audioUrl) {
        audio.load();
        lastAudioUrlRef.current = audioUrl;
      }
      audio.play().catch(() => {
        setPlaybackError('Narration audio could not be played.');
        setIsNarrating(false);
      });
      return;
    }

    fallbackTimerRef.current = window.setTimeout(
      finishCurrentNarration,
      estimatePanelDurationMs(currentPanel),
    );
  }, [
    clearFallbackTimer,
    currentIndex,
    currentPanel,
    currentPanel?.narration_audio_url,
    finishCurrentNarration,
    isNarrating,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, panels.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (panels.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">This story has no panels yet</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-950 flex flex-col ${isFullscreen ? 'fixed inset-0 z-[100]' : ''}`}>
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-white font-semibold text-sm truncate">{story.title}</h1>
              <p className="text-slate-500 text-xs">{story.category}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPanelList(!showPanelList)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              title="Panel list"
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Panel List Sidebar */}
      {showPanelList && (
        <div className="fixed inset-0 z-40 bg-slate-950/80" onClick={() => setShowPanelList(false)}>
          <div
            className="absolute right-0 top-14 bottom-0 w-72 bg-slate-900 border-l border-slate-700/50 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 space-y-1">
              {panels.map((panel, i) => {
                const Icon = panelTypeIcons[panel.panel_type] || FileText;
                return (
                  <button
                    key={panel.id}
                    onClick={() => goToPanel(i)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${
                      i === currentIndex
                        ? 'bg-red-600/20 text-white border border-red-500/30'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-mono text-slate-500 w-6">#{i + 1}</span>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm truncate">
                      {panel.title || `Panel ${i + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-start py-4 px-4 sm:py-5">
        <div className={`w-full ${isFullscreen ? 'max-w-[460px]' : 'max-w-[420px]'}`}>
          {/* Manga Panel */}
          <div className="relative bg-slate-900 border-2 border-slate-700/50 rounded-xl overflow-hidden shadow-2xl shadow-black/50">
            {/* Panel Image */}
            <div className="relative aspect-[2/3] bg-slate-800">
              {currentPanel.image_url ? (
                <>
                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-slate-600 animate-spin" />
                    </div>
                  )}
                  <img
                    src={resolveMediaUrl(currentPanel.image_url)}
                    alt={currentPanel.title || `Panel ${currentIndex + 1}`}
                    className={`w-full h-full object-contain transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setImageLoaded(true)}
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <div className="text-center p-8">
                    <BookOpen className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-600 font-mono text-sm">NO IMAGE</p>
                  </div>
                </div>
              )}

              {/* Manga-style overlay effects */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Top gradient for text readability */}
                {currentPanel.title && (
                  <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-950/60 to-transparent" />
                )}
                {/* Bottom gradient for dialogue */}
                {(currentPanel.narrative_text || currentPanel.character_dialogue) && (
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-slate-950/80 to-transparent" />
                )}
              </div>

              {/* Panel Title */}
              {currentPanel.title && (
                <div className="absolute top-4 left-4 right-4">
                  <div className="inline-block">
                    <span className="text-xs font-mono text-red-400 tracking-wider uppercase">
                      Panel {currentIndex + 1}
                    </span>
                    <h2 className="text-white text-xl font-bold drop-shadow-lg mt-0.5">
                      {currentPanel.title}
                    </h2>
                  </div>
                </div>
              )}

              {/* Narrative Text */}
              {currentPanel.narrative_text && (
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-slate-950/70 backdrop-blur-sm border border-slate-600/30 rounded-lg p-3 sm:p-4">
                    <p className="text-slate-200 text-xs sm:text-sm leading-relaxed">
                      {currentPanel.narrative_text}
                    </p>
                  </div>
                </div>
              )}

              {/* Character Dialogue Bubble */}
              {currentPanel.character_name && currentPanel.character_dialogue && (
                <div className="absolute top-1/3 right-4 max-w-[60%]">
                  <div className="relative bg-white rounded-xl p-3 shadow-lg">
                    <div className="absolute -right-2 top-4 w-4 h-4 bg-white transform rotate-45" />
                    <p className="text-red-600 text-xs font-bold mb-1">{currentPanel.character_name}</p>
                    <p className="text-slate-900 text-sm font-medium">
                      &ldquo;{currentPanel.character_dialogue}&rdquo;
                    </p>
                  </div>
                </div>
              )}

              {/* Panel type badge */}
              <div className="absolute top-4 right-4">
                <span className="px-2 py-1 text-xs font-medium bg-slate-900/80 text-slate-300 rounded-md border border-slate-600/50 backdrop-blur-sm flex items-center gap-1.5">
                  {(() => {
                    const Icon = panelTypeIcons[currentPanel.panel_type] || FileText;
                    return <Icon className="w-3 h-3" />;
                  })()}
                  {currentPanel.panel_type}
                </span>
              </div>
            </div>
          </div>

          {/* Narration */}
          <div className="mt-4 bg-slate-900/80 border border-slate-700/50 rounded-xl p-3">
            <audio
              ref={audioRef}
              src={currentPanel.narration_audio_url ? resolveMediaUrl(currentPanel.narration_audio_url) : undefined}
              preload="metadata"
              onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration || 0)}
              onTimeUpdate={(event) => setAudioProgress(event.currentTarget.currentTime || 0)}
              onEnded={finishCurrentNarration}
              onError={() => {
                if (isNarrating) {
                  setPlaybackError('Narration audio could not be loaded.');
                  setIsNarrating(false);
                }
              }}
            />
            <div className="flex items-center gap-3">
              <button
                onClick={toggleNarration}
                disabled={!hasNarration}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-500/20"
                title={isNarrating ? 'Pause narration' : 'Play narration'}
              >
                {isNarrating ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <Volume2 className="w-4 h-4 text-red-400" />
                    <span>AI-generated narration</span>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {formatSeconds(audioProgress)} / {formatSeconds(audioDuration)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all"
                    style={{ width: `${narrationProgress}%` }}
                  />
                </div>
                {!hasNarration && (
                  <p className="text-xs text-slate-500 mt-2">Narration has not been generated for this story.</p>
                )}
                {playbackError && (
                  <p className="text-xs text-red-400 mt-2">{playbackError}</p>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-5 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>

            <div className="text-center">
              <span className="text-white font-mono text-lg font-bold">{currentIndex + 1}</span>
              <span className="text-slate-500 font-mono text-lg"> / {panels.length}</span>
              <div className="text-xs text-slate-500 mt-1">
                {read?.completed ? 'Completed' : `${progress}% read`}
              </div>
            </div>

            <button
              onClick={goNext}
              disabled={currentIndex >= panels.length - 1}
              className="flex items-center gap-2 px-5 py-3 bg-red-600 border border-red-500 rounded-xl text-white text-sm font-medium hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-500/20"
            >
              Next
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Thumbnail strip */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {panels.map((panel, i) => (
              <button
                key={panel.id}
                onClick={() => goToPanel(i)}
                className={`flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                  i === currentIndex
                    ? 'border-red-500 shadow-lg shadow-red-500/20'
                    : 'border-slate-700/50 opacity-60 hover:opacity-100'
                }`}
              >
                {panel.image_url ? (
                  <img src={resolveMediaUrl(panel.image_url)} alt="" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    <span className="text-xs text-slate-500 font-mono">{i + 1}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
