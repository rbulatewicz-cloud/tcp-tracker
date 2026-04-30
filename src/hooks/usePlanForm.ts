import React, { useState, useEffect } from 'react';
import { submitPlan } from '../services/planService';
import { peekNextLocNumber } from '../services/locService';
import { showToast } from '../lib/toast';
import { Plan, PlanForm, LoadingState, User, UserRole } from '../types';

const EMPTY_FORM: PlanForm = {
  id: "",
  rev: 0,
  loc: "",
  requestedBy: "",
  type: "",
  scope: "Water",
  segment: "A1",
  street1: "",
  street2: "",
  lead: "Justin",
  priority: "Medium",
  needByDate: "",
  notes: "",
  dir_nb: false,
  dir_sb: false,
  dir_directional: false,
  impact_krail: false,
  impact_driveway: false,
  impact_fullClosure: false,
  impact_sidewalkClosure: false,
  impact_crosswalkClosure: false,
  impact_busStop: false,
  impact_transit: false,
  impact_i5Freeway: false,
  impact_uprrBridge: false,
  tansatPhases: [],
  work_hours: undefined,
  phe_justification: '',
  planDurationDays: undefined,
  driveway_addresses: [],
  attachments: [],
  approvedTCPs: [],
  approvedLOCs: [],
  isCriticalPath: false,
};

export const usePlanForm = (
  plans: Plan[],
  td: string,
  getUserLabel: () => string,
  setShowForm: (show: boolean) => void,
  setSubmissionSuccess: (success: { show: boolean; pos: number; id: string }) => void,
  setLoading: React.Dispatch<React.SetStateAction<LoadingState>>,
  currentUser: User | null = null
) => {
  const [form, setForm] = useState<PlanForm>({
    ...EMPTY_FORM,
    requestedBy: currentUser?.name || "",
  });

  // Re-sync requestedBy if user logs in after the form was first rendered
  useEffect(() => {
    if (currentUser?.name) {
      setForm(prev => ({
        ...prev,
        requestedBy: prev.requestedBy || currentUser.name,
      }));
    }
  }, [currentUser?.name]);

  // Pre-fill LOC for ADMIN/MOT with a non-reserving peek at the next number
  useEffect(() => {
    const role = currentUser?.role;
    if (role === UserRole.ADMIN || role === UserRole.MOT) {
      peekNextLocNumber(plans).then(loc => {
        setForm(prev => ({ ...prev, loc: prev.loc || loc }));
      }).catch(() => {});
    }
  }, [currentUser?.role]);

  const handleSubmit = async (motAllAnswered: boolean) => {
    if (!form.street1 || !form.needByDate || !motAllAnswered) return;

    setLoading(prev => ({ ...prev, submit: true }));

    try {
      // Determine LOC to use. ADMIN/MOT have an editable pre-filled field; SFTC has none.
      // Both paths use peekNextLocNumber (read-only) — the counter is never written here.
      // Once the plan is saved, maxLocFromPlans naturally advances the sequence.
      // This prevents wasted LOC numbers when a submit fails or the user cancels mid-flow.
      let locToUse = form.loc?.trim();
      if (!locToUse) {
        locToUse = await peekNextLocNumber(plans);
        setForm(prev => ({ ...prev, loc: locToUse! }));
      }

      const { queuePos, id } = await submitPlan(
        { ...(form as unknown as Partial<Plan> & { attachments: File[] }), loc: locToUse },
        plans,
        td,
        getUserLabel
      );

      setForm({
        ...EMPTY_FORM,
        requestedBy: currentUser?.name || "",
      });
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
    const role = currentUser?.role;
    const baseForm = { ...EMPTY_FORM, requestedBy: currentUser?.name || "" };
    if (role === UserRole.ADMIN || role === UserRole.MOT) {
      peekNextLocNumber(plans).then(loc => {
        setForm({ ...baseForm, loc });
      }).catch(() => setForm(baseForm));
    } else {
      setForm(baseForm);
    }
    setShowForm(false);
  };

  return { form, setForm, handleSubmit, resetForm };
};
