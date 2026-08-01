/**
 * @file src/controllers/dailyLog.controller.ts
 * @description REST handlers for DailyLog CRUD operations.
 *              Phase 2 adds: extractMeals (AI meal/activity extraction from raw notes).
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DailyLogModel } from '../models/DailyLog.model';
import { AgentAuditLogModel } from '../models/AgentAuditLog.model';
import { ActivityType, AuditActionType, AuditStatus } from '../types';
import { NotFoundError } from '../middlewares/errorHandler';
import { validate } from '../middlewares/validate';
import { toObjectId, isValidObjectId } from '../utils/helpers';
import { logger } from '../utils/logger';
import { runMealExtraction } from '../services/ai/agentWorkflow';

// ─── Zod Schemas ─────────────────────────────────────────────

const MealSchema = z.object({
  food_item: z.string().min(1).max(500),
  estimated_calories: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fats_g: z.number().min(0),
  serving_size_description: z.string().max(200).nullable().default(null),
  is_ai_extracted: z.boolean().default(false),
  is_user_corrected: z.boolean().default(false),
});

const ActivitySchema = z.object({
  activity_type: z.nativeEnum(ActivityType),
  duration_minutes: z.number().min(0).max(1440),
  step_count: z.number().min(0).nullable().default(null),
  estimated_calories_burned: z.number().min(0),
  notes: z.string().max(1000).nullable().default(null),
});

const CreateDailyLogSchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  meals: z.array(MealSchema).default([]),
  activity: ActivitySchema.nullable().default(null),
  sleepHours: z.number().min(0).max(24).nullable().default(null),
  weight: z.number().min(1).max(500).nullable().default(null),
  moodScore: z.number().min(1).max(10).nullable().default(null),
  activityMinutes: z.number().min(0).max(1440).nullable().default(null),
  notes: z.string().max(5000).nullable().default(null),
});

const UpdateDailyLogSchema = z.object({
  meals: z.array(MealSchema).optional(),
  activity: ActivitySchema.nullable().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  weight: z.number().min(1).max(500).nullable().optional(),
  moodScore: z.number().min(1).max(10).nullable().optional(),
  activityMinutes: z.number().min(0).max(1440).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const DEMO_USER_ID = '605c72e3b21c4a00155a3051';

function resolveUserId(userId: string): string | null {
  if (userId === 'TEST_USER_001') return DEMO_USER_ID;
  if (isValidObjectId(userId)) return userId;
  return null;
}

function buildActivity(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return null;

  return {
    activity_type: ActivityType.OTHER,
    duration_minutes: minutes,
    step_count: null,
    estimated_calories_burned: 0,
    notes: null,
  };
}

// ─── Validators ───────────────────────────────────────────────

export const validateCreateLog = validate(CreateDailyLogSchema);
export const validateUpdateLog = validate(UpdateDailyLogSchema);

// ─── Handlers ────────────────────────────────────────────────

/**
 * POST /api/logs
 * Create a daily log entry.
 */
