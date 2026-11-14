/**
 * Live status tracking timeline.
 *
 * Renders the append-only audit trail from `complaint_status_history`, merged
 * with the escalation records so a complainant can see not only *what* happened
 * but *when nothing did* — the idle stretch that triggered an escalation is the
 * whole accountability story.
 */
import { Clock, TriangleAlert } from 'lucide-react';
import { iconFor } from '../lib/icons.js';
import { formatDateTime, relativeTime, statusMeta } from '../lib/format.js';

/**
 * Interleaves history entries and escalations into one chronological list.
 * @param {Array<any>} timeline
 * @param {Array<any>} escalations
 */
function merge(timeline, escalations) {
  const entries = timeline.map((entry) => ({
    kind: /** @type {const} */ ('status'),
    at: new Date(entry.created_at).getTime(),
    data: entry,
  }));

  // An escalation is already represented as a status change, but the record
  // carries the reason and the recipient, which the status row does not.
  const raised = escalations.map((escalation) => ({
    kind: /** @type {const} */ ('escalation'),
    at: new Date(escalation.timestamp).getTime(),
    data: escalation,
  }));

  return [...entries, ...raised].sort((a, b) => a.at - b.at || (a.kind === 'status' ? -1 : 1));
}

/**
 * @param {{ timeline: Array<any>, escalations?: Array<any>,
 *           currentStatus: string, sla?: any }} props
 */
export function StatusTimeline({ timeline, escalations = [], currentStatus, sla }) {
  const items = merge(timeline ?? [], escalations ?? []);

  if (items.length === 0) {
    return <p className="px-5 py-6 text-sm text-ink-muted">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative px-5 py-5">
      {/* The rail. Sits behind the markers; aria-hidden as it is pure decoration. */}
      <div className="absolute bottom-6 left-[1.9rem] top-8 w-px bg-line" aria-hidden />

      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (item.kind === 'escalation') {
          return (
            <li key={`esc-${item.data.id}`} className="relative flex gap-4 pb-6 last:pb-0">
              <span className="relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface ring-2 ring-critical">
                <TriangleAlert size={11} className="text-critical" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-critical">
                  Escalated to level {item.data.level}
                  {item.data.escalated_to_name ? ` — ${item.data.escalated_to_name}` : ''}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{item.data.reason}</p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  <time dateTime={new Date(item.data.timestamp).toISOString()}>
                    {formatDateTime(item.data.timestamp)}
                  </time>
                  {' · '}
                  {relativeTime(item.data.timestamp)}
                </p>
              </div>
            </li>
          );
        }

        const entry = item.data;
        const meta = statusMeta(entry.to_status);
        const Icon = iconFor(meta.icon);

        return (
          <li key={`hist-${entry.id}`} className="relative flex gap-4 pb-6 last:pb-0">
            <span
              className="relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface ring-2"
              style={{ '--tw-ring-color': meta.dot, color: meta.dot }}
            >
              <Icon size={11} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{meta.label}</span>
                {entry.from_status && (
                  <span className="text-ink-muted"> · from {entry.from_status}</span>
                )}
              </p>
              {entry.note && (
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{entry.note}</p>
              )}
              <p className="mt-1 text-[11px] text-ink-muted">
                {entry.actor_name ?? 'ResolveX SLA monitor'}
                {entry.actor_role ? ` (${entry.actor_role})` : ' (system)'}
                {' · '}
                <time dateTime={new Date(entry.created_at).toISOString()}>
                  {formatDateTime(entry.created_at)}
                </time>
              </p>

              {/* The live tail: how long the complaint has been sitting here. */}
              {isLast && sla?.nextLevel && !sla.breached && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-ink-secondary">
                  <Clock size={11} aria-hidden />
                  Idle {sla.idleDays.toFixed(1)}d — escalates to level {sla.nextLevel} in{' '}
                  {(sla.daysUntilEscalation ?? 0).toFixed(1)}d
                </p>
              )}
              {isLast && sla?.breached && currentStatus !== 'Escalated' && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-critical/10 px-2 py-1 text-[11px] font-medium text-critical">
                  <TriangleAlert size={11} aria-hidden />
                  Past its service-level threshold — awaiting the next escalation sweep
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
