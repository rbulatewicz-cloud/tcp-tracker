import React, { useState, useEffect, useRef } from 'react';
import { X, MessageCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { subscribeToMyFeedback } from '../services/firestoreService';
import { writeFeedbackCommentNotification } from '../services/notificationService';
import { FeedbackComment, User } from '../types';
import { MONO_FONT as monoFont } from '../constants';
import { showToast } from '../lib/toast';

interface MyRequestsModalProps {
  currentUser: User;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
};

export const MyRequestsModal: React.FC<MyRequestsModalProps> = ({ currentUser, onClose }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeToMyFeedback(currentUser.email, setRequests);
  }, [currentUser.email]);

  const toggleComments = (id: string) =>
    setExpandedComments(prev => ({ ...prev, [id]: !prev[id] }));

  const handleSubmitComment = async (req: any) => {
    const text = (draftText[req.id] || '').trim();
    if (!text) return;

    const comment: FeedbackComment = {
      id: `${Date.now()}`,
      authorEmail: currentUser.email,
      authorName: currentUser.displayName || currentUser.email,
      text,
      createdAt: new Date().toISOString(),
    };

    // Watchers: original requester + anyone who has commented before + self
    const existingWatchers: string[] = req.watchers || [req.userEmail];
    const newWatchers = [...new Set([...existingWatchers, currentUser.email])];

    setSubmitting(req.id);
    try {
      await updateDoc(doc(db, 'app_feedback', req.id), {
        comments: arrayUnion(comment),
        watchers: newWatchers,
      });
      await writeFeedbackCommentNotification(
        newWatchers,
        currentUser.email,
        comment.authorName,
        req.id,
        text,
      );
      setDraftText(prev => ({ ...prev, [req.id]: '' }));
      setExpandedComments(prev => ({ ...prev, [req.id]: true }));
    } catch {
      showToast('Failed to post comment.', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 1000, display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 520, background: 'var(--bg-surface)',
        height: '100%', display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>My App Requests</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {requests.length} request{requests.length !== 1 ? 's' : ''} submitted
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Request list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <MessageCircle size={32} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>No requests yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Submit a request using the feedback button.</div>
            </div>
          ) : requests.map(req => {
            const comments: FeedbackComment[] = req.comments || [];
            const isOpen = expandedComments[req.id] ?? comments.length > 0;
            const status = STATUS_STYLES[req.status] ?? STATUS_STYLES.pending;

            return (
              <div key={req.id} style={{
                background: 'var(--bg-surface-2, #F8FAFC)',
                border: '1px solid var(--border)',
                borderRadius: 12, overflow: 'hidden',
              }}>
                {/* Card header */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontFamily: monoFont, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {req.id} · {timeAgo(req.createdAt)}
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                      background: status.bg, color: status.color,
                      padding: '2px 8px', borderRadius: 10, flexShrink: 0,
                    }}>
                      {status.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                    {req.description}
                  </div>
                </div>

                {/* Comments section */}
                <div style={{ borderTop: '1px solid var(--border-subtle, #F1F5F9)' }}>
                  <button
                    onClick={() => toggleComments(req.id)}
                    style={{
                      width: '100%', padding: '8px 14px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <MessageCircle size={12} />
                      {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Add a comment'}
                    </span>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {isOpen && (
                    <div style={{ padding: '0 14px 12px' }}>
                      {/* Comment thread */}
                      {comments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                          {[...comments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(c => {
                            const isMe = c.authorEmail === currentUser.email;
                            return (
                              <div key={c.id} style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: isMe ? 'flex-end' : 'flex-start',
                              }}>
                                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 2, fontWeight: 600 }}>
                                  {isMe ? 'You' : c.authorName} · {timeAgo(c.createdAt)}
                                </div>
                                <div style={{
                                  maxWidth: '85%', padding: '7px 10px', borderRadius: 10,
                                  background: isMe ? '#6366F1' : 'var(--bg-surface, #fff)',
                                  border: isMe ? 'none' : '1px solid var(--border)',
                                  color: isMe ? '#fff' : 'var(--text-primary)',
                                  fontSize: 12, lineHeight: 1.5,
                                }}>
                                  {c.text}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Reply input */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <textarea
                          value={draftText[req.id] || ''}
                          onChange={e => setDraftText(prev => ({ ...prev, [req.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(req); } }}
                          placeholder="Write a comment… (Enter to send)"
                          rows={2}
                          style={{
                            flex: 1, fontSize: 12, padding: '8px 10px',
                            border: '1px solid var(--border)', borderRadius: 8,
                            background: 'var(--bg-surface, #fff)', color: 'var(--text-primary)',
                            resize: 'none', outline: 'none', fontFamily: 'inherit',
                          }}
                        />
                        <button
                          onClick={() => handleSubmitComment(req)}
                          disabled={!draftText[req.id]?.trim() || submitting === req.id}
                          style={{
                            background: '#6366F1', border: 'none', borderRadius: 8,
                            padding: '8px 10px', cursor: 'pointer', color: '#fff',
                            opacity: !draftText[req.id]?.trim() ? 0.4 : 1,
                            flexShrink: 0,
                          }}
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
