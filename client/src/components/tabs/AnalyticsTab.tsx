import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { Activity, AlertTriangle, Flame, Loader2, MoonStar, Scale, Target, TrendingDown, Waves } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { DEMO_USER_ID } from '../../lib/constants.ts';
import { Alert } from '../ui/Alert.tsx';
import type { DailyLog } from '../../types/index.ts';

interface TrendFlag {
  type: string;
  date: string;
  description: string;
  severity: string;
}

interface TrendQuality {
  has_critical_gaps?: boolean;
  missing_days?: string[];
  flags?: TrendFlag[];
}

interface TrendAdherence {
  avg_calorie_adherence_pct?: number;
  avg_protein_adherence_pct?: number;
  avg_sleep_adherence_pct?: number;
  avg_activity_adherence_pct?: number;
  top_gap?: string;
}

interface TrendResponse {
  data_quality?: TrendQuality;
  inconsistencies?: TrendQuality;
  plan_adherence?: TrendAdherence;
  adherence?: TrendAdherence;
  weekly_monthly_summary?: {
    overall?: {
      avg_daily_calories: number | null;
      avg_protein_g: number | null;
      avg_sleep_hours: number | null;
      total_step_count: number;
      net_weight_delta_kg: number | null;
    };
  };
  summary?: {
    overall?: {
      avg_daily_calories: number | null;
      avg_protein_g: number | null;
      avg_sleep_hours: number | null;
      total_step_count: number;
      net_weight_delta_kg: number | null;
    };
  };
  dailySeries?: Array<{
    date: string;
    weight: number;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    targetCalories?: number;
    sleep: number;
    mood: number;
  }>;
}

type SeriesPoint = {
  date: string;
  weight: number;
  calories: number;
  proteinCalories: number;
  carbsCalories: number;
  fatCalories: number;
  sleep: number;
  mood: number;
  steps: number;
  logged: boolean;
};

type ActivePlan = {
  target_daily_calories: number;
  target_protein_g: number;
  target_sleep_hours: number;
  target_activity_minutes: number;
};

function buildSeriesFromLogs(logs: DailyLog[], days = 14): SeriesPoint[] {
  const byDate = new Map<string, DailyLog>();
  logs.forEach((log) => byDate.set(log.date, log));

  const points: SeriesPoint[] = [];
  let lastWeight = 0;

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = format(date, 'yyyy-MM-dd');
    const log = byDate.get(key);
    const meals = log?.meals ?? [];

    const calories = meals.reduce((sum, meal) => sum + (meal.estimated_calories || 0), 0);
    const protein = meals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0);
    const carbs = meals.reduce((sum, meal) => sum + (meal.carbs_g || 0), 0);
    const fats = meals.reduce((sum, meal) => sum + (meal.fats_g || 0), 0);
    const weight = log?.weight_kg ?? lastWeight;

    if (log?.weight_kg != null) {
      lastWeight = log.weight_kg;
    }

    points.push({
      date: key,
      weight,
      calories,
      proteinCalories: protein * 4,
      carbsCalories: carbs * 4,
      fatCalories: fats * 9,
      sleep: log?.sleep_hours ?? 0,
      mood: log?.mood_energy_score ?? 0,
      steps: log?.activity?.step_count ?? 0,
      logged: !!log,
    });
  }

  return points;
}

function regressionLine(points: SeriesPoint[]) {
  const numeric = points.map((point, index) => ({ index, value: point.weight })).filter((point) => Number.isFinite(point.value));
  if (numeric.length < 2) return points.map((point) => ({ ...point, trendWeight: point.weight }));

  const count = numeric.length;
  const sumX = numeric.reduce((sum, point) => sum + point.index, 0);
  const sumY = numeric.reduce((sum, point) => sum + point.value, 0);
  const sumXY = numeric.reduce((sum, point) => sum + point.index * point.value, 0);
  const sumXX = numeric.reduce((sum, point) => sum + point.index * point.index, 0);
  const slope = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / count;

  return points.map((point, index) => ({ ...point, trendWeight: Number((slope * index + intercept).toFixed(2)) }));
}

