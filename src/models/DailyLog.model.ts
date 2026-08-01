/**
 * @file src/models/DailyLog.model.ts
 * @description Mongoose schema & model for DailyLog.
 *              Combines structured nutrition/activity data with free-text notes.
 */

import { Schema, model, Document, Types } from 'mongoose';
import { ActivityType } from '../types';

// ─── Sub-schema: Meal ────────────────────────────────────────

const MealSchema = new Schema(
  {
    food_item: { type: String, required: true, trim: true, maxlength: 500 },
    estimated_calories: { type: Number, required: true, min: 0 },
    protein_g: { type: Number, required: true, min: 0 },
    carbs_g: { type: Number, required: true, min: 0 },
    fats_g: { type: Number, required: true, min: 0 },
    serving_size_description: { type: String, default: null, maxlength: 200 },
    is_ai_extracted: { type: Boolean, required: true, default: false },
    is_user_corrected: { type: Boolean, required: true, default: false },
  },
  { _id: true }
);

// ─── Sub-schema: Activity ────────────────────────────────────

const ActivitySchema = new Schema(
  {
    activity_type: {
      type: String,
      enum: Object.values(ActivityType),
      required: true,
    },
    duration_minutes: { type: Number, required: true, min: 0, max: 1440 },
    step_count: { type: Number, default: null, min: 0 },
    estimated_calories_burned: { type: Number, required: true, min: 0 },
    notes: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false }
);

// ─── Document interface ──────────────────────────────────────

export interface IMealSubdoc {
  _id: Types.ObjectId;
  food_item: string;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  serving_size_description: string | null;
  is_ai_extracted: boolean;
  is_user_corrected: boolean;
}

export interface IActivitySubdoc {
  activity_type: ActivityType;
  duration_minutes: number;
  step_count: number | null;
  estimated_calories_burned: number;
  notes: string | null;
}

export interface IDailyLogDocument extends Document {
  user_id: Types.ObjectId;
  date: string;
  meals: IMealSubdoc[];
  activity: IActivitySubdoc | null;
  sleep_hours: number | null;
  weight_kg: number | null;
  mood_energy_score: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Schema ──────────────────────────────────────────────────

const DailyLogSchema = new Schema<IDailyLogDocument>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'UserProfile',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'],
    },
    meals: {
      type: [MealSchema],
      default: [],
    },
    activity: {
      type: ActivitySchema,
      default: null,
    },
    sleep_hours: {
      type: Number,
      default: null,
      min: 0,
      max: 24,
    },
    weight_kg: {
      type: Number,
      default: null,
      min: 1,
      max: 500,
    },
    mood_energy_score: {
      type: Number,
      default: null,
      min: 1,
      max: 10,
    },
    notes: {
      type: String,
      default: null,
      maxlength: 5000,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// ─── Indexes ─────────────────────────────────────────────────

// Unique log per user per day
DailyLogSchema.index({ user_id: 1, date: 1 }, { unique: true });

// ─── Model ───────────────────────────────────────────────────

export const DailyLogModel = model<IDailyLogDocument>('DailyLog', DailyLogSchema);
