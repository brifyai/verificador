'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Mic, CheckCircle, XCircle, Plus, Eye, RefreshCcw, FileAudio, Trash2, Download } from 'lucide-react';
import { AudioTimeline } from '@/components/AudioTimeline';
import { PhraseSelector } from '@/components/PhraseSelector';
import { PendingVerificationItem } from '@/components/PendingVerificationItem';
import { RunPodControl } from '@/components/RunPodControl';

// Helper to parse "MM:SS" or "HH:MM:SS" to seconds
const parseTime = (timeStr: string | null) => {
  if (!timeStr) return 0;
  try {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    if (parts.length === 2) {
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    return 0;
  } catch {
    return 0;
  }
};

// Helper to format seconds to MM:SS or HH:MM:SS
const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Component to render formatted transcription
const TranscriptionView = ({ content }: { content: string }) => {
  try {
    // Try to parse as JSON segments
    const segments = JSON.parse(content);
    if (Array.isArray(segments) && segments.length > 0 && 'start' in segments[0] && 'text' in segments[0]) {
      return (
        <div className="space-y-1 font-sans">
          {segments.map((seg: any, idx: number) => (
            <div key={idx} className="flex gap-4 hover:bg-gray-50 p-2 rounded transition-colors border-b border-gray-50 last:border-0">
              <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded h-fit whitespace-nowrap select-none">
                {formatTime(seg.start)} - {formatTime(seg.end)}
              </span>
              <p className="text-gray-800 text-sm leading-relaxed">{seg.text}</p>
            </div>
          ))}
        </div>
      );
    }
  } catch (e) {
    // Not JSON or invalid format, render as plain text
  }

  return <div className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded">{content}</div>;
};

async function readStream(response: Response, onProgress: (p: number, msg?: string) => void): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; 
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === 'progress') {
           onProgress(data.percentage, data.message);
        } else if (data.type === 'result') {
           return data.data;
        } else if (data.type === 'error') {
           throw new Error(data.error);
        }
      } catch (e: any) {
        // If it's a known error type, rethrow
        if (e.message && !e.message.includes("JSON")) throw e;
        console.error("Error parsing stream line:", line, e);
      }
    }
  }
  // If we get here and haven't returned a result, check if we processed everything
  // Ideally result should have been returned.
  // But if stream closes without result, throw error.
  throw new Error("Conexión cerrada sin resultados");
}

// Helper to sanitize filename
const sanitizeFileName = (name: string) => {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-zA-Z0-9.-]/g, "_"); // Replace special chars with underscore
};

