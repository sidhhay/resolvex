/**
 * Complaint endpoints.
 *
 * Thin by design: request shaping, RBAC scoping and response formatting only.
 * Every decision about what a complaint may do lives in the State pattern, and
 * every announcement is the Observer layer's business.
 */
import { BadRequestError, NotFoundError } from '../domain/errors.js';
import { COMPLAINT_STATUSES, getState } from '../domain/complaintState.js';
import { requireUser } from '../middleware/auth.js';
import { storeAttachment, deleteStoredAttachment } from '../services/uploadService.js';
import {
  createComplaint,
  getComplaintDetail,
  transitionComplaint,
  describeSla,
  toActor,
  assertCanView,
} from '../services/complaintService.js';
import * as complaintRepo from '../repositories/complaintRepo.js';

/**
 * POST /api/complaints — multipart/form-data, optional single attachment.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function create(req, res) {
  const user = requireUser(req);
  const { title, description } = /** @type {any} */ (req.validated);

  // Storage happens before the insert so a rejected file never produces a
  // complaint row pointing at nothing.
  const stored = req.file ? await storeAttachment(req.file) : null;

  let result;
  try {
    result = await createComplaint(
      { title, description, attachmentUrl: stored?.url ?? null },
      user,
    );
  } catch (error) {
    // The file was uploaded before classification/DB persistence. If any later
    // step fails, remove the now-unreferenced object rather than leaking storage.
    if (stored) await deleteStoredAttachment(stored);
    throw error;
  }

  const { complaint, classification } = result;

  res.status(201).json({
    complaint,
    // Surfaced so the citizen portal can show "routed to X" and, when the
    // classifier had to fall back, say so honestly.
    classification: {
      category: classification.category,
      priority: classification.priority,
      confidence: classification.confidence,
      strategy: classification.strategy,
      degraded: classification.degraded,
      reasoning: classification.reasoning,
    },
    attachment: stored ? { url: stored.url, provider: stored.provider, bytes: stored.bytes } : null,
  });
}

/**
 * GET /api/complaints
 *
 * One endpoint serves all three dashboards; the caller's role decides what the
 * filters are allowed to reach.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function list(req, res) {
  const user = requireUser(req);
  const q = /** @type {any} */ (req.validated ?? {});

  /** @type {import('../repositories/complaintRepo.js').ComplaintFilters & Record<string, unknown>} */
  const filters = {
    statuses: q.status,
    category: q.category ?? null,
    priority: q.priority ?? null,
    search: q.search ?? null,
    openOnly: q.openOnly ?? false,
    unassignedOnly: q.unassignedOnly ?? false,
    escalatedOnly: q.escalatedOnly ?? false,
    from: q.from ?? null,
    to: q.to ?? null,
    page: q.page ?? 1,
    pageSize: q.pageSize ?? 20,
    sort: q.sort ?? 'created_at',
    order: q.order ?? 'desc',
  };

  if (user.role === 'student') {
    // Non-negotiable: a student sees their own complaints and nothing else.
    filters.createdBy = user.id;
  } else if (user.role === 'handler') {
    if (q.mine) {
      filters.assignedTo = user.id;
    } else {
      // Their department's queue, plus anything assigned to them personally.
      filters.handlerScopeUserId = user.id;
      filters.handlerScopeDepartmentId = user.departmentId;
    }
    if (q.departmentId && q.departmentId !== user.departmentId) {
      throw new BadRequestError('You can only browse your own department');
    }
  } else {
    // Administrators may filter freely.
    if (q.departmentId) filters.departmentId = q.departmentId;
    if (q.assignedTo) filters.assignedTo = q.assignedTo;
    if (q.createdBy) filters.createdBy = q.createdBy;
  }

  const result = await complaintRepo.list(filters);

  res.json({
    complaints: result.rows.map((complaint) => ({
      ...complaint,
      sla: describeSla(complaint),
      availableTransitions: getState(complaint.status).availableTransitions(
        complaint,
        toActor(user, complaint),
      ),
    })),
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    },
  });
}

/**
 * GET /api/complaints/:id
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function detail(req, res) {
  const user = requireUser(req);
  const { id } = /** @type {any} */ (req.validated);
  res.json(await getComplaintDetail(id, user));
}

/**
 * POST /api/complaints/:id/transitions
 *
 * The single write endpoint for the complaint lifecycle. Assigning, starting an
 * investigation, resolving, reopening, closing and reassigning are all the same
 * operation — a state transition — which is exactly what the State pattern
 * makes possible.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function transition(req, res) {
  const user = requireUser(req);
  const { id, to, assignedTo, departmentId, resolutionNote, closureNote, reason } =
    /** @type {any} */ (req.validated);

  const result = await transitionComplaint({
    complaintId: id,
    to,
    user,
    payload: { assignedTo, departmentId, resolutionNote, closureNote, reason },
  });

  const detailPayload = await getComplaintDetail(id, user);
  res.json({
    ...detailPayload,
    transition: { from: result.fromStatus, to, event: result.event },
  });
}

/**
 * GET /api/complaints/:id/timeline — the citizen status timeline.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function timeline(req, res) {
  const user = requireUser(req);
  const { id } = /** @type {any} */ (req.validated);

  const complaint = await complaintRepo.findById(id);
  if (!complaint) throw new NotFoundError('Complaint');
  assertCanView(complaint, user);

  res.json({ timeline: await complaintRepo.getStatusHistory(id) });
}

/**
 * GET /api/complaints/meta — statuses and the transition graph, for the UI.
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
export async function meta(_req, res) {
  res.json({
    statuses: COMPLAINT_STATUSES,
    graph: Object.fromEntries(
      COMPLAINT_STATUSES.map((status) => [status, getState(status).reachableStatuses]),
    ),
  });
}
