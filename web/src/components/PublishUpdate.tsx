import { useEffect, useRef, useState } from 'react'
import { listBuilds, listChannels, listFlags, listRolloutPolicies, publishBuild } from '../api/client'
import type { BuildRecord, ChannelRecord, RolloutPolicyRecord } from '../api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PlatformBadge } from '@/components/ui/platform-badge'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoTip } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { GitBranch, Upload, Rocket, ArrowRight, Flag, Search, X, Check, ChevronsUpDown, Package, AlertTriangle } from 'lucide-react'

const USE_MOCK = import.meta.env.VITE_MOCK === 'true'

interface FlagVariation {
  id: number
  name: string | null
  value: unknown
}

interface FlagEnvSetting {
  channelName: string
  enabled: boolean
  defaultValue: unknown
}

interface AvailableFlag {
  id: number
  key: string
  name: string
  flagType: 'boolean' | 'string' | 'number' | 'json'
  enabled: boolean
  rolloutPercentage: number // 100 = fully on/off, <100 = partial targeting
  variations: FlagVariation[]
  defaultValue: unknown
  envSettings: FlagEnvSetting[]
}

interface FlagTarget {
  enabled: boolean
  variationId: number | null // which variation to serve (null = use default)
}

interface AvailablePolicy {
  id: number
  name: string
  channel: string
  stages: number[]
}

const MOCK_FLAGS: AvailableFlag[] = USE_MOCK ? [
  { id: 1, key: 'new-checkout-flow', name: 'New Checkout Flow', flagType: 'boolean', enabled: true, rolloutPercentage: 100, variations: [{ id: 1, name: 'On', value: true }, { id: 2, name: 'Off', value: false }], defaultValue: false, envSettings: [{ channelName: 'production', enabled: true, defaultValue: false }, { channelName: 'staging', enabled: true, defaultValue: false }] },
  { id: 2, key: 'redesigned-profile', name: 'Redesigned Profile', flagType: 'boolean', enabled: true, rolloutPercentage: 50, variations: [{ id: 3, name: 'On', value: true }, { id: 4, name: 'Off', value: false }], defaultValue: false, envSettings: [{ channelName: 'production', enabled: true, defaultValue: false }, { channelName: 'staging', enabled: true, defaultValue: true }] },
  { id: 3, key: 'checkout-layout', name: 'Checkout Layout', flagType: 'string', enabled: true, rolloutPercentage: 100, variations: [{ id: 5, name: 'Single Page', value: 'single-page' }, { id: 6, name: 'Multi Step', value: 'multi-step' }, { id: 7, name: 'Accordion', value: 'accordion' }], defaultValue: 'multi-step', envSettings: [{ channelName: 'production', enabled: true, defaultValue: 'multi-step' }] },
  { id: 4, key: 'max-cart-items', name: 'Max Cart Items', flagType: 'number', enabled: true, rolloutPercentage: 100, variations: [{ id: 8, name: 'Default', value: 10 }, { id: 9, name: 'Extended', value: 50 }, { id: 10, name: 'Unlimited', value: 999 }], defaultValue: 10, envSettings: [{ channelName: 'production', enabled: true, defaultValue: 10 }] },
  { id: 5, key: 'social-sharing', name: 'Social Sharing', flagType: 'boolean', enabled: false, rolloutPercentage: 100, variations: [{ id: 11, name: 'On', value: true }, { id: 12, name: 'Off', value: false }], defaultValue: false, envSettings: [{ channelName: 'production', enabled: false, defaultValue: false }] },
  { id: 6, key: 'biometric-login', name: 'Biometric Login', flagType: 'boolean', enabled: true, rolloutPercentage: 25, variations: [{ id: 13, name: 'On', value: true }, { id: 14, name: 'Off', value: false }], defaultValue: false, envSettings: [{ channelName: 'production', enabled: true, defaultValue: false }, { channelName: 'staging', enabled: false, defaultValue: false }] },
] : []

