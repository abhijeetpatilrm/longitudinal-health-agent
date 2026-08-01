/**
 * @file src/controllers/healthPlan.controller.ts
 * @description REST handlers for HealthPlan management with versioning lifecycle.
 *              Phase 2 adds: generateHealthPlan, approvePlan, rejectPlan.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HealthPlanModel } from '../models/HealthPlan.model';
import { AgentAuditLogModel } from '../models/AgentAuditLog.model';
import { UserProfileModel } from '../models/UserProfile.model';
import { HealthPlanStatus, RecommendationCategory, AuditActionType, AuditStatus } from '../types';
import { NotFoundError } from '../middlewares/errorHandler';
import { validate } from '../middlewares/validate';
import { toObjectId, isValidObjectId } from '../utils/helpers';
import { logger } from '../utils/logger';
import { runPlanSuggestion } from '../services/ai/agentWorkflow';

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

// ─── Zod Schemas ─────────────────────────────────────────────

const RecommendationSchema = z.object({
  category: z.nativeEnum(RecommendationCategory),
  suggestion: z.string().min(1).max(2000),
  rationale: z.string().min(1).max(2000),
  kb_citation_id: z.string().nullable().default(null),
});

const CreateHealthPlanSchema = z.object({
  user_id: z.string().min(1),
  target_daily_calories: z.number().min(500).max(10_000),
  target_protein_g: z.number().min(0),
  target_sleep_hours: z.number().min(0).max(24),
  target_activity_minutes: z.number().min(0),
  recommendations: z.array(RecommendationSchema).default([]),
  active_from: z.coerce.date().nullable().default(null),
  active_until: z.coerce.date().nullable().default(null),
});

const UpdatePlanStatusSchema = z.object({
  status: z.nativeEnum(HealthPlanStatus),
  user_feedback: z.string().max(5000).nullable().optional(),
});

const RejectPlanSchema = z
  .object({
    reason: z.string().min(1).max(5000).optional(),
    user_feedback: z.string().min(1).max(5000).optional(),
  })
  .refine((data) => Boolean(data.reason ?? data.user_feedback), {
    message: 'reason is required',
  });

// ─── Validators ───────────────────────────────────────────────

export const validateCreatePlan = validate(CreateHealthPlanSchema);
export const validateUpdatePlanStatus = validate(UpdatePlanStatusSchema);

// ─── Handlers ────────────────────────────────────────────────

/**
 * POST /api/plans
 * Create a new health plan (version auto-incremented via pre-save hook).
 * Archives any currently ACTIVE plan for this user.
 */
