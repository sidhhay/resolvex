/**
 * Accessible modal dialog.
 *
 * Built on the native <dialog> element, which gives focus trapping, Escape to
 * close and the top layer for free — all things a hand-rolled div would have to
 * reimplement badly.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * @param {{ open: boolean, onClose: () => void, title: string,
 *           description?: string, children: React.ReactNode,
 *           footer?: React.ReactNode }} props
 */
export function Modal({ open, onClose, title, description, children, footer }) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape fires `cancel`; route it through the same close path as the button
  // so parent state never drifts out of sync with the dialog's own.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const handleCancel = (event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl bg-surface p-0 text-ink ring-1 ring-line backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="modal-title" className="text-sm font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
          aria-label="Close dialog"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="px-5 py-4">{children}</div>

      {footer && (
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
      )}
    </dialog>
  );
}
