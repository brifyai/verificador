'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export const RunPodControl = () => {
  const [runpodStatus, setRunpodStatus] = useState<{ isOn: boolean; loading: boolean }>({ isOn: false, loading: true });

  useEffect(() => {
    fetchRunpodStatus();
    // Poll every 30 seconds to keep status updated
    const interval = setInterval(fetchRunpodStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRunpodStatus = async () => {
    try {
      const res = await fetch('/api/runpod-status');
      const data = await res.json();
      if (data.success) {
        setRunpodStatus({ isOn: data.status.isOn, loading: false });
      } else {
         // If error, just stop loading, don't break UI
         setRunpodStatus(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error fetching runpod status:', error);
      setRunpodStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const toggleRunpod = async () => {
    const newState = !runpodStatus.isOn;
    setRunpodStatus(prev => ({ ...prev, loading: true })); // Optimistic loading
    try {
      const res = await fetch('/api/runpod-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: newState })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newState ? 'Iniciando servidor RunPod...' : 'Deteniendo servidor RunPod...');
        // Refresh status after a short delay
        setTimeout(fetchRunpodStatus, 2000);
        setTimeout(fetchRunpodStatus, 5000);
        setTimeout(fetchRunpodStatus, 10000);
      } else {
        toast.error('Error cambiando estado: ' + data.error);
        fetchRunpodStatus(); // Revert
      }
    } catch (error) {
      toast.error('Error de conexión');
      fetchRunpodStatus(); // Revert
    }
  };

  return (
    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border shadow-sm">
        <div className={`w-3 h-3 rounded-full ${runpodStatus.isOn ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
        <span className="text-sm font-medium text-gray-700">
            {runpodStatus.loading ? '...' : (runpodStatus.isOn ? 'RunPod: ON' : 'RunPod: OFF')}
        </span>
        <button 
            onClick={toggleRunpod}
            disabled={runpodStatus.loading}
            className={`ml-2 px-3 py-1 text-xs font-bold text-white rounded transition-colors ${
                runpodStatus.isOn 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-green-600 hover:bg-green-700'
            } disabled:opacity-50`}
        >
            {runpodStatus.isOn ? 'APAGAR' : 'ENCENDER'}
        </button>
    </div>
  );
};
