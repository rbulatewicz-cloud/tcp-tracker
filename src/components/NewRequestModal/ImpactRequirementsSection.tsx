import React from 'react';
import { FIELD_REGISTRY, MOT_FIELDS, IMPACT_FIELDS } from '../../constants';
import { Label } from '../ui/Label';
import { Checkbox } from '../ui/Checkbox';

interface ImpactRequirementsSectionProps {
  form: any;
  setForm: any;
}

export const ImpactRequirementsSection: React.FC<ImpactRequirementsSectionProps> = ({ form, setForm }) => {
  const impactFields = IMPACT_FIELDS;

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Label className="mb-3">Impacts and Requirements</Label>
      
      <div className="mb-4 text-[10px] text-slate-500">All fields required — helps the traffic team optimize plan development.</div>
      {MOT_FIELDS.map((field)=>{
        const k = field.key;
        const val = form[k];
        const unanswered = val === undefined || val === null;
        return(
          <div key={k} className={`mb-3 rounded-lg border-[1.5px] bg-white p-3 ${unanswered?"border-sky-100":"border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-900">{field.label} <span className="text-red-600">*</span></div>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <button onClick={()=>setForm((prev: any)=>({...prev,[k]:true}))} className={`rounded-md px-3.5 py-1 text-[11px] font-bold transition-all ${val===true?"border-2 border-emerald-500 bg-emerald-50 text-emerald-600":"border border-slate-200 bg-white text-slate-400"}`}>Yes</button>
                <button onClick={()=>setForm((prev: any)=>({...prev,[k]:false}))} className={`rounded-md px-3.5 py-1 text-[11px] font-bold transition-all ${val===false?"border-2 border-slate-600 bg-slate-100 text-slate-900":"border border-slate-200 bg-white text-slate-400"}`}>No</button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="my-6 grid grid-cols-2 gap-2">
        {impactFields.map((field) => (
          <Checkbox 
            key={field.key} 
            label={field.label} 
            checked={!!form[field.key]} 
            onChange={(e) => setForm((prev: any) => ({...prev, [field.key]: e.target.checked}))}
            className="rounded border-slate-300"
          />
        ))}
      </div>
    </div>
  );
};
