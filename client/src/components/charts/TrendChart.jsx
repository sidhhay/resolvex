/**
 * Daily trend — a small multi-series line chart with a crosshair tooltip.
 *
 * Hand-drawn SVG rather than a charting library: two polylines and an axis do
 * not justify a dependency, and doing it directly keeps the marks exactly to
 * spec (2px strokes, >=8px hover targets, one shared y-axis).
 *
 * One axis, always. Filed and resolved counts share a scale because they are
 * the same measure; a second y-axis would let any pair of lines be made to
 * "cross" at will, which is the single most misleading thing a chart can do.
 */
import { useId, useState } from 'react';

const WIDTH = 720;
const HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 24, left: 32 };

/**
 * @param {{ data: Array<Record<string, any>>, xKey: string,
 *           series: Array<{ key: string, label: string, color: string }>,
 *           formatX?: (value: string) => string }} props
 */
export function TrendChart({ data, xKey, series, formatX }) {
  const clipId = useId();
  const [hoverIndex, setHoverIndex] = useState(/** @type {number | null} */ (null));

  if (!data || data.length === 0) {
    return <p className="py-10 text-center text-xs text-ink-muted">No activity in this window.</p>;
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const maxValue = Math.max(
    1,
    ...data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0)),
  );
  // A "nice" ceiling so the gridline labels are round numbers.
  const ceiling = niceCeiling(maxValue);

  /** @param {number} index */
  const x = (index) => PADDING.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
  /** @param {number} value */
  const y = (value) => PADDING.top + plotHeight - (value / ceiling) * plotHeight;

  const ticks = [0, ceiling / 2, ceiling];
  const active = hoverIndex === null ? null : data[hoverIndex];

  /** @param {React.PointerEvent<SVGSVGElement>} event */
  function handlePointer(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    // The SVG scales to its container, so map client px back to view units.
    const localX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (localX - PADDING.left) / plotWidth;
    const index = Math.round(ratio * (data.length - 1));
    setHoverIndex(index >= 0 && index < data.length ? index : null);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Daily trend of ${series.map((s) => s.label).join(' and ')}`}
        onPointerMove={handlePointer}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PADDING.left} y={0} width={plotWidth} height={HEIGHT} />
          </clipPath>
        </defs>

        {/* Recessive grid: hairlines behind the data, never competing with it. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-[var(--ink-muted)] text-[9px] tabular"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--line-strong)"
          strokeWidth={1}
        />

        {series.map((s) => {
          const points = data.map((row, index) => `${x(index)},${y(Number(row[s.key]) || 0)}`).join(' ');
          return (
            <polyline
              key={s.key}
              points={points}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath={`url(#${clipId})`}
            />
          );
        })}

        {/* Crosshair + markers for the hovered day. */}
        {hoverIndex !== null && (
          <>
            <line
              x1={x(hoverIndex)}
              x2={x(hoverIndex)}
              y1={PADDING.top}
              y2={y(0)}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(hoverIndex)}
                cy={y(Number(data[hoverIndex][s.key]) || 0)}
                r={4}
                fill={s.color}
                // A 2px surface ring keeps overlapping markers separable.
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            ))}
          </>
        )}

        {/* First and last x labels only — a label per day would collide. */}
        <text x={PADDING.left} y={HEIGHT - 6} className="fill-[var(--ink-muted)] text-[9px]">
          {formatX ? formatX(String(data[0][xKey])) : String(data[0][xKey])}
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 6}
          textAnchor="end"
          className="fill-[var(--ink-muted)] text-[9px]"
        >
          {formatX
            ? formatX(String(data[data.length - 1][xKey]))
            : String(data[data.length - 1][xKey])}
        </text>
      </svg>

      {active && (
        <div
          role="status"
          className="pointer-events-none absolute -top-1 rounded-md bg-surface px-2.5 py-1.5 text-[11px] shadow-lg ring-1 ring-line"
          style={{
            left: `${((x(/** @type {number} */ (hoverIndex)) / WIDTH) * 100).toFixed(2)}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="font-medium text-ink">
            {formatX ? formatX(String(active[xKey])) : String(active[xKey])}
          </p>
          {series.map((s) => (
            <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-ink-secondary">
              <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
              <span className="ml-auto pl-3 font-medium text-ink tabular">
                {Number(active[s.key]) || 0}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Rounds a maximum up to a value with a readable midpoint.
 * @param {number} value
 * @returns {number}
 */
function niceCeiling(value) {
  if (value <= 2) return 2;
  if (value <= 5) return 6;
  if (value <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}
