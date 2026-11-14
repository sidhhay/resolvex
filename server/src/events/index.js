/**
 * Observer registration — the wiring diagram for the Observer pattern.
 *
 * Called once at boot. This is the only place that knows which observers exist;
 * the domain publishes events and never sees this file.
 */
import { EVENTS } from './events.js';
import { eventBus } from './eventBus.js';
import { notificationObserver, NOTIFIABLE_EVENTS } from './observers/notificationObserver.js';
import { socketObserver } from './observers/socketObserver.js';
import { emailObserver, EMAILABLE_EVENTS } from './observers/emailObserver.js';
import { logger } from '../config/logger.js';

let registered = false;

/**
 * Idempotent so a test that boots the app twice does not double-send.
 * @returns {void}
 */
export function registerObservers() {
  if (registered) return;

  //  domain event ──▶ notificationObserver (blocking)  ──▶ notification.created
  //               ├─▶ socketObserver      (async)      ◀──┘
  //               └─▶ emailObserver       (async)
  eventBus.subscribe(NOTIFIABLE_EVENTS, notificationObserver);
  eventBus.subscribe([...NOTIFIABLE_EVENTS, EVENTS.NOTIFICATION_CREATED], socketObserver);
  eventBus.subscribe(EMAILABLE_EVENTS, emailObserver);

  registered = true;
  logger.info('Observers registered', {
    observers: [notificationObserver.name, socketObserver.name, emailObserver.name],
  });
}

export { eventBus, EVENTS };
