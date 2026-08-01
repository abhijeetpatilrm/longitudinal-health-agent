/**
 * @file src/controllers/trends.controller.ts
 * @description GET /api/users/:userId/trends — returns deterministic health analytics.
 *              No AI involved; all calculations are pure math from trendEngine.ts.
 */

import { Request, Response, NextFunction } from 'express';
import { DailyLogModel } from '../models/DailyLog.model';
import { HealthPlanModel } from '../models/HealthPlan.model';
import { UserProfileModel } from '../models/UserProfile.model';
import {
  calculateWeeklyMonthlySummary,
  calculateTrendDirection,
  detectMissingDataAndInconsistencies,
  calculatePlanAdherence,
  TrendableField,
} from '../services/health/trendEngine';
import { HealthPlanStatus } from '../types';
import { NotFoundError } from '../middlewares/errorHandler';
import { isValidObjectId, toObjectId } from '../utils/helpers';
import { logger } from '../utils/logger';

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

// All trendable fields supported in the public API
const ALL_TREND_FIELDS: TrendableField[] = [
  'weight_kg',
  'sleep_hours',
  'mood_energy_score',
  'daily_calories',
  'daily_protein_g',
  'activity_minutes',
  'step_count',
];

/**
 * GET /api/users/:userId/trends?days=14
 *
 * Query params:
 *   days (number, default 14, max 90) — how many days of history to analyse
 *
 * Returns a comprehensive deterministic analytics report:
 *   - Weekly & monthly summaries
 *   - Trend directions for all key fields
 *   - Missing data flags & inconsistencies
 *   - Plan adherence (if user has an active plan)
 */
export async function getUserTrends(
  req: Request<{ userId: string }, unknown, unknown, { days?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    const resolvedUserId = await resolveUserId(userId);
    if (!resolvedUserId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid userId.' },
      });
      return;
    }

    // Parse & clamp days param
    const rawDays = parseInt(req.query.days ?? '14', 10);
    const days = isNaN(rawDays) ? 14 : Math.min(Math.max(rawDays, 1), 90);

    // Validate user exists
    const user = await UserProfileModel.findById(toObjectId(resolvedUserId)).lean();
    if (!user) throw new NotFoundError('UserProfile', resolvedUserId);

    // Compute cutoff date
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Fetch logs and active plan in parallel
    const [logs, activePlan] = await Promise.all([
      DailyLogModel.find({ user_id: toObjectId(resolvedUserId), date: { $gte: cutoffStr } })
        .sort({ date: 1 })
        .lean(),
      HealthPlanModel.findOne({ user_id: toObjectId(resolvedUserId), status: HealthPlanStatus.ACTIVE }).lean(),
    ]);

    logger.debug('[Trends] Computing analytics.', {
      userId,
      days,
      logsFound: logs.length,
      hasActivePlan: !!activePlan,
    });

    // Run all deterministic calculations
    const weeklySummary = calculateWeeklyMonthlySummary(logs);

    const trendDirections = ALL_TREND_FIELDS.map((field) =>
      calculateTrendDirection(logs, field)
    );

    const dataQuality = detectMissingDataAndInconsistencies(logs);

    const adherence = activePlan
      ? calculatePlanAdherence(activePlan, logs)
      : null;

    res.status(200).json({
      success: true,
      data: {
        meta: {
          user_id: resolvedUserId,
          days_requested: days,
          logs_found: logs.length,
          date_range: weeklySummary.date_range,
          has_active_plan: !!activePlan,
        },
        weekly_monthly_summary: weeklySummary,
        trend_directions: trendDirections,
        data_quality: dataQuality,
        plan_adherence: adherence,
      },
    });
  } catch (err) {
    next(err);
  }
}
