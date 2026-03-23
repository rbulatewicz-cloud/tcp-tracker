import React from 'react';
import { Spinner } from './Spinner';

interface ClearLogModalProps {
  isOpen: boolean;
  type: 'plan' | 'global';
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export const ClearLogModal: React.FC<ClearLogModalProps> = ({ isOpen, type, onClose, onConfirm, loading }) => {
  if (!isOpen) return null;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:400,boxShadow:"0 25px 50px rgba(0,0,0,0.15)", textAlign:"center"}}>
        <div style={{width:48,height:48,background:"#FEF2F2",borderRadius:24,display:"flex",alignItems:"center",justifyContent:"center",color:"#EF4444",margin:"0 auto 16px"}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:8}}>Warning: Clear Log</div>
        <div style={{fontSize:13,color:"#64748B",marginBottom:24,lineHeight:1.5}}>
          {type === 'global' 
            ? "This will permanently reset and clear the activity logs for ALL plans. This action cannot be undone. Are you sure you want to proceed?"
            : "This will permanently reset and clear the activity log for this plan. This action cannot be undone. Are you sure you want to proceed?"}
        </div>
        <div style={{display:"flex",gap:12}}>
          <button onClick={onClose} style={{flex:1,background:"#F1F5F9",color:"#475569",border:"none",padding:"10px",borderRadius:8,fontWeight:700,cursor:"pointer"}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,background:"#EF4444",color:"#fff",border:"none",padding:"10px",borderRadius:8,fontWeight:700,cursor:"pointer"}}>
            {loading ? <Spinner size={12} color="#fff" /> : "Yes, Clear Log"}
          </button>
        </div>
      </div>
    </div>
  );
};
