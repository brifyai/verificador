'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, Mail } from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [rootFolderId, setRootFolderId] = useState('');
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
    // Check for auth code in URL (callback)
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
        handleAuthCallback(code);
    }
  }, []);

  const handleAuthCallback = async (code: string) => {
      setLoading(true);
      try {
          // Remove code from URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch('/api/drive/callback', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session?.access_token}`
              },
              body: JSON.stringify({ code })
          });
          
          const data = await res.json();
          if (res.ok) {
              toast.success('Cuenta de Google conectada exitosamente');
              setIsGoogleConnected(true);
          } else {
              toast.error('Error al conectar: ' + data.error);
          }
      } catch (error) {
          toast.error('Error de conexión');
      } finally {
          setLoading(false);
      }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Estás seguro de que quieres desconectar la cuenta de Google? El sistema dejará de sincronizar archivos.')) return;
    
    setLoading(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/settings/global', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });

        if (res.ok) {
            toast.success('Cuenta desconectada correctamente');
            setIsGoogleConnected(false);
        } else {
            toast.error('Error al desconectar');
        }
    } catch (error) {
        toast.error('Error de conexión');
    } finally {
        setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
      try {
          const res = await fetch('/api/drive/auth-url');
          const data = await res.json();
          if (data.url) {
              window.location.href = data.url;
          }
      } catch (error) {
          toast.error('Error al iniciar conexión');
      }
  };

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    try {
      const res = await fetch('/api/settings/global', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setRootFolderId(data.drive_root_folder_id || '');
        setIsGoogleConnected(data.isGoogleConnected || false);
      }
    } catch (err) {
      console.error('Error fetching global settings:', err);
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/settings/global', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ 
                drive_root_folder_id: rootFolderId
            })
        });

        if (!res.ok) throw new Error('Failed to save settings');
        toast.success('Configuración guardada correctamente');
        fetchProfile();
    } catch (error) {
        toast.error('Error al guardar la configuración');
    } finally {
        setSaving(false);
    }
  };

  const handleDeleteFolderId = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar el ID de la carpeta? Tendrás que ingresarlo nuevamente.')) return;
    setSaving(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/settings/global?key=drive_root_folder_id', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${session?.access_token}`
            }
        });

        if (res.ok) {
            toast.success('ID de carpeta eliminado');
            setRootFolderId('');
            fetchProfile();
        } else {
            toast.error('Error al eliminar');
        }
    } catch (error) {
        toast.error('Error al eliminar');
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Configuración del Sistema</h1>
      
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">Integración con Google Drive</h2>
        
        <div className="mb-6 p-4 border rounded-md bg-gray-50">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-medium text-gray-900">Estado de Conexión</h3>
                    <p className={`text-sm ${isGoogleConnected ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
                        {isGoogleConnected 
                            ? '✅ Sistema Conectado a Google Drive' 
                            : '⚠️ Sistema Desconectado. Conecta una cuenta para operar.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={isGoogleConnected ? handleDisconnect : handleConnectGoogle}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                        isGoogleConnected 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                    {isGoogleConnected ? 'Desconectar Cuenta' : 'Conectar Google Drive'}
                </button>
            </div>
        </div>

        <form onSubmit={handleSave}>
          <div className="mb-8">
            <label htmlFor="rootFolderId" className="block text-sm font-medium text-gray-700">
              ID de Carpeta Raíz (Google Drive)
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
                <input
                    type="text"
                    id="rootFolderId"
                    value={rootFolderId}
                    onChange={(e) => setRootFolderId(e.target.value)}
                    disabled={loading || (isGoogleConnected && !!rootFolderId)}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    placeholder="Ej: 1abc...xyz"
                />
            </div>
            <p className="mt-2 text-sm text-gray-500">
              ID de la carpeta donde se crearán las subcarpetas para cada Radio.
            </p>
            {rootFolderId && isGoogleConnected && (
                <div className="mt-2 flex justify-end">
                     <button
                        type="button"
                        onClick={handleDeleteFolderId}
                        disabled={saving}
                        className="inline-flex justify-center py-1 px-3 border border-transparent shadow-sm text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                     >
                        Eliminar ID
                     </button>
                </div>
            )}
          </div>

          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Configuración de Correo
            </h2>
            <p className="text-sm text-gray-500 mb-4">
                El sistema utiliza la cuenta de Google conectada para el envío de notificaciones e invitaciones.
                Asegúrate de que la cuenta conectada tenga permisos de Gmail.
            </p>
            
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <div className="flex">
                    <div className="ml-3">
                        <p className="text-sm text-blue-700">
                            {isGoogleConnected 
                                ? '✅ El envío de correos está habilitado a través de tu cuenta de Google.' 
                                : '⚠️ Conecta tu cuenta de Google arriba para habilitar el envío de correos.'}
                        </p>
                    </div>
                </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex items-center justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar Todo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
