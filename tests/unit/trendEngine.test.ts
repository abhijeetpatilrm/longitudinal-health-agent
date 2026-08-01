import {
  calculateWeeklyMonthlySummary,
  calculateTrendDirection,
  detectMissingDataAndInconsistencies,
  calculatePlanAdherence,
} from '../../src/services/health/trendEngine';
import { createMockDailyLog, createMockHealthPlan } from '../helpers/mockData';
import { IMealSubdoc } from '../../src/models/DailyLog.model';

describe('trendEngine (Deterministic Math Engine)', () => {
  describe('calculateWeeklyMonthlySummary', () => {
    it('computes correct averages and weight delta', () => {
      const logs = [
        createMockDailyLog({
          date: '2026-07-29',
          weight_kg: 80.5,
          sleep_hours: 8,
          meals: [{ estimated_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 50 } as IMealSubdoc],
          activity: { estimated_calories_burned: 400, step_count: 8000, activity_type: 'WALKING' as any, duration_minutes: 60, notes: null },
        }),
        createMockDailyLog({
          date: '2026-07-30',
          weight_kg: 79.5,
          sleep_hours: 6,
          meals: [{ estimated_calories: 1000, protein_g: 50, carbs_g: 100, fats_g: 30 } as IMealSubdoc],
          activity: { estimated_calories_burned: 200, step_count: 4000, activity_type: 'WALKING' as any, duration_minutes: 30, notes: null },
        }),
      ];

      const summary = calculateWeeklyMonthlySummary(logs);

      expect(summary.overall.avg_daily_calories).toBe(1500); // (2000 + 1000) / 2
      expect(summary.overall.avg_protein_g).toBe(100);
      expect(summary.overall.avg_sleep_hours).toBe(7);
      expect(summary.overall.net_weight_delta_kg).toBe(-1.0); // 79.5 - 80.5
      expect(summary.overall.total_step_count).toBe(12000); // 8000 + 4000
    });
  });

  describe('calculateTrendDirection', () => {
    it('detects INCREASING slope', () => {
      const logs = [
        createMockDailyLog({ weight_kg: 80 }),
        createMockDailyLog({ weight_kg: 81 }),
        createMockDailyLog({ weight_kg: 82 }),
      ];
      const trend = calculateTrendDirection(logs, 'weight_kg');
      expect(trend.direction).toBe('INCREASING');
    });

    it('detects DECREASING slope', () => {
      const logs = [
        createMockDailyLog({ weight_kg: 80 }),
        createMockDailyLog({ weight_kg: 79 }),
        createMockDailyLog({ weight_kg: 78 }),
      ];
      const trend = calculateTrendDirection(logs, 'weight_kg');
      expect(trend.direction).toBe('DECREASING');
    });

    it('detects STABLE slope', () => {
      const logs = [
        createMockDailyLog({ weight_kg: 80 }),
        createMockDailyLog({ weight_kg: 80.01 }),
        createMockDailyLog({ weight_kg: 79.99 }),
      ];
      const trend = calculateTrendDirection(logs, 'weight_kg');
      expect(trend.direction).toBe('STABLE');
    });

    it('returns INSUFFICIENT_DATA for < 2 points', () => {
      const logs = [createMockDailyLog({ weight_kg: 80 })];
      const trend = calculateTrendDirection(logs, 'weight_kg');
      expect(trend.direction).toBe('INSUFFICIENT_DATA');
    });
  });

  describe('detectMissingDataAndInconsistencies', () => {
    it('detects missing days', () => {
      const logs = [
        createMockDailyLog({ date: '2026-07-01' }),
        createMockDailyLog({ date: '2026-07-04' }),
      ];
      const alerts = detectMissingDataAndInconsistencies(logs);
      expect(alerts.missing_days).toEqual(['2026-07-02', '2026-07-03']);
    });

    it('flags crash diets (< 500 kcal)', () => {
      const logs = [
        createMockDailyLog({
          date: '2026-07-01',
          meals: [{ estimated_calories: 400, protein_g: 10, carbs_g: 10, fats_g: 10 } as IMealSubdoc],
        }),
      ];
      const alerts = detectMissingDataAndInconsistencies(logs);
      expect(alerts.flags.some(f => f.type === 'LOW_CALORIE')).toBe(true);
    });

    it('flags weight spikes (> 3kg in one day)', () => {
      const logs = [
        createMockDailyLog({ date: '2026-07-01', weight_kg: 80 }),
        createMockDailyLog({ date: '2026-07-02', weight_kg: 84 }),
      ];
      const alerts = detectMissingDataAndInconsistencies(logs);
      expect(alerts.flags.some(f => f.type === 'WEIGHT_SPIKE')).toBe(true);
    });

    it('flags extreme calorie burn', () => {
      const logs = [
        createMockDailyLog({
          date: '2026-07-01',
          meals: [{ estimated_calories: 1000, protein_g: 10, carbs_g: 10, fats_g: 10 } as IMealSubdoc],
          activity: { estimated_calories_burned: 2000, step_count: 10000, activity_type: 'RUNNING' as any, duration_minutes: 120, notes: null },
        }),
      ];
      const alerts = detectMissingDataAndInconsistencies(logs);
      expect(alerts.flags.some(f => f.type === 'CALORIE_BURN_EXTREME')).toBe(true);
    });
  });

  describe('calculatePlanAdherence', () => {
    it('calculates adherence percentages and caps at 200%', () => {
      const plan = createMockHealthPlan({
        target_daily_calories: 2000,
        target_protein_g: 100,
        target_sleep_hours: 8,
        target_activity_minutes: 30,
      });

      const logs = [
        createMockDailyLog({
          sleep_hours: 4, // 50%
          meals: [{ estimated_calories: 5000, protein_g: 50, carbs_g: 10, fats_g: 10 } as IMealSubdoc], // 200% cal cap, 50% prot
          activity: { duration_minutes: 0, estimated_calories_burned: 0, step_count: 0, activity_type: 'OTHER' as any, notes: null }, // 0%
        }),
      ];

      const adherence = calculatePlanAdherence(plan, logs);

      expect(adherence.avg_calorie_adherence_pct).toBe(200);
      expect(adherence.avg_protein_adherence_pct).toBe(50);
      expect(adherence.avg_sleep_adherence_pct).toBe(50);
      expect(adherence.avg_activity_adherence_pct).toBe(0);
      expect(adherence.top_gap).toBe('activity'); // Lowest %
    });
  });
});
