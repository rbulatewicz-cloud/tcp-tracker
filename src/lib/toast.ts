export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[] = [];
let _listeners: Listener[] = [];
let _nextId = 0;

function _notify() {
  _listeners.forEach(l => l([..._toasts]));
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = _nextId++;
  _toasts = [..._toasts, { id, message, type }];
  _notify();
  setTimeout(() => {
    _toasts = _toasts.filter(t => t.id !== id);
    _notify();
  }, 4500);
}

/** Show a toast that stays until manually dismissed. Returns the id for dismissal. */
export function showPersistentToast(message: string, type: ToastType = 'loading'): number {
  const id = _nextId++;
  _toasts = [..._toasts, { id, message, type }];
  _notify();
  return id;
}

export function dismissToast(id: number) {
  _toasts = _toasts.filter(t => t.id !== id);
  _notify();
}

export function subscribeToasts(listener: Listener): () => void {
  _listeners.push(listener);
  listener([..._toasts]);
  return () => {
    _listeners = _listeners.filter(l => l !== listener);
  };
}
