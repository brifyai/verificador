import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

interface PhraseSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onSaveChange?: (save: boolean) => void;
  savedPhrases: Array<{ id: string; text: string }>;
  placeholder?: string;
}

export function PhraseSelector({ 
  value, 
  onChange, 
  onSaveChange, 
  savedPhrases,
  placeholder = "Escribe o selecciona una frase..." 
}: PhraseSelectorProps) {
  const [showSaveOption, setShowSaveOption] = useState(false);
  const [shouldSave, setShouldSave] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Check if current value exists in saved phrases
  const isSaved = savedPhrases.some(p => p.text.toLowerCase() === value.toLowerCase());

  useEffect(() => {
    // Show save option only if value is not empty and not already saved
    const show = value.trim().length > 0 && !isSaved;
    setShowSaveOption(show);
    
    // If it is saved or empty, reset shouldSave
    if (!show && shouldSave) {
      setShouldSave(false);
      if (onSaveChange) onSaveChange(false);
    }
  }, [value, isSaved, onSaveChange, shouldSave]);

  const handleSaveToggle = (checked: boolean) => {
    setShouldSave(checked);
    if (onSaveChange) onSaveChange(checked);
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 pr-10"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          list={`phrases-list-${placeholder}`} // Native datalist fallback
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-2 flex items-center text-gray-400 hover:text-gray-600"
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronsUpDown className="h-4 w-4" />
        </button>
      </div>

      {/* Custom Dropdown */}
      {isOpen && savedPhrases.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {savedPhrases
            .filter(p => p.text.toLowerCase().includes(value.toLowerCase()))
            .map((phrase) => (
              <div
                key={phrase.id}
                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50 text-gray-900"
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur
                  onChange(phrase.text);
                  setIsOpen(false);
                }}
              >
                <span className="block truncate">{phrase.text}</span>
                {value === phrase.text && (
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                    <Check className="h-5 w-5" />
                  </span>
                )}
              </div>
            ))}
            {savedPhrases.filter(p => p.text.toLowerCase().includes(value.toLowerCase())).length === 0 && (
                <div className="py-2 pl-3 pr-9 text-gray-500 italic">No hay coincidencias guardadas</div>
            )}
        </div>
      )}

      {/* Save Checkbox */}
      {showSaveOption && onSaveChange && (
        <div className="mt-1 flex items-center">
          <input
            id={`save-phrase-${placeholder}`}
            type="checkbox"
            checked={shouldSave}
            onChange={(e) => handleSaveToggle(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor={`save-phrase-${placeholder}`} className="ml-2 block text-xs text-gray-600 cursor-pointer">
            Guardar esta frase para futuras verificaciones
          </label>
        </div>
      )}
    </div>
  );
}
