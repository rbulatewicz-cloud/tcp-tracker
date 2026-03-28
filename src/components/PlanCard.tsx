import React from 'react';
import { PlanHeader } from './PlanHeader';
import { StatusSection } from './PlanCardSections/StatusSection';
import { ProgressionHistory } from './PlanCardSections/ProgressionHistory';
import { FieldsGrid } from './PlanCardSections/FieldsGrid';
import { ImpactRequirementsDisplay } from './PlanCardSections/ImpactRequirementsDisplay';
import { HoursOfWorkDisplay } from './PlanCardSections/HoursOfWorkDisplay';
import { ComplianceSection } from './PlanCardSections/ComplianceSection';
import { PlanNotes } from './PlanCardSections/PlanNotes';
import { Documents } from './PlanCardSections/Documents';
import { ActivityLog } from './PlanCardSections/ActivityLog';
import { CommunityOutreach } from './PlanCardSections/CommunityOutreach';
import { CollapsibleSection } from './CollapsibleSection';
import { useCommunityOutreach } from '../hooks/useCommunityOutreach';
import { PlanCardProvider } from './PlanCardProvider';
import { PlanCardActions } from './PlanCardActions';
import { ImportBanner } from './PlanCardSections/ImportBanner';
import { useApp } from '../hooks/useApp';
import { getLocalDateString } from '../utils/plans';
import { usePlanCardContext } from '../hooks/usePlanCardContext';

// Visual group divider with label
const GroupLabel = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 px-7 pt-4 pb-0">
    <div className="flex-1 h-px bg-slate-100" />
    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">{label}</span>
    <div className="flex-1 h-px bg-slate-100" />
  </div>
);

const PlanCardComponent: React.FC = () => {
  const { planManagement, planActions, permissions, auth, firestoreData, uiState } = useApp();
  const { selectedPlan } = planManagement;
  if (!selectedPlan) return null;
  const [statusDate, setStatusDate] = React.useState(getLocalDateString());
  const { isOpen, isTriggered, toggle } = useCommunityOutreach(selectedPlan || {} as any);

  const contextValue = usePlanCardContext(planManagement, planActions, permissions, auth, firestoreData, statusDate, setStatusDate, uiState.isPermissionEditingMode);

  return (
    <PlanCardProvider value={contextValue}>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-5" onClick={e=>{if(e.target===e.currentTarget)planActions.handleClosePlanCard();}}>
        <div className="bg-white rounded-2xl p-0 w-full max-w-[580px] max-h-[90vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex-shrink-0 p-5 pb-0 border-b border-slate-100">
            <PlanHeader />
            <ImportBanner />
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── Status & Workflow ── */}
            <CollapsibleSection title="Status">
              <StatusSection />
            </CollapsibleSection>

            <CollapsibleSection title="Progression History" defaultOpen={false}>
              <ProgressionHistory />
            </CollapsibleSection>

            {/* ── Plan Details ── */}
            <GroupLabel label="Plan Details" />

            <CollapsibleSection title="Scope & Location">
              <FieldsGrid />
            </CollapsibleSection>

            {/* ── Work Conditions ── */}
            <GroupLabel label="Work Conditions" />

            <CollapsibleSection title="Hours of Work">
              <HoursOfWorkDisplay />
            </CollapsibleSection>

            <CollapsibleSection title="Impacts & Requirements">
              <ImpactRequirementsDisplay />
            </CollapsibleSection>

            <CollapsibleSection title="Compliance">
              <ComplianceSection />
            </CollapsibleSection>

            {/* ── Records ── */}
            <GroupLabel label="Records" />

            <CollapsibleSection title="Notes">
              <PlanNotes />
            </CollapsibleSection>

            <CollapsibleSection title="Documents">
              <Documents />
            </CollapsibleSection>

            {/* ── Stakeholders ── */}
            <GroupLabel label="Stakeholders" />

            <CollapsibleSection
              title="Community Outreach"
              isOpen={isOpen}
              onToggle={toggle}
              highlight={isTriggered}
            >
              <CommunityOutreach />
            </CollapsibleSection>

            {/* ── Audit ── */}
            <CollapsibleSection title="Activity Log" defaultOpen={false}>
              <ActivityLog />
            </CollapsibleSection>

          </div>

          <PlanCardActions />
        </div>
      </div>
    </PlanCardProvider>
  );
};

export const PlanCard = React.memo(PlanCardComponent);
