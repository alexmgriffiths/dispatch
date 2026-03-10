import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Monitor,
  Globe,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  GitBranch,
  Flag,
  Timer,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────

interface ScreenMetric {
  name: string
  p50: number
  p95: number
  p99: number
  samples: number
  delta: number
  trend: number[] // 7 data points for sparkline
}

interface NetworkMetric {
  endpoint: string
  method: string
  p50: number
  p95: number
  p99: number
  samples: number
  errorRate: number
  delta: number
  trend: number[]
}

interface StartupMetric {
  type: 'cold' | 'warm'
  p50: number
  p95: number
  p99: number
  samples: number
  delta: number
  trend: number[]
}

interface FlagImpact {
  flagKey: string
  variations: { name: string; p50: number; p95: number; samples: number }[]
  impact: number // % difference between best and worst variation
}

interface ReleasePerf {
  version: string
  commit: string
  channel: string
  p50: number
  p95: number
  samples: number
  delta: number
}

// ── Mock Data ──────────────────────────────────────────────────────────

const MOCK_SCREENS: ScreenMetric[] = [
  { name: 'HomeScreen', p50: 245, p95: 520, p99: 890, samples: 14230, delta: -3.2, trend: [280, 270, 260, 255, 250, 248, 245] },
  { name: 'CheckoutScreen', p50: 380, p95: 780, p99: 1420, samples: 8420, delta: 12.5, trend: [320, 330, 345, 355, 360, 370, 380] },
  { name: 'ProductDetail', p50: 190, p95: 410, p99: 650, samples: 11800, delta: -1.1, trend: [195, 194, 193, 192, 191, 190, 190] },
  { name: 'SearchResults', p50: 310, p95: 680, p99: 1100, samples: 6540, delta: 5.8, trend: [285, 290, 295, 300, 302, 308, 310] },
  { name: 'ProfileScreen', p50: 150, p95: 320, p99: 480, samples: 4200, delta: -0.5, trend: [152, 151, 151, 150, 150, 150, 150] },
  { name: 'SettingsScreen', p50: 120, p95: 240, p99: 380, samples: 2100, delta: 0.2, trend: [119, 119, 120, 120, 120, 120, 120] },
  { name: 'OrderHistory', p50: 420, p95: 920, p99: 1600, samples: 3800, delta: 8.1, trend: [370, 380, 390, 395, 405, 412, 420] },
  { name: 'NotificationsScreen', p50: 180, p95: 350, p99: 560, samples: 5600, delta: -2.0, trend: [188, 186, 185, 184, 182, 181, 180] },
]

const MOCK_NETWORK: NetworkMetric[] = [
  { endpoint: '/api/products', method: 'GET', p50: 120, p95: 340, p99: 680, samples: 28400, errorRate: 0.2, delta: -1.5, trend: [125, 124, 123, 122, 121, 120, 120] },
  { endpoint: '/api/checkout', method: 'POST', p50: 450, p95: 1200, p99: 2400, samples: 8420, errorRate: 1.8, delta: 15.2, trend: [380, 390, 410, 420, 430, 440, 450] },
  { endpoint: '/api/search', method: 'GET', p50: 180, p95: 520, p99: 980, samples: 12600, errorRate: 0.1, delta: 3.4, trend: [170, 172, 174, 175, 177, 178, 180] },
  { endpoint: '/api/auth/refresh', method: 'POST', p50: 90, p95: 210, p99: 380, samples: 42000, errorRate: 0.5, delta: -0.3, trend: [91, 91, 90, 90, 90, 90, 90] },
  { endpoint: '/api/orders', method: 'GET', p50: 280, p95: 680, p99: 1200, samples: 6200, errorRate: 0.3, delta: 2.1, trend: [268, 270, 272, 274, 276, 278, 280] },
  { endpoint: '/api/notifications', method: 'GET', p50: 65, p95: 140, p99: 250, samples: 18400, errorRate: 0.0, delta: -4.2, trend: [72, 70, 69, 68, 67, 66, 65] },
]

const MOCK_STARTUP: StartupMetric[] = [
  { type: 'cold', p50: 1850, p95: 3200, p99: 4100, samples: 4200, delta: 2.4, trend: [1780, 1800, 1810, 1820, 1830, 1840, 1850] },
  { type: 'warm', p50: 420, p95: 780, p99: 1050, samples: 18600, delta: -1.8, trend: [435, 432, 428, 425, 423, 421, 420] },
]

