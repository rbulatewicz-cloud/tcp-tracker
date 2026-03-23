import React from 'react';

interface LoginModalProps {
  showLogin: boolean;
  setShowLogin: (show: boolean) => void;
  handleLogin: () => void;
  font: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ showLogin, setShowLogin, handleLogin, font }) => {
  if (!showLogin) return null;

  return (
    <div
      style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:110}}
      onClick={e => { if (e.target === e.currentTarget) setShowLogin(false); }}
    >
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:360,boxShadow:"0 25px 50px rgba(0,0,0,0.15)"}}>
        <div style={{textAlign:"center", marginBottom:24}}>
          <div style={{width:48,height:48,background:"#F59E0B",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#fff",margin:"0 auto 12px"}}>T</div>
          <div style={{fontSize:18,fontWeight:800,color:"#0F172A"}}>Team Sign In</div>
          <div style={{fontSize:12,color:"#94A3B8",marginTop:4}}>Sign in to access ESFV LRT Tracker</div>
        </div>
        <button
          onClick={handleLogin}
          style={{width:"100%", background:"#0F172A", color:"#fff", border:"none", padding:"12px", borderRadius:10, fontWeight:700, cursor:"pointer", fontSize:14, fontFamily:font, display:"flex", alignItems:"center", justifyContent:"center", gap:10}}
        >
          Sign In with Google
        </button>
        <button
          onClick={() => setShowLogin(false)}
          style={{width:"100%", background:"transparent", color:"#94A3B8", border:"none", padding:"12px", borderRadius:10, fontWeight:600, cursor:"pointer", fontSize:12, fontFamily:font, marginTop:8}}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
