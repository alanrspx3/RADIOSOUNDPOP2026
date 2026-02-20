import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Heart, Music, Radio, Loader2, Sparkles, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

const STREAM_URL = 'https://streaming.fox.srv.br:8150/;';
const METADATA_URL = '/api/radio-stats';

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
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio(STREAM_URL);
    audioRef.current.volume = volume / 100;
    
    const handleCanPlay = () => setIsLoading(false);
    const handleError = () => {
      setMetadata(prev => ({ ...prev, status: 'offline' }));
      setIsLoading(false);
    };

    audioRef.current.addEventListener('canplay', handleCanPlay);
    audioRef.current.addEventListener('error', handleError);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('canplay', handleCanPlay);
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
        // Note: Direct fetch might fail due to CORS if the server doesn't allow it.
        // In a real scenario, a proxy or a specific provider API would be used.
        const response = await fetch(METADATA_URL);
        const data = await response.json();
        
        // Shoutcast JSON structure varies, but usually it's something like:
        // { "songtitle": "Artist - Song", ... }
        if (data && data.songtitle) {
          const [artistName, ...songParts] = data.songtitle.split(' - ');
          const songTitle = songParts.join(' - ') || data.songtitle;
          const artist = artistName || 'SoundPop';

          // Fetch cover art from iTunes API with Deezer fallback
          let coverUrl = undefined;
          try {
            const query = encodeURIComponent(`${artist} ${songTitle}`);
            const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
            const itunesData = await itunesRes.json();
            
            if (itunesData.results && itunesData.results.length > 0) {
              coverUrl = itunesData.results[0].artworkUrl100.replace('100x100', '600x600');
            } else {
              // Fallback to Deezer (using a public proxy or direct if allowed)
              try {
                const deezerRes = await fetch(`https://api.deezer.com/search?q=artist:"${artist}" track:"${songTitle}"&limit=1`);
                const deezerData = await deezerRes.json();
                if (deezerData.data && deezerData.data.length > 0) {
                  coverUrl = deezerData.data[0].album.cover_xl;
                }
              } catch (de) {
                console.log('Deezer fallback failed or CORS blocked');
              }
            }
          } catch (e) {
            console.error('Error fetching cover:', e);
          }

          setMetadata({
            songtitle: songTitle,
            artist: artist,
            status: 'online',
            cover: coverUrl
          });

          // Reset lyrics when song changes
          setLyrics(null);
          setShowLyrics(false);

          // Update History
          setHistory(prev => {
            const lastItem = prev[0];
            if (lastItem && lastItem.songtitle === songTitle && lastItem.artist === artist) {
              return prev;
            }
            const newItem: HistoryItem = {
              songtitle: songTitle,
              artist: artist,
              cover: coverUrl,
              timestamp: Date.now()
            };
            const updatedHistory = [newItem, ...prev].slice(0, 10);
            localStorage.setItem('radio_history', JSON.stringify(updatedHistory));
            return updatedHistory;
          });
        }
      } catch (error) {
        console.error('Metadata fetch error:', error);
        // Fallback for demo purposes if CORS blocks direct access
        // In production, you'd use a server-side proxy.
        setMetadata(prev => ({
          ...prev,
          status: 'online', // Assume online if we can't fetch but stream might work
          songtitle: 'Erro ao carregar metadados',
          artist: 'SoundPop'
        }));
      }
    };

    fetchMetadata();
    const interval = setInterval(fetchMetadata, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fake Progress Bar Animation
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setProgress(prev => (prev + 0.5) % 100);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isPlaying]);

  // Like & History Persistence
  useEffect(() => {
    const savedLike = localStorage.getItem('radio_liked');
    if (savedLike === 'true') setIsLiked(true);

    const savedHistory = localStorage.getItem('radio_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const toggleLike = () => {
    const newState = !isLiked;
    setIsLiked(newState);
    localStorage.setItem('radio_liked', String(newState));
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
    try {
      const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(metadata.artist)}/${encodeURIComponent(metadata.songtitle)}`);
      const data = await response.json();
      if (data.lyrics) {
        setLyrics(data.lyrics);
      } else {
        setLyrics("Letra não encontrada para esta música. 😕");
      }
    } catch (error) {
      console.error("Lyrics fetch error:", error);
      setLyrics("Erro ao carregar a letra. Tente novamente mais tarde. 🛠️");
    } finally {
      setIsLyricsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0502] overflow-hidden relative">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={isPlaying ? {
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2]
          } : {}}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-600/20 blur-[120px]" 
        />
        <motion.div 
          animate={isPlaying ? {
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.3, 0.2]
          } : {}}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[100px]" 
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Player Card */}
        <motion.div 
          animate={isPlaying ? {
            boxShadow: [
              "0 0 20px rgba(249, 115, 22, 0.1)",
              "0 0 40px rgba(249, 115, 22, 0.2)",
              "0 0 20px rgba(249, 115, 22, 0.1)"
            ]
          } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl shadow-black/50"
        >
          
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setShowHistory(!showHistory);
                  if (showLyrics) setShowLyrics(false);
                }}
                className={`p-2 rounded-full transition-colors ${showHistory ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
                title="Histórico"
              >
                <Music size={18} />
              </button>
              <button 
                onClick={() => {
                  const nextShowLyrics = !showLyrics;
                  setShowLyrics(nextShowLyrics);
                  if (showHistory) setShowHistory(false);
                  if (nextShowLyrics && !lyrics) fetchLyrics();
                }}
                className={`p-2 rounded-full transition-colors ${showLyrics ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
                title="Letra"
              >
                <FileText size={18} />
              </button>
            </div>
            <h1 className="text-[12px] uppercase tracking-[0.4em] font-black text-white/60">
              RADIO ONLINE
            </h1>
            <div className="w-18" /> {/* Spacer for balance */}
          </div>

          {/* Album Art / Visualizer */}
          <div className="relative aspect-square mb-8 group">
            {/* Neon Pulse Ring */}
            {isPlaying && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: [0.2, 0.5, 0.2],
                  scale: [1, 1.05, 1],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -inset-4 rounded-[2.5rem] border-2 border-orange-500/30 blur-md pointer-events-none"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-purple-600/20 rounded-3xl overflow-hidden shadow-2xl border border-white/5">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={metadata.songtitle}
                  initial={{ scale: 1.1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="w-full h-full flex items-center justify-center bg-black/40"
                >
                  {metadata.cover ? (
                    <img 
                      src={metadata.cover} 
                      alt={metadata.songtitle}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    /* Fallback Icon when no cover is available */
                    <div className="relative">
                      <Music size={80} className="text-white/10" />
                      {isPlaying && (
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.2, 1],
                            opacity: [0.3, 0.6, 0.3]
                          }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Radio size={40} className="text-orange-500/50" />
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
                className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:scale-110 transition-transform"
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
              className="text-2xl font-semibold text-white mb-2 truncate px-4"
            >
              {metadata.songtitle}
            </motion.h2>
            <motion.p 
              key={metadata.artist}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 0.5 }}
              className="text-sm text-white/50 font-medium tracking-wide uppercase flex items-center justify-center gap-2"
            >
              {metadata.artist || 'SoundPop'}
              <button 
                onClick={getAiInsight}
                disabled={isAiLoading}
                className="p-1 rounded-full hover:bg-white/10 transition-colors text-orange-500/50 hover:text-orange-500 disabled:opacity-50"
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
                  className="absolute top-full left-0 right-0 mt-4 p-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-xs text-white/80 leading-relaxed shadow-xl z-20"
                >
                  <button 
                    onClick={() => setAiInsight(null)}
                    className="absolute top-2 right-2 text-white/40 hover:text-white p-1"
                  >
                    ×
                  </button>
                  <div className="pr-4">
                    {aiInsight}
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                    <button 
                      onClick={getAiInsight}
                      disabled={isAiLoading}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-orange-500 hover:text-orange-400 transition-colors disabled:opacity-50"
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

          {/* Progress Bar (Fake) */}
          <div className="mb-8 px-2">
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-orange-500 to-rose-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
            <div className="flex justify-between items-center mt-3">
              <div className="flex items-center gap-2">
                <div className="flex items-end gap-[2px] h-2.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={isPlaying ? {
                        height: ["30%", "100%", "30%"],
                        backgroundColor: ["#f97316", "#fb923c", "#f97316"]
                      } : { height: "30%", backgroundColor: "#f97316" }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: "easeInOut",
                      }}
                      className="w-[2px] rounded-full shadow-[0_0_5px_rgba(249,115,22,0.5)]"
                    />
                  ))}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-[0.15em] transition-colors duration-500 ${isPlaying ? 'text-orange-500 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]' : 'text-white/20'}`}>
                  {isPlaying ? 'Tocando agora' : 'Pronto para tocar'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-white/10 uppercase tracking-widest">Live Stream</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="text-white/40 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            
            <div className="flex-1 relative h-1 group cursor-pointer">
              <input 
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="absolute inset-0 bg-white/5 rounded-full" />
              <div 
                className="absolute inset-y-0 left-0 bg-white/20 rounded-full transition-all"
                style={{ width: `${volume}%` }}
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${volume}% - 6px)` }}
              />
            </div>

            <div className="flex items-center gap-4">
               <button 
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform active:scale-95"
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
          </div>

          {/* Recently Played History */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-8 pt-8 border-t border-white/5"
              >
                <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5 backdrop-blur-md">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 mb-4">Tocadas Recentemente</h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {history.length > 0 ? (
                      history.map((item, index) => (
                        <div key={item.timestamp + index} className="flex items-center gap-3 group">
                          <div className="w-10 h-10 rounded-lg bg-white/5 overflow-hidden flex-shrink-0 border border-white/5">
                            {item.cover ? (
                              <img src={item.cover} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Music size={16} className="text-white/10" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-white/80 truncate group-hover:text-orange-500 transition-colors">{item.songtitle}</p>
                            <p className="text-[10px] text-white/40 truncate uppercase tracking-wider">{item.artist}</p>
                          </div>
                          <span className="text-[9px] text-white/20 font-mono">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-white/20 italic">Nenhuma música no histórico ainda.</p>
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
                className="overflow-hidden mt-8 pt-8 border-t border-white/5"
              >
                <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5 backdrop-blur-md">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30">Letra da Música</h3>
                    {isLyricsLoading && <Loader2 size={12} className="animate-spin text-white/20" />}
                  </div>
                  <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {isLyricsLoading ? (
                      <div className="flex flex-col gap-2">
                        <div className="h-3 w-3/4 bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-2/3 bg-white/5 rounded animate-pulse" />
                      </div>
                    ) : lyrics ? (
                      <pre className="text-xs text-white/60 whitespace-pre-wrap font-sans leading-relaxed">
                        {lyrics}
                      </pre>
                    ) : (
                      <p className="text-[10px] text-white/20 italic">Clique no ícone de letra para carregar.</p>
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
            <h1 className="text-center text-[12px] uppercase tracking-[0.4em] font-black text-white">
              PARCEIROS
            </h1>
            
            <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-2 px-4">
              <a href="https://foxsolucoes.com/streaming-de-audio" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white hover:text-white/70 transition-colors uppercase tracking-widest">Streaming de audio</a>
              <span className="text-white/20 text-[8px]">•</span>
              <a href="https://kangaroohost.com.br/hospedagem-de-site" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white hover:text-white/70 transition-colors uppercase tracking-widest">Hospedagem de sites</a>
              <span className="text-white/20 text-[8px]">•</span>
              <a href="https://pontodobicho.com/jogo-do-bicho" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white hover:text-white/70 transition-colors uppercase tracking-widest">Jogo do bicho online</a>
              <span className="text-white/20 text-[8px]">•</span>
              <a href="https://coimbraendlich.com.br/advogado-online" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white hover:text-white/70 transition-colors uppercase tracking-widest">Advogado Online</a>
              <span className="text-white/20 text-[8px]">•</span>
              <a href="https://danferapida.com.br" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white hover:text-white/70 transition-colors uppercase tracking-widest">danfe online</a>
              <span className="text-white/20 text-[8px]">•</span>
              <a href="https://playbicho.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white hover:text-white/70 transition-colors uppercase tracking-widest">Jogo Do Bicho</a>
              <span className="text-white/20 text-[8px]">•</span>
              <a href="https://spotbichos.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white hover:text-white/70 transition-colors uppercase tracking-widest">jogo do bicho online</a>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
