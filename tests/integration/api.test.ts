import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { UserProfileModel } from '../../src/models/UserProfile.model';
import { DailyLogModel } from '../../src/models/DailyLog.model';
import { HealthPlanModel } from '../../src/models/HealthPlan.model';
import { AgentAuditLogModel } from '../../src/models/AgentAuditLog.model';
import { Gender, HealthPlanStatus, AuditActionType, AuditStatus } from '../../src/types';

jest.setTimeout(120000);

let mongoServer: MongoMemoryServer;
const app = createApp();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 120000);

afterAll(async () => {
  await mongoose.connection.close();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await UserProfileModel.deleteMany({});
    await DailyLogModel.deleteMany({});
    await HealthPlanModel.deleteMany({});
    await AgentAuditLogModel.deleteMany({});
  }
});

describe('API Integration Tests', () => {
  let userId: string;

  beforeEach(async () => {
    const user = await UserProfileModel.create({
      email: 'test@integration.com',
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
    });
    userId = user._id.toString();
  });

  describe('POST /api/logs/:userId/extract-meals', () => {
    it('extracts meals and creates a daily log using offline stub', async () => {
      const payload = {
        rawNote: "Ate 2 eggs for breakfast",
        date: "2026-07-31"
      };

      const res = await request(app)
        .post(`/api/logs/${userId}/extract-meals`)
        .send(payload)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.log.meals.length).toBeGreaterThan(0);
      expect(res.body.data.log.meals[0].food_item).toContain('stub');

      // Verify log was saved to DB
      const log = await DailyLogModel.findOne({ user_id: userId, date: "2026-07-31" });
      expect(log).toBeTruthy();
      expect(log?.meals.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/plans/:userId/generate', () => {
    it('generates a new draft plan using offline stub', async () => {
      // Seed some logs first so it doesn't fail on INSUFFICIENT_DATA
      await DailyLogModel.create({
        user_id: userId,
        date: '2026-07-29',
        meals: [],
        activity: null,
      });

      const res = await request(app)
        .post(`/api/plans/${userId}/generate?days=14`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.proposedPlan.status).toBe(HealthPlanStatus.DRAFT);
      expect(res.body.data.proposedPlan.version_number).toBe(1);

      // Verify saved to DB
      const plan = await HealthPlanModel.findById(res.body.data.proposedPlan._id);
      expect(plan).toBeTruthy();
      expect(plan?.status).toBe(HealthPlanStatus.DRAFT);
    });
  });

  describe('PUT /api/plans/:planId/approve & reject', () => {
    let planId: string;

    beforeEach(async () => {
      const plan = await HealthPlanModel.create({
        user_id: userId,
        version_number: 2,
        status: HealthPlanStatus.DRAFT,
        target_daily_calories: 2000,
        target_protein_g: 150,
        target_sleep_hours: 8,
        target_activity_minutes: 30,
        recommendations: [],
      });
      planId = plan._id.toString();
    });

    it('approves a draft plan and archives previous active plans', async () => {
      await HealthPlanModel.create({
        user_id: userId,
        version_number: 1,
        status: HealthPlanStatus.ACTIVE,
        target_daily_calories: 2000,
        target_protein_g: 150,
        target_sleep_hours: 8,
        target_activity_minutes: 30,
        recommendations: [],
      });

      const res = await request(app)
        .put(`/api/plans/${planId}/approve`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(HealthPlanStatus.ACTIVE);

      // Verify old plan is archived
      const archived = await HealthPlanModel.findOne({ status: HealthPlanStatus.ARCHIVED });
      expect(archived).toBeTruthy();

      // Verify audit log
      const audit = await AgentAuditLogModel.findOne({ action_type: AuditActionType.RETROSPECTIVE_GEN });
      expect(audit).toBeTruthy();
      expect(audit?.status).toBe(AuditStatus.SUCCESS);
    });

    it('rejects a draft plan and records feedback', async () => {
      const res = await request(app)
        .put(`/api/plans/${planId}/reject`)
        .send({ user_feedback: "Too high calories" })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(HealthPlanStatus.REJECTED);
      expect(res.body.data.user_feedback).toBe("Too high calories");

      // Verify audit log
      const audit = await AgentAuditLogModel.findOne({ action_type: AuditActionType.RETROSPECTIVE_GEN });
      expect(audit).toBeTruthy();
      expect(audit?.status).toBe(AuditStatus.USER_REJECTED);
    });
  });

  describe('PUT /api/logs/:logId/meals/:mealId/correct', () => {
    let logId: string;
    let mealId: string;

    beforeEach(async () => {
      const log = await DailyLogModel.create({
        user_id: userId,
        date: '2026-07-31',
        meals: [
          {
            food_item: 'Old Food',
            estimated_calories: 100,
            protein_g: 10,
            carbs_g: 10,
            fats_g: 10,
            is_ai_extracted: true,
            is_user_corrected: false,
          }
        ],
        activity: null,
      });
      logId = log._id.toString();
      mealId = log.meals[0]._id.toString();
    });

    it('corrects a meal and creates an audit log', async () => {
      const res = await request(app)
        .put(`/api/logs/${logId}/meals/${mealId}/correct`)
        .send({ food_item: 'New Food', estimated_calories: 200 })
        .expect(200);

      expect(res.body.success).toBe(true);
      
      const updatedLog = await DailyLogModel.findById(logId);
      const updatedMeal = updatedLog?.meals.find(m => m._id.toString() === mealId);
      
      expect(updatedMeal?.food_item).toBe('New Food');
      expect(updatedMeal?.estimated_calories).toBe(200);
      expect(updatedMeal?.is_user_corrected).toBe(true);
      
      // Verify audit log
      const audit = await AgentAuditLogModel.findOne({ action_type: AuditActionType.USER_CORRECTION });
      expect(audit).toBeTruthy();
      expect(audit?.status).toBe(AuditStatus.USER_CORRECTED);
      
      const correctedOutput = audit?.corrected_output as any;
      expect(correctedOutput.before.food_item).toBe('Old Food');
      expect(correctedOutput.after.food_item).toBe('New Food');
      expect(correctedOutput.delta.estimated_calories).toBe(200);
    });
  });
});
