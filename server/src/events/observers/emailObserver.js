/**
 * OBSERVER — transactional e-mail.
 *
 * Non-blocking, because nobody should wait on an SMTP handshake to see their
 * complaint update, and `sendMail` resolves rather than throws so a dead mail
 * server can never surface as a failed transition.
 *
 * Only events a human genuinely needs in their inbox are wired up:
 * acknowledgement, assignment, escalation, resolution and closure. A plain
 * Submitted → Assigned status tick is left to the in-app channel — mailing
 * every micro-transition is the fastest route to people filtering ResolveX out.
 */
import { EVENTS, describeEvent, emailSubject } from '../events.js';
import { sendMail, renderEmail } from '../../services/mailer.js';

/** Events worth an e-mail. */
export const EMAILABLE_EVENTS = [
  EVENTS.COMPLAINT_CREATED,
  EVENTS.COMPLAINT_ASSIGNED,
  EVENTS.COMPLAINT_ESCALATED,
  EVENTS.COMPLAINT_RESOLVED,
  EVENTS.COMPLAINT_CLOSED,
];

/**
 * @param {string} event
 * @param {import('../events.js').ComplaintEventPayload} payload
 * @returns {string}
 */
function bodyFor(event, payload) {
  const base = describeEvent(/** @type {any} */ (event), payload);
  switch (event) {
    case EVENTS.COMPLAINT_CREATED:
      return `${base} You will be notified as it progresses. Keep the reference number for follow-up.`;
    case EVENTS.COMPLAINT_ESCALATED:
      return `${base} It has now been idle beyond the service-level threshold and needs attention today.`;
    case EVENTS.COMPLAINT_RESOLVED:
      return `${base} If the issue is not actually fixed, reopen it from the portal and the complaint returns to investigation.`;
    default:
      return base;
  }
}

/** @type {import('../eventBus.js').Observer} */
export const emailObserver = {
  name: 'email-dispatch',
  blocking: false,

  /**
   * @param {import('../events.js').ComplaintEventPayload} payload
   * @param {string} event
   */
  async handle(payload, event) {
    const recipients = [...new Set(payload.audience?.emails ?? [])].filter(Boolean);
    if (recipients.length === 0) return;

    const heading = emailSubject(/** @type {any} */ (event), payload).replace(/^\[[^\]]+\]\s*/, '');
    const body = bodyFor(event, payload);

    await sendMail({
      to: recipients,
      subject: emailSubject(/** @type {any} */ (event), payload),
      text: `${body}\n\nOpen the complaint: ${payload.complaint?.id ?? ''}`.trim(),
      html: renderEmail({ heading, body, complaintId: payload.complaint?.id }),
    });
  },
};
