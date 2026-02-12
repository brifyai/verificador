'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { AudioTimeline } from '@/components/AudioTimeline';
import { Loader2 } from 'lucide-react';

interface Marker {
  id: string;
  label: string;
  start: number; // seconds
  end: number; // seconds
  color?: string;
}

interface SmartAudioTimelineProps {
  audioPath: string;
  markers: Marker[];
  className?: string;
}

export function SmartAudioTimeline({ audioPath, markers, className }: SmartAudioTimelineProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUrl = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.storage
          .from('audios')
          .createSignedUrl(audioPath, 3600); // 1 hour

        if (error) throw error;
        setAudioUrl(data.signedUrl);
      } catch (err) {
        console.error('Error fetching audio URL:', err);
        setError('Error al cargar el audio');
      } finally {
        setLoading(false);
      }
    };

    fetchUrl();
  }, [audioPath]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span className="text-sm text-gray-500">Cargando audio...</span>
      </div>
    );
  }

  if (error || !audioUrl) {
    return (
      <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
        {error || 'No se pudo cargar el audio'}
      </div>
    );
  }

  return <AudioTimeline audioUrl={audioUrl} markers={markers} className={className} />;
}
