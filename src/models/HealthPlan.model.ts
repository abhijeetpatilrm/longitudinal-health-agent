/**
 * @file src/models/HealthPlan.model.ts
 * @description Mongoose schema & model for HealthPlan.
 *              Implements strict versioning and status lifecycle management.
 */

import { Schema, model, Document, Types } from 'mongoose';
import { HealthPlanStatus, RecommendationCategory } from '../types';

// ─── Sub-schema: Recommendation ─────────────────────────────

const RecommendationSchema = new Schema(
  {
    category: {
      type: String,
      enum: Object.values(RecommendationCategory),
      required: true,
    },
    suggestion: { type: String, required: true, maxlength: 2000 },
    rationale: { type: String, required: true, maxlength: 2000 },
    kb_citation_id: { type: String, default: null },
  },
  { _id: true }
);

// ─── Document interface ──────────────────────────────────────

export interface IRecommendationSubdoc {
  _id: Types.ObjectId;
  category: RecommendationCategory;
  suggestion: string;
  rationale: string;
  kb_citation_id: string | null;
}

export interface IHealthPlanDocument extends Document {
  user_id: Types.ObjectId;
  version_number: number;
  status: HealthPlanStatus;
  target_daily_calories: number;
  target_protein_g: number;
  target_sleep_hours: number;
  target_activity_minutes: number;
  recommendations: IRecommendationSubdoc[];
  active_from: Date | null;
  active_until: Date | null;
  user_feedback: string | null;
  rejectionReason: string | null;
  created_at: Date;
}

// ─── Schema ──────────────────────────────────────────────────

const HealthPlanSchema = new Schema<IHealthPlanDocument>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'UserProfile',
      required: true,
      index: true,
    },
    version_number: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(HealthPlanStatus),
      required: true,
      default: HealthPlanStatus.DRAFT,
    },
    target_daily_calories: {
      type: Number,
      required: true,
      min: 500,
      max: 10_000,
    },
    target_protein_g: {
      type: Number,
      required: true,
      min: 0,
    },
    target_sleep_hours: {
      type: Number,
      required: true,
      min: 0,
      max: 24,
    },
    target_activity_minutes: {
      type: Number,
      required: true,
      min: 0,
    },
    recommendations: {
      type: [RecommendationSchema],
      default: [],
    },
    active_from: {
      type: Date,
      default: null,
    },
    active_until: {
      type: Date,
      default: null,
    },
    user_feedback: {
      type: String,
      default: null,
      maxlength: 5000,
    },
    rejectionReason: {
      type: String,
      default: null,
      maxlength: 5000,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
  }
);

// ─── Indexes ─────────────────────────────────────────────────

// Unique version per user
HealthPlanSchema.index({ user_id: 1, version_number: 1 }, { unique: true });
// Fast active plan lookup
HealthPlanSchema.index({ user_id: 1, status: 1 });

// ─── Pre-save hook: auto-increment version_number ─────────────

HealthPlanSchema.pre('save', async function (next) {
  if (this.isNew) {
    const lastPlan = await HealthPlanModel.findOne(
      { user_id: this.user_id },
      { version_number: 1 },
      { sort: { version_number: -1 } }
    ).lean();
    this.version_number = lastPlan ? lastPlan.version_number + 1 : 1;
  }
  next();
});

// ─── Model ───────────────────────────────────────────────────

export const HealthPlanModel = model<IHealthPlanDocument>('HealthPlan', HealthPlanSchema);
