import React from 'react';
import { PlanHeader } from './PlanHeader';
import { StatusSection } from './PlanCardSections/StatusSection';
import { ProgressionHistory } from './PlanCardSections/ProgressionHistory';
import { FieldsGrid } from './PlanCardSections/FieldsGrid';
import { ImpactRequirementsDisplay } from './PlanCardSections/ImpactRequirementsDisplay';
import { PlanNotes } from './PlanCardSections/PlanNotes';
import { Documents } from './PlanCardSections/Documents';
import { ActivityLog } from './PlanCardSections/ActivityLog';
import { CommunityOutreach } from './PlanCardSections/CommunityOutreach';
import { CollapsibleSection } from './CollapsibleSection';
import { useCommunityOutreach } from '../hooks/useCommunityOutreach';
import { PlanCardProvider } from './PlanCardProvider';
import { PlanCardActions } from './PlanCardActions';
import { useApp } from '../hooks/useApp';
import { getLocalDateString } from '../utils/plans';
import { usePlanCardContext } from '../hooks/usePlanCardContext';

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
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 pb-0">
              <PlanHeader />
            </div>
            
            <CollapsibleSection title="Status">
              <StatusSection />
            </CollapsibleSection>
              
            <CollapsibleSection title="Status Progression History">
              <ProgressionHistory />
            </CollapsibleSection>
            
            <CollapsibleSection title="Plan Details">
              <FieldsGrid />
            </CollapsibleSection>

            <CollapsibleSection title="Impacts & Requirements">
              <ImpactRequirementsDisplay />
            </CollapsibleSection>

            <CollapsibleSection title="Notes">
              <PlanNotes />
            </CollapsibleSection>

            <CollapsibleSection 
              title="Community Outreach" 
              isOpen={isOpen} 
              onToggle={toggle}
              highlight={isTriggered}
            >
              <CommunityOutreach />
            </CollapsibleSection>

            <CollapsibleSection title="Documents">
              <Documents />
            </CollapsibleSection>

            <CollapsibleSection title="ActivityLog">
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
