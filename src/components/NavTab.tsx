import React from 'react';
import { LucideIcon } from 'lucide-react';

interface NavTabProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}

export const NavTab: React.FC<NavTabProps> = ({ active, onClick, icon: Icon, label }) => (
  <button 
    onClick={onClick} 
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-xs transition-all duration-200 outline-none ${
      active 
        ? "bg-white text-slate-900 shadow-sm" 
        : "bg-transparent text-slate-500 hover:text-slate-700"
    }`}
  >
    <Icon size={14} strokeWidth={active ? 2.5 : 2} />
    {label}
  </button>
);
