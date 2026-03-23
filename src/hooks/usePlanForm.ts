import React, { useState } from 'react';
import { submitPlan } from '../services/planService';
import { showToast } from '../lib/toast';
import { Plan, PlanForm, LoadingState } from '../types';

const EMPTY_FORM = {
  id: "",
  rev: 0,
  loc:"", type:"Standard", scope:"Water", segment:"A1", street1:"", street2:"", lead:"Justin", priority:"Medium", needByDate:"", notes:"",
  dir_nb: false, dir_sb: false, dir_directional: false,
  mot_peakHour:null, mot_extDuration:null, mot_noiseVariance:null,
  impact_driveway: false, impact_fullClosure: false, impact_busStop: false, impact_transit: false,
  attachments: [],
  approvedTCPs: [],
  approvedLOCs: [],
  isCriticalPath: false
};

export const usePlanForm = (plans: Plan[], td: string, getUserLabel: () => string, setShowForm: (show: boolean) => void, setSubmissionSuccess: (success: { show: boolean; pos: number; id: string }) => void, setLoading: React.Dispatch<React.SetStateAction<LoadingState>>) => {
  const [form, setForm] = useState<PlanForm>({ ...EMPTY_FORM });

  const handleSubmit = async (motAllAnswered: boolean) => {
    if (!form.street1 || !form.needByDate || !motAllAnswered) return;

    setLoading(prev => ({ ...prev, submit: true }));

    try {
      const { queuePos, id } = await submitPlan(form as unknown as Partial<Plan> & { attachments: File[] }, plans, td, getUserLabel);

      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      setSubmissionSuccess({ show: true, pos: queuePos, id });
    } catch (error: unknown) {
      console.error("Error submitting plan:", error);
      showToast((error instanceof Error ? error.message : null) || "Failed to submit request.", "error");
    } finally {
      setLoading(prev => ({ ...prev, submit: false }));
    }
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  };

  return {
    form,
    setForm,
    handleSubmit,
    resetForm
  };
};
