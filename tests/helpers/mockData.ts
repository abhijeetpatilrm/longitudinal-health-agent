import { Types } from 'mongoose';
import { IDailyLogDocument, IMealSubdoc, IActivitySubdoc } from '../../src/models/DailyLog.model';
import { IHealthPlanDocument } from '../../src/models/HealthPlan.model';
import { IUserProfileDocument } from '../../src/models/UserProfile.model';
import { HealthPlanStatus, Gender } from '../../src/types';

export function createMockDailyLog(overrides: Partial<IDailyLogDocument> = {}): IDailyLogDocument {
  return {
    _id: new Types.ObjectId(),
    user_id: new Types.ObjectId(),
    date: '2026-07-31',
    meals: [] as IMealSubdoc[],
    activity: null as IActivitySubdoc | null,
    sleep_hours: null,
    weight_kg: null,
    mood_energy_score: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as IDailyLogDocument;
}

export function createMockHealthPlan(overrides: Partial<IHealthPlanDocument> = {}): IHealthPlanDocument {
  return {
    _id: new Types.ObjectId(),
    user_id: new Types.ObjectId(),
    version_number: 1,
    status: HealthPlanStatus.ACTIVE,
    target_daily_calories: 2000,
    target_protein_g: 150,
    target_sleep_hours: 8,
    target_activity_minutes: 30,
    recommendations: [],
    active_from: new Date(),
    active_until: null,
    user_feedback: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as IHealthPlanDocument;
}

export function createMockUserProfile(overrides: Partial<IUserProfileDocument> = {}): IUserProfileDocument {
  return {
    _id: new Types.ObjectId(),
    email: 'test@test.com',
    password_hash: 'hash',
    name: 'Test User',
    first_name: 'Test',
    last_name: 'User',
    age: 30,
    gender: Gender.OTHER,
    height_cm: 180,
    baseline_goals: {
      target_daily_calories: 2000,
      target_protein_g: 150,
      target_carbs_g: 200,
      target_fats_g: 70,
      target_water_ml: 2500,
      target_sleep_hours: 8,
      target_activity_minutes_per_day: 30,
    },
    health_conditions: [],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as IUserProfileDocument;
}
