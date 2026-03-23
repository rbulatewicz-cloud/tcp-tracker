import React from 'react';
import { UploadMasterFileButton } from '../features/actions/UploadMasterFileButton';
import { RoleSwitcher } from '../features/roleSwitcher/RoleSwitcher';
import { ConfirmationModal } from './ConfirmationModal';
import { UserRole, User } from '../types';
import { migrateDocuments } from '../services/migrationService';
import { Settings, AppWindow } from 'lucide-react';
import { showToast } from '../lib/toast';

interface AdminToolbarProps {
  role: UserRole;
  loading: { upload?: boolean };
  handleMasterUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  loading,
  handleMasterUpload,
  currentUser,
  setCurrentUser,
  isPermissionEditingMode,
  setIsPermissionEditingMode,
  isRealAdmin,
  setView,
  view
}) => {
  if (!isRealAdmin) return null;

  const [showMigrationModal, setShowMigrationModal] = React.useState(false);

  const handleMigration = async () => {
    try {
      await migrateDocuments();
      showToast("Migration completed successfully.", "success");
    } catch (error) {
      console.error("Migration failed:", error);
      showToast("Migration failed. Check console for details.", "error");
    }
  };

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
        onClick={() => setShowMigrationModal(true)}
        className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-amber-700 transition-all duration-200"
      >
        Run Migration
      </button>

      <ConfirmationModal
        isOpen={showMigrationModal}
        onClose={() => setShowMigrationModal(false)}
        onConfirm={handleMigration}
        title="Run Data Migration"
        message="This tool is used to update legacy log entries with unique identifiers. It is only necessary if you are experiencing issues with deleting old log entries. Running this on a large database may take time and consume Firestore quota. Are you sure you want to proceed?"
      />

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

      <UploadMasterFileButton isRealAdmin={isRealAdmin} loading={loading} handleMasterUpload={handleMasterUpload} />
    </div>
  );
};
