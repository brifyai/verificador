
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, FileText, ChevronRight, Radio } from 'lucide-react';
import Link from 'next/link';

interface Summary {
  id: string;
  title: string;
  created_at: string;
  data: any[];
}

const getRadioName = (summary: Summary) => {
  if (!summary.data || summary.data.length === 0) return null;
  // Try to find the first radio name in the data items
  // Assuming data structure: [{ radios: { name: "Radio X" }, ... }, ...]
  const item = summary.data.find((d: any) => d.radios && d.radios.name);
  return item ? item.radios.name : null;
};

export default function ClientSummaryListPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummaries();
  }, []);

  const fetchSummaries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSummaries(data || []);
    } catch (error) {
      console.error('Error fetching summaries:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mis Reportes</h1>
      
      {summaries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No hay reportes disponibles</h3>
          <p className="mt-1 text-sm text-gray-500">Aún no se han generado reportes para tu cuenta.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <Link 
              key={summary.id} 
              href={`/dashboard/client-summary/${summary.id}`}
              className="block group"
            >
              <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Reporte</dt>
                        <dd>
                          <div className="text-lg font-medium text-gray-900 truncate">{summary.title}</div>
                          {getRadioName(summary) && (
                            <div className="flex items-center mt-1 text-sm text-gray-500">
                                <Radio className="w-3 h-3 mr-1" />
                                <span className="truncate">{getRadioName(summary)}</span>
                            </div>
                          )}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-5 py-3">
                  <div className="text-sm text-blue-700 group-hover:text-blue-900 font-medium flex items-center justify-between">
                    <span>Ver detalles</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
