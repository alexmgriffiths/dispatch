import { useEffect, useMemo, useRef, useState } from 'react'
import { listUpdates, patchUpdate } from '../api/client'
import type { UpdateRecord, UpdateListParams } from '../api/client'
import UpdateDrawer from './UpdateDrawer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoTip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Plus, GitCommit, GitBranch, Search, X } from 'lucide-react'

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
      if (u.group_id) {
        const existing = groupMap.get(u.group_id)
        if (existing) existing.push(u)
        else groupMap.set(u.group_id, [u])
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
        totalDownloads: groupUpdates.reduce((s, u) => s + u.total_downloads, 0),
        uniqueDevices: groupUpdates.reduce((s, u) => s + u.unique_devices, 0),
      })
    }

    // Ungrouped — one per "group"
    for (const u of ungrouped) {
      result.push({
        groupId: null,
        updates: [u],
        totalDownloads: u.total_downloads,
        uniqueDevices: u.unique_devices,
      })
    }

    // Sort by most recent update's created_at
    result.sort((a, b) => {
      const aTime = Math.max(...a.updates.map(u => new Date(u.created_at).getTime()))
      const bTime = Math.max(...b.updates.map(u => new Date(u.created_at).getTime()))
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
        setKnownBranches([...new Set(data.map((u: UpdateRecord) => u.branch_name).filter(Boolean) as string[])])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load updates')
    } finally {
      setLoading(false)
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
      await patchUpdate(u.id, { isEnabled: !u.is_enabled })
      setUpdates((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, is_enabled: !x.is_enabled } : x))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function toggleCritical(u: UpdateRecord) {
    try {
      await patchUpdate(u.id, { isCritical: !u.is_critical })
      setUpdates((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, is_critical: !x.is_critical } : x))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  async function updateRollout(u: UpdateRecord, pct: number) {
    try {
      await patchUpdate(u.id, { rolloutPercentage: pct })
      setUpdates((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, rollout_percentage: pct } : x))
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
  function renderGroup(group: UpdateGroup, idx: number) {
    const primary = group.updates[0]
    const isMultiPlatform = group.updates.length > 1
    const allDisabled = group.updates.every(u => !u.is_enabled)
    const platforms = group.updates.map(u => u.platform)
    const mostRecentDate = group.updates.reduce((latest, u) =>
      new Date(u.created_at) > new Date(latest) ? u.created_at : latest
    , group.updates[0].created_at)

    return (
      <div
        key={group.groupId ?? primary.id}
        id={idx === 0 ? 'tour-first-release' : undefined}
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
                <span className="font-semibold text-sm">v{primary.runtime_version}</span>
                {platforms.map(p => (
                  <Badge key={p} variant={p as 'ios' | 'android'}>{p}</Badge>
                ))}
                <Badge variant={primary.channel as 'production' | 'staging' | 'canary'}>{primary.channel}</Badge>
                {primary.is_rollback && <Badge variant="rollback">rollback</Badge>}
                {group.updates.some(u => u.is_critical) && <Badge variant="critical">critical</Badge>}
                {allDisabled && <Badge variant="disabled">disabled</Badge>}
              </div>
              {primary.release_message && (
                <p className="text-sm text-foreground/80">{primary.release_message}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{timeAgo(mostRecentDate)}</span>
                <span>{group.totalDownloads.toLocaleString()} downloads</span>
                <span>{group.uniqueDevices.toLocaleString()} devices</span>
                {primary.git_commit_hash && (
                  <span className="inline-flex items-center gap-1">
                    <GitCommit className="h-3 w-3" />
                    <span className="font-mono">{primary.git_commit_hash.slice(0, 7)}</span>
                  </span>
                )}
                {primary.git_branch && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {primary.git_branch}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Per-platform rows */}
        {isMultiPlatform ? (
          <div className="border-t divide-y">
            {group.updates.map((u, uIdx) => (
              <PlatformRow
                key={u.id}
                update={u}
                isFirst={idx === 0 && uIdx === 0}
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
              isFirst={idx === 0}
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
          <Button id="tour-publish-btn" onClick={onPublish}>
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

        {loading ? (
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
          <div className="flex flex-col items-center py-16 text-center">
            <div className="text-3xl mb-3">&#9898;</div>
            <h3 className="font-semibold">{hasFilters ? 'No matching updates' : 'No updates yet'}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {hasFilters
                ? 'Try adjusting your filters or search query.'
                : 'Publish your first OTA update to get started.'}
            </p>
            {hasFilters && (
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group, idx) => renderGroup(group, idx))}
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
  isFirst,
  timeAgo,
  onToggleEnabled,
  onToggleCritical,
  onUpdateRollout,
  onClick,
  hidePlatform,
}: {
  update: UpdateRecord
  isFirst: boolean
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
        !u.is_enabled && 'opacity-60'
      )}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {!hidePlatform && <Badge variant={u.platform as 'ios' | 'android'} className="text-[10px]">{u.platform}</Badge>}
          <span className="font-mono truncate text-[11px]">{u.update_uuid}</span>
          <span>{timeAgo(u.created_at)}</span>
          <span>{u.asset_count} asset{u.asset_count !== 1 ? 's' : ''}{u.total_size > 0 ? ` (${formatSize(u.total_size)})` : ''}</span>
          <span>{u.total_downloads.toLocaleString()} dl</span>
          <span>{u.unique_devices.toLocaleString()} devices</span>
          {u.is_critical && <Badge variant="critical" className="text-[10px]">critical</Badge>}
          {!u.is_enabled && <Badge variant="disabled" className="text-[10px]">disabled</Badge>}
        </div>
      </div>

      <div
        className="flex items-center gap-4 shrink-0"
        {...(isFirst ? { id: 'tour-controls' } : {})}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5" {...(isFirst ? { id: 'tour-active-toggle' } : {})}>
          <span className="text-[11px] text-muted-foreground">Active</span>
          <InfoTip>When disabled, devices will skip this update and receive the next active one instead.</InfoTip>
          <Switch checked={u.is_enabled} onCheckedChange={() => onToggleEnabled(u)} />
        </div>
        <div className="flex items-center gap-1.5" {...(isFirst ? { id: 'tour-critical-toggle' } : {})}>
          <span className="text-[11px] text-muted-foreground">Critical</span>
          <InfoTip>Forces an immediate app reload instead of waiting for the next cold start. Use for security or data-loss fixes.</InfoTip>
          <Switch checked={u.is_critical} onCheckedChange={() => onToggleCritical(u)} />
        </div>
        <div className="flex items-center gap-1.5" {...(isFirst ? { id: 'tour-rollout-slider' } : {})}>
          <span className="text-[11px] text-muted-foreground">Rollout</span>
          <InfoTip>Percentage of devices that will receive this update. Uses deterministic bucketing so each device always gets a consistent result.</InfoTip>
          <div className="flex items-center gap-1.5 w-24">
            <Slider
              value={[u.rollout_percentage]}
              max={100}
              step={1}
              onValueChange={([val]) => onUpdateRollout(u, val)}
            />
            <span className="text-[11px] font-medium w-7 text-right">{u.rollout_percentage}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
