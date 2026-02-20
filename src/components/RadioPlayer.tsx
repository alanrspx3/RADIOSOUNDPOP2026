import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Heart, Music, Radio, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const STREAM_URL = 'https://streaming.fox.srv.br:8150/;';
const METADATA_URL = '/api/radio-stats';

interface RadioMetadata {
  songtitle: string;
  artist?: string;
  title?: string;
  cover?: string;
  status: 'online' | 'offline';
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
          const [artist, ...songParts] = data.songtitle.split(' - ');
          setMetadata({
            songtitle: songParts.join(' - ') || data.songtitle,
            artist: artist || 'Rádio Fox',
            status: 'online',
            // Cover art usually requires a separate API like iTunes or Spotify search
            // based on the artist and song title.
          });
        }
      } catch (error) {
        console.error('Metadata fetch error:', error);
        // Fallback for demo purposes if CORS blocks direct access
        // In production, you'd use a server-side proxy.
        setMetadata(prev => ({
          ...prev,
          status: 'online', // Assume online if we can't fetch but stream might work
          songtitle: 'Sintonizando...',
          artist: 'Rádio Fox'
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

  // Like Persistence
  useEffect(() => {
    const savedLike = localStorage.getItem('radio_liked');
    if (savedLike === 'true') setIsLiked(true);
  }, []);

  const toggleLike = () => {
    const newState = !isLiked;
    setIsLiked(newState);
    localStorage.setItem('radio_liked', String(newState));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0502] overflow-hidden relative">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Player Card */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl shadow-black/50">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${metadata.status === 'online' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">
                {metadata.status === 'online' ? 'Ao Vivo' : 'Offline'}
              </span>
            </div>
            <button 
              onClick={toggleLike}
              className={`transition-colors duration-300 ${isLiked ? 'text-rose-500' : 'text-white/20 hover:text-white/40'}`}
            >
              <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
            </button>
          </div>

          {/* Album Art / Visualizer */}
          <div className="relative aspect-square mb-8 group">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-purple-600/20 rounded-3xl overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={metadata.songtitle}
                  initial={{ scale: 1.1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="w-full h-full flex items-center justify-center bg-black/40"
                >
                  {/* Fallback Icon when no cover is available */}
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
                </motion.div>
              </AnimatePresence>
            </div>
            
            {/* Play Overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20 rounded-3xl">
              <button 
                onClick={togglePlay}
                className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:scale-110 transition-transform"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={32} />
                ) : isPlaying ? (
                  <Pause size={32} fill="currentColor" />
                ) : (
                  <Play size={32} fill="currentColor" className="ml-1" />
                )}
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="text-center mb-8">
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
              className="text-sm text-white/50 font-medium tracking-wide uppercase"
            >
              {metadata.artist || 'Rádio Fox'}
            </motion.p>
          </div>

          {/* Progress Bar (Fake) */}
          <div className="mb-8 px-2">
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-orange-500 to-rose-500"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Live Stream</span>
              <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">On Air</span>
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
                {isLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : isPlaying ? (
                  <Pause size={20} fill="currentColor" />
                ) : (
                  <Play size={20} fill="currentColor" className="ml-0.5" />
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Footer Info */}
        <p className="text-center mt-8 text-white/20 text-[10px] uppercase tracking-[0.3em] font-medium">
          Powered by Fox Streaming
        </p>
      </motion.div>
    </div>
  );
}
