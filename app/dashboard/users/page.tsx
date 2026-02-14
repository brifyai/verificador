
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Plus, User, Shield, Radio, Check, Edit } from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'client';
  created_at: string;
}

interface RadioType {
  id: string;
  name: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'client'>('admin');
  const [availableRadios, setAvailableRadios] = useState<RadioType[]>([]);
  const [selectedRadios, setSelectedRadios] = useState<string[]>([]);
  
  // Edit State
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchRadios();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      // Don't show error if it's just RLS blocking non-admins (though they shouldn't be here)
    } finally {
      setLoading(false);
    }
  };

  const fetchRadios = async () => {
    const { data } = await supabase.from('radios').select('id, name');
    if (data) setAvailableRadios(data);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('No hay sesión activa');
        return;
      }

      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email,
          password,
          role,
          assignedRadios: role === 'admin' ? selectedRadios : []
        })
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Error al crear usuario');

      toast.success('Usuario creado exitosamente');
      setShowModal(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setRole('admin');
    setSelectedRadios([]);
  };

  const toggleRadio = (id: string) => {
    setSelectedRadios(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleEditClick = async (user: Profile) => {
    setEditingUser(user);
    setSelectedRadios([]);
    setShowEditModal(true);

    // Fetch current assignments
    // Note: We need a way to fetch this. RLS allows super_admin to read assignments.
    // Assuming the current user is super_admin if they are on this page.
    const { data: assignments } = await supabase
        .from('radio_assignments')
        .select('radio_id')
        .eq('admin_id', user.id);
    
    if (assignments) {
        setSelectedRadios(assignments.map(a => a.radio_id));
    }
  };

  const handleUpdateAssignments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setUpdating(true);

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No sesión');

        const response = await fetch('/api/admin/users/update-radios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                userId: editingUser.id,
                assignedRadios: selectedRadios
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error al actualizar');

        toast.success('Asignaciones actualizadas');
        setShowEditModal(false);
        setEditingUser(null);
        setSelectedRadios([]);
    } catch (error: any) {
        toast.error(error.message);
    } finally {
        setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-sm text-gray-500">Administra los usuarios y sus permisos</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Usuario
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Registro</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                    ${user.role === 'super_admin' ? 'bg-purple-100 text-purple-800' : 
                      user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                    {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Administrador' : 'Cliente'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {user.role === 'admin' && (
                    <button
                      onClick={() => handleEditClick(user)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Editar asignaciones"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Editar Asignaciones</h2>
            <p className="text-sm text-gray-500 mb-4">
                Gestionar radios para: <strong>{editingUser.email}</strong>
            </p>
            <form onSubmit={handleUpdateAssignments} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Radios Asignadas</label>
                  <div className="max-h-60 overflow-y-auto space-y-2 border rounded-md p-2">
                    {availableRadios.map(radio => (
                      <div key={radio.id} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`edit-radio-${radio.id}`}
                          checked={selectedRadios.includes(radio.id)}
                          onChange={() => toggleRadio(radio.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`edit-radio-${radio.id}`} className="ml-2 text-sm text-gray-900">
                          {radio.name}
                        </label>
                      </div>
                    ))}
                    {availableRadios.length === 0 && (
                      <p className="text-sm text-gray-500 italic">No hay radios disponibles</p>
                    )}
                  </div>
                </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingUser(null); }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Nuevo Usuario</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                <input
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Rol</label>
                <select
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'client')}
                >
                  <option value="admin">Administrador</option>
                  <option value="client">Cliente</option>
                </select>
              </div>

              {role === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Asignar Radios</label>
                  <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                    {availableRadios.map(radio => (
                      <div key={radio.id} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`radio-${radio.id}`}
                          checked={selectedRadios.includes(radio.id)}
                          onChange={() => toggleRadio(radio.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`radio-${radio.id}`} className="ml-2 text-sm text-gray-900">
                          {radio.name}
                        </label>
                      </div>
                    ))}
                    {availableRadios.length === 0 && (
                      <p className="text-sm text-gray-500 italic">No hay radios disponibles</p>
                    )}
                  </div>
                </div>
              )}

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
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
