
import { NavLink, Outlet } from 'react-router-dom';
import { Activity, LayoutDashboard, ShieldAlert, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

const tabs = [
  { name: 'Daily Log', href: '/', icon: LayoutDashboard },
  { name: 'Analytics', href: '/analytics', icon: Activity },
  { name: 'Retrospective', href: '/retrospective', icon: Sparkles },
  { name: 'Audit Trail', href: '/audit', icon: ShieldAlert },
];

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 shadow-lg shadow-emerald-500/10">
            <Activity className="h-6 w-6 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Pulse<span className="text-emerald-300">AI</span>
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Health & AI Agent Portal
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Live Sync
          </div>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            GPT-5.4 mini
          </div>
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-sm font-semibold text-white">
              TU
            </div>
            <div>
              <p className="text-sm font-medium text-white">Test User</p>
              <p className="text-xs text-slate-500">TEST_USER_001</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function TabNavigation() {
  return (
    <div className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap gap-2 py-4" aria-label="Tabs">
          {tabs.map((tab) => (
            <NavLink
              key={tab.name}
              to={tab.href}
              className={({ isActive }) =>
                cn(
                  'group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200',
                  isActive
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200 shadow-lg shadow-emerald-500/10'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon className={cn('h-4 w-4', isActive ? 'text-emerald-300' : 'text-slate-400 group-hover:text-white')} />
                  {tab.name}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(8,145,178,0.16),transparent_32%),radial-gradient(circle_at_bottom,rgba(139,92,246,0.12),transparent_30%)]" />
      <Header />
      <TabNavigation />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