export default function RadioPage() {
  const { id } = useParams();
  const [radio, setRadio] = useState<any>(null);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [phrases, setPhrases] = useState<{ text: string; save: boolean }[]>([{ text: '', save: false }]);
  const [savedPhrases, setSavedPhrases] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [transcriptionModalOpen, setTranscriptionModalOpen] = useState(false);
  const [currentTranscription, setCurrentTranscription] = useState('');

  const [syncing, setSyncing] = useState(false);
  // Removed local RunPod state in favor of component

  useEffect(() => {
    if (id) {
      fetchRadio();
      fetchVerifications();
      fetchSavedPhrases();
    }
  }, [id]);

  // fetchRunpodStatus and toggleRunpod removed - now in component

  const fetchRadio = async () => {
    const { data } = await supabase.from('radios').select('*').eq('id', id).single();
    setRadio(data);
  };

  const fetchVerifications = async () => {
    const { data } = await supabase
      .from('verifications')
      .select('*')
      .eq('radio_id', id)
      .order('created_at', { ascending: false });
    setVerifications(data || []);
  };

  const fetchSavedPhrases = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    try {
      const res = await fetch('/api/phrases', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (data.phrases) {
        setSavedPhrases(data.phrases);
      }
    } catch (error) {
      console.error('Error fetching phrases:', error);
    }
  };

  const savePhrasesToDb = async (phrasesToSave: string[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || phrasesToSave.length === 0) return;

    try {
      await Promise.all(phrasesToSave.map(text => 
        fetch('/api/phrases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ text })
        })
      ));
      fetchSavedPhrases();
    } catch (error) {
      console.error('Error saving phrases:', error);
    }
  };

  const handleExport = () => {
    try {
      // 1. Filter matches (found phrases) from history
      const matches = verifications
        .filter(v => v.status !== 'pending' && v.is_match);

      if (matches.length === 0) {
        toast.info('No hay coincidencias para exportar');
        return;
      }

      // 2. Prepare CSV data
      const csvRows = [
        ['Radio', 'Nombre del Audio', 'Frase Encontrada', 'Inicio', 'Fin', 'Fecha']
      ];

      matches.forEach(v => {
        const audioName = v.drive_file_name || (v.audio_path ? v.audio_path.split('/').pop() : 'Desconocido');
        const date = new Date(v.created_at).toLocaleString();
        
        csvRows.push([
          radio.name,
          audioName,
          v.target_phrase,
          v.timestamp_start || '',
          v.timestamp_end || '',
          date
        ]);
      });

      // 3. Convert to CSV string
      const csvContent = csvRows
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      // 4. Trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `reporte_${radio.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Error al exportar');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/sync-drive', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ radioId: id }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.synced > 0) {
          toast.success(`Se sincronizaron ${data.synced} nuevos archivos`);
          fetchVerifications();
        } else {
          toast.info('No hay nuevos archivos para sincronizar');
        }
      } else {
        toast.error('Error al sincronizar: ' + data.error);
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteGroup = async (group: any) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) return;

    try {
      // Delete by IDs to ensure we delete exactly what's shown in the group
      const idsToDelete = group.items.map((v: any) => v.id);
      
      // Use API to delete (bypassing potential RLS issues)
      const res = await fetch('/api/verifications/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      toast.success('Registro eliminado correctamente');
      
      // Update UI immediately
      setVerifications(prev => prev.filter(v => !idsToDelete.includes(v.id)));

    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar: ' + error.message);
    }
  };

  const handleAddPhrase = () => {
    setPhrases([...phrases, { text: '', save: false }]);
  };

  const handleRemovePhrase = (index: number) => {
    const newPhrases = phrases.filter((_, i) => i !== index);
    setPhrases(newPhrases.length ? newPhrases : [{ text: '', save: false }]);
  };

  const handlePhraseChange = (index: number, value: string) => {
    const newPhrases = [...phrases];
    newPhrases[index].text = value;
    setPhrases(newPhrases);
  };

  const handleSaveChange = (index: number, save: boolean) => {
    const newPhrases = [...phrases];
    newPhrases[index].save = save;
    setPhrases(newPhrases);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        toast.error(`El archivo ${file.name} es demasiado grande. El tamaño máximo permitido es 100MB.`);
        setFile(null);
        e.target.value = ''; 
        return;
      }
      setFile(file);
    }
  };

  const handlePendingVerify = async (verificationId: string, driveFileId: string, phrasesList: { text: string; save: boolean }[]) => {
    setProcessing(true);
    setProcessingId(verificationId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // 1. Save new phrases if requested
      const phrasesToSave = phrasesList.filter(p => p.save).map(p => p.text);
      if (phrasesToSave.length > 0) {
        await savePhrasesToDb(phrasesToSave);
      }

      const validPhrases = phrasesList.map(p => p.text).filter(t => t.trim());

      // 2. Call API
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          radioId: id,
          driveFileId: driveFileId,
          phrases: validPhrases,
        }),
      });

      const data = await readStream(res, (p, msg) => {
        setProgress(p);
        if (msg) setProgressMessage(msg);
      });

      if (!data.success) throw new Error(data.error);

      const results = data.analysis;

      // 3. Update DB
      // The first result updates the existing pending row
      // Subsequent results create new rows
      const { data: { user } } = await supabase.auth.getUser();

      console.log('Attempting to update verification:', { verificationId, userId: user?.id });

      if (results && results.length > 0) {
        // Update first
        const firstResult = results[0];
        const { data: updatedRows, error: updateError } = await supabase
          .from('verifications')
          .update({
            target_phrase: firstResult.target_phrase,
            transcription: firstResult.transcription,
            is_match: firstResult.is_match,
            validation_rate: firstResult.validation_rate,
            timestamp_start: firstResult.timestamp_start,
            timestamp_end: firstResult.timestamp_end,
            status: 'completed',
            full_transcription: data.full_transcription,
            audio_path: data.audio_path // Update audio_path from backend response
          })
          .eq('id', verificationId)
          .select();

        if (updateError) {
             console.error('Update error details:', updateError);
             throw updateError;
        }
        
        // Critical check: Ensure the row was actually updated
        if (!updatedRows || updatedRows.length === 0) {
             throw new Error("Error crítico: No se pudo actualizar la verificación en la base de datos (ID no encontrado o permisos insuficientes).");
        }

        // Optimistic update for UI responsiveness
        setVerifications(prev => {
            const updated = prev.map(v => 
                v.id === verificationId ? { 
                    ...v, 
                    status: 'completed',
                    target_phrase: firstResult.target_phrase,
                    transcription: firstResult.transcription,
                    is_match: firstResult.is_match,
                    validation_rate: firstResult.validation_rate,
                    timestamp_start: firstResult.timestamp_start,
                    timestamp_end: firstResult.timestamp_end,
                    full_transcription: data.full_transcription,
                    audio_path: data.audio_path // Optimistic update
                } : v
            );

            // Insert others locally if needed
            if (results.length > 1) {
                const others = results.slice(1);
                const original = prev.find(v => v.id === verificationId);
                
                const newRows = others.map((r: any, idx: number) => ({
                    id: `temp-${Date.now()}-${idx}`, // Temporary ID
                    radio_id: id,
                    user_id: user?.id,
                    drive_file_id: driveFileId,
                    drive_web_link: original?.drive_web_link,
                    drive_file_name: original?.drive_file_name,
                    audio_path: data.audio_path, // New rows also get audio_path
                    target_phrase: r.target_phrase,
                    transcription: r.transcription,
                    is_match: r.is_match,
                    validation_rate: r.validation_rate,
                    timestamp_start: r.timestamp_start,
                    timestamp_end: r.timestamp_end,
                    status: 'completed',
                    full_transcription: data.full_transcription,
                    created_at: original?.created_at || new Date().toISOString()
                }));
                
                return [...updated, ...newRows];
            }
            
            return updated;
        });

        // Insert others into DB
        if (results.length > 1) {
            const others = results.slice(1);
            const original = verifications.find(v => v.id === verificationId);

            const toInsert = others.map((r: any) => ({
                radio_id: id,
                user_id: user?.id,
                drive_file_id: driveFileId,
                drive_web_link: original?.drive_web_link,
                drive_file_name: original?.drive_file_name,
                audio_path: data.audio_path, // Save to DB
                target_phrase: r.target_phrase,
                transcription: r.transcription,
                is_match: r.is_match,
                validation_rate: r.validation_rate,
                timestamp_start: r.timestamp_start,
                timestamp_end: r.timestamp_end,
                status: 'completed',
                full_transcription: data.full_transcription,
                created_at: original?.created_at || new Date().toISOString()
            }));

            const { error: insertError } = await supabase.from('verifications').insert(toInsert);
            if (insertError) throw insertError;
        }
      } else {
        // Fallback: If no analysis results, still mark as completed to remove from pending list
         const { data: updatedRows, error: updateError } = await supabase
          .from('verifications')
          .update({
            status: 'completed',
            is_match: false,
            transcription: 'No se encontraron resultados en el análisis.',
            full_transcription: data.full_transcription,
            audio_path: data.audio_path // Update audio_path even if no match
          })
          .eq('id', verificationId)
          .select();

        if (updateError) throw updateError;
        
        if (!updatedRows || updatedRows.length === 0) {
             throw new Error("Error crítico: No se pudo actualizar la verificación en la base de datos (ID no encontrado o permisos insuficientes).");
        }

        // Optimistic update for fallback
        setVerifications(prev => prev.map(v => 
            v.id === verificationId ? { 
                ...v, 
                status: 'completed',
                is_match: false,
                transcription: 'No se encontraron resultados en el análisis.',
                full_transcription: data.full_transcription,
                audio_path: data.audio_path
            } : v
        ));
      }

      toast.success('Verificación completada');
      // Force fetch after a delay to ensure consistency with server
      setTimeout(() => fetchVerifications(), 1000);
    } catch (error: any) {
      console.error(error);
      toast.error('Error: ' + error.message);
    } finally {
      setProcessing(false);
      setProcessingId(null);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const validPhrases = phrases.filter(p => p.text.trim() !== '');
    if (!file || validPhrases.length === 0) return;
    setProcessing(true);
    setProcessingId(null);

    try {
      // 0. Save phrases
      const phrasesToSave = validPhrases.filter(p => p.save).map(p => p.text);
      if (phrasesToSave.length > 0) {
        await savePhrasesToDb(phrasesToSave);
      }

      // 1. Upload audio
      const sanitizedName = sanitizeFileName(file.name);
      const fileName = `${Date.now()}-${sanitizedName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audios')
        .upload(`${id}/${fileName}`, file);

      if (uploadError) throw new Error('Error subiendo audio: ' + uploadError.message);
      
      const audioPath = uploadData.path;

      // 2. Call API (Send audioPath instead of file to avoid Vercel body limits)
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          radioId: id,
          phrases: validPhrases.map(p => p.text),
          audioPath: audioPath,
          fileName: file.name
        }),
      });

      const data = await readStream(res, (p, msg) => {
        setProgress(p);
        if (msg) setProgressMessage(msg);
      });
      
      if (!data.success) throw new Error(data.error);

      const results = data.analysis;

      // 3. Save results
      const { data: { user } } = await supabase.auth.getUser();
      
      const verificationsToInsert = results.map((result: any) => ({
        radio_id: id,
        audio_path: audioPath,
        target_phrase: result.target_phrase,
        transcription: result.transcription,
        is_match: result.is_match,
        validation_rate: result.validation_rate,
        timestamp_start: result.timestamp_start,
        timestamp_end: result.timestamp_end,
        status: 'completed',
        user_id: user?.id,
        full_transcription: data.full_transcription,
        drive_file_name: file.name // Save original filename
      }));

      const { error: dbError } = await supabase.from('verifications').insert(verificationsToInsert);

      if (dbError) throw dbError;

      setProgress(100);
      toast.success(`Verificación completada. ${results.filter((r: any) => r.is_match).length} coincidencias encontradas.`);
      setFile(null);
      setPhrases([{ text: '', save: false }]);
      fetchVerifications();

    } catch (error: any) {
      toast.error(error.message);
      setProgress(0);
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 3000); 
    }
  };

  // Group verifications by audio_path or drive_file_id
  // Filter out pending status for history view
  const historyVerifications = verifications.filter(v => v.status !== 'pending');

  const groupedVerifications = historyVerifications.reduce((acc: any, v) => {
    const key = v.audio_path || v.drive_file_id || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        key,
        audio_path: v.audio_path,
        drive_file_id: v.drive_file_id,
        drive_web_link: v.drive_web_link,
        drive_file_name: v.drive_file_name,
        created_at: v.created_at,
        items: []
      };
    }
    acc[key].items.push(v);
    return acc;
  }, {});

  // Sort groups by date (newest first)
  const sortedGroups = Object.values(groupedVerifications).sort((a: any, b: any) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ) as any[];

  if (!radio) return <div>Cargando...</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{radio?.name}</h1>
          <p className="text-gray-500">Panel de Verificación</p>
        </div>
        <div className="flex gap-4 items-center">
            {/* RunPod Control */}
            <RunPodControl />

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
          </button>
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Nueva Verificación</h2>
        </div>
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Frases o Publicidades a Identificar</label>
            <div className="space-y-3">
              {phrases.map((phrase, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-grow">
                    <PhraseSelector
                        value={phrase.text}
                        onChange={(val) => handlePhraseChange(index, val)}
                        onSaveChange={(save) => handleSaveChange(index, save)}
                        savedPhrases={savedPhrases}
                        placeholder={`Ej: Publicidad ${index + 1}`}
                    />
                  </div>
                  {phrases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePhrase(index)}
                      className="text-red-600 hover:text-red-800 px-2 mt-2"
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddPhrase}
              className="mt-2 inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              <Plus className="mr-1 h-4 w-4" />
              Agregar otra frase
            </button>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Audio (MP3, WAV, AAC)</label>
            <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6">
              <div className="space-y-1 text-center">
                <Mic className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-white font-medium text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-500">
                    <span>Subir un archivo</span>
                    <input 
                      id="file-upload" 
                      name="file-upload" 
                      type="file" 
                      className="sr-only" 
                      accept=".mp3,.wav,.aac,.m4a,audio/*" 
                      onChange={handleFileChange} 
                    />
                  </label>
                  <p className="pl-1">o arrastrar y soltar</p>
                </div>
                <p className="text-xs text-gray-500">MP3, WAV, AAC hasta 100MB (Compresión auto.)</p>
              </div>
            </div>
            {file && <p className="mt-2 text-sm text-gray-600">Seleccionado: {file.name}</p>}
          </div>

          <div className="flex flex-col gap-4">
            {processing && !processingId && (
              <div className="w-full">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{progressMessage || 'Procesando audio...'}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={processing || !file || phrases.every(p => !p.text.trim())}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {processing ? 'Verificando...' : 'Verificar Audio'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Historial de Verificaciones</h2>
            <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                title="Exportar reporte CSV"
            >
                <Download className="w-4 h-4" />
                Exportar Reporte
            </button>
        </div>
        
        {/* Pending Verifications */}
        {verifications.filter((v: any) => v.status === 'pending').length > 0 && (
          <div className="mb-8 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileAudio className="h-5 w-5" />
              Pendientes de Verificación (Drive)
            </h3>
            <div className="grid gap-4">
              {verifications.filter((v: any) => v.status === 'pending').map((v: any) => (
                <PendingVerificationItem
                    key={v.id}
                    verification={v}
                    savedPhrases={savedPhrases}
                    onVerify={handlePendingVerify}
                    processing={processing}
                    processingId={processingId}
                    progress={progress}
                    progressMessage={progressMessage}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {sortedGroups.map((group) => {
            const audioUrl = group.audio_path 
              ? supabase.storage.from('audios').getPublicUrl(group.audio_path).data.publicUrl 
              : null;
            
            // Generate markers for timeline
            const markers = group.items
              .filter((v: any) => v.is_match && v.timestamp_start)
              .map((v: any) => ({
                id: v.id,
                label: v.target_phrase,
                start: parseTime(v.timestamp_start),
                end: parseTime(v.timestamp_end) || parseTime(v.timestamp_start) + 5, // Default 5s duration if no end
              }));

            return (
              <div key={group.key} className="bg-white shadow sm:rounded-lg overflow-hidden border border-gray-100">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <div className="flex flex-col">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-medium text-gray-900">
                            {group.drive_file_name || (() => {
                                if (group.audio_path) {
                                    const parts = group.audio_path.split('/');
                                    if (parts.length > 1) {
                                        // Remove timestamp prefix if possible (e.g. 1738959564459-filename.mp3)
                                        return parts[parts.length - 1].replace(/^\d+-/, '');
                                    }
                                }
                                return 'Audio sin nombre';
                            })()}
                        </span>
                        <span className="text-xs text-gray-500 hidden sm:inline">-</span>
                        <span className="text-xs text-gray-500">
                            {new Date(group.created_at).toLocaleString()}
                        </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.items[0]?.full_transcription && (
                      <button
                        onClick={() => {
                          setCurrentTranscription(group.items[0].full_transcription);
                          setTranscriptionModalOpen(true);
                        }}
                        className="text-gray-500 hover:text-blue-600 transition-colors"
                        title="Ver transcripción completa"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteGroup(group)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Eliminar registro"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="p-4">
                  {/* Timeline Player or Drive Link */}
                  {audioUrl ? (
                    <AudioTimeline audioUrl={audioUrl} markers={markers} />
                  ) : (
                    <div className="bg-blue-50 p-4 rounded-md mb-4 border border-blue-100">
                      <div className="flex items-center gap-2">
                        <FileAudio className="h-5 w-5 text-blue-600" />
                        <span className="text-blue-800 font-medium">Archivo sincronizado desde Google Drive</span>
                      </div>
                      {group.drive_web_link && (
                        <div className="mt-2 ml-7">
                          <a 
                            href={group.drive_web_link} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-sm text-blue-600 hover:text-blue-800 underline font-medium inline-flex items-center gap-1"
                          >
                            Abrir archivo original en Drive
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <ul className="divide-y divide-gray-200 mt-4">
                    {group.items.map((v: any) => (
                      <li key={v.id} className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="truncate max-w-lg">
                            <div className="flex items-center gap-2 text-sm">
                              <p className="font-medium text-blue-600 truncate">{v.target_phrase}</p>
                              {v.timestamp_start && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                  {v.timestamp_start} - {v.timestamp_end}
                                </span>
                              )}
                            </div>
                       
                          </div>
                          <div className="ml-2 flex-shrink-0 flex flex-col items-end">
                            <div className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${v.is_match ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {v.is_match ? (
                                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Encontrado</span>
                              ) : (
                                <span className="flex items-center gap-1"><XCircle className="w-3 h-3"/> No Encontrado</span>
                              )}
                            </div>
                       
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transcription Modal */}
      {transcriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium">Transcripción Completa</h3>
              <button 
                onClick={() => setTranscriptionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <TranscriptionView content={currentTranscription} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
