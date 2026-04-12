import { useEffect, useState } from 'react';
import { Inbox, Users, Building2, FileText } from 'lucide-react';
import { Plan, AppConfig, User, DrivewayLetter } from '../types';
import { CRQueueSection, crQueueCount } from './library/CRQueueSection';
import { CDConcurrenceSection } from './library/CDConcurrenceSection';
import { DrivewayPropertiesSection } from './library/DrivewayPropertiesSection';
import { DrivewayLettersSection } from './library/DrivewayLettersSection';
import { subscribeToDrivewayLetters } from '../services/drivewayLetterService';

interface CRHubViewProps {
  currentUser: User | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
  setView: (view: string) => void;
}

type HubTab = 'queue' | 'cd' | 'properties';
type PropertiesSubTab = 'records' | 'letters';

export function CRHubView({ currentUser, appConfig, plans, setSelectedPlan }: CRHubViewProps) {
  const [tab, setTab]                           = useState<HubTab>('queue');
  const [propertiesSubTab, setPropertiesSubTab] = useState<PropertiesSubTab>('records');
  const [planFilter, setPlanFilter]             = useState<{ id: string; loc: string } | null>(null);
  const [letters, setLetters]                   = useState<DrivewayLetter[]>([]);

  useEffect(() => subscribeToDrivewayLetters(setLetters), []);

  const leadTimeDays   = appConfig.driveway_leadTimeDays ?? 10;
  const reissueDays    = appConfig.driveway_reissueDays  ?? 5;
  const queueCount     = crQueueCount(plans, letters, leadTimeDays, reissueDays);

  const cdPendingCount = plans.filter(p => {
    const track = p.compliance?.cdConcurrence;
    if (!track) return false;
    return track.cds.some(c => c.applicable && !['concurred', 'na', 'declined'].includes(c.status));
  }).length;

  const unsentCount = letters.filter(l => l.status !== 'sent').length;

  /** Called from CR Queue "Open" — jump directly to this plan's letters */
  function openPlanInLetters(plan: Plan) {
    setPlanFilter({ id: plan.id, loc: plan.loc || plan.id });
    setTab('properties');
    setPropertiesSubTab('letters');
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">CR Hub</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Community Relations — driveway notices, CD concurrences, and property management
        </p>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-6">

        <button
          onClick={() => setTab('queue')}
          className={`text-left rounded-xl border p-4 flex items-start gap-3 transition-all ${
            tab === 'queue'
              ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-200 dark:hover:border-amber-700'
          }`}
        >
          <div className={`mt-0.5 rounded-lg p-2 shrink-0 ${
            queueCount > 0
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
          }`}>
            <Inbox size={16} />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 leading-none mb-0.5">
              {queueCount}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {queueCount === 1 ? 'notice needs action' : 'notices need action'}
            </div>
          </div>
        </button>

        <button
          onClick={() => setTab('cd')}
          className={`text-left rounded-xl border p-4 flex items-start gap-3 transition-all ${
            tab === 'cd'
              ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-700'
          }`}
        >
          <div className={`mt-0.5 rounded-lg p-2 shrink-0 ${
            cdPendingCount > 0
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
          }`}>
            <Users size={16} />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 leading-none mb-0.5">
              {cdPendingCount}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {cdPendingCount === 1 ? 'CD concurrence pending' : 'CD concurrences pending'}
            </div>
          </div>
        </button>

        <button
          onClick={() => setTab('properties')}
          className={`text-left rounded-xl border p-4 flex items-start gap-3 transition-all ${
            tab === 'properties'
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-200 dark:hover:border-emerald-700'
          }`}
        >
          <div className={`mt-0.5 rounded-lg p-2 shrink-0 ${
            unsentCount > 0
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
          }`}>
            <Building2 size={16} />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 leading-none mb-0.5">
              {letters.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {letters.length === 1 ? 'letter on file' : 'letters on file'}
            </div>
          </div>
        </button>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setTab('queue')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'queue'
              ? 'border-amber-500 text-amber-700 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
          }`}
        >
          <Inbox size={14} />
          Driveway Notices
          {queueCount > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              tab === 'queue'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                : 'bg-red-100 text-red-600'
            }`}>
              {queueCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('cd')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'cd'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
          }`}
        >
          <Users size={14} />
          CD Concurrence
          {cdPendingCount > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              tab === 'cd'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                : 'bg-red-100 text-red-600'
            }`}>
              {cdPendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => { setTab('properties'); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'properties'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
          }`}
        >
          <Building2 size={14} />
          Properties
          <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            tab === 'properties'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {letters.length}
          </span>
        </button>
      </div>

      {/* ── Section content ───────────────────────────────────────────── */}
      {tab === 'queue' && (
        <CRQueueSection
          plans={plans}
          appConfig={appConfig}
          onOpenPlanLetters={openPlanInLetters}
          currentUser={currentUser}
        />
      )}

      {tab === 'cd' && (
        <CDConcurrenceSection
          currentUser={currentUser}
          plans={plans}
        />
      )}

      {tab === 'properties' && (
        <div>
          {/* Properties sub-tab toggle */}
          <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
            <button
              onClick={() => setPropertiesSubTab('records')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                propertiesSubTab === 'records'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Building2 size={12} />
              Property Records
            </button>
            <button
              onClick={() => { setPropertiesSubTab('letters'); setPlanFilter(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                propertiesSubTab === 'letters'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
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
