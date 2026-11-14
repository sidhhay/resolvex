/**
 * Handler dashboard — the working queue.
 *
 * Three things the brief asks for, all served from the same list:
 *   • one-click state transitions — the buttons on each row are the server's
 *     `availableTransitions`, so the State pattern decides what appears;
 *   • ticket filtering — status, priority, search, plus the two views that
 *     actually matter day to day (unassigned, and breaching SLA);
 *   • department reassignment — the reassign action opens the same dialog and
 *     accepts a new owner and/or a new department.
 *
 * Rows update live over the socket, so two handlers working the same queue see
 * each other's actions immediately rather than colliding.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { complaintApi, departmentApi } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useComplaintUpdates, usePolledRefresh } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, EmptyState, ErrorState, Spinner, inputClasses } from '../../components/ui/index.jsx';
import { PriorityBadge, SlaBadge, StatusBadge } from '../../components/StatusBadge.jsx';
import { TransitionDialog } from '../../components/TransitionDialog.jsx';
import { relativeTime, transitionTone } from '../../lib/format.js';
import { COMPLAINT_STATUSES, PRIORITIES } from '../../lib/statuses.js';
import { ResolveHelperCard } from '../../components/ResolveHelperCard.jsx';

/** Saved views — the queues a handler actually works from. */
const VIEWS = [
  { key: 'open', label: 'Open', params: { openOnly: true } },
  { key: 'mine', label: 'Assigned to me', params: { mine: true, openOnly: true } },
  { key: 'unassigned', label: 'Unclaimed', params: { unassignedOnly: true, openOnly: true } },
  { key: 'escalated', label: 'Escalated', params: { escalatedOnly: true } },
  { key: 'all', label: 'All', params: {} },
];

