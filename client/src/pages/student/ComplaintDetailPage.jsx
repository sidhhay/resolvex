/**
 * Complaint detail — the accountability view.
 *
 * Serves every role: the complainant tracks and confirms, a handler acts, an
 * administrator audits. The action buttons come straight from the server's
 * `availableTransitions`, which the State pattern computes for *this* caller on
 * *this* complaint, so the UI can never offer a move the domain would reject.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, Sparkles } from 'lucide-react';
import { complaintApi, departmentApi } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket, useComplaintUpdates, usePolledRefresh } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, ErrorState, SectionHeader, Spinner } from '../../components/ui/index.jsx';
import { PriorityBadge, SlaBadge, StatusBadge } from '../../components/StatusBadge.jsx';
import { StatusTimeline } from '../../components/StatusTimeline.jsx';
import { TransitionDialog } from '../../components/TransitionDialog.jsx';
import { LifecycleBar } from '../../components/LifecycleBar.jsx';
import { formatDateTime, relativeTime, transitionTone } from '../../lib/format.js';

export function ComplaintDetailPage() {
  const { id } = useParams();
  const complaintId = Number(id);
  const { user } = useAuth();
  const { watchComplaint } = useSocket();
  const toast = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [handlers, setHandlers] = useState(/** @type {Array<any>} */ ([]));
  const [departments, setDepartments] = useState(/** @type {Array<any>} */ ([]));
  const [activeTransition, setActiveTransition] = useState(/** @type {any} */ (null));

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await complaintApi.detail(complaintId));
    } catch (err) {
      setError(/** @type {Error} */ (err).message);
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    if (!Number.isInteger(complaintId) || complaintId <= 0) {
      setError('That complaint reference is not valid.');
      setLoading(false);
      return;
    }
    load();
  }, [complaintId, load]);

  // Join this complaint's socket room for the duration of the page.
  useEffect(() => {
    if (!Number.isInteger(complaintId)) return undefined;
    return watchComplaint(complaintId);
  }, [complaintId, watchComplaint]);

  useComplaintUpdates(
    useCallback(
      (payload) => {
        // Refetch rather than patch: the timeline and the available actions both
        // change with the status, and they must stay consistent with each other.
        if (payload.complaint?.id === complaintId) load();
      },
      [complaintId, load],
    ),
  );

  usePolledRefresh(load);

  // Staff need the assignment dropdowns; students never see them.
  useEffect(() => {
    if (!data?.complaint || user?.role === 'student') return;
    const departmentId = data.complaint.department_id;
    if (departmentId) {
      departmentApi
        .handlers(departmentId)
        .then((res) => setHandlers(res.handlers))
        .catch(() => setHandlers([]));
    }
    departmentApi
      .list()
      .then((res) => setDepartments(res.departments))
      .catch(() => setDepartments([]));
  }, [data?.complaint?.department_id, user?.role]);

  /** @param {Record<string, unknown>} body */
  async function submitTransition(body) {
    const updated = await complaintApi.transition(complaintId, body);
    setData(updated);
    toast.push(`Complaint #${complaintId} is now ${updated.complaint.status}.`, 'success');
  }

  if (loading) return <Spinner label="Loading complaint…" />;
  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={load} />
        <div className="flex justify-center pb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </Card>
    );
  }

  const { complaint, timeline, escalations, availableTransitions, sla } = data;
  console.log('DEBUG DATA IN COMPLAINT DETAIL:', data);

  return (
    <div className="flex flex-col gap-4">
      <Link
        to={user?.role === 'student' ? '/complaints' : '/dashboard'}
        className="inline-flex w-fit items-center gap-1.5 text-xs text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Back to list
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* ---- main column ------------------------------------------------ */}
        <div className="flex flex-col gap-4">
          <Card>
            <div className="border-b border-line px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-ink-muted tabular">
                    Complaint #{complaint.id}
                  </p>
                  <h1 className="mt-1 text-base font-semibold leading-snug text-ink">
                    {complaint.title}
                  </h1>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <PriorityBadge priority={complaint.priority} />
                  <StatusBadge status={complaint.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                <span>Filed by {complaint.creator_name}</span>
                <span aria-hidden>·</span>
                <time dateTime={new Date(complaint.created_at).toISOString()}>
                  {formatDateTime(complaint.created_at)}
                </time>
                <SlaBadge sla={sla} escalationLevel={complaint.escalation_level} />
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">
                {complaint.description}
              </p>

              {complaint.attachment_url && (
                <a
                  href={complaint.attachment_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-series-1 transition hover:brightness-110"
                >
                  <Paperclip size={13} aria-hidden />
                  View attached evidence
                </a>
              )}
            </div>

            {complaint.resolution_note && (
              <div className="border-t border-line bg-good/5 px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-good">
                  Proposed resolution
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">
                  {complaint.resolution_note}
                </p>
              </div>
            )}

            {/* One-click actions, generated from the domain's own rules. */}
            {availableTransitions.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
                {availableTransitions.map((transition) => (
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
                    onClick={() => setActiveTransition(transition)}
                  >
                    {transition.label}
                  </Button>
                ))}
              </div>
            )}
            {availableTransitions.length === 0 && (
              <p className="border-t border-line px-5 py-4 text-xs text-ink-muted">
                {complaint.status === 'Closed'
                  ? 'This complaint is closed. Its record is preserved but can no longer change.'
                  : 'Nothing for you to do right now — you will be notified when it moves.'}
              </p>
            )}
          </Card>

          <LifecycleBar currentStatus={complaint.status} />

          <Card>
            <SectionHeader
              title="Status timeline"
              description="Every change to this complaint, in order, with who made it."
            />
            <StatusTimeline
              timeline={timeline}
              escalations={escalations}
              currentStatus={complaint.status}
              sla={sla}
            />
          </Card>
        </div>

        {/* ---- side column ------------------------------------------------ */}
        <div className="flex flex-col gap-4">
          <Card>
            <SectionHeader title="Details" />
            <dl className="divide-y divide-line text-sm">
              <Detail term="Department" value={complaint.department_name ?? 'Awaiting triage'} />
              {/* The taxonomy names categories after departments, so showing
                  both would repeat the same value back at the reader. */}
              {complaint.category !== complaint.department_name && (
                <Detail term="Category" value={complaint.category} />
              )}
              <Detail term="Handler" value={complaint.assignee_name ?? 'Not yet assigned'} />
              <Detail
                term="Assigned"
                value={complaint.assigned_at ? relativeTime(complaint.assigned_at) : '—'}
              />
              <Detail term="Last activity" value={relativeTime(complaint.last_activity_at)} />
              {complaint.escalation_level > 0 && (
                <Detail
                  term="Escalation level"
                  value={complaint.escalation_level === 2 ? '2 — Dean / Director' : '1 — Head of Department'}
                />
              )}
            </dl>
          </Card>

          {/* Administrators audit the routing decision; students do not need it. */}
          {user?.role !== 'student' && complaint.ai_strategy && (
            <Card>
              <SectionHeader title="Routing" />
              <div className="px-5 py-4">
                <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-secondary">
                  <Sparkles size={13} className="mt-0.5 shrink-0 text-series-1" aria-hidden />
                  <span>
                    Routed by the <span className="font-medium text-ink">{complaint.ai_strategy}</span>{' '}
                    engine
                    {complaint.ai_confidence !== null && (
                      <> at {(complaint.ai_confidence * 100).toFixed(0)}% confidence</>
                    )}
                    .
                    {complaint.ai_strategy === 'keyword' && (
                      <> Deterministic keyword rules — worth a sanity check.</>
                    )}
                  </span>
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <TransitionDialog
        open={Boolean(activeTransition)}
        onClose={() => setActiveTransition(null)}
        transition={activeTransition}
        complaint={complaint}
        handlers={handlers}
        departments={departments}
        onSubmit={submitTransition}
      />
    </div>
  );
}

/** @param {{ term: string, value: React.ReactNode }} props */
function Detail({ term, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 py-2.5">
      <dt className="shrink-0 text-xs text-ink-muted">{term}</dt>
      <dd className="min-w-0 text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}
