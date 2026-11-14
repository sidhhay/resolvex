/**
 * Notification bell — the visible end of the Observer chain.
 *
 * A server-side transition publishes an event; the persistence observer writes
 * a row; the socket observer pushes it here. No polling anywhere.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useSocket } from '../context/SocketContext.jsx';
import { relativeTime } from '../lib/format.js';

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, connected } = useSocket();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // Close on outside click and on Escape — expected behaviour for a popover.
  useEffect(() => {
    if (!open) return undefined;
    /** @param {MouseEvent} event */
    const handleClick = (event) => {
      if (!containerRef.current?.contains(/** @type {Node} */ (event.target))) setOpen(false);
    };
    /** @param {KeyboardEvent} event */
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications, none unread'
        }
        className="relative rounded-md p-2 text-ink-secondary transition hover:bg-surface-2 hover:text-ink"
      >
        <Bell size={18} aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold leading-4 text-white tabular">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-surface shadow-xl ring-1 ring-line"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-ink">Notifications</p>
              {/* Honest about the live connection rather than silently stale. */}
              <span
                className={`size-1.5 rounded-full ${connected ? 'bg-good' : 'bg-ink-muted'}`}
                title={connected ? 'Live' : 'Reconnecting…'}
                aria-label={connected ? 'Live updates connected' : 'Reconnecting'}
              />
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition hover:text-ink"
              >
                <CheckCheck size={12} aria-hidden />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-muted">Nothing yet.</p>
            ) : (
              <ul>
                {notifications.map((notification) => {
                  const body = (
                    <>
                      <p className="text-xs leading-relaxed text-ink">{notification.message}</p>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        {relativeTime(notification.created_at)}
                      </p>
                    </>
                  );
                  return (
                    <li key={notification.id} className="border-b border-line last:border-0">
                      {notification.complaint_id ? (
                        <Link
                          to={`/complaints/${notification.complaint_id}`}
                          onClick={() => {
                            if (!notification.is_read) markRead(notification.id);
                            setOpen(false);
                          }}
                          className={`block px-4 py-3 transition hover:bg-surface-2 ${
                            notification.is_read ? '' : 'bg-series-1/5'
                          }`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={`px-4 py-3 ${notification.is_read ? '' : 'bg-series-1/5'}`}>
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
