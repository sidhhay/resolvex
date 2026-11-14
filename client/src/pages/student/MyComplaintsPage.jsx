import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, Inbox, Search } from 'lucide-react';
import { complaintApi } from '../../api/endpoints.js';
import { useComplaintUpdates, usePolledRefresh } from '../../context/SocketContext.jsx';
import { Button, Card, EmptyState, ErrorState, Spinner, inputClasses } from '../../components/ui/index.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { relativeTime } from '../../lib/format.js';
import { COMPLAINT_STATUSES } from '../../lib/statuses.js';

export function MyComplaintsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ status: '', search: '' });

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = { pageSize: 50 };
      if (filters.status) params.status = filters.status;
      if (filters.search.trim()) params.search = filters.search.trim();
      setData(await complaintApi.list(params));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  usePolledRefresh(load);
  useComplaintUpdates(
    useCallback((payload) => {
      setData((current) => {
        if (!current) return current;
        const index = current.complaints.findIndex((c) => c.id === payload.complaint?.id);
        if (index === -1) return current;
        const next = [...current.complaints];
        next[index] = { ...next[index], ...payload.complaint };
        return { ...current, complaints: next };
      });
    }, [])
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">My complaints</h1>
          <p className="text-sm text-ink-secondary">Track the progress of issues you've reported.</p>
        </div>
        <Link to="/complaints/new">
          <Button>
            <FilePlus2 size={16} aria-hidden />
            New complaint
          </Button>
        </Link>
      </div>

      <Card>
        {/* Filters in one row above the list */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative min-w-44 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              className={`${inputClasses} pl-8`}
              placeholder="Search your complaints…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>

          <select
            className={`${inputClasses} w-auto`}
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Any status</option>
            {COMPLAINT_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {loading && <Spinner label="Loading your complaints…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && data?.complaints.length === 0 && (
          <EmptyState
            icon={Inbox}
            title="No complaints found"
            description="You haven't filed any complaints matching these filters."
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
                  <StatusBadge status={complaint.status} size="sm" />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                  <span>{complaint.department_name ?? 'Unrouted'}</span>
                  <span aria-hidden>·</span>
                  <span>Reported {relativeTime(complaint.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
