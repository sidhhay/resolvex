/**
 * SLA compliance meter.
 *
 * One value against a target: a single bar plus a target marker, not a gauge
 * and definitely not a pie. The colour is a *status* (good / warning /
 * critical), so it ships with an icon and a text label — the number is legible
 * with the colour ignored entirely.
 */
import { CircleCheck, TriangleAlert, CircleAlert } from 'lucide-react';

/**
 * @param {{ rate: number | null, target?: number, resolvedOnTime: number,
 *           breached: number, targetDays: number }} props
 */
export function ComplianceMeter({ rate, target = 0.9, resolvedOnTime, breached, targetDays }) {
  if (rate === null || rate === undefined) {
    return (
      <p className="py-8 text-center text-xs text-ink-muted">
        No complaints have reached a resolution yet, so there is nothing to measure.
      </p>
    );
  }

  const percent = Math.max(0, Math.min(1, rate));
  // Three bands: meeting target, close, and clearly failing.
  const state =
    percent >= target
      ? { color: 'var(--status-good)', text: 'text-good', label: 'Meeting target', Icon: CircleCheck }
      : percent >= target - 0.15
        ? { color: 'var(--status-warning)', text: 'text-serious', label: 'Slipping', Icon: TriangleAlert }
        : { color: 'var(--status-critical)', text: 'text-critical', label: 'Below target', Icon: CircleAlert };

  const { Icon } = state;

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-semibold leading-none text-ink">{(percent * 100).toFixed(0)}%</p>
          <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium ${state.text}`}>
            <Icon size={13} aria-hidden />
            {state.label}
          </p>
        </div>
        <p className="text-right text-[11px] leading-relaxed text-ink-muted">
          {resolvedOnTime} resolved within {targetDays} days
          <br />
          {breached} still open past target
        </p>
      </div>

      <div className="relative mt-4">
        <div
          className="h-2.5 w-full overflow-hidden rounded-sm bg-surface-2"
          role="meter"
          aria-valuenow={Math.round(percent * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="SLA compliance rate"
        >
          <div
            className="h-full rounded-r-[4px] transition-[width]"
            style={{ width: `${percent * 100}%`, backgroundColor: state.color }}
          />
        </div>

        {/* Target marker, with a 2px surface ring so it reads on top of the
            bar whichever side of the target the value falls. */}
        <div
          className="absolute -top-1 h-[1.125rem] w-0.5 rounded-full bg-ink"
          style={{ left: `${target * 100}%`, boxShadow: '0 0 0 2px var(--surface-1)' }}
          aria-hidden
        />
        <p
          className="absolute mt-1 -translate-x-1/2 text-[10px] text-ink-muted tabular"
          style={{ left: `${target * 100}%` }}
        >
          target {(target * 100).toFixed(0)}%
        </p>
      </div>
      <div className="h-5" />
    </div>
  );
}
