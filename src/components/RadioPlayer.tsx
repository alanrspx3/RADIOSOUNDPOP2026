import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Heart, Music, Radio, Loader2, Sparkles, FileText, Palette, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

const STREAM_URL = 'https://streaming.fox.srv.br:8150/;';
const METADATA_URL = 'https://streaming.fox.srv.br:2020/json/stream/8150';

const PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest='
];

const fetchWithFallback = async (url: string) => {
  let lastError;
  
  // Try direct fetch first (no proxy)
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000) // Fast check for direct access
    });
    if (response.ok) return await response.json();
  } catch (e) {
    console.warn("Direct fetch failed, trying proxies...");
  }

  for (const proxy of PROXIES) {
    try {
      const response = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(10000) // Increased to 10 seconds
      });
      if (response.ok) return await response.json();
    } catch (e) {
      lastError = e;
      console.warn(`Proxy ${proxy} failed or timed out, trying next...`);
      continue;
    }
  }
  throw lastError || new Error('All fetch attempts failed');
};

const CACHE_KEYS = {
  METADATA: 'radio_metadata_cache',
  LYRICS: 'radio_lyrics_cache',
  THEME: 'radio_theme',
  LIKED: 'radio_liked',
  HISTORY: 'radio_history'
};

interface RadioMetadata {
  songtitle: string;
  artist?: string;
  title?: string;
  cover?: string;
  status: 'online' | 'offline';
}

interface HistoryItem {
  songtitle: string;
  artist: string;
  cover?: string;
  timestamp: number;
}

type Theme = 'neon' | 'neon_soft' | 'dark' | 'pastel' | 'ocean';

const themes: Record<Theme, {
  bg: string;
  card: string;
  accent: string;
  text: string;
  subtext: string;
  border: string;
  glow: string;
  name: string;
  iconColor: string;
}> = {
  neon: {
    bg: 'bg-[#020202]',
    card: 'bg-white/[0.05] backdrop-blur-3xl border-white/10',
    accent: 'from-orange-400 via-orange-500 to-rose-600',
    text: 'text-white',
    subtext: 'text-white/50',
    border: 'border-white/20',
    glow: 'shadow-[0_0_25px_rgba(249,115,22,0.4)]',
    name: 'Neon Vibrante',
    iconColor: 'text-orange-400'
  },
  neon_soft: {
    bg: 'bg-[#0f0f12]',
    card: 'bg-white/[0.03] backdrop-blur-2xl border-white/5',
    accent: 'from-orange-500/70 to-rose-600/70',
    text: 'text-zinc-200',
    subtext: 'text-zinc-500',
    border: 'border-white/10',
    glow: 'shadow-[0_0_15px_rgba(249,115,22,0.2)]',
    name: 'Neon Soft',
    iconColor: 'text-orange-500/80'
  },
  dark: {
    bg: 'bg-[#050505]',
    card: 'bg-zinc-900/40 backdrop-blur-xl border-zinc-800',
    accent: 'from-zinc-400 to-zinc-600',
    text: 'text-zinc-100',
    subtext: 'text-zinc-500',
    border: 'border-zinc-800',
    glow: 'shadow-none',
    name: 'Dark',
    iconColor: 'text-zinc-400'
  },
  pastel: {
    bg: 'bg-[#fdfcf0]',
    card: 'bg-white/80 backdrop-blur-md border-purple-100',
    accent: 'from-purple-400 to-pink-400',
    text: 'text-purple-900',
    subtext: 'text-purple-600/60',
    border: 'border-purple-200',
    glow: 'shadow-[0_10px_30px_rgba(216,180,254,0.3)]',
    name: 'Pastel',
    iconColor: 'text-purple-500'
  },
  ocean: {
    bg: 'bg-[#001219]',
    card: 'bg-white/[0.05] backdrop-blur-2xl border-cyan-900/30',
    accent: 'from-cyan-400 to-blue-500',
    text: 'text-cyan-50',
    subtext: 'text-cyan-400/50',
    border: 'border-cyan-900/30',
    glow: 'shadow-[0_0_25px_rgba(34,211,238,0.15)]',
    name: 'Oceano',
    iconColor: 'text-cyan-400'
  }
};

