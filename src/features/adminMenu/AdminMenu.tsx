import React from 'react';
import { Activity, ChevronDown, BarChart3, FileText, Users } from 'lucide-react';
import { UserRole } from '../../types';

interface AdminMenuProps {
  view: string;
  setView: (view: string) => void;
  canViewMetrics: boolean;
  canViewLogs: boolean;
  canManageUsers: boolean;
  canManageApp: boolean;
  role: UserRole;
  isOpen: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
}

export const AdminMenu: React.FC<AdminMenuProps> = ({
  view, setView,
  canViewMetrics, canViewLogs, canManageUsers, canManageApp, role,
  isOpen, onMouseEnter, onMouseLeave, onClose
}) => {
  const font = "'Outfit', sans-serif";

  return (
    <div 
      onMouseEnter={onMouseEnter} 
      onMouseLeave={onMouseLeave}
      style={{position: "relative"}}
    >
      <button 
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold text-xs transition-all duration-200 outline-none ${
          ["metrics", "log", "users", "app_feedback", "settings"].includes(view)
            ? "bg-white text-slate-900 shadow-sm"
            : "bg-transparent text-slate-500 hover:text-slate-700"
        }`}
      >
        <Activity size={14} strokeWidth={["metrics", "log", "users", "app_feedback", "settings"].includes(view) ? 2.5 : 2} />
        Admin
        <ChevronDown size={12} className="opacity-50 -ml-0.5" />
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl min-w-[160px] z-[100] flex flex-col p-1 gap-0.5">
          {canViewMetrics && (
            <button onClick={()=>{setView("metrics"); onClose();}} className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-xs text-left w-full transition-all ${view==="metrics" ? "bg-slate-50 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
              <BarChart3 size={14} /> Dashboard
            </button>
          )}
          
          {canViewLogs && (
            <button onClick={()=>{setView("log"); onClose();}} className={`flex items-center gap-2 px-3 py-2 rounded-md font-medium text-xs text-left w-full transition-all ${view==="log" ? "bg-slate-50 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
              <FileText size={14} /> System Log
            </button>
          )}
          
          {canManageUsers && (
            <button onClick={()=>{setView("users"); onClose();}} style={{display:"flex", alignItems:"center", gap:8, background:view==="users"?"#F8FAFC":"transparent",color:view==="users"?"#0F172A":"#475569",border:"none",padding:"8px 12px",borderRadius:6,fontWeight:500,cursor:"pointer",fontSize:12,fontFamily:font,textAlign:"left",width:"100%",transition:"all 0.2s"}}>
              <Users size={14} /> Team Management
            </button>
          )}
        </div>
      )}
    </div>
  );
};
