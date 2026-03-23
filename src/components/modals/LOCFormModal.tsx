import React from 'react';
import { Plan } from '../../types';

interface LOCForm {
  locNumber: string;
  revision: number;
  startDate: string;
  endDate: string;
  dotSubmittalDate: string;
  planIds: string[];
  notes: string;
  file: File | null;
  isNewRevision?: boolean;
}

interface LOCRecord {
  id: string;
  locNumber: string;
  revision: number;
  fileUrl?: string;
  fileName?: string;
  [key: string]: unknown;
}

interface LOCFormModalProps {
  showLOCForm: boolean;
  setShowLOCForm: (show: boolean) => void;
  selectedLOC: LOCRecord | null;
  locForm: LOCForm;
  setLocForm: React.Dispatch<React.SetStateAction<LOCForm>>;
  planSearch: string;
  setPlanSearch: (s: string) => void;
  plans: Plan[];
  submitLOC: () => Promise<void>;
  uploadLoading: boolean;
  inp: React.CSSProperties;
  lbl: React.CSSProperties;
  font: string;
}

export const LOCFormModal: React.FC<LOCFormModalProps> = ({
  showLOCForm, setShowLOCForm, selectedLOC, locForm, setLocForm,
  planSearch, setPlanSearch, plans, submitLOC, uploadLoading, inp, lbl, font
}) => {
  if (!showLOCForm) return null;

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto",padding:32,boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <h3 style={{fontSize:20,fontWeight:800,color:"#0F172A",margin:0}}>{selectedLOC ? (locForm.isNewRevision ? "New Revision" : "Edit LOC") : "New LOC"}</h3>
          <button onClick={()=>setShowLOCForm(false)} style={{background:"none",border:"none",color:"#64748B",cursor:"pointer"}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={lbl}>LOC Number</div>
            <input
              type="text"
              value={locForm.locNumber || ""}
              onChange={(e)=>setLocForm({...locForm, locNumber: e.target.value})}
              style={{...inp, width:"100%"}}
              placeholder="e.g. LOC-2024-001"
              disabled={!!(selectedLOC && !locForm.isNewRevision)}
            />
          </div>
          <div>
            <div style={lbl}>Revision</div>
            <input
              type="number"
              value={locForm.revision || 1}
              onChange={(e)=>setLocForm({...locForm, revision: parseInt(e.target.value) || 1})}
              style={{...inp, width:"100%"}}
            />
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
            <div>
              <div style={lbl}>Start Date</div>
              <input
                type="date"
                value={locForm.startDate || ""}
                onChange={(e)=>setLocForm({...locForm, startDate: e.target.value})}
                style={{...inp, width:"100%"}}
              />
            </div>
            <div>
              <div style={lbl}>End Date</div>
              <input
                type="date"
                value={locForm.endDate || ""}
                onChange={(e)=>setLocForm({...locForm, endDate: e.target.value})}
                style={{...inp, width:"100%"}}
              />
            </div>
          </div>
          <div>
            <div style={lbl}>Associated Plans (Comma separated IDs)</div>
            <div style={{position:"relative"}}>
              <input
                type="text"
                value={(locForm.planIds || []).join(", ")}
                onChange={(e)=>setLocForm({...locForm, planIds: e.target.value.split(",").map(s=>s.trim()).filter(s=>s)})}
                style={{...inp, width:"100%"}}
                placeholder="e.g. TCP-001, TCP-002"
              />
              <div style={{marginTop:8}}>
                <input
                  type="text"
                  placeholder="Search plans to add..."
                  value={planSearch}
                  onChange={(e)=>setPlanSearch(e.target.value)}
                  style={{...inp, width:"100%", fontSize:12, padding:"8px 12px"}}
                />
                {planSearch && (
                  <div style={{maxHeight:120, overflowY:"auto", border:"1px solid #E2E8F0", borderRadius:8, marginTop:4, background:"#fff"}}>
                    {plans.filter(p =>
                      (p.id?.toLowerCase().includes(planSearch.toLowerCase())) ||
                      (p.street1?.toLowerCase().includes(planSearch.toLowerCase())) ||
                      (p.street2?.toLowerCase().includes(planSearch.toLowerCase()))
                    ).map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (!locForm.planIds.includes(p.id)) {
                            setLocForm({...locForm, planIds: [...locForm.planIds, p.id]});
                          }
                          setPlanSearch("");
                        }}
                        style={{padding:"8px 12px", fontSize:12, cursor:"pointer", borderBottom:"1px solid #F1F5F9"}}
                        onMouseOver={(e)=>e.currentTarget.style.background="#F8FAFC"}
                        onMouseOut={(e)=>e.currentTarget.style.background="transparent"}
                      >
                        <span style={{fontWeight:700}}>{p.id}</span> - {p.street1 || "No Street Info"} {p.street2 ? `& ${p.street2}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            <div style={lbl}>Notes</div>
            <textarea
              value={locForm.notes || ""}
              onChange={(e)=>setLocForm({...locForm, notes: e.target.value})}
              style={{...inp, width:"100%", height:80, resize:"none"}}
            />
          </div>

          <div style={{background:"#F8FAFC", padding:16, borderRadius:12, border:"1px solid #E2E8F0"}}>
            <div style={{fontSize:12, fontWeight:800, color:"#475569", textTransform:"uppercase", letterSpacing:0.5, marginBottom:12}}>DOT Submittal Status</div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"center"}}>
              <div>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div style={lbl}>Submittal Date</div>
                  {locForm.dotSubmittalDate && (
                    <button
                      onClick={() => setLocForm({...locForm, dotSubmittalDate: ""})}
                      style={{fontSize:10, color:"#EF4444", cursor:"pointer", background:"none", border:"none", fontWeight:700}}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={locForm.dotSubmittalDate || ""}
                  onChange={(e)=>setLocForm({...locForm, dotSubmittalDate: e.target.value})}
                  style={{...inp, width:"100%"}}
                />
              </div>
              {locForm.dotSubmittalDate && (
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10, color:"#64748B", fontWeight:700, textTransform:"uppercase"}}>Duration in DOT</div>
                  <div style={{fontSize:24, fontWeight:800, color:"#D97706"}}>
                    {Math.ceil(Math.abs(new Date().getTime() - new Date(locForm.dotSubmittalDate).getTime()) / (1000 * 60 * 60 * 24))}d
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <div style={lbl}>LOC Document (PDF)</div>
            <input
              type="file"
              accept=".pdf"
              onChange={(e)=>setLocForm({...locForm, file: e.target.files?.[0] || null})}
              style={{...inp, width:"100%"}}
            />
          </div>

          <button
            onClick={submitLOC}
            disabled={uploadLoading}
            style={{background:"#0F172A",color:"#fff",border:"none",padding:"14px",borderRadius:12,fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:font,marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:8}}
          >
            {uploadLoading ? "Uploading..." : (selectedLOC ? (locForm.isNewRevision ? "Upload New Revision" : "Save Changes") : "Create LOC")}
          </button>
        </div>
      </div>
    </div>
  );
};
