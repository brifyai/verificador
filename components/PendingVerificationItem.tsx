import { useState } from 'react';
import { Loader2, FileAudio, Plus, XCircle } from 'lucide-react';
import { PhraseSelector } from './PhraseSelector';
import { toast } from 'sonner';

interface PendingVerificationItemProps {
  verification: any;
  savedPhrases: any[];
  onVerify: (verificationId: string, driveFileId: string, phrases: { text: string; save: boolean }[], batchId?: string, broadcastTime?: string, broadcastDate?: string) => Promise<any>;
  processing: boolean;
  processingId: string | null;
  progress: number;
  progressMessage?: string;
}

export function PendingVerificationItem({ 
  verification: v, 
  savedPhrases, 
  onVerify, 
  processing: globalProcessing,
  processingId,
  progress,
  progressMessage
}: PendingVerificationItemProps) {
  const [phrases, setPhrases] = useState<{ text: string; save: boolean }[]>([{ text: '', save: false }]);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [broadcastTime, setBroadcastTime] = useState('');
  const [broadcastDate, setBroadcastDate] = useState('');

  const handlePhraseChange = (index: number, text: string) => {
    const newPhrases = [...phrases];
    newPhrases[index].text = text;
    setPhrases(newPhrases);
  };

  const handleSaveChange = (index: number, save: boolean) => {
    const newPhrases = [...phrases];
    newPhrases[index].save = save;
    setPhrases(newPhrases);
  };

  const handleAddPhrase = () => {
    setPhrases([...phrases, { text: '', save: false }]);
  };

  const handleRemovePhrase = (index: number) => {
    const newPhrases = phrases.filter((_, i) => i !== index);
    setPhrases(newPhrases.length ? newPhrases : [{ text: '', save: false }]);
  };

  const handleVerifyClick = async () => {
    const validPhrases = phrases.filter(p => p.text.trim() !== '');
    if (validPhrases.length === 0) {
      toast.error('Ingresa al menos una frase');
      return;
    }

    setLocalProcessing(true);
    try {
      await onVerify(v.id, v.drive_file_id, validPhrases, undefined, broadcastTime, broadcastDate);
    } finally {
      setLocalProcessing(false);
    }
  };

  const isProcessingThis = globalProcessing && processingId === v.id;
  const isProcessing = globalProcessing || localProcessing;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex flex-col gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-blue-900">
              {v.drive_file_name || `Archivo del ${new Date(v.created_at).toLocaleString()}`}
            </p>
            <p className="text-xs text-blue-700">
              Detectado: {new Date(v.created_at).toLocaleString()}
            </p>
          </div>
          
          {v.drive_web_link && (
            <a 
              href={v.drive_web_link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-4"
            >
              <FileAudio className="h-3 w-3" />
              Escuchar/Ver en Drive
            </a>
          )}

          <div className="space-y-3">
            {phrases.map((phrase, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-grow">
                    <PhraseSelector
                        value={phrase.text}
                        onChange={(val) => handlePhraseChange(index, val)}
                        onSaveChange={(save) => handleSaveChange(index, save)}
                        savedPhrases={savedPhrases}
                        placeholder={`Frase a buscar ${index + 1}`}
                    />
                </div>
                {phrases.length > 1 && (
                  <button
                    onClick={() => handleRemovePhrase(index)}
                    className="text-red-500 hover:text-red-700 mt-2"
                    disabled={isProcessing}
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleAddPhrase}
            disabled={isProcessing}
            className="mt-2 inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-3 w-3 mr-1" />
            Agregar otra frase
          </button>
          
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Día emisión</label>
              <input
                type="date"
                value={broadcastDate}
                onChange={(e) => setBroadcastDate(e.target.value)}
                disabled={isProcessing}
                className="block w-full rounded-md border-blue-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-1.5 border"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-800 mb-1">Horario emisión</label>
              <input
                type="time"
                value={broadcastTime}
                onChange={(e) => setBroadcastTime(e.target.value)}
                disabled={isProcessing}
                className="block w-full rounded-md border-blue-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-1.5 border"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end flex-col gap-2 w-full">
            {isProcessingThis && (
              <div className="w-full">
                <div className="flex justify-between text-xs text-blue-700 mb-1">
                  <span>{progressMessage || 'Procesando...'}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
            <div className="flex justify-end">
                <button
                onClick={handleVerifyClick}
                disabled={isProcessing || phrases.every(p => !p.text.trim())}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                {isProcessingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
