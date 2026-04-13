/**
 * EmailAuditTab.tsx
 *
 * Admin-only view of the mail_log Firestore collection.
 * Shows every email sent by the app with filters for date range, event, status, and recipient.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, query, orderBy, limit, getDocs, startAfter,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Mail, RefreshCw, Search, ChevronDown } from 'lucide-react';
import type { MailLogEntry, MailStatus } from '../../types';
import { MAIL_LOG_COLLECTION } from '../../services/emailService';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<MailStatus, string> = {
  sent:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  bounced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  opened:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSentAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export const EmailAuditTab: React.FC = () => {
  const [entries, setEntries]       = useState<MailLogEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastDoc, setLastDoc]       = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState<MailStatus | ''>('');
  const [filterEvent, setFilterEvent]   = useState('');
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = async (fresh = false) => {
    if (fresh) setRefreshing(true); else setLoading(true);
    try {
      const q = query(
        collection(db, MAIL_LOG_COLLECTION),
        orderBy('sentAt', 'desc'),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as MailLogEntry));
      setEntries(docs);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load mail log', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (!lastDoc) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, MAIL_LOG_COLLECTION),
        orderBy('sentAt', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as MailLogEntry));
      setEntries(prev => [...prev, ...docs]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return entries.filter(e => {
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterEvent && e.triggerEvent !== filterEvent) return false;
      if (s) {
        const hay = `${e.to} ${e.toName ?? ''} ${e.subject} ${e.templateName} ${e.sentBy}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [entries, search, filterStatus, filterEvent]);

  // Unique events for the filter dropdown
  const uniqueEvents = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => { if (e.triggerEvent) set.add(e.triggerEvent); });
    return Array.from(set).sort();
  }, [entries]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:   entries.length,
    sent:    entries.filter(e => e.status === 'sent').length,
    failed:  entries.filter(e => e.status === 'failed').length,
    bounced: entries.filter(e => e.status === 'bounced').length,
    opened:  entries.filter(e => e.status === 'opened').length,
  }), [entries]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw size={20} className="animate-spin mr-2" />
        Loading audit log…
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Email Audit Log</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Every email sent by the system — last {entries.length} records loaded
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Loaded', value: stats.total,   color: 'text-slate-700 dark:text-slate-200' },
          { label: 'Sent',         value: stats.sent,    color: 'text-emerald-600' },
          { label: 'Failed',       value: stats.failed,  color: stats.failed > 0 ? 'text-red-600' : 'text-slate-400' },
          { label: 'Bounced',      value: stats.bounced, color: stats.bounced > 0 ? 'text-amber-500' : 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3.5 border border-slate-100 dark:border-slate-600">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipient, subject, template…"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as MailStatus | '')}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
          <option value="opened">Opened</option>
        </select>

        {uniqueEvents.length > 0 && (
          <select
            value={filterEvent}
            onChange={e => setFilterEvent(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500"
          >
            <option value="">All events</option>
            {uniqueEvents.map(ev => (
              <option key={ev} value={ev}>{ev}</option>
            ))}
          </select>
        )}

        {(search || filterStatus || filterEvent) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterEvent(''); }}
            className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Mail size={32} className="text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {entries.length === 0 ? 'No emails have been sent yet' : 'No results match your filters'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {entries.length === 0
              ? 'Emails will appear here once triggered by the system or admins'
              : 'Try adjusting your search or filter criteria'}
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Recipient</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Subject</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Template</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Event</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Sent</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <React.Fragment key={e.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                    className={`border-b border-slate-100 dark:border-slate-700 cursor-pointer transition-colors ${
                      expandedId === e.id
                        ? 'bg-slate-50 dark:bg-slate-700/60'
                        : i % 2 === 0
                          ? 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                          : 'bg-slate-50/50 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-700 dark:text-slate-200">{e.toName || e.to}</div>
                      {e.toName && <div className="text-[10px] text-slate-400">{e.to}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-[220px] truncate">{e.subject}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{e.templateName}</td>
                    <td className="px-4 py-2.5">
                      {e.triggerEvent ? (
                        <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                          {e.triggerEvent}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtSentAt(e.sentAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[e.status] ?? STATUS_STYLES.sent}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ChevronDown
                        size={13}
                        className={`text-slate-400 transition-transform ${expandedId === e.id ? 'rotate-180' : ''}`}
                      />
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expandedId === e.id && (
                    <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-[11px]">
                          <div className="space-y-1.5">
                            <div><span className="font-semibold text-slate-500 dark:text-slate-400">Sent by:</span> <span className="text-slate-700 dark:text-slate-300">{e.sentBy}</span></div>
                            {e.relatedId && (
                              <div><span className="font-semibold text-slate-500 dark:text-slate-400">Related ID:</span> <span className="font-mono text-slate-600 dark:text-slate-300">{e.relatedId}</span></div>
                            )}
                            {e.openedAt && (
                              <div><span className="font-semibold text-slate-500 dark:text-slate-400">Opened:</span> <span className="text-slate-700 dark:text-slate-300">{fmtSentAt(e.openedAt)}</span></div>
                            )}
                            <div><span className="font-semibold text-slate-500 dark:text-slate-400">Log ID:</span> <span className="font-mono text-slate-400 dark:text-slate-500 text-[10px]">{e.id}</span></div>
                          </div>
                          {Object.keys(e.tokens ?? {}).length > 0 && (
                            <div>
                              <div className="font-semibold text-slate-500 dark:text-slate-400 mb-1">Tokens used:</div>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(e.tokens).map(([k, v]) => (
                                  <span key={k} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-[10px]">
                                    <span className="text-slate-400 dark:text-slate-500">{`{{${k}}}`}</span>
                                    <span className="text-slate-600 dark:text-slate-300 ml-1">{v}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center py-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : `Load more (${PAGE_SIZE} at a time)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Result count */}
      {filtered.length > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-right">
          Showing {filtered.length} of {entries.length} loaded records
        </p>
      )}
    </div>
  );
};
