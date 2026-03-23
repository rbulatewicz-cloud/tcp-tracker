import React from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PermissionToggle } from '../permissions/PermissionToggle';
import { showToast } from '../lib/toast';
import { ReportTemplate, UserRole } from '../types';

interface SettingsViewProps {
  reportTemplate: ReportTemplate;
  setReportTemplate: React.Dispatch<React.SetStateAction<ReportTemplate>>;
  role: string;
  setClearPlansConfirm: (show: boolean) => void;
  setView: (view: string) => void;
  inp: React.CSSProperties;
  lbl: React.CSSProperties;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  reportTemplate, setReportTemplate, role, setClearPlansConfirm, setView, inp, lbl
}) => (
  <div style={{background:"#fff", borderRadius:12, border:"1px solid #E2E8F0", padding:30}}>
    <h2 style={{margin:"0 0 20px 0", fontSize:20, fontWeight:800, color:"#0F172A"}}>Report Template Settings</h2>

    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:40}}>
      <div>
        <div style={lbl}>Report Logo</div>
        <div style={{border:"2px dashed #E2E8F0", borderRadius:12, padding:20, textAlign:"center", marginBottom:10}}>
          {reportTemplate.logo ? (
            <div style={{position:"relative", display:"inline-block"}}>
              <img src={reportTemplate.logo} alt="Logo Preview" style={{maxHeight:80, maxWidth:"100%"}} />
              <button onClick={()=>setReportTemplate(p=>({...p, logo:null}))} style={{position:"absolute", top:-10, right:-10, background:"#EF4444", color:"#fff", border:"none", borderRadius:"50%", width:20, height:20, cursor:"pointer"}}>✕</button>
            </div>
          ) : (
            <div style={{color:"#94A3B8", fontSize:12}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom:8}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <p>Click to upload logo (PNG/JPG)</p>
            </div>
          )}
          <input type="file" accept="image/*" style={{display:"none"}} id="logo-upload" onChange={(e)=>{
            const file = e.target.files?.[0];
            if(file){
              const reader = new FileReader();
              reader.onload = (ev) => setReportTemplate(p=>({...p, logo: ev.target?.result as string}));
              reader.readAsDataURL(file);
            }
          }} />
          <label htmlFor="logo-upload" style={{display:"block", marginTop:10, color:"#3B82F6", fontSize:12, fontWeight:600, cursor:"pointer"}}>Select File</label>
        </div>
        <p style={{fontSize:11, color:"#64748B"}}>This logo will appear in the top-left of all exported PDF reports.</p>
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:15}}>
        <div>
          <PermissionToggle
            fieldName="Company Name"
            allowedEditRoles={['ADMIN']}
            allowedViewRoles={['ADMIN']}
            onToggleEdit={() => {}}
            onToggleView={() => {}}
          />
          <div style={lbl}>Company Name</div>
          <input style={inp} value={reportTemplate.companyName || ""} onChange={(e)=>setReportTemplate(p=>({...p, companyName: e.target.value}))} />
        </div>
        <div>
          <div style={lbl}>Address Line 1</div>
          <input style={inp} value={reportTemplate.address || ""} onChange={(e)=>setReportTemplate(p=>({...p, address: e.target.value}))} />
        </div>
        <div>
          <div style={lbl}>City, State, Zip</div>
          <input style={inp} value={reportTemplate.cityStateZip || ""} onChange={(e)=>setReportTemplate(p=>({...p, cityStateZip: e.target.value}))} />
        </div>
        <div>
          <div style={lbl}>Project Info (One line per row)</div>
          <textarea style={{...inp, height:100, resize:"none"}} value={reportTemplate.projectInfo.join("\n")} onChange={(e)=>setReportTemplate(p=>({...p, projectInfo: e.target.value.split("\n")}))} />
        </div>
        <div style={{marginTop:15}}>
          <div style={lbl}>Need By Date Thresholds (Days)</div>
          <div style={{display:"flex", gap:10, marginTop:5}}>
            <div style={{flex:1}}>
              <div style={{fontSize:10, color:"#64748B"}}>WATCH</div>
              <input type="number" style={inp} value={reportTemplate.needByThresholds?.WATCH || 0} onChange={(e)=>setReportTemplate(p=>({...p, needByThresholds: {...p.needByThresholds, WATCH: parseInt(e.target.value)}}))} />
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:10, color:"#64748B"}}>Standard</div>
              <input type="number" style={inp} value={reportTemplate.needByThresholds?.Standard || 0} onChange={(e)=>setReportTemplate(p=>({...p, needByThresholds: {...p.needByThresholds, Standard: parseInt(e.target.value)}}))} />
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:10, color:"#64748B"}}>Engineered</div>
              <input type="number" style={inp} value={reportTemplate.needByThresholds?.Engineered || 0} onChange={(e)=>setReportTemplate(p=>({...p, needByThresholds: {...p.needByThresholds, Engineered: parseInt(e.target.value)}}))} />
            </div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, marginTop:15}}>
          <input
            type="checkbox"
            id="show-charts"
            checked={reportTemplate.showMetricCharts}
            onChange={(e)=>setReportTemplate(p=>({...p, showMetricCharts: e.target.checked}))}
            style={{width:16, height:16, cursor:"pointer"}}
          />
          <label htmlFor="show-charts" style={{fontSize:13, fontWeight:600, color:"#1E293B", cursor:"pointer"}}>Show Metric Trend Charts (SFTC+ only)</label>
        </div>
      </div>
    </div>

    <div style={{marginTop:30, paddingTop:20, borderTop:"1px solid #F1F5F9", display:"flex", justifyContent:"flex-end"}}>
      <button
        onClick={async ()=>{
          try {
            await setDoc(doc(db, 'settings', 'reportTemplate'), reportTemplate);
            setView("table");
          } catch (error) {
            console.error("Error saving settings:", error);
            showToast("Failed to save settings.", "error");
          }
        }}
        style={{background:"#0F172A", color:"#fff", border:"none", padding:"10px 24px", borderRadius:8, fontWeight:700, cursor:"pointer"}}
      >
        Save Settings
      </button>
    </div>

    {role === UserRole.ADMIN && (
      <div style={{marginTop:40, paddingTop:30, borderTop:"1px solid #E2E8F0"}}>
        <h2 style={{margin:"0 0 10px 0", fontSize:16, fontWeight:800, color:"#EF4444"}}>Danger Zone</h2>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:12, padding:20}}>
          <div>
            <div style={{fontSize:14, fontWeight:700, color:"#991B1B"}}>Wipe TCP Tracker Clean</div>
            <div style={{fontSize:12, color:"#B91C1C", marginTop:4}}>This will permanently delete all plans, logs, and associated data. This action cannot be undone.</div>
          </div>
          <button
            onClick={() => setClearPlansConfirm(true)}
            style={{background:"#EF4444", color:"#fff", border:"none", padding:"10px 20px", borderRadius:8, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap"}}
          >
            Clear All Plans
          </button>
        </div>
      </div>
    )}
  </div>
);
