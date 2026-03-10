import { useEffect, useMemo, useRef, useState } from 'react'
import { listUpdates, patchUpdate } from '../api/client'
import type { UpdateRecord, UpdateListParams } from '../api/client'
import UpdateDrawer from './UpdateDrawer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PlatformBadge } from '@/components/ui/platform-badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoTip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Plus, GitCommit, GitBranch, Search, X, Upload, LayoutGrid, Rocket } from 'lucide-react'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

interface Props {
  onPublish: () => void
}

interface UpdateGroup {
  groupId: string | null
  updates: UpdateRecord[]
  // Aggregated from all updates in the group
  totalDownloads: number
  uniqueDevices: number
}

export default function UpdatesList({ onPublish }: Props) {
  const [updates, setUpdates] = useState<UpdateRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateRecord | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [knownChannels, setKnownChannels] = useState<string[]>([])
  const [knownBranches, setKnownBranches] = useState<string[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const hasFilters = search || platformFilter || channelFilter || branchFilter

  useEffect(() => {
    loadUpdates()
  }, [platformFilter, channelFilter, branchFilter])

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadUpdates(), 300)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const groups = useMemo<UpdateGroup[]>(() => {
    const groupMap = new Map<string, UpdateRecord[]>()
    const ungrouped: UpdateRecord[] = []

    for (const u of updates) {
      if (u.groupId) {
        const existing = groupMap.get(u.groupId)
        if (existing) existing.push(u)
        else groupMap.set(u.groupId, [u])
      } else {
        ungrouped.push(u)
      }
    }

    const result: UpdateGroup[] = []

    // Grouped updates — use earliest created_at for sort order
    for (const [groupId, groupUpdates] of groupMap) {
      result.push({
        groupId,
        updates: groupUpdates,
        totalDownloads: groupUpdates.reduce((s, u) => s + u.totalDownloads, 0),
        uniqueDevices: groupUpdates.reduce((s, u) => s + u.uniqueDevices, 0),
      })
    }

    // Ungrouped — one per "group"
    for (const u of ungrouped) {
      result.push({
        groupId: null,
        updates: [u],
        totalDownloads: u.totalDownloads,
        uniqueDevices: u.uniqueDevices,
      })
    }

    // Sort by most recent update's created_at
    result.sort((a, b) => {
      const aTime = Math.max(...a.updates.map(u => new Date(u.createdAt).getTime()))
      const bTime = Math.max(...b.updates.map(u => new Date(u.createdAt).getTime()))
      return bTime - aTime
    })

    return result
  }, [updates])

  async function loadUpdates() {
    try {
      setLoading(true)
      setError('')
      const params: UpdateListParams = {}
      if (search) params.search = search
      if (platformFilter) params.platform = platformFilter
      if (channelFilter) params.channel = channelFilter
      if (branchFilter) params.branch = branchFilter
      const data = await listUpdates(params)
      setUpdates(data)
      // Populate filter options from unfiltered results
      if (!hasFilters) {
        setKnownChannels([...new Set(data.map((u: UpdateRecord) => u.channel))])
        setKnownBranches([...new Set(data.map((u: UpdateRecord) => u.branchName).filter(Boolean) as string[])])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load updates')
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setPlatformFilter('')
    setChannelFilter('')
    setBranchFilter('')
  }

  async function toggleEnabled(u: UpdateRecord) {
    try {
      await patchUpdate(u.id, { isEnabled: !u.isEnabled })
      setUpdates((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, isEnabled: !x.isEnabled } : x))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function toggleCritical(u: UpdateRecord) {
    try {
      await patchUpdate(u.id, { isCritical: !u.isCritical })
      setUpdates((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, isCritical: !x.isCritical } : x))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function updateRollout(u: UpdateRecord, pct: number) {
    try {
      await patchUpdate(u.id, { rolloutPercentage: pct })
      setUpdates((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, rolloutPercentage: pct } : x))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  // For a group, use the first update as the "primary" for shared fields
  function renderGroup(group: UpdateGroup) {
    const primary = group.updates[0]
    const isMultiPlatform = group.updates.length > 1
    const allDisabled = group.updates.every(u => !u.isEnabled)
    const platforms = group.updates.map(u => u.platform)
    const mostRecentDate = group.updates.reduce((latest, u) =>
      new Date(u.createdAt) > new Date(latest) ? u.createdAt : latest
    , group.updates[0].createdAt)

    return (
      <div
        key={group.groupId ?? primary.id}
        className={cn(
          'rounded-xl border bg-card transition-colors',
          allDisabled && 'opacity-60'
        )}
      >
        {/* Group header — shared info */}
        <div className="p-4 cursor-pointer hover:bg-accent/30 transition-colors rounded-t-xl"
          onClick={() => setSelectedUpdate(primary)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-sm">v{primary.runtimeVersion}</span>
                {platforms.map(p => (
                  <PlatformBadge key={p} platform={p} />
                ))}
                <Badge variant={primary.channel as 'production' | 'staging' | 'canary'}>{primary.channel}</Badge>
                {primary.isRollback && <Badge variant="rollback">rollback</Badge>}
                {group.updates.some(u => u.isCritical) && <Badge variant="critical">critical</Badge>}
                {allDisabled && <Badge variant="disabled">disabled</Badge>}
              </div>
              {primary.releaseMessage && (
                <p className="text-sm text-foreground/80">{primary.releaseMessage}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{timeAgo(mostRecentDate)}</span>
                <span>{group.totalDownloads.toLocaleString()} downloads</span>
                <span>{group.uniqueDevices.toLocaleString()} devices</span>
                {primary.gitCommitHash && (
                  <span className="inline-flex items-center gap-1">
                    <GitCommit className="h-3 w-3" />
                    <span className="font-mono">{primary.gitCommitHash.slice(0, 7)}</span>
                  </span>
                )}
                {primary.gitBranch && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {primary.gitBranch}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Per-platform rows */}
        {isMultiPlatform ? (
          <div className="border-t divide-y">
            {group.updates.map((u) => (
              <PlatformRow
                key={u.id}
                update={u}
                timeAgo={timeAgo}
                onToggleEnabled={toggleEnabled}
                onToggleCritical={toggleCritical}
                onUpdateRollout={updateRollout}
                onClick={() => setSelectedUpdate(u)}
              />
            ))}
          </div>
        ) : (
          <div className="border-t">
            <PlatformRow
              update={primary}
              timeAgo={timeAgo}
              onToggleEnabled={toggleEnabled}
              onToggleCritical={toggleCritical}
              onUpdateRollout={updateRollout}
              onClick={() => setSelectedUpdate(primary)}
              hidePlatform
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Releases</h2>
            <p className="text-sm text-muted-foreground">Manage OTA updates across channels and platforms</p>
          </div>
          <Button onClick={onPublish}>
            <Plus className="h-4 w-4" />
            Publish update
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by message, commit, UUID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={platformFilter || 'all'} onValueChange={(v) => setPlatformFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-28 h-9 text-sm">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="ios">iOS</SelectItem>
              <SelectItem value="android">Android</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter || 'all'} onValueChange={(v) => setChannelFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {knownChannels.map(ch => (
                <SelectItem key={ch} value={ch}>{ch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branchFilter || 'all'} onValueChange={(v) => setBranchFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {knownBranches.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-3">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {loading && initialLoad ? null : loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                    <div className="flex gap-3">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3 flex items-center justify-between">
                  <div className="flex gap-2">
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <div className="flex gap-4">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : updates.length === 0 ? (
          hasFilters ? (
            <div className="flex flex-col items-center py-16 text-center">
              <h3 className="font-semibold">No matching releases</h3>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search query.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <ReleasesEmptyState onPublish={onPublish} />
          )
        ) : (
          <div className="space-y-3">
            {groups.map((group) => renderGroup(group))}
          </div>
        )}
      </div>

      <UpdateDrawer
        update={selectedUpdate}
        onClose={() => setSelectedUpdate(null)}
        onRefresh={loadUpdates}
      />
    </>
  )
}

function PlatformRow({
  update: u,
  timeAgo,
  onToggleEnabled,
  onToggleCritical,
  onUpdateRollout,
  onClick,
  hidePlatform,
}: {
  update: UpdateRecord
  timeAgo: (d: string) => string
  onToggleEnabled: (u: UpdateRecord) => void
  onToggleCritical: (u: UpdateRecord) => void
  onUpdateRollout: (u: UpdateRecord, pct: number) => void
  onClick: () => void
  hidePlatform?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors',
        !u.isEnabled && 'opacity-60'
      )}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {!hidePlatform && <PlatformBadge platform={u.platform} className="text-[10px]" />}
          <span className="font-mono truncate text-[11px]">{u.updateUuid}</span>
          <span>{timeAgo(u.createdAt)}</span>
          <span>{u.assetCount} asset{u.assetCount !== 1 ? 's' : ''}{u.totalSize > 0 ? ` (${formatSize(u.totalSize)})` : ''}</span>
          <span>{u.totalDownloads.toLocaleString()} dl</span>
          <span>{u.uniqueDevices.toLocaleString()} devices</span>
          {u.isCritical && <Badge variant="critical" className="text-[10px]">critical</Badge>}
          {!u.isEnabled && <Badge variant="disabled" className="text-[10px]">disabled</Badge>}
        </div>
      </div>

      <div
        className="flex items-center gap-4 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Active</span>
          <InfoTip>When disabled, devices will skip this update and receive the next active one instead.</InfoTip>
          <Switch checked={u.isEnabled} onCheckedChange={() => onToggleEnabled(u)} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Critical</span>
          <InfoTip>Forces an immediate app reload instead of waiting for the next cold start. Use for security or data-loss fixes.</InfoTip>
          <Switch checked={u.isCritical} onCheckedChange={() => onToggleCritical(u)} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Rollout</span>
          <InfoTip>Percentage of devices that will receive this update. Uses deterministic bucketing so each device always gets a consistent result.</InfoTip>
          <div className="flex items-center gap-1.5 w-24">
            <Slider
              value={[u.rolloutPercentage]}
              max={100}
              step={1}
              onValueChange={([val]) => onUpdateRollout(u, val)}
            />
            <span className="text-[11px] font-medium w-7 text-right">{u.rolloutPercentage}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReleasesEmptyState({ onPublish }: { onPublish: () => void }) {
  return (
    <div className="max-w-6xl mx-auto px-12 py-20">
      <div className="grid grid-cols-2 gap-16 items-start">
        {/* Left — Copy */}
        <div className="space-y-6 pt-8">
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            Ship OTA updates instantly
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Releases are over-the-air updates delivered directly to your users' devices without
            going through the app store. Push bug fixes, content changes, and new features in
            seconds instead of days.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Each release targets a channel (e.g. production, staging) and can be rolled out
            gradually with percentage-based controls. Updates are signed, verified, and
            downloaded in the background.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Button size="lg" onClick={onPublish}>
              <Upload className="mr-2 h-4 w-4" /> Publish your first update
            </Button>
          </div>
        </div>

        {/* Right — Preview card */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Mini header */}
          <div className="border-b px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <LayoutGrid className="h-4 w-4" />
            <span className="font-medium text-foreground">Releases</span>
            <span className="ml-auto text-xs">2 releases</span>
          </div>

          {/* Mock release rows */}
          <div className="divide-y">
            <div className="px-5 py-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <Rocket className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-medium">Fix checkout crash on Android</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">production</Badge>
                <span className="inline-flex items-center gap-1"><GitBranch className="h-2.5 w-2.5" /> main</span>
                <span className="font-mono">a3f1b2c</span>
                <span>2m ago</span>
              </div>
              <div className="ml-5 mt-1 flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
                </div>
                <span className="text-[10px] text-muted-foreground">100%</span>
              </div>
            </div>

            <div className="px-5 py-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <Rocket className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-medium">New onboarding flow</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">staging</Badge>
                <span className="inline-flex items-center gap-1"><GitBranch className="h-2.5 w-2.5" /> feature/onboarding</span>
                <span className="font-mono">e7d42f1</span>
                <span>1h ago</span>
              </div>
              <div className="ml-5 mt-1 flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: '25%' }} />
                </div>
                <span className="text-[10px] text-muted-foreground">25%</span>
              </div>
            </div>
          </div>

          {/* Summary footer */}
          <div className="border-t bg-muted/30 px-5 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Features</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Percentage rollouts</span>
              <span>Channel targeting</span>
              <span>Instant rollback</span>
              <span>Code signing</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
