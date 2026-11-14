/**
 * Status and priority chips.
 *
 * Both pair a colour with an icon *and* a text label. Status colour is never
 * the only carrier of meaning — that is the accessibility rule that makes these
 * legible to colour-blind users, in print and under forced-colors.
 */
import { Clock, TriangleAlert } from 'lucide-react';
import { iconFor } from '../lib/icons.js';
import { PRIORITY_META, statusMeta } from '../lib/format.js';

/**
 * @param {{ status: string, size?: 'sm' | 'md' }} props
 */
export function StatusBadge({ status, size = 'md' }) {
  const meta = statusMeta(status);
  const Icon = iconFor(meta.icon);
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${meta.chip} ${sizing}`}
      title={meta.description}
    >
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden />
      {meta.label}
    </span>
  );
}

/**
 * @param {{ priority: string, size?: 'sm' | 'md' }} props
 */
export function PriorityBadge({ priority, size = 'md' }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  const Icon = iconFor(meta.icon);
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${meta.chip} ${sizing}`}
      title={`Priority: ${meta.label}`}
    >
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden />
      {meta.label}
    </span>
  );
}

/**
 * How close a complaint is to its next escalation.
 *
 * Deliberately explicit about *why* a ticket is at risk — "escalates in 0.4d"
 * is actionable in a way that a red dot is not.
 * @param {{ sla: { idleDays: number, nextLevel: number | null,
 *                 daysUntilEscalation: number | null, breached: boolean } | null | undefined,
 *           escalationLevel?: number }} props
 */
export function SlaBadge({ sla, escalationLevel = 0 }) {
  if (!sla) return null;

  if (escalationLevel > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-critical">
        <TriangleAlert size={12} aria-hidden />
        Escalated to level {escalationLevel}
      </span>
    );
  }
  if (sla.nextLevel === null) return null;

  if (sla.breached) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-critical">
        <Clock size={12} aria-hidden />
        SLA breached — idle {sla.idleDays.toFixed(1)}d
      </span>
    );
  }

  const days = sla.daysUntilEscalation ?? 0;
  // Under a day of headroom is the point at which a handler should act today.
  const atRisk = days <= 1;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${atRisk ? 'font-medium text-serious' : 'text-ink-muted'}`}
    >
      <Clock size={12} aria-hidden />
      Escalates in {days < 1 ? `${Math.round(days * 24)}h` : `${days.toFixed(1)}d`}
    </span>
  );
}
