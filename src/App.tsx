import { useState, useRef, useEffect } from "react";
import { 
  Play, 
  Pause, 
  Download, 
  BookOpen, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Moon, 
  Clock, 
  Sliders, 
  HelpCircle, 
  CornerDownRight, 
  Check, 
  FileText,
  AlertCircle,
  Code,
  Music4,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Sun,
  Search,
  Trash2,
  RefreshCw,
  FileArchive,
  X
} from "lucide-react";
import { PRESETS, RecitationPreset } from "./presets";

interface GenerationHistory {
  id: string;
  timestamp: Date;
  text: string;
  voice: string;
  style: string;
  speed: string;
  audioUrl: string;
  duration: number;
  textLength: number;
  elapsedTimeMs?: number;
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  sessionId?: string;
  chunkIndex?: number;
}

interface HistorySession {
  id: string;
  isGroup: boolean;
  timestamp: Date;
  voice: string;
  style: string;
  speed: string;
  text: string;
  textLength: number;
  duration: number;
  elapsedTimeMs?: number;
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  chunks: GenerationHistory[];
}

interface PlayableChunk {
  id: string;
  index: number;
  text: string;
  audioUrl?: string;
  duration?: number;
  status: 'idle' | 'generating' | 'ready' | 'error';
  error?: string;
}

// Helper to chunk text logically by sentence ends/breaks for high-fidelity continuous recitation
function splitTextIntoChunks(fullText: string, maxChunkSize: number = 400): string[] {
  if (!fullText) return [];
  const lines = fullText.split(/\n+/);
  const result: string[] = [];
  let currentChunk = "";
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    if (trimmedLine.length > maxChunkSize) {
      const sentences = trimmedLine.split(/(?<=[。！？；!?;\n])/);
      for (const sentence of sentences) {
        if (!sentence.trim()) continue;
        if ((currentChunk + sentence).length > maxChunkSize) {
          if (currentChunk) result.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? " " : "") + sentence;
        }
      }
    } else {
      if ((currentChunk + "\n" + trimmedLine).length > maxChunkSize) {
        if (currentChunk) result.push(currentChunk.trim());
        currentChunk = trimmedLine;
      } else {
        currentChunk = currentChunk ? (currentChunk + "\n" + trimmedLine) : trimmedLine;
      }
    }
  }
  
  if (currentChunk) {
    result.push(currentChunk.trim());
  }
  return result;
}

const AVAILABLE_VOICES = [
  { id: "Kore", name: "Kore (中英通用)", type: "女声 / 饱满温润", desc: "主打深情徐缓，咬字清晰，适宜诗歌及叙事散文" },
  { id: "Fenrir", name: "Fenrir (浑厚男低)", type: "男声 / 雄浑刚毅", desc: "声线磁性沉稳，气势充足，适宜史诗与庄严题材" },
  { id: "Charon", name: "Charon (内敛沉静)", type: "男声 / 温和儒雅", desc: "语调诚恳宁静，儒雅书卷气，适宜哲学与独白" },
  { id: "Zephyr", name: "Zephyr (轻柔女声)", type: "女声 / 清水芙蓉", desc: "声线空灵轻快，唯美浪漫，适宜散文诗及清新格调" },
  { id: "Puck", name: "Puck (活力戏剧)", type: "男声 / 阳光张力", desc: "感情起伏饱满，戏剧张力高，适宜小说、旁白与英文" },
];

const STYLE_OPTIONS = [
  { id: "default", label: "自然流畅", desc: "温润适中，回归最本真的阅读美感" },
  { id: "elegant", label: "温文儒雅", desc: "书卷深藏，缓急有致，充满古典东方韵致" },
  { id: "solemn", label: "庄严崇高", desc: "厚重深厚，字字千钧，带有史诗感的宏大" },
  { id: "emotional", label: "百转千回", desc: "深情叹息，细腻凄美，直击人心的温柔" },
  { id: "energetic", label: "激昂高亢", desc: "明亮轻快，声中带刺，饱含少年的英气" },
  { id: "dramatic", label: "戏剧起伏", desc: "时而私语，时而勃发，强烈艺术张力" },
];

// Helper to merge multiple 24000Hz mono 16-bit PCM WAV blobs
async function mergeWavBlobs(blobUrls: string[]): Promise<Blob> {
  const arrays: Uint8Array[] = [];
  let totalPcmLength = 0;
  
  for (const url of blobUrls) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    // WAV header is 44 bytes. Get PCM payload.
    const pcm = new Uint8Array(buffer, 44);
    arrays.push(pcm);
    totalPcmLength += pcm.byteLength;
  }
  
  const mergedBuffer = new Uint8Array(44 + totalPcmLength);
  const view = new DataView(mergedBuffer.buffer);
  
  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // File length: 36 + data size
  view.setUint32(4, 36 + totalPcmLength, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // Format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format: 1 (PCM)
  view.setUint16(20, 1, true);
  // Channel count: 1 (mono)
  view.setUint16(22, 1, true);
  // Sample rate (24000)
  view.setUint32(24, 24000, true);
  // Byte rate: 24000 * 2 = 48000
  view.setUint32(28, 48000, true);
  // Block align: 2
  view.setUint16(32, 2, true);
  // Bits per sample: 16-bit
  view.setUint16(34, 16, true);
  // Data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // Data chunk length
  view.setUint32(40, totalPcmLength, true);
  
  let offset = 44;
  for (const pcm of arrays) {
    mergedBuffer.set(pcm, offset);
    offset += pcm.byteLength;
  }
  
  return new Blob([mergedBuffer], { type: "audio/wav" });
}

