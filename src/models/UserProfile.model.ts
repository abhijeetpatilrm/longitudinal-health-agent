/**
 * @file src/models/UserProfile.model.ts
 * @description Mongoose schema & model for UserProfile.
 */

import { Schema, model, Document } from 'mongoose';
import { Gender } from '../types';

// ─── Sub-schema: BaselineGoals ───────────────────────────────

const BaselineGoalsSchema = new Schema(
  {
    target_weight_kg: { type: Number, default: null },
    target_daily_calories: { type: Number, required: true, min: 500, max: 10_000 },
    target_protein_g: { type: Number, required: true, min: 0 },
    target_carbs_g: { type: Number, required: true, min: 0 },
    target_fats_g: { type: Number, required: true, min: 0 },
    target_sleep_hours: { type: Number, required: true, min: 0, max: 24 },
    target_activity_minutes_per_day: { type: Number, required: true, min: 0 },
    target_water_ml: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// ─── Document interface ──────────────────────────────────────

export interface IUserProfileDocument extends Document {
  name: string;
  age: number;
  gender: Gender;
  baseline_goals: {
    target_weight_kg: number | null;
    target_daily_calories: number;
    target_protein_g: number;
    target_carbs_g: number;
    target_fats_g: number;
    target_sleep_hours: number;
    target_activity_minutes_per_day: number;
    target_water_ml: number;
  };
  health_conditions: string[];
  created_at: Date;
  updated_at: Date;
}

// ─── Schema ──────────────────────────────────────────────────

const UserProfileSchema = new Schema<IUserProfileDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    age: {
      type: Number,
      required: true,
      min: 1,
      max: 150,
    },
    gender: {
      type: String,
      enum: Object.values(Gender),
      required: true,
    },
    baseline_goals: {
      type: BaselineGoalsSchema,
      required: true,
    },
    health_conditions: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// ─── Indexes ─────────────────────────────────────────────────

UserProfileSchema.index({ name: 'text' });

// ─── Model ───────────────────────────────────────────────────

export const UserProfileModel = model<IUserProfileDocument>('UserProfile', UserProfileSchema);
