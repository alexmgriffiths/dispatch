import { useEffect, useMemo, useState } from 'react'
import { getAdoption } from '../api/client'
import type { AdoptionResponse, DeviceCurrentUpdate } from '../api/client'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export default function Adoption() {
  const [data, setData] = useState<AdoptionResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState('30')

  useEffect(() => {
    loadData()
  }, [days])

  async function loadData() {
    try {
      setLoading(true)
      setError('')
      const res = await getAdoption({ days: Number(days) })
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load adoption data')
    } finally {
      setLoading(false)
    }
  }

  const totalDevices = useMemo(() => {
    if (!data) return 0
    return data.currentAdoption.reduce((s, u) => s + u.deviceCount, 0)
  }, [data])

  // Aggregate timeseries by day (total across all updates)
  const dailyTotals = useMemo(() => {
    if (!data) return []
    const byDay = new Map<string, { downloads: number; devices: number }>()
    for (const b of data.timeseries) {
      const day = b.bucketTime.split('T')[0]
      const existing = byDay.get(day) || { downloads: 0, devices: 0 }
      existing.downloads += b.downloads
      existing.devices += b.uniqueDevices
      byDay.set(day, existing)
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v }))
  }, [data])

  const maxDownloads = useMemo(() => {
    return Math.max(1, ...dailyTotals.map((d) => d.downloads))
  }, [dailyTotals])

  return (
    <>
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Adoption</h2>
            <p className="text-sm text-muted-foreground">Track device adoption and update distribution</p>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
            <div>
              <Skeleton className="h-4 w-40 mb-3" />
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-end gap-px" style={{ height: 160 }}>
                  {[...Array(30)].map((_, i) => (
                    <Skeleton
                      key={i}
                      className="flex-1 rounded-t-sm"
                      style={{ height: `${20 + Math.random() * 70}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Skeleton className="h-4 w-48 mb-3" />
              <Skeleton className="h-8 w-full rounded-lg mb-2" />
              <div className="rounded-xl border bg-card divide-y">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <Skeleton className="h-3 w-3 rounded-sm" />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex gap-1.5">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-20 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <div className="text-right space-y-1">
                      <Skeleton className="h-4 w-12 ml-auto" />
                      <Skeleton className="h-3 w-8 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : !data ? null : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Total Active Devices" value={totalDevices.toLocaleString()} />
              <StatCard label="Updates Tracked" value={String(data.currentAdoption.length)} />
              <StatCard
                label={`Downloads (${days}d)`}
                value={dailyTotals.reduce((s, d) => s + d.downloads, 0).toLocaleString()}
              />
            </div>

            {/* Downloads chart */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Downloads Over Time</h3>
              <div className="rounded-xl border bg-card p-4">
                {dailyTotals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No download data yet</p>
                ) : (
                  <div className="flex items-end gap-px" style={{ height: 160 }}>
                    {dailyTotals.map((d) => {
                      const pct = (d.downloads / maxDownloads) * 100
                      return (
                        <div
                          key={d.day}
                          className="flex-1 group relative h-full flex items-end"
                        >
                          <div
                            className="bg-primary/80 rounded-t-sm hover:bg-primary transition-colors w-full relative"
                            style={{ height: `${Math.max(pct, 1)}%` }}
                          >
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                              {d.downloads.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {dailyTotals.length > 0 && (
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{formatShortDate(dailyTotals[0].day)}</span>
                    <span className="text-[10px] text-muted-foreground">{formatShortDate(dailyTotals[dailyTotals.length - 1].day)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Current adoption breakdown */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Current Device Distribution</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Which update each device last downloaded (their current running version)
              </p>

              {data.currentAdoption.length === 0 ? (
                <div className="rounded-xl border bg-card p-8 text-center">
                  <p className="text-sm text-muted-foreground">No device data yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Stacked bar */}
                  <div className="rounded-lg overflow-hidden flex h-8">
                    {data.currentAdoption.map((u, i) => (
                      <div
                        key={u.updateId}
                        className={cn('transition-all', BAR_COLORS[i % BAR_COLORS.length])}
                        style={{ width: `${(u.deviceCount / totalDevices) * 100}%` }}
                        title={`v${u.runtimeVersion} — ${u.deviceCount.toLocaleString()} devices (${((u.deviceCount / totalDevices) * 100).toFixed(1)}%)`}
                      />
                    ))}
                  </div>

                  {/* Legend / table */}
                  <div className="rounded-xl border bg-card divide-y">
                    {data.currentAdoption.map((u, i) => (
                      <AdoptionRow
                        key={u.updateId}
                        update={u}
                        totalDevices={totalDevices}
                        colorClass={BAR_COLORS[i % BAR_COLORS.length]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

const BAR_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
]

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

function AdoptionRow({
  update: u,
  totalDevices,
  colorClass,
}: {
  update: DeviceCurrentUpdate
  totalDevices: number
  colorClass: string
}) {
  const pct = totalDevices > 0 ? ((u.deviceCount / totalDevices) * 100) : 0

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className={cn('h-3 w-3 rounded-sm shrink-0', colorClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-medium">v{u.runtimeVersion}</span>
          <Badge variant={u.channel as 'production' | 'staging' | 'canary'} className="text-[10px]">{u.channel}</Badge>
          {u.branchName && <Badge variant="group" className="text-[10px]">{u.branchName}</Badge>}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{u.updateUuid}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold">{u.deviceCount.toLocaleString()}</div>
        <div className="text-[11px] text-muted-foreground">{pct.toFixed(1)}%</div>
      </div>
    </div>
  )
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
