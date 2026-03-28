import React from 'react';
import { RoleSwitcher } from '../features/roleSwitcher/RoleSwitcher';
import { UserRole, User } from '../types';
import { Settings, AppWindow } from 'lucide-react';

interface AdminToolbarProps {
  role: UserRole;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isPermissionEditingMode: boolean;
  setIsPermissionEditingMode: (mode: boolean) => void;
  isRealAdmin: boolean;
  setView: (view: string) => void;
  view: string;
}

export const AdminToolbar: React.FC<AdminToolbarProps> = ({
  role,
  currentUser,
  setCurrentUser,
  isPermissionEditingMode,
  setIsPermissionEditingMode,
  isRealAdmin,
  setView,
  view,
}) => {
  if (!isRealAdmin) return null;

  return (
    <div className="bg-slate-900 text-white px-7 py-2 text-[11px] flex items-center justify-end gap-4 border-b border-slate-800">
      <div className="font-bold text-slate-500 mr-auto">ADMIN TOOLS</div>
      
      {isRealAdmin && (
        <button 
          onClick={() => setView("app_feedback")}
          className={`px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-slate-700 transition-all duration-200 flex items-center gap-1.5 ${
            view === "app_feedback" ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-300"
          }`}
        >
          <AppWindow size={10} /> App Feedback
        </button>
      )}

      {isRealAdmin && (
        <button 
          onClick={() => setView("settings")}
          className={`px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-slate-700 transition-all duration-200 flex items-center gap-1.5 ${
            view === "settings" ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-300"
          }`}
        >
          <Settings size={10} /> Settings
        </button>
      )}

      <button 
        onClick={() => setIsPermissionEditingMode(!isPermissionEditingMode)}
        className={`px-3 py-1.5 rounded-md text-[10px] font-bold cursor-pointer transition-all duration-200 ${
          isPermissionEditingMode 
            ? "bg-emerald-500 text-white" 
            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
        }`}
      >
        {isPermissionEditingMode ? "Permissions ON" : "Permissions OFF"}
      </button>

      {isRealAdmin && (
        <RoleSwitcher currentUser={currentUser} setCurrentUser={setCurrentUser} />
      )}

    </div>
  );
};
