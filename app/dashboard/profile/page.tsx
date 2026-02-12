
'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Lock, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ProfilePage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Contraseña actualizada correctamente');
        setPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || 'Error al actualizar contraseña');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <User className="w-8 h-8 text-gray-700" />
        Mi Perfil
      </h1>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900">
          <Lock className="w-5 h-5" />
          Cambiar Contraseña
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nueva Contraseña</label>
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirmar Nueva Contraseña</label>
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
            />
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
