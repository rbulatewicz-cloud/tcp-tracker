import React from 'react';
import { usePlanCard } from './PlanCardContext';

export const UpdateStatus: React.FC = () => {
  const {
    canEditPlan,
    canView,
    currentUser,
    UserRole,
    statusDate,
    setStatusDate,
    STAGES,
    selectedPlan,
    updateStage,
    handleDOTCommentsRec,
  } = usePlanCard();

  if (!canEditPlan || !canView('status') || currentUser?.role === UserRole.SFTC) {
    return null;
  }

  return (
    <div className="mb-5">
      <div className="text-[8px] text-slate-400 font-bold tracking-widest uppercase mb-1">Update Status</div>
      {(currentUser?.role === UserRole.ADMIN) && (
        <div className="mb-2">
          <input type="date" value={statusDate} onChange={(e) => setStatusDate(e.target.value)} className="p-1 rounded border border-slate-200" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex gap-1 flex-wrap">
          {STAGES.map(s=>{
            let label = s.label;
            if (s.key === 'drafting') {
              const draftingLogs = selectedPlan.log.filter((l: any) => l.action.includes("Drafting"));
              if (draftingLogs.length > 1) {
                label = `Drafting Rev.${draftingLogs.length}`;
              }
            }
            if (s.key === 'submitted') {
              const dotLogs = selectedPlan.log.filter((l: any) => l.action.includes("Submitted to DOT"));
              if (dotLogs.length > 0) {
                label = `Submitted to DOT Rev.${dotLogs.length}`;
              }
            }
            return (
              <button 
                key={s.key} 
                onClick={()=>updateStage(selectedPlan.id,s.key,statusDate)} 
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold cursor-pointer"
                style={{
                  background: selectedPlan.stage === s.key ? s.color : "#F8FAFC",
                  border: `1px solid ${selectedPlan.stage === s.key ? s.color : "#E2E8F0"}`,
                  color: selectedPlan.stage === s.key ? "#fff" : "#64748B"
                }}
              >{label}</button>
            );
          })}
        </div>
        {selectedPlan.stage === 'submitted' && (
          <button 
            onClick={()=>handleDOTCommentsRec(selectedPlan.id)} 
            className="border border-dotted border-amber-500 text-amber-500 px-2.5 py-1 rounded-md text-[10px] font-semibold cursor-pointer mt-1 w-fit"
          >
            DOT Comments Rec {selectedPlan.log.filter((l: any) => l.action.includes("DOT Comments Received")).length > 0 ? `(Rev.${selectedPlan.log.filter((l: any) => l.action.includes("DOT Comments Received")).length})` : ""}
          </button>
        )}
      </div>
    </div>
  );
};