const MOCK_POLICIES: AvailablePolicy[] = USE_MOCK ? [
  { id: 1, name: 'Safe Production Rollout', channel: 'production', stages: [5, 25, 50, 100] },
  { id: 2, name: 'Fast Staging Rollout', channel: 'staging', stages: [50, 100] },
  { id: 3, name: 'Canary Release', channel: 'canary', stages: [1, 10, 50, 100] },
] : []

interface Props {
  preselectedBuildId: number | null
  onPublished: () => void
}

export default function PublishUpdate({ preselectedBuildId, onPublished }: Props) {
  const [builds, setBuilds] = useState<BuildRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [selectedBuildIds, setSelectedBuildIds] = useState<Set<number>>(
    () => preselectedBuildId ? new Set([preselectedBuildId]) : new Set()
  )
  const [availableChannels, setAvailableChannels] = useState<ChannelRecord[]>([])
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set(['production']))
  const [rolloutPercentage, setRolloutPercentage] = useState(100)
  const [isCritical, setIsCritical] = useState(false)
  const [releaseMessage, setReleaseMessage] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [linkedFlags, setLinkedFlags] = useState<Map<number, FlagTarget>>(new Map())
  const [flagSearchOpen, setFlagSearchOpen] = useState(false)
  const [flagSearch, setFlagSearch] = useState('')
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null)
  const [policySearchOpen, setPolicySearchOpen] = useState(false)
  const [policySearch, setPolicySearch] = useState('')
  const [availableFlags, setAvailableFlags] = useState<AvailableFlag[]>(MOCK_FLAGS)
  const [availablePolicies, setAvailablePolicies] = useState<AvailablePolicy[]>(USE_MOCK ? MOCK_POLICIES : [])
  const flagInputRef = useRef<HTMLInputElement>(null)
  const policyInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'select' | 'configure'>(preselectedBuildId ? 'configure' : 'select')

  useEffect(() => {
    loadBuilds()
    listChannels().then(setAvailableChannels).catch(() => {})
    if (!USE_MOCK) {
      listFlags().then(flags => {
        setAvailableFlags(flags.map(f => ({
          id: f.id,
          key: f.key,
          name: f.name,
          flagType: f.flagType as AvailableFlag['flagType'],
          enabled: f.enabled,
          rolloutPercentage: 100,
          variations: f.variations.map(v => ({ id: v.id, name: v.name, value: v.value })),
          defaultValue: f.defaultValue,
          envSettings: f.envSettings.map(s => ({ channelName: s.channelName, enabled: s.enabled, defaultValue: s.defaultValue })),
        })))
      }).catch(() => {})
      listRolloutPolicies().then(policies => {
        setAvailablePolicies(policies.map(p => ({
          id: p.id,
          name: p.name,
          channel: p.channel,
          stages: p.stages.map(s => s.percentage),
        })))
      }).catch(() => {})
    }
  }, [])

  async function loadBuilds() {
    try {
      setLoading(true)
      const data = await listBuilds()
      setBuilds(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load builds')
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }

  function toggleBuild(id: number) {
    setSelectedBuildIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        // Prevent selecting two builds of the same platform
        const build = builds.find(b => b.id === id)
        if (build) {
          for (const existingId of next) {
            const existing = builds.find(b => b.id === existingId)
            if (existing && existing.platform === build.platform) {
              next.delete(existingId)
            }
          }
        }
        next.add(id)
      }
      return next
    })
  }

  function toggleChannel(name: string) {
    setSelectedChannels(prev => {
      const next = new Set(prev)
      if (next.has(name)) { if (next.size > 1) next.delete(name) } // keep at least one
      else next.add(name)
      return next
    })
  }

  async function handlePublish() {
    if (selectedBuildIds.size === 0 || selectedChannels.size === 0) return
    setError('')
    setSuccess('')
    setPublishing(true)
    try {
      const groupId = crypto.randomUUID()
      const ids = [...selectedBuildIds]
      const channels = [...selectedChannels]
      // Publish each build × channel combination
      await Promise.all(
        channels.flatMap(channel =>
          ids.map(buildId =>
            publishBuild(buildId, {
              channel,
              rolloutPercentage,
              isCritical,
              releaseMessage,
              groupId,
              linkedFlags: [...linkedFlags.entries()].map(([id, override]) => ({
                flagId: id,
                enabled: override.enabled,
              })),
            })
          )
        )
      )
      const platforms = ids.map(id => builds.find(b => b.id === id)?.platform).filter(Boolean)
      const summary = `${platforms.join(' + ')} to ${channels.join(', ')}`
      setSuccess(`Release shipped: ${summary} (${groupId.slice(0, 8)})`)
      setTimeout(onPublished, 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish')
    } finally {
      setPublishing(false)
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

  const selectedBuilds = builds.filter((b) => selectedBuildIds.has(b.id))
  const unpublishedBuilds = builds.filter((b) => !b.isPublished)

  const selectedPolicy = selectedPolicyId ? availablePolicies.find((p) => p.id === selectedPolicyId) : null

  return (
    <div className="h-full flex flex-col">
      {/* Header with step indicator */}
      <div className="border-b bg-card px-6 py-5">
        <h2 className="text-lg font-semibold">New Release</h2>
        <p className="text-sm text-muted-foreground">
          {step === 'select'
            ? 'Select builds to include in this release'
            : 'Configure delivery, rollout strategy, and flag activation'}
        </p>
        <div className="flex items-center gap-2 mt-4">
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-pointer hover:text-foreground',
            )}
            onClick={() => step === 'configure' && setStep('select')}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">1</span>
            Builds
          </button>
          <div className="w-4 h-px bg-border" />
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              step === 'configure' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">2</span>
            Release
          </span>
        </div>
      </div>

      {!loading && unpublishedBuilds.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <PublishEmptyState />
        </div>
      ) : step === 'select' ? (
        // ── Step 1: Build selection ────────────────────────────────────
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl space-y-3">
              {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

              {loading && initialLoad ? null : loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                      <Skeleton className="h-4 w-4 rounded" />
                      <div className="space-y-1.5 flex-1">
                        <div className="flex gap-1.5">
                          <Skeleton className="h-4 w-14" />
                          <Skeleton className="h-4 w-12 rounded-full" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {unpublishedBuilds.map((b) => (
                    <label
                      key={b.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all',
                        selectedBuildIds.has(b.id)
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'hover:bg-accent/50'
                      )}
                    >
                      <Checkbox
                        checked={selectedBuildIds.has(b.id)}
                        onCheckedChange={() => toggleBuild(b.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-sm">{b.runtimeVersion}</span>
                          <PlatformBadge platform={b.platform} />
                          {b.gitBranch && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <GitBranch className="h-3 w-3" />
                              {b.gitBranch}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {b.gitCommitHash && <span className="font-mono">{b.gitCommitHash.slice(0, 7)}</span>}
                          <span>{timeAgo(b.createdAt)}</span>
                          <span>{b.assetCount} asset{b.assetCount !== 1 ? 's' : ''}</span>
                        </div>
                        {b.message && <p className="text-sm text-foreground/80">{b.message}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sticky bottom bar */}
          <div className="border-t bg-card px-6 py-4 flex items-center justify-end gap-3">
            {selectedBuilds.length > 0 && (
              <span className="text-sm text-muted-foreground mr-auto">
                {selectedBuilds.map(b => b.platform).join(' + ')}
              </span>
            )}
            <Button disabled={selectedBuilds.length === 0} onClick={() => setStep('configure')}>
              Next <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      ) : (
        // ── Step 2: Configure release ─────────────────────────────────
        <div className="flex-1 flex">
          {/* Main form */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-lg space-y-6">
              {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
              {success && <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{success}</div>}

              {/* Channels */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Channels</span>
                  <InfoTip>Devices built with a given channel name will receive updates from that channel.</InfoTip>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(availableChannels.length > 0
                    ? availableChannels.map(ch => ch.name)
                    : ['production', 'staging', 'canary']
                  ).map(ch => (
                    <label
                      key={ch}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-all',
                        selectedChannels.has(ch)
                          ? 'border-primary bg-primary/5 font-medium'
                          : 'hover:bg-accent/50',
                      )}
                    >
                      <Checkbox
                        checked={selectedChannels.has(ch)}
                        onCheckedChange={() => toggleChannel(ch)}
                      />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>

              {/* Release notes */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Release Notes</span>
                <Input
                  value={releaseMessage}
                  onChange={(e) => setReleaseMessage(e.target.value)}
                  placeholder="What changed in this update?"
                />
              </div>

              {/* Rollout */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Initial Rollout</span>
                  <InfoTip>Start low to limit blast radius, then increase. Adjustable later from Releases.</InfoTip>
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[rolloutPercentage]}
                    max={100}
                    step={1}
                    onValueChange={([val]) => setRolloutPercentage(val)}
                  />
                  <span className="text-sm font-mono font-medium w-10 text-right">{rolloutPercentage}%</span>
                </div>
              </div>

              {/* Critical */}
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  id="critical"
                  checked={isCritical}
                  onCheckedChange={(checked) => setIsCritical(checked === true)}
                />
                <span className="text-sm">Critical update</span>
                <InfoTip>Forces immediate reload instead of waiting for next cold start.</InfoTip>
              </label>

              <div className="h-px bg-border" />

              {/* Rollout policy */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rollout Policy</span>
                <Popover open={policySearchOpen} onOpenChange={setPolicySearchOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors',
                        !selectedPolicyId && 'text-muted-foreground',
                      )}
                    >
                      {selectedPolicyId
                        ? availablePolicies.find((p) => p.id === selectedPolicyId)?.name
                        : 'None — instant full deploy'}
                      <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="flex items-center border-b px-3">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input
                        ref={policyInputRef}
                        value={policySearch}
                        onChange={(e) => setPolicySearch(e.target.value)}
                        placeholder="Search policies..."
                        className="flex-1 bg-transparent py-2.5 px-2 text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      <button
                        className={cn(
                          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent',
                          selectedPolicyId === null && 'bg-accent',
                        )}
                        onClick={() => { setSelectedPolicyId(null); setPolicySearchOpen(false); setPolicySearch('') }}
                      >
                        <Check className={cn('h-3.5 w-3.5', selectedPolicyId === null ? 'opacity-100' : 'opacity-0')} />
                        <span className="text-muted-foreground">None — instant full deploy</span>
                      </button>
                      {availablePolicies
                        .filter((p) => !policySearch.trim() || p.name.toLowerCase().includes(policySearch.toLowerCase()) || p.channel.toLowerCase().includes(policySearch.toLowerCase()))
                        .map((p) => (
                          <button
                            key={p.id}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent',
                              selectedPolicyId === p.id && 'bg-accent',
                            )}
                            onClick={() => { setSelectedPolicyId(p.id); setPolicySearchOpen(false); setPolicySearch('') }}
                          >
                            <Check className={cn('h-3.5 w-3.5', selectedPolicyId === p.id ? 'opacity-100' : 'opacity-0')} />
                            <div className="flex-1 text-left">
                              <span>{p.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{p.channel}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              {p.stages.map((pct, i) => (
                                <span key={i} className="text-[10px] font-mono text-muted-foreground">
                                  {pct}%{i < p.stages.length - 1 ? ' → ' : ''}
                                </span>
                              ))}
                            </div>
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {selectedPolicy && (
                  <div className="flex items-center gap-1 pt-1">
                    {selectedPolicy.stages.map((pct, i) => (
                      <div key={pct} className="flex items-center gap-1">
                        <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {pct}%
                        </span>
                        {i < selectedPolicy.stages.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Flag configuration */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flag Configuration</span>
                  <InfoTip>Overrides flag state only for devices that receive this release. Users outside the rollout keep the current global state.</InfoTip>
                </div>

                {/* Selected flags with target state */}
                {linkedFlags.size > 0 && (
                  <div className="space-y-1.5">
                    {[...linkedFlags.entries()].map(([id, override]) => {
                      const flag = availableFlags.find((f) => f.id === id)
                      if (!flag) return null
                      const isBoolean = flag.flagType === 'boolean'
                      const selectedVariation = override.variationId
                        ? flag.variations.find((v) => v.id === override.variationId)
                        : null
                      // Check if override is redundant against the per-channel default value
                      const channelSettings = [...selectedChannels].map(ch => flag.envSettings.find(s => s.channelName === ch))
                      const allChannelsMatch = isBoolean && channelSettings.length > 0 && channelSettings.every(s => {
                        // Compare against what the flag actually serves (default_value), not the on/off toggle
                        const channelDefaultValue = s ? s.defaultValue : flag.defaultValue
                        return channelDefaultValue === override.enabled
                      })
                      const isPartial = flag.rolloutPercentage < 100 && flag.rolloutPercentage > 0
                      const hasWarning = allChannelsMatch || isPartial
                      return (
                        <div key={id} className="space-y-1">
                          <div className={cn(
                            'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                            hasWarning && 'border-amber-300',
                          )}>
                            <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="truncate block">{flag.name}</span>
                              {!isBoolean && (
                                <span className="text-[10px] text-muted-foreground">{flag.flagType}</span>
                              )}
                              {isPartial && (
                                <span className="text-[10px] text-muted-foreground block">
                                  Currently at {flag.rolloutPercentage}% rollout
                                </span>
                              )}
                            </div>
                            {isBoolean ? (
                              <button
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer shrink-0',
                                  override.enabled
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20',
                                )}
                                onClick={() => setLinkedFlags((prev) => { const next = new Map(prev); next.set(id, { ...override, enabled: !override.enabled }); return next })}
                              >
                                {override.enabled ? 'Enable' : 'Disable'}
                              </button>
                            ) : (
                              <select
                                value={override.variationId ?? ''}
                                onChange={(e) => {
                                  const varId = e.target.value ? Number(e.target.value) : null
                                  setLinkedFlags((prev) => { const next = new Map(prev); next.set(id, { ...override, variationId: varId }); return next })
                                }}
                                className="rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium shrink-0 max-w-[120px] cursor-pointer"
                              >
                                {flag.variations.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name || String(v.value)}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              className="rounded-full p-0.5 hover:bg-muted-foreground/20 cursor-pointer text-muted-foreground shrink-0"
                              onClick={() => setLinkedFlags((prev) => { const next = new Map(prev); next.delete(id); return next })}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {allChannelsMatch && (
                            <div className="flex items-start gap-1.5 px-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                              <span className="text-[11px] text-amber-600">
                                {override.enabled
                                  ? `Default value is already true on ${[...selectedChannels].join(', ')} — this override has no additional effect.`
                                  : `Default value is already false on ${[...selectedChannels].join(', ')} — this override has no additional effect.`}
                              </span>
                            </div>
                          )}
                          {isPartial && (
                            <div className="flex items-start gap-1.5 px-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                              <span className="text-[11px] text-amber-600">
                                This flag is already rolling out to {flag.rolloutPercentage}% of users. The release override will take precedence for devices in this rollout.
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Searchable flag picker */}
                <Popover open={flagSearchOpen} onOpenChange={setFlagSearchOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors">
                      {linkedFlags.size === 0 ? 'Add flags to this release...' : 'Add more flags...'}
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="flex items-center border-b px-3">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input
                        ref={flagInputRef}
                        value={flagSearch}
                        onChange={(e) => setFlagSearch(e.target.value)}
                        placeholder="Search flags..."
                        className="flex-1 bg-transparent py-2.5 px-2 text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {availableFlags
                        .filter((f) => !flagSearch.trim() || f.name.toLowerCase().includes(flagSearch.toLowerCase()) || f.key.toLowerCase().includes(flagSearch.toLowerCase()))
                        .map((flag) => {
                          const isSelected = linkedFlags.has(flag.id)
                          return (
                            <button
                              key={flag.id}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent',
                                isSelected && 'bg-accent/50',
                              )}
                              onClick={() => {
                                setLinkedFlags((prev) => {
                                  const next = new Map(prev)
                                  if (next.has(flag.id)) {
                                    next.delete(flag.id)
                                  } else {
                                    // Boolean: default to enabling (turn on with this release). Others: default to first variation.
                                    next.set(flag.id, {
                                      enabled: true,
                                      variationId: flag.flagType === 'boolean' ? null : flag.variations[0]?.id ?? null,
                                    })
                                  }
                                  return next
                                })
                              }}
                            >
                              <Check className={cn('h-3.5 w-3.5', isSelected ? 'opacity-100' : 'opacity-0')} />
                              <div className="flex-1 text-left min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">{flag.name}</span>
                                  {flag.flagType !== 'boolean' && (
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">{flag.flagType}</span>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground font-mono block truncate">{flag.key}</span>
                              </div>
                              {(() => {
                                // Show status based on selected channels' env settings
                                const channels = [...selectedChannels]
                                const enabledChannels = channels.filter(ch => {
                                  const setting = flag.envSettings.find(s => s.channelName === ch)
                                  return setting ? setting.enabled : flag.enabled
                                })
                                if (enabledChannels.length === 0) {
                                  return (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Disabled on selected channels">
                                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Off
                                    </span>
                                  )
                                } else if (enabledChannels.length < channels.length) {
                                  return (
                                    <span className="flex items-center gap-1 text-[11px] text-amber-600" title={`Enabled on ${enabledChannels.join(', ')}`}>
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Partial
                                    </span>
                                  )
                                } else {
                                  return (
                                    <span className="flex items-center gap-1 text-[11px] text-green-600" title="Enabled on all selected channels">
                                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> On
                                    </span>
                                  )
                                }
                              })()}
                            </button>
                          )
                        })}
                      {availableFlags.filter((f) => !flagSearch.trim() || f.name.toLowerCase().includes(flagSearch.toLowerCase()) || f.key.toLowerCase().includes(flagSearch.toLowerCase())).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-3">No flags found</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Sidebar — release summary */}
          <div className="w-72 shrink-0 border-l overflow-y-auto p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider">Release Bundle</span>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Builds</span>
              <div className="space-y-1.5">
                {selectedBuilds.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-sm">
                    <PlatformBadge platform={b.platform} />
                    <span className="font-medium">{b.runtimeVersion}</span>
                    <span className="text-xs text-muted-foreground font-mono">{b.gitCommitHash?.slice(0, 7)}</span>
                  </div>
                ))}
              </div>
              <button
                className="text-xs text-primary hover:underline cursor-pointer mt-1"
                onClick={() => setStep('select')}
              >
                Change builds
              </button>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Channels</span>
              <div className="flex flex-wrap gap-1">
                {[...selectedChannels].map((ch) => (
                  <Badge key={ch} variant="outline" className="text-xs">{ch}</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rollout</span>
              <p className="text-sm">{rolloutPercentage}%{isCritical && <span className="text-red-500 ml-1 text-xs">(critical)</span>}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Policy</span>
              <p className="text-sm">{selectedPolicy ? selectedPolicy.name : <span className="text-muted-foreground">None</span>}</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flags</span>
              {linkedFlags.size > 0 ? (
                <div className="space-y-1">
                  {[...linkedFlags.entries()].map(([id, override]) => {
                    const flag = availableFlags.find((f) => f.id === id)
                    if (!flag) return null
                    const isBoolean = flag.flagType === 'boolean'
                    const variation = override.variationId
                      ? flag.variations.find((v) => v.id === override.variationId)
                      : null
                    return (
                      <div key={id} className="flex items-center justify-between text-xs gap-2">
                        <span className="truncate">{flag.name}</span>
                        {isBoolean ? (
                          <span className={cn('shrink-0', override.enabled ? 'text-green-600' : 'text-muted-foreground')}>
                            {override.enabled ? 'on' : 'off'}
                          </span>
                        ) : (
                          <span className="shrink-0 font-mono text-muted-foreground truncate max-w-[80px]">
                            {variation ? (variation.name || String(variation.value)) : '—'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </div>

            <div className="h-px bg-border" />

            <Button className="w-full" disabled={publishing || selectedChannels.size === 0} onClick={handlePublish}>
              {publishing
                ? 'Shipping...'
                : `Ship to ${[...selectedChannels].join(', ')}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PublishEmptyState() {
  return (
    <div className="max-w-6xl mx-auto px-12 py-20">
      <div className="grid grid-cols-2 gap-16 items-start">
        {/* Left — Copy */}
        <div className="space-y-6 pt-8">
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            Publish OTA updates from CI/CD
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Push builds from your CI pipeline using the Dispatch CLI, then publish them here
            to any channel with rollout controls.
          </p>

          {/* Steps */}
          <div className="space-y-4 pt-1">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">1</div>
              <div>
                <p className="text-sm font-medium">Install the CLI</p>
                <pre className="mt-1.5 text-[11px] bg-muted rounded-md px-3 py-2 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  <span className="text-muted-foreground select-none">$ </span>curl -sL https://github.com/AppDispatch/cli/releases/latest/download/dispatch-darwin-arm64 -o /usr/local/bin/dispatch && chmod +x /usr/local/bin/dispatch</pre>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">2</div>
              <div>
                <p className="text-sm font-medium">Initialize your project</p>
                <pre className="mt-1.5 text-[11px] bg-muted rounded-md px-3 py-2 font-mono overflow-x-auto">
                  <span className="text-muted-foreground select-none">$ </span>dispatch login --server {window.location.origin}{'\n'}
                  <span className="text-muted-foreground select-none">$ </span>dispatch init</pre>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">3</div>
              <div>
                <p className="text-sm font-medium">Publish an update</p>
                <pre className="mt-1.5 text-[11px] bg-muted rounded-md px-3 py-2 font-mono overflow-x-auto">
                  <span className="text-muted-foreground select-none">$ </span>dispatch publish --channel production -m "Fix login bug"</pre>
              </div>
            </div>
          </div>

          <p className="text-muted-foreground text-sm leading-relaxed">
            Or add the{' '}
            <a
              href="https://github.com/AppDispatch/cli"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              GitHub Actions workflow
            </a>{' '}
            to publish automatically on every push.
          </p>
        </div>

        {/* Right — Visual preview */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Mini header */}
          <div className="border-b px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-4 w-4" />
            <span className="font-medium text-foreground">New Release</span>
          </div>

          {/* Fake build list */}
          <div className="px-5 py-4 space-y-3">
            {/* Build 1 */}
            <div className="rounded-lg border border-primary bg-primary/5 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded border-2 border-primary bg-primary flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span className="text-xs font-semibold">49.0.0</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">ios</Badge>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" /> main
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5">
                <span className="font-mono">a3f1b2c</span>
                <span>2m ago</span>
                <span>24 assets</span>
              </div>
            </div>

            {/* Build 2 */}
            <div className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded border-2 border-muted-foreground/30" />
                <span className="text-xs font-semibold">49.0.0</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">android</Badge>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" /> main
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5">
                <span className="font-mono">a3f1b2c</span>
                <span>2m ago</span>
                <span>22 assets</span>
              </div>
            </div>
          </div>

          {/* Fake config */}
          <div className="border-t px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Channel</span>
              <Badge variant="secondary" className="text-[10px]">production</Badge>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Rollout</span>
                <span className="text-xs text-muted-foreground">100%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="pt-1">
              <div className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs font-medium justify-center">
                <Rocket className="h-3 w-3" />
                Ship to production
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