export function HandlerDashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [view, setView] = useState('open');
  const [filters, setFilters] = useState({ status: '', priority: '', search: '', departmentId: '' });
  const [sort, setSort] = useState('last_activity_at');

  const [data, setData] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const [departments, setDepartments] = useState(/** @type {Array<any>} */ ([]));
  const [handlers, setHandlers] = useState(/** @type {Array<any>} */ ([]));
  const [dialog, setDialog] = useState(/** @type {{ complaint: any, transition: any } | null} */ (null));

  const params = useMemo(() => {
    const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
    /** @type {Record<string, unknown>} */
    const next = { ...active.params, pageSize: 50, sort, order: sort === 'priority' ? 'desc' : 'asc' };
    if (filters.status) next.status = filters.status;
    if (filters.priority) next.priority = filters.priority;
    if (filters.search.trim()) next.search = filters.search.trim();
    // Only an administrator may look outside their own department.
    if (filters.departmentId && user?.role === 'admin') next.departmentId = Number(filters.departmentId);
    return next;
  }, [view, filters, sort, user?.role]);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      setError(null);
      try {
        setData(await complaintApi.list(params));
      } catch (err) {
        setError(/** @type {Error} */ (err).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [params],
  );

  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    departmentApi
      .list()
      .then((res) => setDepartments(res.departments))
      .catch(() => setDepartments([]));
  }, []);

  // A change from another handler can move a ticket in or out of this view, so
  // the whole query is re-run rather than the row patched.
  useComplaintUpdates(useCallback(() => load(true), [load]));
  // Keeps the queue current where there is no socket (serverless deployments).
  usePolledRefresh(useCallback(() => load(true), [load]));

  /** @param {any} complaint */
  async function openDialog(complaint, transition) {
    setDialog({ complaint, transition });
    // Populate the assignee dropdown for this complaint's department.
    if (complaint.department_id) {
      departmentApi
        .handlers(complaint.department_id)
        .then((res) => setHandlers(res.handlers))
        .catch(() => setHandlers([]));
    }
  }

  /** @param {Record<string, unknown>} body */
  async function submitTransition(body) {
    if (!dialog) return;
    await complaintApi.transition(dialog.complaint.id, body);
    toast.push(`Complaint #${dialog.complaint.id} → ${body.to}.`, 'success');
    await load(true);
  }

  const breaching = data?.complaints.filter((c) => c.sla?.breached && c.escalation_level === 0) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {user?.role === 'admin' ? 'All complaints' : 'Department queue'}
          </h1>
          <p className="text-sm text-ink-secondary">
            {user?.role === 'admin'
              ? 'Every complaint across the institution.'
              : `${user?.departmentName ?? 'Your department'} — plus anything assigned to you.`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => load(true)} loading={refreshing}>
          <RefreshCw size={14} aria-hidden />
          Refresh
        </Button>
      </div>

      <div className="flex justify-center mb-4 w-full">
        <ResolveHelperCard />
      </div>

      {/* A standing warning: tickets that will escalate on the next sweep. */}
      {breaching.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg bg-serious/10 px-4 py-3 text-xs text-serious"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">
              {breaching.length} complaint{breaching.length === 1 ? '' : 's'} past the service-level
              threshold.
            </span>{' '}
            These escalate automatically on the next sweep unless they move.
          </p>
        </div>
      )}

      <Card>
        {/* Views */}
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2" role="tablist">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={view === item.key}
              onClick={() => setView(item.key)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs transition ${
                view === item.key
                  ? 'bg-surface-2 font-medium text-ink'
                  : 'text-ink-secondary hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Filters, one row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-44 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              type="search"
              className={`${inputClasses} pl-8`}
              placeholder="Search title or description…"
              aria-label="Search complaints"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>

          <select
            className={`${inputClasses} w-auto`}
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Any status</option>
            {COMPLAINT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            className={`${inputClasses} w-auto`}
            aria-label="Filter by priority"
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>

          {user?.role === 'admin' && (
            <select
              className={`${inputClasses} w-auto`}
              aria-label="Filter by department"
              value={filters.departmentId}
              onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          )}

          <select
            className={`${inputClasses} w-auto`}
            aria-label="Sort by"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="last_activity_at">Most neglected first</option>
            <option value="created_at">Newest first</option>
            <option value="priority">Highest priority</option>
          </select>
        </div>

        {loading && <Spinner label="Loading the queue…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => load()} />}
        {!loading && !error && data?.complaints.length === 0 && (
          <EmptyState
            icon={Inbox}
            title="Nothing in this view"
            description="Either the queue is clear or the filters are too narrow."
          />
        )}

        {!loading && !error && data?.complaints.length > 0 && (
          <ul className="divide-y divide-line">
            {data.complaints.map((complaint) => (
              <li key={complaint.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    to={`/complaints/${complaint.id}`}
                    className="min-w-0 flex-1 text-sm font-medium text-ink transition hover:text-series-1"
                  >
                    <span className="text-ink-muted tabular">#{complaint.id}</span> {complaint.title}
                  </Link>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={complaint.priority} size="sm" />
                    <StatusBadge status={complaint.status} size="sm" />
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                  <span>{complaint.department_name ?? 'Unrouted'}</span>
                  <span aria-hidden>·</span>
                  <span>{complaint.creator_name}</span>
                  <span aria-hidden>·</span>
                  <span>Last activity {relativeTime(complaint.last_activity_at)}</span>
                  {complaint.assignee_name && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{complaint.assignee_name}</span>
                    </>
                  )}
                  <SlaBadge sla={complaint.sla} escalationLevel={complaint.escalation_level} />
                </div>

                {/* One click per legal move, straight from the state machine. */}
                {complaint.availableTransitions?.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {complaint.availableTransitions.map((transition) => (
                      <Button
                        key={transition.to + transition.label}
                        size="sm"
                        variant={
                          {
                            positive: 'positive',
                            danger: 'danger',
                            neutral: 'secondary',
                          }[transitionTone(transition.to, complaint.status)]
                        }
                        onClick={() => openDialog(complaint, transition)}
                      >
                        {transition.label}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {data?.pagination && data.pagination.total > data.complaints.length && (
          <p className="border-t border-line px-4 py-3 text-[11px] text-ink-muted">
            Showing {data.complaints.length} of {data.pagination.total}. Narrow the filters to see the rest.
          </p>
        )}
      </Card>

      <TransitionDialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        transition={dialog?.transition ?? null}
        complaint={dialog?.complaint ?? null}
        handlers={handlers}
        departments={departments}
        onSubmit={submitTransition}
      />
    </div>
  );
}
