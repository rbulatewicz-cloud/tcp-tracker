import React from 'react';
import { usePlanCardStructured as usePlanCard } from './PlanCardContext';

export const PlanCardActions: React.FC = () => {
  const { data, actions } = usePlanCard();
  const { isDirty } = data;
  const { saveDraft, discardDraft } = actions;

  if (!isDirty) return null;

  return (
    <div className="px-7 py-4 border-t border-slate-100 bg-red-50">
      <div className="flex gap-2">
        <button 
          onClick={saveDraft} 
          className="bg-slate-900 text-white border-none px-4 py-2 rounded-md text-[12px] font-bold cursor-pointer"
        >
          Save Changes
        </button>
        <button 
          onClick={discardDraft} 
          className="bg-white text-red-500 border border-red-500 px-4 py-2 rounded-md text-[12px] font-bold cursor-pointer"
        >
          Discard Changes
        </button>
      </div>
    </div>
  );
};
