import React from 'react';
import { Spinner } from '../../components/Spinner';

interface AppRequestSidebarProps {
  onClose: () => void;
  form: { description: string; files: (File | string)[] };
  setForm: React.Dispatch<React.SetStateAction<{ description: string; files: (File | string)[] }>>;
  onSubmit: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  inp: any;
  lbl: any;
}

export const AppRequestSidebar: React.FC<AppRequestSidebarProps> = ({
  onClose, form, setForm, onSubmit, onFileUpload, isLoading, inp, lbl
}) => {
  return (
    <div
      onPaste={(e) => {
        const pastedFiles = Array.from(e.clipboardData.files);
        if (pastedFiles.length > 0) {
          setForm(prev => ({ ...prev, files: [...prev.files, ...pastedFiles] }));
        }
      }}
      style={{display: "flex", flexDirection: "column", height: "100%"}}
    >
      <div style={{padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff"}}>
        <h3 style={{fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0}}>Request App Change</h3>
        <button 
          onClick={onClose}
          style={{background: "transparent", border: "none", color: "#64748B", cursor: "pointer", padding: 4}}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <div style={{padding: 24, flex: 1, overflowY: "auto"}}>
        <div style={{marginBottom: 24}}>
          <label style={lbl}>Description of Change</label>
          <textarea 
            value={form.description || ""}
            onChange={(e)=>setForm(prev=>({...prev, description: e.target.value}))}
            placeholder="Describe what you'd like to change or add..."
            style={{...inp, height: 120, resize: "vertical"}}
          />
        </div>

        <div style={{marginBottom: 32}}>
          <label style={lbl}>Attached Files & Screenshots</label>
          <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12}}>
            {form.files.map((f, i) => {
              const isImage = typeof f === 'string' ? (f.startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)(\?|$)/i.test(f)) : f.type.startsWith("image/");
              const previewUrl = typeof f === 'string' ? f : URL.createObjectURL(f);
              return (
                <div key={i} style={{position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden", border: "1px solid #E2E8F0", background: "#F8FAFC"}}>
                  {isImage ? (
                    <img src={previewUrl} alt="File" style={{width: "100%", height: "100%", objectFit: "cover"}} />
                  ) : (
                    <div style={{height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#64748B", fontSize: 9, fontWeight: 700, textAlign: "center", padding: 4}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                      <span style={{fontSize: 8, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", width: "100%"}}>{typeof f === 'string' ? "FILE" : f.name}</span>
                    </div>
                  )}
                  <button 
                    onClick={()=>setForm(prev=>({...prev, files: prev.files.filter((_, idx)=>idx!==i)}))}
                    style={{position: "absolute", top: 4, right: 4, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", color: "#fff", border: "none", width: 20, height: 20, borderRadius: 10, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center"}}
                  >✕</button>
                </div>
              );
            })}
            <label style={{width: 60, height: 60, borderRadius: 8, border: "2px dashed #CBD5E1", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#94A3B8"}}>
              <div style={{margin: "auto"}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div>
              <input type="file" multiple accept="image/*" style={{display: "none"}} onChange={onFileUpload} />
            </label>
          </div>
        </div>

        <button 
          onClick={onSubmit}
          disabled={isLoading}
          style={{width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8}}
        >
          {isLoading ? <Spinner color="#fff" /> : "Submit Request"}
        </button>
      </div>
    </div>
  );
};
