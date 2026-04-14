import { useState, useRef, useEffect } from 'react';
import { User } from '../types';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  allUsers: User[];
  className?: string;
}

/** Detects an active @mention being typed before the cursor. */
function detectMention(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const atIdx  = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  const query = before.slice(atIdx + 1);
  if (/\s/.test(query)) return null; // space after @ → mention closed
  return { query: query.toLowerCase(), start: atIdx };
}

/** Match users against a query string (first name, last name, or full name prefix). */
function matchUsers(query: string, allUsers: User[]): User[] {
  if (query.length === 0) return allUsers.slice(0, 6);
  return allUsers
    .filter(u => {
      const name = (u.name || '').toLowerCase();
      return name.split(' ').some(part => part.startsWith(query)) || name.startsWith(query);
    })
    .slice(0, 6);
}

export function MentionTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  rows = 2,
  allUsers,
  className = '',
}: Props) {
  const [suggestions,  setSuggestions]  = useState<User[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedIdx,  setSelectedIdx]  = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text   = e.target.value;
    const cursor = e.target.selectionStart ?? text.length;
    onChange(text);

    const mention = detectMention(text, cursor);
    if (mention) {
      const matched = matchUsers(mention.query, allUsers);
      setSuggestions(matched);
      setMentionQuery(mention.query);
      setMentionStart(mention.start);
      setSelectedIdx(0);
    } else {
      setSuggestions([]);
      setMentionStart(-1);
    }
  }

  function insertMention(user: User) {
    // Insert @FirstName (first word of their name) followed by a space
    const firstName = (user.name || '').split(' ')[0];
    const handle    = firstName;   // keep display name casing
    const before    = value.slice(0, mentionStart);
    const after     = value.slice(mentionStart + 1 + mentionQuery.length);
    const newText   = `${before}@${handle} ${after}`;
    onChange(newText);
    setSuggestions([]);
    setMentionStart(-1);

    // Restore focus + cursor position after the inserted mention
    setTimeout(() => {
      if (!textareaRef.current) return;
      const pos = mentionStart + 1 + handle.length + 1; // @handle + space
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(suggestions[selectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setSuggestions([]);
        return;
      }
    }
    onKeyDown?.(e);
  }

  // Dismiss dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />

      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-60 rounded-lg border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
          <p className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            Tag a person
          </p>
          {suggestions.map((u, i) => (
            <button
              key={u.email}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertMention(u); }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                i === selectedIdx ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {(u.name || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-slate-800 truncate">{u.name}</p>
                <p className="text-[10px] text-slate-400">{u.role}</p>
              </div>
            </button>
          ))}
          <p className="px-3 py-1 text-[9px] text-slate-300 border-t border-slate-100">
            ↑↓ navigate · Enter or Tab to select · Esc to dismiss
          </p>
        </div>
      )}
    </div>
  );
}
