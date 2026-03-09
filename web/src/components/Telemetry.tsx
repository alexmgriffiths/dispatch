import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Flag,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import {
  getTelemetryTimeseries,
  getTelemetryFlagImpacts,
  getTelemetryEvents,
} from '../api/client'
import type {
  TelemetryDailyPoint,
  TelemetryFlagImpact,
  TelemetryEvent,
} from '../api/client'

// ── Component ────────────────────────────────────────────────────────────

export default function Telemetry({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [days, setDays] = useState('14')
  const [timeseries, setTimeseries] = useState<TelemetryDailyPoint[]>([])
  const [impacts, setImpacts] = useState<TelemetryFlagImpact[]>([])
  const [events, setEvents] = useState<TelemetryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFlag, setSelectedFlag] = useState<string>('all')
  const [selectedChannel, setSelectedChannel] = useState<string>('all')

  async function loadData() {
    setLoading(true)
    try {
      const channelOpt = selectedChannel !== 'all' ? selectedChannel : undefined
      const flagOpt = selectedFlag !== 'all' ? selectedFlag : undefined
      const [ts, fi, ev] = await Promise.all([
        getTelemetryTimeseries({ days: Number(days), channel: channelOpt, flagKey: flagOpt }),
        getTelemetryFlagImpacts({ channel: channelOpt, flagKey: flagOpt }),
        getTelemetryEvents({ days: Number(days), flagKey: flagOpt }),
      ])
      setTimeseries(ts)
      setImpacts(fi)
      setEvents(ev)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [days, selectedFlag, selectedChannel])

  const filteredEvents = events.filter((ev) => {
    if (selectedFlag !== 'all' && ev.linkedFlag?.key !== selectedFlag) return false
    return true
  })

  // Summary stats
  const totalDevices = impacts.reduce((s, fi) => s + fi.devices, 0)
  const avgErrorRate = impacts.length > 0
    ? impacts.reduce((s, fi) => s + fi.errorRate * fi.devices, 0) / totalDevices
    : 0
  const avgCrashFree = impacts.length > 0
    ? impacts.reduce((s, fi) => s + fi.crashFree * fi.devices, 0) / totalDevices
    : 0
  const activeIssues = filteredEvents.filter((e) => e.status !== 'healthy').length

  const uniqueFlags = [...new Set(impacts.map((fi) => fi.flagKey))]
  const uniqueChannels = [...new Set(impacts.map((fi) => fi.channel))]

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Telemetry</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cross-dimensional health metrics across flags, updates, and devices
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedChannel} onValueChange={setSelectedChannel}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                {uniqueChannels.map((ch) => (
                  <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedFlag} onValueChange={setSelectedFlag}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All flags</SelectItem>
                {uniqueFlags.map((fk) => (
                  <SelectItem key={fk} value={fk}>{fk}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ── Summary cards ──────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard
              label="Devices tracked"
              value={totalDevices.toLocaleString()}
              icon={<Activity className="h-4 w-4" />}
            />
            <SummaryCard
              label="Weighted error rate"
              value={`${avgErrorRate.toFixed(2)}%`}
              icon={<AlertTriangle className="h-4 w-4" />}
              alert={avgErrorRate > 1}
            />
            <SummaryCard
              label="Crash-free rate"
              value={`${avgCrashFree.toFixed(2)}%`}
              icon={<TrendingUp className="h-4 w-4" />}
              good={avgCrashFree >= 99.5}
            />
            <SummaryCard
              label="Active issues"
              value={String(activeIssues)}
              icon={<AlertTriangle className="h-4 w-4" />}
              alert={activeIssues > 0}
            />
          </div>

          {/* ── Health timeseries ──────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border bg-card p-5">
              <h3 className="text-sm font-medium mb-4">Error rate over time</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: number) => [`${v}%`, 'Error rate']}
                    />
                    <Area type="monotone" dataKey="errorRate" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-5">
              <h3 className="text-sm font-medium mb-4">Flag evaluations over time</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeseries}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: number) => [v.toLocaleString(), 'Evaluations']}
                    />
                    <Bar dataKey="flagEvals" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Correlated events ──────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Correlated events</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Anomalies automatically attributed to specific flag variations and update versions
            </p>
            <div className="space-y-2">
              {filteredEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} />
              ))}
              {filteredEvents.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No events match the current filters.</p>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Flag × Update impact matrix ──────────────── */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Flag impact by update</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Health metrics broken down by flag variation and update version — see exactly where issues are concentrated
            </p>
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Flag / Variation</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Update</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Channel</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Devices</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Error rate</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Crash-free</th>
                  </tr>
                </thead>
                <tbody>
                  {impacts.map((fi, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <button
                              className="font-medium hover:underline text-left"
                              onClick={() => onNavigate?.(`flags:${fi.flagKey}`)}
                            >
                              {fi.flagName}
                            </button>
                            <span className="ml-2 text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{fi.variationName}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono text-xs">{fi.runtimeVersion}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{fi.channel}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fi.devices.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={cn('font-mono text-xs', fi.errorRate > 1 ? 'text-destructive font-medium' : '')}>{fi.errorRate}%</span>
                          <DeltaBadge value={fi.errorRateDelta} suffix="%" invert />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-mono text-xs', fi.crashFree < 99 ? 'text-destructive font-medium' : '')}>{fi.crashFree}%</span>
                      </td>
                    </tr>
                  ))}
                  {impacts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No data matches the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, alert, good }: {
  label: string
  value: string
  icon: React.ReactNode
  alert?: boolean
  good?: boolean
}) {
  return (
    <div className={cn(
      'rounded-lg border bg-card p-4',
      alert && 'border-destructive/30',
      good && 'border-green-500/30',
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className={cn('text-muted-foreground', alert && 'text-destructive', good && 'text-green-500')}>{icon}</span>
      </div>
      <span className={cn('text-2xl font-bold', alert && 'text-destructive', good && 'text-green-600')}>{value}</span>
    </div>
  )
}

function DeltaBadge({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (value === 0) return <Minus className="h-3 w-3 text-muted-foreground" />

  const isPositive = value > 0
  // For error rate, positive delta is bad (invert=true). For session duration, positive is good.
  const isGood = invert ? !isPositive : isPositive

  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-medium',
      isGood ? 'text-green-600' : 'text-destructive',
    )}>
      {isPositive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {isPositive ? '+' : ''}{value}{suffix}
    </span>
  )
}

function EventCard({ event }: { event: TelemetryEvent }) {
  const severityStyles = {
    critical: 'border-destructive/40 bg-destructive/5',
    warning: 'border-amber-500/40 bg-amber-500/5',
    info: 'border-border',
  }

  const statusStyles = {
    incident: 'bg-destructive text-white',
    degraded: 'bg-amber-500 text-white',
    healthy: 'bg-muted text-muted-foreground',
  }

  const typeIcons = {
    crash_spike: <AlertTriangle className="h-4 w-4 text-destructive" />,
    error_spike: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    latency_spike: <Activity className="h-4 w-4 text-amber-500" />,
    adoption_drop: <TrendingDown className="h-4 w-4 text-muted-foreground" />,
  }

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className={cn('rounded-lg border p-4', severityStyles[event.severity])}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{typeIcons[event.type]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{event.title}</span>
            <Badge className={cn('text-[10px] px-1.5 py-0 h-4', statusStyles[event.status])}>
              {event.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{event.description}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{timeAgo(event.timestamp)}</span>
            <span>{event.affectedDevices.toLocaleString()} devices</span>
            {event.linkedFlag && (
              <span className="inline-flex items-center gap-1">
                <Flag className="h-3 w-3" />
                <span className="font-mono">{event.linkedFlag.key} = {event.linkedFlag.variation}</span>
              </span>
            )}
            {event.linkedUpdate && (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                <span className="font-mono">{event.linkedUpdate.runtimeVersion}</span>
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </div>
  )
}
