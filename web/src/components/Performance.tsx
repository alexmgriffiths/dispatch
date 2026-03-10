import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Zap,
  Timer,
  Download,
  Flag,
  Clock,
  Loader2,
  BarChart3,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { fetchPerformanceMetrics } from '../api/client'
import type { PerformanceResponse, PerformanceMetricSeries } from '../api/client'

// ── Metric display config ──────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  startup_cold: { label: 'Cold Start', icon: <Timer className="h-4 w-4" />, color: 'text-amber-500' },
  startup_warm: { label: 'Warm Start', icon: <Zap className="h-4 w-4" />, color: 'text-emerald-500' },
  update_download: { label: 'Download Time', icon: <Download className="h-4 w-4" />, color: 'text-blue-500' },
  flag_eval: { label: 'Flag Eval Latency', icon: <Flag className="h-4 w-4" />, color: 'text-indigo-500' },
}

const CHART_COLORS: Record<string, { p50: string; p95: string; p99: string }> = {
  startup_cold: { p50: '#f59e0b', p95: '#d97706', p99: '#b45309' },
  startup_warm: { p50: '#10b981', p95: '#059669', p99: '#047857' },
  update_download: { p50: '#3b82f6', p95: '#2563eb', p99: '#1d4ed8' },
  flag_eval: { p50: '#6366f1', p95: '#4f46e5', p99: '#4338ca' },
}

// ── Component ──────────────────────────────────────────────────────────

export default function Performance() {
  const [channelFilter, setChannelFilter] = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [runtimeFilter, setRuntimeFilter] = useState('all')
  const [data, setData] = useState<PerformanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const filters: { channel?: string; platform?: string; runtimeVersion?: string } = {}
      if (channelFilter !== 'all') filters.channel = channelFilter
      if (platformFilter !== 'all') filters.platform = platformFilter
      if (runtimeFilter !== 'all') filters.runtimeVersion = runtimeFilter
      const result = await fetchPerformanceMetrics(filters)
      setData(result)
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [channelFilter, platformFilter, runtimeFilter])

  return (
    <>
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Performance</h2>
            <p className="text-sm text-muted-foreground">Startup times, download duration, and flag evaluation latency</p>
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
            <Select value={runtimeFilter} onValueChange={setRuntimeFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All versions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && initialLoad ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.metrics.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {/* Updated indicator */}
            <UpdatedAgoLabel lastUpdatedAt={data.lastUpdatedAt} />

            {/* Metric cards */}
            <div className="grid grid-cols-4 gap-4">
              {['startup_cold', 'startup_warm', 'update_download', 'flag_eval'].map((metricName) => {
                const metric = data.metrics.find((m) => m.metricName === metricName)
                const config = METRIC_CONFIG[metricName]
                return (
                  <MetricCard
                    key={metricName}
                    label={config.label}
                    icon={config.icon}
                    color={config.color}
                    metric={metric ?? null}
                  />
                )
              })}
            </div>

            {/* Timeseries charts */}
            {data.metrics.map((metric) => (
              <MetricChart key={metric.metricName} metric={metric} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Metric Card ────────────────────────────────────────────────────────

function MetricCard({ label, icon, color, metric }: {
  label: string
  icon: React.ReactNode
  color: string
  metric: PerformanceMetricSeries | null
}) {
  const latest = metric?.latest
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      {latest && latest.sampleCount > 0 ? (
        <div>
          <div className="text-3xl font-bold tracking-tight">{formatMs(latest.p50)}</div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-muted-foreground">p50</span>
            <span className="text-xs text-muted-foreground tabular-nums">p95: {formatMs(latest.p95)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">p99: {formatMs(latest.p99)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{latest.sampleCount.toLocaleString()} samples</div>
        </div>
      ) : (
        <div>
          <div className="text-2xl font-bold tracking-tight text-muted-foreground">--</div>
          <div className="text-[10px] text-muted-foreground mt-1">No data yet</div>
        </div>
      )}
    </div>
  )
}

// ── Metric Chart ───────────────────────────────────────────────────────

function MetricChart({ metric }: { metric: PerformanceMetricSeries }) {
  const config = METRIC_CONFIG[metric.metricName] ?? { label: metric.metricName, icon: null, color: 'text-primary' }
  const colors = CHART_COLORS[metric.metricName] ?? { p50: '#6366f1', p95: '#4f46e5', p99: '#4338ca' }

  // Points come in DESC order from API -- reverse for chronological display
  const chartData = [...metric.points].reverse().map((p) => ({
    time: new Date(p.bucketHour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    p50: Math.round(p.p50 * 100) / 100,
    p95: Math.round(p.p95 * 100) / 100,
    p99: Math.round(p.p99 * 100) / 100,
    samples: p.sampleCount,
  }))

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={config.color}>{config.icon}</span>
        <h3 className="text-sm font-semibold">{config.label}</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {metric.points.reduce((s, p) => s + p.sampleCount, 0).toLocaleString()} total samples
        </span>
      </div>
      {chartData.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatMs(v)} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number, name: string) => [formatMs(v), name]}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="p50"
                stroke={colors.p50}
                strokeWidth={2}
                dot={false}
                name="p50"
              />
              <Line
                type="monotone"
                dataKey="p95"
                stroke={colors.p95}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                name="p95"
              />
              <Line
                type="monotone"
                dataKey="p99"
                stroke={colors.p99}
                strokeWidth={1}
                strokeDasharray="2 2"
                dot={false}
                name="p99"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          No timeseries data available
        </div>
      )}
    </div>
  )
}

// ── Updated Ago Label ──────────────────────────────────────────────────

function UpdatedAgoLabel({ lastUpdatedAt }: { lastUpdatedAt: string | null }) {
  if (!lastUpdatedAt) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>No data yet</span>
      </div>
    )
  }
  const diff = Date.now() - new Date(lastUpdatedAt).getTime()
  const minutes = Math.floor(diff / 60000)
  const label = minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      <span>{label}</span>
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="max-w-6xl mx-auto px-12 py-20">
      <div className="grid grid-cols-2 gap-16 items-start">
        {/* Left -- Copy */}
        <div className="space-y-6 pt-8">
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            Track app performance automatically
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Performance metrics are collected automatically by the SDK: cold start, warm start,
            OTA update download duration, and flag evaluation latency. Percentiles (p50, p95, p99)
            are computed hourly and displayed here.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Install the SDK and deploy an update to start seeing data. Metrics flow in
            automatically via the health reporter -- no additional setup required.
          </p>
        </div>

        {/* Right -- Preview card */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
            <span className="font-medium text-foreground">Performance</span>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cold Start</span>
              <div className="text-lg font-bold mt-1">1.85s</div>
              <div className="text-[10px] text-muted-foreground">p50</div>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Warm Start</span>
              <div className="text-lg font-bold mt-1">420ms</div>
              <div className="text-[10px] text-muted-foreground">p50</div>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Download</span>
              <div className="text-lg font-bold mt-1">1.2s</div>
              <div className="text-[10px] text-muted-foreground">p50</div>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Flag Eval</span>
              <div className="text-lg font-bold mt-1">8ms</div>
              <div className="text-[10px] text-muted-foreground">p50</div>
            </div>
          </div>
          <div className="border-t bg-muted/30 px-5 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Metrics</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>p50 / p95 / p99</span>
              <span>Hourly timeseries</span>
              <span>Filter by channel</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Utils ──────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}
