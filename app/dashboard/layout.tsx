'use client';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogOut, Radio, Settings, Users, FileText, User } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Check role
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile) {
        setRole(profile.role);
        
        // Redirect clients if they are on the main dashboard
        if (profile.role === 'client' && pathname === '/dashboard') {
          router.push('/dashboard/client-summary');
        }
      } else {
        // Fallback or just assume client/admin if profile missing (migration issue)
        // Check if super admin email
        if (user.email === 'brifyaimaster@gmail.com') {
             setRole('super_admin');
        }
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        toast.error('Error al cerrar sesión');
    } else {
        router.push('/login');
    }
  };

  if (loading) return null; // Or a loader

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center">
              <Link href={role === 'client' ? "/dashboard/client-summary" : "/dashboard"} className="flex items-center">
                <Radio className="h-8 w-8 text-blue-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">RadioVerif</span>
              </Link>
              <div className="hidden md:block ml-10">
                <div className="flex items-baseline space-x-4">
                  {role !== 'client' && (
                    <Link
                      href="/dashboard"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        pathname === '/dashboard' 
                          ? 'bg-blue-50 text-blue-600' 
                          : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                      }`}
                    >
                      Mis Radios
                    </Link>
                  )}

                  {role !== 'client' && (
                    <Link
                      href="/dashboard/my-summaries"
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        pathname === '/dashboard/my-summaries' 
                          ? 'bg-blue-50 text-blue-600' 
                          : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                      }`}
                    >
                      Mis Resúmenes
                    </Link>
                  )}
                  
                  {role === 'super_admin' && (
                    <Link
                      href="/dashboard/users"
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        pathname === '/dashboard/users'
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                      }`}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Usuarios
                    </Link>
                  )}

                  {role !== 'client' && (
                     <Link
                      href="/dashboard/summary-builder"
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        pathname === '/dashboard/summary-builder'
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                      }`}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Resúmenes
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link 
                href="/dashboard/profile" 
                className="text-gray-500 hover:text-gray-700"
                title="Mi Perfil"
              >
                <User className="h-5 w-5" />
              </Link>
              {role !== 'client' && (
                <Link 
                  href="/dashboard/settings" 
                  className="text-gray-500 hover:text-gray-700"
                  title="Configuración"
                >
                  <Settings className="h-5 w-5" />
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="py-10">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
