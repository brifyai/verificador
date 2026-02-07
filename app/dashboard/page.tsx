'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Plus, Radio as RadioIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { RunPodControl } from '@/components/RunPodControl';
import Swal from 'sweetalert2';

export default function DashboardPage() {
  const [radios, setRadios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRadio, setNewRadio] = useState({ name: '', address: '', url: '' });
  const [userRole, setUserRole] = useState<string>('user');

  useEffect(() => {
    fetchRadios();
  }, []);

  const fetchRadios = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Determine role
    const role = user.user_metadata?.role || 'user';
    setUserRole(role);

    let query = supabase.from('radios').select('*');
    
    // If not admin/super_admin, only show own radios
    if (role !== 'admin' && role !== 'super_admin') {
        query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) toast.error('Error al cargar radios');
    else setRadios(data || []);
    setLoading(false);
  };

  const handleDeleteRadio = async (e: React.MouseEvent, radio: any) => {
    e.preventDefault();
    e.stopPropagation();

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


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch('/api/radios/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(newRadio),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear radio');
      }

      toast.success('Radio creada y carpeta de Drive generada');
      setShowCreate(false);
      setNewRadio({ name: '', address: '', url: '' });
      fetchRadios();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mis Radios</h1>
        <div className="flex items-center gap-4">
            {userRole === 'super_admin' && <RunPodControl />}
            <button
            onClick={() => setShowCreate(!showCreate)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
            <Plus className="mr-2 h-4 w-4" />
            Nueva Radio
            </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Agregar Nueva Radio</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre</label>
              <input
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                value={newRadio.name}
                onChange={e => setNewRadio({...newRadio, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Dirección</label>
              <input
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                value={newRadio.address}
                onChange={e => setNewRadio({...newRadio, address: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">URL (Opcional)</label>
              <input
                type="url"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                value={newRadio.url}
                onChange={e => setNewRadio({...newRadio, url: e.target.value})}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p>Cargando...</p>
      ) : radios.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <RadioIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No hay radios</h3>
          <p className="mt-1 text-sm text-gray-500">Comienza creando una nueva radio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {radios.map((radio) => (
            <Link
              key={radio.id}
              href={`/dashboard/${radio.id}`}
              className="block hover:bg-gray-50 transition-colors"
            >
              <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                    <RadioIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {radio.address}
                    </dt>
                    <dd className="flex items-baseline justify-between">
                      <div className="text-xl font-semibold text-gray-900">
                        {radio.name}
                      </div>
                      {(userRole === 'admin' || userRole === 'super_admin') && (
                          <button
                            onClick={(e) => handleDeleteRadio(e, radio)}
                            className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-colors"
                            title="Eliminar radio"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                       )}
                    </dd>
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
