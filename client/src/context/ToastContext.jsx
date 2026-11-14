/**
 * Transient toast messages.
 *
 * Live in a context so any screen — or a socket event — can raise one without
 * threading callbacks through the tree.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

/** @typedef {'success' | 'error' | 'info'} ToastTone */

const ToastContext = createContext(
  /** @type {{ push: (message: string, tone?: ToastTone) => void } | null} */ (null),
);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const TONE_CLASSES = {
  success: 'text-good',
  error: 'text-critical',
  info: 'text-series-1',
};

/** @param {{ children: React.ReactNode }} props */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(
    /** @type {Array<{ id: number, message: string, tone: ToastTone }>} */ ([]),
  );
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = /** @type {ToastTone} */ ('info')) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }].slice(-4));
      // Errors linger; confirmations get out of the way.
      setTimeout(() => dismiss(id), tone === 'error' ? 8_000 : 4_500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live so screen readers announce toasts without stealing focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-lg bg-surface px-4 py-3 shadow-lg ring-1 ring-line"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${TONE_CLASSES[toast.tone]}`} aria-hidden />
              <p className="flex-1 text-sm leading-snug text-ink">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-ink-muted transition hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** @returns {{ push: (message: string, tone?: ToastTone) => void }} */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
