import { useState, useRef } from 'react';
import { MessageCircle, Send, ChevronDown, ChevronUp, Paperclip, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { Plan, User, UserRole, RequestComment, RequestStatus } from '../../types';
import { writeRequestCommentNotification } from '../../services/notificationService';
import { showToast } from '../../lib/toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const isMOTOrAdmin = (role: string) =>
  role === UserRole.MOT || role === UserRole.ADMIN;

// Status badge
const STATUS_META: Record<RequestStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  under_review:          { label: 'Under Review',          icon: <Clock size={11} />,        cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  needs_clarification:   { label: 'Needs Clarification',   icon: <AlertCircle size={11} />,  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  clarification_provided:{ label: 'Clarification Provided',icon: <CheckCircle size={11} />,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

interface Props {
  plan: Plan;
  currentUser: User;
  allUsers: User[];
}

export function RequestCommentThread({ plan, currentUser, allUsers }: Props) {
  const [expanded,   setExpanded]   = useState(false);
  const [draftText,  setDraftText]  = useState('');
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const comments    = plan.requestComments ?? [];
  const status      = plan.requestStatus ?? 'under_review';
  const statusMeta  = STATUS_META[status];
  const isMOT       = isMOTOrAdmin(currentUser.role);
  const commentCount = comments.length;

  // Collect notification recipients: lead + requestedBy (by name lookup) + past commenters
  function getRecipients(): string[] {
    const emails = new Set<string>();
    // MOT users always get notified on engineer replies
    if (!isMOT) {
      allUsers
        .filter(u => isMOTOrAdmin(u.role))
        .forEach(u => emails.add(u.email));
    }
    // Plan lead + requester (name → email lookup)
    const leadUser = allUsers.find(u => u.name === plan.lead || u.displayName === plan.lead);
    if (leadUser) emails.add(leadUser.email);
    const requesterUser = allUsers.find(u => u.name === plan.requestedBy || u.displayName === plan.requestedBy);
    if (requesterUser) emails.add(requesterUser.email);
    // Past commenters
    comments.forEach(c => emails.add(c.authorEmail));
    return Array.from(emails);
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDraftFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handlePost = async () => {
    const text = draftText.trim();
    if (!text && draftFiles.length === 0) return;
    setSubmitting(true);

    try {
      // Upload attachments
      const uploadedUrls: string[] = [];
      for (const file of draftFiles) {
        const fileRef = ref(storage, `request_comments/${plan.id}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedUrls.push(url);
      }

      const comment: RequestComment = {
        id:          `rc_${Date.now()}`,
        authorEmail: currentUser.email,
        authorName:  currentUser.name || currentUser.email,
        authorRole:  currentUser.role,
        text,
        attachments: uploadedUrls,
        createdAt:   new Date().toISOString(),
      };

      // Determine new requestStatus
      let newStatus: RequestStatus = status;
      if (isMOT && status !== 'needs_clarification') {
        newStatus = 'needs_clarification';
      }
      // Engineer posting keeps status as-is (they use the explicit button to mark clarification_provided)

      await updateDoc(doc(db, 'plans', plan.id), {
        requestComments: arrayUnion(comment),
        ...(newStatus !== status ? { requestStatus: newStatus } : {}),
      });

      // Notifications
      const recipients = getRecipients();
      if (recipients.length > 0) {
        await writeRequestCommentNotification(
          recipients,
          currentUser.email,
          currentUser.name || currentUser.email,
          plan.id,
          plan.loc || plan.id,
          text || `[${draftFiles.length} file(s) attached]`,
        );
      }

      setDraftText('');
      setDraftFiles([]);
      setExpanded(true);
    } catch {
      showToast('Failed to post comment.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClarificationProvided = async () => {
    try {
      await updateDoc(doc(db, 'plans', plan.id), {
        requestStatus: 'clarification_provided' as RequestStatus,
      });
      // Notify MOT users
      const motUsers = allUsers.filter(u => isMOTOrAdmin(u.role)).map(u => u.email);
      if (motUsers.length > 0) {
        await writeRequestCommentNotification(
          motUsers,
          currentUser.email,
          currentUser.name || currentUser.email,
          plan.id,
          plan.loc || plan.id,
          'Clarification has been provided. Please review.',
        );
      }
    } catch {
      showToast('Failed to update status.', 'error');
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      {/* Thread header row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status badge */}
        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.cls}`}>
          {statusMeta.icon}
          {statusMeta.label}
        </span>

        {/* Comment count + toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
        >
          <MessageCircle size={13} />
          {commentCount === 0 ? 'Start thread' : `${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {/* Clarification Provided button — only for non-MOT when status is needs_clarification */}
        {!isMOT && status === 'needs_clarification' && (
          <button
            onClick={handleClarificationProvided}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 transition-colors"
          >
            <CheckCircle size={10} />
            Mark Clarification Provided
          </button>
        )}
      </div>

      {/* Expanded thread */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Comment list */}
          {comments.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {comments
                .slice()
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map(c => {
                  const isAuthor = c.authorEmail === currentUser.email;
                  const isMOTComment = isMOTOrAdmin(c.authorRole);
                  return (
                    <div
                      key={c.id}
                      className={`rounded-lg p-2.5 text-[11px] ${
                        isMOTComment
                          ? 'bg-amber-50 border border-amber-100'
                          : 'bg-slate-50 border border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-semibold text-slate-700">
                          {isAuthor ? 'You' : c.authorName}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                          isMOTComment ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {c.authorRole}
                        </span>
                        <span className="text-slate-400 ml-auto">{timeAgo(c.createdAt)}</span>
                      </div>
                      {c.text && <p className="text-slate-600 leading-snug">{c.text}</p>}
                      {c.attachments?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.attachments.map((url, i) => {
                            const isImage = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
                            return isImage ? (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="attachment" className="h-16 rounded border border-slate-200 object-cover" />
                              </a>
                            ) : (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white text-[10px] text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Paperclip size={10} />
                                Attachment {i + 1}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Compose area */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <textarea
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              placeholder={
                isMOT
                  ? 'Ask for clarification or leave a note…'
                  : 'Reply to MOT or provide additional context…'
              }
              rows={2}
              className="w-full px-3 py-2 text-[12px] text-slate-700 placeholder-slate-400 outline-none resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost();
              }}
            />

            {/* Draft files */}
            {draftFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                {draftFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600">
                    <Paperclip size={9} />
                    {f.name.length > 20 ? f.name.slice(0, 18) + '…' : f.name}
                    <button
                      onClick={() => setDraftFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-red-500 transition-colors ml-0.5"
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Paperclip size={11} />
                Attach file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.pptx,.docx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                onClick={handlePost}
                disabled={submitting || (!draftText.trim() && draftFiles.length === 0)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={11} />
                {submitting ? 'Posting…' : isMOT ? 'Post' : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
