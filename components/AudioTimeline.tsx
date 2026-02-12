'use client';
import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Marker {
  id: string;
  label: string;
  start: number; // seconds
  end: number; // seconds
  color?: string;
}

interface AudioTimelineProps {
  audioUrl: string;
  markers: Marker[];
  className?: string;
}

export function AudioTimeline({ audioUrl, markers, className }: AudioTimelineProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  return (
    <div className={cn("bg-gray-50 rounded-lg p-4 border border-gray-200 mt-4", className)}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={togglePlay}
          className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <div className="text-sm text-gray-600 font-medium">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Timeline Bar */}
      <div className="relative h-12 bg-gray-200 rounded-md cursor-pointer group"
           onClick={(e) => {
             if (!duration) return;
             const rect = e.currentTarget.getBoundingClientRect();
             const x = e.clientX - rect.left;
             const percentage = x / rect.width;
             seekTo(percentage * duration);
           }}>
        
        {/* Progress Fill */}
        <div 
          className="absolute top-0 left-0 h-full bg-blue-100 rounded-l-md pointer-events-none"
          style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
        />

        {/* Markers */}
        {duration > 0 && markers.map((marker) => {
           // Calculate positions
           const startPercent = (marker.start / duration) * 100;
           const widthPercent = ((marker.end - marker.start) / duration) * 100;
           
           return (
             <div
               key={marker.id}
               className="absolute top-1 bottom-1 bg-green-500 opacity-60 hover:opacity-100 hover:bg-green-600 transition-all rounded-sm cursor-pointer z-10"
               style={{
                 left: `${startPercent}%`,
                 width: `${Math.max(widthPercent, 1)}%`, // Ensure at least a visible sliver
                 minWidth: '4px'
               }}
               title={`${marker.label} (${formatTime(marker.start)} - ${formatTime(marker.end)})`}
               onClick={(e) => {
                 e.stopPropagation();
                 seekTo(marker.start);
               }}
             />
           );
        })}

        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-blue-600 pointer-events-none z-20"
          style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>
      
      <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-2">
        {markers.map((marker) => (
           <button
             key={`legend-${marker.id}`}
             onClick={() => seekTo(marker.start)}
             className="flex items-center gap-1 hover:text-blue-600 transition-colors"
           >
             <div className="w-2 h-2 rounded-full bg-green-500" />
             {marker.label} ({formatTime(marker.start)})
           </button>
        ))}
      </div>
    </div>
  );
}
