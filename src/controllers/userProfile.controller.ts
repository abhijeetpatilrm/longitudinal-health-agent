/**
 * @file src/controllers/userProfile.controller.ts
 * @description REST handlers for UserProfile CRUD operations.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserProfileModel } from '../models/UserProfile.model';
import { Gender } from '../types';
import { NotFoundError, ConflictError } from '../middlewares/errorHandler';
import { validate } from '../middlewares/validate';
import { toObjectId, isValidObjectId } from '../utils/helpers';
import { logger } from '../utils/logger';

// ─── Zod Schemas ─────────────────────────────────────────────

const BaselineGoalsSchema = z.object({
  target_weight_kg: z.number().min(1).max(500).nullable().default(null),
  target_daily_calories: z.number().min(500).max(10_000),
  target_protein_g: z.number().min(0),
  target_carbs_g: z.number().min(0),
  target_fats_g: z.number().min(0),
  target_sleep_hours: z.number().min(0).max(24),
  target_activity_minutes_per_day: z.number().min(0),
  target_water_ml: z.number().min(0),
});

const CreateUserProfileSchema = z.object({
  name: z.string().min(1).max(200),
  age: z.number().int().min(1).max(150),
  gender: z.nativeEnum(Gender),
  baseline_goals: BaselineGoalsSchema,
  health_conditions: z.array(z.string()).default([]),
});

const UpdateUserProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  age: z.number().int().min(1).max(150).optional(),
  gender: z.nativeEnum(Gender).optional(),
  baseline_goals: BaselineGoalsSchema.partial().optional(),
  health_conditions: z.array(z.string()).optional(),
});

// ─── Validators ───────────────────────────────────────────────

export const validateCreateUser = validate(CreateUserProfileSchema);
export const validateUpdateUser = validate(UpdateUserProfileSchema);

// ─── Handlers ────────────────────────────────────────────────

/**
 * POST /api/users
 * Create a new user profile.
 */
export async function createUserProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dto = req.body as z.infer<typeof CreateUserProfileSchema>;

    const existing = await UserProfileModel.findOne({ name: dto.name }).lean();
    if (existing) {
      throw new ConflictError(`A user profile with name "${dto.name}" already exists.`);
    }

    const user = await UserProfileModel.create(dto);
    logger.info('[UserProfile] Created user profile.', { userId: user._id.toString() });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:id
 * Get a user profile by ID.
 */
export async function getUserProfile(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid user ID.' } });
      return;
    }

    const user = await UserProfileModel.findById(toObjectId(id)).lean();
    if (!user) throw new NotFoundError('UserProfile', id);

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/:id
 * Partially update a user profile.
 */
export async function updateUserProfile(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid user ID.' } });
      return;
    }

    const dto = req.body as z.infer<typeof UpdateUserProfileSchema>;
    const updated = await UserProfileModel.findByIdAndUpdate(
      toObjectId(id),
      { $set: dto },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) throw new NotFoundError('UserProfile', id);

    logger.info('[UserProfile] Updated user profile.', { userId: id });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/:id
 * Delete a user profile.
 */
export async function deleteUserProfile(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid user ID.' } });
      return;
    }

    const deleted = await UserProfileModel.findByIdAndDelete(toObjectId(id)).lean();
    if (!deleted) throw new NotFoundError('UserProfile', id);

    logger.info('[UserProfile] Deleted user profile.', { userId: id });
    res.status(200).json({ success: true, data: { message: 'User profile deleted successfully.' } });
  } catch (err) {
    next(err);
  }
}
