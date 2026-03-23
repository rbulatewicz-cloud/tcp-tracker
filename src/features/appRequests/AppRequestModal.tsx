import React from 'react';
import { Spinner } from '../../components/Spinner';

interface AppRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: { description: string; files: (File | string)[] };
  setForm: React.Dispatch<React.SetStateAction<{ description: string; files: (File | string)[] }>>;
  onSubmit: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  inp: any;
  lbl: any;
}

export const AppRequestModal: React.FC<AppRequestModalProps> = ({
  isOpen, onClose, form, setForm, onSubmit, onFileUpload, isLoading, inp, lbl
}) => {
  if (!isOpen) return null;

  return (
    <div
      onPaste={(e) => {
        const pastedFiles = Array.from(e.clipboardData.files);
        if (pastedFiles.length > 0) {
          setForm(prev => ({ ...prev, files: [...prev.files, ...pastedFiles] }));
        }
      }}
      style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}
    >
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)"}}>
        <div style={{padding:"24px 32px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff",zIndex:10}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,color:"#0F172A"}}>Request App Change</h2>
            <p style={{fontSize:12,color:"#64748B",marginTop:2}}>Help us improve the application</p>
          </div>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",width:32,height:32,borderRadius:8,cursor:"pointer",color:"#64748B",fontWeight:700}}>✕</button>
        </div>
        
        <div style={{padding:32}}>
          <div style={{marginBottom:24}}>
            <label style={lbl}>Description of Change</label>
            <textarea 
              value={form.description || ""}
              onChange={(e)=>setForm(prev=>({...prev, description: e.target.value}))}
              placeholder="Describe what you'd like to change or add... (You can also paste images from your clipboard)"
              style={{...inp, height:120, resize:"vertical"}}
            />
          </div>

          <div style={{marginBottom:32}}>
            <label style={lbl}>Attached Files & Screenshots</label>
            <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:12}}>
              {form.files.map((f, i) => {
                const isImage = typeof f === 'string' ? (f.startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)(\?|$)/i.test(f)) : f.type.startsWith("image/");
                const previewUrl = typeof f === 'string' ? f : URL.createObjectURL(f);
                return (
                  <div key={i} style={{position:"relative", width:80, height:80, borderRadius:12, overflow:"hidden", border:"1px solid #E2E8F0", boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1)", background:"#F8FAFC"}}>
                    {isImage ? (
                      <img src={previewUrl} alt="File" style={{width:"100%", height:"100%", objectFit:"cover"}} />
                    ) : (
                      <div style={{height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, color:"#64748B", fontSize:9, fontWeight:700, textAlign:"center", padding:4}}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                        <span style={{fontSize:8, textTransform:"uppercase", overflow:"hidden", textOverflow:"ellipsis", width:"100%"}}>{typeof f === 'string' ? "FILE" : f.name}</span>
                      </div>
                    )}
                    <button 
                      onClick={()=>setForm(prev=>({...prev, files: prev.files.filter((_, idx)=>idx!==i)}))}
                      style={{position:"absolute", top:4, right:4, background:"rgba(15,23,42,0.6)", backdropFilter:"blur(4px)", color:"#fff", border:"none", width:20, height:20, borderRadius:10, cursor:"pointer", fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.2s", zIndex:2}}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.8)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(15,23,42,0.6)"}
                    >✕</button>
                  </div>
                );
              })}
              <label style={{width:60, height:60, borderRadius:8, border:"2px dashed #CBD5E1", background:"#F8FAFC", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#94A3B8"}}>
                <div style={{margin:"auto"}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div>
                <input type="file" multiple accept="image/*" style={{display:"none"}} onChange={onFileUpload} />
              </label>
            </div>
            <p style={{fontSize:10, color:"#94A3B8"}}>Tip: You can paste images directly from your clipboard.</p>
          </div>

          <div style={{display:"flex", gap:12}}>
            <button 
              onClick={onClose}
              style={{flex:1, padding:"12px", borderRadius:10, border:"1px solid #E2E8F0", background:"#fff", color:"#475569", fontWeight:700, cursor:"pointer"}}
            >Cancel</button>
            <button 
              onClick={onSubmit}
              disabled={isLoading}
              style={{flex:2, padding:"12px", borderRadius:10, border:"none", background:"#6366F1", color:"#fff", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8}}
            >
              {isLoading ? <Spinner color="#fff" /> : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
