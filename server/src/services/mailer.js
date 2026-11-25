/**
 * Transactional e-mail via Nodemailer.
 *
 * When SMTP is not configured (the default for local development) the module
 * degrades to a logging transport: the message is written to the log instead of
 * being sent. Nothing else in the system has to know or branch on that.
 */
import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

/** @type {import('nodemailer').Transporter | null} */
let transporter = null;
let transportKind = /** @type {'smtp' | 'log'} */ ('log');

/**
 * @returns {import('nodemailer').Transporter | null}
 */
function getTransporter() {
  if (transporter) return transporter;
  if (!config.mail.enabled || !config.mail.host) {
    transportKind = 'log';
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    // Bound every stage: a hung SMTP server must not pin a Node worker.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool: true,
    maxConnections: 3,
  });
  transportKind = 'smtp';
  return transporter;
}

/**
 * Confirms the SMTP credentials at boot rather than on the first escalation.
 * Never throws — a broken mail server is a degraded feature, not a dead app.
 * @returns {Promise<boolean>}
 */
export async function verifyMailer() {
  const transport = getTransporter();
  if (!transport) {
    logger.info('Mailer running in log-only mode (set MAIL_ENABLED=true and SMTP_HOST to send)');
    return false;
  }
  try {
    await transport.verify();
    logger.info('SMTP transport ready', { host: config.mail.host, port: config.mail.port });
    return true;
  } catch (error) {
    logger.error('SMTP verification failed — e-mails will be logged instead', { error });
    transporter = null;
    transportKind = 'log';
    return false;
  }
}

/**
 * @typedef {Object} MailMessage
 * @property {string | string[]} to
 * @property {string} subject
 * @property {string} text
 * @property {string} [html]
 */

/**
 * Sends one message. Resolves either way — callers are observers and must not
 * be able to fail a domain operation.
 *
 * @param {MailMessage} message
 * @returns {Promise<boolean>} whether it actually left the building.
 */
export async function sendMail(message) {
  const recipients = Array.isArray(message.to) ? message.to.filter(Boolean) : [message.to];
  if (recipients.length === 0) return false;

  const transport = getTransporter();
  if (!transport) {
    logger.info('[mail:log-only]', {
      to: recipients,
      subject: message.subject,
    });
    return false;
  }

  try {
    await transport.sendMail({
      from: config.mail.from,
      // BCC rather than TO: recipients of an escalation notice have no business
      // seeing each other's addresses.
      bcc: recipients,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return true;
  } catch (error) {
    logger.error('Failed to send e-mail', { subject: message.subject, error });
    return false;
  }
}

/**
 * Wraps body copy in a plain, client-safe HTML shell. Deliberately table-free
 * and inline-styled — this has to survive Outlook and Gmail alike.
 *
 * @param {{ heading: string, body: string, complaintId?: number, cta?: string }} parts
 * @returns {string}
 */
export function renderEmail(parts) {
  const link = parts.complaintId
    ? `${config.mail.appUrl.replace(/\/+$/, '')}/complaints/${parts.complaintId}`
    : config.mail.appUrl;
  const cta = parts.cta ?? 'View complaint';
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0b0b0b">',
    '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#898781">ResolveX</p>',
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(parts.heading)}</h1>`,
    `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#52514e">${escapeHtml(parts.body)}</p>`,
    `<a href="${escapeHtml(link)}" style="display:inline-block;background:#2a78d6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">${escapeHtml(cta)}</a>`,
    '<p style="margin:24px 0 0;font-size:12px;color:#898781">You are receiving this because you are involved in this grievance. Replies to this address are not monitored.</p>',
    '</div>',
  ].join('');
}

/** @returns {'smtp' | 'log'} */
export function getTransportKind() {
  return transportKind;
}

/** @param {string} value @returns {string} */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
