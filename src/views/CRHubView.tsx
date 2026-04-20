import { useEffect, useState } from 'react';
import { Inbox, Users, Building2, FileText, AlertTriangle } from 'lucide-react';
import { Plan, AppConfig, User, DrivewayLetter, CRIssue, DrivewayProperty } from '../types';
import { CRQueueSection, crQueueCount } from './library/CRQueueSection';
import { CDConcurrenceSection } from './library/CDConcurrenceSection';
import { DrivewayPropertiesSection } from './library/DrivewayPropertiesSection';
import { DrivewayLettersSection } from './library/DrivewayLettersSection';
import { CRIssuesSection } from './library/CRIssuesSection';
import { subscribeToDrivewayLetters } from '../services/drivewayLetterService';
import { subscribeToCRIssues } from '../services/crIssueService';
import { subscribeToDrivewayProperties } from '../services/drivewayPropertyService';

interface CRHubViewProps {
  currentUser: User | null;
  appConfig: AppConfig;
  plans: Plan[];
  setSelectedPlan: (plan: Plan | null) => void;
  setView: (view: string) => void;
}

type HubTab = 'queue' | 'cd' | 'properties' | 'issues';
type PropertiesSubTab = 'records' | 'letters';

export function CRHubView({ currentUser, appConfig, plans, setSelectedPlan }: CRHubViewProps) {
  const [tab, setTab]                           = useState<HubTab>('properties');
  const [propertiesSubTab, setPropertiesSubTab] = useState<PropertiesSubTab>('records');
  const [planFilter, setPlanFilter]             = useState<{ id: string; loc: string } | null>(null);
  const [letters, setLetters]                   = useState<DrivewayLetter[]>([]);
  const [issues, setIssues]                     = useState<CRIssue[]>([]);
  const [properties, setProperties]             = useState<DrivewayProperty[]>([]);

  useEffect(() => subscribeToDrivewayLetters(setLetters), []);
  useEffect(() => subscribeToCRIssues(setIssues), []);
  useEffect(() => subscribeToDrivewayProperties(setProperties), []);

  const leadTimeDays   = appConfig.driveway_leadTimeDays ?? 10;
  const reissueDays    = appConfig.driveway_reissueDays  ?? 5;
  const queueCount     = crQueueCount(plans, letters, leadTimeDays, reissueDays);

  const cdPendingCount = plans.filter(p => {
    const track = p.compliance?.cdConcurrence;
    if (!track) return false;
    return track.cds.some(c => c.applicable && !['concurred', 'na', 'declined'].includes(c.status));
  }).length;

  const openIssues     = issues.filter(i => i.status === 'open' || i.status === 'in_progress');
  const openIssueCount = openIssues.length;

  // ── Stats bar numbers ──────────────────────────────────────────────────────
  const noticedAddresses = letters.filter(l => l.status === 'sent' || l.status === 'approved').length;
  const totalAddresses   = letters.length;
  const noticedPct       = totalAddresses > 0 ? Math.round((noticedAddresses / totalAddresses) * 100) : 0;

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

      {/* ── Stats bar ────────────────────────────────────────────────── */}
      <div className="flex gap-6 mb-6 rounded-xl bg-slate-50 border border-slate-200 px-5 py-3">
        <div className="text-center">
          <div className="text-xl font-extrabold text-slate-800 leading-none">{properties.length}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Properties</div>
        </div>
        <div className="w-px bg-slate-200" />
        <div className="text-center">
          <div className="text-xl font-extrabold text-slate-800 leading-none">{totalAddresses}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Addresses</div>
        </div>
        <div className="w-px bg-slate-200" />
        <div className="text-center">
          <div className={`text-xl font-extrabold leading-none ${noticedPct === 100 ? 'text-emerald-600' : noticedPct > 50 ? 'text-amber-600' : 'text-slate-800'}`}>
            {noticedPct}%
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Noticed</div>
        </div>
        <div className="w-px bg-slate-200" />
        <div className="text-center">
          <div className={`text-xl font-extrabold leading-none ${openIssueCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {openIssueCount}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Open Issues</div>
        </div>
        <div className="w-px bg-slate-200" />
        <div className="text-center">
          <div className={`text-xl font-extrabold leading-none ${cdPendingCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {cdPendingCount}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">CD Pending</div>
        </div>
      </div>

      {/* ── Summary cards — Properties first as CRM anchor ───────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">

        <button
          onClick={() => setTab('properties')}
          className={`text-left rounded-xl border p-4 flex items-start gap-3 transition-all ${
            tab === 'properties'
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-200 dark:hover:border-emerald-700'
          }`}
        >
          <div className={`mt-0.5 rounded-lg p-2 shrink-0 ${
            properties.length > 0
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
          }`}>
            <Building2 size={16} />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 leading-none mb-0.5">
              {properties.length}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {properties.length === 1 ? 'property record' : 'property records'}
            </div>
          </div>
        </button>

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
          onClick={() => setTab('issues')}
          className={`text-left rounded-xl border p-4 flex items-start gap-3 transition-all ${
            tab === 'issues'
              ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-red-200 dark:hover:border-red-700'
          }`}
        >
          <div className={`mt-0.5 rounded-lg p-2 shrink-0 ${
            openIssueCount > 0
              ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
          }`}>
            <AlertTriangle size={16} />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 leading-none mb-0.5">
              {openIssueCount}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {openIssueCount === 1 ? 'open issue' : 'open issues'}
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
      </div>

      {/* ── Tab bar — Properties first ────────────────────────────────── */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setTab('properties')}
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
            {properties.length}
          </span>
        </button>

        <button
          onClick={() => setTab('queue')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'queue'
              ? 'border-amber-500 text-amber-700 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
          }`}
        >
          <Inbox size={14} />
          Notices Queue
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
          onClick={() => setTab('issues')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'issues'
              ? 'border-red-600 text-red-700 dark:text-red-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
          }`}
        >
          <AlertTriangle size={14} />
          Issues
          {openIssueCount > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              tab === 'issues'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                : 'bg-red-100 text-red-600'
            }`}>
              {openIssueCount}
            </span>
          )}
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

      {tab === 'issues' && (
        <CRIssuesSection
          issues={issues}
          currentUser={currentUser}
          properties={properties}
          plans={plans}
          setSelectedPlan={setSelectedPlan}
          onAddProperty={() => setTab('properties')}
        />
      )}

      {tab === 'properties' && (
        <div>
          {/* Secondary action bar — Letters access */}
          <div className="flex items-center justify-between mb-4">
            <div />
            <div className="flex items-center gap-2">
              {planFilter && (
                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 font-semibold flex items-center gap-1.5">
                  Filtered: {planFilter.loc}
                  <button onClick={() => setPlanFilter(null)} className="text-amber-500 hover:text-amber-700 ml-0.5">✕</button>
                </span>
              )}
              <button
                onClick={() => { setPropertiesSubTab(propertiesSubTab === 'letters' ? 'records' : 'letters'); if (propertiesSubTab === 'letters') setPlanFilter(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-colors ${
                  propertiesSubTab === 'letters'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                <FileText size={12} />
                {propertiesSubTab === 'letters' ? 'Back to Records' : `All Letters (${letters.length})`}
              </button>
            </div>
          </div>

          {propertiesSubTab === 'records' && (
            <DrivewayPropertiesSection
              currentUser={currentUser}
              allLetters={letters}
              plans={plans}
              setSelectedPlan={setSelectedPlan}
              allIssues={issues}
              onOpenIssues={() => setTab('issues')}
            />
          )}
          {propertiesSubTab === 'letters' && (
            <DrivewayLettersSection
              currentUser={currentUser}
              appConfig={appConfig}
              allLetters={letters}
              plans={plans}
              planFilter={planFilter}
              onClearPlanFilter={() => setPlanFilter(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