export default function AnalyticsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [trendResult, logsResult, planResult] = await Promise.allSettled([
          api.get(`/users/${DEMO_USER_ID}/trends?days=14`),
          api.get(`/logs/${DEMO_USER_ID}`),
          api.get(`/plans/${DEMO_USER_ID}/active`),
        ]);

        if (!mounted) return;

        if (trendResult.status === 'fulfilled') {
          setTrendData(trendResult.value.data.data as TrendResponse);
        }

        if (logsResult.status === 'fulfilled') {
          setLogs((logsResult.value.data.data as DailyLog[]) ?? []);
        }

        if (planResult.status === 'fulfilled') {
          setActivePlan(planResult.value.data.data as ActivePlan);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.response?.data?.error?.message || 'Failed to load analytics.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const apiSeries = trendData?.dailySeries;
  const derivedSeries = useMemo(() => buildSeriesFromLogs(logs, 14), [logs]);
  const series = apiSeries?.length ? apiSeries.map((point) => ({
    date: point.date,
    weight: point.weight,
    calories: point.calories,
    proteinCalories: point.protein * 4,
    carbsCalories: point.carbs * 4,
    fatCalories: point.fats * 9,
    sleep: point.sleep,
    mood: point.mood,
    steps: 0,
    logged: true,
    trendWeight: point.weight,
  })) : regressionLine(derivedSeries);

  const quality = trendData?.data_quality ?? trendData?.inconsistencies;
  const adherence = trendData?.plan_adherence ?? trendData?.adherence ?? null;
  const summary = trendData?.weekly_monthly_summary?.overall ?? trendData?.summary?.overall ?? null;

  const recent = series.slice(-7);
  const avgCalories = recent.length ? Math.round(recent.reduce((sum, point) => sum + point.calories, 0) / recent.length) : summary?.avg_daily_calories ?? 0;
  const sleepConsistency = recent.length ? Math.round((recent.filter((point) => point.sleep >= 7).length / recent.length) * 100) : 0;
  const firstWeight = series.find((point) => point.weight > 0)?.weight ?? 0;
  const lastWeight = [...series].reverse().find((point) => point.weight > 0)?.weight ?? 0;
  const weightDelta = Number((lastWeight - firstWeight).toFixed(1));
  const adherenceIndex = adherence
    ? Math.round(
        ((adherence.avg_calorie_adherence_pct ?? 0) + (adherence.avg_protein_adherence_pct ?? 0) + (adherence.avg_sleep_adherence_pct ?? 0) + (adherence.avg_activity_adherence_pct ?? 0)) /
          4 *
          100
      )
    : 0;
  const targetCalories = activePlan?.target_daily_calories ?? 2200;

  const missingDays = quality?.missing_days ?? [];
  const flags = quality?.flags ?? [];

  if (loading) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center rounded-[32px] border border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/30">
        <div className="flex items-center gap-3 text-slate-300">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          Loading analytics...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
          <Activity className="h-3.5 w-3.5" />
          Deterministic trends
        </div>
        <div>
          <h2 className="text-4xl font-semibold tracking-tight text-white">Analytics & Trends</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Review 14-day patterns, trend direction, anomaly flags, and adherence without relying on any hidden heuristics.
          </p>
        </div>
      </div>

      {error && <Alert type="error" title="Analytics Error" message={error} />}

      {flags.length > 0 || missingDays.length > 0 ? (
        <div className="space-y-3">
          {missingDays.length > 0 && (
            <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100 shadow-xl shadow-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">Missing logging days</p>
                  <p className="mt-1 text-sm text-amber-100/85">{missingDays.join(', ')}</p>
                </div>
              </div>
            </div>
          )}
          {flags.map((flag) => (
            <div
              key={`${flag.type}-${flag.date}`}
              className={`rounded-[28px] border p-4 shadow-xl shadow-slate-950/20 ${
                flag.severity === 'HIGH' ? 'border-rose-500/20 bg-rose-500/10 text-rose-100' : 'border-amber-500/20 bg-amber-500/10 text-amber-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <Waves className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em]">Anomaly banner</p>
                  <p className="mt-1 text-sm opacity-90">{flag.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400">7-Day Caloric Avg</p>
              <h3 className="mt-3 text-4xl font-semibold text-white">{avgCalories}</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">kcal/day</p>
            </div>
            <Flame className="h-5 w-5 text-orange-300" />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400">Sleep Consistency</p>
              <h3 className="mt-3 text-4xl font-semibold text-white">{sleepConsistency}%</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">7h threshold</p>
            </div>
            <MoonStar className="h-5 w-5 text-cyan-300" />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400">Weight Delta</p>
              <h3 className="mt-3 text-4xl font-semibold text-white">{weightDelta > 0 ? '+' : ''}{weightDelta}</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">14 days</p>
            </div>
            <Scale className="h-5 w-5 text-violet-300" />
          </div>
        </div>

        <div className="rounded-[28px] border border-emerald-400/20 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 p-5 shadow-2xl shadow-emerald-950/20 backdrop-blur-xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-emerald-100/80">Adherence Index</p>
              <h3 className="mt-3 text-4xl font-semibold text-white">{adherenceIndex}%</h3>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-emerald-300" style={{ width: `${Math.min(Math.max(adherenceIndex, 0), 100)}%` }} />
              </div>
            </div>
            <Target className="h-5 w-5 text-emerald-200" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl xl:col-span-1">
          <div className="mb-6 flex items-center gap-2 text-white">
            <TrendingDown className="h-5 w-5 text-emerald-300" />
            <h3 className="text-lg font-semibold">Weight Trajectory</h3>
          </div>
          <div className="h-[20rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'MMM d')} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: '#020617',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16,
                    color: '#e2e8f0',
                  }}
                />
                <Area type="monotone" dataKey="weight" stroke="none" fill="url(#weightGradient)" />
                <Line type="monotone" dataKey="weight" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }} />
                <Line type="monotone" dataKey="trendWeight" stroke="#8B5CF6" strokeDasharray="6 6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl xl:col-span-1">
          <div className="mb-6 flex items-center gap-2 text-white">
            <Flame className="h-5 w-5 text-orange-300" />
            <h3 className="text-lg font-semibold">Caloric & Macro Breakdown</h3>
          </div>
          <div className="h-[20rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'MMM d')} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: '#020617',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16,
                    color: '#e2e8f0',
                  }}
                />
                <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                <ReferenceLine y={targetCalories} stroke="#10B981" strokeDasharray="6 6" label={{ value: 'Target kcal', fill: '#a7f3d0', fontSize: 12 }} />
                <Bar dataKey="proteinCalories" stackId="a" fill="#06B6D4" name="Protein kcal" radius={[0, 0, 4, 4]} />
                <Bar dataKey="carbsCalories" stackId="a" fill="#8B5CF6" name="Carb kcal" />
                <Bar dataKey="fatCalories" stackId="a" fill="#F59E0B" name="Fat kcal" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl xl:col-span-2">
          <div className="mb-6 flex items-center gap-2 text-white">
            <Waves className="h-5 w-5 text-cyan-300" />
            <h3 className="text-lg font-semibold">Sleep vs Mood Correlation</h3>
          </div>
          <div className="h-[22rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'MMM d')} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis yAxisId="sleep" domain={[0, 12]} axisLine={false} tickLine={false} tick={{ fill: '#67e8f9', fontSize: 12 }} />
                <YAxis yAxisId="mood" orientation="right" domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fill: '#fda4af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: '#020617',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16,
                    color: '#e2e8f0',
                  }}
                />
                <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                <Line yAxisId="sleep" type="monotone" dataKey="sleep" stroke="#06B6D4" strokeWidth={3} dot={{ r: 4, fill: '#06B6D4' }} name="Sleep hours" />
                <Line yAxisId="mood" type="monotone" dataKey="mood" stroke="#F43F5E" strokeWidth={3} dot={{ r: 4, fill: '#F43F5E' }} name="Mood score" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-sm text-slate-300 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-white">
          <Waves className="h-4 w-4 text-amber-300" />
          <span className="font-semibold">Trend summary</span>
        </div>
        <p className="mt-2 text-slate-400">
          {summary
            ? `Average calories ${summary.avg_daily_calories ?? 0}, protein ${summary.avg_protein_g ?? 0}g, sleep ${summary.avg_sleep_hours ?? 0}h, with ${summary.total_step_count} total steps recorded.`
            : 'No trend summary was returned yet. Add more logs to unlock deterministic trend calculations.'}
        </p>
        {adherence?.top_gap && <p className="mt-2 text-slate-400">Top adherence gap: <span className="font-semibold text-white">{adherence.top_gap}</span></p>}
      </div>
    </div>
  );
}
