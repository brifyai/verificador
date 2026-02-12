
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { Loader2, ArrowLeft, BarChart3, Radio, CheckCircle, XCircle, Clock, Calendar, Download, FileText } from 'lucide-react';
import Link from 'next/link';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toPng } from 'html-to-image';
import { SummaryAudioPlayer } from '@/components/SummaryAudioPlayer';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Legend, PieChart, Pie, Cell } from 'recharts';

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
  const [audioPadding, setAudioPadding] = useState(5); // Default 5s padding
  const [isExporting, setIsExporting] = useState(false); // To handle PDF export visibility

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

  // Prepare Nested Pie Chart Data
  // Inner Ring: Radio Stats
  const innerData = Object.entries(radioStats).map(([name, stats]) => ({
    name,
    value: stats.matches
  })).sort((a, b) => b.value - a.value); // Sort by value to align

  // Outer Ring: Phrase Stats per Radio
  const outerData: any[] = [];
  innerData.forEach((radioItem, index) => {
    // Get all matches for this radio
    const radioMatches = summary.data.filter(v => v.is_match && (v.radios?.name || 'Radio Desconocida') === radioItem.name);
    
    // Group by phrase
    const phraseCounts: Record<string, number> = {};
    const phraseTimes: Record<string, string[]> = {}; // Store times for tooltip

    radioMatches.forEach(v => {
        const phrase = v.target_phrase;
        phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
        if (v.broadcast_time) {
            if (!phraseTimes[phrase]) phraseTimes[phrase] = [];
            phraseTimes[phrase].push(v.broadcast_time);
        }
    });

    // Add to outer data
    Object.entries(phraseCounts).forEach(([phrase, count]) => {
        outerData.push({
            name: phrase,
            value: count,
            radio: radioItem.name,
            times: phraseTimes[phrase]?.sort() || [],
            color: colors[index % colors.length] // Inherit color
        });
    });
  });

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
          <p className="font-bold text-gray-900 mb-1">{data.phrase || data.name}</p>
          <div className="space-y-1 text-gray-600">
             {data.radio && <p className="flex items-center gap-1"><Radio className="w-3 h-3" /> {data.radio}</p>}
             {data.date && <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {data.date}</p>}
             {data.timeLabel && <p className="flex items-center gap-1"><Clock className="w-3 h-3" /> {data.timeLabel}</p>}
             
             {/* For Pie Chart Data */}
             {data.times && (
                 <div className="mt-2 border-t pt-2">
                     <p className="text-xs font-semibold text-gray-500 mb-1">Horarios:</p>
                     <div className="flex flex-wrap gap-1">
                        {data.times.map((t: string, i: number) => (
                            <span key={i} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">{t}</span>
                        ))}
                     </div>
                 </div>
             )}
          </div>
        </div>
      );
    }
    return null;
  };

  const handleExportPDF = async () => {
    const printPage1 = document.getElementById('print-page-1');
    const printPage2 = document.getElementById('print-page-2');
    
    if (!printPage1 || !printPage2 || !summary) return;
    
    setIsExporting(true);
    // Wait for render cycle
    await new Promise(resolve => setTimeout(resolve, 2000));

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    try {
        // --- Page 1: Timeline & KPIs ---
        const dataUrl1 = await toPng(printPage1, { 
            pixelRatio: 2,
            backgroundColor: '#ffffff',
            width: 794,
            height: 1123,
            style: {
                visibility: 'visible',
                position: 'fixed',
                zIndex: '9999',
                left: '0',
                top: '0',
                transform: 'none'
            }
        });
        
        // Calculate dimensions to fit width (keeping aspect ratio)
        const imgProps1 = (pdf as any).getImageProperties(dataUrl1);
        const pdfImgHeight1 = (imgProps1.height * pdfWidth) / imgProps1.width;
        pdf.addImage(dataUrl1, 'PNG', 0, 0, pdfWidth, pdfImgHeight1);

        // --- Page 2: Distribution & Performance ---
        pdf.addPage();
        const dataUrl2 = await toPng(printPage2, { 
            pixelRatio: 2,
            backgroundColor: '#ffffff',
            width: 794,
            height: 1123,
            style: {
                visibility: 'visible',
                position: 'fixed',
                zIndex: '9999',
                left: '0',
                top: '0',
                transform: 'none'
            }
        });

        const imgProps2 = (pdf as any).getImageProperties(dataUrl2);
        const pdfImgHeight2 = (imgProps2.height * pdfWidth) / imgProps2.width;
        pdf.addImage(dataUrl2, 'PNG', 0, 0, pdfWidth, pdfImgHeight2);
        
        // --- Page 3+: Data Table ---
        const tableRows: any[] = [];
        Object.entries(groupedData).forEach(([radioName, audioGroups]) => {
            Object.entries(audioGroups).forEach(([audioPath, items]) => {
                items.filter(i => i.is_match).forEach(item => {
                    tableRows.push([
                        radioName,
                        item.broadcast_date || 'N/A',
                        item.broadcast_time || 'N/A',
                        item.target_phrase,
                        item.transcription,
                        parseSeconds(item.timestamp_start) ? new Date(parseSeconds(item.timestamp_start)! * 1000).toISOString().substr(14, 5) : '00:00'
                    ]);
                });
            });
        });

        if (tableRows.length > 0) {
                    pdf.addPage();
                    autoTable(pdf, {
                        head: [['Radio', 'Fecha', 'Hora', 'Frase Buscada', 'Transcripción', 'Minuto']],
                        body: tableRows,
                        startY: 30,
                        margin: { top: 30 },
                        styles: { fontSize: 8 },
                        headStyles: { fillColor: [22, 163, 74] },
                        columnStyles: {
                            0: { cellWidth: 25 },
                            1: { cellWidth: 20 },
                            2: { cellWidth: 15 },
                            3: { cellWidth: 35 },
                            4: { cellWidth: 'auto' },
                            5: { cellWidth: 15 }
                        },
                        didDrawPage: (data) => {
                            pdf.setFontSize(14);
                            pdf.setTextColor(40);
                            pdf.text("Detalle de Coincidencias", data.settings.margin.left, 20);
                        }
                    });
                }

        pdf.save(`Reporte_${summary.title.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
        console.error("Error generating PDF:", err);
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!summary) return;
    setIsExporting(true);

    try {
        // Wait for DOM to render hidden elements
        await new Promise(resolve => setTimeout(resolve, 1000));

        const printPage1 = document.getElementById('print-page-1');
        const printPage2 = document.getElementById('print-page-2');

        if (!printPage1 || !printPage2) {
            console.error("Export elements not found");
            return;
        }

        // Capture images
        const dataUrl1 = await toPng(printPage1, { pixelRatio: 2, backgroundColor: '#ffffff' });
        const dataUrl2 = await toPng(printPage2, { pixelRatio: 2, backgroundColor: '#ffffff' });

        // Create Workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Verificador de Medios';
        workbook.created = new Date();

        // --- Sheet 1: Resumen (Dashboard) ---
        const sheetDash = workbook.addWorksheet('Resumen');

        // Title
        sheetDash.mergeCells('A1:F2');
        const titleCell = sheetDash.getCell('A1');
        titleCell.value = `Reporte: ${summary.title}`;
        titleCell.font = { name: 'Arial', size: 16, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // Metrics Header
        sheetDash.getCell('A4').value = "Métricas Generales";
        sheetDash.getCell('A4').font = { bold: true, size: 12 };

        // Metrics Data
        sheetDash.getCell('A5').value = "Total Audios";
        sheetDash.getCell('B5').value = totalAudios;
        
        sheetDash.getCell('C5').value = "Coincidencias";
        sheetDash.getCell('D5').value = matches;
        
        sheetDash.getCell('E5').value = "Efectividad";
        sheetDash.getCell('F5').value = `${matchRate}%`;

        // Style Metrics
        ['A5', 'C5', 'E5'].forEach(cell => {
            const c = sheetDash.getCell(cell);
            c.font = { bold: true };
            c.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
            c.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        ['B5', 'D5', 'F5'].forEach(cell => {
             const c = sheetDash.getCell(cell);
             c.alignment = { horizontal: 'center' };
             c.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Add Images
        const imageId1 = workbook.addImage({
            base64: dataUrl1.split(',')[1],
            extension: 'png',
        });

        const imageId2 = workbook.addImage({
            base64: dataUrl2.split(',')[1],
            extension: 'png',
        });

        // Embed Page 1 Image (Timeline + Stats)
        sheetDash.addImage(imageId1, {
            tl: { col: 0, row: 7 }, // Start at A8
            ext: { width: 794, height: 1123 } // A4 proportions approx
        });

        // Embed Page 2 Image (Pie Chart + Legend)
        // Calculate row offset based on image height (approx 20px per row -> 1123/20 = 56 rows)
        sheetDash.addImage(imageId2, {
            tl: { col: 0, row: 65 }, 
            ext: { width: 794, height: 1123 }
        });

        // --- Sheet 2: Detalle de Coincidencias ---
        const sheetData = workbook.addWorksheet('Detalle de Coincidencias');
        
        // Headers
        sheetData.columns = [
            { header: 'Radio', key: 'radio', width: 25 },
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Hora', key: 'time', width: 15 },
            { header: 'Frase Buscada', key: 'phrase', width: 35 },
            { header: 'Transcripción', key: 'transcription', width: 60 },
            { header: 'Minuto', key: 'minute', width: 15 },
        ];

        // Style Header
        const headerRow = sheetData.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF16A34A' } // Green-600
        };
        headerRow.commit();

        // Data Rows
        Object.entries(groupedData).forEach(([radioName, audioGroups]) => {
            Object.entries(audioGroups).forEach(([audioPath, items]) => {
                items.filter(i => i.is_match).forEach(item => {
                    const startTime = parseSeconds(item.timestamp_start);
                    sheetData.addRow({
                        radio: radioName,
                        date: item.broadcast_date || 'N/A',
                        time: item.broadcast_time || 'N/A',
                        phrase: item.target_phrase,
                        transcription: item.transcription,
                        minute: startTime ? new Date(startTime * 1000).toISOString().substr(14, 5) : '00:00'
                    });
                });
            });
        });

        // Save
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Reporte_${summary.title.replace(/\s+/g, '_')}.xlsx`);

    } catch (error) {
        console.error("Error exporting Excel:", error);
    } finally {
        setIsExporting(false);
    }
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
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button 
                onClick={handleExportPDF}
                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto"
            >
                <FileText className="w-4 h-4" />
                Exportar PDF
            </button>
            <button 
                onClick={handleExportExcel}
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto"
            >
                <Download className="w-4 h-4" />
                Exportar Excel
            </button>
        </div>
      </div>

      <div id="dashboard-metrics" className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 font-medium uppercase">Total Audios</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{totalAudios}</div>
          
          <div className="mt-6 pt-4 border-t border-gray-100">
            <label className="block text-xs font-medium text-gray-500 mb-2">Holgura de audio: {audioPadding}s</label>
            <input 
              type="range" 
              min="1" 
              max="5" 
              value={audioPadding} 
              onChange={(e) => setAudioPadding(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>1s</span>
              <span>3s</span>
              <span>5s</span>
            </div>
          </div>
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

      {/* Pie Chart - Full Width */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 w-full flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">%</div>
            Distribución por Radio y Frases
        </h2>
        <div className="w-full h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    {/* Inner Pie: Radios */}
                    <Pie
                        data={innerData}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        label={({ percent }: { percent?: number }) => `${((percent || 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                    >
                        {innerData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                        ))}
                    </Pie>
                    
                    {/* Outer Pie: Phrases */}
                    <Pie
                        data={outerData}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={110}
                        outerRadius={160}
                        fill="#82ca9d"
                        label={({ name }) => name.length > 20 ? name.substring(0, 20) + '...' : name}
                    >
                        {outerData.map((entry, index) => (
                            <Cell key={`cell-outer-${index}`} fill={entry.color} fillOpacity={0.6} stroke="#fff" />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend payload={
                        innerData.map((item, index) => ({
                            id: item.name,
                            type: 'square',
                            value: `${item.name}`,
                            color: colors[index % colors.length]
                        }))
                    } />
                </PieChart>
            </ResponsiveContainer>
        </div>
        <div className="flex gap-4 text-xs text-gray-500 mt-2 bg-gray-50 px-4 py-2 rounded-full">
             <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                Anillo interno: Radios
             </span>
             <span className="text-gray-300">|</span>
             <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-400 opacity-60"></div>
                Anillo externo: Frases
             </span>
        </div>
      </div>

      {/* Radio Chart (Simple Bars) - Below Pie Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-8">
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

      </div>

      {/* Detailed List Grouped by Radio -> Audio */}`
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
                                        startSeconds={parseSeconds(item.timestamp_start) !== null ? Math.max(0, parseSeconds(item.timestamp_start)! - audioPadding) : null} 
                                        endSeconds={parseSeconds(item.timestamp_end) !== null ? parseSeconds(item.timestamp_end)! + audioPadding : null} 
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
      {/* Hidden Print Template - Page 1: Header, KPIs, Timeline */}
      <div 
        id="print-page-1" 
        style={{ 
            position: 'fixed', 
            top: 0, 
            left: isExporting ? 0 : '-9999px', 
            width: '794px', 
            minHeight: '1123px',
            backgroundColor: 'white', 
            padding: '40px', 
            fontFamily: 'Arial, sans-serif',
            zIndex: isExporting ? 9999 : -1,
            visibility: isExporting ? 'visible' : 'hidden'
        }}
      >
          {/* Header */}
          <div className="flex justify-between items-center mb-8 border-b pb-4">
              <div>
                  <h1 className="text-2xl font-bold text-gray-900">{summary.title}</h1>
                  <p className="text-sm text-gray-500">Reporte de Verificación • Generado el {new Date().toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                  <div className="text-3xl font-bold text-blue-600">{matchRate}%</div>
                  <div className="text-xs text-gray-500 uppercase">Efectividad Global</div>
              </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-50 p-4 rounded border border-gray-200 text-center">
                  <div className="text-xs text-gray-500 uppercase mb-1">Total Audios</div>
                  <div className="text-2xl font-bold text-gray-900">{totalAudios}</div>
              </div>
              <div className="bg-green-50 p-4 rounded border border-green-200 text-center">
                  <div className="text-xs text-green-700 uppercase mb-1">Coincidencias</div>
                  <div className="text-2xl font-bold text-green-700">{matches}</div>
              </div>
              <div className="bg-blue-50 p-4 rounded border border-blue-200 text-center">
                  <div className="text-xs text-blue-700 uppercase mb-1">Verificaciones</div>
                  <div className="text-2xl font-bold text-blue-700">{totalVerifications}</div>
              </div>
          </div>

          {/* Timeline Chart - Custom HTML/CSS Implementation for reliable PDF export */}
          <div className="border border-gray-200 rounded p-4 mb-8 w-full max-w-[750px] mx-auto bg-white">
              <h3 className="text-lg font-bold text-gray-800 mb-6 text-center">Línea de Tiempo de Coincidencias</h3>
              
              {/* Flex Container for Labels + Chart */}
              <div className="flex h-[350px] mb-8 relative">
                  {/* Dynamic Calculation */}
                  {(() => {
                      const times = scatterData.map(d => d.time);
                      const minTime = times.length > 0 ? Math.min(...times) : 0;
                      const maxTime = times.length > 0 ? Math.max(...times) : 1440;
                      
                      const startHour = Math.max(0, Math.floor(minTime / 60) - 1);
                      const endHour = Math.min(24, Math.ceil(maxTime / 60) + 1);
                      
                      const startTime = startHour * 60;
                      const endTime = endHour * 60;
                      const totalDuration = endTime - startTime || 1440;
                      const phrasesList = Array.from(new Set(scatterData.map(d => d.phrase))).sort();

                      return (
                        <>
                          {/* Left Column: Y-Axis Labels */}
                          <div className="w-[220px] h-full border-r border-gray-300 relative flex-shrink-0">
                              {phrasesList.map((phrase, index) => {
                                  const topPos = ((index + 0.5) / phrasesList.length) * 100;
                                  return (
                                      <div 
                                          key={phrase} 
                                          className="absolute w-full px-2 text-[10px] font-bold text-gray-600 text-right truncate flex items-center justify-end h-4"
                                          style={{ top: `${topPos}%`, transform: 'translateY(-50%)' }}
                                          title={phrase}
                                      >
                                          {phrase}
                                      </div>
                                  );
                              })}
                          </div>

                          {/* Right Column: Chart Area */}
                          <div className="flex-1 h-full relative border-b border-gray-300">
                              {/* Grid Lines (Horizontal) */}
                              {phrasesList.map((phrase, index) => {
                                  const topPos = ((index + 0.5) / phrasesList.length) * 100;
                                  return (
                                      <div 
                                          key={`grid-${phrase}`} 
                                          className="absolute w-full border-t border-gray-100 border-dashed"
                                          style={{ top: `${topPos}%`, transform: 'translateY(-50%)' }}
                                      ></div>
                                  );
                              })}

                              {/* Data Points */}
                              {scatterData.map((point, i) => {
                                  const phraseIndex = phrasesList.indexOf(point.phrase);
                                  const radioIndex = radiosList.indexOf(point.radio);
                                  
                                  if (phraseIndex === -1) return null;
                                  
                                  const topPos = ((phraseIndex + 0.5) / phrasesList.length) * 100;
                                  const leftPos = ((point.time - startTime) / totalDuration) * 100;
                                  const pointColor = colors[radioIndex % colors.length] || '#16a34a';

                                  return (
                                      <div 
                                          key={i}
                                          className="absolute w-3 h-3 rounded-full border border-white shadow-sm z-10 hover:scale-125 transition-transform"
                                          style={{ 
                                              top: `${topPos}%`, 
                                              left: `${leftPos}%`,
                                              backgroundColor: pointColor,
                                              transform: 'translate(-50%, -50%)'
                                          }}
                                          title={`${point.phrase} - ${point.radio} (${point.timeLabel})`}
                                      />
                                  );
                              })}

                              {/* X-Axis Labels (Bottom) */}
                              <div className="absolute -bottom-6 w-full flex justify-between text-[10px] text-gray-500 font-mono">
                                  <span>{String(startHour).padStart(2, '0')}:00</span>
                                  {[0.25, 0.5, 0.75].map(fraction => {
                                      const hour = Math.round(startHour + (endHour - startHour) * fraction);
                                      const leftPos = fraction * 100;
                                      return (
                                          <span key={fraction} className="absolute -translate-x-1/2" style={{ left: `${leftPos}%` }}>
                                              {String(hour).padStart(2, '0')}:00
                                          </span>
                                      );
                                  })}
                                  <span>{String(endHour).padStart(2, '0')}:00</span>
                              </div>
                          </div>
                        </>
                      );
                  })()}
              </div>

              {/* Legend for Radios */}
              <div className="flex flex-wrap justify-center gap-4 mt-6 px-4">
                  {radiosList.map((radio, index) => (
                      <div key={radio} className="flex items-center gap-1.5">
                          <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: colors[index % colors.length] }}
                          ></div>
                          <span className="text-[10px] font-medium text-gray-600 uppercase">{radio}</span>
                      </div>
                  ))}
              </div>
          </div>

          {/* Performance Bars (Moved to Page 1 to balance) */}
          <div className="border border-gray-200 rounded p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Rendimiento por Radio</h3>
              <div className="space-y-3">
                  {Object.entries(radioStats).map(([name, stats]) => {
                      const percentage = stats.total > 0 ? (stats.matches / stats.total) * 100 : 0;
                      return (
                      <div key={name}>
                          <div className="flex justify-between text-xs mb-1">
                              <span className="font-bold text-gray-700">{name}</span>
                              <span className="text-gray-500">{stats.matches}/{stats.total} ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                              <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${percentage}%` }}
                              ></div>
                          </div>
                      </div>
                      );
                  })}
              </div>
          </div>
      </div>

      {/* Hidden Print Template - Page 2: Distribution (Sunburst) */}
      <div 
        id="print-page-2" 
        style={{ 
            position: 'fixed', 
            top: 0, 
            left: isExporting ? 0 : '-9999px', 
            width: '794px', 
            minHeight: '1123px',
            backgroundColor: 'white', 
            padding: '40px 40px 80px 40px', 
            fontFamily: 'Arial, sans-serif',
            zIndex: isExporting ? 9999 : -1,
            visibility: isExporting ? 'visible' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center'
        }}
      >
           <h3 className="text-xl font-bold text-gray-800 mb-4 mt-8">Distribución de Coincidencias</h3>
           
           <div className="w-full flex flex-col items-center justify-start gap-4">
              {/* Chart - Reduced size to fit content */}
              <div className="flex justify-center items-center">
                  <PieChart width={500} height={400}>
                      <Pie
                          data={innerData}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          fill="#8884d8"
                          isAnimationActive={false}
                          label={({ percent }: { percent?: number }) => `${((percent || 0) * 100).toFixed(0)}%`}
                          labelLine={false}
                      >
                          {innerData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                          ))}
                      </Pie>
                      <Pie
                          data={outerData}
                          dataKey="value"
                          cx="50%"
                          cy="50%"
                          innerRadius={120}
                          outerRadius={160}
                          fill="#82ca9d"
                          isAnimationActive={false}
                          label={({ name }) => name.length > 20 ? name.substring(0, 20) + '..' : name}
                      >
                          {outerData.map((entry, index) => (
                              <Cell key={`cell-outer-${index}`} fill={entry.color} fillOpacity={0.6} stroke="#fff" />
                          ))}
                      </Pie>
                  </PieChart>
              </div>

              {/* Custom Legend Section - Horizontal Disposition */}
              <div className="w-full grid grid-cols-2 gap-4 mt-2 items-start">
                  {/* Inner Ring: Radios */}
                  <div className="border border-gray-200 rounded p-3">
                      <h4 className="font-bold text-gray-700 mb-2 text-center border-b pb-1 text-xs">Anillo Interno: Radios</h4>
                      <div className="space-y-1.5">
                          {innerData.map((item, index) => (
                              <div key={index} className="flex items-center text-[10px]">
                                  <div 
                                      className="w-2.5 h-2.5 mr-2 rounded shadow-sm flex-shrink-0" 
                                      style={{ backgroundColor: colors[index % colors.length] }}
                                  ></div>
                                  <span className="text-gray-600 truncate">{item.name}</span>
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* Outer Ring: Phrases with Timestamps - Compact Inline Layout */}
                  <div className="border border-gray-200 rounded p-3">
                      <h4 className="font-bold text-gray-700 mb-2 text-center border-b pb-1 text-xs">Anillo Externo: Frases</h4>
                      <div className="space-y-1.5">
                          {outerData.map((item, index) => (
                              <div key={index} className="text-[10px] border-b border-gray-100 last:border-0 pb-1">
                                  <div className="flex items-start">
                                      <div 
                                          className="w-2.5 h-2.5 mr-1.5 mt-0.5 rounded shadow-sm flex-shrink-0" 
                                          style={{ backgroundColor: item.color, opacity: 0.6 }}
                                      ></div>
                                      <div className="flex flex-wrap items-baseline gap-1.5 leading-tight">
                                          <span className="font-bold text-gray-800 mr-0.5">{item.name}:</span>
                                          {item.times && item.times.map((t: string, i: number) => (
                                              <span key={i} className="bg-gray-100 px-1.5 rounded text-gray-600 font-mono border border-gray-200">
                                                  {t}
                                              </span>
                                          ))}
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
           </div>
      </div>
    </div>
  );
}
