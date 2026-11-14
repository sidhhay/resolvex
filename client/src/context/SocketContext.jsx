/**
 * Real-time context — the client half of the Observer pattern.
 *
 * The server publishes a domain event; observers broadcast it to Socket.IO
 * rooms; this provider receives it and re-renders whatever is on screen. No
 * screen polls.
 *
 * Two channels arrive:
 *   notification:new   a stored notification for this user  → bell menu
 *   complaint:update   a ticket this user can see changed   → live lists
 *
 * The socket connects only while authenticated and carries the same JWT as the
 * REST API, so signing out disconnects it.
 *
 * Serverless deployments (Vercel and friends) cannot hold a websocket open: a
 * Function is request-scoped, and room membership could not be shared between
 * invocations even over long-polling. Set `VITE_REALTIME=off` there and this
 * provider skips the socket entirely and refreshes on a timer instead — the bell
 * and the dashboards stay current, just not instantly. Screens opt in with
 * `usePolledRefresh`, which stands down whenever a live socket is connected, so
 * nothing polls twice.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../api/client.js';
import { notificationApi } from '../api/endpoints.js';
import { useAuth } from './AuthContext.jsx';

/**
 * @typedef {Object} SocketValue
 * @property {boolean} connected
 * @property {boolean} realtimeEnabled  False when the deployment cannot hold a socket.
 * @property {number} pollIntervalMs
 * @property {() => Promise<void>} refreshNotifications
 * @property {Array<Record<string, any>>} notifications
 * @property {number} unreadCount
 * @property {(id: number) => Promise<void>} markRead
 * @property {() => Promise<void>} markAllRead
 * @property {(handler: (payload: any) => void) => () => void} onComplaintUpdate
 *           Subscribes to ticket changes; returns an unsubscribe function.
 * @property {(complaintId: number) => () => void} watchComplaint
 *           Joins one complaint's room; returns a leave function.
 */

/**
 * Real-time is on unless the deployment says otherwise. Reading it from the
 * environment rather than sniffing at runtime means a serverless build never
 * opens a connection it knows will fail.
 */
const REALTIME_ENABLED = (import.meta.env.VITE_REALTIME ?? 'on').toLowerCase() !== 'off';

/** How often the fallback refreshes when there is no live socket. */
const POLL_INTERVAL_MS = Math.max(
  5_000,
  Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 20_000) || 20_000,
);

const SocketContext = createContext(/** @type {SocketValue | null} */ (null));

/** @param {{ children: React.ReactNode }} props */
export function SocketProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState(/** @type {Array<any>} */ ([]));
  const [unreadCount, setUnreadCount] = useState(0);

  const socketRef = useRef(/** @type {import('socket.io-client').Socket | null} */ (null));
  /** Component-level subscribers to `complaint:update`. */
  const listenersRef = useRef(/** @type {Set<(payload: any) => void>} */ (new Set()));

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await notificationApi.list({ limit: 30 });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      /* the bell is not important enough to surface an error for */
    }
  }, [isAuthenticated]);

  // Seed the bell from the API — a socket only delivers what happens while it
  // is connected, so history has to be fetched once.
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    void refreshNotifications();
  }, [isAuthenticated, user?.id, refreshNotifications]);

  // Fallback for deployments with no socket: keep the bell current on a timer.
  // Stands down the moment a live connection exists.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (REALTIME_ENABLED && connected) return undefined;
    const timer = setInterval(() => void refreshNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, connected, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    // No socket server to reach on a serverless deployment; retrying ten times
    // per page load would only produce console noise.
    if (!REALTIME_ENABLED) return undefined;

    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      // The handshake is authenticated; an anonymous socket joins no rooms.
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('notification:new', (notification) => {
      setNotifications((current) => {
        // Reconnects can replay; keep the list idempotent.
        if (current.some((n) => n.id === notification.id)) return current;
        return [notification, ...current].slice(0, 50);
      });
      setUnreadCount((count) => count + 1);
    });

    socket.on('complaint:update', (payload) => {
      for (const listener of listenersRef.current) {
        try {
          listener(payload);
        } catch {
          // One bad subscriber must not stop the others from updating.
        }
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [isAuthenticated]);

  const onComplaintUpdate = useCallback((handler) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const watchComplaint = useCallback((complaintId) => {
    socketRef.current?.emit('complaint:subscribe', complaintId);
    return () => {
      socketRef.current?.emit('complaint:unsubscribe', complaintId);
    };
  }, []);

  const markRead = useCallback(async (id) => {
    // Optimistic: the badge should not lag a click behind.
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const data = await notificationApi.markRead(id);
      setUnreadCount(data.unreadCount);
    } catch {
      setUnreadCount((count) => count + 1);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((current) => current.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await notificationApi.markAllRead().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      connected,
      realtimeEnabled: REALTIME_ENABLED,
      pollIntervalMs: POLL_INTERVAL_MS,
      refreshNotifications,
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      onComplaintUpdate,
      watchComplaint,
    }),
    [
      connected,
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      onComplaintUpdate,
      watchComplaint,
      refreshNotifications,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

/** @returns {SocketValue} */
export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside <SocketProvider>');
  return context;
}

/**
 * Re-runs `handler` whenever any visible complaint changes. Used by the list
 * screens to stay live without polling.
 * @param {(payload: any) => void} handler
 */
export function useComplaintUpdates(handler) {
  const { onComplaintUpdate } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(
    () => onComplaintUpdate((payload) => ref.current(payload)),
    [onComplaintUpdate],
  );
}

/**
 * Refreshes on a timer, but only while live updates are unavailable — either
 * the deployment has real-time switched off, or the socket has dropped and is
 * reconnecting. A screen pairs this with `useComplaintUpdates` and is current
 * either way, without ever fetching twice for the same change.
 *
 * @param {() => void} refresh
 */
export function usePolledRefresh(refresh) {
  const { connected, realtimeEnabled, pollIntervalMs } = useSocket();
  const ref = useRef(refresh);
  ref.current = refresh;

  useEffect(() => {
    if (realtimeEnabled && connected) return undefined;
    const timer = setInterval(() => ref.current(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [connected, realtimeEnabled, pollIntervalMs]);
}
