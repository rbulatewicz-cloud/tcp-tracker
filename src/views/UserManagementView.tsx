import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { showToast } from '../lib/toast';

interface UserManagementViewProps {
  users: User[];
  currentUser: User | null;
  role: UserRole;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ users, currentUser, role }) => {
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", role: UserRole.SFTC });

  const handleSaveUser = async () => {
    if (!userForm.email || !userForm.name) return;
    const emailId = userForm.email.toLowerCase();
    const uid = editingUser?.uid || Math.random().toString(36).substr(2, 9);
    const newUser = { ...userForm, uid };
    
    if (newUser.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      showToast("Only system admins can grant the Tier 0: System Admin role.", "error");
      return;
    }
    
    try {
      await setDoc(doc(db, 'users_public', emailId), { uid: newUser.uid, name: newUser.name, email: newUser.email });
      await setDoc(doc(db, 'users_private', emailId), { uid: newUser.uid, role: newUser.role });
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm({ name: "", email: "", role: UserRole.SFTC });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users_public/${emailId}`);
    }
  };

  const deleteUser = async (email: string, userRole: string) => {
    if (email.toLowerCase() === currentUser?.email.toLowerCase()) { showToast("Cannot delete yourself", "error"); return; }
    
    if (userRole === UserRole.ADMIN && role !== UserRole.ADMIN) {
      showToast("Only system admins can delete other Tier 0: System Admin members.", "error");
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'users_public', email.toLowerCase()));
      await deleteDoc(doc(db, 'users_private', email.toLowerCase()));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users_public/${email.toLowerCase()}`);
    }
  };

  const handleSendInvite = (email: string, role: string) => {
    const subject = encodeURIComponent("Invitation to join SFTC Traffic Control Portal");
    const body = encodeURIComponent(`Hello,\n\nYou have been invited to join the SFTC Traffic Control Portal as a ${role}.\n\nPlease sign in using your Google account at:\n${window.location.origin}\n\nThanks,\nSFTC MOT Team`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
        <button 
          onClick={() => setShowUserForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add User
        </button>
      </div>

      {showUserForm && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:110}} onClick={e=>{if(e.target===e.currentTarget)setShowUserForm(false);}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:"100%",maxWidth:400,boxShadow:"0 25px 50px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:20}}>{editingUser ? "Edit Team Member" : "Add Team Member"}</div>
            <div style={{display:"grid",gap:14}}>
              <div><label>Full Name</label><input type="text" value={userForm.name || ""} onChange={e=>setUserForm(f=>({...f,name:e.target.value}))} className="border p-2 rounded w-full" placeholder="John Doe"/></div>
              <div><label>Email Address</label><input type="email" value={userForm.email || ""} onChange={e=>setUserForm(f=>({...f,email:e.target.value}))} className="border p-2 rounded w-full" placeholder="john@sftc.com"/></div>
              <div>
                <label>Role / Access Tier</label>
                <select value={userForm.role || UserRole.SFTC} onChange={e=>setUserForm(f=>({...f,role:e.target.value as UserRole}))} className="border p-2 rounded w-full">
                  <option value={UserRole.GUEST}>Tier 3: Guest / Viewer</option>
                  <option value={UserRole.SFTC}>Tier 2: SFTC Team</option>
                  <option value={UserRole.MOT}>Tier 1: MOT Team</option>
                  <option value={UserRole.CR}>Tier 1.5: Community Relations</option>
                  {role === UserRole.ADMIN && (
                    <option value={UserRole.ADMIN}>Tier 0: System Admin</option>
                  )}
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:24}}>
              <button onClick={()=>setShowUserForm(false)} style={{flex:1, background:"#F1F5F9", color:"#64748B", border:"none", padding:"10px", borderRadius:8, fontWeight:600, cursor:"pointer"}}>Cancel</button>
              <button onClick={handleSaveUser} style={{flex:1, background:"#0F172A", color:"#fff", border:"none", padding:"10px", borderRadius:8, fontWeight:700, cursor:"pointer"}}>Save Member</button>
              {!editingUser && (
                <button onClick={() => { if (!userForm.email || !userForm.name) return; const email = userForm.email; const role = userForm.role; handleSaveUser(); handleSendInvite(email, role); }} style={{flex:1, background:"#10B981", color:"#fff", border:"none", padding:"10px", borderRadius:8, fontWeight:700, cursor:"pointer"}}>Save & Invite</button>
              )}
            </div>
          </div>
        </div>
      )}

      <table className="w-full bg-white rounded shadow">
        <thead>
          <tr className="border-b">
            <th className="p-3 text-left">Name</th>
            <th className="p-3 text-left">Email</th>
            <th className="p-3 text-left">Role</th>
            <th className="p-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.uid} className="border-b">
              <td className="p-3">{user.name}</td>
              <td className="p-3">{user.email}</td>
              <td className="p-3">{user.role}</td>
              <td className="p-3 flex gap-2">
                <button onClick={() => handleSendInvite(user.email, user.role)} className="text-blue-600">Invite</button>
                <button onClick={() => deleteUser(user.email, user.role)} className="text-red-600">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
