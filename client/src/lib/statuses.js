/**
 * The status vocabulary, mirrored from the server's State pattern.
 *
 * Kept as a constant rather than fetched so filter controls can render on the
 * first paint; `GET /api/complaints/meta` returns the authoritative list and
 * the transition graph when a screen needs to verify it.
 */
export const COMPLAINT_STATUSES = [
  'Submitted',
  'Assigned',
  'Investigating',
  'Escalated',
  'Resolved',
  'Closed',
];

/** Statuses that still consume SLA budget. */
export const OPEN_STATUSES = ['Submitted', 'Assigned', 'Investigating', 'Escalated'];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
