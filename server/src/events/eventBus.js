/**
 * ============================================================================
 * DESIGN PATTERN #4 — OBSERVER
 * ============================================================================
 * `NotificationBroker` is the Subject. Observers register once at boot
 * (see events/index.js) and the domain publishes events without knowing, or
 * caring, who is listening.
 *
 * Two properties matter more than the pattern itself:
 *
 *   1. **An observer can never break a transition.** Every handler runs inside
 *      its own try/catch. If SMTP is down, the ticket still moves and the
 *      failure is logged — the notification layer is strictly downstream of
 *      the domain.
 *
 *   2. **Blocking vs. non-blocking.** Observers declare which they are.
 *      Persisting a notification row is blocking, because the HTTP response
 *      that follows must not race the row it announced. Sending e-mail is
 *      non-blocking: nobody should wait on an SMTP handshake to see their
 *      complaint update.
 * ============================================================================
 */
import { logger } from '../config/logger.js';

/**
 * @typedef {Object} Observer
 * @property {string} name
 * @property {boolean} [blocking]
 *           True → `publish()` awaits it. Default false (fire-and-forget).
 * @property {(payload: any, event: string) => unknown | Promise<unknown>} handle
 */

export class NotificationBroker {
  constructor() {
    /** @type {Map<string, Set<Observer>>} */
    this.observers = new Map();
  }

  /**
   * @param {string | string[]} events
   * @param {Observer} observer
   * @returns {() => void} unsubscribe handle
   */
  subscribe(events, observer) {
    const names = Array.isArray(events) ? events : [events];
    for (const name of names) {
      if (!this.observers.has(name)) this.observers.set(name, new Set());
      /** @type {Set<Observer>} */ (this.observers.get(name)).add(observer);
    }
    return () => {
      for (const name of names) this.observers.get(name)?.delete(observer);
    };
  }

  /**
   * @param {string} event
   * @param {Observer} observer
   */
  unsubscribe(event, observer) {
    this.observers.get(event)?.delete(observer);
  }

  /** Drops every registration. Used between test cases. */
  clear() {
    this.observers.clear();
  }

  /**
   * @param {string} event
   * @returns {Observer[]}
   */
  listenersFor(event) {
    return [...(this.observers.get(event) ?? [])];
  }

  /**
   * Notifies every observer registered for `event`.
   *
   * Resolves once the blocking observers have finished. Non-blocking observers
   * keep running in the background; their failures are logged, never thrown.
   *
   * @param {string} event
   * @param {any} payload
   * @returns {Promise<void>}
   */
  async publish(event, payload) {
    const observers = this.listenersFor(event);
    if (observers.length === 0) {
      logger.debug('Event published with no observers', { event });
      return;
    }

    /** @type {Promise<unknown>[]} */
    const blocking = [];

    for (const observer of observers) {
      const run = (async () => {
        try {
          await observer.handle(payload, event);
        } catch (error) {
          // Swallowed on purpose: notification delivery is best-effort and must
          // never roll back or fail the domain operation that triggered it.
          logger.error('Observer failed', { observer: observer.name, event, error });
        }
      })();

      if (observer.blocking) blocking.push(run);
      else void run;
    }

    await Promise.all(blocking);
  }
}

/** Process-wide Subject. */
export const eventBus = new NotificationBroker();
