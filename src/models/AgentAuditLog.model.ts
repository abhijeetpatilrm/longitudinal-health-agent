/**
 * @file src/models/AgentAuditLog.model.ts
 * @description Mongoose schema & model for AgentAuditLog.
 *              Provides complete AI decision traceability with uncertainty scores.
 */

import { Schema, model, Document, Types } from 'mongoose';
import { AuditActionType, AuditStatus } from '../types';

// ─── Document interface ──────────────────────────────────────

export interface IAgentAuditLogDocument extends Document {
  user_id: Types.ObjectId;
  action_type: AuditActionType;
  input_payload: Record<string, unknown>;
  raw_ai_output: Record<string, unknown>;
  corrected_output: Record<string, unknown> | null;
  uncertainty_score: number;
  status: AuditStatus;
  error_message: string | null;
  timestamp: Date;
}

// ─── Schema ──────────────────────────────────────────────────

const AgentAuditLogSchema = new Schema<IAgentAuditLogDocument>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'UserProfile',
      required: true,
      index: true,
    },
    action_type: {
      type: String,
      enum: Object.values(AuditActionType),
      required: true,
      index: true,
    },
    input_payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    raw_ai_output: {
      type: Schema.Types.Mixed,
      required: true,
    },
    corrected_output: {
      type: Schema.Types.Mixed,
      default: null,
    },
    uncertainty_score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    status: {
      type: String,
      enum: Object.values(AuditStatus),
      required: true,
      index: true,
    },
    error_message: {
      type: String,
      default: null,
      maxlength: 5000,
    },
    timestamp: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
  },
  {
    versionKey: false,
    // No timestamps option — we use our own `timestamp` field per schema spec
  }
);

// ─── Indexes ─────────────────────────────────────────────────

// Paginated audit trail per user ordered by recency
AgentAuditLogSchema.index({ user_id: 1, timestamp: -1 });
// Filter by action type within a user's logs
AgentAuditLogSchema.index({ user_id: 1, action_type: 1, timestamp: -1 });
// Safety violation fast lookup
AgentAuditLogSchema.index({ status: 1, timestamp: -1 });

// ─── Model ───────────────────────────────────────────────────

export const AgentAuditLogModel = model<IAgentAuditLogDocument>(
  'AgentAuditLog',
  AgentAuditLogSchema
);
