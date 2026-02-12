'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Filter } from 'lucide-react';

interface FilterMultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export function FilterMultiSelect({ 
  label, 
  options, 
  selected, 
  onChange,
  placeholder = 'Seleccionar...'
}: FilterMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          {label}
        </label>
        
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            w-full md:w-64 flex items-center justify-between px-3 py-2 text-sm rounded-lg border bg-white transition-all
            ${isOpen ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'}
          `}
        >
          <div className="flex items-center gap-2 truncate">
            {selected.length === 0 ? (
              <span className="text-gray-400">{placeholder}</span>
            ) : selected.length === 1 ? (
              <span className="text-gray-900 font-medium truncate">{selected[0]}</span>
            ) : (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                {selected.length} seleccionados
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {selected.length > 0 && (
              <div 
                onClick={clearSelection}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors mr-1"
              >
                <X className="w-3.5 h-3.5" />
              </div>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full md:w-72 bg-white rounded-lg border border-gray-200 shadow-xl max-h-80 overflow-y-auto overflow-x-hidden p-1">
          {options.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">No hay opciones disponibles</div>
          ) : (
            <div className="space-y-0.5">
              {options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <button
                    key={option}
                    onClick={() => toggleOption(option)}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left
                      ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}
                    `}
                  >
                    <div className={`
                      w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors
                      ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}
                    `}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="truncate">{option}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