export async function createHealthPlan(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = req.body as z.infer<typeof CreateHealthPlanSchema>;

    if (!isValidObjectId(dto.user_id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid user_id.' } });
      return;
    }

    // Archive any existing ACTIVE plan
    await HealthPlanModel.updateMany(
      { user_id: toObjectId(dto.user_id), status: HealthPlanStatus.ACTIVE },
      { $set: { status: HealthPlanStatus.ARCHIVED } }
    );

    const plan = await HealthPlanModel.create({
      ...dto,
      user_id: toObjectId(dto.user_id),
      version_number: 1, // Pre-save hook will overwrite this
      status: HealthPlanStatus.DRAFT,
      rejectionReason: null,
    });

    logger.info('[HealthPlan] Created health plan.', {
      planId: plan._id.toString(),
      version: plan.version_number,
    });

    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/plans/:userId
 * Get all health plans for a user, sorted by version descending.
 */
export async function getUserPlans(
  req: Request<{ userId: string }>,
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

    const plans = await HealthPlanModel.find({ user_id: toObjectId(resolvedUserId) })
      .sort({ version_number: -1 })
      .lean();

    res.status(200).json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/plans/:userId/active
 * Get the currently ACTIVE plan for a user.
 */
export async function getActivePlan(
  req: Request<{ userId: string }>,
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

    const plan = await HealthPlanModel.findOne({
      user_id: toObjectId(resolvedUserId),
      status: HealthPlanStatus.ACTIVE,
    }).lean();

    if (!plan) throw new NotFoundError('Active HealthPlan for this user');

    res.status(200).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/plans/:id/status
 * Update plan status (DRAFT → ACTIVE / REJECTED / ARCHIVED).
 * Records user feedback on rejection.
 */
export async function updatePlanStatus(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid plan ID.' } });
      return;
    }

    const dto = req.body as z.infer<typeof UpdatePlanStatusSchema>;
    const updatePayload: Record<string, unknown> = { status: dto.status };
    if (dto.user_feedback !== undefined) updatePayload['user_feedback'] = dto.user_feedback;

    const updated = await HealthPlanModel.findByIdAndUpdate(
      toObjectId(id),
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) throw new NotFoundError('HealthPlan', id);

    logger.info('[HealthPlan] Updated plan status.', { planId: id, status: dto.status });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Phase 2 Handlers ────────────────────────────────────────

const GeneratePlanQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
});

/**
 * POST /api/plans/:userId/generate
 * Runs the full agentic plan suggestion workflow:
 *   deterministic trend analysis → KB lookup → Gemini draft → DRAFT HealthPlan
 */
export async function generateHealthPlan(
  req: Request<{ userId: string }, unknown, unknown, { days?: string }>,
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

    const queryResult = GeneratePlanQuerySchema.safeParse(req.query);
    const days = queryResult.success ? queryResult.data.days : 14;

    logger.info('[HealthPlan] Generating plan via AI workflow.', { userId: resolvedUserId, days });

    const retrospective = await runPlanSuggestion(resolvedUserId, days);

    res.status(201).json({
      success: true,
      data: retrospective,
      message: retrospective.safety_blocked
        ? 'Plan generation was partially blocked by safety guardrails.'
        : `Draft health plan v${retrospective.proposedPlan.version_number} created successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

export const validateRejectPlan = validate(RejectPlanSchema);

/**
 * PUT /api/plans/:planId/approve
 * Transitions a DRAFT plan to ACTIVE.
 * Archives any previously ACTIVE plan for the same user.
 * Creates a RETROSPECTIVE_GEN audit entry.
 */
export async function approvePlan(
  req: Request<{ planId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { planId } = req.params;
    if (!isValidObjectId(planId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid planId.' } });
      return;
    }

    const plan = await HealthPlanModel.findById(toObjectId(planId)).lean();
    if (!plan) throw new NotFoundError('HealthPlan', planId);

    if (plan.status === HealthPlanStatus.ACTIVE) {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Plan is already ACTIVE.' } });
      return;
    }

    if (plan.status === HealthPlanStatus.REJECTED || plan.status === HealthPlanStatus.ARCHIVED) {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: `Cannot approve a plan with status ${plan.status}.` },
      });
      return;
    }

    // Archive any currently active plan for this user
    await HealthPlanModel.updateMany(
      { user_id: plan.user_id, status: HealthPlanStatus.ACTIVE },
      { $set: { status: HealthPlanStatus.ARCHIVED } }
    );

    const approved = await HealthPlanModel.findByIdAndUpdate(
      toObjectId(planId),
      { $set: { status: HealthPlanStatus.ACTIVE, active_from: new Date() } },
      { new: true }
    ).lean();

    // Audit log
    await AgentAuditLogModel.create({
      user_id: plan.user_id,
      action_type: AuditActionType.RETROSPECTIVE_GEN,
      input_payload: { planId, action: 'APPROVE' },
      raw_ai_output: { plan_version: plan.version_number, status_change: 'DRAFT→ACTIVE' },
      corrected_output: null,
      uncertainty_score: 0,
      status: AuditStatus.SUCCESS,
      error_message: null,
      timestamp: new Date(),
    });

    logger.info('[HealthPlan] Plan approved → ACTIVE.', {
      planId,
      version: plan.version_number,
    });

    res.status(200).json({
      success: true,
      data: approved,
      message: `Health plan v${plan.version_number} is now ACTIVE.`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/plans/:planId/reject
 * Transitions a DRAFT plan to REJECTED and records user feedback.
 * Creates a USER_REJECTED audit entry.
 */
export async function rejectPlan(
  req: Request<{ planId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { planId } = req.params;
    if (!isValidObjectId(planId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid planId.' } });
      return;
    }

    const dto = req.body as z.infer<typeof RejectPlanSchema>;
    const rejectionReason = dto.reason ?? dto.user_feedback ?? '';

    const plan = await HealthPlanModel.findById(toObjectId(planId)).lean();
    if (!plan) throw new NotFoundError('HealthPlan', planId);

    if (plan.status === HealthPlanStatus.REJECTED) {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Plan is already REJECTED.' } });
      return;
    }

    const rejected = await HealthPlanModel.findByIdAndUpdate(
      toObjectId(planId),
      {
        $set: {
          status: HealthPlanStatus.REJECTED,
          user_feedback: rejectionReason,
          rejectionReason,
        },
      },
      { new: true }
    ).lean();

    // Audit log
    await AgentAuditLogModel.create({
      user_id: plan.user_id,
      action_type: AuditActionType.USER_REJECTED_PLAN,
      input_payload: {
        planId,
        userId: plan.user_id.toString(),
        action: 'REJECT',
        rejectionReason,
      },
      raw_ai_output: {
        plan_version: plan.version_number,
        status_change: `${plan.status}→REJECTED`,
        rejectionReason,
      },
      corrected_output: null,
      uncertainty_score: 0,
      status: AuditStatus.USER_REJECTED,
      error_message: null,
      timestamp: new Date(),
    });

    logger.info('[HealthPlan] Plan rejected.', {
      planId,
      version: plan.version_number,
      reason: rejectionReason.slice(0, 80),
    });

    res.status(200).json({
      success: true,
      data: rejected,
      message: `Health plan v${plan.version_number} has been rejected. Feedback recorded.`,
    });
  } catch (err) {
    next(err);
  }
}
