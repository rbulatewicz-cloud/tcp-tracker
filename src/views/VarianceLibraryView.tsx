import React, { useEffect, useState } from 'react';
import { ShieldCheck, Inbox, Building2, FileText } from 'lucide-react';
import { User, AppConfig, Plan, DrivewayLetter } from '../types';
import { NoiseVariancesSection } from './library/NoiseVariancesSection';
import { DrivewayLettersSection } from './library/DrivewayLettersSection';
import { CRQueueSection, crQueueCount } from './library/CRQueueSection';
import { DrivewayPropertiesSection } from './library/DrivewayPropertiesSection';
import { subscribeToDrivewayLetters } from '../services/drivewayLetterService';

interface VarianceLibraryViewProps {
  currentUser: User | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}

type LibTab = 'noise_variances' | 'cr_queue' | 'properties';
type PropertiesSubTab = 'records' | 'letters';

export default function VarianceLibraryView({ currentUser, appConfig, plans, setSelectedPlan }: VarianceLibraryViewProps) {
  const [tab, setTab] = useState<LibTab>('noise_variances');
  const [propertiesSubTab, setPropertiesSubTab] = useState<PropertiesSubTab>('records');
  const [letters, setLetters] = useState<DrivewayLetter[]>([]);
  const [planFilter, setPlanFilter] = useState<{ id: string; loc: string } | null>(null);
  useEffect(() => subscribeToDrivewayLetters(setLetters), []);

  /** Called from CR Queue "Open" — jumps to Library → Properties → All Letters filtered to this plan */
  function openPlanInLetters(plan: Plan) {
    setPlanFilter({ id: plan.id, loc: plan.loc || plan.id });
    setTab('properties');
    setPropertiesSubTab('letters');
  }

  const leadTimeDays = appConfig.driveway_leadTimeDays ?? 10;
  const reissueDays  = appConfig.driveway_reissueDays  ?? 5;
  const queueCount = crQueueCount(plans, letters, leadTimeDays, reissueDays);

  const TABS: { id: LibTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'noise_variances', label: 'Noise Variances', icon: <ShieldCheck size={14} /> },
    { id: 'cr_queue',        label: 'CR Queue',        icon: <Inbox size={14} />, badge: queueCount },
    { id: 'properties',      label: 'Properties',      icon: <Building2 size={14} /> },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Library</h1>
        <p className="text-sm text-slate-500 mt-0.5">Permits, notices, and compliance documents</p>
      </div>

      {/* Main tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Section content */}
      {tab === 'noise_variances' && (
        <NoiseVariancesSection currentUser={currentUser} appConfig={appConfig} plans={plans} setSelectedPlan={setSelectedPlan} />
      )}
      {tab === 'cr_queue' && (
        <CRQueueSection plans={plans} appConfig={appConfig} onOpenPlanLetters={openPlanInLetters} currentUser={currentUser} />
      )}
      {tab === 'properties' && (
        <div>
          {/* Sub-tab toggle */}
          <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setPropertiesSubTab('records')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                propertiesSubTab === 'records'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Building2 size={12} />
              Property Records
              <span className="ml-1 text-[10px] font-bold text-slate-400">
                ({letters.filter(l => l.propertyId && l.propertyId !== '').length > 0
                  ? `${new Set(letters.filter(l => l.propertyId && l.propertyId !== '').map(l => l.propertyId)).size} linked`
                  : '—'})
              </span>
            </button>
            <button
              onClick={() => setPropertiesSubTab('letters')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                propertiesSubTab === 'letters'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText size={12} />
              All Letters
              <span className="ml-1 text-[10px] font-bold text-slate-400">({letters.length})</span>
            </button>
          </div>

          {propertiesSubTab === 'records' && (
            <DrivewayPropertiesSection
              currentUser={currentUser}
              allLetters={letters}
              plans={plans}
              setSelectedPlan={setSelectedPlan}
            />
          )}
          {propertiesSubTab === 'letters' && (
            <DrivewayLettersSection
              currentUser={currentUser}
              appConfig={appConfig}
              allLetters={letters}
              planFilter={planFilter}
              onClearPlanFilter={() => setPlanFilter(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
