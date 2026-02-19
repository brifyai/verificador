'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Plus, Radio as RadioIcon, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { RunPodControl } from '@/components/RunPodControl';
import Swal from 'sweetalert2';

export default function DashboardPage() {
  const [radios, setRadios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRadio, setNewRadio] = useState({ name: '', address: '', url: '' });
  const [userRole, setUserRole] = useState<string>('');
  const [creatingRadio, setCreatingRadio] = useState(false);

  useEffect(() => {
    fetchRadios();
  }, []);

  const fetchRadios = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get Role from Profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    
    const role = profile?.role || 'client'; // Default safe
    setUserRole(role);

    if (role === 'super_admin') {
        // Super Admin sees ALL radios
        const { data, error } = await supabase
            .from('radios')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) toast.error('Error al cargar radios');
        else setRadios(data || []);
    
    } else if (role === 'admin') {
        // Admin sees ASSIGNED radios
        const { data: assignments, error: assignError } = await supabase
            .from('radio_assignments')
            .select('radio_id')
            .eq('admin_id', user.id);

        if (assignError) {
            console.error(assignError);
            setRadios([]);
        } else {
            const ids = (assignments || []).map(a => a.radio_id);
            if (ids.length > 0) {
                const { data, error } = await supabase
                    .from('radios')
                    .select('*')
                    .in('id', ids)
                    .order('created_at', { ascending: false });
                
                if (error) toast.error('Error al cargar radios asignadas');
                else setRadios(data || []);
            } else {
                setRadios([]);
            }
        }
    } else {
        // Clients shouldn't really be here, but if so, show nothing
        setRadios([]);
    }
    
    setLoading(false);
  };

  const handleDeleteRadio = async (e: React.MouseEvent, radio: any) => {
    e.preventDefault();
    e.stopPropagation();

    // Only Super Admin can delete? Or Admin too?
    // Assuming Super Admin only for now, or check permissions.
    if (userRole !== 'super_admin') {
        toast.error('No tienes permiso para eliminar radios.');
        return;
    }

    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `Estás a punto de eliminar la radio "${radio.name}". Esto eliminará PERMANENTEMENTE todas las verificaciones asociadas, archivos en Drive y registros en la base de datos.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        Swal.fire({
            title: 'Eliminando...',
            text: 'Por favor espere mientras se eliminan los recursos.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const res = await fetch('/api/radios/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ radioId: radio.id })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error al eliminar');

        Swal.fire(
          '¡Eliminado!',
          'La radio y sus datos han sido eliminados.',
          'success'
        );

        // Refresh list
        fetchRadios();

      } catch (error: any) {
        Swal.fire(
          'Error',
          'Hubo un problema al eliminar la radio: ' + error.message,
          'error'
        );
      }
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const toastId = toast.loading('Sincronizando radios con Google Drive...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/radios/sync', {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en sincronización');

      toast.success(`Sincronización completada. ${data.synced} radios actualizadas.`, { id: toastId });
      fetchRadios();
    } catch (error: any) {
      toast.error('Error: ' + error.message, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateRadio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'super_admin' && userRole !== 'admin') {
      toast.error('No tienes permiso para crear radios.');
      return;
    }

    if (!newRadio.name.trim() || !newRadio.address.trim()) {
      toast.error('Nombre y dirección son obligatorios.');
      return;
    }

    setCreatingRadio(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('No hay sesión activa');
        return;
      }

      const res = await fetch('/api/radios/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(newRadio)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear radio');

      toast.success('Radio creada correctamente');
      setShowCreate(false);
      setNewRadio({ name: '', address: '', url: '' });
      fetchRadios();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear radio');
    } finally {
      setCreatingRadio(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Radios</h1>
          <p className="text-sm text-gray-500">Gestión y verificación de medios</p>
        </div>
        
        <div className="flex gap-3">
          <RunPodControl />
          {(userRole === 'super_admin' || userRole === 'admin') && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar Radio
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar Drive
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {radios.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                <RadioIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No hay radios asignadas</h3>
                <p className="mt-1 text-sm text-gray-500">Contacta al administrador para que te asigne radios.</p>
            </div>
        ) : (
            radios.map((radio) => (
            <Link 
                key={radio.id} 
                href={`/dashboard/${radio.id}`}
                className="block group relative bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-500 transition-all hover:shadow-md">
                <div className="p-6">
                <div className="flex justify-between items-start">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl mb-4">
                   <div className="flex-shrink-0 bg-blue-100 rounded-md p-3"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-radio h-6 w-6 text-blue-600" aria-hidden="true"><path d="M16.247 7.761a6 6 0 0 1 0 8.478"></path><path d="M19.075 4.933a10 10 0 0 1 0 14.134"></path><path d="M4.925 19.067a10 10 0 0 1 0-14.134"></path><path d="M7.753 16.239a6 6 0 0 1 0-8.478"></path><circle cx="12" cy="12" r="2"></circle></svg></div>
                    </div>
                    {userRole === 'super_admin' && (
                           <button
                            onClick={(e) => handleDeleteRadio(e, radio)}
                            className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-colors"
                            title="Eliminar radio"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                    )}
                </div>
                
                <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                    {radio.name}
                </h3>
                
                {radio.folder_name && (
                    <p className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded w-fit mb-3">
                    Folder: {radio.folder_name}
                    </p>
                )}
                
                <div className="flex items-center text-sm text-gray-500 mt-4 pt-4 border-t border-gray-100">
                    <span className="flex items-center text-blue-600 font-medium">
                    Ver verificaciones
                    <svg className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    </span>
                </div>
                </div>
            </Link>
            ))
        )}
      </div>

      {showCreate && (userRole === 'super_admin' || userRole === 'admin') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Agregar Radio manualmente</h2>
            <form onSubmit={handleCreateRadio} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre de la Radio</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  value={newRadio.name}
                  onChange={e => setNewRadio(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Dirección</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  value={newRadio.address}
                  onChange={e => setNewRadio(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">URL (opcional)</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  value={newRadio.url}
                  onChange={e => setNewRadio(prev => ({ ...prev, url: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setNewRadio({ name: '', address: '', url: '' }); }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingRadio}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {creatingRadio && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Radio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