const groupHistory = (items: GenerationHistory[]): HistorySession[] => {
  const groups: { [key: string]: GenerationHistory[] } = {};
  const standalone: HistorySession[] = [];
  
  for (const item of items) {
    if (item.sessionId) {
      if (!groups[item.sessionId]) {
        groups[item.sessionId] = [];
      }
      groups[item.sessionId].push(item);
    } else {
      standalone.push({
        id: item.id,
        isGroup: false,
        timestamp: item.timestamp,
        voice: item.voice,
        style: item.style,
        speed: item.speed,
        text: item.text,
        textLength: item.textLength,
        duration: item.duration,
        elapsedTimeMs: item.elapsedTimeMs,
        promptTokens: item.promptTokens,
        candidatesTokens: item.candidatesTokens,
        totalTokens: item.totalTokens,
        chunks: [item]
      });
    }
  }
  
  const mergedGroups = Object.keys(groups).map(sessId => {
    const chunks = groups[sessId].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
    const firstChunk = chunks[0];
    
    const totalTextLength = chunks.reduce((acc, c) => acc + c.textLength, 0);
    const totalDuration = chunks.reduce((acc, c) => acc + c.duration, 0);
    const totalElapsed = chunks.reduce((acc, c) => acc + (c.elapsedTimeMs || 0), 0);
    const totalPrompt = chunks.reduce((acc, c) => acc + (c.promptTokens || 0), 0);
    const totalCand = chunks.reduce((acc, c) => acc + (c.candidatesTokens || 0), 0);
    const totalTok = chunks.reduce((acc, c) => acc + (c.totalTokens || 0), 0);
    
    return {
      id: sessId,
      isGroup: true,
      timestamp: firstChunk.timestamp,
      voice: firstChunk.voice,
      style: firstChunk.style,
      speed: firstChunk.speed,
      text: chunks.map(c => c.text).join("\n"),
      textLength: totalTextLength,
      duration: totalDuration,
      elapsedTimeMs: totalElapsed,
      promptTokens: totalPrompt,
      candidatesTokens: totalCand,
      totalTokens: totalTok,
      chunks: chunks
    };
  });
  
  return [...standalone, ...mergedGroups].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

const SPEED_OPTIONS = [
  { id: "slow", label: "慢速 0.8x (意境深远)", directive: "字留余白，韵律舒缓" },
  { id: "medium", label: "标准 1.0x (经典传承)", directive: "吞吐有度，气韵生动" },
  { id: "fast", label: "快速 1.2x (如风流丽)", directive: "行云流水，快而不乱" },
];

export default function App() {
  const [text, setText] = useState<string>(
    "人生得意须尽欢，莫使金樽空对月。天生我材必有用，千金散尽还复来。烹羊宰牛且为乐，会须一饮三百杯。"
  );
  const [selectedVoice, setSelectedVoice] = useState<string>("Kore");
  const [selectedStyle, setSelectedStyle] = useState<string>("elegant");
  const [selectedSpeed, setSelectedSpeed] = useState<string>("medium");
  
  // Loading & Generating State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiHasKey, setApiHasKey] = useState<boolean>(true);
  
  // Long manuscript scroll states
  const [isLongModeActive, setIsLongModeActive] = useState<boolean>(false);
  const [playableChunks, setPlayableChunks] = useState<PlayableChunk[]>([]);
  const [currentChunkIdx, setCurrentChunkIdx] = useState<number>(0);
  const [isForgingAll, setIsForgingAll] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [longSessionId, setLongSessionId] = useState<string>("");
  const [expandedSessions, setExpandedSessions] = useState<{ [key: string]: boolean }>({});
  const [isHistoryMerging, setIsHistoryMerging] = useState<{ [key: string]: boolean }>({});
  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(true);

  // References for live callback references to prevent audio recreation loops
  const playableChunksRef = useRef<PlayableChunk[]>([]);
  const currentChunkIdxRef = useRef<number>(0);
  const isLongModeActiveRef = useRef<boolean>(false);
  const autoPlayNextRef = useRef<boolean>(true);
  const stopForgingRef = useRef<boolean>(false);

  useEffect(() => {
    playableChunksRef.current = playableChunks;
  }, [playableChunks]);

  useEffect(() => {
    currentChunkIdxRef.current = currentChunkIdx;
  }, [currentChunkIdx]);

  useEffect(() => {
    isLongModeActiveRef.current = isLongModeActive;
  }, [isLongModeActive]);

  useEffect(() => {
    autoPlayNextRef.current = autoPlayNext;
  }, [autoPlayNext]);

  // Current Audio Playback State
  const [currentAudio, setCurrentAudio] = useState<GenerationHistory | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  // Templates menu state
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [activeHoverCategory, setActiveHoverCategory] = useState<string | null>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [showPromptInspector, setShowPromptInspector] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  
  // System latency state (mock realistic interactive display)
  const [latency, setLatency] = useState<number>(42);

  // Active View & Alert States
  const [currentView, setCurrentView] = useState<"studio" | "history" | "settings">("studio");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [apiType, setApiType] = useState<"official" | "new_api">("official");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [newApiBaseUrl, setNewApiBaseUrl] = useState("http://192.168.100.170:3000/v1");
  const [newApiKey, setNewApiKey] = useState("");
  const [modelName, setModelName] = useState("gemini-3.1-flash-tts");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Theme Toggler state
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("theme") as "dark" | "light") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
  }, [theme]);

  // Fetch settings on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setApiType(data.api_type || "official");
          setGeminiApiKey(data.gemini_api_key || "");
          setNewApiBaseUrl(data.new_api_base_url || "http://192.168.100.170:3000/v1");
          setNewApiKey(data.new_api_key || "");
          setModelName(data.model_name || "gemini-3.1-flash-tts");
        }
      })
      .catch((err) => console.error("Error loading settings:", err));
  }, []);

  // References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const visualizerIntervalRef = useRef<any>(null);
  // Fake visualizer bar heights state to pulse when playing
  const [barHeights, setBarHeights] = useState<number[]>([15, 30, 45, 60, 40, 50, 35, 70, 25, 42, 55, 30]);

  // Read environment health and load database history on mount
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.hasKey === false) {
          setApiHasKey(false);
        }
      })
      .catch((err) => {
        console.error("Health check error", err);
      });

    fetch("/api/history")
      .then((res) => res.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const loadedHistory = data.map((item) => {
            const binaryStr = atob(item.audioData);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: "audio/wav" });
            const audioUrlObj = URL.createObjectURL(audioBlob);

            return {
              id: item.id,
              timestamp: new Date(item.timestamp),
              text: item.text,
              voice: item.voice,
              style: item.style,
              speed: item.speed,
              audioUrl: audioUrlObj,
              duration: item.duration,
              textLength: item.textLength,
              elapsedTimeMs: item.elapsedTimeMs,
              promptTokens: item.promptTokens,
              candidatesTokens: item.candidatesTokens,
              totalTokens: item.totalTokens,
              sessionId: item.sessionId,
              chunkIndex: item.chunkIndex
            };
          });
          setHistory(loadedHistory);
        }
      })
      .catch((err) => {
        console.error("Error loading history list:", err);
      });
  }, []);

  // Click outside template selector handler to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
        setIsTemplateMenuOpen(false);
        setActiveHoverCategory(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Sync audio ref with state
  useEffect(() => {
    if (currentAudio) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(currentAudio.audioUrl);
      audioRef.current = audio;
      audio.volume = isMuted ? 0 : volume;

      audio.addEventListener("timeupdate", () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTime(0);

        // Auto play next chunk cascade
        if (isLongModeActiveRef.current && autoPlayNextRef.current) {
          const nextIdx = currentChunkIdxRef.current + 1;
          const chunks = playableChunksRef.current;
          if (nextIdx < chunks.length) {
            const nextCh = chunks[nextIdx];
            if (nextCh.status === 'ready' && nextCh.audioUrl) {
              setCurrentChunkIdx(nextIdx);
              const nextAudioItem: GenerationHistory = {
                id: nextCh.id,
                timestamp: new Date(),
                text: nextCh.text,
                voice: currentAudio.voice,
                style: currentAudio.style,
                speed: currentAudio.speed,
                audioUrl: nextCh.audioUrl,
                duration: nextCh.duration || 6,
                textLength: nextCh.text.length
              };
              setCurrentAudio(nextAudioItem);
              setIsPlaying(true);
            }
          }
        }
      });

      if (isPlaying) {
        audio.play().catch((err) => {
          console.error("Audio playback interrupted", err);
          setIsPlaying(false);
        });
      }
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [currentAudio]);

  // Set up visualizer flow effect
  useEffect(() => {
    if (isPlaying) {
      visualizerIntervalRef.current = setInterval(() => {
        setBarHeights((prev) => 
          prev.map((h) => {
            const delta = Math.floor(Math.random() * 25) - 12;
            const newHeight = Math.max(10, Math.min(95, h + delta));
            return newHeight;
          })
        );
      }, 100);
    } else {
      if (visualizerIntervalRef.current) {
        clearInterval(visualizerIntervalRef.current);
      }
      // Reset to a gentle resting state
      setBarHeights([15, 25, 35, 50, 40, 35, 30, 45, 20, 30, 40, 25]);
    }

    return () => {
      if (visualizerIntervalRef.current) {
        clearInterval(visualizerIntervalRef.current);
      }
    };
  }, [isPlaying]);

  // Adjust volume
  const handleVolumeChange = (v: number) => {
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : v;
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) {
      audioRef.current.volume = nextMute ? 0 : volume;
    }
  };

  // Play Pause Handler
  const handlePlayPause = () => {
    if (!currentAudio) return;
    
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      audioRef.current?.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error("Playback error", err);
      });
    }
  };

  // Quick preset loading
  const loadPreset = (preset: RecitationPreset) => {
    setText(preset.content);
    setSelectedVoice(preset.recommendedVoice);
    setSelectedStyle(preset.recommendedStyle);
    setSelectedSpeed(preset.recommendedSpeed);
    
    // Add micro feedback
    const startTime = Date.now();
    setTimeout(() => {
      setLatency(Math.floor(Math.random() * 20) + 30);
    }, 50);
  };

  // Dynamic segmentation effect which triggers whenever input text changes
  useEffect(() => {
    // If text enters a longer threshold, enable long book scroll mode
    if (text.length > 500) {
      setIsLongModeActive(true);
      setLongSessionId(prev => prev || `sess-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
      const parted = splitTextIntoChunks(text, 400);
      setPlayableChunks((prev) => {
        // reuse any already processed chunks where the text hasn't mutated
        return parted.map((txt, index) => {
          const matched = prev.find(p => p.text === txt);
          return {
            id: matched?.id || `chunk-${index}-${Date.now()}`,
            index,
            text: txt,
            audioUrl: matched?.audioUrl,
            duration: matched?.duration,
            status: matched?.status || 'idle',
            error: matched?.error
          };
        });
      });
    } else {
      setIsLongModeActive(false);
      setLongSessionId("");
    }
  }, [text]);

  // Synthesize single chunk from our chunking grid
  const generateSingleChunk = async (index: number) => {
    if (index < 0 || index >= playableChunks.length) return;
    
    // Set status to generating
    setPlayableChunks(prev => prev.map((c, idx) => idx === index ? { ...c, status: 'generating', error: undefined } : c));
    const targetChunk = playableChunks[index];
    
    try {
      const response = await fetch("/api/recite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: targetChunk.text,
          voice: selectedVoice,
          style: selectedStyle,
          speed: selectedSpeed,
          session_id: longSessionId,
          chunk_index: index
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.audioData) {
        throw new Error("模型未返回有效音频");
      }

      // Convert PCM WAV Base64 to blob URL
      const binaryStr = atob(data.audioData);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      
      const audioBlob = new Blob([bytes], { type: "audio/wav" });
      const audioUrlObj = URL.createObjectURL(audioBlob);

      // Create a GenerationHistory item to add to session history log
      const histItem: GenerationHistory = {
        id: data.id || targetChunk.id,
        timestamp: new Date(),
        text: targetChunk.text,
        voice: selectedVoice,
        style: selectedStyle,
        speed: selectedSpeed,
        audioUrl: audioUrlObj,
        duration: data.duration || 6,
        textLength: targetChunk.text.length,
        elapsedTimeMs: data.elapsedTimeMs,
        promptTokens: data.promptTokens,
        candidatesTokens: data.candidatesTokens,
        totalTokens: data.totalTokens,
        sessionId: data.session_id,
        chunkIndex: data.chunk_index
      };

      // Add to local historical records
      setHistory(prev => [histItem, ...prev]);

      // Update chunk status to ready
      setPlayableChunks(prev => prev.map((c, idx) => idx === index ? { 
        ...c, 
        audioUrl: audioUrlObj, 
        duration: data.duration || 6, 
        status: 'ready' 
      } : c));

      // If active selection, load instantly into active playback controls
      if (index === currentChunkIdx) {
        setCurrentAudio(histItem);
      }

    } catch (err: any) {
      console.error(`Chunk ${index} failed:`, err);
      setPlayableChunks(prev => prev.map((c, idx) => idx === index ? { 
        ...c, 
        status: 'error', 
        error: err.message || "TTS引擎未反应" 
      } : c));
    }
  };

  // Play specified scroll chunk directly
  const playSpecificChunk = (index: number) => {
    if (index < 0 || index >= playableChunks.length) return;
    const chunk = playableChunks[index];
    setCurrentChunkIdx(index);

    if (chunk.status === 'ready' && chunk.audioUrl) {
      const audioItem: GenerationHistory = {
        id: chunk.id,
        timestamp: new Date(),
        text: chunk.text,
        voice: selectedVoice,
        style: selectedStyle,
        speed: selectedSpeed,
        audioUrl: chunk.audioUrl,
        duration: chunk.duration || 6,
        textLength: chunk.text.length
      };
      setCurrentAudio(audioItem);
      setIsPlaying(true);
    } else {
      generateSingleChunk(index);
    }
  };

  // Forge sequential queue on all unfinished scroll chunks
  const forgeAllScrollsSequential = async () => {
    setIsForgingAll(true);
    stopForgingRef.current = false;
    try {
      const chunks = playableChunksRef.current;
      for (let i = 0; i < chunks.length; i++) {
        if (stopForgingRef.current) break;
        const chunk = chunks[i];
        if (chunk.status !== 'ready') {
          setCurrentChunkIdx(i);
          await generateSingleChunk(i);
          // grace pause to prevent rate-limit hammering
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (e) {
      console.error("Batch forge sequence error", e);
    } finally {
      setIsForgingAll(false);
    }
  };

  // Merge and download all generated scrolls into one complete WAV file
  const mergeAndDownloadAllScrolls = async () => {
    setIsMerging(true);
    try {
      const urls = playableChunks.map(c => c.audioUrl).filter(Boolean) as string[];
      if (urls.length === 0) return;
      
      const mergedBlob = await mergeWavBlobs(urls);
      const audioUrlObj = URL.createObjectURL(mergedBlob);
      
      // Calculate total duration
      const totalDuration = playableChunks.reduce((acc, c) => acc + (c.duration || 0), 0);
      
      // Create a GenerationHistory item to represent the merged audio
      const mergedItem: GenerationHistory = {
        id: `merged-${Date.now()}`,
        timestamp: new Date(),
        text: `【全篇合集】${text.slice(0, 30)}...`,
        voice: selectedVoice,
        style: selectedStyle,
        speed: selectedSpeed,
        audioUrl: audioUrlObj,
        duration: totalDuration,
        textLength: text.length
      };
      
      // Load into player & start playing!
      setCurrentAudio(mergedItem);
      setIsPlaying(true);
      
      // Trigger file download automatically
      const a = document.createElement("a");
      a.href = audioUrlObj;
      const voiceObj = AVAILABLE_VOICES.find(v => v.id === selectedVoice);
      const voiceName = voiceObj ? voiceObj.name.split(" ")[0] : selectedVoice;
      const styleObj = STYLE_OPTIONS.find(s => s.id === selectedStyle);
      const styleName = styleObj ? styleObj.label : selectedStyle;
      a.download = `ATBard_FullMerged_${voiceName}_${styleName}_${Date.now().toString().slice(-6)}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
    } catch (err) {
      console.error("Error merging audio chunks:", err);
      alert("合并分卷失败，请重试。");
    } finally {
      setIsMerging(false);
    }
  };

  const mergeAndDownloadHistorySession = async (session: HistorySession) => {
    setIsHistoryMerging(prev => ({ ...prev, [session.id]: true }));
    try {
      const urls = session.chunks.map(c => c.audioUrl).filter(Boolean) as string[];
      if (urls.length === 0) return;
      
      const mergedBlob = await mergeWavBlobs(urls);
      const audioUrlObj = URL.createObjectURL(mergedBlob);
      
      const playItem: GenerationHistory = {
        id: session.id,
        timestamp: session.timestamp,
        text: `【全篇合集】${session.text.slice(0, 35)}...`,
        voice: session.voice,
        style: session.style,
        speed: session.speed,
        audioUrl: audioUrlObj,
        duration: session.duration,
        textLength: session.textLength
      };
      setCurrentAudio(playItem);
      setIsPlaying(true);
      
      const a = document.createElement("a");
      a.href = audioUrlObj;
      const voiceObj = AVAILABLE_VOICES.find(v => v.id === session.voice);
      const voiceName = voiceObj ? voiceObj.name.split(" ")[0] : session.voice;
      const styleObj = STYLE_OPTIONS.find(s => s.id === session.style);
      const styleName = styleObj ? styleObj.label : session.style;
      a.download = `ATBard_FullMerged_${voiceName}_${styleName}_${Date.now().toString().slice(-6)}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
    } catch (err) {
      console.error("History merge error:", err);
      alert("合成分卷失败，请重试。");
    } finally {
      setIsHistoryMerging(prev => ({ ...prev, [session.id]: false }));
    }
  };

  const toggleSessionExpand = (sessId: string) => {
    setExpandedSessions(prev => ({
      ...prev,
      [sessId]: !prev[sessId]
    }));
  };

  // Generate Recitation function
  const handleGenerateRecitation = async () => {
    if (!text || text.trim() === "") {
      setErrorMessage("请先输入一些文字或是选择上方内置的名篇经典。");
      return;
    }

    if (isLongModeActive) {
      await forgeAllScrollsSequential();
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    const apiStartTime = Date.now();

    try {
      const response = await fetch("/api/recite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          style: selectedStyle,
          speed: selectedSpeed,
        }),
      });

      const responseTime = Date.now() - apiStartTime;
      setLatency(Math.min(999, Math.floor(responseTime / 10) + 10));

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `服务器请求失败，状态码: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.audioData) {
        throw new Error("TTS 引擎未正常生成 WAV 音频内容！");
      }

      // Convert the base64 output back to a playable object URL
      const binaryStr = atob(data.audioData);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      
      const audioBlob = new Blob([bytes], { type: "audio/wav" });
      const audioUrlObj = URL.createObjectURL(audioBlob);

      const generatedItem: GenerationHistory = {
        id: data.id || `gen-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date(),
        text: text,
        voice: selectedVoice,
        style: selectedStyle,
        speed: selectedSpeed,
        audioUrl: audioUrlObj,
        duration: data.duration || 6,
        textLength: text.length,
        elapsedTimeMs: data.elapsedTimeMs,
        promptTokens: data.promptTokens,
        candidatesTokens: data.candidatesTokens,
        totalTokens: data.totalTokens,
        sessionId: data.session_id,
        chunkIndex: data.chunk_index
      };

      setHistory(prev => [generatedItem, ...prev]);
      setCurrentAudio(generatedItem);
      setIsPlaying(true);

    } catch (err: any) {
      console.error("TTS generation error", err);
      setErrorMessage(err.message || "朗诵生成异常，请检查网络或秘密设置。");
    } finally {
      setIsGenerating(false);
    }
  };



  // Download Audio Helper
  const handleDownload = (audioItem: GenerationHistory) => {
    if (!audioItem) return;
    const a = document.createElement("a");
    a.href = audioItem.audioUrl;
    // Format descriptive name
    const voiceObj = AVAILABLE_VOICES.find(v => v.id === audioItem.voice);
    const voiceName = voiceObj ? voiceObj.name.split(" ")[0] : audioItem.voice;
    const styleObj = STYLE_OPTIONS.find(s => s.id === audioItem.style);
    const styleName = styleObj ? styleObj.label : audioItem.style;
    
    a.download = `ATBard_Recite_${voiceName}_${styleName}_${Date.now().toString().slice(-6)}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getStyleLabel = (styleId: string) => {
    return STYLE_OPTIONS.find(s => s.id === styleId)?.label || styleId;
  };

  const getVoiceName = (voiceId: string) => {
    return AVAILABLE_VOICES.find(v => v.id === voiceId)?.name || voiceId;
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDateTime = (date: Date) => {
    const pad = (num: number) => String(num).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  };

  // Reload parameters and content from a past session into the studio editor workspace
  const handleReloadSession = (session: HistorySession) => {
    setText(session.text);
    setSelectedVoice(session.voice);
    setSelectedStyle(session.style);
    setSelectedSpeed(session.speed);
    setCurrentView("studio");
  };

  // Delete a history record or a whole session group from DB and update state
  const handleDeleteSession = async (session: HistorySession) => {
    if (!window.confirm("确定要删除此生成历史记录吗？此操作不可撤销。")) {
      return;
    }
    
    try {
      const response = await fetch("/api/history", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: session.isGroup ? undefined : session.id,
          session_id: session.isGroup ? session.id : undefined,
        }),
      });
      
      if (!response.ok) {
        throw new Error("删除请求失败");
      }
      
      // Update local React state
      setHistory(prev => {
        if (session.isGroup) {
          return prev.filter(item => item.sessionId !== session.id);
        } else {
          return prev.filter(item => item.id !== session.id);
        }
      });
      
    } catch (err: any) {
      console.error("Delete history error:", err);
      alert("删除失败，请重试。");
    }
  };

  // Export all database history into a compressed ZIP file
  const handleExportAllHistory = () => {
    window.open("/api/history/export", "_blank");
  };

  // Computed filtered history sessions
  const filteredSessions = groupHistory(history).filter(session => {
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchText = session.text.toLowerCase().includes(q);
      const matchVoice = getVoiceName(session.voice).toLowerCase().includes(q) || session.voice.toLowerCase().includes(q);
      const matchStyle = getStyleLabel(session.style).toLowerCase().includes(q) || session.style.toLowerCase().includes(q);
      if (!matchText && !matchVoice && !matchStyle) {
        return false;
      }
    }
    
    if (filterStartDate) {
      const start = new Date(filterStartDate + "T00:00:00").getTime();
      if (session.timestamp.getTime() < start) return false;
    }
    
    if (filterEndDate) {
      const end = new Date(filterEndDate + "T23:59:59.999").getTime();
      if (session.timestamp.getTime() > end) return false;
    }
    
    return true;
  });

  return (
    <div id="app_container" className="w-full h-screen bg-bg-app text-text-secondary font-sans flex overflow-hidden antialiased selection:bg-text-accent selection:text-bg-panel">
      
      {/* Left Navigation Sidebar */}
      <aside className={`${isSidebarCollapsed ? "w-16 px-2" : "w-64 p-6"} flex-shrink-0 bg-bg-header border-r border-border-color h-full flex flex-col justify-between py-6 transition-all duration-300 select-none relative`}>
        {/* Toggle Collapse Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 w-6 h-6 bg-bg-panel border border-border-color-strong rounded-full flex items-center justify-center cursor-pointer text-text-secondary hover:text-text-primary z-50 shadow-md transition-all hover:scale-105"
          title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="flex flex-col gap-6">
          {/* Brand Header */}
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-tr from-[#c5a059] to-[#8e6e3c] rounded-sm flex items-center justify-center shadow-lg shadow-[#c5a059]/10">
                <Music4 className="w-4 h-4 text-black" />
              </div>
              <div>
                <span className="text-xl font-light tracking-[0.25em] uppercase text-text-primary font-serif">
                  ATBard
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center">
              <div className="w-9 h-9 bg-gradient-to-tr from-[#c5a059] to-[#8e6e3c] rounded-sm flex items-center justify-center shadow-lg shadow-[#c5a059]/10" title="ATBard">
                <Music4 className="w-4.5 h-4.5 text-black" />
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5 mt-4">
            {!isSidebarCollapsed ? (
              <>
                <button
                  onClick={() => setCurrentView("studio")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xs text-xs font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    currentView === "studio"
                      ? "bg-text-accent/10 border-l-2 border-text-accent text-text-primary font-semibold"
                      : "text-text-secondary hover:bg-bg-panel hover:text-text-primary border-l-2 border-transparent"
                  }`}
                >
                  <Music4 className="w-4 h-4 text-text-accent" />
                  <span>工作台 / Studio</span>
                </button>

                <button
                  onClick={() => setCurrentView("history")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xs text-xs font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    currentView === "history"
                      ? "bg-text-accent/10 border-l-2 border-text-accent text-text-primary font-semibold"
                      : "text-text-secondary hover:bg-bg-panel hover:text-text-primary border-l-2 border-transparent"
                  }`}
                >
                  <Clock className="w-4 h-4 text-text-accent" />
                  <span>生成历史 / History</span>
                </button>

                <button
                  onClick={() => setCurrentView("settings")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xs text-xs font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                    currentView === "settings"
                      ? "bg-text-accent/10 border-l-2 border-text-accent text-text-primary font-semibold"
                      : "text-text-secondary hover:bg-bg-panel hover:text-text-primary border-l-2 border-transparent"
                  }`}
                >
                  <Sliders className="w-4 h-4 text-text-accent" />
                  <span>渠道配置 / Settings</span>
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setCurrentView("studio")}
                  className={`flex justify-center items-center w-10 h-10 mx-auto rounded-xs transition-all duration-200 cursor-pointer ${
                    currentView === "studio"
                      ? "bg-text-accent/10 text-text-primary border-l-2 border-text-accent"
                      : "text-text-secondary hover:bg-bg-panel hover:text-text-primary"
                  }`}
                  title="工作台 / Studio"
                >
                  <Music4 className="w-5 h-5 text-text-accent" />
                </button>

                <button
                  onClick={() => setCurrentView("history")}
                  className={`flex justify-center items-center w-10 h-10 mx-auto rounded-xs transition-all duration-200 cursor-pointer ${
                    currentView === "history"
                      ? "bg-text-accent/10 text-text-primary border-l-2 border-text-accent"
                      : "text-text-secondary hover:bg-bg-panel hover:text-text-primary"
                  }`}
                  title="生成历史 / History"
                >
                  <Clock className="w-5 h-5 text-text-accent" />
                </button>

                <button
                  onClick={() => setCurrentView("settings")}
                  className={`flex justify-center items-center w-10 h-10 mx-auto rounded-xs transition-all duration-200 cursor-pointer ${
                    currentView === "settings"
                      ? "bg-text-accent/10 text-text-primary border-l-2 border-text-accent"
                      : "text-text-secondary hover:bg-bg-panel hover:text-text-primary"
                  }`}
                  title="渠道配置 / Settings"
                >
                  <Sliders className="w-5 h-5 text-text-accent" />
                </button>
              </div>
            )}

            {/* Utility Divider */}
            <div className="h-px bg-border-color my-3" />

            {!isSidebarCollapsed ? (
              <button
                onClick={() => {
                  setCurrentView("studio");
                  setShowPromptInspector(!showPromptInspector);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xs text-[11px] font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  showPromptInspector && currentView === "studio"
                    ? "text-text-accent font-semibold"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <Code className="w-4 h-4" />
                <span>Prompt AI 机制</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setCurrentView("studio");
                  setShowPromptInspector(!showPromptInspector);
                }}
                className={`flex justify-center items-center w-10 h-10 mx-auto rounded-xs transition-all duration-200 cursor-pointer ${
                  showPromptInspector && currentView === "studio"
                    ? "text-text-accent font-semibold"
                    : "text-text-muted hover:text-text-secondary"
                }`}
                title="Prompt AI 机制"
              >
                <Code className="w-5 h-5" />
              </button>
            )}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="flex flex-col gap-4 border-t border-border-color pt-5">
          {!isSidebarCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 text-[10px] font-mono uppercase tracking-wider px-2">
                <span className={`w-2 h-2 rounded-full ${apiHasKey ? "bg-green-500" : "bg-amber-500 animate-pulse"}`} />
                <span className="text-text-muted">当前渠道:</span>
                <span className="text-text-secondary font-bold">
                  {apiType === "official" ? "官方 Gemini" : "NewAPI"}
                </span>
              </div>

              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xs bg-bg-input border border-border-color-strong text-text-secondary hover:text-text-primary cursor-pointer transition-all duration-200 text-xs font-mono"
                title={theme === "dark" ? "切换至浅色模式" : "切换至深色模式"}
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span>浅色模式</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>深色模式</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-center items-center" title={`当前渠道: ${apiType === "official" ? "官方 Gemini" : "NewAPI"}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${apiHasKey ? "bg-green-500" : "bg-amber-500 animate-pulse"}`} />
              </div>

              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex items-center justify-center w-10 h-10 mx-auto rounded-xs bg-bg-input border border-border-color-strong text-text-secondary hover:text-text-primary cursor-pointer transition-all duration-200"
                title={theme === "dark" ? "切换至浅色模式" : "切换至深色模式"}
              >
                {theme === "dark" ? (
                  <Sun className="w-5 h-5 text-amber-400" />
                ) : (
                  <Moon className="w-5 h-5 text-indigo-400" />
                )}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Warning if no Gemini Key configured (positioned in the workspace) */}
        {!apiHasKey && (
          <div id="key_alert" className="mx-6 mt-4 p-4 bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex gap-3 items-start animate-pulse">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <strong className="font-bold">提醒：尚未配置核心 GEMINI_API_KEY。</strong>
              <p className="mt-1 text-amber-300/80 leading-relaxed">
                当前应用未检测到全局 Gemini 秘钥环境。您可以点击左侧导航栏的 <strong className="text-white">渠道配置 / Settings</strong>，并在其中添加您的 API 凭证，即可正式解锁 Gemini 3.1 TTS 音频合成服务。
              </p>
            </div>
          </div>
        )}

        {/* Scrollable Content Pane */}
        <div className="flex-1 overflow-y-auto xl:overflow-hidden flex flex-col min-h-0">
          
          {currentView === "studio" && (
            <main className="flex-1 flex flex-col xl:flex-row px-6 py-6 gap-8 md:gap-10 xl:min-h-0">
        
        {/* Left Side: Textarea & Presets */}
        <div id="main_editor_panel" className="flex-1 flex flex-col gap-6 xl:min-h-0">
          


          <div id="editor_header" className="flex justify-between items-center mt-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-serif italic text-text-primary leading-tight font-medium flex items-center gap-2">
                Manuscript Editor
                <span className="not-italic text-xs font-mono font-normal tracking-widest uppercase text-text-accent/60 px-2 py-0.5 bg-text-accent/5 border border-text-accent/10 rounded-sm">
                  手稿编撰
                </span>
              </h1>
              <p className="text-xs text-text-secondary tracking-wide uppercase mt-1">
                请输入你需要配音或朗诵的文学诗稿、演讲词或散文乐段 {isLongModeActive && " · [已启用长链智能分卷]"}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Cascading Template Selector */}
              <div className="relative" ref={templateMenuRef}>
                <button
                  id="btn_template_selector"
                  onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-bg-input border border-text-accent/20 hover:border-text-accent/60 text-text-secondary hover:text-text-primary cursor-pointer transition-all duration-200 text-xs font-mono select-none"
                >
                  <BookOpen className="w-3.5 h-3.5 text-text-accent" />
                  <span>模版示例</span>
                  <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-200 ${isTemplateMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {isTemplateMenuOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-48 bg-bg-panel border border-border-color-strong shadow-2xl rounded-sm py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                    onMouseLeave={() => setActiveHoverCategory(null)}
                  >
                    {[
                      { id: "classical", label: "古诗词" },
                      { id: "prose", label: "散文名家" },
                      { id: "modern", label: "现代诗歌" },
                      { id: "english", label: "English" }
                    ].map((cat) => {
                      const isHovered = activeHoverCategory === cat.id;
                      const categoryPresets = PRESETS.filter(p => p.category === cat.id);
                      
                      return (
                        <div 
                          key={cat.id} 
                          className="relative"
                          onMouseEnter={() => setActiveHoverCategory(cat.id)}
                        >
                          <button
                            className={`w-full px-4 py-2 text-left text-xs tracking-wider transition-colors flex justify-between items-center cursor-pointer ${
                              isHovered ? "bg-text-accent text-bg-panel font-semibold" : "text-text-secondary hover:bg-bg-card-sub hover:text-text-primary"
                            }`}
                          >
                            <span>{cat.label}</span>
                            <ChevronRight className={`w-3.5 h-3.5 ${isHovered ? "text-bg-panel" : "text-text-muted"}`} />
                          </button>

                          {/* Submenu for specific presets */}
                          {isHovered && categoryPresets.length > 0 && (
                            <div className="absolute right-full top-0 mr-1 w-56 bg-bg-panel border border-border-color-strong shadow-2xl rounded-sm py-1.5 z-50 animate-in fade-in slide-in-from-right-1 duration-150">
                              {categoryPresets.map((preset) => (
                                <button
                                  key={preset.id}
                                  onClick={() => {
                                    loadPreset(preset);
                                    setIsTemplateMenuOpen(false);
                                    setActiveHoverCategory(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-xs tracking-wider text-text-secondary hover:bg-text-accent hover:text-bg-panel hover:font-semibold transition-colors flex flex-col gap-0.5 cursor-pointer"
                                >
                                  <span className="font-serif truncate font-medium">{preset.title}</span>
                                  <span className="text-[9px] opacity-60 font-mono self-end">{preset.author}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-text-secondary font-mono tracking-widest uppercase bg-bg-card-sub px-2.5 py-1.5 border border-border-color-strong rounded-xs select-none">
                WORDS: <span className="text-text-primary font-bold">{text.length}</span> / 50000
              </div>
            </div>
          </div>
          
          {/* Main Textarea input */}
          <div className="relative flex-1 min-h-[220px] flex flex-col bg-bg-input border border-border-color focus-within:border-text-accent/40 transition-colors">
            <textarea 
              id="raw_text_textarea"
              maxLength={50000}
              className="w-full flex-1 bg-transparent p-6 md:p-8 text-text-primary text-lg leading-relaxed font-serif focus:outline-none resize-none placeholder-stone-400 dark:placeholder-stone-600 border-none"
              placeholder="请在此输入或剪贴您需要完美吟诵或高真配音的诗行、短文或旁白..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            
            {/* Action block directly inside editor */}
            <div className="p-4 border-t border-border-color bg-bg-card-sub flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex gap-2 text-[11px] text-text-secondary font-mono flex-wrap">
                <span>[环境支持: 连读最大5万字]</span>
                <span>•</span>
                <span>[语音引擎: {modelName}]</span>
                {(isGenerating || isForgingAll) && (
                  <>
                    <span>•</span>
                    <span className="text-text-accent font-semibold animate-pulse">
                      [当前服务商: {apiType === "official" ? "Gemini 官方" : "NewAPI 中转"}]
                    </span>
                  </>
                )}
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {errorMessage && (
                  <p className="text-xs text-red-400 font-sans mr-2 line-clamp-1">{errorMessage}</p>
                )}
                
                <button 
                  id="btn_clear_text"
                  onClick={() => setText("")}
                  className="px-3 py-2 border border-border-color text-text-secondary hover:text-text-primary hover:bg-bg-card-sub text-xs uppercase cursor-pointer"
                >
                  清空
                </button>
                
                <button 
                  id="btn_generate_speech"
                  disabled={isGenerating || isForgingAll}
                  onClick={handleGenerateRecitation}
                  className="px-6 py-2 bg-text-accent text-bg-panel text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-lg shadow-text-accent/5 active:scale-95"
                >
                  {isGenerating || isForgingAll ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      <span>{isLongModeActive ? "全卷连载中..." : "合成吟诵中..."}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 fill-current" />
                      <span>{isLongModeActive ? "分卷炼制全书" : "唤醒朗诵大师"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Prompt parameter inspector logic (Hidden by default, toggled via Navbar) */}
          {showPromptInspector && (
            <div id="prompt_inspector_box" className="p-5 bg-bg-panel border border-border-color-strong rounded-xs transition-opacity duration-300">
              <div className="flex items-center justify-between mb-3 border-b border-border-color pb-2">
                <span className="text-xs uppercase font-mono tracking-widest text-text-accent flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5" /> Prompt Instruction Engineering
                </span>
                <button 
                  onClick={() => setShowPromptInspector(false)}
                  className="text-[10px] font-mono text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  关闭
                </button>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed mb-3">
                利用 Gemini 强大的上下文遵循能力，我们将您的文本注入专门调校的艺术指令包裹中。这能将原本温吞机械的默认合成音，塑造成真正充满戏剧起伏的高雅朗诵：
              </p>
              <div className="bg-bg-card-sub p-4 border border-border-color rounded-sm font-mono text-[11px] text-text-accent/80 whitespace-pre-wrap leading-relaxed select-all">
                {`你是一位顶级的艺术朗诵家和配音大师。请用以下艺术风格和语速要求，深情并茂地朗诵后面的文本。
【朗诵风格要求】:${
                  selectedStyle === "elegant" 
                    ? "朗诵风格应该充满儒雅和书卷气，语气温婉、和缓，带有古典文人的清雅..." 
                    : selectedStyle === "solemn"
                    ? "朗诵风格应当厚重、庄严、宏大而深邃..."
                    : "根据所选情感语气注入独特气宇说辞..."
                }
【语速掌控要求】:${selectedSpeed === "slow" ? "以悠远沉稳、静谧缓慢节奏吟送..." : "适宜朗诵的标准艺术节奏..."}

[Manuscript / 客观文本]:
"${text.slice(0, 150)}${text.length > 150 ? "..." : ""}"`}
              </div>
            </div>
          )}

          {/* Smart Long Scrollwork Partitioning Management Console */}
          {isLongModeActive && (
            <div id="long_scrollwork_board" className="bg-bg-panel border border-border-color-strong p-5 rounded-xs mt-6 transition-all">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border-color pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-serif text-text-primary font-medium flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-text-accent" />
                    智能名著分卷连读 (Smart Scrollwork Partitioning)
                  </h3>
                  <p className="text-xs text-text-secondary mt-1">
                    我们已将您的连续字篇优雅切割为独立书册，分段提交可保障完美高真音品。
                  </p>
                </div>
                
                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-text-secondary select-none">
                    <input 
                      type="checkbox" 
                      checked={autoPlayNext} 
                      onChange={(e) => setAutoPlayNext(e.target.checked)}
                      className="rounded-xs border-border-color text-text-accent focus:ring-0 bg-bg-input h-3.5 w-3.5 accent-text-accent"
                    />
                    连续接力演奏
                  </label>
                </div>
              </div>

              {/* Batch forge triggers */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-card-sub p-3 rounded-xs border border-border-color mb-4">
                <div className="text-[11px] font-mono text-text-secondary">
                  划分 <span className="text-text-primary font-bold">{playableChunks.length}</span> 卷 • 
                  <span className="text-text-accent font-bold">{playableChunks.filter(c => c.status === 'ready').length}</span> 卷已完成
                </div>
                
                <div className="flex items-center gap-2">
                  {isForgingAll ? (
                    <button
                      onClick={() => { stopForgingRef.current = true; }}
                      className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-100 text-[10px] uppercase tracking-wider font-bold border border-red-800 rounded-xs cursor-pointer transition-colors"
                    >
                      停止连载合成
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={forgeAllScrollsSequential}
                        className="px-3 py-1.5 bg-text-accent/10 hover:bg-text-accent/20 text-text-accent border border-text-accent/30 text-[10px] uppercase tracking-wider font-bold rounded-xs cursor-pointer transition-colors flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3 h-3 fill-current" />
                        一键炼制全篇 ({playableChunks.filter(c => c.status !== 'ready').length}段待处理)
                      </button>
                      
                      {playableChunks.length > 0 && playableChunks.every(c => c.status === 'ready') && (
                        <button
                          onClick={mergeAndDownloadAllScrolls}
                          disabled={isMerging}
                          className="px-3 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase tracking-wider font-bold rounded-xs cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Download className="w-3 h-3" />
                          {isMerging ? "正在合并..." : "自动合并所有分卷"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Grid map */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                {playableChunks.map((chunk, index) => {
                  const isSelected = index === currentChunkIdx;
                  let borderClass = "border-border-color bg-bg-card-sub";
                  let statusBadge = null;
                  
                  if (isSelected) {
                    borderClass = "border-text-accent/60 bg-text-accent/5";
                  }
                  
                  switch (chunk.status) {
                    case 'generating':
                      statusBadge = (
                        <span className="text-[10px] text-text-accent flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-text-accent animate-ping" />
                          合成中
                        </span>
                      );
                      break;
                    case 'ready':
                      statusBadge = <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">已就绪</span>;
                      break;
                    case 'error':
                      statusBadge = <span className="text-[10px] text-red-400 font-medium" title={chunk.error}>断流</span>;
                      break;
                    default:
                      statusBadge = <span className="text-[10px] text-text-secondary">待合成</span>;
                  }

                  return (
                    <div 
                      key={chunk.id}
                      className={`p-3 border transition-all flex flex-col justify-between h-20 relative cursor-pointer group ${borderClass}`}
                      onClick={() => playSpecificChunk(index)}
                    >
                      <div className="flex justify-between items-start mb-1 select-none">
                        <span className="text-[10px] font-mono tracking-wider text-text-secondary font-bold">
                          第 {index + 1} 卷
                        </span>
                        {statusBadge}
                      </div>
                      
                      <p className="text-[11px] font-serif text-text-secondary line-clamp-1 italic group-hover:text-text-primary transition-colors">
                        "{chunk.text}"
                      </p>
                      
                      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-text-secondary">
                        <span>{chunk.text.length} 字</span>
                        <span className="text-text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                          {chunk.status === 'ready' ? "主控放音" : "一键吟诵"} →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Playback & Export Group */}
          <div className="flex flex-col gap-3">
            {/* Premium Playback Console */}
            <section id="section_playback_console">
              <div className="bg-bg-panel p-5 border border-border-color-strong relative overflow-hidden shadow-2xl shadow-black/40">
                
                {/* Decorative side accent */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-text-accent/2 blur-[35px] pointer-events-none" />

                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-mono font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1 select-none">
                    <span className="inline-block w-2 h-2 rounded-full bg-text-accent playing-wave-item" />
                    Live Preview Console
                  </span>
                  <span className="text-[10px] font-mono text-text-accent bg-text-accent/10 border border-text-accent/20 px-2 py-0.5 rounded-sm">
                    24KHZ / WAV
                  </span>
                </div>

                {/* Status or Details for Current Track */}
                <div className="mb-4 bg-bg-card-sub p-3 border border-border-color text-text-secondary">
                    {currentAudio ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-text-primary font-serif line-clamp-1 italic">
                          "{currentAudio.text}"
                        </span>
                        <div className="flex items-center gap-2 mt-1 text-[10px] tracking-wider text-text-secondary font-mono">
                          <span>VOICE: {getVoiceName(currentAudio.voice).split(" ")[0]}</span>
                          <span>•</span>
                          <span>TONE: {getStyleLabel(currentAudio.style)}</span>
                          <span>•</span>
                          <span>LEN: {currentAudio.textLength}字</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-xs text-text-secondary">
                        尚未点击生成。请载入经典或录入自创手稿，点击下方的 <strong>“唤醒朗诵大师”</strong>。
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Luxury Bar Visualizer */}
                <div className="flex items-end justify-between gap-[3px] h-14 mb-4 px-2 select-none border-b border-border-color pb-2">
                  {barHeights.map((height, idx) => (
                    <div 
                      key={idx}
                      style={{ height: `${height}%` }}
                      className={`flex-1 transition-all duration-150 rounded-t-sm ${
                        isPlaying 
                          ? "bg-gradient-to-t from-text-accent to-text-accent/80" 
                          : "bg-border-color-strong"
                      }`}
                    />
                  ))}
                </div>

                {/* Interactive Player Controls */}
                <div className="flex items-center justify-between gap-4">
                  <button 
                    id="btn_player_play_pause"
                    disabled={!currentAudio}
                    onClick={handlePlayPause}
                    className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                      !currentAudio 
                        ? "border-border-color text-text-muted bg-bg-card-sub/50 cursor-not-allowed" 
                        : "border-text-accent text-text-primary bg-text-accent/10 hover:bg-text-accent/20 cursor-pointer active:scale-95"
                    }`}
                    title={isPlaying ? "暂停" : "开始播放"}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-text-accent fill-text-accent" />
                    ) : (
                      <Play className="w-5 h-5 text-text-accent fill-text-accent translate-x-0.5" />
                    )}
                  </button>

                  {/* Progress bar info */}
                  <div className="flex-1">
                    <div className="flex justify-between items-center text-[10px] text-text-muted mb-1 font-mono">
                      <span>{formatTime(currentTime)}</span>
                      <span>{currentAudio ? formatTime(currentAudio.duration) : "00:00"}</span>
                    </div>
                    <div className="h-1 bg-bg-card-sub relative rounded-full overflow-hidden">
                      <div 
                        style={{ 
                          width: `${currentAudio ? (currentTime / currentAudio.duration) * 100 : 0}%` 
                        }} 
                        className="absolute left-0 top-0 h-full bg-text-accent rounded-full transition-all duration-100"
                      />
                    </div>
                  </div>

                  {/* Volume slider */}
                  <div className="flex items-center gap-1.5 bg-bg-card-sub px-2 py-1 rounded-sm border border-border-color">
                    <button 
                      onClick={toggleMute}
                      disabled={!currentAudio}
                      className="text-text-muted hover:text-text-primary cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isMuted ? (
                        <VolumeX className="w-3.5 h-3.5 text-red-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <input 
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      disabled={!currentAudio}
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-12 h-1 bg-bg-input rounded-lg appearance-none cursor-pointer accent-text-accent disabled:opacity-40"
                    />
                  </div>
                </div>

              </div>
            </section>

            {/* Export Section */}
            <div className="flex justify-end">
              <button 
                id="btn_download_wav"
                disabled={!currentAudio}
                onClick={() => handleDownload(currentAudio!)}
                className="px-6 py-2 bg-text-accent text-bg-panel text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-lg shadow-text-accent/5 active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出音频</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Setup Controls & Custom Audio Player */}
        <div id="controls_panel" className="w-full xl:w-[380px] flex flex-col gap-8 xl:min-h-0 xl:overflow-y-auto pr-1">
          
          {/* Voice Setup Group */}
          <section id="section_voice_picker" className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-secondary font-mono flex items-center gap-1">
                <span>01.</span>
                <span>Select Voice / 选角吟诵</span>
              </h3>
              <span className="text-[10px] text-text-secondary font-mono uppercase bg-bg-card-sub px-2 py-0.5 rounded-sm border border-border-color">
                5 Cores
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {AVAILABLE_VOICES.map((vo) => (
                <div 
                  id={`voice-box-${vo.id}`}
                  key={vo.id}
                  onClick={() => setSelectedVoice(vo.id)}
                  className={`p-3.5 bg-gradient-to-r transition-all duration-300 flex items-center gap-4 cursor-pointer relative ${
                    selectedVoice === vo.id 
                      ? "from-bg-card-sub to-bg-panel border border-text-accent/50 shadow-md shadow-text-accent/5" 
                      : "from-bg-input to-bg-input border border-border-color hover:border-border-color-strong hover:bg-bg-card-sub"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-serif italic text-sm ${
                    selectedVoice === vo.id ? "bg-text-accent text-bg-panel font-semibold" : "bg-bg-card-sub text-text-muted border border-border-color"
                  }`}>
                    {vo.id[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <div className="text-xs text-text-primary font-medium truncate">{vo.name}</div>
                      <div className="text-[10px] font-mono px-1.5 py-0.5 bg-text-accent/10 text-text-accent border border-text-accent/20 rounded-sm">{vo.type}</div>
                    </div>
                    <div className="text-[11px] text-text-secondary truncate mt-0.5">{vo.desc}</div>
                  </div>
                  {selectedVoice === vo.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-text-accent shadow-sm shadow-text-accent" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Mood Tone and Speed Settings */}
          <section id="section_artistic_tone" className="flex flex-col gap-5 bg-bg-input p-5 border border-border-color">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-secondary font-mono flex items-center gap-1">
                <span>02.</span>
                <span>Artistic Tone / 朗诵情感基调</span>
              </h3>
              <p className="text-[11px] text-text-secondary mt-1">
                指导 Gemini 吟诵时应表现出的语气艺术和情感底蕴。
              </p>
            </div>

            {/* Grid options */}
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map((style) => (
                <button
                  id={`style-btn-${style.id}`}
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-2 text-left border rounded-xs transition-all flex flex-col justify-between h-14 cursor-pointer ${
                    selectedStyle === style.id
                      ? "border-text-accent bg-text-accent/5 text-text-primary"
                      : "border-border-color bg-bg-card-sub text-text-muted hover:text-text-primary hover:border-border-color-strong"
                  }`}
                >
                  <span className="text-xs font-semibold">{style.label}</span>
                  <span className="text-[10px] text-text-secondary/80 line-clamp-1 truncate block font-sans tracking-wide">
                    {style.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* Speed setup */}
            <div className="border-t border-border-color pt-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-accent font-mono mb-2">
                Speed Rhythm / 吟篇节奏
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {SPEED_OPTIONS.map((sp) => (
                  <button
                    id={`speed-btn-${sp.id}`}
                    key={sp.id}
                    onClick={() => setSelectedSpeed(sp.id)}
                    className={`py-1.5 px-2 text-center text-[10px] border transition-all cursor-pointer ${
                      selectedSpeed === sp.id
                        ? "border-text-accent bg-text-accent/10 text-text-primary font-medium"
                        : "border-border-color bg-bg-card-sub text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <div>{sp.label.split(" ")[0]}</div>
                    <div className="text-[10px] text-text-secondary font-mono mt-0.5">{sp.label.split(" ")[1] || "1.0x"}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

        </div>
      </main>
      )}

      {currentView === "history" && (
        <section id="history_section" className="mx-6 my-6 p-6 bg-bg-panel border border-border-color">
        <div className="flex justify-between items-center mb-5 border-b border-border-color pb-3">
          <div>
            <h3 className="text-sm tracking-widest uppercase font-serif text-text-primary font-medium flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-text-accent" />
              吟诵成卷 · 本地生成历史 (Session History)
            </h3>
            <p className="text-xs text-text-secondary mt-1">记录您在此浏览器会话中成功渲染的每一篇有声艺术手卷</p>
          </div>
          <span className="text-xs text-text-accent font-mono">{history.length} 篇手卷</span>
        </div>

        {/* Filter and Export Tools Panel */}
        {history.length > 0 && (
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-bg-card-sub p-4 border border-border-color mb-5 rounded-xs">
            <div className="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center gap-4 w-full xl:w-auto">
              
              {/* Search Box */}
              <div className="relative flex-1 max-w-xs min-w-[220px]">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-muted">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="搜索历史内容/角色/风格..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-bg-input border border-border-color pl-9 pr-8 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-text-accent/40 rounded-xs"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 right-2 flex items-center text-text-muted hover:text-text-primary cursor-pointer border-none bg-transparent"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Date Pickers */}
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-text-secondary">
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-accent font-bold">按时间筛选:</span>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="bg-bg-input border border-border-color px-2.5 py-1 text-xs text-text-primary focus:outline-none rounded-xs cursor-pointer font-mono"
                />
                <span className="text-text-muted">至</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="bg-bg-input border border-border-color px-2.5 py-1 text-xs text-text-primary focus:outline-none rounded-xs cursor-pointer font-mono"
                />
                
                {(filterStartDate || filterEndDate) && (
                  <button
                    onClick={() => {
                      setFilterStartDate("");
                      setFilterEndDate("");
                    }}
                    className="px-2.5 py-1 bg-bg-input hover:bg-bg-card-sub border border-border-color text-[10px] cursor-pointer rounded-xs text-text-secondary transition-colors"
                  >
                    清除
                  </button>
                )}
              </div>

            </div>

            {/* Export all button */}
            <button
              onClick={handleExportAllHistory}
              className="w-full xl:w-auto px-4 py-2 bg-text-accent text-bg-panel text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-text-accent/5 rounded-xs"
            >
              <FileArchive className="w-3.5 h-3.5" />
              <span>全部打包导出 (ZIP)</span>
            </button>
          </div>
        )}

        {history.length === 0 ? (
          <div className="text-center py-10 text-text-muted bg-bg-card-sub/20 border border-dashed border-border-color">
            <BookOpen className="w-8 h-8 text-stone-700 mx-auto mb-2.5" />
            <p className="text-xs">
              暂无历史生成记录。快录入或选择一首诗作，点击“唤醒朗诵大师”！
            </p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-10 text-text-secondary bg-bg-card-sub/20 border border-dashed border-border-color">
            <Search className="w-8 h-8 text-stone-700 mx-auto mb-2.5" />
            <p className="text-xs">
              未能匹配到任何生成历史。请检查搜索关键字或筛选时间段！
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredSessions.map((session) => {
              const isExpanded = !!expandedSessions[session.id];
              const isSelected = currentAudio?.id === session.id;
              
              return (
                <div 
                  key={session.id}
                  className={`p-5 bg-bg-card-sub border transition-all flex flex-col gap-3 ${
                    isSelected ? "border-text-accent bg-text-accent/3" : "border-border-color hover:border-border-color-strong"
                  }`}
                >
                  {/* Row Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-text-secondary font-mono">
                        {formatDateTime(session.timestamp)}
                      </span>
                      <span className="bg-bg-input px-2 py-0.5 rounded-xs border border-border-color text-[10px] text-text-accent font-mono">
                        {session.isGroup ? `连读合集 · ${session.chunks.length} 折` : "单篇朗诵"}
                      </span>
                      <span className="bg-bg-card-sub px-2 py-0.5 rounded-xs border border-border-color text-[10px] text-text-secondary font-mono">
                        {getVoiceName(session.voice).split(" ")[0]} · {getStyleLabel(session.style)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      {session.isGroup ? (
                        <>
                          <button
                            onClick={() => mergeAndDownloadHistorySession(session)}
                            disabled={isHistoryMerging[session.id]}
                            className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-[10px] uppercase font-bold tracking-wider cursor-pointer flex items-center gap-1 disabled:opacity-50 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            {isHistoryMerging[session.id] ? "正在合并..." : "合集下载"}
                          </button>
                          
                          <button
                            onClick={() => toggleSessionExpand(session.id)}
                            className="px-3 py-1.5 bg-bg-input hover:bg-bg-card-sub text-text-secondary border border-border-color text-[10px] cursor-pointer transition-colors"
                          >
                            {isExpanded ? "收起分卷 ▴" : "展开分卷 ▾"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setCurrentAudio(session.chunks[0]);
                              setIsPlaying(true);
                            }}
                            className="px-3 py-1.5 bg-bg-input hover:bg-text-accent hover:text-bg-panel transition-all border border-border-color text-[10px] uppercase font-bold tracking-wider cursor-pointer"
                          >
                            点击播放
                          </button>
                          <button
                            onClick={() => handleDownload(session.chunks[0])}
                            className="p-1.5 px-2.5 border border-border-color-strong hover:border-text-accent text-text-muted hover:text-text-primary cursor-pointer"
                            title="导出 WAV 音频"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => handleReloadSession(session)}
                        className="px-3 py-1.5 bg-bg-input hover:bg-text-accent hover:text-bg-panel text-text-secondary transition-all border border-border-color text-[10px] font-bold cursor-pointer flex items-center gap-1"
                        title="载入参数及手稿到工作区重新编辑"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>重新载入</span>
                      </button>

                      <button
                        onClick={() => handleDeleteSession(session)}
                        className="p-1.5 px-2.5 border border-border-color hover:border-red-500/50 text-text-muted hover:text-red-400 cursor-pointer flex items-center justify-center transition-all"
                        title="删除历史记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Text Preview */}
                  <p className="text-xs font-serif text-text-secondary leading-relaxed italic line-clamp-1 border-l-2 border-text-accent/30 pl-3 py-0.5">
                    "{session.text.replace(/\n/g, " ")}"
                  </p>
                  
                  {/* Row Footer Metrics */}
                  <div className="flex flex-wrap items-center justify-between text-[10px] text-text-muted font-mono border-t border-border-color pt-2 mt-1 gap-2">
                    <div>
                      时长: {formatTime(session.duration)} • 字数: {session.textLength}
                    </div>
                    {session.elapsedTimeMs !== undefined && (
                      <div className="flex flex-wrap gap-x-2 text-[#8e8e8e]">
                        <span>总用时: {session.elapsedTimeMs}ms</span>
                        {session.totalTokens ? (
                          <span>• 总 Token: {session.totalTokens} (入: {session.promptTokens} / 出: {session.candidatesTokens})</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  
                  {/* Chunks List (Expanded) */}
                  {session.isGroup && isExpanded && (
                    <div className="mt-3 pl-4 border-l border-border-color-strong flex flex-col gap-2">
                      <div className="text-[10px] text-text-muted font-mono mb-1 uppercase tracking-wider">分卷明细 (Scroll Chunks Detail)</div>
                      {session.chunks.map((chunk, idx) => {
                        const isChunkSelected = currentAudio?.id === chunk.id;
                        
                        return (
                          <div 
                            key={chunk.id}
                            className={`p-3 bg-bg-input/20 border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors ${
                              isChunkSelected ? "border-text-accent/50 bg-text-accent/2" : "border-border-color hover:border-border-color-strong"
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] text-text-accent font-mono font-bold">第 {idx + 1} 折</span>
                                <span className="text-[9px] text-text-muted font-mono">时长: {formatTime(chunk.duration)} • 字数: {chunk.textLength}</span>
                              </div>
                              <p className="text-[11px] font-serif text-text-secondary line-clamp-1 italic">
                                "{chunk.text}"
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {chunk.elapsedTimeMs !== undefined && (
                                <span className="text-[9px] text-text-muted font-mono mr-2">
                                  {chunk.elapsedTimeMs}ms • {chunk.totalTokens}T
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  setCurrentAudio(chunk);
                                  setIsPlaying(true);
                                }}
                                className="px-2.5 py-1 bg-bg-input hover:bg-text-accent hover:text-bg-panel transition-all border border-border-color text-[9px] uppercase font-bold tracking-wider cursor-pointer"
                              >
                                播放此折
                              </button>
                              <button
                                onClick={() => handleDownload(chunk)}
                                className="p-1 px-2 border border-border-color-strong hover:border-text-accent text-text-muted hover:text-text-primary cursor-pointer"
                                title="导出 WAV 音频"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {currentView === "settings" && (
        <div className="max-w-2xl mx-auto my-8 p-8 bg-bg-panel border border-border-color shadow-2xl rounded-sm animate-in fade-in zoom-in-95 duration-200">
          <h2 className="text-xl font-serif italic text-text-primary flex items-center gap-2 border-b border-border-color pb-3 mb-6">
            <Sliders className="w-5 h-5 text-text-accent" />
            API Settings / 配置管理
          </h2>
          
          <div className="flex flex-col gap-5 text-xs">
            {/* Save Success Notice */}
            {saveSuccess && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 rounded-sm flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>参数配置已成功保存并同步！</span>
              </div>
            )}

            {/* Model Name Settings */}
            <div>
              <label className="text-text-secondary block mb-1 font-mono uppercase tracking-wider">Model Name / 模型名称</label>
              <input
                type="text"
                placeholder="e.g. gemini-3.1-flash-tts"
                className="w-full bg-bg-input border border-border-color p-2.5 text-text-primary focus:outline-none focus:border-text-accent/45 font-mono"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
              <span className="text-[10px] text-text-muted mt-1 block">配置调用的 Gemini TTS 模型标识。</span>
            </div>

            {/* 1. API Provider Selector */}
            <div className="border-t border-border-color pt-4">
              <label className="text-text-secondary block mb-1.5 uppercase tracking-wider font-mono font-bold">1. 启用渠道 / Active Provider</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setApiType("official")}
                  className={`py-2.5 px-3 border transition-all text-center cursor-pointer text-xs font-mono uppercase tracking-wider ${
                    apiType === "official"
                      ? "border-text-accent bg-text-accent/10 text-text-primary font-semibold"
                      : "border-border-color bg-bg-input text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Gemini 官方渠道
                </button>
                <button
                  onClick={() => setApiType("new_api")}
                  className={`py-2.5 px-3 border transition-all text-center cursor-pointer text-xs font-mono uppercase tracking-wider ${
                    apiType === "new_api"
                      ? "border-text-accent bg-text-accent/10 text-text-primary font-semibold"
                      : "border-border-color bg-bg-input text-text-secondary hover:text-text-primary"
                  }`}
                >
                  NewAPI 本地中转
                </button>
              </div>
              <span className="text-[10px] text-text-muted mt-1.5 block">选择系统当前默认使用的语音合成渠道服务。</span>
            </div>

            {/* 2. Dynamic credentials based on active provider */}
            <div className="border-t border-border-color pt-4">
              {apiType === "official" ? (
                <div>
                  <h3 className="text-[10px] font-bold text-text-accent uppercase tracking-wider mb-2.5 font-mono">2. Gemini 官方渠道参数配置</h3>
                  <div>
                    <label className="text-text-secondary block mb-1 font-mono uppercase tracking-wider">GEMINI_API_KEY</label>
                    <input
                      type="password"
                      placeholder="输入官方 Gemini API 秘钥..."
                      className="w-full bg-bg-input border border-border-color p-2.5 text-text-primary focus:outline-none focus:border-text-accent/45 font-mono"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                    />
                    <span className="text-[10px] text-text-muted mt-1 block">若为空，则默认使用系统环境变量中的 GEMINI_API_KEY</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <h3 className="text-[10px] font-bold text-text-accent uppercase tracking-wider mb-1 font-mono">2. NewAPI 中转渠道参数配置</h3>
                  <div>
                    <label className="text-text-secondary block mb-1 font-mono uppercase tracking-wider">NewAPI Base URL</label>
                    <input
                      type="text"
                      placeholder="e.g. http://192.168.100.170:3000/v1"
                      className="w-full bg-bg-input border border-border-color p-2.5 text-text-primary focus:outline-none focus:border-text-accent/45 font-mono"
                      value={newApiBaseUrl}
                      onChange={(e) => setNewApiBaseUrl(e.target.value)}
                    />
                    <span className="text-[10px] text-text-muted mt-1 block">本地中转站的 OpenAI 格式基础 URL。</span>
                  </div>
                  <div>
                    <label className="text-text-secondary block mb-1 font-mono uppercase tracking-wider">NewAPI Token / 访问令牌</label>
                    <input
                      type="password"
                      placeholder="输入 NewAPI 访问令牌/秘钥..."
                      className="w-full bg-bg-input border border-border-color p-2.5 text-text-primary focus:outline-none focus:border-text-accent/45 font-mono"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                    />
                    <span className="text-[10px] text-text-muted mt-1 block">中转站分配的用户 API 令牌。</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3 border-t border-border-color pt-5">
            <button
              onClick={() => setCurrentView("studio")}
              className="px-4 py-2.5 border border-text-accent/20 hover:border-text-accent/60 hover:bg-text-accent/5 text-text-accent transition-colors cursor-pointer text-xs font-mono uppercase tracking-wider"
            >
              返回工作台
            </button>
            <button
              onClick={async () => {
                setIsSavingSettings(true);
                try {
                  const res = await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      api_type: apiType,
                      gemini_api_key: geminiApiKey,
                      new_api_base_url: newApiBaseUrl,
                      new_api_key: newApiKey,
                      model_name: modelName
                    })
                  });
                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to save settings");
                  }
                  
                  const healthRes = await fetch("/api/health");
                  const healthData = await healthRes.json();
                  setApiHasKey(healthData.hasKey);
                  
                  setSaveSuccess(true);
                  setTimeout(() => setSaveSuccess(false), 3000);
                } catch (err: any) {
                  alert(err.message || "保存设置失败");
                } finally {
                  setIsSavingSettings(false);
                }
              }}
              disabled={isSavingSettings}
              className="px-5 py-2.5 bg-text-accent text-bg-panel font-bold hover:opacity-95 transition-all disabled:opacity-50 text-xs cursor-pointer tracking-wider font-mono"
            >
              {isSavingSettings ? "保存中..." : "保存设置"}
            </button>
          </div>
        </div>
      )}

        </div>

        {/* Elegant Footer Area */}
        <footer id="app_footer" className="px-6 py-4 border-t border-border-color bg-bg-header text-[10px] text-text-muted font-mono flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap gap-4 md:gap-8 justify-center sm:justify-start">
            <span className="uppercase tracking-widest text-text-accent/80 font-semibold">• Model: {modelName}</span>
            <span className="uppercase tracking-widest">• Studio Rendering: Enabled</span>
            <span className="uppercase tracking-widest">• Sample Rate: 24,000Hz PCM-WAV</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500/80 animate-pulse" />
            <span className="uppercase tracking-widest">Network Latency: {latency}ms</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
