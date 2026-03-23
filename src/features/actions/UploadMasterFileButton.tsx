import React from 'react';
import { Spinner } from '../../components/Spinner';
import { UserRole } from '../../types';

interface UploadMasterFileButtonProps {
  isRealAdmin: boolean;
  loading: { upload?: boolean };
  handleMasterUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const UploadMasterFileButton: React.FC<UploadMasterFileButtonProps> = ({ isRealAdmin, loading, handleMasterUpload }) => {
  if (!isRealAdmin) return null;

  const font = "'Outfit', sans-serif";

  return (
    <label style={{
      background: "#10B981",
      color: "#fff",
      border: "none",
      padding: "8px 18px",
      borderRadius: 8,
      fontWeight: 600,
      cursor: "pointer",
      fontSize: 12,
      fontFamily: font,
      display: "flex",
      alignItems: "center",
      gap: 6
    }}>
      {loading.upload ? <Spinner size={12} color="#fff" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>}
      {loading.upload ? "Uploading..." : "Upload Master File"}
      <input type="file" accept=".xlsx, .xls, .csv" style={{display:"none"}} disabled={loading.upload} onChange={handleMasterUpload} />
    </label>
  );
};
