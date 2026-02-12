
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { Loader2, ArrowLeft, BarChart3, Radio, CheckCircle, XCircle, Clock, Calendar, Download } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { SummaryAudioPlayer } from '@/components/SummaryAudioPlayer';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Legend } from 'recharts';

interface VerificationData {
  id: string;
  target_phrase: string;
  is_match: boolean;
  transcription: string;
  timestamp_start: string | number | null;
  timestamp_end: string | number | null;
  audio_path: string;
  radios?: { name: string };
  drive_folder_name?: string;
  broadcast_time?: string;
  broadcast_date?: string;
  created_at: string;
}

interface Summary {
  id: string;
  title: string;
  created_at: string;
  data: VerificationData[];
}

export default function SummaryDetailPage() {
  const params = useParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetchSummary(params.id as string);
    }
  }, [params.id]);

  const fetchSummary = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setSummary(data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseSeconds = (val: string | number | null): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const num = parseFloat(val);
        if (!isNaN(num) && val.indexOf(':') === -1) return num;
        
        const parts = val.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  if (!summary) return <div className="p-8">Reporte no encontrado.</div>;

  // Compute Stats
  const totalVerifications = summary.data.length;
  const matches = summary.data.filter(v => v.is_match).length;
  const matchRate = totalVerifications > 0 ? Math.round((matches / totalVerifications) * 100) : 0;
  
  // Count unique audios
  const totalAudios = new Set(summary.data.map(v => v.audio_path)).size;

  // Group by Radio -> Audio
  const groupedData: Record<string, Record<string, VerificationData[]>> = {};
  const radioStats: Record<string, { total: number; matches: number }> = {};

  summary.data.forEach(v => {
    const radioName = v.radios?.name || 'Radio Desconocida';
    const audioKey = v.audio_path;

    // Stats
    if (!radioStats[radioName]) radioStats[radioName] = { total: 0, matches: 0 };
    radioStats[radioName].total++;
    if (v.is_match) radioStats[radioName].matches++;

    // Grouping
    if (!groupedData[radioName]) groupedData[radioName] = {};
    if (!groupedData[radioName][audioKey]) groupedData[radioName][audioKey] = [];
    groupedData[radioName][audioKey].push(v);
  });

  // Prepare Scatter Chart Data (Matches over Time)
  const scatterData: any[] = [];
  const radiosSet = new Set<string>();

  summary.data.forEach(v => {
    if (v.is_match && v.broadcast_time) {
        const radioName = v.radios?.name || 'Radio Desconocida';
        radiosSet.add(radioName);
        
        // Parse time to minutes from midnight
        const parts = v.broadcast_time.split(':').map(Number);
        let minutes = 0;
        if (parts.length >= 2) {
            minutes = parts[0] * 60 + parts[1];
        }

        scatterData.push({
            phrase: v.target_phrase,
            time: minutes,
            timeLabel: v.broadcast_time,
            date: v.broadcast_date,
            radio: radioName,
            fullData: v
        });
    }
  });

  const radiosList = Array.from(radiosSet);
  const colors = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#9333ea', '#0891b2']; // Blue, Green, Red, Orange, Purple, Cyan

  const formatXAxis = (tick: number) => {
      const h = Math.floor(tick / 60);
      const m = tick % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-md text-sm">
          <p className="font-bold text-gray-900 mb-1">{data.phrase}</p>
          <div className="space-y-1 text-gray-600">
             <p className="flex items-center gap-1"><Radio className="w-3 h-3" /> {data.radio}</p>
             <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {data.date}</p>
             <p className="flex items-center gap-1"><Clock className="w-3 h-3" /> {data.timeLabel}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleExportExcel = () => {
    if (!summary) return;

    const rows = summary.data.map(item => {
        const radioName = item.radios?.name || 'Radio Desconocida';
        const startTime = parseSeconds(item.timestamp_start);
        
        return {
            'Radio': radioName,
            'Programa/Carpeta': item.drive_folder_name || 'N/A',
            'Archivo': item.audio_path.split('/').pop() || item.audio_path,
            'Fecha Emisión': item.broadcast_date || 'N/A',
            'Hora Emisión': item.broadcast_time || 'N/A',
            'Frase Buscada': item.target_phrase,
            'Coincidencia': item.is_match ? 'SÍ' : 'NO',
            'Transcripción': item.transcription,
            'Minuto Inicio': startTime ? new Date(startTime * 1000).toISOString().substr(14, 5) : '00:00',
            'Minuto Fin': parseSeconds(item.timestamp_end) ? new Date(parseSeconds(item.timestamp_end)! * 1000).toISOString().substr(14, 5) : '00:00'
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    
    // Set column widths
    const wscols = [
        { wch: 20 }, // Radio
        { wch: 20 }, // Programa
        { wch: 40 }, // Archivo
        { wch: 15 }, // Fecha
        { wch: 15 }, // Hora
        { wch: 30 }, // Frase
        { wch: 12 }, // Coincidencia
        { wch: 50 }, // Transcripción
        { wch: 15 }, // Minuto Inicio
        { wch: 15 }  // Minuto Fin
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `Reporte_${summary.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <Link href="/dashboard/client-summary" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{summary.title}</h1>
              <p className="text-sm text-gray-500">Generado el {new Date(summary.created_at).toLocaleDateString()}</p>
            </div>
        </div>
        
        <button 
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto"
        >
            <Download className="w-4 h-4" />
            Exportar Excel
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 font-medium uppercase">Total Audios</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{totalAudios}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 font-medium uppercase">Coincidencias</div>
          <div className="mt-2 text-3xl font-bold text-green-600">{matches}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 font-medium uppercase">Efectividad</div>
          <div className="mt-2 text-3xl font-bold text-blue-600">{matchRate}%</div>
        </div>
      </div>

      {/* Timeline Chart */}
      {scatterData.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Línea de Tiempo de Coincidencias</h2>
            </div>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 20, left: 100 }} // Left margin for phrase labels
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    type="number" 
                    dataKey="time" 
                    name="Hora" 
                    domain={[0, 1440]} // 0 to 24h
                    tickFormatter={formatXAxis} 
                    unit="" 
                  />
                  <YAxis 
                    type="category" 
                    dataKey="phrase" 
                    name="Frase" 
                    width={100}
                    tick={{fontSize: 12}}
                  />
                  <ZAxis type="number" range={[100, 100]} />
                  <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                  <Legend />
                  {radiosList.map((radio, index) => (
                      <Scatter 
                        key={radio} 
                        name={radio} 
                        data={scatterData.filter(d => d.radio === radio)} 
                        fill={colors[index % colors.length]} 
                        shape="circle"
                      />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-gray-400 mt-2">Distribución de coincidencias por hora del día</p>
          </div>
      )}

      {/* Radio Chart (Simple Bars) */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Rendimiento por Radio</h2>
        </div>
        <div className="space-y-4">
          {Object.entries(radioStats).map(([name, stats]) => {
            const percentage = stats.total > 0 ? (stats.matches / stats.total) * 100 : 0;
            return (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{name}</span>
                  <span className="text-gray-500">{stats.matches}/{stats.total} Coincidencias</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed List Grouped by Radio -> Audio */}
      <div className="space-y-8">
        <h2 className="text-xl font-bold text-gray-900">Detalle de Verificaciones</h2>
        
        {Object.entries(groupedData).map(([radioName, audioGroups]) => (
          <div key={radioName} className="space-y-4">
            <h3 className="text-lg font-semibold text-blue-700 flex items-center gap-2">
              <Radio className="w-5 h-5" />
              {radioName}
            </h3>
            
            <div className="grid gap-6">
              {Object.entries(audioGroups).map(([audioPath, items]) => {
                // Get metadata from the first item (all items in this group share audio/folder)
                const firstItem = items[0];
                const fileName = audioPath.split('/').pop() || 'Audio sin nombre';
                const folderName = firstItem.drive_folder_name || 'Carpeta Principal';
                const hasMatch = items.some(i => i.is_match);

                return (
                  <div key={audioPath} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    {/* Audio Card Header */}
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-gray-900">{fileName}</h4>
                        <div className="text-xs text-gray-500 flex flex-wrap items-center gap-2 mt-1">
                           <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">{folderName}</span>
                           
                           {/* Broadcast Info */}
                           {(firstItem.broadcast_date || firstItem.broadcast_time) && (
                               <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1 font-medium">
                                   📅 {firstItem.broadcast_date ? new Date(firstItem.broadcast_date + 'T12:00:00').toLocaleDateString() : ''} 
                                   {firstItem.broadcast_date && firstItem.broadcast_time ? ' • ' : ''}
                                   {firstItem.broadcast_time || ''}
                               </span>
                           )}
                           
                           <span className="text-gray-400">| Subido: {new Date(firstItem.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      
                      {/* Full Audio Player */}
                      <div className="w-full md:w-auto md:min-w-[300px]">
                        <SummaryAudioPlayer audioPath={audioPath} />
                      </div>
                    </div>

                    {/* Verifications List */}
                    <div className="divide-y divide-gray-100">
                      {items.map((item, idx) => (
                        <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                           <div className="flex-1">
                             <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-700">Frase:</span>
                                <span className="text-sm font-bold text-gray-900">"{item.target_phrase}"</span>
                             </div>
                             
                             {item.is_match ? (
                               <div className="text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-md inline-block border border-green-100">
                                 "{item.transcription}"
                                 <span className="block text-xs text-green-600 mt-1 font-mono">
                                    Minuto: {parseSeconds(item.timestamp_start) ? new Date(parseSeconds(item.timestamp_start)! * 1000).toISOString().substr(14, 5) : '00:00'}
                                 </span>
                               </div>
                             ) : (
                               <span className="text-xs text-gray-400 italic">No se encontraron coincidencias</span>
                             )}
                           </div>

                           <div className="flex-shrink-0 flex flex-col items-end gap-2">
                               {item.is_match ? (
                                 <>
                                   <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                                     <CheckCircle className="w-4 h-4" />
                                     <span>Encontrado</span>
                                   </div>
                                   <div className="w-[200px]">
                                      <SummaryAudioPlayer 
                                        audioPath={item.audio_path} 
                                        startSeconds={parseSeconds(item.timestamp_start) !== null ? Math.max(0, parseSeconds(item.timestamp_start)! - 3) : null} 
                                        endSeconds={parseSeconds(item.timestamp_end) !== null ? parseSeconds(item.timestamp_end)! + 3 : null} 
                                      />
                                   </div>
                                 </>
                               ) : (
                                 <div className="flex items-center gap-1 text-gray-400 text-sm">
                                   <XCircle className="w-4 h-4" />
                                   <span>No encontrado</span>
                                 </div>
                               )}
                            </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
