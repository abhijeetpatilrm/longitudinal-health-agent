import { cn } from '../../lib/utils.ts';

interface MacroRingProps {
  calories: number;
  calorieTarget: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fats: number;
  fatsTarget: number;
  title?: string;
  subtitle?: string;
  className?: string;
}

function clamp(value: number) {
  return Math.max(0, Math.min(value, 1));
}

function Ring({ radius, strokeWidth, progress, color }: { radius: number; strokeWidth: number; progress: number; color: string }) {
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - clamp(progress) * circumference;
  const center = 128; // The size is 256, so center is 128

  return (
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={circumference}
      strokeDashoffset={dashOffset}
      transform={`rotate(-90 ${center} ${center})`}
    />
  );
}

export default function MacroRing({
  calories,
  calorieTarget,
  protein,
  proteinTarget,
  carbs,
  carbsTarget,
  fats,
  fatsTarget,
  title = 'Daily Intake',
  subtitle = 'Macro balance',
  className,
}: MacroRingProps) {
  const size = 256;
  const center = size / 2;
  const calorieRadius = 104;
  const proteinRadius = 82;
  const carbsRadius = 64;
  const fatsRadius = 46;

  const caloriesProgress = calorieTarget > 0 ? calories / calorieTarget : 0;
  const proteinProgress = proteinTarget > 0 ? protein / proteinTarget : 0;
  const carbsProgress = carbsTarget > 0 ? carbs / carbsTarget : 0;
  const fatsProgress = fatsTarget > 0 ? fats / fatsTarget : 0;

  return (
    <div className={cn('rounded-[28px] border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{subtitle}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{title}</h3>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Live Sync
        </span>
      </div>

      <div className="mt-5 flex items-center justify-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full overflow-visible">
            <circle cx={center} cy={center} r={calorieRadius} fill="none" stroke="rgba(148, 163, 184, 0.14)" strokeWidth={12} />
            <Ring radius={calorieRadius} strokeWidth={12} progress={caloriesProgress} color="#10B981" />

            <circle cx={center} cy={center} r={proteinRadius} fill="none" stroke="rgba(148, 163, 184, 0.12)" strokeWidth={10} />
            <Ring radius={proteinRadius} strokeWidth={10} progress={proteinProgress} color="#06B6D4" />

            <circle cx={center} cy={center} r={carbsRadius} fill="none" stroke="rgba(148, 163, 184, 0.12)" strokeWidth={10} />
            <Ring radius={carbsRadius} strokeWidth={10} progress={carbsProgress} color="#8B5CF6" />

            <circle cx={center} cy={center} r={fatsRadius} fill="none" stroke="rgba(148, 163, 184, 0.12)" strokeWidth={10} />
            <Ring radius={fatsRadius} strokeWidth={10} progress={fatsProgress} color="#F59E0B" />
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">kcal consumed</p>
            <div className="mt-1 flex items-end gap-1">
              <span className="text-3xl font-semibold tracking-tight text-white">{Math.round(calories)}</span>
              <span className="pb-1 text-xs font-medium text-slate-400">/{Math.round(calorieTarget)}</span>
            </div>
            <p className="mt-1 max-w-[8rem] text-[10px] leading-tight text-slate-400">
              {calories >= calorieTarget ? 'Budget met' : `${Math.max(0, Math.round(calorieTarget - calories))} kcal remaining`}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.08] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80">Protein</p>
          <p className="mt-1 text-lg font-semibold text-white">{Math.round(protein)}g</p>
        </div>
        <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.08] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-violet-200/80">Carbs</p>
          <p className="mt-1 text-lg font-semibold text-white">{Math.round(carbs)}g</p>
        </div>
        <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.08] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-amber-200/80">Fat</p>
          <p className="mt-1 text-lg font-semibold text-white">{Math.round(fats)}g</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.08] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/80">Target</p>
          <p className="mt-1 text-lg font-semibold text-white">{Math.round(calorieTarget)} kcal</p>
        </div>
      </div>
    </div>
  );
}
