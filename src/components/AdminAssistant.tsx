import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

interface AdminAssistantProps {
  isRealAdmin: boolean;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Morning briefing',
  'What needs my attention?',
  'How many plans at DOT?',
  'Who is overloaded?',
];

const BRIEFING_PROMPT =
  'Give me a 3-4 bullet morning briefing: overall pipeline state, what needs attention, and the single most important thing for me to look at today.';

// Map suggestion chip labels to the actual prompt sent to Claude.
function suggestionPrompt(label: string): string {
  return label === 'Morning briefing' ? BRIEFING_PROMPT : label;
}

const askAssistant = httpsCallable<
  { message: string; history: ChatTurn[] },
  { text: string; toolsUsed: string[] }
>(functions, 'askAssistant');

export const AdminAssistant: React.FC<AdminAssistantProps> = ({ isRealAdmin }) => {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async (message: string) => {
    if (!message.trim() || loading) return;
    setError(null);
    const userTurn: ChatTurn = { role: 'user', content: message.trim() };
    const historyForCall = turns;
    setTurns(prev => [...prev, userTurn]);
    setInput('');
    setLoading(true);
    try {
      const res = await askAssistant({ message: userTurn.content, history: historyForCall });
      setTurns(prev => [...prev, { role: 'assistant', content: res.data.text }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [turns, loading]);

  // Auto-scroll transcript on new message
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns, loading]);

  if (!isRealAdmin) return null;

  const reset = () => {
    setTurns([]);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return ReactDOM.createPortal(
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col items-end font-sans">
      {open && (
        <div className="mb-3 flex w-[380px] max-w-[calc(100vw-2.5rem)] flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" style={{ height: 'min(560px, calc(100vh - 7rem))' }}>
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-slate-900 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-sm">✦</div>
              <div>
                <div className="text-sm font-bold">Ask TCP</div>
                <div className="text-[10px] text-slate-400">Admin assistant · Haiku 4.5</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={reset}
                title="New conversation"
                className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          {/* Transcript */}
          <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {turns.length === 0 && !loading && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                  Ask anything about plans, leads, or what needs attention — or pick a starter below.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(suggestionPrompt(s))}
                      className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={
                    t.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-3 py-2 text-sm text-white whitespace-pre-wrap'
                      : 'max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap'
                  }
                >
                  {t.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-500">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }}/>
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }}/>
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }}/>
                  </span>
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                {error}
              </div>
            )}
          </div>

          {/* Follow-up suggestions after a few exchanges */}
          {turns.length > 0 && turns.length <= 4 && !loading && (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 pb-2 pt-2">
              {SUGGESTIONS.filter(s => s !== 'Morning briefing').map(s => (
                <button
                  key={s}
                  onClick={() => send(suggestionPrompt(s))}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-100 p-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={loading}
              className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Hide assistant' : 'Open admin assistant'}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xl text-white shadow-xl ring-2 ring-white hover:scale-105 transition-transform"
      >
        ✦
      </button>
    </div>,
    document.body
  );
};
