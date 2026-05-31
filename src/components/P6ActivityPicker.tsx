/**
 * Searchable multi-select for P6 schedule activities.
 *
 * Backed by the phonebook in Firestore (collection p6_activities). The full list
 * (~10k entries for the current schedule) is fetched once and cached at module
 * scope so opening/closing the request modal doesn't re-fetch.
 *
 * Hard-blocks selection when the phonebook is empty — admin must upload a .xer
 * in Settings → P6 Schedule before engineers can submit a new request.
 *
 * Value shape matches Plan.p6Activities: { id, name?, wbsPath? }[]
 * The denormalized name + wbsPath travel with the plan so display survives even
 * if the activity disappears from a later XER export.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, AlertCircle, Loader2 } from 'lucide-react';
import {
  listAllP6Activities,
  P6ActivityDoc,
  getCurrentScheduleMeta,
  P6ScheduleMeta,
} from '../services/p6ActivityService';

export interface P6PickerValue {
  id: string;
  name?: string;
  wbsPath?: string;
}

interface P6ActivityPickerProps {
  value: P6PickerValue[];
  onChange: (next: P6PickerValue[]) => void;
  disabled?: boolean;
  /** Show a "required" red asterisk in the label */
  required?: boolean;
}

// Module-level cache so reopening the modal doesn't refetch the phonebook.
let cachedActivities: P6ActivityDoc[] | null = null;
let cachedMeta: P6ScheduleMeta | null | undefined = undefined; // undefined = not loaded yet
let inflight: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (cachedActivities !== null && cachedMeta !== undefined) return;
  if (inflight) return inflight;
  inflight = (async () => {
    const [acts, meta] = await Promise.all([
      listAllP6Activities(),
      getCurrentScheduleMeta(),
    ]);
    cachedActivities = acts;
    cachedMeta = meta;
  })();
  try { await inflight; } finally { inflight = null; }
}

/** Allow callers (e.g. after a fresh upload) to bust the cache. */
export function invalidateP6ActivityCache() {
  cachedActivities = null;
  cachedMeta = undefined;
}

const MAX_RESULTS = 25;

export const P6ActivityPicker: React.FC<P6ActivityPickerProps> = ({
  value,
  onChange,
  disabled,
  required,
}) => {
  const [activities, setActivities] = useState<P6ActivityDoc[] | null>(cachedActivities);
  const [meta, setMeta] = useState<P6ScheduleMeta | null | undefined>(cachedMeta);
  const [loading, setLoading] = useState(cachedActivities === null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (cachedActivities !== null && cachedMeta !== undefined) {
      setActivities(cachedActivities);
      setMeta(cachedMeta);
      setLoading(false);
      return;
    }
    setLoading(true);
    ensureLoaded().then(() => {
      if (cancelled) return;
      setActivities(cachedActivities);
      setMeta(cachedMeta);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectedIds = useMemo(() => new Set(value.map(v => v.id)), [value]);

  const results = useMemo(() => {
    if (!activities) return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show first N as a starter when input is empty + focused
      return activities.slice(0, MAX_RESULTS);
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const hits: P6ActivityDoc[] = [];
    for (const a of activities) {
      if (selectedIds.has(a.id)) continue;
      const hay = `${a.id} ${a.name} ${a.wbsPath}`.toLowerCase();
      let ok = true;
      for (const t of tokens) {
        if (!hay.includes(t)) { ok = false; break; }
      }
      if (ok) {
        hits.push(a);
        if (hits.length >= MAX_RESULTS) break;
      }
    }
    return hits;
  }, [query, activities, selectedIds]);

  const add = (a: P6ActivityDoc) => {
    if (selectedIds.has(a.id)) return;
    onChange([...value, { id: a.id, name: a.name, wbsPath: a.wbsPath }]);
    setQuery('');
  };

  const remove = (id: string) => {
    onChange(value.filter(v => v.id !== id));
  };

  // No phonebook uploaded yet — hard block per design decision.
  if (!loading && (!activities || activities.length === 0 || !meta)) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-200">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-semibold mb-0.5">P6 schedule not loaded yet</div>
          <div className="text-amber-700 dark:text-amber-300">
            An administrator must upload the latest P6 .xer export under
            Settings → P6 Schedule before new requests can be submitted.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
        Schedule Activities {required && <span className="text-red-500">*</span>}
      </label>

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map(v => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-900/30 dark:border-indigo-800/50 dark:text-indigo-200"
              title={v.name ? `${v.name}${v.wbsPath ? '\n' + v.wbsPath : ''}` : v.id}
            >
              <span className="font-mono">{v.id}</span>
              {v.name && (
                <span className="font-normal text-indigo-600 dark:text-indigo-300 max-w-[220px] truncate">
                  {v.name}
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(v.id)}
                  className="text-indigo-500 hover:text-indigo-800"
                  aria-label={`Remove ${v.id}`}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          disabled={disabled || loading}
          placeholder={loading ? 'Loading schedule…' : 'Search by ID, description, or WBS…'}
          className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
        )}
      </div>

      {/* Results dropdown */}
      {open && !loading && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:bg-slate-800 dark:border-slate-700">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">
              No matches. Try a partial activity ID, description keyword, or WBS segment.
            </div>
          ) : (
            results.map(a => (
              <button
                type="button"
                key={a.id}
                onClick={() => add(a)}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-b border-slate-100 dark:border-slate-700 last:border-b-0"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                    {a.id}
                  </span>
                  <span className="flex-1 text-slate-800 dark:text-slate-200 truncate">
                    {a.name}
                  </span>
                </div>
                {a.wbsPath && (
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {a.wbsPath}
                  </div>
                )}
              </button>
            ))
          )}
          {meta && (
            <div className="px-3 py-1.5 text-[9px] text-slate-400 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              {activities?.length.toLocaleString()} activities · {meta.fileName}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
