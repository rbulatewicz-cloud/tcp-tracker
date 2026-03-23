import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  highlight?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  children, 
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle,
  highlight = false
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  return (
    <div className={`border-t border-slate-100 ${highlight ? 'bg-amber-50' : ''}`}>
      <button 
        onClick={handleToggle}
        className={`w-full px-7 py-2 flex items-center justify-between text-left transition-colors ${highlight ? 'hover:bg-amber-100' : 'hover:bg-slate-50'}`}
      >
        <span className={`text-[10px] font-bold uppercase tracking-widest ${highlight ? 'text-amber-800' : 'text-slate-500'}`}>
          {title}
        </span>
        <ChevronDown 
          className={`w-4 h-4 transition-transform duration-200 ${highlight ? 'text-amber-800' : 'text-slate-400'} ${isOpen ? '' : '-rotate-90'}`} 
        />
      </button>
      {isOpen && (
        <div className="px-7 pb-4">
          {children}
        </div>
      )}
    </div>
  );
};
