import React from 'react';
import { UserRole } from '../../types';
import { RoleSwitcher } from '../roleSwitcher/RoleSwitcher';

interface UserProfileProps {
  currentUser: any; // Ideally replace with proper User type
  handleLogout: () => void;
  setShowLogin: (show: boolean) => void;
  setCurrentUser: (user: any) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  currentUser,
  handleLogout,
  setShowLogin,
  setCurrentUser
}) => {
  if (!currentUser) {
    return (
      <button 
        onClick={() => setShowLogin(true)} 
        style={{
          background: "#F59E0B", 
          color: "#000", 
          border: "none", 
          padding: "8px 16px", 
          borderRadius: 8, 
          fontSize: 11, 
          fontWeight: 700, 
          cursor: "pointer", 
          marginLeft: 8
        }}
      >
        Sign In
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 8 }}>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1E293B" }}>{currentUser.name}</div>
        <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>{currentUser.role}</div>
      </div>
      <button 
        onClick={handleLogout} 
        style={{
          background: "#F1F5F9", 
          color: "#EF4444", 
          border: "none", 
          padding: "6px 12px", 
          borderRadius: 6, 
          fontSize: 10, 
          fontWeight: 700, 
          cursor: "pointer"
        }}
      >
        Sign Out
      </button>
    </div>
  );
};
