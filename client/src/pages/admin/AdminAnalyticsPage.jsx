/**
 * Administrator analytics.
 *
 * Answers the three questions the brief names — SLA compliance, time to
 * assignment, and what has been escalated — and one more that matters in an
 * AI-routed system: is the classifier actually working, or has it been
 * silently falling back to keyword rules?
 *
 * Everything comes from one request; six charts firing six requests would
 * produce a visibly staggered page for no benefit.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, PlayCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { analyticsApi, departmentApi } from '../../api/endpoints.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useComplaintUpdates, usePolledRefresh } from '../../context/SocketContext.jsx';
import { Button, Card, ErrorState, SectionHeader, Spinner, inputClasses } from '../../components/ui/index.jsx';
import { ChartFrame } from '../../components/charts/ChartFrame.jsx';
import { StatTile } from '../../components/charts/StatTile.jsx';
import { BarChart } from '../../components/charts/BarChart.jsx';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { ComplianceMeter } from '../../components/charts/ComplianceMeter.jsx';
import { formatDate, formatDateTime, formatDuration, formatPercent, statusMeta } from '../../lib/format.js';

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export function AdminAnalyticsPage() {
  const toast = useToast();

  const [days, setDays] = useState(30);
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState(/** @type {any} */ (null));
  const [escalations, setEscalations] = useState(/** @type {any} */ (null));
  const [departments, setDepartments] = useState(/** @type {Array<any>} */ ([]));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      setError(null);
      try {
        /** @type {Record<string, unknown>} */
        const params = { days };
        if (departmentId) params.departmentId = Number(departmentId);

        const [overview, escalationLog] = await Promise.all([
          analyticsApi.overview(params),
          analyticsApi.escalations({ pageSize: 15, ...(departmentId ? { departmentId: Number(departmentId) } : {}) }),
        ]);
        setData(overview);
        setEscalations(escalationLog);
      } catch (err) {
        setError(/** @type {Error} */ (err).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days, departmentId],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    departmentApi
      .list()
      .then((res) => setDepartments(res.departments))
      .catch(() => setDepartments([]));
  }, []);

  // Admins are subscribed to the escalation broadcast, so the dashboard moves
  // the moment the sweep fires anywhere in the system.
  useComplaintUpdates(useCallback(() => load(true), [load]));
  usePolledRefresh(useCallback(() => load(true), [load]));

  async function runSweep() {
    setSweeping(true);
    try {
      const { report } = await analyticsApi.runSweep();
      toast.push(
        report.escalated > 0
          ? `Sweep escalated ${report.escalated} of ${report.examined} overdue complaints.`
          : `Sweep examined ${report.examined} complaints; nothing needed escalating.`,
        report.failed > 0 ? 'error' : 'success',
      );
      await load(true);
    } catch (err) {
      toast.push(/** @type {Error} */ (err).message, 'error');
    } finally {
      setSweeping(false);
    }
  }

  if (loading) return <Spinner label="Building the analytics view…" />;
  if (error) return <Card><ErrorState message={error} onRetry={() => load()} /></Card>;

  const { summary, byStatus, byDepartment, trend, classifier, thresholds } = data;
  const keywordRouted = classifier.find((c) => c.strategy === 'keyword')?.count ?? 0;
  const totalRouted = classifier.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* ---- header + filters ------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Analytics</h1>
          <p className="text-sm text-ink-secondary">
            Service-level performance, routing quality and the escalation record.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputClasses} w-auto`}
            aria-label="Filter by department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>

          <div className="flex rounded-md ring-1 ring-line-strong" role="group" aria-label="Time window">
            {WINDOWS.map((window) => (
              <button
                key={window.days}
                type="button"
                onClick={() => setDays(window.days)}
                aria-pressed={days === window.days}
                className={`px-3 py-2 text-xs transition first:rounded-l-md last:rounded-r-md ${
                  days === window.days ? 'bg-surface-2 font-medium text-ink' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {window.label}
              </button>
            ))}
          </div>

          <Button variant="secondary" size="md" onClick={() => load(true)} loading={refreshing}>
            <RefreshCw size={14} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {/* ---- KPI tiles ---------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total complaints" value={summary.total} icon="Inbox" hint={`${summary.open} still open`} />
        <StatTile
          label="Median time to assignment"
          value={formatDuration(summary.medianAssignmentSeconds)}
          icon="UserCheck"
          hint={`Mean ${formatDuration(summary.avgAssignmentSeconds)} · ${summary.unassigned} unclaimed now`}
        />
        <StatTile
          label="Median time to resolution"
          value={formatDuration(summary.medianResolutionSeconds)}
          icon="CircleCheck"
          hint={`Target ${thresholds.resolutionTargetDays} days`}
        />
        <StatTile
          label="Escalation rate"
          value={formatPercent(summary.escalationRate)}
          icon="TriangleAlert"
          tone={summary.escalationRate > 0.25 ? 'critical' : summary.escalationRate > 0.1 ? 'warning' : 'default'}
          hint={`${summary.escalatedLevel1} to HOD · ${summary.escalatedLevel2} to Dean`}
        />
      </div>

      {/* ---- compliance + status ------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="SLA compliance"
          description={`Share of concluded complaints resolved within ${thresholds.resolutionTargetDays} days. Complaints still open past the target count against it, so the rate cannot be flattered by leaving work unfinished.`}
        >
          <ComplianceMeter
            rate={summary.slaComplianceRate}
            resolvedOnTime={summary.resolvedOnTime}
            breached={summary.openPastTarget}
            targetDays={thresholds.resolutionTargetDays}
          />
        </ChartFrame>

        <ChartFrame
          title="Where complaints stand"
          description="Current status across the selected window."
          table={{
            columns: ['Status', 'Complaints'],
            rows: byStatus.map((row) => [row.status, row.count]),
          }}
        >
          <BarChart
            data={byStatus}
            categoryKey="status"
            segments={[{ key: 'count', label: 'complaints', color: 'var(--series-1)' }]}
            emptyLabel="No complaints in this window."
          />
        </ChartFrame>
      </div>

      {/* ---- department load ---------------------------------------------- */}
      <ChartFrame
        title="Load by department"
        description="Open work, escalations and completed complaints per department."
        legend={[
          { label: 'Open', color: 'var(--series-1)' },
          { label: 'Escalated', color: 'var(--series-2)' },
          { label: 'Concluded', color: 'var(--series-3)' },
        ]}
        table={{
          columns: ['Department', 'Open', 'Escalated', 'Concluded', 'Median resolution'],
          rows: byDepartment.map((row) => [
            row.department_name,
            row.open,
            row.escalated,
            row.done,
            formatDuration(row.median_resolution_seconds),
          ]),
        }}
      >
        <BarChart
          data={byDepartment}
          categoryKey="department_name"
          segments={[
            { key: 'open', label: 'open', color: 'var(--series-1)' },
            { key: 'escalated', label: 'escalated', color: 'var(--series-2)' },
            { key: 'done', label: 'concluded', color: 'var(--series-3)' },
          ]}
          emptyLabel="No complaints have been routed yet."
        />
      </ChartFrame>

      {/* ---- trends -------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Filed vs resolved"
          description={`Daily counts over the last ${days} days. One shared axis — both lines are the same measure.`}
          legend={[
            { label: 'Filed', color: 'var(--series-1)' },
            { label: 'Resolved', color: 'var(--series-3)' },
          ]}
          table={{
            columns: ['Day', 'Filed', 'Resolved'],
            rows: trend.map((row) => [formatDate(row.day), row.created, row.resolved]),
          }}
        >
          <TrendChart
            data={trend}
            xKey="day"
            formatX={formatDate}
            series={[
              { key: 'created', label: 'Filed', color: 'var(--series-1)' },
              { key: 'resolved', label: 'Resolved', color: 'var(--series-3)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame
          title="Escalations raised"
          description={`Level 1 after ${thresholds.level1Days} idle days, level 2 after ${thresholds.level2Days}.`}
          // Escalation level is a magnitude within one concept, so the two
          // series take one hue stepped light -> dark rather than two
          // categorical colours.
          legend={[
            { label: 'Level 1 — HOD', color: 'var(--escalation-1)' },
            { label: 'Level 2 — Dean', color: 'var(--escalation-2)' },
          ]}
          table={{
            columns: ['Day', 'Level 1', 'Level 2'],
            rows: trend.map((row) => [formatDate(row.day), row.escalated_l1, row.escalated_l2]),
          }}
        >
          <TrendChart
            data={trend}
            xKey="day"
            formatX={formatDate}
            series={[
              { key: 'escalated_l1', label: 'Level 1 — HOD', color: 'var(--escalation-1)' },
              { key: 'escalated_l2', label: 'Level 2 — Dean', color: 'var(--escalation-2)' },
            ]}
          />
        </ChartFrame>
      </div>

      {/* ---- classifier health --------------------------------------------- */}
      <ChartFrame
        title="Routing engine"
        description="Which strategy classified each complaint. A jump in keyword routing means the LLM was unreachable."
        table={{
          columns: ['Engine', 'Complaints', 'Mean confidence'],
          rows: classifier.map((row) => [
            row.strategy,
            row.count,
            row.avg_confidence === null ? '—' : `${(row.avg_confidence * 100).toFixed(0)}%`,
          ]),
        }}
      >
        <BarChart
          data={classifier}
          categoryKey="strategy"
          segments={[{ key: 'count', label: 'complaints', color: 'var(--series-1)' }]}
          emptyLabel="Nothing routed yet."
        />
        {totalRouted > 0 && keywordRouted / totalRouted > 0.5 && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-serious/10 px-3 py-2 text-xs text-serious">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            Over half of these complaints were routed by keyword rules. Check the LLM credentials and
            the AI_TIMEOUT_MS setting.
          </p>
        )}
      </ChartFrame>

      {/* ---- escalation log -------------------------------------------------- */}
      <Card>
        <SectionHeader
          title="Escalation log"
          description="Every escalation the Chain of Responsibility has raised, most recent first."
          actions={
            <Button variant="secondary" size="sm" onClick={runSweep} loading={sweeping}>
              <PlayCircle size={14} aria-hidden />
              Run sweep now
            </Button>
          }
        />

        {!escalations || escalations.escalations.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-ink-muted">
            No escalations recorded. Every complaint has been answered inside its service window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-5 py-2.5 font-medium text-ink-muted">Level</th>
                  <th scope="col" className="py-2.5 font-medium text-ink-muted">Complaint</th>
                  <th scope="col" className="py-2.5 font-medium text-ink-muted">Department</th>
                  <th scope="col" className="py-2.5 font-medium text-ink-muted">Escalated to</th>
                  <th scope="col" className="py-2.5 font-medium text-ink-muted">Status now</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium text-ink-muted">When</th>
                </tr>
              </thead>
              <tbody>
                {escalations.escalations.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                        style={{
                          backgroundColor: row.level === 2 ? 'var(--escalation-2)' : 'var(--escalation-1)',
                          color: row.level === 2 ? '#fff' : 'var(--ink-primary)',
                        }}
                      >
                        <TriangleAlert size={11} aria-hidden />
                        L{row.level}
                      </span>
                    </td>
                    <td className="max-w-64 py-2.5">
                      <Link
                        to={`/complaints/${row.complaint_id}`}
                        className="block truncate text-ink transition hover:text-series-1"
                        title={row.complaint_title}
                      >
                        <span className="text-ink-muted tabular">#{row.complaint_id}</span>{' '}
                        {row.complaint_title}
                      </Link>
                    </td>
                    <td className="py-2.5 text-ink-secondary">{row.department_name ?? '—'}</td>
                    <td className="py-2.5 text-ink-secondary">{row.escalated_to_name ?? '—'}</td>
                    <td className="py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 text-ink-secondary"
                        title={statusMeta(row.complaint_status).description}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: statusMeta(row.complaint_status).dot }}
                          aria-hidden
                        />
                        {row.complaint_status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-muted">
                      {formatDateTime(row.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
