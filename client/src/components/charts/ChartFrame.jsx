/**
 * Shared chart chrome: title, legend, and a data-table view.
 *
 * The table is not decoration — it is the accessibility fallback every chart
 * here relies on. Several of the light-mode series sit below 3:1 against the
 * surface, which is permitted only when the values are also legible without
 * colour; the direct labels on each mark plus this table are that relief.
 */
import { useId, useState } from 'react';
import { Table2, ChartColumnBig } from 'lucide-react';

/**
 * @param {{ title: string, description?: string,
 *           legend?: Array<{ label: string, color: string }>,
 *           table?: { columns: string[], rows: Array<Array<React.ReactNode>> },
 *           actions?: React.ReactNode,
 *           children: React.ReactNode }} props
 */
export function ChartFrame({ title, description, legend, table, actions, children }) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="rounded-xl bg-surface ring-1 ring-line">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:flex-nowrap">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            >
              {showTable ? <ChartColumnBig size={13} aria-hidden /> : <Table2 size={13} aria-hidden />}
              {showTable ? 'Chart' : 'Data'}
            </button>
          )}
        </div>
      </header>

      {/* A legend is always present for two or more series; identity is never
          carried by colour alone. */}
      {legend && legend.length > 1 && !showTable && (
        <div className="flex flex-wrap items-center gap-4 px-5 pt-4">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {showTable && table ? (
        // Wide tables scroll inside their own container; the page never does.
        <div className="overflow-x-auto px-5 py-4">
          <table className="w-full min-w-[24rem] text-left text-xs">
            <thead>
              <tr className="border-b border-line">
                {table.columns.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={`py-2 font-medium text-ink-muted ${index === 0 ? '' : 'text-right'}`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`py-2 text-ink ${cellIndex === 0 ? '' : 'text-right tabular'}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-4">{children}</div>
      )}
    </section>
  );
}
