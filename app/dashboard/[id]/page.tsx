'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Mic, CheckCircle, XCircle, Plus, Eye, RefreshCcw, FileAudio, Trash2, Download, Folder, ChevronRight, Home, ArrowLeft, Clock, BarChart3 } from 'lucide-react';
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

  // Re-verification state
  const [reverifyModalOpen, setReverifyModalOpen] = useState(false);
  const [selectedVerificationGroup, setSelectedVerificationGroup] = useState<any>(null);
  const [reverifyPhrases, setReverifyPhrases] = useState([{ text: '', save: false }]);

  // Folder Navigation State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState<string>('Raíz');
  const [folderStack, setFolderStack] = useState<{id: string, name: string}[]>([]);
  const [subFolders, setSubFolders] = useState<any[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  
  // Tabs State
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  // Batch Verification State
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [batchPhrases, setBatchPhrases] = useState([{ text: '', save: false }]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  
  // Broadcast Time State
  const [broadcastTime, setBroadcastTime] = useState('');
  const [broadcastDate, setBroadcastDate] = useState(''); // New State
  const [batchBroadcastTime, setBatchBroadcastTime] = useState('');
  const [batchBroadcastDate, setBatchBroadcastDate] = useState(''); // New State
  const [batchItemTimes, setBatchItemTimes] = useState<Record<string, string>>({});
  const [batchItemDates, setBatchItemDates] = useState<Record<string, string>>({}); // New State
  const [activeBatchItemId, setActiveBatchItemId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchName, setBatchName] = useState('');
  
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>('all');
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [showReverifyModal, setShowReverifyModal] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      const role = profile?.role || 'client';
      setUserRole(role);

      if (role === 'super_admin') {
         fetchRadio();
         fetchSavedPhrases();
      } else if (role === 'admin') {
         // Check assignment
         const { data: assignment } = await supabase
            .from('radio_assignments')
            .select('*')
            .eq('user_id', user.id)
            .eq('radio_id', id)
            .single();
         
         if (assignment) {
            fetchRadio();
            fetchSavedPhrases();
         } else {
            toast.error('No tienes acceso a esta radio');
            setRadio(null);
         }
      } else {
         toast.error('Acceso denegado');
         setRadio(null);
      }
    };

    if (id) {
      checkAccess();
    }
  }, [id]);

  useEffect(() => {
    if (radio) {
        fetchFolders();
        fetchVerifications();
        fetchBatches();
    }
  }, [radio, currentFolderId]);

  const fetchBatches = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !radio) return;

    // Assuming batch_jobs table exists (will gracefully fail if not)
    const { data, error } = await supabase
        .from('batch_jobs')
        .select('*')
        .eq('radio_id', radio.id)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error("Error fetching batches:", error);
        if (error.code === '42P01') {
             toast.error("La tabla de lotes no existe. Ejecuta el script SQL 'supabase_batch_jobs.sql' en Supabase.");
        }
    }

    if (!error && data) {
        console.log("Batches loaded:", data);
        setBatches(data);
    }
  };

  // fetchRunpodStatus and toggleRunpod removed - now in component

  const fetchRadio = async () => {
    const { data } = await supabase.from('radios').select('*').eq('id', id).single();
    setRadio(data);
  };

  const fetchFolders = async () => {
    if (!radio) return;
    setLoadingFolders(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
        const targetId = currentFolderId || radio.drive_folder_id;
        const res = await fetch('/api/folders/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ folderId: targetId })
        });
        const data = await res.json();
        if (data.success) {
            setSubFolders(data.folders || []);
        }
    } catch (error) {
        console.error('Error fetching folders:', error);
    } finally {
        setLoadingFolders(false);
    }
  };

  const fetchVerifications = async () => {
    if (!radio) return;
    
    // NOTE: This assumes 'drive_parent_folder_id' column exists.
    // If running without SQL update, this might fail or return all if ignored.
    // We try to filter by folder.
    
    let query = supabase
      .from('verifications')
      .select('*')
      .eq('radio_id', id)
      .order('created_at', { ascending: false });

    // If currentFolderId is set, filtering is stricter
    if (currentFolderId) {
        query = query.eq('drive_parent_folder_id', currentFolderId);
    } else {
        // In root: show items with root folder ID or NULL (legacy)
        // Note: OR syntax in Supabase JS: .or(`drive_parent_folder_id.eq.${radio.drive_folder_id},drive_parent_folder_id.is.null`)
        // However, 'is.null' might be tricky in OR string.
        // Safer: just fetch all for radio and filter in memory if we suspect column issues or complex logic?
        // Let's try to filter in memory for safety against missing column initially?
        // No, user asked for SQL. I will assume SQL is run.
        // But if I use .or() with .eq('radio_id'), I need to be careful with precedence.
        // .eq('radio_id', id).or(...) -> AND (OR)
        
        // Actually, let's just fetch all for now and filter in client to avoid 500 if column missing?
        // User explicitly asked for SQL generator "en caso de necesitar cambiar algo".
        // If I write query using column, and column is missing -> Error.
        // I'll try to use the column. If error, fallback?
        // Complexity.
        // I will just use the column.
        query = query.or(`drive_parent_folder_id.eq.${radio.drive_folder_id},drive_parent_folder_id.is.null`);
    }

    const { data, error } = await query;
    
    if (error) {
        // Fallback: fetch all without folder filter (if column doesn't exist yet)
        console.warn('Filtering by folder failed (column might be missing), fetching all.', error);
        const { data: allData } = await supabase
            .from('verifications')
            .select('*')
            .eq('radio_id', id)
            .order('created_at', { ascending: false });
        setVerifications(allData || []);
    } else {
        setVerifications(data || []);
    }
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

      // 3. Convert to CSV string with BOM for Excel
      const csvContent = '\uFEFF' + csvRows
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

  const handleReverify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVerificationGroup) return;

    const validPhrases = reverifyPhrases.filter(p => p.text.trim() !== '');
    if (validPhrases.length === 0) return;

    setReverifying(true);
    try {
        // 0. Save phrases if selected
        const phrasesToSave = validPhrases.filter(p => p.save).map(p => p.text);
        if (phrasesToSave.length > 0) {
            await savePhrasesToDb(phrasesToSave);
        }

        // 1. Call Reverify API
        // Use the full_transcription from the first item in the group (they share it)
        const transcription = selectedVerificationGroup.items[0].full_transcription;
        
        const res = await fetch('/api/reverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phrases: validPhrases.map(p => p.text),
                transcription: transcription
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al analizar');

        // 2. Save results
        const { data: { user } } = await supabase.auth.getUser();
        
        // Re-use group info
        const baseItem = selectedVerificationGroup.items[0];

        const verificationsToInsert = data.analysis.map((result: any) => ({
            radio_id: id,
            audio_path: baseItem.audio_path,
            drive_file_id: baseItem.drive_file_id,
            drive_web_link: baseItem.drive_web_link,
            drive_file_name: baseItem.drive_file_name,
            target_phrase: result.target_phrase,
            transcription: result.transcription,
            is_match: result.is_match,
            validation_rate: result.validation_rate,
            timestamp_start: result.timestamp_start,
            timestamp_end: result.timestamp_end,
            status: 'completed',
            user_id: user?.id,
            full_transcription: transcription, // Keep the original transcription
            drive_parent_folder_id: baseItem.drive_parent_folder_id,
            broadcast_time: baseItem.broadcast_time,
            broadcast_date: baseItem.broadcast_date,
        }));

        const { error: dbError } = await supabase.from('verifications').insert(verificationsToInsert);
        if (dbError) throw dbError;

        toast.success(`Análisis completado. ${data.analysis.filter((r: any) => r.is_match).length} coincidencias encontradas.`);
        setReverifyModalOpen(false);
        setReverifyPhrases([{ text: '', save: false }]);
        fetchVerifications();

    } catch (error: any) {
        console.error('Reverify error:', error);
        toast.error(error.message);
    } finally {
        setReverifying(false);
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
        body: JSON.stringify({ 
            radioId: id,
            folderId: currentFolderId // Sync specific folder if selected
        }),
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

  const handlePendingVerify = async (verificationId: string, driveFileId: string, phrasesList: { text: string; save: boolean }[], batchId?: string, broadcastTimeVal?: string, broadcastDateVal?: string) => {
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

      const processingSeconds = data.processing_seconds || 0;

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
            audio_path: data.audio_path, // Update audio_path from backend response
            processing_seconds: processingSeconds,
            batch_id: batchId,
            broadcast_time: broadcastTimeVal,
            broadcast_date: broadcastDateVal
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
                    drive_parent_folder_id: original?.drive_parent_folder_id, // Fix: Copy folder ID
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
                drive_parent_folder_id: original?.drive_parent_folder_id, // Fix: Copy folder ID
                audio_path: data.audio_path, // Save to DB
                target_phrase: r.target_phrase,
                transcription: r.transcription,
                is_match: r.is_match,
                validation_rate: r.validation_rate,
                timestamp_start: r.timestamp_start,
                timestamp_end: r.timestamp_end,
                status: 'completed',
                full_transcription: data.full_transcription,
                created_at: original?.created_at || new Date().toISOString(),
                processing_seconds: processingSeconds,
                batch_id: batchId,
                broadcast_time: broadcastTimeVal,
                broadcast_date: broadcastDateVal
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
            audio_path: data.audio_path, // Update audio_path even if no match
            processing_seconds: processingSeconds,
            batch_id: batchId,
            broadcast_time: broadcastTimeVal,
            broadcast_date: broadcastDateVal
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
      
      // Return stats for batch processing
      return { success: true, processingSeconds };
      
    } catch (error: any) {
      console.error(error);
      toast.error('Error: ' + error.message);
      throw error; // Re-throw for batch handling
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
        drive_file_name: file.name, // Save original filename
        drive_parent_folder_id: currentFolderId, // Fix: Assign current folder ID
        processing_seconds: data.processing_seconds,
        broadcast_time: broadcastTime,
        broadcast_date: broadcastDate
      }));

      const { error: dbError } = await supabase.from('verifications').insert(verificationsToInsert);

      if (dbError) throw dbError;

      setProgress(100);
      toast.success(`Verificación completada. ${results.filter((r: any) => r.is_match).length} coincidencias encontradas.`);
      setFile(null);
      setPhrases([{ text: '', save: false }]);
      setBroadcastTime('');
      setBroadcastDate('');
      fetchVerifications();

    } catch (error: any) {
      toast.error(error.message);
      setProgress(0);
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 3000); 
    }
  };

  const handleFolderClick = (folder: any) => {
    setFolderStack([...folderStack, { 
        id: currentFolderId || 'root', 
        name: currentFolderName 
    }]);
    setCurrentFolderId(folder.id);
    setCurrentFolderName(folder.name);
  };

  const handleNavigateUp = () => {
    if (folderStack.length === 0) return;
    const parent = folderStack[folderStack.length - 1];
    setFolderStack(folderStack.slice(0, -1));
    setCurrentFolderId(parent.id === 'root' ? null : parent.id);
    setCurrentFolderName(parent.name);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
        setFolderStack([]);
        setCurrentFolderId(null);
        setCurrentFolderName('Raíz');
        return;
    }
    const target = folderStack[index];
    setFolderStack(folderStack.slice(0, index));
    setCurrentFolderId(target.id === 'root' ? null : target.id);
    setCurrentFolderName(target.name);
  };

  const handleBatchVerify = async () => {
    if (selectedPendingIds.length === 0) return;
    
    const validPhrases = batchPhrases.filter(p => p.text.trim() !== '');
    if (validPhrases.length === 0) {
        toast.error('Debes ingresar al menos una frase para verificar');
        return;
    }

    setIsBatchProcessing(true);
    setBatchProgress({ current: 0, total: selectedPendingIds.length });

    const startTime = Date.now();
    let totalProcessingSeconds = 0;
    let successfulItems = 0;
    let failedItems = 0;
    let batchId: string | null = null;

    // 0. Create Batch Job Record (if table exists)
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        // Use provided name or default to Date
        const finalBatchName = batchName.trim() || `Lote ${new Date().toLocaleString()}`;

        // @ts-ignore
        const { data: batchData, error: batchError } = await supabase
            .from('batch_jobs')
            .insert({
                radio_id: id,
                user_id: user?.id,
                total_files: selectedPendingIds.length,
                status: 'processing',
                name: finalBatchName,
                broadcast_time: batchBroadcastTime,
                broadcast_date: batchBroadcastDate
            })
            .select()
            .single();
        
        if (!batchError && batchData) {
            batchId = batchData.id;
        }
    } catch (e) {
        console.warn("Batch logging disabled (table batch_jobs might not exist).");
    }

    // 1. Save phrases once globally for the batch
    const phrasesToSave = validPhrases.filter(p => p.save).map(p => p.text);
    if (phrasesToSave.length > 0) {
         await savePhrasesToDb(phrasesToSave);
    }

    // 2. Use phrases with save=false to avoid redundant saving in loop
    const phrasesForProcessing = validPhrases.map(p => ({ ...p, save: false }));

    // Process sequentially
    for (let i = 0; i < selectedPendingIds.length; i++) {
        const verificationId = selectedPendingIds[i];
        setBatchProgress({ current: i + 1, total: selectedPendingIds.length });
        
        const verification = verifications.find(v => v.id === verificationId);
        if (!verification) continue;

        try {
            const itemBroadcastTime = batchItemTimes[verificationId] || batchBroadcastTime;
            const itemBroadcastDate = batchItemDates[verificationId] || batchBroadcastDate;
            // @ts-ignore
            const result = await handlePendingVerify(verificationId, verification.drive_file_id, phrasesForProcessing, batchId || undefined, itemBroadcastTime, itemBroadcastDate);
            
            if (result && result.processingSeconds) {
                totalProcessingSeconds += result.processingSeconds;
            }
            successfulItems++;

            // Update batch job progress periodically
            if (batchId) {
                 await supabase
                    .from('batch_jobs')
                    .update({ 
                        processed_files: i + 1,
                        total_processing_seconds: totalProcessingSeconds,
                        estimated_cost: totalProcessingSeconds * 0.00031
                    })
                    .eq('id', batchId);
            }

        } catch (error: any) {
            console.error(`Error verifying ${verificationId}:`, error);
            failedItems++;
            
            // Record error in database
            try {
                await supabase
                    .from('verifications')
                    .update({ 
                        status: 'error',
                        transcription: `Error en verificación: ${error.message || 'Error desconocido'}`,
                        batch_id: batchId
                    })
                    .eq('id', verificationId);

                // Optimistic update
                setVerifications(prev => prev.map(v => 
                    v.id === verificationId ? { 
                        ...v, 
                        status: 'error', 
                        transcription: `Error en verificación: ${error.message || 'Error desconocido'}` 
                    } : v
                ));
            } catch (updateError) {
                console.error("Failed to update error status", updateError);
            }
        }
    }

    const endTime = Date.now();
    const totalDurationSeconds = (endTime - startTime) / 1000;
    const totalCost = totalProcessingSeconds * 0.00031;

    // Final Update Batch Job
    if (batchId) {
        await supabase
            .from('batch_jobs')
            .update({
                completed_at: new Date().toISOString(),
                processed_files: successfulItems,
                total_duration_seconds: totalDurationSeconds,
                total_processing_seconds: totalProcessingSeconds,
                estimated_cost: totalCost,
                status: 'completed'
            })
            .eq('id', batchId);
    }

    setIsBatchProcessing(false);
    setSelectedPendingIds([]);
    setBatchPhrases([{ text: '', save: false }]);
    setBatchName(''); // Reset name
    setBatchBroadcastTime(''); // Reset time
    setBatchBroadcastDate(''); // Reset date
    setBatchItemTimes({});
    setBatchItemDates({});
    setActiveBatchItemId(null);
    fetchBatches(); // Refresh batch list
    
    toast.success(
        <div>
            <div className="font-bold">Lote completado ({successfulItems}/{selectedPendingIds.length})</div>
            <div className="text-xs mt-1">
                Procesados: {successfulItems}<br/>
                Errores: {failedItems}<br/>
                Tiempo Total: {totalDurationSeconds.toFixed(1)}s<br/>
                Costo IA (Est.): ${totalCost.toFixed(4)}
            </div>
        </div>,
        { duration: 6000 }
    );
  };

  const toggleSelectPending = (id: string) => {
    if (selectedPendingIds.includes(id)) {
        setSelectedPendingIds(selectedPendingIds.filter(pid => pid !== id));
    } else {
        setSelectedPendingIds([...selectedPendingIds, id]);
    }
  };

  const selectFirstPending = (count: number) => {
    const pending = verifications.filter((v: any) => v.status === 'pending');
    const toSelect = pending.slice(0, count).map((v: any) => v.id);
    setSelectedPendingIds(toSelect);
  };

  const handleHistoryReverify = async () => {
    if (selectedHistoryIds.length === 0) return;

    const validPhrases = reverifyPhrases.filter(p => p.text.trim() !== '');
    if (validPhrases.length === 0) {
        toast.error('Debes ingresar al menos una frase para analizar');
        return;
    }

    setReverifying(true);
    
    // 1. Save phrases
    const phrasesToSave = validPhrases.filter(p => p.save).map(p => p.text);
    if (phrasesToSave.length > 0) await savePhrasesToDb(phrasesToSave);

    const phrasesList = validPhrases.map(p => p.text);

    let successCount = 0;

    for (const id of selectedHistoryIds) {
        const item = verifications.find(v => v.id === id);
        if (!item || !item.full_transcription) continue;

        try {
            const res = await fetch('/api/reverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcription: item.full_transcription,
                    phrases: phrasesList
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            const results = data.analysis;

            // Insert new verifications
             const { data: { user } } = await supabase.auth.getUser();

             const toInsert = results.map((r: any) => ({
                radio_id: item.radio_id,
                user_id: user?.id,
                drive_file_id: item.drive_file_id,
                drive_web_link: item.drive_web_link,
                drive_file_name: item.drive_file_name,
                audio_path: item.audio_path,
                target_phrase: r.target_phrase,
                transcription: r.transcription,
                is_match: r.is_match,
                validation_rate: r.validation_rate,
                timestamp_start: r.timestamp_start,
                timestamp_end: r.timestamp_end,
                status: 'completed',
                full_transcription: item.full_transcription,
                created_at: new Date().toISOString(),
                drive_parent_folder_id: item.drive_parent_folder_id,
                broadcast_time: item.broadcast_time,
                broadcast_date: item.broadcast_date,
                // New analysis is independent of previous batch unless we want to track it
            }));

            const { error } = await supabase.from('verifications').insert(toInsert);
            if (error) throw error;
            
            successCount++;

        } catch (error) {
            console.error(`Error reverifying ${id}:`, error);
        }
    }

    setReverifying(false);
    setShowReverifyModal(false);
    setSelectedHistoryIds([]);
    setReverifyPhrases([{ text: '', save: false }]);
    toast.success(`Re-análisis completado para ${successCount} audios.`);
    fetchVerifications();
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setCreatingFolder(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
        const parentId = currentFolderId || radio?.drive_folder_id;
        const res = await fetch('/api/folders/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ 
                name: newFolderName,
                parentId: parentId
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al crear carpeta');

        toast.success('Carpeta creada correctamente');
        setNewFolderName('');
        setShowCreateFolder(false);
        fetchFolders(); // Refresh list
    } catch (error: any) {
        toast.error(error.message);
    } finally {
        setCreatingFolder(false);
    }
  };

  // Group verifications by audio_path or drive_file_id
  // Filter out pending status for history view
  const historyVerifications = verifications.filter(v => {
    if (v.status === 'pending') return false;
    if (selectedBatchFilter !== 'all') {
        return v.batch_id === selectedBatchFilter;
    }
    return true;
  });

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
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer transition-all disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : (currentFolderId ? 'Sincronizar Carpeta' : 'Sincronizar Drive')}
          </button>
        </div>
      </div>

      {/* Folder Navigation */}
      <div className="bg-white shadow sm:rounded-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-4 text-sm text-gray-500 overflow-x-auto">
             {/* Breadcrumbs */}
             {folderStack.length === 0 && !currentFolderId && (
                 <div className="flex items-center font-medium text-gray-900">
                    <Home className="w-4 h-4 mr-1" /> Raíz
                 </div>
             )}
             
             {folderStack.map((f, idx) => (
                 <div key={idx} className="flex items-center">
                     {idx > 0 && <ChevronRight className="w-4 h-4 mx-1" />}
                     <button onClick={() => handleBreadcrumbClick(idx)} className="hover:text-blue-600 flex items-center">
                         {f.id === 'root' || f.id === null ? <Home className="w-4 h-4 mr-1" /> : null}
                         {f.name}
                     </button>
                 </div>
             ))}
             
             {currentFolderId && (
                 <div className="flex items-center font-medium text-gray-900">
                     {folderStack.length > 0 && <ChevronRight className="w-4 h-4 mx-1" />}
                     <span>
                         {currentFolderName}
                     </span>
                 </div>
             )}
        </div>

        {/* Create Folder Form */}
        {showCreateFolder && (
            <form onSubmit={handleCreateFolder} className="mb-4 flex gap-2">
                <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Nombre de la nueva carpeta"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    autoFocus
                />
                <button
                    type="submit"
                    disabled={creatingFolder}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                    {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                </button>
                <button
                    type="button"
                    onClick={() => setShowCreateFolder(false)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                    <XCircle className="w-4 h-4" />
                </button>
            </form>
        )}

        {/* Folders Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
             {loadingFolders ? (
                 <div className="col-span-full flex justify-center py-4">
                     <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                 </div>
             ) : (
                 <>
                     {currentFolderId && (
                         <div 
                             onClick={handleNavigateUp}
                             className="border rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors text-gray-500"
                         >
                             <ArrowLeft className="w-8 h-8 mb-2" />
                             <span className="text-sm font-medium">Volver</span>
                         </div>
                     )}
                      {subFolders.map((folder) => (
                         <div 
                             key={folder.id}
                             onClick={() => handleFolderClick(folder)}
                             className="border rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors group"
                         >
                             <Folder className="w-10 h-10 text-yellow-500 mb-2 group-hover:text-yellow-600" />
                             <span className="text-sm font-medium text-center text-gray-700 group-hover:text-blue-700 truncate w-full">
                                 {folder.name}
                             </span>
                         </div>
                     ))}
                     
                     {/* Add Folder Button */}
                     {!showCreateFolder && (
                         <div 
                             onClick={() => setShowCreateFolder(true)}
                             className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors text-gray-400 hover:text-blue-600"
                         >
                             <Plus className="w-8 h-8 mb-2" />
                             <span className="text-sm font-medium">Nueva Carpeta</span>
                         </div>
                     )}
                 </>
             )}
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
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Día de emisión</label>
              <input
                type="date"
                value={broadcastDate}
                onChange={(e) => setBroadcastDate(e.target.value)}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Horario emisión (Opcional)</label>
              <input
                type="time"
                value={broadcastTime}
                onChange={(e) => setBroadcastTime(e.target.value)}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              />
            </div>
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

      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        {/* Tabs Header */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('pending')}
              className={`${
                activeTab === 'pending'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 transition-colors`}
            >
              <FileAudio className="w-4 h-4" />
              Pendientes de Verificación
              {verifications.filter(v => v.status === 'pending').length > 0 && (
                <span className="bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full text-xs ml-2">
                  {verifications.filter(v => v.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 transition-colors`}
            >
              <CheckCircle className="w-4 h-4" />
              Historial
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* PENDING TAB */}
          {activeTab === 'pending' && (
            <div className="space-y-6">
                {verifications.filter((v: any) => v.status === 'pending').length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-3" />
                        <h3 className="text-lg font-medium text-gray-900">¡Todo al día!</h3>
                        <p>No hay audios pendientes de verificación en esta carpeta.</p>
                    </div>
                ) : (
                    <>
                        {/* Batch Controls */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-4">
                            <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                                <RefreshCcw className="w-4 h-4" />
                                Verificación por Lotes
                            </h3>

                            {/* Batch Name Input */}
                            <div>
                                <label className="block text-sm font-medium text-blue-800 mb-1">Nombre del Lote (Opcional)</label>
                                <input
                                    type="text"
                                    value={batchName}
                                    onChange={(e) => setBatchName(e.target.value)}
                                    placeholder={`Ej: Lote ${new Date().toLocaleDateString()}`}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                />
                            </div>

                            {/* Time Management Module */}
                            <div className="bg-white p-3 rounded-md border border-blue-100 shadow-sm space-y-3">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-blue-800 flex items-center gap-2">
                                            <Clock className="w-4 h-4" />
                                            Horarios y Fechas de Emisión
                                        </label>
                                    </div>
                                    
                                    {/* Global Inputs (Fallback) */}
                                    <div className="flex flex-wrap gap-4 p-2 bg-gray-50 rounded border border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-500">Fecha Global:</span>
                                            <input
                                                type="date"
                                                value={batchBroadcastDate}
                                                onChange={(e) => setBatchBroadcastDate(e.target.value)}
                                                className="h-7 text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-500">Hora Global:</span>
                                            <input
                                                type="time"
                                                value={batchBroadcastTime}
                                                onChange={(e) => setBatchBroadcastTime(e.target.value)}
                                                className="h-7 text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Pills Container */}
                                {selectedPendingIds.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {selectedPendingIds.map(id => {
                                            const item = verifications.find(v => v.id === id);
                                            if (!item) return null;
                                            const hasTime = !!batchItemTimes[id];
                                            const hasDate = !!batchItemDates[id];
                                            const isSet = hasTime || hasDate;
                                            const isActive = activeBatchItemId === id;
                                            
                                            return (
                                                <button
                                                    key={id}
                                                    onClick={() => setActiveBatchItemId(isActive ? null : id)}
                                                    className={`
                                                        px-2 py-1 rounded-full text-xs font-medium border transition-all flex items-center gap-1
                                                        ${isActive 
                                                            ? 'bg-blue-100 border-blue-500 text-blue-800 ring-1 ring-blue-500' 
                                                            : isSet 
                                                                ? 'bg-green-50 border-green-300 text-green-700' 
                                                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300'
                                                        }
                                                    `}
                                                >
                                                    <span className="truncate max-w-[100px]">{item.drive_file_name || 'Sin nombre'}</span>
                                                    {isSet && <CheckCircle className="w-3 h-3" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Active Item Time Editor */}
                                {activeBatchItemId && (
                                    <div className="flex flex-col gap-2 bg-blue-50 p-3 rounded text-sm animate-in fade-in slide-in-from-top-1 border border-blue-200">
                                        <div className="flex justify-between items-center">
                                            <span className="text-blue-900 font-medium truncate max-w-[200px]">
                                                {verifications.find(v => v.id === activeBatchItemId)?.drive_file_name}
                                            </span>
                                            <button 
                                                onClick={() => setActiveBatchItemId(null)}
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                <XCircle className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-xs text-blue-700">Fecha</label>
                                                <input
                                                    type="date"
                                                    value={batchItemDates[activeBatchItemId] || ''}
                                                    onChange={(e) => {
                                                        setBatchItemDates(prev => ({
                                                            ...prev,
                                                            [activeBatchItemId]: e.target.value
                                                        }));
                                                    }}
                                                    className="w-full h-8 text-sm border-blue-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <label className="text-xs text-blue-700">Hora</label>
                                                <input
                                                    type="time"
                                                    autoFocus
                                                    value={batchItemTimes[activeBatchItemId] || ''}
                                                    onChange={(e) => {
                                                        setBatchItemTimes(prev => ({
                                                            ...prev,
                                                            [activeBatchItemId]: e.target.value
                                                        }));
                                                    }}
                                                    className="w-full h-8 text-sm border-blue-300 rounded focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Phrase Input for Batch */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-blue-800">Frases a buscar en los audios seleccionados:</label>
                                {batchPhrases.map((phrase, index) => (
                                    <div key={index} className="flex gap-2 items-start">
                                        <div className="flex-grow">
                                            <PhraseSelector
                                                value={phrase.text}
                                                onChange={(val) => {
                                                    const newPhrases = [...batchPhrases];
                                                    newPhrases[index].text = val;
                                                    setBatchPhrases(newPhrases);
                                                }}
                                                onSaveChange={(save) => {
                                                    const newPhrases = [...batchPhrases];
                                                    newPhrases[index].save = save;
                                                    setBatchPhrases(newPhrases);
                                                }}
                                                savedPhrases={savedPhrases}
                                                placeholder="Ej: Publicidad X..."
                                            />
                                        </div>
                                        {batchPhrases.length > 1 && (
                                            <button 
                                                onClick={() => {
                                                    const newPhrases = batchPhrases.filter((_, i) => i !== index);
                                                    setBatchPhrases(newPhrases);
                                                }}
                                                className="text-red-500 hover:text-red-700 mt-2"
                                            >
                                                <XCircle className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={() => setBatchPhrases([...batchPhrases, { text: '', save: false }])}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> Agregar otra frase
                                </button>
                            </div>

                            {/* Selection Controls */}
                            <div className="flex flex-wrap gap-2 items-center justify-between border-t border-blue-200 pt-3">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const allPending = verifications.filter(v => v.status === 'pending').map(v => v.id);
                                            setSelectedPendingIds(allPending);
                                        }}
                                        className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
                                    >
                                        Seleccionar Todos
                                    </button>
                                    <button
                                        onClick={() => selectFirstPending(5)}
                                        className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
                                    >
                                        Seleccionar 5
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedPendingIds([]);
                                            setBatchItemTimes({});
                                            setActiveBatchItemId(null);
                                        }}
                                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                                    >
                                        Limpiar selección
                                    </button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-blue-900">
                                        {selectedPendingIds.length} seleccionados
                                    </span>
                                    <button
                                        onClick={handleBatchVerify}
                                        disabled={selectedPendingIds.length === 0 || isBatchProcessing || batchPhrases.every(p => !p.text.trim())}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isBatchProcessing ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Procesando ({batchProgress.current}/{batchProgress.total})
                                            </>
                                        ) : (
                                            <>
                                                Verificar Seleccionados
                                                <ChevronRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                            
                            {/* Progress Bar */}
                            {isBatchProcessing && (
                                <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
                                    <div 
                                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                    ></div>
                                </div>
                            )}
                        </div>

                        {/* List */}
                        <div className="grid gap-4">
                            {verifications.filter((v: any) => v.status === 'pending').map((v: any) => (
                                <div key={v.id} className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedPendingIds.includes(v.id)}
                                            onChange={() => toggleSelectPending(v.id)}
                                            className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                        />
                                    </div>
                                    <div className="pl-12">
                                        <PendingVerificationItem
                                            verification={v}
                                            savedPhrases={savedPhrases}
                                            onVerify={handlePendingVerify}
                                            processing={processing}
                                            processingId={processingId}
                                            progress={progress}
                                            progressMessage={progressMessage}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <div className="w-full">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">Resultados de Verificación</h2>
                        
                        {/* Super Admin Global Metrics */}
                        {userRole === 'super_admin' && selectedBatchFilter === 'all' && batches.length > 0 && (
                            <div className="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-lg flex flex-wrap gap-6 items-center shadow-sm">
                                <div className="font-semibold text-indigo-900 flex items-center gap-2 border-r border-indigo-200 pr-6 mr-2">
                                    <BarChart3 className="w-5 h-5" />
                                    <div>
                                        <div className="text-sm">Métricas Globales</div>
                                        <div className="text-xs font-normal opacity-80">Todos los lotes</div>
                                    </div>
                                </div>
                                <div className="flex gap-8 flex-wrap">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mb-0.5">Tiempo Real Total</span>
                                        <span className="text-xl font-bold text-indigo-900 flex items-baseline gap-1">
                                            {(batches.reduce((acc, b) => acc + (Number(b.total_duration_seconds) || 0), 0) / 60).toFixed(2)} 
                                            <span className="text-xs font-medium text-indigo-600">min</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider mb-0.5">Tiempo IA Total</span>
                                        <span className="text-xl font-bold text-green-900 flex items-baseline gap-1">
                                            {(batches.reduce((acc, b) => acc + (Number(b.total_processing_seconds) || 0), 0) / 60).toFixed(2)} 
                                            <span className="text-xs font-medium text-green-600">min</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-0.5">Costo Total</span>
                                        <span className="text-xl font-bold text-blue-900 flex items-baseline gap-1">
                                            ${batches.reduce((acc, b) => acc + (Number(b.estimated_cost) || 0), 0).toFixed(4)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedBatchFilter !== 'all' && batches.filter(b => b.id === selectedBatchFilter).map(batch => (
                            <div key={batch.id} className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md flex flex-wrap gap-4 text-sm items-center">
                                <div className="font-semibold text-blue-900 flex items-center gap-2">
                                    <RefreshCcw className="w-4 h-4" />
                                    {batch.name || 'Lote seleccionado'}
                                </div>
                                <div className="text-blue-700">
                                    Progreso: <span className="font-medium">{batch.processed_files} / {batch.total_files} audios</span>
                                </div>
                                {userRole === 'super_admin' && (
                                    <div className="flex gap-3 ml-auto sm:ml-0 items-center">
                                        <span className="bg-white text-blue-700 px-2 py-1 rounded border border-blue-200 font-medium shadow-sm" title="Tiempo total transcurrido (reloj)">
                                            ⌛ Real: {(Number(batch.total_duration_seconds || 0) / 60).toFixed(2)} min
                                        </span>
                                        <span className="bg-white text-green-700 px-2 py-1 rounded border border-green-200 font-medium shadow-sm" title="Tiempo de procesamiento de IA (costo)">
                                            🤖 IA: {(Number(batch.total_processing_seconds || 0) / 60).toFixed(2)} min
                                        </span>
                                        <span className="bg-white text-green-700 px-2 py-1 rounded border border-green-200 font-medium shadow-sm">
                                            💰 Costo: ${Number(batch.estimated_cost || 0).toFixed(4)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                        {selectedHistoryIds.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-sm text-blue-600 font-medium">{selectedHistoryIds.length} seleccionados</span>
                                <button
                                    onClick={() => {
                                        setShowReverifyModal(true);
                                        // Reset phrases when opening modal
                                        setReverifyPhrases([{ text: '', save: false }]);
                                    }}
                                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1"
                                >
                                    <RefreshCcw className="w-3 h-3" />
                                    Analizar Nuevas Frases
                                </button>
                                <button
                                    onClick={() => setSelectedHistoryIds([])}
                                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 items-center">
                         {/* Batch Filter */}
                        <select
                            value={selectedBatchFilter}
                            onChange={(e) => setSelectedBatchFilter(e.target.value)}
                            className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                        >
                            <option value="all">Todos los Lotes</option>
                            {batches.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.name || `Lote ${new Date(b.created_at).toLocaleDateString()}`} ({b.total_files} audios)
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={handleExport}
                            className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 hover:text-blue-600 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer transition-all"
                        >
                            <Download className="w-4 h-4" />
                            Exportar CSV
                        </button>
                    </div>
                </div>

                {(sortedGroups.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <p>No hay historial de verificaciones aún.</p>
                    </div>
                ) : (
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
                        <div key={group.key} className={`bg-white shadow sm:rounded-lg overflow-hidden border ${selectedHistoryIds.includes(group.items[0]?.id) ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-100'}`}>
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                {/* Selection Checkbox */}
                                <input
                                    type="checkbox"
                                    checked={selectedHistoryIds.includes(group.items[0]?.id)}
                                    onChange={(e) => {
                                        const id = group.items[0]?.id;
                                        if (!id) return;
                                        if (e.target.checked) {
                                            setSelectedHistoryIds(prev => [...prev, id]);
                                        } else {
                                            setSelectedHistoryIds(prev => prev.filter(i => i !== id));
                                        }
                                    }}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                />

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
                                    {userRole === 'super_admin' && group.items[0]?.processing_seconds > 0 && (
                                        <>
                                            <span className="text-xs text-gray-500 hidden sm:inline">-</span>
                                            <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                                                ⏱️ {(group.items[0].processing_seconds / 60).toFixed(2)} min 
                                                <span className="mx-1">|</span> 
                                                💰 ${ (group.items[0].processing_seconds * 0.00031).toFixed(4) }
                                            </span>
                                        </>
                                    )}
                                    
                                    {/* Broadcast Date/Time */}
                                    {(group.items[0]?.broadcast_date || group.items[0]?.broadcast_time) && (
                                        <>
                                            <span className="text-xs text-gray-500 hidden sm:inline">-</span>
                                            <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-medium">
                                                <Clock className="w-3 h-3" />
                                                <span>
                                                    {group.items[0].broadcast_date ? new Date(group.items[0].broadcast_date + 'T12:00:00').toLocaleDateString() : ''} 
                                                    {group.items[0].broadcast_date && group.items[0].broadcast_time ? ' • ' : ''}
                                                    {group.items[0].broadcast_time || ''}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {group.items[0]?.full_transcription && (
                                <div className="flex items-center">
                                    <button
                                        onClick={() => {
                                            setSelectedVerificationGroup(group);
                                            setReverifyPhrases([{ text: '', save: false }]);
                                            setReverifyModalOpen(true);
                                        }}
                                        className="text-gray-500 hover:text-green-600 transition-colors mr-2"
                                        title="Analizar nuevas frases en este audio"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
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
                                </div>
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
                ))}
            </div>
          )}
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

      {/* Reverify Modal (Multi-select) */}
      {showReverifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium">Analizar Nuevas Frases ({selectedHistoryIds.length} audios)</h3>
              <button 
                onClick={() => setShowReverifyModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">
                Agrega frases para buscar en los audios seleccionados. No se consumirán créditos de transcripción.
              </p>
              
              <div className="space-y-3 mb-4 max-h-[40vh] overflow-y-auto">
                {reverifyPhrases.map((phrase, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1">
                       <PhraseSelector
                            value={phrase.text}
                            onChange={(val) => {
                                const newPhrases = [...reverifyPhrases];
                                newPhrases[index].text = val;
                                setReverifyPhrases(newPhrases);
                            }}
                            onSaveChange={(save) => {
                                const newPhrases = [...reverifyPhrases];
                                newPhrases[index].save = save;
                                setReverifyPhrases(newPhrases);
                            }}
                            savedPhrases={savedPhrases}
                            placeholder="Frase a buscar..."
                        />
                    </div>
                    {reverifyPhrases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newPhrases = reverifyPhrases.filter((_, i) => i !== index);
                          setReverifyPhrases(newPhrases);
                        }}
                        className="text-red-500 hover:text-red-700 mt-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setReverifyPhrases([...reverifyPhrases, { text: '', save: false }])}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Agregar otra frase
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReverifyModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleHistoryReverify}
                  disabled={reverifying || reverifyPhrases.every(p => !p.text.trim())}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {reverifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  {reverifying ? 'Analizando...' : 'Analizar Frases'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single Item Reverify Modal (Legacy/Direct) - Keep for direct clicks on item */}
      {reverifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium">Analizar Nuevas Frases</h3>
              <button 
                onClick={() => setReverifyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleReverify} className="p-6">
              <p className="text-sm text-gray-500 mb-4">
                Agrega frases para buscar en este audio ya transcrito. No se consumirán créditos de transcripción.
              </p>
              
              <div className="space-y-3 mb-4 max-h-[40vh] overflow-y-auto">
                {reverifyPhrases.map((phrase, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={phrase.text}
                        onChange={(e) => {
                          const newPhrases = [...reverifyPhrases];
                          newPhrases[index].text = e.target.value;
                          setReverifyPhrases(newPhrases);
                        }}
                        placeholder="Frase a buscar..."
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                      />
                      <div className="flex items-center mt-1">
                        <input
                            id={`save-reverify-${index}`}
                            type="checkbox"
                            checked={phrase.save}
                            onChange={(e) => {
                                const newPhrases = [...reverifyPhrases];
                                newPhrases[index].save = e.target.checked;
                                setReverifyPhrases(newPhrases);
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`save-reverify-${index}`} className="ml-2 block text-xs text-gray-500">
                            Guardar para futuras búsquedas
                        </label>
                      </div>
                    </div>
                    {reverifyPhrases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newPhrases = reverifyPhrases.filter((_, i) => i !== index);
                          setReverifyPhrases(newPhrases);
                        }}
                        className="text-red-500 hover:text-red-700 p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setReverifyPhrases([...reverifyPhrases, { text: '', save: false }])}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Agregar otra frase
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReverifyModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={reverifying || reverifyPhrases.every(p => !p.text.trim())}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {reverifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  {reverifying ? 'Analizando...' : 'Analizar Frases'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
