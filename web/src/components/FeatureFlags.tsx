import { useEffect, useState } from 'react'
import {
  listFlags,
  getFlag,
  createFlag,
  patchFlag,
  deleteFlag,
  createFlagRule,
  deleteFlagRule,
  patchFlagEnvSetting,
  patchFlagRule,
  patchFlagVariation,
  listChannels,
  listAuditLog,
  getFlagEvaluations,
  listSegments,
  getFlagHealth,
} from '../api/client'
import type {
  FlagListItemRecord,
  FlagWithDetailsRecord,
  FlagTargetingRuleRecord,
  FlagEnvSettingRecord,
  ChannelRecord,
  AuditLogRecord,
  FlagEvaluationSummary,
  SegmentRecord,
  FlagHealthResponse,
} from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import {
  Plus,
  Trash2,
  Flag,
  ChevronRight,
  Users,
  Percent,
  Zap,
  Search,
  Copy,
  Check,
  Pencil,
  Save,
  History,
  RefreshCw,
  ChevronDown,
  Code,
  Filter,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

const USE_MOCK = import.meta.env.VITE_MOCK === 'true'

// LD-style environment colors (cycled for channels)
const ENV_COLORS = [
  { dot: 'bg-green-500', bar: 'bg-green-400', text: 'text-green-600' },
  { dot: 'bg-yellow-500', bar: 'bg-yellow-400', text: 'text-yellow-600' },
  { dot: 'bg-orange-500', bar: 'bg-orange-400', text: 'text-orange-600' },
  { dot: 'bg-blue-500', bar: 'bg-blue-400', text: 'text-blue-600' },
  { dot: 'bg-purple-500', bar: 'bg-purple-400', text: 'text-purple-600' },
  { dot: 'bg-pink-500', bar: 'bg-pink-400', text: 'text-pink-600' },
]

function getEnvColor(index: number) {
  return ENV_COLORS[index % ENV_COLORS.length]
}

// Colors for flag variations (used in bars, chips, etc.)
const VARIATION_COLORS = [
  'bg-green-500',
  'bg-blue-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-red-500',
]

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

// Deterministic color from string
function avatarColor(str: string): string {
  const colors = [
    'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-600',
    'bg-pink-600', 'bg-teal-600', 'bg-indigo-600', 'bg-red-600',
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function FeatureFlags({ initialFlagKey, onFlagSelected }: { initialFlagKey?: string | null; onFlagSelected?: (key: string | null) => void } = {}) {
  const [flags, setFlags] = useState<FlagListItemRecord[]>([])
  const [channels, setChannels] = useState<ChannelRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<FlagWithDetailsRecord | null>(null)
  const [search, setSearch] = useState('')
  const [activeChannel, setActiveChannel] = useState<string | null>(null)

  // Create form
  const [newName, setNewName] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newKeyManual, setNewKeyManual] = useState(false)
  const [newType, setNewType] = useState('boolean')
  const [newDescription, setNewDescription] = useState('')
  const [newVariations, setNewVariations] = useState<{ value: string; name: string }[]>([
    { value: '', name: 'Variation 1' },
    { value: '', name: 'Variation 2' },
  ])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Rule form
  const [showAddRule, setShowAddRule] = useState(false)
  const [ruleType, setRuleType] = useState('percentage_rollout')
  const [ruleVariant, setRuleVariant] = useState('')
  const [rulePriority, setRulePriority] = useState('0')
  const [rulePercentage, setRulePercentage] = useState('50')
  const [ruleUserIds, setRuleUserIds] = useState('')
  const [ruleRolloutWeights, setRuleRolloutWeights] = useState<Record<number, number>>({})
  const [ruleConditions, setRuleConditions] = useState<Array<{ attribute: string; operator: string; values: string }>>([{ attribute: '', operator: 'eq', values: '' }])
  const [ruleOtaMatchBy, setRuleOtaMatchBy] = useState<'branch' | 'runtime_version' | 'updated_since'>('branch')
  const [ruleOtaBranch, setRuleOtaBranch] = useState('')
  const [ruleOtaVersion, setRuleOtaVersion] = useState('')
  const [ruleOtaVersionOp, setRuleOtaVersionOp] = useState('semver_gte')
  const [ruleOtaDays, setRuleOtaDays] = useState('7')
  const [ruleSegmentKey, setRuleSegmentKey] = useState('')
  const [addingRule, setAddingRule] = useState(false)

  // Copy key
  const [copiedKey, setCopiedKey] = useState(false)

  // Variation editing
  const [editingVariations, setEditingVariations] = useState(false)
  const [editVariationDrafts, setEditVariationDrafts] = useState<Record<number, { name: string; value: string }>>({})
  const [savingVariations, setSavingVariations] = useState(false)

  // Delete confirmations
  const [confirmDeleteFlag, setConfirmDeleteFlag] = useState<number | null>(null)
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<FlagTargetingRuleRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)

  // Evaluations
  const [evalData, setEvalData] = useState<FlagEvaluationSummary | null>(null)
  const [evalExpanded, setEvalExpanded] = useState(false)
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalDays, setEvalDays] = useState(7)
  const [healthExpanded, setHealthExpanded] = useState(false)
  const [segments, setSegments] = useState<SegmentRecord[]>([])
  const [flagHealthCache, setFlagHealthCache] = useState<Record<number, FlagHealthResponse | null>>({})

  async function loadData() {
    try {
      const [flagData, channelData, segmentData] = await Promise.all([listFlags(), listChannels(), listSegments()])
      setFlags(flagData)
      setChannels(channelData)
      setSegments(segmentData)
      if (!activeChannel && channelData.length > 0) {
        setActiveChannel(channelData[0].name)
      }
      // Pre-load health for all flags (fire and forget)
      const healthEntries = await Promise.all(
        flagData.map(async (f) => {
          try {
            const h = await getFlagHealth(f.id)
            return [f.id, h] as const
          } catch {
            return [f.id, null] as const
          }
        }),
      )
      setFlagHealthCache(Object.fromEntries(healthEntries))
    } finally {
      setLoading(false)
    }
  }

  async function loadFlagHealth(flagId: number) {
    if (flagHealthCache[flagId] !== undefined) return flagHealthCache[flagId]
    try {
      const data = await getFlagHealth(flagId)
      setFlagHealthCache((prev) => ({ ...prev, [flagId]: data }))
      return data
    } catch {
      setFlagHealthCache((prev) => ({ ...prev, [flagId]: null }))
      return null
    }
  }

  async function loadEvaluations(flagId: number, days?: number) {
    setEvalLoading(true)
    try {
      const data = await getFlagEvaluations(flagId, {
        days: days ?? evalDays,
        channel: activeChannel || undefined,
      })
      setEvalData(data)
    } catch {
      setEvalData(null)
    } finally {
      setEvalLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Sync selected flag with URL (handles deep-link, back/forward)
  useEffect(() => {
    if (loading) return
    if (initialFlagKey) {
      // Only open if not already viewing this flag
      if (selectedFlag?.key !== initialFlagKey) {
        const match = flags.find((f) => f.key === initialFlagKey)
        if (match) openFlagDetail(match.id)
      }
    } else if (selectedFlag) {
      // URL says /flags (no key) but we have a flag selected — deselect (back button)
      setSelectedFlag(null)
    }
  }, [initialFlagKey, loading])

  // Reload evaluations when channel changes (if panel is expanded)
  useEffect(() => {
    if (selectedFlag && evalExpanded) {
      loadEvaluations(selectedFlag.id)
    }
  }, [activeChannel])

  const filteredFlags = search.trim()
    ? flags.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.key.toLowerCase().includes(search.toLowerCase()) ||
          (f.description && f.description.toLowerCase().includes(search.toLowerCase())),
      )
    : flags

  function getEnvSetting(flag: FlagListItemRecord, channelName: string): FlagEnvSettingRecord | undefined {
    return flag.envSettings.find((s) => s.channelName === channelName)
  }

  function isEnabledForChannel(flag: FlagListItemRecord, channelName: string): boolean {
    const setting = getEnvSetting(flag, channelName)
    return setting ? setting.enabled : flag.enabled
  }

  // Detail view helpers
  function getDetailEnvSetting(channelName: string): FlagEnvSettingRecord | undefined {
    if (!selectedFlag) return undefined
    return selectedFlag.envSettings.find((s) => s.channelName === channelName)
  }

  function isDetailEnabledForChannel(channelName: string): boolean {
    if (!selectedFlag) return false
    const setting = getDetailEnvSetting(channelName)
    return setting ? setting.enabled : selectedFlag.enabled
  }

  function getDetailDefaultValue(channelName: string): unknown {
    if (!selectedFlag) return false
    const setting = getDetailEnvSetting(channelName)
    return setting ? setting.defaultValue : selectedFlag.defaultValue
  }

  function getRulesForChannel(channelName: string | null): FlagTargetingRuleRecord[] {
    if (!selectedFlag) return []
    return selectedFlag.rules.filter(
      (r) => r.channelName === channelName || r.channelName === null,
    )
  }

  async function handleCreate() {
    if (!newName.trim() || !newKey.trim()) return
    setCreating(true)
    setError('')
    try {
      const payload: Parameters<typeof createFlag>[0] = {
        name: newName.trim(),
        key: newKey.trim(),
        flagType: newType,
        description: newDescription.trim() || undefined,
      }
      // For non-boolean types, send user-defined variations
      if (newType !== 'boolean') {
        payload.variations = newVariations.map((v) => ({
          value: newType === 'number' ? Number(v.value) : newType === 'json' ? JSON.parse(v.value) : v.value,
          name: v.name || undefined,
        }))
        // Default value is first variation's value
        payload.defaultValue = payload.variations[0]?.value
      }
      await createFlag(payload)
      setShowCreate(false)
      setNewName('')
      setNewKey('')
      setNewKeyManual(false)
      setNewType('boolean')
      setNewDescription('')
      setNewVariations([{ value: '', name: 'Variation 1' }, { value: '', name: 'Variation 2' }])
      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create flag')
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleEnv(flag: FlagListItemRecord | FlagWithDetailsRecord, channelName: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    const envSetting = 'envSettings' in flag
      ? flag.envSettings.find((s) => s.channelName === channelName)
      : undefined
    const currentEnabled = envSetting ? envSetting.enabled : flag.enabled
    await patchFlagEnvSetting(flag.id, channelName, { enabled: !currentEnabled })
    // Refresh
    if (selectedFlag && selectedFlag.id === flag.id) {
      const updated = await getFlag(flag.id)
      setSelectedFlag(updated)
    }
    const flagData = await listFlags()
    setFlags(flagData)
  }

  async function handleDelete(id: number) {
    setDeleting(true)
    try {
      await deleteFlag(id)
      setFlags((prev) => prev.filter((f) => f.id !== id))
      if (selectedFlag?.id === id) { setSelectedFlag(null); onFlagSelected?.(null) }
    } finally {
      setDeleting(false)
      setConfirmDeleteFlag(null)
    }
  }

  async function openFlagDetail(flagId: number) {
    const data = await getFlag(flagId)
    setSelectedFlag(data)
    onFlagSelected?.(data.key)
    loadEvaluations(flagId)
    loadFlagHealth(flagId)
  }

  async function handleAddRule() {
    if (!selectedFlag) return
    setAddingRule(true)
    setError('')
    try {
      const variantValue = ruleType === 'percentage_rollout'
        ? serde_json_null()
        : selectedFlag.variations.length > 0
          ? JSON.parse(ruleVariant)
          : parseVariantValue(ruleVariant, selectedFlag.flagType)
      const ruleConfig: Record<string, unknown> = {}
      if (ruleType === 'percentage_rollout') {
        // Multi-variation rollout
        const rollout = selectedFlag.variations.map((v) => ({
          variationId: v.id,
          weight: ruleRolloutWeights[v.id] ?? 0,
        }))
        ruleConfig.rollout = rollout
      } else if (ruleType === 'user_list') {
        ruleConfig.userIds = ruleUserIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      } else if (ruleType === 'ota_update') {
        ruleConfig.matchBy = ruleOtaMatchBy
        if (ruleOtaMatchBy === 'branch') {
          ruleConfig.branch = ruleOtaBranch.trim()
        } else if (ruleOtaMatchBy === 'runtime_version') {
          ruleConfig.version = ruleOtaVersion.trim()
          ruleConfig.operator = ruleOtaVersionOp
        } else if (ruleOtaMatchBy === 'updated_since') {
          ruleConfig.withinDays = parseInt(ruleOtaDays, 10) || 7
        }
      } else if (ruleType === 'segment') {
        ruleConfig.segmentKey = ruleSegmentKey.trim()
      } else if (ruleType === 'attribute') {
        ruleConfig.conditions = ruleConditions.map((c) => ({
          attribute: c.attribute.trim(),
          operator: c.operator,
          values: ['exists', 'not_exists'].includes(c.operator)
            ? []
            : c.values.split(',').map((s) => s.trim()).filter(Boolean),
        }))
      }
      await createFlagRule(selectedFlag.id, {
        priority: parseInt(rulePriority, 10) || 0,
        ruleType,
        variantValue,
        ruleConfig,
        channelName: activeChannel || undefined,
      })
      const updated = await getFlag(selectedFlag.id)
      setSelectedFlag(updated)
      setShowAddRule(false)
      resetRuleForm()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add rule')
    } finally {
      setAddingRule(false)
    }
  }

  async function handleDeleteRule(rule: FlagTargetingRuleRecord) {
    if (!selectedFlag) return
    setDeleting(true)
    try {
      await deleteFlagRule(selectedFlag.id, rule.id)
      const updated = await getFlag(selectedFlag.id)
      setSelectedFlag(updated)
      const flagData = await listFlags()
      setFlags(flagData)
    } finally {
      setDeleting(false)
      setConfirmDeleteRule(null)
    }
  }

  async function loadAuditLog(flagId: number) {
    setLoadingAudit(true)
    try {
      const entries = await listAuditLog({ entityType: 'feature_flag', entityId: flagId, limit: 50 })
      // Also fetch rule-level audit for this flag
      const ruleEntries = await listAuditLog({ entityType: 'flag_targeting_rule', limit: 100 })
      const flagRuleEntries = ruleEntries.filter(
        (e) => (e.details as Record<string, unknown>)?.flagId === flagId,
      )
      // Also fetch env setting and variation changes
      const envEntries = await listAuditLog({ entityType: 'flag_env_setting', limit: 100 })
      const flagEnvEntries = envEntries.filter(
        (e) => (e.details as Record<string, unknown>)?.flagId === flagId,
      )
      const varEntries = await listAuditLog({ entityType: 'flag_variation', limit: 100 })
      const flagVarEntries = varEntries.filter(
        (e) => (e.details as Record<string, unknown>)?.flagId === flagId,
      )
      const all = [...entries, ...flagRuleEntries, ...flagEnvEntries, ...flagVarEntries]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50)
      setAuditLog(all)
    } finally {
      setLoadingAudit(false)
    }
  }

  function serde_json_null() { return null }

  function resetRuleForm() {
    setRuleType('percentage_rollout')
    setRuleVariant('')
    setRulePriority('0')
    setRulePercentage('50')
    setRuleUserIds('')
    setRuleRolloutWeights({})
    setRuleConditions([{ attribute: '', operator: 'eq', values: '' }])
    setRuleOtaMatchBy('branch')
    setRuleOtaBranch('')
    setRuleOtaVersion('')
    setRuleOtaVersionOp('semver_gte')
    setRuleOtaDays('7')
    setRuleSegmentKey('')
    setError('')
  }

  function parseVariantValue(raw: string, flagType: string): unknown {
    if (flagType === 'boolean') return raw === 'true'
    if (flagType === 'number') return parseFloat(raw) || 0
    if (flagType === 'json') {
      try { return JSON.parse(raw) } catch { return {} }
    }
    return raw
  }

  function formatVariant(value: unknown): string {
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'string') return `"${value}"`
    return JSON.stringify(value)
  }

  function formatAuditAction(action: string): string {
    const map: Record<string, string> = {
      'flag.created': 'Flag created',
      'flag.updated': 'Flag updated',
      'flag.deleted': 'Flag deleted',
      'flag_rule.created': 'Rule added',
      'flag_rule.updated': 'Rule updated',
      'flag_rule.deleted': 'Rule deleted',
      'flag_env.updated': 'Environment updated',
      'flag_variation.updated': 'Variation updated',
      'flag.rollout_applied': 'Rollout applied',
      'flag.rollout_reverted': 'Rollout reverted',
      'flag.rollout_restored': 'Rollout restored',
    }
    return map[action] || action
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  function copySnippet(id: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedSnippet(id)
    setTimeout(() => setCopiedSnippet(null), 2000)
  }

  function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds} seconds ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? 's' : ''} ago`
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  // ── Channel tabs component ──────────────────────────────────────────────

  function ChannelTabs({ className }: { className?: string }) {
    if (channels.length === 0) return null
    return (
      <div className={cn('flex items-center gap-0 border-b', className)}>
        {channels.map((ch, ci) => {
          const color = getEnvColor(ci)
          return (
            <button
              key={ch.name}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors cursor-pointer rounded-t-md',
                activeChannel === ch.name
                  ? 'border-primary text-foreground font-semibold bg-primary/10'
                  : 'border-transparent text-muted-foreground/50 font-normal hover:text-muted-foreground hover:border-muted-foreground/30',
              )}
              onClick={() => setActiveChannel(ch.name)}
            >
              <span className={cn('h-2 w-2 rounded-full shrink-0', color.dot)} />
              {ch.name}
            </button>
          )
        })}
      </div>
    )
  }

  // ── Detail view ─────────────────────────────────────────────────────

  if (selectedFlag) {
    const channelRules = activeChannel ? getRulesForChannel(activeChannel) : selectedFlag.rules
    const channelEnabled = activeChannel ? isDetailEnabledForChannel(activeChannel) : selectedFlag.enabled
    const channelDefault = activeChannel ? getDetailDefaultValue(activeChannel) : selectedFlag.defaultValue
    const activeExecutionOnChannel = activeChannel
      ? selectedFlag.activeExecutions?.find(e => e.channel === activeChannel)
      : selectedFlag.activeExecutions?.[0]

    return (
      <div className="flex h-full">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-8">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button
                className="hover:text-foreground transition-colors cursor-pointer"
                onClick={() => { setSelectedFlag(null); onFlagSelected?.(null) }}
              >
                Flags
              </button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{selectedFlag.name || selectedFlag.key}</span>
            </div>

            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {selectedFlag.name || selectedFlag.key}
                </h2>
                {selectedFlag.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedFlag.description}
                  </p>
                )}
              </div>
            </div>

            {/* Channel tabs */}
            <ChannelTabs />

            {/* Active rollout banner — shown only on affected channel */}
            {activeExecutionOnChannel && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Active rollout in progress</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>{activeExecutionOnChannel.policyName}</strong> on <strong>{activeExecutionOnChannel.channel}</strong> — stage {activeExecutionOnChannel.currentStage}, flag set to {activeExecutionOnChannel.targetEnabled ? 'enabled' : 'disabled'}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">All targeting configuration is locked while this flag is linked to an active rollout.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Evaluations panel ─────────────────────────────── */}
            <div className="rounded-lg border bg-card">
              <button
                className="flex w-full items-center justify-between px-5 py-4 cursor-pointer"
                onClick={() => {
                  const next = !evalExpanded
                  setEvalExpanded(next)
                  if (next && !evalData) loadEvaluations(selectedFlag.id)
                }}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !evalExpanded && '-rotate-90')} />
                  <span className="text-sm font-semibold">Evaluations</span>
                </div>
                {!evalExpanded && evalData && (
                  <div className="flex items-center gap-3">
                    {evalData.lastEvaluatedAt && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Zap className="h-3 w-3" />
                        Evaluated {formatTimeAgo(evalData.lastEvaluatedAt)}
                      </span>
                    )}
                    {evalData.total > 0 && evalData.byVariation.length > 0 && (
                      <div className="flex h-2 w-32 rounded-full overflow-hidden bg-muted">
                        {evalData.byVariation.map((bv, i) => (
                          <div
                            key={i}
                            className={cn('h-full', VARIATION_COLORS[i % VARIATION_COLORS.length])}
                            style={{ width: `${(bv.total / evalData.total) * 100}%` }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </button>

              {evalExpanded && (
                <div className="border-t px-5 py-5 space-y-5">
                  {evalLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-40 w-full" />
                    </div>
                  ) : evalData ? (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-3xl font-bold tracking-tight">
                            {evalData.total >= 1000 ? `${(evalData.total / 1000).toFixed(1)}K` : evalData.total}
                          </p>
                          <div className="mt-2 space-y-1">
                            {evalData.byVariation.length > 0 && (
                              <>
                                <p className="text-xs text-muted-foreground font-medium">Active variations</p>
                                {evalData.byVariation.filter((bv) => bv.total > 0).map((bv, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className={cn('h-2 w-2 rounded-full', VARIATION_COLORS[i % VARIATION_COLORS.length])} />
                                    <span>{bv.variationName || 'unknown'}</span>
                                    <span className="text-muted-foreground">
                                      {bv.total >= 1000 ? `${(bv.total / 1000).toFixed(1)}K` : bv.total}
                                      {' '}({evalData.total > 0 ? Math.round((bv.total / evalData.total) * 100) : 0}%)
                                    </span>
                                  </div>
                                ))}
                                {evalData.byVariation.filter((bv) => bv.total === 0).length > 0 && (
                                  <>
                                    <p className="text-xs text-muted-foreground font-medium mt-2">Inactive variations</p>
                                    {evalData.byVariation.filter((bv) => bv.total === 0).map((bv, i) => (
                                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className={cn('h-2 w-2 rounded-full bg-muted-foreground/30')} />
                                        <span>{bv.variationName || 'unknown'}</span>
                                        <span>0 (0%)</span>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => loadEvaluations(selectedFlag.id)}
                            disabled={evalLoading}
                          >
                            <RefreshCw className={cn('h-3 w-3 mr-1', evalLoading && 'animate-spin')} />
                            Refresh
                          </Button>
                          <Select value={String(evalDays)} onValueChange={(v) => {
                            const d = Number(v)
                            setEvalDays(d)
                            loadEvaluations(selectedFlag.id, d)
                          }}>
                            <SelectTrigger className="h-8 w-[130px] text-xs">
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

                      {evalData.daily.length > 0 ? (
                        <div className="h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={evalData.daily} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                              <XAxis
                                dataKey="date"
                                tickFormatter={(d: string) => {
                                  const date = new Date(d)
                                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                }}
                                tick={{ fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                width={40}
                                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                              />
                              <Tooltip
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                                labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                formatter={(value: number) => [value.toLocaleString(), 'Evaluations']}
                              />
                              <Bar dataKey="total" fill="hsl(142.1, 76.2%, 36.3%)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                          No evaluation data for this period
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                      No evaluation data available
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Health panel ───────────────────────────── */}
            {(() => {
              const health = flagHealthCache[selectedFlag.id]
              if (!health) return null
              // Filter variations by active channel
              const channelVariations = activeChannel
                ? health.variations.filter((v) => v.channel === activeChannel)
                : health.variations
              // Recompute summary for the filtered variations
              const totalDevices = channelVariations.reduce((s, v) => s + v.devices, 0)
              const channelSummary = channelVariations.length > 0 ? {
                errorRate: parseFloat((channelVariations.reduce((s, v) => s + v.errorRate * v.devices, 0) / totalDevices).toFixed(2)),
                errorRateDelta: parseFloat((channelVariations.reduce((s, v) => s + v.errorRateDelta * v.devices, 0) / totalDevices).toFixed(2)),
                crashFree: parseFloat((channelVariations.reduce((s, v) => s + v.crashFree * v.devices, 0) / totalDevices).toFixed(2)),
                affectedDevices: totalDevices,
                status: channelVariations.some((v) => v.status === 'incident') ? 'incident' as const
                  : channelVariations.some((v) => v.status === 'degraded') ? 'degraded' as const
                  : 'healthy' as const,
              } : health.summary
              return (
                <div className="rounded-lg border bg-card">
                  <button
                    className="flex w-full items-center justify-between px-5 py-4 cursor-pointer"
                    onClick={() => setHealthExpanded(!healthExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !healthExpanded && '-rotate-90')} />
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Health</span>
                      {activeChannel && (
                        <span className="text-xs text-muted-foreground font-normal">({activeChannel})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
                        channelSummary.status === 'healthy' && 'bg-green-100 text-green-700',
                        channelSummary.status === 'degraded' && 'bg-amber-100 text-amber-700',
                        channelSummary.status === 'incident' && 'bg-red-100 text-red-700',
                      )}>
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          channelSummary.status === 'healthy' && 'bg-green-500',
                          channelSummary.status === 'degraded' && 'bg-amber-500',
                          channelSummary.status === 'incident' && 'bg-red-500 animate-pulse',
                        )} />
                        {channelSummary.status}
                      </span>
                    </div>
                  </button>

                  {healthExpanded && (
                    <div className="border-t px-5 py-5 space-y-4">
                      {health.variations.length === 0 && health.summary.affectedDevices === 0 ? (
                        <div className="text-center py-4">
                          <Activity className="h-8 w-8 mx-auto text-muted-foreground/30" />
                          <p className="text-sm font-medium mt-2">No health data yet</p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                            Install <code className="text-[11px] bg-muted px-1 py-0.5 rounded">@appdispatch/react-native</code> in your app to track errors, crashes, and flag-error correlation.
                          </p>
                        </div>
                      ) : (
                      <>
                      {/* Summary metrics */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-lg border p-3">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Error rate</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn('text-lg font-bold', channelSummary.errorRate > 1 && 'text-destructive')}>
                              {channelSummary.errorRate}%
                            </span>
                            <FlagDeltaBadge value={channelSummary.errorRateDelta} suffix="%" invert />
                          </div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Crash-free</span>
                          <div className="mt-1">
                            <span className={cn('text-lg font-bold', channelSummary.crashFree < 99 && 'text-destructive')}>
                              {channelSummary.crashFree}%
                            </span>
                          </div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Affected devices</span>
                          <div className="mt-1">
                            <span className="text-lg font-bold">{channelSummary.affectedDevices.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Per-variation breakdown */}
                      {channelVariations.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">Health by variation</h4>
                          <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/30">
                                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Variation</th>
                                  {!activeChannel && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Channel</th>}
                                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Devices</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Error rate</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Crash-free</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {channelVariations.map((v, i) => (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="px-3 py-2">
                                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{v.variationName}</span>
                                    </td>
                                    {!activeChannel && (
                                      <td className="px-3 py-2">
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{v.channel}</Badge>
                                      </td>
                                    )}
                                    <td className="px-3 py-2 text-right font-mono text-xs">{v.devices.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <span className={cn('font-mono text-xs', v.errorRate > 1 && 'text-destructive font-medium')}>{v.errorRate}%</span>
                                        <FlagDeltaBadge value={v.errorRateDelta} suffix="%" invert />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className={cn('font-mono text-xs', v.crashFree < 99 && 'text-destructive font-medium')}>{v.crashFree}%</span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className={cn(
                                        'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                                        v.status === 'healthy' && 'bg-green-100 text-green-700',
                                        v.status === 'degraded' && 'bg-amber-100 text-amber-700',
                                        v.status === 'incident' && 'bg-red-100 text-red-700',
                                      )}>
                                        <span className={cn(
                                          'h-1.5 w-1.5 rounded-full',
                                          v.status === 'healthy' && 'bg-green-500',
                                          v.status === 'degraded' && 'bg-amber-500',
                                          v.status === 'incident' && 'bg-red-500',
                                        )} />
                                        {v.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      </>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── Targeting flow (LD-style) ─────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">
                  Targeting configuration
                  {activeChannel && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground inline-flex items-center gap-1.5">
                      for
                      <span className={cn('h-2 w-2 rounded-full shrink-0', getEnvColor(channels.findIndex((c) => c.name === activeChannel)).dot)} />
                      {activeChannel}
                    </span>
                  )}
                </h3>
              </div>

              {/* Flow container */}
              <div className="relative flex flex-col items-center">

                {/* "All traffic" label at top of chain */}
                <span className="text-xs text-muted-foreground font-medium">All traffic</span>
                <div className="w-px h-5 bg-border" />

                {/* ── On/Off card ──────────────────────────────── */}
                <div className="w-full rounded-lg border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">Flag is</span>
                      <Badge variant={channelEnabled ? 'default' : 'secondary'} className="text-xs">
                        {channelEnabled ? 'On' : 'Off'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {channelEnabled ? 'serving variations based on rules' : '— targeting is disabled'}
                      </span>
                    </div>
                    <Switch
                      checked={channelEnabled}
                      disabled={!!activeExecutionOnChannel}
                      onCheckedChange={() => {
                        if (activeChannel) {
                          handleToggleEnv(selectedFlag, activeChannel)
                        } else {
                          patchFlag(selectedFlag.id, { enabled: !selectedFlag.enabled }).then(() =>
                            getFlag(selectedFlag.id).then(setSelectedFlag),
                          )
                        }
                      }}
                    />
                  </div>
                </div>

                {/* ── When OFF: simple grey fallback ──────────── */}
                {!channelEnabled && (
                  <>
                    <div className="w-px h-6 bg-border" />
                    <div className="w-full rounded-lg border border-dashed bg-muted/30 p-5">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                        <span className="text-sm">
                          All traffic receives <span className="font-mono font-medium text-foreground">{formatVariant(channelDefault)}</span>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Turn the flag on to evaluate targeting rules.
                      </p>
                    </div>
                  </>
                )}

                {/* ── When ON: full rules chain ──────────────── */}
                {channelEnabled && (
                  <>
                    <div className="w-px h-6 bg-border" />

                    {/* ── Rules chain ──────────────────────────── */}
                    {channelRules.map((rule, i) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        index={i}
                        flag={selectedFlag}
                        disabled={!!activeExecutionOnChannel}
                        onUpdate={async (patch) => {
                          await patchFlagRule(selectedFlag.id, rule.id, patch)
                          const updated = await getFlag(selectedFlag.id)
                          setSelectedFlag(updated)
                          const flagData = await listFlags()
                          setFlags(flagData)
                        }}
                        onDelete={() => setConfirmDeleteRule(rule)}
                      />
                    ))}

                    {/* ── Add rule button ───────────────────────── */}
                    <button
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full border bg-card transition-colors',
                        !!activeExecutionOnChannel
                          ? 'text-muted-foreground/50 cursor-not-allowed'
                          : 'text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer',
                      )}
                      onClick={() => !activeExecutionOnChannel && setShowAddRule(true)}
                      title={activeExecutionOnChannel ? 'Disabled while linked to an active rollout' : 'Add targeting rule'}
                      disabled={!!activeExecutionOnChannel}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <div className="w-px h-6 bg-border" />

                    {/* ── Default cohort ────────────────────────── */}
                    <div className="w-full rounded-lg border bg-card overflow-hidden">
                      <div className="px-5 py-4">
                        <span className="text-sm font-semibold">Default cohort</span>
                        <p className="text-xs text-muted-foreground mt-0.5">Traffic that doesn't match any rule above</p>
                      </div>
                      <div className="border-t px-5 py-4 space-y-3">
                        {selectedFlag.variations.length > 0 ? (
                          <>
                            {/* Bar showing which variation is the default */}
                            <div className="flex h-2.5 rounded-full bg-muted overflow-hidden">
                              {selectedFlag.variations.map((v, i) => {
                                const isDefault = JSON.stringify(v.value) === JSON.stringify(channelDefault)
                                return (
                                  <div
                                    key={v.id}
                                    className={cn('h-full', VARIATION_COLORS[i % VARIATION_COLORS.length])}
                                    style={{ width: isDefault ? '100%' : '0%', transition: 'width 0.3s' }}
                                  />
                                )
                              })}
                            </div>

                            {/* LD-style variation chips — click to change default */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Serve</span>
                              {selectedFlag.variations.map((v, i) => {
                                const isDefault = JSON.stringify(v.value) === JSON.stringify(channelDefault)
                                return (
                                  <div key={v.id} className="flex items-center gap-1">
                                    {i > 0 && <span className="text-muted-foreground mx-1">→</span>}
                                    <button
                                      className={cn(
                                        'flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors',
                                        !!activeExecutionOnChannel
                                          ? 'cursor-not-allowed opacity-60'
                                          : 'cursor-pointer',
                                        isDefault
                                          ? 'border-primary/50 bg-primary/5'
                                          : activeExecutionOnChannel
                                            ? 'border-transparent bg-muted/50'
                                            : 'border-transparent bg-muted/50 hover:bg-muted',
                                      )}
                                      disabled={!!activeExecutionOnChannel}
                                      onClick={async () => {
                                        if (activeExecutionOnChannel) return
                                        if (activeChannel) {
                                          await patchFlagEnvSetting(selectedFlag.id, activeChannel, { defaultValue: v.value })
                                        } else {
                                          await patchFlag(selectedFlag.id, { defaultValue: v.value })
                                        }
                                        const updated = await getFlag(selectedFlag.id)
                                        setSelectedFlag(updated)
                                      }}
                                    >
                                      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', VARIATION_COLORS[i % VARIATION_COLORS.length])} />
                                      <span className="text-xs">{v.name || formatVariant(v.value)}</span>
                                      <span className="text-xs font-medium">{isDefault ? '100%' : '0%'}</span>
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Serves</span>
                            <VariationChip value={channelDefault} />
                            <span className="text-muted-foreground">to remaining traffic</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

              </div>
            </div>

            {/* Delete zone */}
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Delete flag</p>
                <p className="text-xs text-muted-foreground">
                  {selectedFlag.activeExecutions?.length > 0
                    ? 'Cannot delete while linked to an active rollout execution.'
                    : 'This action cannot be undone. All targeting rules will be removed.'}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedFlag.activeExecutions?.length > 0}
                onClick={() => setConfirmDeleteFlag(selectedFlag.id)}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Delete flag
              </Button>
            </div>
          </div>
        </div>

        {/* Right sidebar - LD style */}
        <div className="w-72 shrink-0 border-l overflow-y-auto">
          <div className="p-5 space-y-5">
            <SidebarField label="Key">
              <div className="flex items-center gap-1.5">
                <code className="text-xs font-mono truncate">{selectedFlag.key}</code>
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => copyKey(selectedFlag.key)}
                >
                  {copiedKey ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </SidebarField>

            <SidebarField label="Description">
              <p className="text-xs text-muted-foreground">
                {selectedFlag.description || 'No description'}
              </p>
            </SidebarField>

            <SidebarField label="Type">
              <Badge variant="outline" className="text-xs capitalize">
                {selectedFlag.flagType}
              </Badge>
            </SidebarField>

            <SidebarField label="Environments">
              {channels.length === 0 ? (
                <p className="text-xs text-muted-foreground">No channels configured</p>
              ) : (
                <div className="space-y-1.5">
                  {channels.map((ch) => {
                    const env = selectedFlag.envSettings.find((s) => s.channelName === ch.name)
                    const enabled = env ? env.enabled : selectedFlag.enabled
                    return (
                      <div key={ch.name} className="flex items-center justify-between">
                        <span className="text-xs">{ch.name}</span>
                        <Badge variant={enabled ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4">
                          {enabled ? 'On' : 'Off'}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </SidebarField>

            <SidebarField label={
              <div className="flex items-center justify-between w-full">
                <span>Variations</span>
                {selectedFlag.variations.length > 0 && !activeExecutionOnChannel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (editingVariations) {
                        setEditingVariations(false)
                        setEditVariationDrafts({})
                      } else {
                        const drafts: Record<number, { name: string; value: string }> = {}
                        selectedFlag.variations.forEach((v) => {
                          drafts[v.id] = {
                            name: v.name || '',
                            value: typeof v.value === 'string' ? v.value : JSON.stringify(v.value),
                          }
                        })
                        setEditVariationDrafts(drafts)
                        setEditingVariations(true)
                      }
                    }}
                  >
                    {editingVariations ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  </Button>
                )}
              </div>
            }>
              <div className="space-y-1.5">
                {selectedFlag.variations.length > 0 ? (
                  editingVariations ? (
                    <>
                      {selectedFlag.variations.map((v, i) => (
                        <div key={v.id} className="flex items-center gap-1.5">
                          <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[i % VARIATION_COLORS.length])} />
                          <input
                            value={editVariationDrafts[v.id]?.name ?? ''}
                            onChange={(e) => setEditVariationDrafts((prev) => ({
                              ...prev,
                              [v.id]: { ...prev[v.id], name: e.target.value },
                            }))}
                            placeholder="Name"
                            className="w-full text-xs h-6 px-1.5 border rounded bg-background"
                          />
                          <input
                            value={editVariationDrafts[v.id]?.value ?? ''}
                            onChange={(e) => setEditVariationDrafts((prev) => ({
                              ...prev,
                              [v.id]: { ...prev[v.id], value: e.target.value },
                            }))}
                            placeholder="Value"
                            className="w-full text-xs h-6 px-1.5 border rounded bg-background font-mono"
                          />
                        </div>
                      ))}
                      <Button
                        size="sm"
                        className="h-6 text-xs w-full mt-1"
                        disabled={savingVariations}
                        onClick={async () => {
                          setSavingVariations(true)
                          try {
                            for (const v of selectedFlag.variations) {
                              const draft = editVariationDrafts[v.id]
                              if (!draft) continue
                              const parsedValue = selectedFlag.flagType === 'string' ? draft.value
                                : selectedFlag.flagType === 'number' ? Number(draft.value)
                                : selectedFlag.flagType === 'boolean' ? draft.value === 'true'
                                : (() => { try { return JSON.parse(draft.value) } catch { return draft.value } })()
                              await patchFlagVariation(selectedFlag.id, v.id, {
                                name: draft.name || undefined,
                                value: parsedValue,
                              })
                            }
                            const updated = await getFlag(selectedFlag.id)
                            setSelectedFlag(updated)
                            setEditingVariations(false)
                            setEditVariationDrafts({})
                            loadData()
                          } finally {
                            setSavingVariations(false)
                          }
                        }}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        {savingVariations ? 'Saving...' : 'Save variations'}
                      </Button>
                    </>
                  ) : (
                    selectedFlag.variations.map((v, i) => (
                      <div key={v.id} className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', VARIATION_COLORS[i % VARIATION_COLORS.length])} />
                        <span className="text-xs">{v.name || formatVariant(v.value)}</span>
                      </div>
                    ))
                  )
                ) : (
                  <code className="text-xs">{formatVariant(selectedFlag.defaultValue)}</code>
                )}
              </div>
            </SidebarField>

            <SidebarField label="Created by">
              <div className="flex items-center gap-2">
                {selectedFlag.createdByName && (
                  <div
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white text-[9px] font-semibold',
                      avatarColor(selectedFlag.createdByName),
                    )}
                  >
                    {getInitials(selectedFlag.createdByName)}
                  </div>
                )}
                <div className="flex flex-col">
                  {selectedFlag.createdByName && (
                    <span className="text-xs text-foreground">{selectedFlag.createdByName}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(selectedFlag.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </SidebarField>

            <SidebarField label="Updated">
              <span className="text-xs text-muted-foreground">
                {new Date(selectedFlag.updatedAt).toLocaleDateString()}
              </span>
            </SidebarField>

            <Separator />

            <button
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full"
              onClick={() => {
                setShowAudit(!showAudit)
                if (!showAudit) loadAuditLog(selectedFlag.id)
              }}
            >
              <History className="h-3.5 w-3.5" />
              <span className="font-medium">Audit history</span>
              <ChevronRight className={cn('h-3 w-3 ml-auto transition-transform', showAudit && 'rotate-90')} />
            </button>

            {showAudit && (
              <div className="space-y-2">
                {loadingAudit ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : auditLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No audit history yet</p>
                ) : (
                  auditLog.map((entry) => (
                    <div key={entry.id} className="rounded border px-3 py-2 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{formatAuditAction(entry.action)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {entry.actorName ? (
                        <p className="text-[10px] text-muted-foreground">
                          by {entry.actorName}
                        </p>
                      ) : entry.action.startsWith('flag.rollout') ? (
                        <p className="text-[10px] text-muted-foreground">
                          by rollout{(entry.details as Record<string, unknown>)?.channel ? ` on ${(entry.details as Record<string, unknown>).channel}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Add Rule Dialog */}
        <Dialog open={showAddRule} onOpenChange={setShowAddRule}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Add targeting rule
                {activeChannel && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground inline-flex items-center gap-1.5">
                    for
                    <span className={cn('h-2 w-2 rounded-full shrink-0', getEnvColor(channels.findIndex((c) => c.name === activeChannel)).dot)} />
                    {activeChannel}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Rule type</Label>
                <Select value={ruleType} onValueChange={(v) => {
                  setRuleType(v)
                  // Init rollout weights evenly when switching to percentage
                  if (v === 'percentage_rollout' && selectedFlag.variations.length > 0) {
                    const even = Math.floor(100 / selectedFlag.variations.length)
                    const weights: Record<number, number> = {}
                    selectedFlag.variations.forEach((vr, i) => {
                      weights[vr.id] = i === 0 ? 100 - even * (selectedFlag.variations.length - 1) : even
                    })
                    setRuleRolloutWeights(weights)
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage_rollout">Percentage rollout</SelectItem>
                    <SelectItem value="user_list">User list</SelectItem>
                    <SelectItem value="attribute">Attribute match</SelectItem>
                    <SelectItem value="ota_update">OTA update</SelectItem>
                    <SelectItem value="segment">Segment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Serve variation (for user_list) */}
              {ruleType !== 'percentage_rollout' && (
                <div className="space-y-1.5">
                  <Label>Serve variation</Label>
                  {selectedFlag.variations.length > 0 ? (
                    <Select value={ruleVariant} onValueChange={setRuleVariant}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select variation" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedFlag.variations.map((v, i) => (
                          <SelectItem key={v.id} value={String(JSON.stringify(v.value))}>
                            <span className="flex items-center gap-2">
                              <span className={cn('h-2 w-2 rounded-full', VARIATION_COLORS[i % VARIATION_COLORS.length])} />
                              {v.name || formatVariant(v.value)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={ruleVariant}
                      onChange={(e) => setRuleVariant(e.target.value)}
                      placeholder="value"
                    />
                  )}
                </div>
              )}

              {/* Rollout weights (for percentage_rollout) */}
              {ruleType === 'percentage_rollout' && (
                <div className="space-y-3">
                  <Label>Rollout distribution</Label>
                  {selectedFlag.variations.map((v, i) => (
                    <div key={v.id} className="flex items-center gap-3">
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', VARIATION_COLORS[i % VARIATION_COLORS.length])} />
                      <span className="text-sm min-w-[80px] truncate">{v.name || formatVariant(v.value)}</span>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={ruleRolloutWeights[v.id] ?? 0}
                        onChange={(e) => setRuleRolloutWeights((prev) => ({ ...prev, [v.id]: Number(e.target.value) }))}
                        className="w-20 h-8 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  ))}
                  {(() => {
                    const total = Object.values(ruleRolloutWeights).reduce((a, b) => a + b, 0)
                    return total !== 100 ? (
                      <p className="text-xs text-destructive">Weights must sum to 100% (currently {total}%)</p>
                    ) : null
                  })()}
                  <p className="text-xs text-muted-foreground">
                    Deterministic hashing on device/user ID for consistent bucketing.
                  </p>
                </div>
              )}

              {ruleType === 'user_list' && (
                <div className="space-y-1.5">
                  <Label>User IDs (comma-separated)</Label>
                  <Input
                    value={ruleUserIds}
                    onChange={(e) => setRuleUserIds(e.target.value)}
                    placeholder="user-123, user-456"
                  />
                </div>
              )}

              {ruleType === 'ota_update' && (
                <div className="space-y-3">
                  <Label>OTA targeting</Label>
                  <p className="text-xs text-muted-foreground">
                    Target devices based on their OTA update state — which branch they're on, which runtime version they're running, or how recently they updated.
                  </p>
                  <div className="space-y-3">
                    <Select value={ruleOtaMatchBy} onValueChange={(v) => setRuleOtaMatchBy(v as 'branch' | 'runtime_version' | 'updated_since')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="branch">On branch</SelectItem>
                        <SelectItem value="runtime_version">Runtime version</SelectItem>
                        <SelectItem value="updated_since">Updated within</SelectItem>
                      </SelectContent>
                    </Select>
                    {ruleOtaMatchBy === 'branch' && (
                      <Input
                        value={ruleOtaBranch}
                        onChange={(e) => setRuleOtaBranch(e.target.value)}
                        placeholder="e.g. canary, staging, main"
                      />
                    )}
                    {ruleOtaMatchBy === 'runtime_version' && (
                      <div className="flex items-center gap-2">
                        <Select value={ruleOtaVersionOp} onValueChange={setRuleOtaVersionOp}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="semver_gte">&ge; at least</SelectItem>
                            <SelectItem value="semver_gt">&gt; above</SelectItem>
                            <SelectItem value="semver_lte">&le; at most</SelectItem>
                            <SelectItem value="semver_lt">&lt; below</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={ruleOtaVersion}
                          onChange={(e) => setRuleOtaVersion(e.target.value)}
                          placeholder="e.g. 2.4.0"
                          className="flex-1 font-mono"
                        />
                      </div>
                    )}
                    {ruleOtaMatchBy === 'updated_since' && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">last</span>
                        <Input
                          type="number"
                          min="1"
                          value={ruleOtaDays}
                          onChange={(e) => setRuleOtaDays(e.target.value)}
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {ruleType === 'segment' && (
                <div className="space-y-1.5">
                  <Label>Segment</Label>
                  <Select value={ruleSegmentKey} onValueChange={setRuleSegmentKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a segment" />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((seg) => (
                        <SelectItem key={seg.key} value={seg.key}>
                          <div className="flex items-center gap-2">
                            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{seg.name}</span>
                            <span className="text-[10px] text-muted-foreground">~{seg.estimatedDevices.toLocaleString()} devices</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {ruleSegmentKey && (() => {
                    const seg = segments.find((s) => s.key === ruleSegmentKey)
                    if (!seg) return null
                    return (
                      <div className="rounded-lg border bg-muted/30 p-3 mt-2">
                        <p className="text-xs text-muted-foreground mb-2">{seg.description}</p>
                        <div className="space-y-1">
                          {seg.conditions.map((cond, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs">
                              {i > 0 && <span className="text-[10px] text-muted-foreground font-medium uppercase">{seg.matchType === 'all' ? 'AND' : 'OR'}</span>}
                              <code className="font-mono">{cond.attribute}</code>
                              <span className="text-muted-foreground">{cond.operator}</span>
                              <code className="font-mono text-muted-foreground">{cond.values.join(', ')}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {ruleType === 'attribute' && (
                <div className="space-y-3">
                  <Label>Conditions <span className="text-muted-foreground font-normal">(all must match)</span></Label>
                  {ruleConditions.map((cond, ci) => (
                    <div key={ci} className="flex items-start gap-2">
                      <Input
                        className="flex-1"
                        value={cond.attribute}
                        onChange={(e) => {
                          const next = [...ruleConditions]
                          next[ci] = { ...next[ci], attribute: e.target.value }
                          setRuleConditions(next)
                        }}
                        placeholder="attribute (e.g. plan)"
                      />
                      <Select
                        value={cond.operator}
                        onValueChange={(v) => {
                          const next = [...ruleConditions]
                          next[ci] = { ...next[ci], operator: v }
                          setRuleConditions(next)
                        }}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="eq">equals</SelectItem>
                          <SelectItem value="neq">not equals</SelectItem>
                          <SelectItem value="in">is one of</SelectItem>
                          <SelectItem value="not_in">is not one of</SelectItem>
                          <SelectItem value="contains">contains</SelectItem>
                          <SelectItem value="starts_with">starts with</SelectItem>
                          <SelectItem value="ends_with">ends with</SelectItem>
                          <SelectItem value="gt">&gt;</SelectItem>
                          <SelectItem value="gte">&ge;</SelectItem>
                          <SelectItem value="lt">&lt;</SelectItem>
                          <SelectItem value="lte">&le;</SelectItem>
                          <SelectItem value="exists">exists</SelectItem>
                          <SelectItem value="not_exists">not exists</SelectItem>
                          <SelectItem value="semver_gt">semver &gt;</SelectItem>
                          <SelectItem value="semver_gte">semver &ge;</SelectItem>
                          <SelectItem value="semver_lt">semver &lt;</SelectItem>
                          <SelectItem value="semver_lte">semver &le;</SelectItem>
                        </SelectContent>
                      </Select>
                      {!['exists', 'not_exists'].includes(cond.operator) && (
                        <Input
                          className="flex-1"
                          value={cond.values}
                          onChange={(e) => {
                            const next = [...ruleConditions]
                            next[ci] = { ...next[ci], values: e.target.value }
                            setRuleConditions(next)
                          }}
                          placeholder={['in', 'not_in'].includes(cond.operator) ? 'val1, val2' : 'value'}
                        />
                      )}
                      {ruleConditions.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => setRuleConditions(ruleConditions.filter((_, i) => i !== ci))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRuleConditions([...ruleConditions, { attribute: '', operator: 'eq', values: '' }])}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add condition
                  </Button>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Priority (lower = evaluated first)</Label>
                <Input
                  type="number"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddRule(false)
                    resetRuleForm()
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddRule} disabled={addingRule}>
                  {addingRule ? 'Adding...' : 'Add rule'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete flag confirmation */}
        <AlertDialog open={confirmDeleteFlag !== null} onOpenChange={(open) => !open && setConfirmDeleteFlag(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete flag</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <span className="font-semibold">{selectedFlag.name}</span>?
                This will permanently remove the flag and all its targeting rules. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault()
                  if (confirmDeleteFlag) handleDelete(confirmDeleteFlag)
                }}
              >
                {deleting ? 'Deleting...' : 'Delete flag'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete rule confirmation */}
        <AlertDialog open={confirmDeleteRule !== null} onOpenChange={(open) => !open && setConfirmDeleteRule(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete targeting rule</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this{' '}
                <span className="font-semibold">
                  {ruleTypeLabel(confirmDeleteRule?.ruleType ?? '').toLowerCase()}
                </span>{' '}
                rule? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault()
                  if (confirmDeleteRule) handleDeleteRule(confirmDeleteRule)
                }}
              >
                {deleting ? 'Deleting...' : 'Delete rule'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────

  // Column width for each env channel
  const envColWidth = channels.length > 0 ? Math.max(140, Math.min(220, 600 / channels.length)) : 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Flags</h2>
            <p className="text-sm text-muted-foreground">Control feature rollouts across environments</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowSetupModal(true)}>
              <Code className="mr-1 h-4 w-4" /> Setup guide
            </Button>
            {flags.length > 0 && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-1 h-4 w-4" /> Create flag
              </Button>
            )}
          </div>
        </div>

        {/* Search + Environment tabs */}
        {(loading || flags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flags by name, description or key"
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Environment column headers */}
          {channels.length > 0 && (
            <div className="flex items-center gap-0 ml-auto shrink-0">
              {channels.map((ch, i) => {
                const color = getEnvColor(i)
                return (
                  <button
                    key={ch.name}
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium px-4 py-1 transition-colors cursor-pointer rounded-md',
                      activeChannel === ch.name
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    style={{ width: envColWidth }}
                    onClick={() => setActiveChannel(ch.name)}
                  >
                    <span className={cn('h-2 w-2 rounded-full shrink-0', color.dot)} />
                    <span className="truncate">{ch.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Flag list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-0 divide-y">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-8 py-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                {channels.map((_, ci) => (
                  <Skeleton key={ci} className="h-8 rounded" style={{ width: envColWidth }} />
                ))}
              </div>
            ))}
          </div>
        ) : filteredFlags.length === 0 && flags.length === 0 ? (
          <EmptyState onCreateFlag={() => setShowCreate(true)} onSetupGuide={() => setShowSetupModal(true)} />
        ) : filteredFlags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-sm text-muted-foreground">No flags match your search.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredFlags.map((flag) => (
              <div
                key={flag.id}
                className="flex items-center gap-4 px-8 py-3.5 cursor-pointer transition-colors hover:bg-muted/30 group"
                onClick={() => openFlagDetail(flag.id)}
              >
                {/* Flag info */}
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm truncate block">
                    {flag.name || flag.key}
                  </span>
                  {flag.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {flag.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    {flag.createdByName && (
                      <div
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white text-[9px] font-semibold',
                          avatarColor(flag.createdByName),
                        )}
                        title={flag.createdByName}
                      >
                        {getInitials(flag.createdByName)}
                      </div>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(flag.createdAt)}
                    </span>
                    <code className="text-[11px] text-muted-foreground font-mono">
                      {flag.key}
                    </code>
                    {(() => {
                      const health = flagHealthCache[flag.id]
                      if (!health || health.summary.status === 'healthy') return null
                      // Find the worst variation to give context
                      const worstVariation = health.variations
                        .filter((v) => v.status !== 'healthy')
                        .sort((a, b) => b.errorRate - a.errorRate)[0]
                      return (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-medium ml-1 px-1.5 py-0.5 rounded-full',
                          health.summary.status === 'incident' && 'bg-destructive/10 text-destructive',
                          health.summary.status === 'degraded' && 'bg-amber-500/10 text-amber-600',
                        )}>
                          <span className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0',
                            health.summary.status === 'incident' && 'bg-destructive animate-pulse',
                            health.summary.status === 'degraded' && 'bg-amber-500',
                          )} />
                          {worstVariation
                            ? `${worstVariation.variationName} ${health.summary.errorRate}% errors`
                            : `${health.summary.errorRate}% error rate`
                          }
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* Environment columns */}
                {channels.length > 0 ? (
                  <div className="flex items-center gap-0 shrink-0">
                    {channels.map((ch, i) => {
                      const enabled = isEnabledForChannel(flag, ch.name)
                      const color = getEnvColor(i)
                      const channelRules = flag.rules.filter(
                        (r) => r.channelName === ch.name || r.channelName === null,
                      )
                      const envSetting = flag.envSettings.find((s) => s.channelName === ch.name)
                      const defaultVal = envSetting ? envSetting.defaultValue : flag.defaultValue

                      // Build bar segments from rollout or default
                      let barSegments: { color: string; weight: number }[] = []
                      if (enabled) {
                        const pctRule = channelRules.find((r) => r.ruleType === 'percentage_rollout')
                        const rollout = pctRule ? (pctRule.ruleConfig as Record<string, unknown>)?.rollout as Array<{ variationId: number; weight: number }> | undefined : undefined
                        if (rollout && rollout.length > 0 && flag.variations.length > 0) {
                          barSegments = rollout.map((entry) => {
                            const vi = flag.variations.findIndex((v) => v.id === entry.variationId)
                            return { color: VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : 0], weight: entry.weight }
                          })
                        } else if (pctRule && flag.variations.length === 0) {
                          // Legacy single percentage
                          const pct = Number((pctRule.ruleConfig as Record<string, unknown>)?.percentage ?? 0)
                          barSegments = [
                            { color: 'bg-green-500', weight: pct },
                            { color: 'bg-blue-500', weight: 100 - pct },
                          ]
                        } else if (flag.variations.length > 0) {
                          // No rollout rule — 100% to the default variation
                          const vi = flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(defaultVal))
                          barSegments = [{ color: VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : 0], weight: 100 }]
                        } else {
                          barSegments = [{ color: color.bar, weight: 100 }]
                        }
                      }

                      return (
                        <div
                          key={ch.name}
                          className="flex flex-col items-end gap-1 px-3"
                          style={{ width: envColWidth }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Zap className="h-3 w-3" />
                              {(() => { const c = flag.evalByChannel7d?.[ch.name] ?? 0; return c >= 1000 ? `${(c / 1000).toFixed(1)}K` : c })()}
                            </span>
                            <span
                              className={cn(
                                'text-xs font-medium',
                                enabled ? color.text : 'text-muted-foreground',
                              )}
                            >
                              {enabled ? 'On' : 'Off'}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden flex">
                            {enabled && barSegments.map((seg, si) => (
                              <div
                                key={si}
                                className={cn('h-full transition-all', seg.color)}
                                style={{ width: `${seg.weight}%` }}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <Badge
                    variant={flag.enabled ? 'default' : 'secondary'}
                    className="min-w-[32px] justify-center shrink-0"
                  >
                    {flag.enabled ? 'On' : 'Off'}
                  </Badge>
                )}

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {flags.length > 0 && (
        <div className="border-t px-8 py-2 text-xs text-muted-foreground">
          {filteredFlags.length} of {flags.length} flag{flags.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Create Flag Dialog - LD style with Name + Key side by side */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open)
          if (!open) {
            setNewName('')
            setNewKey('')
            setNewKeyManual(false)
            setNewType('boolean')
            setNewDescription('')
            setNewVariations([{ value: '', name: 'Variation 1' }, { value: '', name: 'Variation 2' }])
            setError('')
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create flag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name + Key side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    if (!newKeyManual) {
                      setNewKey(slugify(e.target.value))
                    }
                  }}
                  placeholder="Enable new checkout"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Key <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={newKey}
                  onChange={(e) => {
                    setNewKey(e.target.value)
                    setNewKeyManual(true)
                  }}
                  placeholder="enable-new-checkout"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe what this flag controls..."
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>

            {/* Flag type + Variations */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Flag type</Label>
              </div>
              <Select value={newType} onValueChange={(v) => {
                setNewType(v)
                if (v !== 'boolean') {
                  setNewVariations([{ value: '', name: 'Variation 1' }, { value: '', name: 'Variation 2' }])
                }
              }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>

              <Label>Variations</Label>

              {newType === 'boolean' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      true
                    </Badge>
                    <Badge variant="outline" className="gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      false
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Serve <strong>false</strong> when the flag is off, and targeting rules determine which variation to serve when on.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {newVariations.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        VARIATION_COLORS[i % VARIATION_COLORS.length],
                      )} />
                      <Input
                        value={v.name}
                        onChange={(e) => {
                          const updated = [...newVariations]
                          updated[i] = { ...updated[i], name: e.target.value }
                          setNewVariations(updated)
                        }}
                        placeholder="Name"
                        className="flex-1 h-8 text-sm"
                      />
                      <Input
                        value={v.value}
                        onChange={(e) => {
                          const updated = [...newVariations]
                          updated[i] = { ...updated[i], value: e.target.value }
                          setNewVariations(updated)
                        }}
                        placeholder={newType === 'number' ? '0' : newType === 'json' ? '{}' : 'value'}
                        className="flex-1 h-8 text-sm font-mono"
                      />
                      {newVariations.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => setNewVariations(newVariations.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setNewVariations([
                        ...newVariations,
                        { value: '', name: `Variation ${newVariations.length + 1}` },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add variation
                  </Button>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newKey.trim()}
              >
                {creating ? 'Creating...' : 'Create flag'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Setup guide modal */}
      <SetupGuideModal
        open={showSetupModal}
        onOpenChange={setShowSetupModal}
        flag={selectedFlag}
        copiedSnippet={copiedSnippet}
        onCopy={copySnippet}
      />
    </div>
  )
}

// ── Setup guide modal ───────────────────────────────────────────────────

function SetupGuideModal({
  open,
  onOpenChange,
  flag,
  copiedSnippet,
  onCopy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  flag: FlagWithDetailsRecord | null
  copiedSnippet: string | null
  onCopy: (id: string, text: string) => void
}) {
  const flagKey = flag?.key ?? 'my-feature'
  const flagType = flag?.flagType ?? 'boolean'
  const defaultVal = flag?.defaultValue ?? false
  const defaultStr = typeof defaultVal === 'string' ? `'${defaultVal}'` : String(defaultVal)

  const hookFn = flagType === 'boolean' ? 'useBooleanFlagValue'
    : flagType === 'number' ? 'useNumberFlagValue'
    : flagType === 'string' ? 'useStringFlagValue'
    : 'useObjectFlagValue'
  const evalFn = flagType === 'boolean' ? 'getBooleanValue'
    : flagType === 'number' ? 'getNumberValue'
    : flagType === 'string' ? 'getStringValue'
    : 'getObjectValue'

  const installCmd = `npm install @appdispatch/react-native @openfeature/react-sdk`
  const setupCode = `import { OpenFeature, OpenFeatureProvider } from '@openfeature/react-sdk'
import { DispatchProvider } from '@appdispatch/react-native'

OpenFeature.setProvider(
  new DispatchProvider({
    serverUrl: '${window.location.origin}',
    projectSlug: 'YOUR_PROJECT_SLUG',
    apiKey: 'YOUR_API_KEY',
    channel: 'production',
  })
)

function App() {
  return (
    <OpenFeatureProvider>
      <MyComponent />
    </OpenFeatureProvider>
  )
}`
  const usageCode = `import { ${hookFn} } from '@openfeature/react-sdk'

function MyComponent() {
  const value = ${hookFn}('${flagKey}', ${defaultStr})
  ${flagType === 'boolean' ? `
  if (value) {
    // Flag is enabled
  }` : `// Use value...`}
}`
  const serverCode = `import { OpenFeature } from '@openfeature/server-sdk'
import { DispatchProvider } from '@appdispatch/react-native'

OpenFeature.setProvider(
  new DispatchProvider({ ... })
)

const client = OpenFeature.getClient()
const value = await client.${evalFn}('${flagKey}', ${defaultStr})`

  const snippets = [
    { id: 'install', label: '1. Install', content: installCmd, isCommand: true },
    { id: 'setup', label: '2. Setup provider', content: setupCode },
    { id: 'usage', label: '3. Use in React', content: usageCode },
    { id: 'server', label: '4. Server-side (Node.js)', content: serverCode },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Setup guide</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {flag
              ? <>Get started with the <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">{flagKey}</code> flag in your app.</>
              : 'Get started with feature flags in your app.'}
          </p>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {snippets.map((s) => (
            <div key={s.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</span>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => onCopy(s.id, s.content)}
                >
                  {copiedSnippet === s.id ? (
                    <><Check className="h-3 w-3 text-green-500" /> Copied</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copy</>
                  )}
                </button>
              </div>
              <pre className="text-xs bg-muted rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
                {s.isCommand && <span className="text-muted-foreground select-none">$ </span>}{s.content}
              </pre>
            </div>
          ))}

          <div className="pt-1 border-t">
            <a
              href="https://www.npmjs.com/package/@appdispatch/react-native"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              View package on npm →
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Empty / onboarding state ─────────────────────────────────────────────

function EmptyState({ onCreateFlag, onSetupGuide }: { onCreateFlag: () => void; onSetupGuide: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-12 py-20">
        <div className="grid grid-cols-2 gap-16 items-start">
          {/* Left — Copy */}
          <div className="space-y-6 pt-8">
            <h2 className="text-3xl font-bold tracking-tight leading-tight">
              Ship with confidence using feature flags
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Feature flags let you decouple deployments from releases. Push code anytime, then
              control who sees what — by environment, user segment, or percentage rollout. Evaluate
              flags locally on-device with no extra network calls.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Works with the <a href="https://openfeature.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenFeature</a> standard.
              Install <code className="text-xs bg-muted px-1 py-0.5 rounded">@appdispatch/react-native</code> in
              your app to get started.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <Button size="lg" onClick={onCreateFlag}>
                <Flag className="mr-2 h-4 w-4" /> Create your first flag
              </Button>
              <Button size="lg" variant="outline" onClick={onSetupGuide}>
                <Code className="mr-2 h-4 w-4" /> Setup guide
              </Button>
            </div>
          </div>

          {/* Right — Product preview card */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {/* Mini header */}
            <div className="border-b px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Flag className="h-4 w-4" />
              <span className="font-medium text-foreground">Flags</span>
              <span>/</span>
              <span>enable-checkout-v2</span>
            </div>

            {/* Fake environment tabs */}
            <div className="border-b px-5 py-2.5 flex items-center gap-6 text-sm">
              {[
                { name: 'Production', color: 'bg-green-500' },
                { name: 'Staging', color: 'bg-yellow-500' },
                { name: 'Development', color: 'bg-blue-500' },
              ].map((env) => (
                <div key={env.name} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${env.color}`} />
                  <span className={env.name === 'Production' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                    {env.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Mock targeting section */}
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Targeting</span>
                  <span className="inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-700">On</span>
                </div>
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Percent className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-muted-foreground">Percentage rollout —</span>
                    <span className="font-medium">25% of users</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-1/4 rounded-full bg-blue-500" />
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-muted-foreground">User list —</span>
                    <span className="font-medium">3 users</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">Default value</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono">false</span>
                  <span className="text-xs text-muted-foreground">boolean</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Rule card (inline-editable) ─────────────────────────────────────────

import type { PatchRulePayload, PatchVariationPayload } from '../api/client'

function RuleCard({
  rule,
  index,
  flag,
  onUpdate,
  onDelete,
  disabled,
}: {
  rule: FlagTargetingRuleRecord
  index: number
  flag: FlagWithDetailsRecord
  onUpdate: (patch: PatchRulePayload) => Promise<void>
  onDelete: () => void
  disabled?: boolean
}) {
  const rollout = rule.ruleType === 'percentage_rollout'
    ? ((rule.ruleConfig as Record<string, unknown>)?.rollout as Array<{ variationId: number; weight: number }> | undefined)
    : undefined

  // Local state for editing weights — only saved on explicit Save
  const [localWeights, setLocalWeights] = useState<Record<number, number>>(() => {
    if (!rollout) return {}
    const w: Record<number, number> = {}
    rollout.forEach((e) => { w[e.variationId] = e.weight })
    return w
  })
  const [saving, setSaving] = useState(false)

  const localTotal = Object.values(localWeights).reduce((a, b) => a + b, 0)
  const isDirty = rollout ? rollout.some((e) => (localWeights[e.variationId] ?? e.weight) !== e.weight) : false
  const isValid = localTotal === 100

  async function handleSave() {
    if (!rollout || !isValid) return
    setSaving(true)
    try {
      const updated = rollout.map((entry) => ({
        ...entry,
        weight: localWeights[entry.variationId] ?? entry.weight,
      }))
      await onUpdate({ ruleConfig: { rollout: updated } })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full rounded-lg border bg-card overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
              {index + 1}
            </span>
            <RuleIcon ruleType={rule.ruleType} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {ruleTypeLabel(rule.ruleType)}
                </span>
                {rule.channelName ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                    {rule.channelName}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    global
                  </Badge>
                )}
              </div>
              {rule.ruleType !== 'percentage_rollout' && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ruleDescription(rule)}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* User list — serve variation (changeable) */}
        {rule.ruleType === 'user_list' && rule.variantValue != null && (
          <div className="border-t px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Serve</span>
              <Select
                disabled={disabled}
                value={String(flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue)))}
                onValueChange={async (val) => {
                  const variation = flag.variations[Number(val)]
                  if (variation) {
                    await onUpdate({ variantValue: variation.value })
                  }
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                  {(() => {
                    const vi = flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue))
                    const variation = vi >= 0 ? flag.variations[vi] : null
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : 0])} />
                        <span>{variation?.name || formatVariant(rule.variantValue)}</span>
                      </div>
                    )
                  })()}
                </SelectTrigger>
                <SelectContent>
                  {flag.variations.map((v, vi) => (
                    <SelectItem key={vi} value={String(vi)}>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi % VARIATION_COLORS.length])} />
                        <span>{v.name || formatVariant(v.value)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Attribute match — conditions + serve variation */}
        {rule.ruleType === 'attribute' && (() => {
          const conditions = ((rule.ruleConfig as Record<string, unknown>).conditions as Array<{ attribute: string; operator: string; values: string[] }>) ?? []
          return (
            <div className="border-t px-5 py-4 space-y-3">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Conditions</span>
                <div className="flex flex-wrap gap-1.5">
                  {conditions.map((c, ci) => {
                    const op = OPERATOR_LABELS[c.operator] ?? c.operator
                    return (
                      <span key={ci} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs font-mono">
                        <span className="text-foreground font-medium">{c.attribute}</span>
                        <span className="text-muted-foreground">{op}</span>
                        {c.values.length > 0 && <span className="text-foreground">{c.values.join(', ')}</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
              {rule.variantValue != null && flag.variations.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Serve</span>
                  <Select
                    disabled={disabled}
                    value={String(flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue)))}
                    onValueChange={async (val) => {
                      const variation = flag.variations[Number(val)]
                      if (variation) {
                        await onUpdate({ variantValue: variation.value })
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                      {(() => {
                        const vi = flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue))
                        const variation = vi >= 0 ? flag.variations[vi] : null
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : 0])} />
                            <span>{variation?.name || formatVariant(rule.variantValue)}</span>
                          </div>
                        )
                      })()}
                    </SelectTrigger>
                    <SelectContent>
                      {flag.variations.map((v, vi) => (
                        <SelectItem key={vi} value={String(vi)}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi % VARIATION_COLORS.length])} />
                            <span>{v.name || formatVariant(v.value)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )
        })()}

        {/* OTA update — targeting badge + serve variation */}
        {rule.ruleType === 'ota_update' && (() => {
          const config = rule.ruleConfig as Record<string, unknown>
          const matchBy = config.matchBy as string
          let label: string
          let detail: string
          if (matchBy === 'branch') {
            label = 'On branch'
            detail = String(config.branch ?? '?')
          } else if (matchBy === 'runtime_version') {
            const op = OPERATOR_LABELS[(config.operator as string) ?? 'semver_gte'] ?? '≥'
            label = `Runtime version ${op}`
            detail = String(config.version ?? '?')
          } else {
            label = 'Updated within'
            detail = `${config.withinDays ?? '?'} days`
          }
          return (
            <div className="border-t px-5 py-4 space-y-3">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">OTA condition</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 text-xs font-mono">
                    <RefreshCw className="h-3 w-3 text-cyan-500" />
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-semibold">{detail}</span>
                  </span>
                </div>
              </div>
              {rule.variantValue != null && flag.variations.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Serve</span>
                  <Select
                    disabled={disabled}
                    value={String(flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue)))}
                    onValueChange={async (val) => {
                      const variation = flag.variations[Number(val)]
                      if (variation) {
                        await onUpdate({ variantValue: variation.value })
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                      {(() => {
                        const vi = flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue))
                        const variation = vi >= 0 ? flag.variations[vi] : null
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : 0])} />
                            <span>{variation?.name || formatVariant(rule.variantValue)}</span>
                          </div>
                        )
                      })()}
                    </SelectTrigger>
                    <SelectContent>
                      {flag.variations.map((v, vi) => (
                        <SelectItem key={vi} value={String(vi)}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi % VARIATION_COLORS.length])} />
                            <span>{v.name || formatVariant(v.value)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )
        })()}

        {/* Segment condition */}
        {rule.ruleType === 'segment' && (() => {
          const config = rule.ruleConfig as Record<string, unknown>
          const segKey = config.segmentKey as string
          const seg = segments.find((s) => s.key === segKey)
          return (
            <div className="border-t px-5 py-4 space-y-3">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Segment</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 text-xs">
                    <Users className="h-3 w-3 text-indigo-500" />
                    <span className="font-medium">{seg?.name ?? segKey}</span>
                    {seg && (
                      <span className="text-muted-foreground">~{seg.estimatedDevices.toLocaleString()} devices</span>
                    )}
                  </span>
                </div>
                {seg && seg.conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {seg.conditions.map((cond, ci) => (
                      <span key={ci} className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {cond.attribute} {cond.operator} {cond.values.join(', ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {rule.variantValue != null && flag.variations.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Serve</span>
                  <Select
                    disabled={disabled}
                    value={String(flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue)))}
                    onValueChange={async (val) => {
                      const variation = flag.variations[Number(val)]
                      if (variation) {
                        await onUpdate({ variantValue: variation.value })
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                      {(() => {
                        const vi = flag.variations.findIndex((v) => JSON.stringify(v.value) === JSON.stringify(rule.variantValue))
                        const variation = vi >= 0 ? flag.variations[vi] : null
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : 0])} />
                            <span>{variation?.name || formatVariant(rule.variantValue)}</span>
                          </div>
                        )
                      })()}
                    </SelectTrigger>
                    <SelectContent>
                      {flag.variations.map((v, vi) => (
                        <SelectItem key={vi} value={String(vi)}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi % VARIATION_COLORS.length])} />
                            <span>{v.name || formatVariant(v.value)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )
        })()}

        {/* Percentage rollout — inline editable weights */}
        {rule.ruleType === 'percentage_rollout' && rollout && rollout.length > 0 && (
          <div className="border-t px-5 py-4 space-y-3">
            {/* Segmented bar — uses local weights */}
            <div className="flex h-2.5 rounded-full bg-muted overflow-hidden">
              {rollout.map((entry, ri) => {
                const vi = flag.variations.findIndex((v) => v.id === entry.variationId)
                const w = localWeights[entry.variationId] ?? entry.weight
                return (
                  <div
                    key={ri}
                    className={cn('h-full transition-all', VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : ri % VARIATION_COLORS.length])}
                    style={{ width: `${Math.max(0, Math.min(100, w))}%` }}
                  />
                )
              })}
            </div>

            {/* Editable variation weights — LD-style horizontal layout */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Serve</span>
              {rollout.map((entry, ri) => {
                const variation = flag.variations.find((v) => v.id === entry.variationId)
                const vi = flag.variations.findIndex((v) => v.id === entry.variationId)
                return (
                  <div key={ri} className="flex items-center gap-1">
                    {ri > 0 && <span className="text-muted-foreground mx-1">→</span>}
                    <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', VARIATION_COLORS[vi >= 0 ? vi % VARIATION_COLORS.length : ri % VARIATION_COLORS.length])} />
                      <span className="text-xs truncate max-w-[80px]">{variation?.name || formatVariant(variation?.value)}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={localWeights[entry.variationId] ?? entry.weight}
                        onChange={(e) => setLocalWeights((prev) => ({ ...prev, [entry.variationId]: Number(e.target.value) }))}
                        disabled={disabled}
                        className="w-12 h-5 text-xs text-right bg-transparent border-0 outline-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Validation + Save */}
            <div className="flex items-center justify-between">
              <span className={cn('text-xs', localTotal !== 100 ? 'text-destructive' : 'text-muted-foreground')}>
                Total: {localTotal}%{localTotal !== 100 && ' (must equal 100%)'}
              </span>
              {isDirty && (
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  disabled={!isValid || saving || disabled}
                  onClick={handleSave}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="w-px h-6 bg-border" />
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────

function VariationChip({ value }: { value: unknown }) {
  const isBool = typeof value === 'boolean'
  const label =
    typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : typeof value === 'string'
        ? `"${value}"`
        : JSON.stringify(value)

  return (
    <Badge variant="outline" className="gap-1.5 font-mono text-xs">
      {isBool && (
        <span
          className={`h-2 w-2 rounded-full ${value ? 'bg-green-500' : 'bg-blue-500'}`}
        />
      )}
      {label}
    </Badge>
  )
}

function SidebarField({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      {children}
    </div>
  )
}

function RuleIcon({ ruleType }: { ruleType: string }) {
  switch (ruleType) {
    case 'force':
      return <Zap className="h-4 w-4 text-amber-500" />
    case 'percentage_rollout':
      return <Percent className="h-4 w-4 text-blue-500" />
    case 'user_list':
      return <Users className="h-4 w-4 text-green-500" />
    case 'attribute':
      return <Filter className="h-4 w-4 text-purple-500" />
    case 'ota_update':
      return <RefreshCw className="h-4 w-4 text-cyan-500" />
    case 'segment':
      return <Users className="h-4 w-4 text-indigo-500" />
    default:
      return <Flag className="h-4 w-4" />
  }
}

function ruleTypeLabel(ruleType: string): string {
  switch (ruleType) {
    case 'force':
      return 'Force'
    case 'percentage_rollout':
      return 'Percentage rollout'
    case 'user_list':
      return 'User list'
    case 'attribute':
      return 'Attribute match'
    case 'ota_update':
      return 'OTA update'
    case 'segment':
      return 'Segment'
    default:
      return ruleType
  }
}

const OPERATOR_LABELS: Record<string, string> = {
  eq: '=', neq: '!=', in: 'in', not_in: 'not in',
  contains: 'contains', starts_with: 'starts with', ends_with: 'ends with',
  gt: '>', gte: '>=', lt: '<', lte: '<=',
  exists: 'exists', not_exists: 'not exists',
  semver_gt: 'semver >', semver_gte: 'semver >=', semver_lt: 'semver <', semver_lte: 'semver <=',
}

function ruleDescription(rule: FlagTargetingRuleRecord): string {
  const config = rule.ruleConfig as Record<string, unknown>
  switch (rule.ruleType) {
    case 'force':
      return 'Applies to all users'
    case 'percentage_rollout':
      return `${config.percentage ?? 0}% of users (deterministic hash)`
    case 'user_list': {
      const ids = (config.userIds as string[]) ?? []
      return `${ids.length} user${ids.length !== 1 ? 's' : ''}: ${ids.slice(0, 3).join(', ')}${ids.length > 3 ? '...' : ''}`
    }
    case 'ota_update': {
      const matchBy = config.matchBy as string
      if (matchBy === 'branch') return `On branch "${config.branch}"`
      if (matchBy === 'runtime_version') {
        const op = OPERATOR_LABELS[(config.operator as string) ?? 'semver_gte'] ?? '≥'
        return `Runtime version ${op} ${config.version}`
      }
      if (matchBy === 'updated_since') return `Updated within last ${config.withinDays} days`
      return 'OTA targeting'
    }
    case 'segment': {
      const segKey = config.segmentKey as string
      const seg = segments.find((s) => s.key === segKey)
      return seg ? `In segment "${seg.name}"` : `Segment: ${segKey}`
    }
    case 'attribute': {
      const conditions = (config.conditions as Array<{ attribute: string; operator: string; values: string[] }>) ?? []
      if (conditions.length === 0) return 'No conditions'
      const parts = conditions.map((c) => {
        const op = OPERATOR_LABELS[c.operator] ?? c.operator
        if (c.operator === 'exists' || c.operator === 'not_exists') return `${c.attribute} ${op}`
        return `${c.attribute} ${op} ${c.values.join(', ')}`
      })
      return parts.length <= 2 ? parts.join(' AND ') : `${parts.slice(0, 2).join(' AND ')} (+${parts.length - 2} more)`
    }
    default:
      return ''
  }
}

function FlagDeltaBadge({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (value === 0) return <Minus className="h-3 w-3 text-muted-foreground" />
  const isPositive = value > 0
  const isGood = invert ? !isPositive : isPositive
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-medium',
      isGood ? 'text-green-600' : 'text-destructive',
    )}>
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {isPositive ? '+' : ''}{value}{suffix}
    </span>
  )
}
