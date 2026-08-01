import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  BrainCircuit,
  Check,
  Clock3,
  Edit3,
  Flame,
  Loader2,
  MessageSquareText,
  MoonStar,
  Plus,
  Save,
  Sparkles,
  Smile,
  Trash2,
  Waves,
  Weight,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { DEMO_USER_ID } from '../../lib/constants.ts';
import type { DailyLog, Meal } from '../../types/index.ts';
import { Alert } from '../ui/Alert.tsx';
import MacroRing from '../dashboard/MacroRing.tsx';

type MealDraft = {
  food_item: string;
  estimated_calories: string;
  protein_g: string;
  carbs_g: string;
  fats_g: string;
  serving_size_description: string;
};

const TARGET_CALORIES = 2200;
const TARGET_PROTEIN = 160;
const TARGET_CARBS = 240;
const TARGET_FATS = 70;

const SAMPLE_PROMPTS = [
  'Had 2 eggs, avocado toast, and 30m run',
  'Chicken salad with rice, slept 8h',
  'Greek yogurt, berries, protein shake, evening walk',
];

function emptyMealDraft(): MealDraft {
  return {
    food_item: '',
    estimated_calories: '',
    protein_g: '',
    carbs_g: '',
    fats_g: '',
    serving_size_description: '',
  };
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMacroBadge(meal: Meal) {
  const flags: string[] = [];
  if (meal.is_ai_extracted) flags.push('AI EXTRACTED');
  if (meal.is_user_corrected) flags.push('USER OVERRIDE');
  return flags.length ? flags.join(' • ') : 'LIVE ENTRY';
}

export default function DailyLogTab() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [sleepHours, setSleepHours] = useState(7);
  const [weight, setWeight] = useState(75);
  const [moodScore, setMoodScore] = useState(7);
  const [activityMinutes, setActivityMinutes] = useState(30);
  const [noteText, setNoteText] = useState('');
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSavingMetrics, setIsSavingMetrics] = useState(false);
  const [isSavingMeals, setIsSavingMeals] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingMeal, setEditingMeal] = useState<MealDraft>(emptyMealDraft());
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualMeal, setManualMeal] = useState<MealDraft>(emptyMealDraft());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchLog = async () => {
      try {
        const res = await api.get(`/logs/${DEMO_USER_ID}/${date}`);
        if (!mounted) return;

        const log = res.data.data as DailyLog;
        setDailyLog(log);
        setSleepHours(log.sleep_hours ?? 7);
        setWeight(log.weight_kg ?? 75);
        setMoodScore(log.mood_energy_score ?? 7);
      } catch (err: any) {
        if (err.response?.status !== 404) {
          setError(err.response?.data?.error?.message || 'Failed to load the daily log.');
        }
      }
    };

    fetchLog();

    return () => {
      mounted = false;
    };
  }, [date]);

  const mealTotals = useMemo(() => {
    const meals = dailyLog?.meals ?? [];
    return meals.reduce(
      (totals, meal) => ({
        calories: totals.calories + (meal.estimated_calories || 0),
        protein: totals.protein + (meal.protein_g || 0),
        carbs: totals.carbs + (meal.carbs_g || 0),
        fats: totals.fats + (meal.fats_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [dailyLog]);

  const sleepEmoji = sleepHours >= 8 ? '😴' : sleepHours >= 6 ? '🙂' : '🥱';
  const moodEmoji = moodScore >= 7 ? '😊' : moodScore >= 4 ? '😐' : '😫';

  const saveCoreMetrics = async () => {
    setIsSavingMetrics(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        userId: 'TEST_USER_001',
        date,
        sleepHours,
        weight,
        moodScore,
        activityMinutes,
      };

      const res = await api.post('/logs', payload);
      setDailyLog(res.data.data);
      setSuccess('Core metrics saved.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save metrics.');
    } finally {
      setIsSavingMetrics(false);
    }
  };

  const handleExtract = async () => {
    if (!noteText.trim()) return;

    setIsExtracting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.post(`/logs/${DEMO_USER_ID}/extract-meals`, {
        date,
        rawNote: noteText,
        text: noteText,
      });

      const nextLog = (res.data.data.log || res.data.data) as DailyLog;
      setDailyLog(nextLog);
      setNoteText('');
      setSuccess('Meals extracted and synced from the note.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to extract meals.');
    } finally {
      setIsExtracting(false);
    }
  };

  const persistMeals = async (nextMeals: Meal[]) => {
    if (!dailyLog) return;

    setIsSavingMeals(true);
    setError(null);

    try {
      const res = await api.patch(`/logs/${dailyLog._id}`, { meals: nextMeals });
      setDailyLog(res.data.data);
      setSuccess('Meal list updated.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update meals.');
    } finally {
      setIsSavingMeals(false);
    }
  };

  const beginEdit = (meal: Meal) => {
    setEditingMealId(meal._id);
    setEditingMeal({
      food_item: meal.food_item,
      estimated_calories: String(meal.estimated_calories),
      protein_g: String(meal.protein_g),
      carbs_g: String(meal.carbs_g),
      fats_g: String(meal.fats_g),
      serving_size_description: meal.serving_size_description ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingMealId(null);
    setEditingMeal(emptyMealDraft());
  };

  const saveEdit = async () => {
    if (!dailyLog || !editingMealId) return;

    try {
      const res = await api.put(`/logs/${dailyLog._id}/meals/${editingMealId}/correct`, {
        food_item: editingMeal.food_item,
        estimated_calories: toNumber(editingMeal.estimated_calories),
        protein_g: toNumber(editingMeal.protein_g),
        carbs_g: toNumber(editingMeal.carbs_g),
        fats_g: toNumber(editingMeal.fats_g),
        serving_size_description: editingMeal.serving_size_description || null,
      });

      setDailyLog(res.data.data);
      setEditingMealId(null);
      setEditingMeal(emptyMealDraft());
      setSuccess('Meal correction saved.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save meal correction.');
    }
  };

  const addManualMeal = async () => {
    if (!dailyLog || !manualMeal.food_item.trim()) return;

    const nextMeals: Meal[] = [
      ...dailyLog.meals,
      {
        _id: crypto.randomUUID(),
        food_item: manualMeal.food_item.trim(),
        estimated_calories: toNumber(manualMeal.estimated_calories),
        protein_g: toNumber(manualMeal.protein_g),
        carbs_g: toNumber(manualMeal.carbs_g),
        fats_g: toNumber(manualMeal.fats_g),
        serving_size_description: manualMeal.serving_size_description.trim() || null,
        is_ai_extracted: false,
        is_user_corrected: true,
      },
    ];

    await persistMeals(nextMeals);
    setManualMeal(emptyMealDraft());
    setShowManualEntry(false);
  };

  const removeMeal = async (mealId: string) => {
    if (!dailyLog) return;

    await persistMeals(dailyLog.meals.filter((meal) => meal._id !== mealId));
    if (editingMealId === mealId) cancelEdit();
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Daily Log / AI Meal Extractor
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">PulseAI Daily Log</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Capture metrics, paste natural language notes, and let the extractor populate meals with live macros.
            </p>
          </div>
        </div>

        <label className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Log date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-2 w-full bg-transparent text-white outline-none"
          />
        </label>
      </div>

      {error && <Alert type="error" title="Error" message={error} />}
      {success && <Alert type="success" title="Saved" message={success} />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <MacroRing
          calories={mealTotals.calories}
          calorieTarget={TARGET_CALORIES}
          protein={mealTotals.protein}
          proteinTarget={TARGET_PROTEIN}
          carbs={mealTotals.carbs}
          carbsTarget={TARGET_CARBS}
          fats={mealTotals.fats}
          fatsTarget={TARGET_FATS}
          title="Macro Budget"
          subtitle="Top summary gauge strip"
          className="flex h-full flex-col justify-between"
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Sleep</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="16"
                  step="0.5"
                  value={sleepHours}
                  onChange={(event) => setSleepHours(parseFloat(event.target.value || '0'))}
                  className="w-14 rounded-lg border border-white/10 bg-slate-900/80 px-1.5 py-0.5 text-xs text-right text-white outline-none focus:border-cyan-400/40"
                />
                <MoonStar className="h-4 w-4 text-cyan-300" />
              </div>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-semibold text-white">{sleepHours.toFixed(1)}</span>
              <span className="pb-1 text-xs text-slate-400">hrs</span>
              <span className="ml-auto rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">{sleepEmoji}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min="0" max="16" step="0.5" value={sleepHours} onChange={(event) => setSleepHours(parseFloat(event.target.value))} className="w-full accent-cyan-400" />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Weight</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="30"
                  max="200"
                  step="0.5"
                  value={weight}
                  onChange={(event) => setWeight(parseFloat(event.target.value || '0'))}
                  className="w-14 rounded-lg border border-white/10 bg-slate-900/80 px-1.5 py-0.5 text-xs text-right text-white outline-none focus:border-violet-400/40"
                />
                <Weight className="h-4 w-4 text-violet-300" />
              </div>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-semibold text-white">{weight.toFixed(1)}</span>
              <span className="pb-1 text-xs text-slate-400">kg</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min="30" max="200" step="0.5" value={weight} onChange={(event) => setWeight(parseFloat(event.target.value))} className="w-full accent-violet-400" />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Mood</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={moodScore}
                  onChange={(event) => setMoodScore(parseInt(event.target.value || '1', 10))}
                  className="w-14 rounded-lg border border-white/10 bg-slate-900/80 px-1.5 py-0.5 text-xs text-right text-white outline-none focus:border-amber-400/40"
                />
                <Smile className="h-4 w-4 text-amber-300" />
              </div>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-semibold text-white">{moodScore}/10</span>
              <span className="ml-auto rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">{moodEmoji}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min="1" max="10" step="1" value={moodScore} onChange={(event) => setMoodScore(parseInt(event.target.value, 10))} className="w-full accent-amber-400" />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Activity</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="180"
                  step="5"
                  value={activityMinutes}
                  onChange={(event) => setActivityMinutes(Number(event.target.value || '0'))}
                  className="w-14 rounded-lg border border-white/10 bg-slate-900/80 px-1.5 py-0.5 text-xs text-right text-white outline-none focus:border-emerald-400/40"
                />
                <Activity className="h-4 w-4 text-emerald-300" />
              </div>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-semibold text-white">{activityMinutes}</span>
              <span className="pb-1 text-xs text-slate-400">min</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min="0" max="180" step="5" value={activityMinutes} onChange={(event) => setActivityMinutes(Number(event.target.value))} className="w-full accent-emerald-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[24px] flex flex-col border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">AI natural language ingestor</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Describe the day in your own words.</h3>
            </div>
            <div className="rounded-full border border-cyan-500/15 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              {noteText.length} chars
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setNoteText(prompt)}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-left text-xs font-medium text-slate-300 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-white"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-3 flex flex-col gap-3">
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Had eggs, avocado toast, latte, and a 30 minute run..."
              rows={3}
              className="flex-1 w-full rounded-[16px] border border-white/10 bg-slate-900/80 p-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-4 focus:ring-emerald-500/10"
            />

            <button
              type="button"
              onClick={handleExtract}
              disabled={isExtracting || !noteText.trim()}
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg hover:shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="absolute inset-0 bg-white/10 opacity-0 transition group-hover:opacity-100" />
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>{isExtracting ? 'Extracting with AI...' : 'Extract & Auto-Fill with AI'}</span>
            </button>
          </div>
        </section>

        <section className="rounded-[24px] flex flex-col border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Live sync</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Dynamic extracted meals</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowManualEntry(true)}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300 transition hover:bg-emerald-500/15"
            >
              <Plus className="h-3 w-3" />
              Add Manual Meal
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
            <MessageSquareText className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
            Rows are rendered from the API response, including user overrides.
          </div>

          <div className="mt-3 overflow-y-auto max-h-[350px] rounded-xl border border-white/10 bg-slate-950/55">
            {!dailyLog ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
                <BrainCircuit className="h-8 w-8 text-slate-500" />
                <p className="text-sm font-medium text-slate-200">No meals logged for this date yet</p>
                <p className="max-w-sm text-xs text-slate-500">Type a note on the left or save the core metrics to create the first log record.</p>
              </div>
            ) : dailyLog.meals.length === 0 ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
                <Flame className="h-8 w-8 text-slate-500" />
                <p className="text-sm font-medium text-slate-200">No meals found in this log</p>
                <p className="max-w-sm text-xs text-slate-500">Use the AI extractor or add a manual meal to populate the meal table.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.08]">
                {dailyLog.meals.map((meal) => {
                  const isEditing = editingMealId === meal._id;

                  return (
                    <div key={meal._id} className="p-4 transition hover:bg-white/[0.03]">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm text-slate-300">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Food item</span>
                              <input
                                value={editingMeal.food_item}
                                onChange={(event) => setEditingMeal((current) => ({ ...current, food_item: event.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-white outline-none focus:border-cyan-400/40"
                              />
                            </label>
                            <label className="space-y-1 text-sm text-slate-300">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Serving detail</span>
                              <input
                                value={editingMeal.serving_size_description}
                                onChange={(event) => setEditingMeal((current) => ({ ...current, serving_size_description: event.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-white outline-none focus:border-cyan-400/40"
                              />
                            </label>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-4">
                            <label className="space-y-1 text-sm text-slate-300">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Calories</span>
                              <input
                                type="number"
                                value={editingMeal.estimated_calories}
                                onChange={(event) => setEditingMeal((current) => ({ ...current, estimated_calories: event.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-white outline-none focus:border-cyan-400/40"
                              />
                            </label>
                            <label className="space-y-1 text-sm text-slate-300">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Protein</span>
                              <input
                                type="number"
                                value={editingMeal.protein_g}
                                onChange={(event) => setEditingMeal((current) => ({ ...current, protein_g: event.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-white outline-none focus:border-cyan-400/40"
                              />
                            </label>
                            <label className="space-y-1 text-sm text-slate-300">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Carbs</span>
                              <input
                                type="number"
                                value={editingMeal.carbs_g}
                                onChange={(event) => setEditingMeal((current) => ({ ...current, carbs_g: event.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-white outline-none focus:border-cyan-400/40"
                              />
                            </label>
                            <label className="space-y-1 text-sm text-slate-300">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Fat</span>
                              <input
                                type="number"
                                value={editingMeal.fats_g}
                                onChange={(event) => setEditingMeal((current) => ({ ...current, fats_g: event.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-white outline-none focus:border-cyan-400/40"
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={saveEdit}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-white">{meal.food_item}</h4>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                                {formatMacroBadge(meal)}
                              </span>
                            </div>
                            {meal.serving_size_description && <p className="mt-1 text-xs text-slate-400">{meal.serving_size_description}</p>}
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                              <div className="text-center min-w-[36px]">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Cal</p>
                                <p className="text-sm font-semibold text-white">{meal.estimated_calories}</p>
                              </div>
                              <div className="h-5 w-px bg-white/10" />
                              <div className="text-center min-w-[36px]">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Pro</p>
                                <p className="text-sm font-semibold text-white">{meal.protein_g}g</p>
                              </div>
                              <div className="h-5 w-px bg-white/10" />
                              <div className="text-center min-w-[36px]">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Carb</p>
                                <p className="text-sm font-semibold text-white">{meal.carbs_g}g</p>
                              </div>
                              <div className="h-5 w-px bg-white/10" />
                              <div className="text-center min-w-[36px]">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Fat</p>
                                <p className="text-sm font-semibold text-white">{meal.fats_g}g</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => beginEdit(meal)}
                                className="p-1.5 text-slate-400 hover:text-white transition rounded-lg hover:bg-white/10"
                                title="Edit"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeMeal(meal._id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-rose-400/10"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <button onClick={saveCoreMetrics} disabled={isSavingMetrics} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">
          {isSavingMetrics ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Core Metrics
        </button>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
          <div className="flex items-center gap-2 text-slate-200 font-medium">
            <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
            Dynamic state binding
          </div>
          <p className="mt-1 text-slate-400">Typing or changing sliders updates the local UI immediately, and API calls persist the change on save.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
          <div className="flex items-center gap-2 text-slate-200 font-medium">
            <Waves className="h-3.5 w-3.5 text-violet-300" />
            API-backed extraction
          </div>
          <p className="mt-1 text-slate-400">The extractor uses POST /api/logs/:userId/extract-meals and renders the returned meals directly.</p>
        </div>
      </div>

      {showManualEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-slate-950/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Manual macro modal</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">Add manual meal</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualEntry(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300 sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Food item</span>
                <input
                  value={manualMeal.food_item}
                  onChange={(event) => setManualMeal((current) => ({ ...current, food_item: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-emerald-400/40"
                  placeholder="Protein shake"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Calories</span>
                <input
                  type="number"
                  value={manualMeal.estimated_calories}
                  onChange={(event) => setManualMeal((current) => ({ ...current, estimated_calories: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-emerald-400/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Protein</span>
                <input
                  type="number"
                  value={manualMeal.protein_g}
                  onChange={(event) => setManualMeal((current) => ({ ...current, protein_g: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-emerald-400/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Carbs</span>
                <input
                  type="number"
                  value={manualMeal.carbs_g}
                  onChange={(event) => setManualMeal((current) => ({ ...current, carbs_g: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-emerald-400/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Fat</span>
                <input
                  type="number"
                  value={manualMeal.fats_g}
                  onChange={(event) => setManualMeal((current) => ({ ...current, fats_g: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-emerald-400/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300 sm:col-span-2">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Serving description</span>
                <input
                  value={manualMeal.serving_size_description}
                  onChange={(event) => setManualMeal((current) => ({ ...current, serving_size_description: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-emerald-400/40"
                  placeholder="1 scoop with water"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowManualEntry(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addManualMeal}
                disabled={!manualMeal.food_item.trim() || isSavingMeals}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg hover:shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                Add Meal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
