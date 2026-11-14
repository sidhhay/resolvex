/**
 * A single headline number.
 *
 * Deliberately not a chart: one value has no shape to plot, and a sparkline
 * next to it would be decoration. The value uses proportional figures; only
 * columns that must align vertically get tabular ones.
 */
import { iconFor } from '../../lib/icons.js';

/**
 * @param {{ label: string, value: React.ReactNode, hint?: string,
 *           icon?: string, tone?: 'default' | 'good' | 'warning' | 'critical' }} props
 */
export function StatTile({ label, value, hint, icon, tone = 'default' }) {
  const Icon = icon ? iconFor(icon) : null;
  const toneClass = {
    default: 'text-ink',
    good: 'text-good',
    warning: 'text-serious',
    critical: 'text-critical',
  }[tone];

  return (
    <div className="rounded-xl bg-surface px-4 py-4 ring-1 ring-line">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={13} className="shrink-0 text-ink-muted" aria-hidden />}
        <p className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-semibold leading-none ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}