export default function RadioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [metadata, setMetadata] = useState<RadioMetadata>({
    songtitle: 'Carregando...',
    status: 'offline',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [translatedLyrics, setTranslatedLyrics] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'neon';
    const savedAuto = localStorage.getItem('radio_auto_theme') === 'true';
    if (savedAuto) {
      const hour = new Date().getHours();
      if (hour >= 6 && hour < 12) return 'pastel';
      if (hour >= 12 && hour < 18) return 'ocean';
      if (hour >= 18 && hour < 22) return 'neon';
      return 'dark';
    }
    const saved = localStorage.getItem(CACHE_KEYS.THEME);
    return (saved && themes[saved as Theme]) ? (saved as Theme) : 'neon';
  });
  const [isAutoTheme, setIsAutoTheme] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('radio_auto_theme') === 'true';
  });
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [toast, setToast] = useState<{ message: string; icon?: React.ReactNode } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const theme = themes[currentTheme];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = (message: string, icon?: React.ReactNode) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, icon });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2000);
  };

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio(STREAM_URL);
    audioRef.current.volume = volume / 100;
    
    const handleCanPlay = () => setIsLoading(false);
    const handleTimeUpdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        if (isFinite(audioRef.current.duration)) {
          setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
      }
    };
    const handleLoadedMetadata = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration);
      }
    };
    const handleError = () => {
      setMetadata(prev => ({ ...prev, status: 'offline' }));
      setIsLoading(false);
    };

    audioRef.current.addEventListener('canplay', handleCanPlay);
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
    audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioRef.current.addEventListener('error', handleError);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('canplay', handleCanPlay);
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.removeEventListener('error', handleError);
        audioRef.current = null;
      }
    };
  }, []);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      // For live streams, it's better to reset the source on pause to avoid lag when resuming
      audioRef.current.src = "";
    } else {
      setIsLoading(true);
      audioRef.current.src = STREAM_URL;
      audioRef.current.load();
      audioRef.current.play().catch(err => console.error("Playback error:", err));
    }
    setIsPlaying(!isPlaying);
  };

  // Handle Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  // Fetch Metadata
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const data = await fetchWithFallback(METADATA_URL);
        
        const songtitle = data.nowplaying || data.songtitle;
        
        if (songtitle) {
          const [artistName, ...songParts] = songtitle.split(' - ');
          const songTitle = songParts.join(' - ') || songtitle;
          const artist = artistName || 'SoundPop';

          let coverUrl = data.coverart || undefined;
          
          if (!coverUrl) {
            try {
              const query = encodeURIComponent(`${artist} ${songTitle}`);
              const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
              const itunesData = await itunesRes.json();
              
              if (itunesData.results && itunesData.results.length > 0) {
                const result = itunesData.results[0];
                const baseUrl = result.artworkUrl100;
                
                // Try to get the highest resolution possible from iTunes
                // We'll try 1000x1000, then 600x600, then fallback to original
                const trySizes = ['1000x1000', '600x600', '400x400'];
                let foundHighRes = false;
                
                for (const size of trySizes) {
                  const testUrl = baseUrl.replace('100x100', size);
                  try {
                    const check = await fetch(testUrl, { method: 'HEAD', mode: 'no-cors' });
                    // Note: no-cors won't let us see res.ok, but if it doesn't throw, it's likely fine
                    // or we just assume it works as iTunes is very consistent with these patterns
                    coverUrl = testUrl;
                    foundHighRes = true;
                    break;
                  } catch (e) {
                    continue;
                  }
                }
                
                if (!foundHighRes) {
                  coverUrl = baseUrl.replace('100x100', '600x600');
                }
              } else {
                try {
                  const deezerRes = await fetch(`https://api.deezer.com/search?q=artist:"${artist}" track:"${songTitle}"&limit=1`);
                  const deezerData = await deezerRes.json();
                  if (deezerData.data && deezerData.data.length > 0) {
                    const track = deezerData.data[0];
                    // Prioritize XL, then Big, then Medium
                    coverUrl = track.album.cover_xl || track.album.cover_big || track.album.cover_medium;
                  }
                } catch (de) {
                  console.log('Deezer fallback failed');
                }
              }
            } catch (e) {
              console.error('Error fetching cover:', e);
            }
          }

          const newMetadata: RadioMetadata = {
            songtitle: songTitle,
            artist: artist,
            status: 'online',
            cover: coverUrl
          };

          setMetadata(newMetadata);
          localStorage.setItem(CACHE_KEYS.METADATA, JSON.stringify(newMetadata));

          // Reset lyrics when song changes
          setLyrics(null);
          setTranslatedLyrics(null);
          setShowLyrics(false);
          setShowTranslation(false);

          if (data.trackhistory && Array.isArray(data.trackhistory)) {
            const apiHistory = data.trackhistory.map((item: string, index: number) => {
              const [hArtist, ...hSongParts] = item.split(' - ');
              const hSongTitle = hSongParts.join(' - ') || item;
              return {
                songtitle: hSongTitle,
                artist: hArtist || 'SoundPop',
                cover: data.covers && data.covers[index] ? data.covers[index] : undefined,
                timestamp: Date.now() - (index + 1) * 300000
              };
            });

            // Ensure current song is at the top
            const filteredApiHistory = apiHistory.filter(item => 
              !(item.songtitle === songTitle && item.artist === artist)
            );

            const currentItem: HistoryItem = {
              songtitle: songTitle,
              artist: artist,
              cover: coverUrl,
              timestamp: Date.now()
            };

            const finalHistory = [currentItem, ...filteredApiHistory].slice(0, 15);
            setHistory(finalHistory);
            localStorage.setItem(CACHE_KEYS.HISTORY, JSON.stringify(finalHistory));
          } else {
            setHistory(prev => {
              // Check if song is already at the top to avoid unnecessary updates
              if (prev[0] && prev[0].songtitle === songTitle && prev[0].artist === artist) {
                return prev;
              }

              // Remove the song if it exists elsewhere in the history
              const filteredHistory = prev.filter(item => 
                !(item.songtitle === songTitle && item.artist === artist)
              );

              const newItem: HistoryItem = {
                songtitle: songTitle,
                artist: artist,
                cover: coverUrl,
                timestamp: Date.now()
              };

              const updatedHistory = [newItem, ...filteredHistory].slice(0, 15);
              localStorage.setItem(CACHE_KEYS.HISTORY, JSON.stringify(updatedHistory));
              return updatedHistory;
            });
          }
        }
      } catch (error) {
        console.error('Metadata fetch error:', error);
        setMetadata(prev => ({
          ...prev,
          status: 'online',
          songtitle: 'Erro ao carregar metadados',
          artist: 'SoundPop'
        }));
      }
    };

    fetchMetadata();
    const interval = setInterval(fetchMetadata, 10000);
    return () => clearInterval(interval);
  }, []);

  // Progress Bar Animation (Fake for live streams, real for files)
  useEffect(() => {
    if (isPlaying && (!duration || !isFinite(duration))) {
      const interval = setInterval(() => {
        setProgress(prev => (prev + 0.5) % 100);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isPlaying, duration]);

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '00:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Like & History & Metadata Persistence
  useEffect(() => {
    const savedLike = localStorage.getItem(CACHE_KEYS.LIKED);
    if (savedLike === 'true') setIsLiked(true);

    const savedHistory = localStorage.getItem(CACHE_KEYS.HISTORY);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    const savedMetadata = localStorage.getItem(CACHE_KEYS.METADATA);
    if (savedMetadata) {
      try {
        setMetadata(JSON.parse(savedMetadata));
      } catch (e) {
        console.error("Failed to parse metadata cache", e);
      }
    }
  }, []);

  // Auto Theme Logic
  useEffect(() => {
    if (!isAutoTheme) return;

    const checkTheme = () => {
      const hour = new Date().getHours();
      let targetTheme: Theme = 'neon';
      
      if (hour >= 6 && hour < 12) targetTheme = 'pastel';
      else if (hour >= 12 && hour < 18) targetTheme = 'ocean';
      else if (hour >= 18 && hour < 22) targetTheme = 'neon';
      else targetTheme = 'dark';

      if (currentTheme !== targetTheme) {
        setCurrentTheme(targetTheme);
      }
    };

    checkTheme();
    const interval = setInterval(checkTheme, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [isAutoTheme, currentTheme]);

  const toggleLike = () => {
    const newState = !isLiked;
    setIsLiked(newState);
    localStorage.setItem(CACHE_KEYS.LIKED, String(newState));
  };

  const changeTheme = (newTheme: Theme) => {
    setCurrentTheme(newTheme);
    setIsAutoTheme(false); // Disable auto when manually selecting
    localStorage.setItem(CACHE_KEYS.THEME, newTheme);
    localStorage.setItem('radio_auto_theme', 'false');
    setShowThemeSelector(false);
  };

  const toggleAutoTheme = () => {
    const newState = !isAutoTheme;
    setIsAutoTheme(newState);
    localStorage.setItem('radio_auto_theme', String(newState));
    showToast(newState ? 'Modo Automático Ativado' : 'Modo Automático Desativado', <Sparkles size={14} />);
  };

  const getAiInsight = async () => {
    if (!metadata.songtitle || metadata.songtitle === 'Carregando...') return;
    
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Me conte uma curiosidade rápida, inédita e interessante (máximo 2 frases) sobre a música ou artista: "${metadata.artist} - ${metadata.songtitle}". Tente não repetir fatos óbvios. Seja descontraído e use emojis.`,
      });
      setAiInsight(response.text || "Não consegui encontrar curiosidades agora. 🎵");
    } catch (error) {
      console.error("Gemini error:", error);
      setAiInsight("Ops! Ocorreu um erro ao buscar curiosidades. 🎸");
    } finally {
      setIsAiLoading(false);
    }
  };

  const fetchLyrics = async () => {
    if (!metadata.songtitle || !metadata.artist || metadata.songtitle === 'Carregando...') return;
    
    setIsLyricsLoading(true);
    setTranslatedLyrics(null);
    setShowTranslation(false);
    const cacheKey = `${metadata.artist}-${metadata.songtitle}`.toLowerCase();
    
    const saveToCache = (key: string, lyricsData: string) => {
      try {
        const cachedLyrics = localStorage.getItem(CACHE_KEYS.LYRICS);
        const lyricsMap = cachedLyrics ? JSON.parse(cachedLyrics) : {};
        lyricsMap[key] = lyricsData;
        const keys = Object.keys(lyricsMap);
        if (keys.length > 20) delete lyricsMap[keys[0]];
        localStorage.setItem(CACHE_KEYS.LYRICS, JSON.stringify(lyricsMap));
      } catch (e) {
        console.error("Cache write error", e);
      }
    };

    const fetchWithGemini = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Encontre a letra completa da música "${metadata.songtitle}" do artista "${metadata.artist}". Retorne APENAS a letra, sem introduções ou conclusões. Se não encontrar, retorne exatamente "NOT_FOUND".`,
        });
        const text = response.text?.trim();
        if (text && text !== "NOT_FOUND" && text.length > 20) {
          setLyrics(text);
          saveToCache(cacheKey, text);
          return true;
        }
      } catch (e) {
        console.error("Gemini lyrics fallback error:", e);
      }
      return false;
    };

    // Check cache first
    try {
      const cachedLyrics = localStorage.getItem(CACHE_KEYS.LYRICS);
      if (cachedLyrics) {
        const lyricsMap = JSON.parse(cachedLyrics);
        if (lyricsMap[cacheKey]) {
          setLyrics(lyricsMap[cacheKey]);
          setIsLyricsLoading(false);
          return;
        }
      }
    } catch (e) {
      console.error("Cache read error", e);
    }

    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(metadata.artist)}/${encodeURIComponent(metadata.songtitle)}`;
      const data = await fetchWithFallback(url);
      
      if (data.lyrics) {
        setLyrics(data.lyrics);
        saveToCache(cacheKey, data.lyrics);
      } else {
        const success = await fetchWithGemini();
        if (!success) setLyrics("Letra não encontrada para esta música. 😕");
      }
    } catch (error) {
      console.error("Lyrics fetch error:", error);
      const success = await fetchWithGemini();
      if (!success) setLyrics("Erro ao carregar a letra. Tente novamente mais tarde. 🛠️");
    } finally {
      setIsLyricsLoading(false);
    }
  };

  const translateLyrics = async () => {
    if (!lyrics || lyrics.startsWith('Letra não encontrada') || lyrics.startsWith('Erro ao carregar')) return;
    if (translatedLyrics) {
      setShowTranslation(!showTranslation);
      return;
    }
    
    setIsTranslating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Traduza a seguinte letra de música para o português brasileiro. Mantenha a formatação original (quebras de linha). Se a letra já estiver em português, apenas retorne a letra original. Letra:\n\n${lyrics}`,
      });
      setTranslatedLyrics(response.text || "Não consegui traduzir agora. 🎵");
      setShowTranslation(true);
    } catch (error) {
      console.error("Translation error:", error);
      showToast("Erro ao traduzir letra", <X size={14} />);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${theme.bg} transition-colors duration-700 overflow-hidden relative`}>
      {/* Atmospheric Background Removed */}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Theme Selector Popover */}
        <AnimatePresence>
          {showThemeSelector && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className={`absolute top-0 left-0 right-0 z-50 p-4 rounded-3xl ${theme.card} border ${theme.border} shadow-2xl mb-4`}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className={`text-xs font-bold uppercase tracking-widest ${theme.text}`}>Escolha o Tema</h3>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={toggleAutoTheme}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold transition-all ${isAutoTheme ? `bg-gradient-to-r ${theme.accent} text-white` : `bg-white/5 ${theme.subtext}`}`}
                    title="Troca automática baseada no horário"
                  >
                    <Sparkles size={10} />
                    AUTO
                  </button>
                  <button onClick={() => setShowThemeSelector(false)} className={`${theme.subtext} hover:${theme.text}`}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(themes) as Theme[]).map((tKey) => (
                  <button
                    key={tKey}
                    onClick={() => changeTheme(tKey)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      currentTheme === tKey 
                        ? `bg-white/10 ${theme.border} ${currentTheme.startsWith('neon') ? 'shadow-[0_0_15px_rgba(249,115,22,0.3)]' : ''}` 
                        : `bg-transparent border-transparent hover:bg-white/5`
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${themes[tKey].accent}`} />
                    <span className={`text-xs font-medium ${theme.text}`}>{themes[tKey].name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player Card */}
        <motion.div 
          className={`${theme.card} border ${theme.border} rounded-[2.5rem] p-8 shadow-2xl transition-all duration-500`}
        >
          
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  const nextShowLyrics = !showLyrics;
                  setShowLyrics(nextShowLyrics);
                  if (showHistory) setShowHistory(false);
                  if (showThemeSelector) setShowThemeSelector(false);
                  if (nextShowLyrics && !lyrics) fetchLyrics();
                }}
                className={`p-2 rounded-full transition-colors ${showLyrics ? 'bg-white/10 ' + theme.text : theme.subtext + ' hover:' + theme.text}`}
                title="Letras"
              >
                <FileText size={18} />
              </button>
              <button 
                onClick={() => {
                  setShowThemeSelector(!showThemeSelector);
                  if (showHistory) setShowHistory(false);
                  if (showLyrics) setShowLyrics(false);
                }}
                className={`p-2 rounded-full transition-colors ${showThemeSelector ? 'bg-white/10 ' + theme.text : theme.subtext + ' hover:' + theme.text}`}
                title="Temas"
              >
                <Palette size={18} />
              </button>
            </div>
            <h1 className={`text-[12px] uppercase tracking-[0.4em] font-black ${theme.subtext}`}>
              RADIO ONLINE
            </h1>
            <div className="w-10" /> {/* Spacer for balance */}
          </div>

          {/* Album Art / Visualizer */}
          <div className="relative aspect-square mb-8 group">
            {/* Neon Pulse Ring Removed */}
            <div className={`absolute inset-0 bg-gradient-to-br ${theme.accent} opacity-20 rounded-3xl overflow-hidden shadow-2xl border ${theme.border}`}>
              <AnimatePresence mode="wait">
                <motion.div 
                  key={metadata.songtitle}
                  initial={{ scale: 1.1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="w-full h-full flex items-center justify-center bg-black/20"
                >
                  {metadata.cover ? (
                    <img 
                      src={metadata.cover} 
                      alt={metadata.songtitle}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        setMetadata(prev => ({ ...prev, cover: undefined }));
                      }}
                    />
                  ) : (
                    <div className="relative">
                      <Music size={80} className={`${theme.text} opacity-10`} />
                      {isPlaying && (
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.2, 1],
                            opacity: [0.3, 0.6, 0.3]
                          }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Radio size={40} className={`${theme.iconColor} opacity-50`} />
                        </motion.div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            
            {/* Play Overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20 rounded-3xl">
              <button 
                onClick={togglePlay}
                className={`w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border ${theme.border} flex items-center justify-center ${theme.text} hover:scale-110 transition-transform`}
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.div
                      key="loader"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                    >
                      <Loader2 className="animate-spin" size={32} />
                    </motion.div>
                  ) : isPlaying ? (
                    <motion.div
                      key="pause"
                      initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                    >
                      <Pause size={32} fill="currentColor" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="play"
                      initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    >
                      <Play size={32} fill="currentColor" className="ml-1" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="text-center mb-8 relative group/info">
            <motion.h2 
              key={metadata.songtitle}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`text-2xl font-black tracking-tight ${theme.text} mb-2 truncate px-4`}
            >
              {metadata.songtitle}
            </motion.h2>
            <motion.p 
              key={metadata.artist}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 0.5 }}
              className={`text-[11px] uppercase tracking-[0.3em] font-bold ${theme.subtext} flex items-center justify-center gap-2`}
            >
              {metadata.artist || 'SoundPop'}
              <button 
                onClick={getAiInsight}
                disabled={isAiLoading}
                className={`p-1 rounded-full hover:bg-white/10 transition-colors ${theme.subtext} hover:${theme.text} disabled:opacity-50`}
                title="Curiosidade AI"
              >
                {isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
            </motion.p>

            {/* AI Insight Tooltip/Overlay */}
            <AnimatePresence>
              {aiInsight && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className={`absolute top-full left-0 right-0 mt-4 p-4 ${theme.card} border ${theme.border} rounded-2xl text-xs ${theme.text} opacity-90 leading-relaxed shadow-xl z-20 ${currentTheme.startsWith('neon') ? theme.glow : ''}`}
                >
                  <button 
                    onClick={() => setAiInsight(null)}
                    className={`absolute top-2 right-2 ${theme.subtext} hover:${theme.text} p-1`}
                  >
                    <X size={14} />
                  </button>
                  <div className="pr-4 italic">
                    {aiInsight}
                  </div>
                  <div className={`mt-3 pt-3 border-t ${theme.border} flex justify-end`}>
                    <button 
                      onClick={getAiInsight}
                      disabled={isAiLoading}
                      className={`flex items-center gap-1.5 text-[10px] font-bold ${theme.iconColor} hover:opacity-80 transition-colors disabled:opacity-50`}
                    >
                      {isAiLoading ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Sparkles size={10} />
                      )}
                      OUTRA CURIOSIDADE
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Progress Bar */}
          <div className="mb-8 px-2">
            <div className={`h-1.5 w-full ${currentTheme.startsWith('neon') ? 'bg-white/10' : 'bg-white/5'} rounded-full overflow-hidden`}>
              <motion.div 
                className={`h-full bg-gradient-to-r ${theme.accent} ${theme.glow}`}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
            <div className="flex justify-between items-center mt-3">
              <div className={`text-[10px] font-mono ${theme.subtext} tracking-wider`}>
                {formatTime(currentTime)}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-end gap-[2px] h-2.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={isPlaying ? {
                        height: ["30%", "100%", "30%"],
                        opacity: [0.5, 1, 0.5]
                      } : { height: "30%", opacity: 0.3 }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: "easeInOut",
                      }}
                      className={`w-[2px] rounded-full bg-gradient-to-t ${theme.accent}`}
                    />
                  ))}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-[0.15em] transition-colors duration-500 ${isPlaying ? theme.iconColor : theme.subtext}`}>
                  {isPlaying ? 'Tocando agora' : 'Pronto para tocar'}
                </span>
              </div>
              <div className={`text-[10px] font-mono ${theme.subtext} tracking-wider`}>
                {isFinite(duration) ? formatTime(duration) : '00:00'}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6 mb-8">
            <button 
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                showToast(nextMuted ? 'Mudo' : 'Som Ativado', nextMuted ? <VolumeX size={14} /> : <Volume2 size={14} />);
              }}
              className={`${theme.subtext} hover:${theme.text} transition-colors`}
            >
              {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            
            <div className="flex-1 relative h-1 group cursor-pointer">
              <input 
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  if (val > 0 && isMuted) setIsMuted(false);
                  showToast(`Volume: ${val}%`, val === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className={`absolute inset-0 ${currentTheme.startsWith('neon') ? 'bg-white/10' : 'bg-white/5'} rounded-full`} />
              <div 
                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${theme.accent} rounded-full transition-all`}
                style={{ width: `${volume}%` }}
              />
              <div 
                className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 ${theme.text} rounded-full ${theme.glow} opacity-0 group-hover:opacity-100 transition-opacity`}
                style={{ left: `calc(${volume}% - 6px)` }}
              />
            </div>

            <button 
              onClick={togglePlay}
              className={`w-12 h-12 rounded-full bg-gradient-to-br ${theme.accent} ${theme.text} flex items-center justify-center hover:scale-105 transition-transform active:scale-95 ${theme.glow}`}
            >
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div
                    key="loader-small"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                  >
                    <Loader2 className="animate-spin" size={20} />
                  </motion.div>
                ) : isPlaying ? (
                  <motion.div
                    key="pause-small"
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                  >
                    <Pause size={20} fill="currentColor" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="play-small"
                    initial={{ opacity: 0, scale: 0.5, rotate: 45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
                  >
                    <Play size={20} fill="currentColor" className="ml-0.5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>

          {/* History Button (formerly Lyrics) */}
          <div className="flex justify-center mb-8">
            <button 
              onClick={() => {
                setShowHistory(!showHistory);
                if (showLyrics) setShowLyrics(false);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${showHistory ? `bg-gradient-to-r ${theme.accent} text-white ${theme.glow}` : `bg-white/5 ${theme.subtext} hover:bg-white/10 hover:${theme.text}`}`}
            >
              <Music size={16} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Tocadas Recentemente</span>
            </button>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${metadata.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
              <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${theme.subtext}`}>
                {metadata.status === 'online' ? 'Transmissão Estável' : 'Servidor Offline'}
              </span>
            </div>
          </div>

          {/* Recently Played History */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={`overflow-hidden mt-8 pt-8 border-t ${theme.border}`}
              >
                <div className={`${theme.card} bg-opacity-20 rounded-2xl p-4 border ${theme.border} backdrop-blur-md`}>
                  <h3 className={`text-[10px] uppercase tracking-[0.2em] font-bold ${theme.subtext} mb-4`}>Tocadas Recentemente</h3>
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                    {history.length > 0 ? (
                      history.map((item, index) => (
                        <div key={item.timestamp + index} className="flex items-center gap-3 group">
                          <div className={`w-10 h-10 rounded-lg bg-white/5 overflow-hidden flex-shrink-0 border ${theme.border}`}>
                            {item.cover ? (
                              <img src={item.cover} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Music size={16} className={`${theme.text} opacity-10`} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium ${theme.text} truncate group-hover:${theme.iconColor} transition-colors`}>{item.songtitle}</p>
                            <p className={`text-[10px] ${theme.subtext} truncate uppercase tracking-wider`}>{item.artist}</p>
                          </div>
                          <span className={`text-[9px] ${theme.subtext} font-mono opacity-50`}>
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className={`text-[10px] ${theme.subtext} italic`}>Nenhuma música no histórico ainda.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lyrics Section */}
          <AnimatePresence>
            {showLyrics && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={`overflow-hidden mt-8 pt-8 border-t ${theme.border}`}
              >
                <div className={`${theme.card} bg-opacity-20 rounded-2xl p-5 border ${theme.border} backdrop-blur-md relative`}>
                  <button 
                    onClick={() => setShowLyrics(false)}
                    className={`absolute top-4 right-4 ${theme.subtext} hover:${theme.text} transition-colors`}
                  >
                    <X size={16} />
                  </button>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className={`text-[10px] uppercase tracking-[0.2em] font-bold ${theme.subtext}`}>Letra da Música</h3>
                      {lyrics && !lyrics.startsWith('Letra não encontrada') && !lyrics.startsWith('Erro ao carregar') && (
                        <button 
                          onClick={translateLyrics}
                          disabled={isTranslating}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold transition-all ${showTranslation ? `bg-gradient-to-r ${theme.accent} text-white` : `bg-white/5 ${theme.subtext} hover:bg-white/10`}`}
                        >
                          {isTranslating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                          TRADUÇÃO
                        </button>
                      )}
                    </div>
                    {isLyricsLoading && <Loader2 size={12} className={`animate-spin ${theme.iconColor}`} />}
                  </div>
                  <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {isLyricsLoading ? (
                      <div className="flex flex-col gap-2">
                        <div className="h-3 w-3/4 bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-2/3 bg-white/5 rounded animate-pulse" />
                      </div>
                    ) : (showTranslation && translatedLyrics) ? (
                      <pre className={`text-xs ${theme.text} opacity-70 whitespace-pre-wrap font-sans leading-relaxed animate-in fade-in duration-500`}>
                        {translatedLyrics}
                      </pre>
                    ) : lyrics ? (
                      <pre className={`text-xs ${theme.text} opacity-70 whitespace-pre-wrap font-sans leading-relaxed animate-in fade-in duration-500`}>
                        {lyrics}
                      </pre>
                    ) : (
                      <p className={`text-[10px] ${theme.subtext} italic`}>Clique no ícone de letra para carregar.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer Info & Sponsored Links */}
        <div className="mt-8 space-y-6">
          <div className="space-y-4">
            <p className={`text-center text-[12px] uppercase tracking-[0.4em] font-black ${theme.text}`}>
              PARCEIROS
            </p>
            
            <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-2 px-4">
              <a href="https://pontodobicho.com/jogo-do-bicho" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>Jogo do bicho online</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://spotbichos.com" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>jogo do bicho online</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://kangaroohost.com.br/hospedagem-de-site" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>Hospedagem de sites</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://foxsolucoes.com/streaming-de-audio" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>Streaming de audio</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://coimbraendlich.com.br/advogado-online" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>Advogado Online</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="http://casestarlink.com.br" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>CASER STARLINK</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://playbicho.com" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>Jogo Do Bicho</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://pontodobingo.com/" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>BINGO ONLINE</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://danferapida.com.br" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>danfe online</a>
              <span className={`${theme.subtext} text-[8px]`}>•</span>
              <a href="https://hotelcity.com.br" target="_blank" rel="noopener noreferrer" className={`text-[10px] ${theme.text} hover:opacity-70 transition-colors uppercase tracking-widest`}>HOTEL CITY</a>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className={`fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full ${theme.card} border ${theme.border} ${theme.glow} flex items-center gap-3 backdrop-blur-2xl`}
          >
            <div className={theme.iconColor}>
              {toast.icon}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${theme.text}`}>
              {toast.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
