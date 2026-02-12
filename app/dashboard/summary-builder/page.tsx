
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, FileText, Check, Search, Calendar, Play } from 'lucide-react';
import { toast } from 'sonner';
import { SummaryAudioPlayer } from '@/components/SummaryAudioPlayer';

const parseTime = (timeStr: string | null) => {
  if (!timeStr) return null;
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

interface Verification {
  id: string;
  target_phrase: string;
  is_match: boolean;
  timestamp_start: string | null;
  timestamp_end: string | null;
  created_at: string;
  radio: { name: string; drive_folder_id?: string } | null;
  audio_path: string;
  drive_folder_name: string | null;
  drive_parent_folder_id: string | null;
  batch_id: string | null;
  batch_jobs: { name: string } | null;
  broadcast_time?: string;
  broadcast_date?: string;
}

export default function SummaryBuilderPage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [groupedVerifications, setGroupedVerifications] = useState<{
    id: string;
    radioName: string;
    folderName: string;
    audioPath: string;
    items: Verification[];
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  
  // Filters State
  const [radioFilter, setRadioFilter] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  
  // Unique values for filters
  const [uniqueRadios, setUniqueRadios] = useState<string[]>([]);
  const [uniqueFolders, setUniqueFolders] = useState<string[]>([]);
  const [uniqueBatches, setUniqueBatches] = useState<string[]>([]);

  // Map for resolved folder names (id -> name)
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});

  // Form State
  const [title, setTitle] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Client Management State
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new');
  const [existingClients, setExistingClients] = useState<{id: string, email: string}[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  
  // Audio Playback Settings
  const [audioPadding, setAudioPadding] = useState(5); // Default 5s padding

  useEffect(() => {
    fetchVerifications();
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('role', 'client')
        .order('email');
      
      if (!error && data) {
        setExistingClients(data);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  // Fetch Subfolders when Radio Filter changes
  useEffect(() => {
    const fetchSubfolders = async () => {
      if (!radioFilter) {
        setFolderMap({});
        return;
      }
      
      const radio = verifications.find(v => v.radio?.name === radioFilter)?.radio;
      if (!radio?.drive_folder_id) return;

      try {
        // Use the existing API that Radio Dashboard uses
        const res = await fetch('/api/folders/list', {
          method: 'POST',
          headers: {
             'Authorization': (await supabase.auth.getSession()).data.session?.access_token || ''
          },
          body: JSON.stringify({ folderId: radio.drive_folder_id })
        });
        
        const data = await res.json();
        if (data.success && Array.isArray(data.folders)) {
          const map: Record<string, string> = {};
          data.folders.forEach((f: any) => {
            map[f.id] = f.name;
          });
          setFolderMap(map);
        }
      } catch (error) {
        console.error('Error fetching subfolders:', error);
      }
    };

    if (verifications.length > 0) {
      fetchSubfolders();
    }
  }, [radioFilter, verifications]);

  // Update Unique Filters when dependencies change
  useEffect(() => {
    if (verifications.length === 0) return;

    // 1. Radios (Always all available)
    const radios = Array.from(new Set(verifications.map(v => v.radio?.name || 'Radio Desconocida'))).sort();
    setUniqueRadios(radios);

    // 2. Filter data context for cascading dropdowns
    const relevantData = radioFilter 
      ? verifications.filter(v => (v.radio?.name || 'Radio Desconocida') === radioFilter)
      : verifications;

    // 3. Folders
    const folders = Array.from(new Set(relevantData.map(v => {
      // Priority: 1. Cached Name, 2. Resolved Name from Map, 3. Default
      return v.drive_folder_name || (v.drive_parent_folder_id ? folderMap[v.drive_parent_folder_id] : undefined) || 'Carpeta Principal';
    }))).sort();
    setUniqueFolders(folders);

    // 4. Batches
    const batches = Array.from(new Set(relevantData.map(v => {
      return v.batch_jobs?.name || 'Sin Lote';
    }))).sort();
    setUniqueBatches(batches);

  }, [verifications, radioFilter, folderMap]);

  useEffect(() => {
    applyFilters();
  }, [verifications, radioFilter, folderFilter, batchFilter, folderMap]);

  const fetchVerifications = async () => {
    try {
      const { data, error } = await supabase
        .from('verifications')
        .select(`
          id, target_phrase, is_match, timestamp_start, timestamp_end, created_at, audio_path,
          drive_folder_name, drive_parent_folder_id, batch_id, broadcast_time, broadcast_date,
          radios (name, drive_folder_id),
          batch_jobs (name)
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const flatData: Verification[] = (data || []).map((v: any) => ({
        ...v,
        radio: v.radios,
        batch_jobs: v.batch_jobs // Flattened by join
      }));

      setVerifications(flatData);

    } catch (error: any) {
      console.error('Error fetching verifications:', error);
      toast.error('Error al cargar verificaciones');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = verifications;

    if (radioFilter) {
      filtered = filtered.filter(v => (v.radio?.name || 'Radio Desconocida') === radioFilter);
    }
    if (folderFilter) {
      filtered = filtered.filter(v => {
        const name = v.drive_folder_name || (v.drive_parent_folder_id ? folderMap[v.drive_parent_folder_id] : undefined) || 'Carpeta Principal';
        return name === folderFilter;
      });
    }
    if (batchFilter) {
      filtered = filtered.filter(v => (v.batch_jobs?.name || 'Sin Lote') === batchFilter);
    }

    const groups: Record<string, { id: string; radioName: string; folderName: string; audioPath: string; items: Verification[] }> = {};
    
    filtered.forEach((v: Verification) => {
      const radioName = v.radio?.name || 'Radio Desconocida';
      const folderName = v.drive_folder_name || (v.drive_parent_folder_id ? folderMap[v.drive_parent_folder_id] : undefined) || 'Carpeta Principal';
      const key = `${radioName}-${folderName}-${v.audio_path}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: key,
          radioName,
          folderName,
          audioPath: v.audio_path,
          items: []
        };
      }
      groups[key].items.push(v);
    });

    setGroupedVerifications(Object.values(groups));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleGroupSelection = (groupItems: Verification[]) => {
    const groupIds = groupItems.map(v => v.id);
    const allSelected = groupIds.every(id => selectedIds.includes(id));
    
    if (allSelected) {
      // Deselect all
      setSelectedIds(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      // Select all (merge unique)
      setSelectedIds(prev => [...new Set([...prev, ...groupIds])]);
    }
  };

  const handleCreateSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      toast.error('Selecciona al menos una verificación');
      return;
    }
    setCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No sesión');

      const response = await fetch('/api/admin/summaries/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          title,
          clientEmail,
          clientPassword,
          verificationIds: selectedIds
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al crear resumen');

      toast.success('Resumen creado y asignado al cliente');
      setShowModal(false);
      setSelectedIds([]);
      setTitle('');
      setClientEmail('');
      setClientPassword('');
      
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Constructor de Resúmenes</h1>
          <p className="text-sm text-gray-500">Selecciona audios verificados para generar un reporte para clientes.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={selectedIds.length === 0}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <FileText className="mr-2 h-4 w-4" />
          Generar Resumen ({selectedIds.length})
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Search className="w-4 h-4" /> Filtros
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Radio</label>
            <select
              value={radioFilter}
              onChange={(e) => setRadioFilter(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Todas las Radios</option>
              {uniqueRadios.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subcarpeta</label>
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Todas las Carpetas</option>
              {uniqueFolders.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Lote (Batch)</label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Todos los Lotes</option>
              {uniqueBatches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="bg-gray-50 p-2 rounded border border-gray-100">
             <label className="block text-xs font-medium text-gray-500 mb-1">Holgura de audio: {audioPadding}s</label>
             <input 
               type="range" 
               min="1" 
               max="15" 
               value={audioPadding} 
               onChange={(e) => setAudioPadding(Number(e.target.value))}
               className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
             />
             <div className="flex justify-between text-[10px] text-gray-400">
               <span>1s</span>
               <span>5s</span>
               <span>15s</span>
             </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {groupedVerifications.map((group) => {
          const groupIds = group.items.map(v => v.id);
          const isGroupSelected = groupIds.every(id => selectedIds.includes(id));
          const isGroupPartiallySelected = groupIds.some(id => selectedIds.includes(id)) && !isGroupSelected;

          return (
            <div key={group.id} className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <input 
                    type="checkbox"
                    checked={isGroupSelected}
                    ref={input => {
                      if (input) input.indeterminate = isGroupPartiallySelected;
                    }}
                    onChange={() => toggleGroupSelection(group.items)}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                      {group.radioName}
                      <span className="text-gray-400">/</span>
                      <span className="text-base font-normal text-gray-700">{group.folderName}</span>
                    </h3>
                    <p className="text-sm text-gray-500 flex flex-wrap items-center gap-2 mt-1">
                       <span className="font-mono bg-gray-200 px-1 rounded text-xs">AUDIO</span>
                       {group.audioPath.split('/').pop()}
                       
                       {(group.items[0]?.broadcast_date || group.items[0]?.broadcast_time) && (
                           <span className="ml-2 bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1 font-medium text-xs">
                               📅 {group.items[0].broadcast_date ? new Date(group.items[0].broadcast_date + 'T12:00:00').toLocaleDateString() : ''} 
                               {group.items[0].broadcast_date && group.items[0].broadcast_time ? ' • ' : ''}
                               {group.items[0].broadcast_time || ''}
                           </span>
                       )}
                    </p>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {group.items.length} frases analizadas
                </div>
              </div>

              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                      
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frase Buscada</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resultado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fragmento</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {group.items.map((v) => (
                    <tr key={v.id} className={selectedIds.includes(v.id) ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(v.id)}
                          onChange={() => toggleSelection(v.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{v.target_phrase}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {v.is_match ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            <Check className="mr-1 h-3 w-3" /> Coincidencia
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                            No encontrado
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {v.is_match && v.timestamp_start ? (
                          <SummaryAudioPlayer 
                            audioPath={v.audio_path} 
                            startSeconds={parseTime(v.timestamp_start) !== null ? Math.max(0, parseTime(v.timestamp_start)! - audioPadding) : null}
                            endSeconds={parseTime(v.timestamp_end) !== null ? parseTime(v.timestamp_end)! + audioPadding : null}
                          />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(v.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Configurar Resumen</h2>
            <form onSubmit={handleCreateSummary} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Título del Reporte</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Reporte Campaña Marzo"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Asignar a Cliente</h3>
                
                {/* Mode Selection */}
                <div className="flex rounded-md shadow-sm mb-4" role="group">
                  <button
                    type="button"
                    onClick={() => {
                        setClientMode('new');
                        setClientEmail('');
                        setClientPassword('');
                        setSelectedClientId('');
                    }}
                    className={`px-4 py-2 text-sm font-medium border rounded-l-lg flex-1 ${
                        clientMode === 'new' 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Nuevo Cliente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                        setClientMode('existing');
                        setClientEmail('');
                        setClientPassword('');
                        setSelectedClientId('');
                    }}
                    className={`px-4 py-2 text-sm font-medium border rounded-r-lg flex-1 ${
                        clientMode === 'existing' 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Cliente Existente
                  </button>
                </div>

                <div className="space-y-3">
                  {clientMode === 'existing' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Seleccionar Cliente</label>
                        <select
                            required={clientMode === 'existing'}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                            value={selectedClientId}
                            onChange={(e) => {
                                const id = e.target.value;
                                setSelectedClientId(id);
                                const client = existingClients.find(c => c.id === id);
                                if (client) setClientEmail(client.email);
                            }}
                        >
                            <option value="">-- Seleccionar --</option>
                            {existingClients.map(client => (
                                <option key={client.id} value={client.id}>
                                    {client.email}
                                </option>
                            ))}
                        </select>
                        {selectedClientId && (
                            <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Cliente seleccionado: {clientEmail}
                            </p>
                        )}
                      </div>
                  ) : (
                      <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email Cliente</label>
                            <input
                            type="email"
                            required={clientMode === 'new'}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                            value={clientEmail}
                            onChange={e => {
                                const email = e.target.value;
                                setClientEmail(email);
                                // Check if exists
                                const exists = existingClients.find(c => c.email.toLowerCase() === email.toLowerCase());
                                if (exists) {
                                    // Show warning is handled in render below
                                }
                            }}
                            />
                            {/* Warning if email exists */}
                            {existingClients.some(c => c.email.toLowerCase() === clientEmail.toLowerCase()) && clientEmail && (
                                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800 flex items-start gap-2">
                                    <span className="mt-0.5">⚠️</span>
                                    <div>
                                        <p className="font-medium">Este correo ya está registrado.</p>
                                        <button 
                                            type="button"
                                            className="text-blue-600 underline mt-1 hover:text-blue-800"
                                            onClick={() => {
                                                const client = existingClients.find(c => c.email.toLowerCase() === clientEmail.toLowerCase());
                                                if (client) {
                                                    setClientMode('existing');
                                                    setSelectedClientId(client.id);
                                                    setClientEmail(client.email);
                                                    setClientPassword('');
                                                }
                                            }}
                                        >
                                            Seleccionar cliente existente
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Contraseña (para el cliente)</label>
                            <input
                            type="password"
                            required={clientMode === 'new'}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                            value={clientPassword}
                            onChange={e => setClientPassword(e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-1">Se creará una nueva cuenta para este cliente.</p>
                        </div>
                      </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear y Compartir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