const MOCK_FLAG_IMPACTS: FlagImpact[] = [
  {
    flagKey: 'new-checkout',
    variations: [
      { name: 'true', p50: 380, p95: 780, samples: 4210 },
      { name: 'false', p50: 220, p95: 450, samples: 4210 },
    ],
    impact: 72.7,
  },
  {
    flagKey: 'optimized-images',
    variations: [
      { name: 'true', p50: 190, p95: 410, samples: 6800 },
      { name: 'false', p50: 260, p95: 540, samples: 5000 },
    ],
    impact: -26.9,
  },
  {
    flagKey: 'new-search-algo',
    variations: [
      { name: 'v2', p50: 180, p95: 420, samples: 3200 },
      { name: 'v1', p50: 310, p95: 680, samples: 3340 },
    ],
    impact: -41.9,
  },
]

const MOCK_RELEASES: ReleasePerf[] = [
  { version: '49.0.0', commit: 'a3f1b2c', channel: 'production', p50: 265, p95: 580, samples: 8400, delta: 8.2 },
  { version: '49.0.0', commit: 'e7d42f1', channel: 'staging', p50: 310, p95: 680, samples: 3200, delta: 12.4 },
  { version: '48.2.0', commit: '7e2d9f4', channel: 'production', p50: 230, p95: 480, samples: 2630, delta: 0.0 },
]

type Tab = 'overview' | 'screens' | 'network' | 'flags'

// ── Component ──────────────────────────────────────────────────────────

