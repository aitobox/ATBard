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
  ChevronDown
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
  
  // System latency state (mock realistic interactive display)
  const [latency, setLatency] = useState<number>(42);

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
      a.download = `EchoMuse_FullMerged_${voiceName}_${styleName}_${Date.now().toString().slice(-6)}.wav`;
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
      a.download = `EchoMuse_FullMerged_${voiceName}_${styleName}_${Date.now().toString().slice(-6)}.wav`;
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
    
    a.download = `EchoMuse_Recite_${voiceName}_${styleName}_${Date.now().toString().slice(-6)}.wav`;
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

  return (
    <div id="app_container" className="w-full min-h-screen bg-[#070707] text-[#d4d4d4] font-sans flex flex-col justify-between overflow-x-hidden antialiased selection:bg-[#c5a059] selection:text-black">
      
      {/* Header section */}
      <nav id="navbar" className="flex flex-col md:flex-row justify-between items-center px-6 md:px-12 py-5 border-b border-white/5 bg-[#0a0a0aj] backdrop-blur-md sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-[#c5a059] to-[#8e6e3c] rounded-sm flex items-center justify-center shadow-lg shadow-[#c5a059]/10">
            <Music4 className="w-4 h-4 text-black" />
          </div>
          <div>
            <span className="text-xl font-light tracking-[0.25em] uppercase text-white font-serif">
              Echo Muse <span className="text-xs align-super opacity-60 text-[#c5a059] font-mono leading-none">3.1</span>
            </span>
            <p className="text-[9px] text-[#c5a059]/60 tracking-widest uppercase font-mono mt-0.5">Gemini High-Fidelity TTS Engine</p>
          </div>
        </div>
        

        
        <div className="hidden lg:flex items-center gap-6 text-[11px] uppercase tracking-widest text-gray-500 font-mono">
          <span className="text-white hover:text-[#c5a059] transition-colors cursor-pointer">● Reciter</span>
          <a href="#history_section" className="hover:text-[#c5a059] transition-colors">History</a>
          <span className="opacity-40 select-none">|</span>
          <button 
            onClick={() => setShowPromptInspector(!showPromptInspector)} 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xs bg-[#121212] border border-[#c5a059]/20 hover:border-[#c5a059]/60 text-[#c5a059] cursor-pointer transition-colors"
          >
            <Code className="w-3 h-3" />
            <span>Prompt AI</span>
          </button>
        </div>
      </nav>

      {/* Warning if no Gemini Key configured */}
      {!apiHasKey && (
        <div id="key_alert" className="mx-6 md:mx-12 mt-4 alert-box p-4 bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex gap-3 items-start animate-pulse">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <strong className="font-bold">提醒：尚未配置核心 GEMINI_API_KEY。</strong>
            <p className="mt-1 text-amber-300/80 leading-relaxed">
              当前应用未检测到全局 Gemini 秘钥环境。您可以点击页面右上角的 <strong className="text-white">Settings &gt; Secrets</strong>，并在其中添加键名为 <code className="bg-black/30 px-1 py-0.5 text-orange-200 rounded-sm">GEMINI_API_KEY</code> 的凭证，即可正式解锁 Gemini 3.1 毫秒级极速 TTS 音频合成渲染服务。
            </p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col xl:flex-row px-4 md:px-12 py-6 md:py-8 gap-8 md:gap-10">
        
        {/* Left Side: Textarea & Presets */}
        <div id="main_editor_panel" className="flex-1 flex flex-col gap-6">
          


          <div id="editor_header" className="flex justify-between items-end mt-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-serif italic text-white leading-tight font-medium flex items-center gap-2">
                Manuscript Editor
                <span className="not-italic text-xs font-mono font-normal tracking-widest uppercase text-[#c5a059]/60 px-2 py-0.5 bg-[#c5a059]/5 border border-[#c5a059]/10 rounded-sm">
                  手稿编撰
                </span>
              </h1>
              <p className="text-xs text-gray-500 tracking-wide uppercase mt-1">
                请输入你需要配音或朗诵的文学诗稿、演讲词或散文乐段 {isLongModeActive && " · [已启用长链智能分卷]"}
              </p>
            </div>
            <div className="text-[10px] text-gray-500 font-mono tracking-widest uppercase bg-white/5 px-2 py-1 rounded-xs">
              WORDS: <span className="text-white font-bold">{text.length}</span> / 50000
            </div>
          </div>
          
          {/* Main Textarea input */}
          <div className="relative flex-1 min-h-[300px] flex flex-col bg-[#111] border border-white/5 focus-within:border-[#c5a059]/40 transition-colors">
            <textarea 
              id="raw_text_textarea"
              maxLength={50000}
              className="w-full flex-1 bg-transparent p-6 md:p-8 text-neutral-300 text-lg leading-relaxed font-serif text-gray-300 focus:outline-none resize-none placeholder-stone-600 border-none"
              placeholder="请在此输入或剪贴您需要完美吟诵或高真配音的诗行、短文或旁白..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            
            {/* Action block directly inside editor */}
            <div className="p-4 border-t border-white/5 bg-[#0e0e0e] flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex gap-2 text-[10px] text-gray-500 font-mono">
                <span>[环境支持: 连读最大5万字]</span>
                <span>•</span>
                <span>[语音引擎: 3.1-flash-tts]</span>
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {errorMessage && (
                  <p className="text-xs text-red-400 font-sans mr-2 line-clamp-1">{errorMessage}</p>
                )}
                
                <button 
                  id="btn_clear_text"
                  onClick={() => setText("")}
                  className="px-3 py-2 border border-white/5 text-gray-400 hover:text-white hover:bg-white/5 text-xs uppercase cursor-pointer"
                >
                  清空
                </button>
                
                <button 
                  id="btn_generate_speech"
                  disabled={isGenerating || isForgingAll}
                  onClick={handleGenerateRecitation}
                  className="px-6 py-2 bg-[#c5a059] text-black text-xs font-bold uppercase tracking-widest hover:bg-[#d4b069] transition-all disabled:bg-stone-700 disabled:text-stone-400 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-lg shadow-[#c5a059]/5 active:scale-95"
                >
                  {isGenerating || isForgingAll ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      <span>{isLongModeActive ? "全卷连载炼制中..." : "合成吟诵中..."}</span>
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
            <div id="prompt_inspector_box" className="p-5 bg-[#0f0f0f] border border-[#c5a059]/30 rounded-xs transition-opacity duration-300">
              <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                <span className="text-xs uppercase font-mono tracking-widest text-[#c5a059] flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5" /> Prompt Instruction Engineering
                </span>
                <button 
                  onClick={() => setShowPromptInspector(false)}
                  className="text-[10px] font-mono text-gray-400 hover:text-white cursor-pointer"
                >
                  关闭
                </button>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed mb-3">
                利用 Gemini 强大的上下文遵循能力，我们将您的文本注入专门调校的艺术指令包裹中。这能将原本温吞机械的默认合成音，塑造成真正充满戏剧起伏的高雅朗诵：
              </p>
              <div className="bg-black/60 p-4 border border-white/5 rounded-sm font-mono text-[11px] text-[#c5a059]/80 whitespace-pre-wrap leading-relaxed select-all">
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
            <div id="long_scrollwork_board" className="bg-[#0f0f0f] border border-[#c5a059]/20 p-5 rounded-xs mt-6 transition-all">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-serif text-white font-medium flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#c5a059]" />
                    智能名著分卷连读 (Smart Scrollwork Partitioning)
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    我们已将您的连续字篇优雅切割为独立书册，分段提交可保障完美高真音品。
                  </p>
                </div>
                
                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400 select-none">
                    <input 
                      type="checkbox" 
                      checked={autoPlayNext} 
                      onChange={(e) => setAutoPlayNext(e.target.checked)}
                      className="rounded-xs border-white/10 text-[#c5a059] focus:ring-0 bg-[#141414] h-3.5 w-3.5 accent-[#c5a059]"
                    />
                    连续接力演奏
                  </label>
                </div>
              </div>

              {/* Batch forge triggers */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white/3 p-3 rounded-xs border border-white/5 mb-4">
                <div className="text-[11px] font-mono text-gray-400">
                  划分 <span className="text-white font-bold">{playableChunks.length}</span> 折书卷 • 
                  就绪 <span className="text-[#c5a059] font-bold">{playableChunks.filter(c => c.status === 'ready').length}</span> 折
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
                        className="px-3 py-1.5 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30 text-[10px] uppercase tracking-wider font-bold rounded-xs cursor-pointer transition-colors flex items-center gap-1.5"
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
                  let borderClass = "border-white/5 bg-[#141414]";
                  let statusBadge = null;
                  
                  if (isSelected) {
                    borderClass = "border-[#c5a059]/60 bg-[#c5a059]/5";
                  }
                  
                  switch (chunk.status) {
                    case 'generating':
                      statusBadge = (
                        <span className="text-[9px] text-[#c5a059] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#c5a059] animate-ping" />
                          合成中
                        </span>
                      );
                      break;
                    case 'ready':
                      statusBadge = <span className="text-[9px] text-emerald-400">已就绪</span>;
                      break;
                    case 'error':
                      statusBadge = <span className="text-[9px] text-red-400" title={chunk.error}>断流</span>;
                      break;
                    default:
                      statusBadge = <span className="text-[9px] text-gray-500">待合成</span>;
                  }

                  return (
                    <div 
                      key={chunk.id}
                      className={`p-3 border transition-all flex flex-col justify-between h-20 relative cursor-pointer group ${borderClass}`}
                      onClick={() => playSpecificChunk(index)}
                    >
                      <div className="flex justify-between items-start mb-1 select-none">
                        <span className="text-[10px] font-mono tracking-wider text-gray-400 font-bold">
                          第 {index + 1} 卷
                        </span>
                        {statusBadge}
                      </div>
                      
                      <p className="text-[11px] font-serif text-stone-300 line-clamp-1 italic group-hover:text-white transition-colors">
                        "{chunk.text}"
                      </p>
                      
                      <div className="flex items-center justify-between mt-1 text-[9px] font-mono text-gray-500">
                        <span>{chunk.text.length} 字</span>
                        <span className="text-[#c5a059] opacity-0 group-hover:opacity-100 transition-opacity">
                          {chunk.status === 'ready' ? "主控放音" : "一键吟诵"} →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Setup Controls & Custom Audio Player */}
        <div id="controls_panel" className="w-full xl:w-[380px] flex flex-col gap-8">
          
          {/* Voice Setup Group */}
          <section id="section_voice_picker" className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono flex items-center gap-1">
                <span>01.</span>
                <span>Select Voice / 选角吟松</span>
              </h3>
              <span className="text-[9px] text-stone-500 font-mono uppercase bg-[#141414] px-1.5 py-0.5 rounded-sm border border-white/5">
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
                      ? "from-[#1a1a1a] to-[#252019] border border-[#c5a059]/50 shadow-md shadow-[#c5a059]/5" 
                      : "from-[#111] to-[#111] border border-white/5 hover:border-white/10 hover:bg-[#151515]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-serif italic text-sm ${
                    selectedVoice === vo.id ? "bg-[#c5a059] text-black font-semibold" : "bg-neutral-800 text-gray-400"
                  }`}>
                    {vo.id[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <div className="text-xs text-white font-medium truncate">{vo.name}</div>
                      <div className="text-[9px] font-mono opacity-50 px-1 py-0.2 bg-white/5 text-stone-400 scale-90">{vo.type}</div>
                    </div>
                    <div className="text-[10px] text-gray-500 truncate mt-0.5">{vo.desc}</div>
                  </div>
                  {selectedVoice === vo.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#c5a059] shadow-sm shadow-[#c5a059]" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Mood Tone and Speed Settings */}
          <section id="section_artistic_tone" className="flex flex-col gap-5 bg-[#111] p-5 border border-white/5">
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono flex items-center gap-1">
                <span>02.</span>
                <span>Artistic Tone / 朗诵情感基调</span>
              </h3>
              <p className="text-[10px] text-stone-500 mt-1">
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
                      ? "border-[#c5a059] bg-[#c5a059]/5 text-white"
                      : "border-white/5 bg-[#141414] text-gray-400 hover:text-white hover:border-white/10"
                  }`}
                >
                  <span className="text-xs font-semibold">{style.label}</span>
                  <span className="text-[9px] opacity-60 line-clamp-1 truncate block font-sans tracking-wide">
                    {style.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* Speed setup */}
            <div className="border-t border-white/5 pt-4">
              <h4 className="text-[9px] uppercase tracking-widest text-[#c5a059] font-mono mb-2">
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
                        ? "border-[#c5a059] bg-[#c5a059]/10 text-white font-medium"
                        : "border-white/5 bg-[#141414] text-gray-500 hover:text-white"
                    }`}
                  >
                    <div>{sp.label.split(" ")[0]}</div>
                    <div className="text-[8px] opacity-40 scale-90">{sp.label.split(" ")[1] || "1.0x"}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Premium Playback Console */}
          <section id="section_playback_console" className="mt-auto">
            <div className="bg-[#121212] p-5 border border-white/10 relative overflow-hidden shadow-2xl shadow-black/40">
              
              {/* Decorative side accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#c5a059]/2 blur-[35px] pointer-events-none" />

              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-1 select-none">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#c5a059] playing-wave-item" />
                  Live Preview Console
                </span>
                <span className="text-[9px] font-mono text-[#c5a059] bg-[#c5a059]/10 border border-[#c5a059]/20 px-1.5 py-0.5 rounded-sm">
                  24KHZ / WAV
                </span>
              </div>

              {/* Status or Details for Current Track */}
              <div className="mb-4 bg-black/40 p-3 border border-white/5 text-stone-400">
                {currentAudio ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-white font-serif line-clamp-1 italic">
                      "{currentAudio.text}"
                    </span>
                    <div className="flex items-center gap-2 mt-1 text-[9px] tracking-wider text-gray-500 font-mono">
                      <span>VOICE: {getVoiceName(currentAudio.voice).split(" ")[0]}</span>
                      <span>•</span>
                      <span>TONE: {getStyleLabel(currentAudio.style)}</span>
                      <span>•</span>
                      <span>LEN: {currentAudio.textLength}字</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-xs text-gray-500">
                      尚未点击生成。请载入经典或录入自创手稿，点击下方的 <strong>“唤醒朗诵大师”</strong>。
                    </p>
                  </div>
                )}
              </div>
              
              {/* Luxury Bar Visualizer */}
              <div className="flex items-end justify-between gap-[3px] h-14 mb-4 px-2 select-none border-b border-white/5 pb-2">
                {barHeights.map((height, idx) => (
                  <div 
                    key={idx}
                    style={{ height: `${height}%` }}
                    className={`flex-1 transition-all duration-150 rounded-t-sm ${
                      isPlaying 
                        ? "bg-gradient-to-t from-[#8e6e3c] to-[#c5a059]" 
                        : "bg-stone-800"
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
                      ? "border-neutral-800 text-neutral-600 bg-neutral-900/50 cursor-not-allowed" 
                      : "border-[#c5a059] text-white bg-[#c5a059]/10 hover:bg-[#c5a059]/20 cursor-pointer active:scale-95"
                  }`}
                  title={isPlaying ? "暂停" : "开始播放"}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-[#c5a059] fill-[#c5a059]" />
                  ) : (
                    <Play className="w-5 h-5 text-[#c5a059] fill-[#c5a059] translate-x-0.5" />
                  )}
                </button>

                {/* Progress bar info */}
                <div className="flex-1">
                  <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1 font-mono">
                    <span>{formatTime(currentTime)}</span>
                    <span>{currentAudio ? formatTime(currentAudio.duration) : "00:00"}</span>
                  </div>
                  <div className="h-1 bg-white/5 relative rounded-full overflow-hidden">
                    <div 
                      style={{ 
                        width: `${currentAudio ? (currentTime / currentAudio.duration) * 100 : 0}%` 
                      }} 
                      className="absolute left-0 top-0 h-full bg-[#c5a059] rounded-full transition-all duration-100"
                    />
                  </div>
                </div>

                {/* Volume slider */}
                <div className="flex items-center gap-1.5 bg-[#0a0a0a] px-2 py-1 rounded-sm border border-white/5">
                  <button 
                    onClick={toggleMute}
                    disabled={!currentAudio}
                    className="text-gray-500 hover:text-white cursor-pointer disabled:cursor-not-allowed"
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
                    className="w-12 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#c5a059] disabled:opacity-40"
                  />
                </div>
              </div>

            </div>
          </section>

          {/* WAV & Export Section */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              id="btn_download_wav"
              disabled={!currentAudio}
              onClick={() => handleDownload(currentAudio!)}
              className="py-3 bg-neutral-900 border border-white/10 hover:border-[#c5a059]/40 text-[10px] uppercase tracking-widest text-[#d4d4d4] hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:hover:border-white/10 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              WAV Export
            </button>
            <button 
              id="btn_share_config"
              onClick={() => {
                if (currentAudio) {
                  navigator.clipboard.writeText(currentAudio.text);
                  alert("朗诵文本已成功复制到剪贴板，可供分享或存录。");
                } else {
                  alert("生成后可一键复制文本分享。");
                }
              }}
              className="py-3 bg-neutral-900 border border-white/10 hover:border-[#c5a059]/40 text-[10px] uppercase tracking-widest text-[#d4d4d4] hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Share Text
            </button>
          </div>

        </div>
      </main>

      {/* History Log Section - Under the folds */}
      <section id="history_section" className="mx-4 md:mx-12 my-8 p-6 bg-[#0c0c0c] border border-white/5">
        <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm tracking-widest uppercase font-serif text-white font-medium flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#c5a059]" />
              吟诵成卷 · 本地生成历史 (Session History)
            </h3>
            <p className="text-xs text-stone-500 mt-1">记录您在此浏览器会话中成功渲染的每一篇有声艺术手卷</p>
          </div>
          <span className="text-xs text-[#c5a059] font-mono">{history.length} 篇手卷</span>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-10 text-gray-600 bg-black/20 border border-dashed border-white/5">
            <BookOpen className="w-8 h-8 text-stone-700 mx-auto mb-2.5" />
            <p className="text-xs">
              暂无历史生成记录。快录入或选择一首诗作，点击“唤醒朗诵大师”！
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupHistory(history).map((session) => {
              const isExpanded = !!expandedSessions[session.id];
              const isSelected = currentAudio?.id === session.id;
              
              return (
                <div 
                  key={session.id}
                  className={`p-5 bg-black/40 border transition-all flex flex-col gap-3 ${
                    isSelected ? "border-[#c5a059] bg-[#c5a059]/3" : "border-white/5 hover:border-white/10"
                  }`}
                >
                  {/* Row Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-500 font-mono">
                        {session.timestamp.toLocaleTimeString()}
                      </span>
                      <span className="bg-[#121212] px-2 py-0.5 rounded-xs border border-white/5 text-[10px] text-[#c5a059] font-mono">
                        {session.isGroup ? `连读合集 · ${session.chunks.length} 折` : "单篇朗诵"}
                      </span>
                      <span className="bg-white/5 px-2 py-0.5 rounded-xs border border-white/5 text-[10px] text-stone-400 font-mono">
                        {getVoiceName(session.voice).split(" ")[0]} · {getStyleLabel(session.style)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      {session.isGroup ? (
                        <>
                          <button
                            onClick={() => mergeAndDownloadHistorySession(session)}
                            disabled={isHistoryMerging[session.id]}
                            className="px-3 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase font-bold tracking-wider cursor-pointer flex items-center gap-1 disabled:opacity-50 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            {isHistoryMerging[session.id] ? "正在合并..." : "合集下载"}
                          </button>
                          
                          <button
                            onClick={() => toggleSessionExpand(session.id)}
                            className="px-3 py-1.5 bg-[#121212] hover:bg-white/10 text-stone-300 border border-white/5 text-[10px] cursor-pointer transition-colors"
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
                            className="px-3 py-1.5 bg-[#121212] hover:bg-[#c5a059] hover:text-black transition-all border border-white/5 text-[10px] uppercase font-bold tracking-wider cursor-pointer"
                          >
                            点击播放
                          </button>
                          <button
                            onClick={() => handleDownload(session.chunks[0])}
                            className="p-1.5 px-2.5 border border-white/10 hover:border-[#c5a059] text-gray-400 hover:text-white cursor-pointer"
                            title="导出 WAV 音频"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Text Preview */}
                  <p className="text-xs font-serif text-stone-300 leading-relaxed italic line-clamp-1 border-l-2 border-[#c5a059]/30 pl-3 py-0.5">
                    "{session.text.replace(/\n/g, " ")}"
                  </p>
                  
                  {/* Row Footer Metrics */}
                  <div className="flex flex-wrap items-center justify-between text-[10px] text-gray-500 font-mono border-t border-white/5 pt-2 mt-1 gap-2">
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
                    <div className="mt-3 pl-4 border-l border-white/10 flex flex-col gap-2">
                      <div className="text-[10px] text-stone-500 font-mono mb-1 uppercase tracking-wider">分卷明细 (Scroll Chunks Detail)</div>
                      {session.chunks.map((chunk, idx) => {
                        const isChunkSelected = currentAudio?.id === chunk.id;
                        
                        return (
                          <div 
                            key={chunk.id}
                            className={`p-3 bg-black/20 border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors ${
                              isChunkSelected ? "border-[#c5a059]/50 bg-[#c5a059]/2" : "border-white/5 hover:border-white/10"
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] text-[#c5a059] font-mono font-bold">第 {idx + 1} 折</span>
                                <span className="text-[9px] text-stone-500 font-mono">时长: {formatTime(chunk.duration)} • 字数: {chunk.textLength}</span>
                              </div>
                              <p className="text-[11px] font-serif text-stone-400 line-clamp-1 italic">
                                "{chunk.text}"
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {chunk.elapsedTimeMs !== undefined && (
                                <span className="text-[9px] text-stone-600 font-mono mr-2">
                                  {chunk.elapsedTimeMs}ms • {chunk.totalTokens}T
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  setCurrentAudio(chunk);
                                  setIsPlaying(true);
                                }}
                                className="px-2.5 py-1 bg-[#121212] hover:bg-[#c5a059] hover:text-black transition-all border border-white/5 text-[9px] uppercase font-bold tracking-wider cursor-pointer"
                              >
                                播放此折
                              </button>
                              <button
                                onClick={() => handleDownload(chunk)}
                                className="p-1 px-2 border border-white/10 hover:border-[#c5a059] text-gray-400 hover:text-white cursor-pointer"
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

      {/* Elegant Footer Area */}
      <footer id="app_footer" className="px-6 md:px-12 py-5 border-t border-white/5 bg-[#090909] text-[10px] text-gray-600 font-mono flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex flex-wrap gap-4 md:gap-8 justify-center sm:justify-start">
          <span className="uppercase tracking-widest text-[#c5a059]/80 font-semibold">• Model: Gemini 3.1 TTS High-Fidelity Preview</span>
          <span className="uppercase tracking-widest">• Studio Rendering: Enabled</span>
          <span className="uppercase tracking-widest">• Sample Rate: 24,000Hz PCM-WAV</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500/80 animate-pulse" />
          <span className="uppercase tracking-widest">Network Latency: {latency}ms</span>
        </div>
      </footer>
      
    </div>
  );
}
