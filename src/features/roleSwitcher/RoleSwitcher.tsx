import React from 'react';
import { UserRole, User } from '../../types';

interface RoleSwitcherProps {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ currentUser, setCurrentUser }) => {
  if (!currentUser) return null;

  const roles = [UserRole.GUEST, UserRole.SFTC, UserRole.MOT, UserRole.ADMIN];

  return (
    <div style={{display:"flex", gap:4, marginRight:8, padding:"4px", background:"#F1F5F9", borderRadius:6, border:"1px solid #E2E8F0"}}>
      {roles.map((role) => (
        <button 
          key={role}
          onClick={() => setCurrentUser({...currentUser, role})} 
          style={{
            fontSize:9, 
            padding:"2px 8px", 
            background:currentUser.role === role ? "#0F172A" : "transparent", 
            color:currentUser.role === role ? "#fff" : "#64748B", 
            border:"none", 
            borderRadius:4, 
            cursor:"pointer", 
            fontWeight:700, 
            transition:"all 0.2s"
          }}
        >
          {role}
        </button>
      ))}
    </div>
  );
};
