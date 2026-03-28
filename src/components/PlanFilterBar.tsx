import React from 'react';
import { STAGES, PRIORITIES } from '../constants';
import { useAppLists } from '../context/AppListsContext';

interface FilterBarProps {
  filter: { stage: string; type: string; lead: string; priority: string };
  setFilter: (filter: any) => void;
  planSearch: string;
  setPlanSearch: (search: string) => void;
}

export const PlanFilterBar: React.FC<FilterBarProps> = ({ filter, setFilter, planSearch, setPlanSearch }) => {
  const { planTypes, leads } = useAppLists();
  return (
    <div className="flex flex-wrap gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-200">
      <input
        type="text"
        placeholder="Search plans..."
        value={planSearch}
        onChange={(e) => setPlanSearch(e.target.value)}
        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
      />
      <select value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg">
        <option value="all">All Stages</option>
        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg">
        <option value="all">All Types</option>
        {planTypes.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={filter.lead} onChange={(e) => setFilter({ ...filter, lead: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg">
        <option value="all">All Leads</option>
        {leads.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <select value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg">
        <option value="all">All Priorities</option>
        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );
};
