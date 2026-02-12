
'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SummaryAudioPlayerProps {
  audioPath: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
}

export function SummaryAudioPlayer({ audioPath, startSeconds, endSeconds }: SummaryAudioPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldPlayRef = useRef(false);

  const fetchUrl = async () => {
    if (url) return;
    try {
      const { data, error } = await supabase.storage
        .from('audios')
        .createSignedUrl(audioPath, 3600); // 1 hour

      if (error) throw error;
      setUrl(data.signedUrl);
    } catch (err) {
      console.error('Error fetching audio URL:', err);
      // Ensure loading is turned off if fetch fails
      setLoading(false);
      throw err;
    }
  };

  const playAudio = async () => {
    if (!audioRef.current) return;

    setLoading(true);
    try {
      // Ensure metadata is loaded before setting time to avoid issues
      if (audioRef.current.readyState === 0) {
        // Wait for metadata
        await new Promise((resolve) => {
          if (!audioRef.current) return resolve(null);
          audioRef.current.onloadedmetadata = resolve;
        });
      }

      if (startSeconds && !isPlaying) {
         audioRef.current.currentTime = startSeconds;
      }
      
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (e) {
      // Ignore AbortError if it's due to fast switching/reloading
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error("Play failed", e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async () => {
    try {
      if (!url) {
        setLoading(true);
        shouldPlayRef.current = true;
        await fetchUrl();
      } else {
        playAudio();
      }
    } catch (error) {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (url && shouldPlayRef.current) {
      shouldPlayRef.current = false;
      playAudio();
    }
  }, [url]);

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && endSeconds && audioRef.current.currentTime >= endSeconds) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-200">
        <button
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={loading}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 pl-0.5" />}
        </button>
        
        <div className="text-xs text-gray-500 font-mono">
           {startSeconds ? 
             `${formatTime(startSeconds)} - ${formatTime(endSeconds || 0)}` : 
             "Audio Completo"
           }
        </div>

        <audio 
            ref={audioRef} 
            src={url || undefined} 
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
        />
    </div>
  );
}

function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