export async function createDailyLog(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = req.body as z.infer<typeof CreateDailyLogSchema>;

    const userId = resolveUserId(dto.userId);
    if (!userId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid userId.' } });
      return;
    }

    const activity = buildActivity(dto.activityMinutes);

    const log = await DailyLogModel.findOneAndUpdate(
      { user_id: toObjectId(userId), date: dto.date },
      {
        $set: {
          user_id: toObjectId(userId),
          date: dto.date,
          meals: dto.meals,
          activity,
          sleep_hours: dto.sleepHours,
          weight_kg: dto.weight,
          mood_energy_score: dto.moodScore,
          notes: dto.notes ?? null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info('[DailyLog] Created daily log.', { logId: log._id.toString(), date: log.date });
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/logs/:userId
 * Get all daily logs for a user, sorted by date descending.
 */
export async function getUserLogs(
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid userId.' } });
      return;
    }

    const logs = await DailyLogModel.find({ user_id: toObjectId(userId) })
      .sort({ date: -1 })
      .lean();

    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/logs/:userId/:date
 * Get a specific day's log.
 */
export async function getDailyLogByDate(
  req: Request<{ userId: string; date: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId, date } = req.params;
    if (!isValidObjectId(userId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid userId.' } });
      return;
    }

    const log = await DailyLogModel.findOne({
      user_id: toObjectId(userId),
      date,
    }).lean();

    if (!log) {
      res.status(200).json({ success: true, data: null, message: `No log found for date ${date}` });
      return;
    }

    res.status(200).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/logs/:id
 * Update a daily log by its ID.
 */
export async function updateDailyLog(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid log ID.' } });
      return;
    }

    const dto = req.body as z.infer<typeof UpdateDailyLogSchema>;
    const activity = dto.activityMinutes !== undefined ? buildActivity(dto.activityMinutes) : undefined;
    const updated = await DailyLogModel.findByIdAndUpdate(
      toObjectId(id),
      {
        $set: {
          ...(dto.meals !== undefined ? { meals: dto.meals } : {}),
          ...(dto.sleepHours !== undefined ? { sleep_hours: dto.sleepHours } : {}),
          ...(dto.weight !== undefined ? { weight_kg: dto.weight } : {}),
          ...(dto.moodScore !== undefined ? { mood_energy_score: dto.moodScore } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(activity !== undefined ? { activity } : {}),
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) throw new NotFoundError('DailyLog', id);

    logger.info('[DailyLog] Updated daily log.', { logId: id });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Phase 2: Meal Extraction ──────────────────────────────────

const ExtractMealsSchema = z.object({
  rawNote: z.string().min(1).max(5000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  /** If true, appends to existing meals; if false (default), replaces AI-extracted meals only */
  append: z.boolean().default(false),
});

export const validateExtractMeals = validate(ExtractMealsSchema);

/**
 * POST /api/logs/:userId/extract-meals
 *
 * Body: { rawNote: string, date: YYYY-MM-DD, append?: boolean }
 *
 * 1. Calls runMealExtraction to parse rawNote via Gemini
 * 2. If safety is blocked, returns 422 with disclaimer
 * 3. Merges extracted meals into the DailyLog for that date:
 *    - Creates the log if it doesn't exist
 *    - Replaces existing AI-extracted meals (or appends if append: true)
 *    - Updates activity if extracted activity is present
 * 4. Returns the updated DailyLog + extraction metadata
 */
export async function extractMeals(
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid userId.' } });
      return;
    }

    const dto = req.body as z.infer<typeof ExtractMealsSchema>;

    logger.info('[DailyLog] extractMeals called.', {
      userId,
      date: dto.date,
      noteLength: dto.rawNote.length,
    });

    // Run the AI extraction workflow
    const extraction = await runMealExtraction(dto.rawNote, userId, dto.date);

    // If safety blocked, return 422 with disclaimer
    if (extraction.safety_blocked) {
      res.status(422).json({
        success: false,
        error: {
          code: 'SAFETY_VIOLATION',
          message: extraction.disclaimer ?? 'Content was blocked by safety guardrails.',
        },
        data: { extraction_meta: { safety_blocked: true, warnings: extraction.warnings } },
      });
      return;
    }

    // Find or create the daily log for this date
    let log = await DailyLogModel.findOne({
      user_id: toObjectId(userId),
      date: dto.date,
    });

    if (!log) {
      log = await DailyLogModel.create({
        user_id: toObjectId(userId),
        date: dto.date,
        meals: [],
        activity: null,
        sleep_hours: null,
        weight_kg: null,
        mood_energy_score: null,
        notes: dto.rawNote,
      });
    }

    // Merge meals: replace AI-extracted ones or append
    const existingMeals = log.meals;
    let newMeals;

    if (dto.append) {
      // Append new AI meals to existing meals
      newMeals = [...existingMeals, ...extraction.meals];
    } else {
      // Replace only AI-extracted meals (preserve user-entered ones)
      const userMeals = existingMeals.filter((m) => !m.is_ai_extracted || m.is_user_corrected);
      newMeals = [...userMeals, ...extraction.meals];
    }

    // Build update object
    const update: Record<string, unknown> = { meals: newMeals };

    // Update activity if extracted (only if log doesn't already have user-set activity)
    if (extraction.activity && !log.activity) {
      update['activity'] = {
        activity_type: extraction.activity.activity_type,
        duration_minutes: extraction.activity.duration_minutes,
        step_count: null,
        estimated_calories_burned: 0, // Cannot estimate without user height/weight
        notes: extraction.activity.notes,
      };
    }

    const updated = await DailyLogModel.findByIdAndUpdate(
      log._id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    logger.info('[DailyLog] Meals extracted and merged into log.', {
      logId: log._id.toString(),
      date: dto.date,
      mealsAdded: extraction.meals.length,
      uncertaintyScore: extraction.uncertainty_score,
    });

    res.status(200).json({
      success: true,
      data: {
        log: updated,
        extraction_meta: {
          meals_extracted: extraction.meals.length,
          activity_extracted: !!extraction.activity,
          uncertainty_score: extraction.uncertainty_score,
          warnings: extraction.warnings,
          safety_blocked: false,
        },
      },
      message: `Extracted ${extraction.meals.length} meal(s) from your note${
        extraction.uncertainty_score > 0.5
          ? ` (confidence moderate — please review the estimates)`
          : ''
      }.`,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Phase 3: Meal Correction ──────────────────────────────────

const CorrectMealSchema = z.object({
  food_item: z.string().min(1).max(500).optional(),
  estimated_calories: z.number().min(0).optional(),
  protein_g: z.number().min(0).optional(),
  carbs_g: z.number().min(0).optional(),
  fats_g: z.number().min(0).optional(),
  serving_size_description: z.string().max(200).nullable().optional(),
});

export const validateCorrectMeal = validate(CorrectMealSchema);

/**
 * PUT /api/logs/:logId/meals/:mealId/correct
 * Allows user to manually correct an AI-extracted meal.
 * Marks is_user_corrected = true and creates an audit log with the delta.
 */
export async function correctMeal(
  req: Request<{ logId: string; mealId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { logId, mealId } = req.params;
    if (!isValidObjectId(logId) || !isValidObjectId(mealId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid logId or mealId.' } });
      return;
    }

    const dto = req.body as z.infer<typeof CorrectMealSchema>;

    const log = await DailyLogModel.findById(toObjectId(logId));
    if (!log) throw new NotFoundError('DailyLog', logId);

    const meal = log.meals.find(m => m._id.toString() === mealId);
    if (!meal) throw new NotFoundError('Meal item', mealId);

    // Save snapshot before changes
    const beforeSnapshot = {
      food_item: meal.food_item,
      estimated_calories: meal.estimated_calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fats_g: meal.fats_g,
      serving_size_description: meal.serving_size_description,
    };

    // Apply updates
    if (dto.food_item !== undefined) meal.food_item = dto.food_item;
    if (dto.estimated_calories !== undefined) meal.estimated_calories = dto.estimated_calories;
    if (dto.protein_g !== undefined) meal.protein_g = dto.protein_g;
    if (dto.carbs_g !== undefined) meal.carbs_g = dto.carbs_g;
    if (dto.fats_g !== undefined) meal.fats_g = dto.fats_g;
    if (dto.serving_size_description !== undefined) meal.serving_size_description = dto.serving_size_description;

    meal.is_user_corrected = true;

    // Save snapshot after changes
    const afterSnapshot = {
      food_item: meal.food_item,
      estimated_calories: meal.estimated_calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fats_g: meal.fats_g,
      serving_size_description: meal.serving_size_description,
    };

    const updatedLog = await log.save();

    // Create audit log for the correction
    await AgentAuditLogModel.create({
      user_id: log.user_id,
      action_type: AuditActionType.USER_CORRECTION,
      input_payload: { logId, mealId, original_meal: beforeSnapshot },
      raw_ai_output: {}, // Not applicable here
      corrected_output: {
        before: beforeSnapshot,
        after: afterSnapshot,
        delta: dto,
      },
      uncertainty_score: 0,
      status: AuditStatus.USER_CORRECTED,
      error_message: null,
      timestamp: new Date(),
    });

    logger.info('[DailyLog] User corrected meal item.', { logId, mealId });

    res.status(200).json({
      success: true,
      data: updatedLog,
      message: 'Meal corrected successfully.',
    });
  } catch (err) {
    next(err);
  }
}

