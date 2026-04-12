import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap } from 'lucide-react';
import { User, AppConfig, Plan, DrivewayLetter } from '../types';
import { NoiseVariancesSection } from './library/NoiseVariancesSection';
import { SmartLinker } from './library/SmartLinker';
import { subscribeToDrivewayLetters } from '../services/drivewayLetterService';

interface VarianceLibraryViewProps {
  currentUser: User | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
}

type LibTab = 'noise_variances' | 'nv_linker';

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

  const dwayNeedsActionCount = plans.filter(p => {
    if (!p.impact_driveway || ['expired', 'plan_approved', 'completed', 'withdrawn', 'cancelled'].includes(p.stage)) return false;
    const s = p.compliance?.drivewayNotices?.status;
    return !s || s === 'not_started' || s === 'in_progress';
  }).length;

  const smartLinkerBadge = nvUnlinkedCount + phePendingCount + dwayNeedsActionCount;

  const TABS: { id: LibTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'noise_variances', label: 'Noise Variances', icon: <ShieldCheck size={14} /> },
    { id: 'nv_linker',       label: 'Smart Linker',    icon: <Zap size={14} />, badge: smartLinkerBadge },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Library</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Noise variances, permits, and compliance documents</p>
      </div>

      {/* Main tab bar */}
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

      {/* Section content */}
      {tab === 'noise_variances' && (
        <NoiseVariancesSection currentUser={currentUser} appConfig={appConfig} plans={plans} setSelectedPlan={setSelectedPlan} />
      )}
      {tab === 'nv_linker' && (
        <SmartLinker plans={plans} setSelectedPlan={setSelectedPlan} letters={letters} />
      )}
    </div>
  );
}
