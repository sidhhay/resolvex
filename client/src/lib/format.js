/**
 * Presentation helpers: status metadata, dates, durations.
 *
 * Status appearance is defined once here so a badge, a timeline node and a
 * chart segment can never disagree about what "Escalated" looks like.
 */

/**
 * @typedef {Object} StatusMeta
 * @property {string} label
 * @property {string} description
 * @property {string} dot     CSS colour for the marker.
 * @property {string} chip    Tailwind classes for the badge.
 * @property {string} icon    lucide-react icon name.
 */

/** @type {Record<string, StatusMeta>} */
export const STATUS_META = {
  Submitted: {
    label: 'Submitted',
    description: 'Filed and routed to a department, waiting to be picked up.',
    dot: 'var(--ink-muted)',
    chip: 'bg-surface-2 text-ink-secondary ring-line-strong',
    icon: 'Inbox',
  },
  Assigned: {
    label: 'Assigned',
    description: 'A handler owns this complaint.',
    dot: 'var(--series-1)',
    chip: 'bg-series-1/10 text-series-1 ring-series-1/30',
    icon: 'UserCheck',
  },
  Investigating: {
    label: 'Investigating',
    description: 'Work is actively in progress.',
    dot: 'var(--series-3)',
    chip: 'bg-series-3/10 text-series-3 ring-series-3/30',
    icon: 'Search',
  },
  Escalated: {
    label: 'Escalated',
    description: 'Breached its service-level threshold and was raised up the hierarchy.',
    dot: 'var(--status-critical)',
    chip: 'bg-critical/10 text-critical ring-critical/30',
    icon: 'TriangleAlert',
  },
  Resolved: {
    label: 'Resolved',
    description: 'A resolution has been proposed and is awaiting your confirmation.',
    dot: 'var(--status-good)',
    chip: 'bg-good/10 text-good ring-good/30',
    icon: 'CircleCheck',
  },
  Closed: {
    label: 'Closed',
    description: 'Complete. No further changes are possible.',
    dot: 'var(--ink-muted)',
    chip: 'bg-surface-2 text-ink-muted ring-line-strong',
    icon: 'Archive',
  },
};

/** @type {Record<string, { label: string, chip: string, icon: string }>} */
export const PRIORITY_META = {
  low: { label: 'Low', chip: 'bg-surface-2 text-ink-muted ring-line-strong', icon: 'ChevronDown' },
  medium: { label: 'Medium', chip: 'bg-surface-2 text-ink-secondary ring-line-strong', icon: 'Minus' },
  high: { label: 'High', chip: 'bg-serious/12 text-serious ring-serious/30', icon: 'ChevronUp' },
  urgent: { label: 'Urgent', chip: 'bg-critical/12 text-critical ring-critical/30', icon: 'ChevronsUp' },
};

/** Lifecycle order, used to lay out the timeline rail. */
export const STATUS_ORDER = ['Submitted', 'Assigned', 'Investigating', 'Resolved', 'Closed'];

/**
 * @param {string} status
 * @returns {StatusMeta}
 */
export function statusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.Submitted;
}

/**
 * @param {string | Date | null | undefined} value
 * @returns {string}
 */
export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * @param {string | Date | null | undefined} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "3 days ago", "in 4 hours". Uses Intl so it localises for free.
 * @param {string | Date | null | undefined} value
 * @returns {string}
 */
export function relativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  /** @type {Array<[Intl.RelativeTimeFormatUnit, number]>} */
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), 'second');
}

/**
 * Human duration from a second count, e.g. "2d 4h", "38m".
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;

  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/**
 * @param {number | null | undefined} value 0..1
 * @param {number} [digits]
 * @returns {string}
 */
export function formatPercent(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat().format(value);
}

/**
 * Visual tone for a transition button.
 *
 * The destination alone is not enough: reaching `Closed` from `Resolved` is the
 * complainant accepting an outcome (positive), while reaching it from
 * `Submitted` is a withdrawal or a rejection (destructive). Painting both green
 * would misrepresent one of them.
 *
 * @param {string} to
 * @param {string} [from] The complaint's current status.
 * @returns {'positive' | 'danger' | 'neutral'}
 */
export function transitionTone(to, from) {
  if (to === 'Resolved') return 'positive';
  if (to === 'Closed') return from === 'Resolved' ? 'positive' : 'danger';
  if (to === 'Escalated') return 'danger';
  // Reopening rejects a proposed resolution — a serious act, but not destructive.
  if (to === 'Investigating' && from === 'Resolved') return 'danger';
  return 'neutral';
}
