
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, FileText, ChevronRight, Radio, Share2, X, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Summary {
  id: string;
  title: string;
  created_at: string;
  data: any[];
}

const getRadioName = (summary: Summary) => {
  if (!summary.data || summary.data.length === 0) return null;
  const item = summary.data.find((d: any) => d.radios && d.radios.name);
  return item ? item.radios.name : null;
};

export default function MySummariesPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [sharing, setSharing] = useState(false);

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
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSummaries(data || []);
    } catch (error) {
      console.error('Error fetching summaries:', error);
      toast.error('Error al cargar resúmenes');
    } finally {
      setLoading(false);
    }
  };

  const handleShareClick = (e: React.MouseEvent, summary: Summary) => {
    e.preventDefault(); // Prevent Link navigation if inside Link
    e.stopPropagation();
    setSelectedSummary(summary);
    setShareEmail('');
    setSharePassword('');
    setShowShareModal(true);
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail || !selectedSummary) return;

    setSharing(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No sesión');

        const response = await fetch('/api/admin/summaries/share', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                summaryId: selectedSummary.id,
                clientEmail: shareEmail,
                clientPassword: sharePassword
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error al compartir');

        toast.success(`Resumen compartido con ${shareEmail}`);
        setShowShareModal(false);
    } catch (error: any) {
        toast.error(error.message);
    } finally {
        setSharing(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Mis Resúmenes</h1>
      </div>
      
      {summaries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No has creado resúmenes</h3>
          <p className="mt-1 text-sm text-gray-500">Ve al Generador de Resúmenes para crear uno.</p>
          <div className="mt-6">
            <Link
                href="/dashboard/summary-builder"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
                Crear Resumen
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <div key={summary.id} className="block group relative bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <Link href={`/dashboard/client-summary/${summary.id}`} className="block h-full">
                <div className="p-5 pb-16"> {/* Extra padding for buttons */}
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
                          <div className="mt-1 text-xs text-gray-400">
                            Creado el {new Date(summary.created_at).toLocaleDateString()}
                          </div>
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </Link>
              
              {/* Actions Footer */}
              <div className="absolute bottom-0 left-0 right-0 bg-gray-50 px-5 py-3 border-t flex justify-between items-center">
                  <Link 
                    href={`/dashboard/client-summary/${summary.id}`}
                    className="text-sm text-blue-700 hover:text-blue-900 font-medium flex items-center"
                  >
                    Ver como usuario
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                  
                  <button
                    onClick={(e) => handleShareClick(e, summary)}
                    className="text-sm text-gray-600 hover:text-blue-600 font-medium flex items-center px-2 py-1 rounded hover:bg-gray-100"
                  >
                    <Share2 className="h-4 w-4 mr-1" />
                    Compartir
                  </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-900">Compartir Resumen</h2>
                    <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <p className="text-sm text-gray-500 mb-4">
                    Estás compartiendo: <strong>{selectedSummary?.title}</strong>
                </p>

                <form onSubmit={handleShareSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email del destinatario</label>
                        <input
                            type="email"
                            required
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                            value={shareEmail}
                            onChange={(e) => setShareEmail(e.target.value)}
                            placeholder="cliente@ejemplo.com"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Contraseña (solo para nuevos usuarios)
                        </label>
                        <input
                            type="text"
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                            value={sharePassword}
                            onChange={(e) => setSharePassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Si el correo ya está registrado, no es necesaria la contraseña.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={() => setShowShareModal(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={sharing}
                            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {sharing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                            {sharing ? 'Compartiendo...' : 'Compartir'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}
