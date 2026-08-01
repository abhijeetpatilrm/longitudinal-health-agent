/**
 * @file src/controllers/agentAuditLog.controller.ts
 * @description REST handlers for AgentAuditLog read operations.
 *              Audit logs are created internally by agentWorkflow.ts — never via API.
 */

import { Request, Response, NextFunction } from 'express';
import { AgentAuditLogModel } from '../models/AgentAuditLog.model';
import { UserProfileModel } from '../models/UserProfile.model';
import { AuditActionType, AuditStatus } from '../types';
import { NotFoundError } from '../middlewares/errorHandler';
import { toObjectId, isValidObjectId } from '../utils/helpers';

const DEMO_USER_ID = '605c72e3b21c4a00155a3051';
const DEMO_USER_ALIAS = 'TEST_USER_001';

async function resolveUserId(userId: string): Promise<string | null> {
  if (userId === DEMO_USER_ALIAS || userId === DEMO_USER_ID) {
    const fallbackUser = await UserProfileModel.findOne().sort({ _id: 1 }).lean();
    return fallbackUser?._id.toString() ?? null;
  }

  if (!isValidObjectId(userId)) return null;

  const user = await UserProfileModel.findById(toObjectId(userId)).lean();
  if (user) return userId;

  return null;
}

// ─── Query param types ────────────────────────────────────────

interface AuditListQuery {
  action_type?: string;
  status?: string;
  limit?: string;
  page?: string;
  /** ISO date string YYYY-MM-DD — filter logs from this date (inclusive) */
  from?: string;
  /** ISO date string YYYY-MM-DD — filter logs to this date (inclusive) */
  to?: string;
}

// ─── Handlers ────────────────────────────────────────────────

/**
 * GET /api/audit/:userId
 * Paginated audit log for a user.
 * Query params: action_type, status, limit (default 20), page (default 1)
 */
export async function getUserAuditLogs(
  req: Request<{ userId: string }, unknown, unknown, AuditListQuery>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    const resolvedUserId = await resolveUserId(userId);
    if (!resolvedUserId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid userId.' } });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
    const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { user_id: toObjectId(resolvedUserId) };

    if (req.query.action_type && Object.values(AuditActionType).includes(req.query.action_type as AuditActionType)) {
      filter['action_type'] = req.query.action_type;
    }

    if (req.query.status && Object.values(AuditStatus).includes(req.query.status as AuditStatus)) {
      filter['status'] = req.query.status;
    }

    // Date-range filtering on the timestamp field
    if (req.query.from || req.query.to) {
      const timestampFilter: Record<string, Date> = {};
      if (req.query.from) {
        const from = new Date(`${req.query.from}T00:00:00.000Z`);
        if (!isNaN(from.getTime())) timestampFilter['$gte'] = from;
      }
      if (req.query.to) {
        const to = new Date(`${req.query.to}T23:59:59.999Z`);
        if (!isNaN(to.getTime())) timestampFilter['$lte'] = to;
      }
      if (Object.keys(timestampFilter).length > 0) {
        filter['timestamp'] = timestampFilter;
      }
    }

    const [logs, total] = await Promise.all([
      AgentAuditLogModel.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AgentAuditLogModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit/:id/detail
 * Get a single audit log entry by its document ID.
 */
export async function getAuditLogDetail(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid audit log ID.' } });
      return;
    }

    const log = await AgentAuditLogModel.findById(toObjectId(id)).lean();
    if (!log) throw new NotFoundError('AgentAuditLog', id);

    res.status(200).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}
