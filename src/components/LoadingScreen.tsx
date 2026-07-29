import { useState, useEffect } from 'react';

interface Props {
  font: string;
  /** Seconds to wait before showing the timeout fallback. Default 15. */
  timeoutSeconds?: number;
}

/**
 * Full-screen loading gate. Shows "Loading..." while the app boots, but if it
 * hasn't finished within `timeoutSeconds` it swaps to a friendly message with a
 * Reload button instead of hanging forever. This is the backstop for the case
 * where the initial data reads stall or fail (e.g. Firestore daily read quota
 * exhausted), which otherwise left the app stuck on "Loading..." indefinitely.
 */
export function LoadingScreen({ font, timeoutSeconds = 15 }: Props) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), timeoutSeconds * 1000);
    return () => clearTimeout(t);
  }, [timeoutSeconds]);

  if (!timedOut) {
    return (
      <div style={{ fontFamily: font, padding: 60, textAlign: 'center', color: '#94A3B8' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ fontFamily: font, padding: 60, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ color: '#ef4444', marginBottom: 12 }}>This is taking longer than usual</h2>
      <p style={{ color: '#94A3B8', lineHeight: 1.5, marginBottom: 24 }}>
        The app couldn't finish loading. The database may be temporarily over its
        daily quota &mdash; this usually clears on its own. Try reloading in a moment.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: font }}
      >
        Reload Page
      </button>
    </div>
  );
}
