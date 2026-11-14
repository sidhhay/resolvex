/**
 * Horizontal bar chart.
 *
 * Horizontal because the category labels are long department names — rotated
 * x-axis labels are the classic unreadable choice here.
 *
 * Mark spec followed deliberately:
 *   • bars are anchored to the baseline and rounded only on the data end;
 *   • stacked segments carry a 2px surface gap so they never blur together;
 *   • every bar is directly labelled with its value, which is also the relief
 *     for the series colours that sit under 3:1 on the light surface;
 *   • one measure, one axis — never a second scale.
 */

/**
 * @typedef {Object} BarSegment
 * @property {string} key
 * @property {string} label
 * @property {string} color  A CSS colour or var().
 */

/**
 * @param {{ data: Array<Record<string, any>>, categoryKey: string,
 *           segments: BarSegment[], total?: (row: any) => number,
 *           emptyLabel?: string }} props
 */
export function BarChart({ data, categoryKey, segments, total, emptyLabel = 'No data yet.' }) {
  if (!data || data.length === 0) {
    return <p className="py-8 text-center text-xs text-ink-muted">{emptyLabel}</p>;
  }

  const totalFor = total ?? ((row) => segments.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0));
  // A shared scale across rows: bar length is only comparable if every row is
  // measured against the same maximum.
  const max = Math.max(1, ...data.map(totalFor));

  return (
    <ul className="flex flex-col gap-3">
      {data.map((row) => {
        const rowTotal = totalFor(row);
        const label = String(row[categoryKey]);

        return (
          <li key={label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-ink-secondary" title={label}>
                {label}
              </span>
              <span className="shrink-0 text-xs font-medium text-ink tabular">{rowTotal}</span>
            </div>

            <div
              className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-2"
              role="img"
              aria-label={`${label}: ${segments
                .map((s) => `${Number(row[s.key]) || 0} ${s.label}`)
                .join(', ')}`}
            >
              {segments.map((segment, index) => {
                const value = Number(row[segment.key]) || 0;
                if (value === 0) return null;
                const isLast = index === segments.length - 1 || segments.slice(index + 1).every((s) => !row[s.key]);

                return (
                  <span
                    key={segment.key}
                    title={`${segment.label}: ${value}`}
                    style={{
                      width: `${(value / max) * 100}%`,
                      backgroundColor: segment.color,
                      // 2px of surface between adjacent fills keeps the
                      // boundary readable without a stroke.
                      marginRight: isLast ? 0 : 2,
                      borderTopRightRadius: isLast ? 4 : 0,
                      borderBottomRightRadius: isLast ? 4 : 0,
                    }}
                  />
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