export default function Performance() {
  const [days, setDays] = useState('7')
  const [channelFilter, setChannelFilter] = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [tab, setTab] = useState<Tab>('overview')

  const overallP50 = useMemo(() =>
    Math.round(MOCK_SCREENS.reduce((s, m) => s + m.p50 * m.samples, 0) / MOCK_SCREENS.reduce((s, m) => s + m.samples, 0)),
  [])
  const overallNetP50 = useMemo(() =>
    Math.round(MOCK_NETWORK.reduce((s, m) => s + m.p50 * m.samples, 0) / MOCK_NETWORK.reduce((s, m) => s + m.samples, 0)),
  [])

  const regressions = MOCK_SCREENS.filter((s) => s.delta > 5).length + MOCK_NETWORK.filter((n) => n.delta > 5).length

  return (
    <>
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Performance</h2>
            <p className="text-sm text-muted-foreground">Screen loads, network latency, startup times, and flag impact analysis</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="production">production</SelectItem>
                <SelectItem value="staging">staging</SelectItem>
                <SelectItem value="canary">canary</SelectItem>
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="ios">iOS</SelectItem>
                <SelectItem value="android">Android</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 -mb-5 relative">
          {(['overview', 'screens', 'network', 'flags'] as Tab[]).map((t) => (
            <button
              key={t}
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-t-md transition-colors relative',
                tab === t
                  ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setTab(t)}
            >
              {t === 'overview' ? 'Overview' : t === 'screens' ? 'Screens' : t === 'network' ? 'Network' : 'Flag Impact'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab
          overallP50={overallP50}
          overallNetP50={overallNetP50}
          regressions={regressions}
          screens={MOCK_SCREENS}
          network={MOCK_NETWORK}
          startup={MOCK_STARTUP}
          flagImpacts={MOCK_FLAG_IMPACTS}
          releases={MOCK_RELEASES}
          onNavigate={setTab}
        />}
        {tab === 'screens' && <ScreensTab screens={MOCK_SCREENS} />}
        {tab === 'network' && <NetworkTab network={MOCK_NETWORK} />}
        {tab === 'flags' && <FlagsTab flagImpacts={MOCK_FLAG_IMPACTS} />}
      </div>
    </>
  )
}

// ── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab({ overallP50, overallNetP50, regressions, screens, network, startup, flagImpacts, releases, onNavigate }: {
  overallP50: number
  overallNetP50: number
  regressions: number
  screens: ScreenMetric[]
  network: NetworkMetric[]
  startup: StartupMetric[]
  flagImpacts: FlagImpact[]
  releases: ReleasePerf[]
  onNavigate: (tab: Tab) => void
}) {
  return (
    <div className="space-y-6">
      {/* Top metric cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Screen Load"
          value={formatMs(overallP50)}
          sublabel="p50 weighted avg"
          delta={-1.4}
          trend={[260, 255, 252, 250, 248, 246, overallP50]}
          color="text-primary"
        />
        <MetricCard
          label="Network Latency"
          value={formatMs(overallNetP50)}
          sublabel="p50 weighted avg"
          delta={2.8}
          trend={[145, 148, 150, 152, 154, 156, overallNetP50]}
          color="text-blue-500"
        />
        <MetricCard
          label="Cold Start"
          value={formatMs(startup[0].p50)}
          sublabel="p50"
          delta={startup[0].delta}
          trend={startup[0].trend}
          color="text-amber-500"
        />
        <MetricCard
          label="Warm Start"
          value={formatMs(startup[1].p50)}
          sublabel="p50"
          delta={startup[1].delta}
          trend={startup[1].trend}
          color="text-emerald-500"
        />
      </div>

      {/* Regressions alert */}
      {regressions > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {regressions} metric{regressions > 1 ? 's' : ''} regressed more than 5% this period
            </span>
          </div>
          <button className="text-xs text-amber-700 dark:text-amber-400 font-medium hover:underline" onClick={() => onNavigate('screens')}>
            View details
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Slowest screens */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <h3 className="text-sm font-semibold">Slowest Screens</h3>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onNavigate('screens')}>View all</button>
          </div>
          <div className="divide-y">
            {[...screens].sort((a, b) => b.p50 - a.p50).slice(0, 5).map((s) => (
              <div key={s.name} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium truncate">{s.name}</span>
                    <DeltaBadge delta={s.delta} />
                  </div>
                  <span className="text-xs text-muted-foreground">{s.samples.toLocaleString()} samples</span>
                </div>
                <Sparkline data={s.trend} regressing={s.delta > 0} className="w-16 h-6 shrink-0" />
                <div className="text-right shrink-0 w-16">
                  <div className="text-sm font-bold tabular-nums">{formatMs(s.p50)}</div>
                  <div className="text-[10px] text-muted-foreground">p50</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Slowest endpoints */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <h3 className="text-sm font-semibold">Slowest Endpoints</h3>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onNavigate('network')}>View all</button>
          </div>
          <div className="divide-y">
            {[...network].sort((a, b) => b.p50 - a.p50).slice(0, 5).map((n) => (
              <div key={n.endpoint} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-mono shrink-0">{n.method}</Badge>
                    <span className="text-sm font-mono truncate">{n.endpoint}</span>
                    <DeltaBadge delta={n.delta} />
                  </div>
                  <span className="text-xs text-muted-foreground">{n.samples.toLocaleString()} reqs</span>
                </div>
                <Sparkline data={n.trend} regressing={n.delta > 0} className="w-16 h-6 shrink-0" />
                <div className="text-right shrink-0 w-16">
                  <div className="text-sm font-bold tabular-nums">{formatMs(n.p50)}</div>
                  <div className="text-[10px] text-muted-foreground">p50</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Flag impact summary */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold">Flag Impact on Performance</h3>
          </div>
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onNavigate('flags')}>View all</button>
        </div>
        <div className="divide-y">
          {flagImpacts.map((fi) => (
            <FlagImpactRow key={fi.flagKey} impact={fi} />
          ))}
        </div>
      </div>

      {/* By release */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 px-5 py-3 border-b">
          <GitBranch className="h-4 w-4 text-cyan-500" />
          <h3 className="text-sm font-semibold">Performance by Release</h3>
        </div>
        <div className="divide-y">
          {releases.map((r) => (
            <div key={`${r.version}-${r.commit}`} className="px-5 py-3 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium">v{r.version}</span>
                  <span className="text-xs font-mono text-muted-foreground">{r.commit}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{r.channel}</Badge>
                  {r.delta !== 0 && <DeltaBadge delta={r.delta} />}
                </div>
                <span className="text-xs text-muted-foreground">{r.samples.toLocaleString()} samples</span>
              </div>
              <PercentileBar p50={r.p50} p95={r.p95} maxVal={800} />
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right w-14">
                  <div className="text-sm font-bold tabular-nums">{formatMs(r.p50)}</div>
                  <div className="text-[10px] text-muted-foreground">p50</div>
                </div>
                <div className="text-right w-14">
                  <div className="text-sm text-muted-foreground tabular-nums">{formatMs(r.p95)}</div>
                  <div className="text-[10px] text-muted-foreground">p95</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Screens Tab ────────────────────────────────────────────────────────

function ScreensTab({ screens }: { screens: ScreenMetric[] }) {
  const [sort, setSort] = useState<'p50' | 'p95' | 'delta' | 'samples'>('p50')
  const sorted = useMemo(() => [...screens].sort((a, b) => {
    if (sort === 'delta') return Math.abs(b.delta) - Math.abs(a.delta)
    return b[sort] - a[sort]
  }), [screens, sort])

  const maxP95 = Math.max(...screens.map((s) => s.p95))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr,80px,100px,100px,100px,80px,60px] gap-2 px-5 py-2.5 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
          <span>Screen</span>
          <span className="text-right">Trend</span>
          <SortHeader label="p50" active={sort === 'p50'} onClick={() => setSort('p50')} />
          <SortHeader label="p95" active={sort === 'p95'} onClick={() => setSort('p95')} />
          <span className="text-right">Distribution</span>
          <SortHeader label="Samples" active={sort === 'samples'} onClick={() => setSort('samples')} />
          <SortHeader label="Change" active={sort === 'delta'} onClick={() => setSort('delta')} />
        </div>
        {/* Rows */}
        <div className="divide-y">
          {sorted.map((s) => (
            <div key={s.name} className="grid grid-cols-[1fr,80px,100px,100px,100px,80px,60px] gap-2 px-5 py-3 items-center hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono font-medium truncate">{s.name}</span>
              </div>
              <div className="flex justify-end">
                <Sparkline data={s.trend} regressing={s.delta > 0} className="w-16 h-5" />
              </div>
              <div className="text-right">
                <span className="text-sm font-bold tabular-nums">{formatMs(s.p50)}</span>
              </div>
              <div className="text-right">
                <span className="text-sm text-muted-foreground tabular-nums">{formatMs(s.p95)}</span>
              </div>
              <PercentileBar p50={s.p50} p95={s.p95} maxVal={maxP95} />
              <div className="text-right">
                <span className="text-xs text-muted-foreground tabular-nums">{s.samples.toLocaleString()}</span>
              </div>
              <div className="text-right">
                <DeltaBadge delta={s.delta} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Network Tab ────────────────────────────────────────────────────────

function NetworkTab({ network }: { network: NetworkMetric[] }) {
  const [sort, setSort] = useState<'p50' | 'p95' | 'delta' | 'samples'>('p50')
  const sorted = useMemo(() => [...network].sort((a, b) => {
    if (sort === 'delta') return Math.abs(b.delta) - Math.abs(a.delta)
    return b[sort] - a[sort]
  }), [network, sort])

  const maxP95 = Math.max(...network.map((n) => n.p95))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr,80px,100px,100px,100px,80px,60px] gap-2 px-5 py-2.5 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
          <span>Endpoint</span>
          <span className="text-right">Trend</span>
          <SortHeader label="p50" active={sort === 'p50'} onClick={() => setSort('p50')} />
          <SortHeader label="p95" active={sort === 'p95'} onClick={() => setSort('p95')} />
          <span className="text-right">Distribution</span>
          <SortHeader label="Requests" active={sort === 'samples'} onClick={() => setSort('samples')} />
          <SortHeader label="Change" active={sort === 'delta'} onClick={() => setSort('delta')} />
        </div>
        <div className="divide-y">
          {sorted.map((n) => (
            <div key={n.endpoint} className="grid grid-cols-[1fr,80px,100px,100px,100px,80px,60px] gap-2 px-5 py-3 items-center hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-mono shrink-0">{n.method}</Badge>
                <span className="text-sm font-mono truncate">{n.endpoint}</span>
                {n.errorRate > 1 && (
                  <span className="text-[10px] text-destructive font-medium shrink-0">{n.errorRate}% err</span>
                )}
              </div>
              <div className="flex justify-end">
                <Sparkline data={n.trend} regressing={n.delta > 0} className="w-16 h-5" />
              </div>
              <div className="text-right">
                <span className="text-sm font-bold tabular-nums">{formatMs(n.p50)}</span>
              </div>
              <div className="text-right">
                <span className="text-sm text-muted-foreground tabular-nums">{formatMs(n.p95)}</span>
              </div>
              <PercentileBar p50={n.p50} p95={n.p95} maxVal={maxP95} color="blue" />
              <div className="text-right">
                <span className="text-xs text-muted-foreground tabular-nums">{n.samples.toLocaleString()}</span>
              </div>
              <div className="text-right">
                <DeltaBadge delta={n.delta} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Flags Tab ──────────────────────────────────────────────────────────

function FlagsTab({ flagImpacts }: { flagImpacts: FlagImpact[] }) {
  const sorted = useMemo(() => [...flagImpacts].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)), [flagImpacts])

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Compare performance across flag variations to identify flags that are improving or degrading your app's speed.
          Impact shows the percentage difference between the fastest and slowest variation.
        </p>
      </div>

      {sorted.map((fi) => (
        <FlagImpactCard key={fi.flagKey} impact={fi} />
      ))}
    </div>
  )
}

// ── Shared Components ──────────────────────────────────────────────────

function Sparkline({ data, regressing, className }: { data: number[]; regressing: boolean; className?: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const h = 100
  const w = 100
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h * 0.8 - h * 0.1}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={regressing ? 'var(--destructive)' : 'hsl(var(--primary))'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        opacity={0.7}
      />
    </svg>
  )
}

function PercentileBar({ p50, p95, maxVal, color = 'primary' }: { p50: number; p95: number; maxVal: number; color?: 'primary' | 'blue' }) {
  const colors = color === 'blue'
    ? { bar: 'bg-blue-500', light: 'bg-blue-500/30' }
    : { bar: 'bg-primary', light: 'bg-primary/30' }

  return (
    <div className="flex items-center">
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden relative">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', colors.light)}
          style={{ width: `${Math.min((p95 / maxVal) * 100, 100)}%` }}
        />
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', colors.bar)}
          style={{ width: `${Math.min((p50 / maxVal) * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

function MetricCard({ label, value, sublabel, delta, trend, color }: {
  label: string; value: string; sublabel: string; delta: number; trend: number[]; color: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <DeltaBadge delta={delta} />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold tracking-tight">{value}</div>
          <span className="text-[10px] text-muted-foreground">{sublabel}</span>
        </div>
        <Sparkline data={trend} regressing={delta > 0} className="w-20 h-8" />
      </div>
    </div>
  )
}

function FlagImpactRow({ impact: fi }: { impact: FlagImpact }) {
  const best = fi.variations.reduce((a, b) => a.p50 < b.p50 ? a : b)
  const worst = fi.variations.reduce((a, b) => a.p50 > b.p50 ? a : b)
  const isImprovement = fi.impact < 0

  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium">{fi.flagKey}</span>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 h-4',
              isImprovement ? 'border-green-300 text-green-700 dark:border-green-800 dark:text-green-400' : 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-400',
            )}
          >
            {isImprovement ? 'Improves' : 'Degrades'} by {Math.abs(fi.impact).toFixed(0)}%
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>Best: <span className="font-mono font-medium text-foreground">{best.name}</span> ({formatMs(best.p50)})</span>
          <span>Worst: <span className="font-mono font-medium text-foreground">{worst.name}</span> ({formatMs(worst.p50)})</span>
        </div>
      </div>
      {/* Mini comparison bar */}
      <div className="w-32 shrink-0 space-y-1">
        {fi.variations.map((v) => (
          <div key={v.name} className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right shrink-0">{v.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full', v === best ? 'bg-green-500' : v === worst ? 'bg-red-400' : 'bg-muted-foreground/40')}
                style={{ width: `${(v.p50 / worst.p50) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FlagImpactCard({ impact: fi }: { impact: FlagImpact }) {
  const best = fi.variations.reduce((a, b) => a.p50 < b.p50 ? a : b)
  const worst = fi.variations.reduce((a, b) => a.p50 > b.p50 ? a : b)
  const isImprovement = fi.impact < 0

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center gap-3">
        <Flag className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-mono font-semibold">{fi.flagKey}</span>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] px-1.5 py-0 h-4',
            isImprovement ? 'border-green-300 text-green-700 dark:border-green-800 dark:text-green-400' : 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-400',
          )}
        >
          {isImprovement ? 'Improves' : 'Degrades'} performance by {Math.abs(fi.impact).toFixed(0)}%
        </Badge>
      </div>
      <div className="p-5">
        <div className="space-y-3">
          {fi.variations.map((v) => {
            const pctOfWorst = (v.p50 / worst.p50) * 100
            return (
              <div key={v.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">{v.name}</Badge>
                    {v === best && <span className="text-[10px] text-green-600 font-medium">Fastest</span>}
                    {v === worst && <span className="text-[10px] text-red-500 font-medium">Slowest</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold tabular-nums">{formatMs(v.p50)}</span>
                    <span className="text-muted-foreground tabular-nums text-xs">{formatMs(v.p95)} p95</span>
                    <span className="text-muted-foreground text-xs">{v.samples.toLocaleString()}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      v === best ? 'bg-green-500' : v === worst ? 'bg-red-400' : 'bg-muted-foreground/40',
                    )}
                    style={{ width: `${pctOfWorst}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SortHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={cn('text-right flex items-center justify-end gap-0.5', active && 'text-foreground font-semibold')}
      onClick={onClick}
    >
      {label}
      {active && <TrendingUp className="h-2.5 w-2.5" />}
    </button>
  )
}

function DeltaBadge({ delta, className }: { delta: number; className?: string }) {
  if (Math.abs(delta) < 0.5) {
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-[10px] text-muted-foreground', className)}>
        <Minus className="h-2.5 w-2.5" />
        {Math.abs(delta).toFixed(1)}%
      </span>
    )
  }
  const isRegression = delta > 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-medium',
      isRegression ? 'text-destructive' : 'text-green-600',
      className,
    )}>
      {isRegression ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}
