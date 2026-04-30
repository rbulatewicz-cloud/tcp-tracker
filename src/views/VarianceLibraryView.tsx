import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap, Home, BookOpen, ParkingSquare } from 'lucide-react';
import { User, AppConfig, Plan, DrivewayLetter } from '../types';
import { NoiseVariancesSection } from './library/NoiseVariancesSection';
import { SmartLinker } from './library/SmartLinker';
import { DrivewayLinker } from './library/DrivewayLinker';
import { ReferenceLibrarySection } from './library/ReferenceLibrarySection';
import { TansatLogSection } from './library/TansatLogSection';
import { subscribeToDrivewayLetters } from '../services/drivewayLetterService';

interface VarianceLibraryViewProps {
  currentUser: User | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}

type LibTab = 'noise_variances' | 'nv_linker' | 'driveway_linker' | 'tansat_log' | 'reference';

export default function VarianceLibraryView({ currentUser, appConfig, plans, setSelectedPlan }: VarianceLibraryViewProps) {
  const [tab, setTab] = useState<LibTab>('noise_variances');
  const [letters, setLetters] = useState<DrivewayLetter[]>([]);
  useEffect(() => subscribeToDrivewayLetters(setLetters), []);

  const nvUnlinkedCount = plans.filter(p => {
    const track = p.compliance?.noiseVariance;
    if (!track || ['expired', 'plan_approved', 'completed', 'withdrawn', 'cancelled'].includes(p.stage)) return false;
    const ids = track.linkedVarianceIds?.length ? track.linkedVarianceIds : track.linkedVarianceId ? [track.linkedVarianceId] : [];
    return ids.length === 0;
  }).length;

  const phePendingCount = plans.filter(p =>
    p.compliance?.phe &&
    !['approved', 'linked_existing', 'na', 'expired'].includes(p.compliance.phe.status) &&
    !['expired', 'plan_approved', 'completed', 'withdrawn', 'cancelled'].includes(p.stage)
  ).length;

  const smartLinkerBadge = nvUnlinkedCount + phePendingCount;

  const dwayUnlinkedCount = letters.filter(l => !(l.linkedPlanLocs?.length) && !l.planLoc).length;

  const TABS: { id: LibTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'noise_variances',  label: 'Noise Variances',  icon: <ShieldCheck size={14} /> },
    { id: 'nv_linker',        label: 'NV Linker',        icon: <Zap size={14} />,      badge: smartLinkerBadge },
    { id: 'driveway_linker',  label: 'Driveway Linker',  icon: <Home size={14} />,     badge: dwayUnlinkedCount },
    { id: 'tansat_log',       label: 'TANSAT Log',       icon: <ParkingSquare size={14} /> },
    { id: 'reference',        label: 'Reference Docs',   icon: <BookOpen size={14} /> },
  ];

  const isFullWidth = tab === 'driveway_linker';

  return (
    <div className={isFullWidth ? 'flex flex-col h-[calc(100vh-4rem)]' : ''}>

      {/* Header + tabs — always constrained */}
      <div className="max-w-5xl mx-auto px-6 pt-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Library</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Noise variances, permits, and compliance documents</p>
        </div>

        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
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
      </div>

      {/* Section content */}
      {tab === 'noise_variances' && (
        <div className="max-w-5xl mx-auto px-6 pb-8">
          <NoiseVariancesSection currentUser={currentUser} appConfig={appConfig} plans={plans} setSelectedPlan={setSelectedPlan} />
        </div>
      )}
      {tab === 'nv_linker' && (
        <div className="max-w-5xl mx-auto px-6 pb-8">
          <SmartLinker plans={plans} setSelectedPlan={setSelectedPlan} />
        </div>
      )}
      {tab === 'driveway_linker' && (
        <div className="flex-1 px-6 pb-4 min-h-0 overflow-hidden">
          <DrivewayLinker plans={plans} letters={letters} />
        </div>
      )}
      {tab === 'tansat_log' && (
        <div className="max-w-6xl mx-auto px-6 pb-8">
          <TansatLogSection plans={plans} setSelectedPlan={setSelectedPlan} />
        </div>
      )}
      {tab === 'reference' && (
        <div className="max-w-5xl mx-auto px-6 pb-8">
          <ReferenceLibrarySection currentUser={currentUser} />
        </div>
      )}
    </div>
  );
}
