import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { COMPLETED_STAGES } from '../constants';
import { GripVertical } from 'lucide-react';

const PRIORITY_SCORE: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function computedSort(a: any, b: any): number {
  // 1. Critical path first
  if (a.isCriticalPath !== b.isCriticalPath) return a.isCriticalPath ? -1 : 1;
  // 2. Priority level
  const pa = PRIORITY_SCORE[a.priority] ?? 2;
  const pb = PRIORITY_SCORE[b.priority] ?? 2;
  if (pa !== pb) return pa - pb;
  // 3. Oldest request first
  return new Date(a.dateRequested || a.requestDate || 0).getTime()
       - new Date(b.dateRequested || b.requestDate || 0).getTime();
}

interface TicketsViewProps {
  canViewTickets: boolean;
  metrics: any;
  monoFont: string;
  filtered: any[];
  LEADS: string[];
  updatePlanField: (id: string, field: string, value: any) => void;
  setSelectedPlan: (plan: any) => void;
  setView: (view: string) => void;
  pushTicket: (id: string, stage: string) => void;
  plans: any[];
  canReorder?: boolean;
}

export function TicketsView({
  canViewTickets,
  metrics,
  monoFont,
  filtered,
  LEADS,
  updatePlanField,
  setSelectedPlan,
  setView,
  pushTicket,
  plans,
  canReorder = false,
}: TicketsViewProps) {
  const [queueOrder, setQueueOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Load saved queue order from Firestore on mount
  useEffect(() => {
    getDoc(doc(db, 'settings', 'requestQueue')).then(snap => {
      if (snap.exists()) setQueueOrder(snap.data().order || []);
    });
  }, []);

  const saveQueueOrder = useCallback(async (order: string[]) => {
    await setDoc(doc(db, 'settings', 'requestQueue'), { order }, { merge: true });
  }, []);

  // All requested plans — full list regardless of search/filter
  const allRequested = useMemo(() =>
    plans.filter(p => p.stage === 'requested'),
    [plans]
  );

  // Master sorted list — manual order first, then computed sort for new arrivals
  const sortedAll = useMemo(() => {
    const orderedIds = new Set(queueOrder.filter(id => allRequested.some(p => p.id === id)));
    const ordered = queueOrder
      .filter(id => orderedIds.has(id))
      .map(id => allRequested.find(p => p.id === id)!);
    const unordered = allRequested.filter(p => !orderedIds.has(p.id)).sort(computedSort);
    return [...ordered, ...unordered];
  }, [allRequested, queueOrder]);

  // Stable rank map — computed from full queue, not affected by search
  const rankMap = useMemo(() => {
    const map: Record<string, number> = {};
    sortedAll.forEach((t, i) => { map[t.id] = i + 1; });
    return map;
  }, [sortedAll]);

  // Visible tickets — sortedAll filtered down to what passes the current search/filters
  const filteredIds = useMemo(() => new Set(filtered.map((p: any) => p.id)), [filtered]);
  const visibleTickets = useMemo(() =>
    sortedAll.filter(t => filteredIds.has(t.id)),
    [sortedAll, filteredIds]
  );

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) { setDraggingId(null); setDragOverId(null); return; }

    const currentOrder = sortedAll.map(t => t.id);
    const fromIdx = currentOrder.indexOf(draggedId);
    const toIdx = currentOrder.indexOf(targetId);
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedId);

    setQueueOrder(newOrder);
    saveQueueOrder(newOrder);
    setDraggingId(null);
    setDragOverId(null);
  }, [sortedAll, saveQueueOrder]);

  if (!canViewTickets) return null;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>TCP Request Tickets</div>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Review and prioritize new TCP requests. Push them to drafting or engineering.
            {canReorder && <span style={{ marginLeft: 8, fontSize: 11, color: '#94A3B8' }}>— drag ⠿ to reorder</span>}
          </div>
        </div>
        <div style={{ background: '#F8FAFC', padding: '12px 20px', borderRadius: 12, border: '1px solid #E2E8F0', textAlign: 'right' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Avg Drafting Time</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#3B82F6', fontFamily: monoFont }}>
            {metrics.avgDrafting} <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>days</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibleTickets.map(ticket => {
          const rank = rankMap[ticket.id];
          const isDragging = draggingId === ticket.id;
          const isDragOver = dragOverId === ticket.id;

          return (
            <div
              key={ticket.id}
              draggable={canReorder}
              onDragStart={e => handleDragStart(e, ticket.id)}
              onDragOver={e => { e.preventDefault(); setDragOverId(ticket.id); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={e => handleDrop(e, ticket.id)}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
              style={{
                background: '#fff',
                borderRadius: 12,
                border: `1.5px solid ${isDragOver ? '#3B82F6' : '#E2E8F0'}`,
                padding: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.12)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
                opacity: isDragging ? 0.5 : 1,
                cursor: canReorder ? 'default' : 'default',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {/* Drag handle */}
              {canReorder && (
                <div style={{ color: '#CBD5E1', marginRight: 8, cursor: 'grab', flexShrink: 0 }}>
                  <GripVertical size={16} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                {/* Rank badge */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: ticket.isCriticalPath ? '#FEE2E2' : '#F1F5F9',
                  border: `1.5px solid ${ticket.isCriticalPath ? '#FECACA' : '#E2E8F0'}`,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: ticket.isCriticalPath ? '#DC2626' : '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>#{rank}</span>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: monoFont, fontWeight: 700, fontSize: 14, color: '#D97706', flexShrink: 0 }}>{ticket.id}</span>
                    <span style={{ padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#F1F5F9', color: '#64748B', flexShrink: 0 }}>{ticket.type}</span>
                    <span style={{
                      padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, flexShrink: 0,
                      background: ticket.priority === 'Critical' ? '#FEE2E2' : ticket.priority === 'High' ? '#FEF3C7' : ticket.priority === 'Medium' ? '#DBEAFE' : '#F1F5F9',
                      color: ticket.priority === 'Critical' ? '#DC2626' : ticket.priority === 'High' ? '#D97706' : ticket.priority === 'Medium' ? '#2563EB' : '#64748B',
                    }}>{ticket.priority} Priority</span>
                    {ticket.isCriticalPath && !COMPLETED_STAGES.includes(ticket.stage) && (
                      <span style={{ padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>🔥 Critical Path</span>
                    )}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', marginBottom: 3 }}>
                    {ticket.street1}{ticket.street2 ? ` / ${ticket.street2}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Requested on {ticket.dateRequested || ticket.requestDate}{ticket.lead ? ` • Lead: ${ticket.lead}` : ''}
                  </div>
                  {ticket.notes && (
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 6, fontStyle: 'italic' }}>"{ticket.notes}"</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => { setSelectedPlan(ticket); setView('table'); }}
                  style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                >
                  View Details
                </button>
                <button
                  onClick={() => pushTicket(ticket.id, 'sftc')}
                  style={{ background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                >
                  Push to SFTC
                </button>
              </div>
            </div>
          );
        })}

        {allRequested.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', background: '#F8FAFC', borderRadius: 12, border: '1px dashed #CBD5E1' }}>
            No pending TCP requests. You're all caught up!
          </div>
        )}

        {allRequested.length > 0 && visibleTickets.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', background: '#F8FAFC', borderRadius: 12, border: '1px dashed #CBD5E1' }}>
            No tickets match your current search or filters.
          </div>
        )}
      </div>
    </div>
  );
}
