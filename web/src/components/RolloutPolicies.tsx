import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Plus,
  Trash2,
  ChevronRight,
  Shield,
  Zap,
  ArrowRight,
  Play,
  Pause,
  Square,
  SkipForward,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  AlertTriangle,
  TrendingUp,
  Search,
  Flag,
  FlagOff,
  Pencil,
  Lock,
  Undo2,
  ChevronDown,
  Radio,
  Package,
  Layers,
  Ban,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  listRolloutPolicies,
  createRolloutPolicy,
  updateRolloutPolicy,
  deleteRolloutPolicy,
  listRolloutExecutions,
  getRolloutExecution,
  pauseExecution,
  resumeExecution,
  cancelExecution,
  advanceExecution,
  revertExecutionFlag,
  listChannels,
} from '../api/client'
import type {
  RolloutPolicyRecord,
  RolloutExecutionRecord,
  RolloutExecutionDetailRecord,
  FlagListItemRecord,
} from '../api/client'

const USE_MOCK = import.meta.env.VITE_MOCK === 'true'

// ── Mock Types ──────────────────────────────────────────────────────────

interface Threshold {
  id: string
  metricType: string
  operator: string
  value: number
  action: 'gate' | 'rollback'
}

interface Stage {
  id: string
  order: number
  targetPercentage: number
  waitMinutes: number
  minDevices: number
  thresholds: Threshold[]
}

interface Policy {
  id: number
  name: string
  description: string
  channel: string
  isActive: boolean
  stages: Stage[]
  createdAt: string
  activeExecutions: number
}

interface Execution {
  id: number
  policyId: number
  policyName: string
  updateId: number
  updateGroupId: string
  releaseNotes: string
  currentStage: number
  totalStages: number
  currentPercentage: number
  status: 'active' | 'completed' | 'rolled_back' | 'paused' | 'cancelled'
  startedAt: string
  stageEnteredAt: string
  stagePercentages: number[]
  worstFlagStatus?: string | null
  linkedFlagCount: number
  health: {
    crashRate: number
    jsErrorRate: number
    appLaunches: number
    uniqueDevices: number
  }
  linkedFlags: {
    id: number
    key: string
    name: string
    flagType: 'boolean' | 'string' | 'number' | 'json'
    enabled: boolean
    variationName: string | null
    variationValue: unknown
    triggeredAt: string | null
    health?: {
      errorRate: number
      errorRateDelta: number
      crashFree: number
      status: 'healthy' | 'degraded' | 'incident'
    }
  }[]
  log: {
    action: string
    fromPercentage: number
    toPercentage: number
    reason: string
    createdAt: string
  }[]
}

// ── Mock Data ───────────────────────────────────────────────────────────

const MOCK_POLICIES: Policy[] = [
  {
    id: 1,
    name: 'Safe Production Rollout',
    description: 'Gradual rollout with crash rate monitoring. Rolls back automatically if crash rate exceeds 2%.',
    channel: 'production',
    isActive: true,
    activeExecutions: 1,
    createdAt: '2025-03-01T00:00:00Z',
    stages: [
      {
        id: 's1', order: 0, targetPercentage: 5, waitMinutes: 30, minDevices: 50,
        thresholds: [
          { id: 't1', metricType: 'crash_rate', operator: 'lt', value: 0.02, action: 'rollback' },
          { id: 't2', metricType: 'js_error_rate', operator: 'lt', value: 0.05, action: 'gate' },
        ],
      },
      {
        id: 's2', order: 1, targetPercentage: 25, waitMinutes: 60, minDevices: 200,
        thresholds: [
          { id: 't3', metricType: 'crash_rate', operator: 'lt', value: 0.02, action: 'rollback' },
          { id: 't4', metricType: 'js_error_rate', operator: 'lt', value: 0.05, action: 'gate' },
        ],
      },
      {
        id: 's3', order: 2, targetPercentage: 50, waitMinutes: 120, minDevices: 500,
        thresholds: [
          { id: 't5', metricType: 'crash_rate', operator: 'lt', value: 0.015, action: 'rollback' },
        ],
      },
      {
        id: 's4', order: 3, targetPercentage: 100, waitMinutes: 0, minDevices: 0,
        thresholds: [],
      },
    ],
  },
  {
    id: 2,
    name: 'Fast Staging Rollout',
    description: 'Quick rollout for staging with minimal gates.',
    channel: 'staging',
    isActive: true,
    activeExecutions: 0,
    createdAt: '2025-02-15T00:00:00Z',
    stages: [
      {
        id: 's5', order: 0, targetPercentage: 50, waitMinutes: 10, minDevices: 5,
        thresholds: [
          { id: 't6', metricType: 'crash_rate', operator: 'lt', value: 0.05, action: 'rollback' },
        ],
      },
      {
        id: 's6', order: 1, targetPercentage: 100, waitMinutes: 0, minDevices: 0,
        thresholds: [],
      },
    ],
  },
]

const MOCK_EXECUTIONS: Execution[] = [
  {
    id: 1,
    policyId: 1,
    policyName: 'Safe Production Rollout',
    updateId: 42,
    updateGroupId: 'v2.4.1-rc3',
    releaseNotes: 'New checkout flow with Apple Pay support and redesigned profile page. Includes performance improvements for image loading.',
    currentStage: 1,
    totalStages: 4,
    currentPercentage: 25,
    status: 'active',
    startedAt: '2025-03-07T14:00:00Z',
    stageEnteredAt: '2025-03-07T15:30:00Z',
    stagePercentages: [5, 25, 50, 100],
    linkedFlagCount: 2,
    health: {
      crashRate: 0.008,
      jsErrorRate: 0.023,
      appLaunches: 1847,
      uniqueDevices: 312,
    },
    linkedFlags: [
      { id: 1, key: 'new-checkout-flow', name: 'New Checkout Flow', flagType: 'boolean', enabled: true, variationName: null, variationValue: null, triggeredAt: null, health: { errorRate: 1.2, errorRateDelta: 0.4, crashFree: 99.1, status: 'degraded' } },
      { id: 2, key: 'checkout-layout', name: 'Checkout Layout', flagType: 'string', enabled: true, variationName: 'Single Page', variationValue: 'single_page', triggeredAt: null, health: { errorRate: 0.6, errorRateDelta: -0.2, crashFree: 99.7, status: 'healthy' } },
    ],
    log: [
      { action: 'advanced', fromPercentage: 5, toPercentage: 25, reason: 'All thresholds passed after 30m with 87 devices', createdAt: '2025-03-07T15:30:00Z' },
      { action: 'started', fromPercentage: 0, toPercentage: 5, reason: 'Execution started', createdAt: '2025-03-07T14:00:00Z' },
    ],
  },
  {
    id: 2,
    policyId: 1,
    policyName: 'Safe Production Rollout',
    updateId: 38,
    updateGroupId: 'v2.4.0',
    releaseNotes: 'Stability improvements and bug fixes for the home feed. Updated analytics SDK.',
    currentStage: 3,
    totalStages: 4,
    currentPercentage: 100,
    status: 'completed',
    startedAt: '2025-03-04T10:00:00Z',
    stageEnteredAt: '2025-03-05T02:00:00Z',
    stagePercentages: [5, 25, 50, 100],
    linkedFlagCount: 2,
    health: {
      crashRate: 0.005,
      jsErrorRate: 0.012,
      appLaunches: 48210,
      uniqueDevices: 8420,
    },
    linkedFlags: [
      { id: 1, key: 'new-checkout-flow', name: 'New Checkout Flow', flagType: 'boolean', enabled: true, variationName: null, variationValue: null, triggeredAt: null, health: { errorRate: 0.4, errorRateDelta: -0.4, crashFree: 99.8, status: 'healthy' } },
    ],
    log: [
      { action: 'completed', fromPercentage: 100, toPercentage: 100, reason: 'Rollout completed successfully', createdAt: '2025-03-05T02:00:00Z' },
      { action: 'advanced', fromPercentage: 50, toPercentage: 100, reason: 'All thresholds passed', createdAt: '2025-03-05T02:00:00Z' },
      { action: 'advanced', fromPercentage: 25, toPercentage: 50, reason: 'All thresholds passed', createdAt: '2025-03-04T16:00:00Z' },
      { action: 'advanced', fromPercentage: 5, toPercentage: 25, reason: 'All thresholds passed', createdAt: '2025-03-04T12:00:00Z' },
      { action: 'started', fromPercentage: 0, toPercentage: 5, reason: 'Execution started', createdAt: '2025-03-04T10:00:00Z' },
    ],
  },
  {
    id: 3,
    policyId: 1,
    policyName: 'Safe Production Rollout',
    updateId: 35,
    updateGroupId: 'v2.3.9-hotfix',
    releaseNotes: 'Emergency fix for payment processing timeout on slow connections.',
    currentStage: 1,
    totalStages: 4,
    currentPercentage: 0,
    status: 'rolled_back',
    startedAt: '2025-03-02T09:00:00Z',
    stageEnteredAt: '2025-03-02T10:30:00Z',
    stagePercentages: [5, 25, 50, 100],
    linkedFlagCount: 2,
    health: {
      crashRate: 0.034,
      jsErrorRate: 0.089,
      appLaunches: 892,
      uniqueDevices: 156,
    },
    linkedFlags: [
      { id: 1, key: 'new-checkout-flow', name: 'New Checkout Flow', flagType: 'boolean', enabled: false, variationName: null, variationValue: null, triggeredAt: '2025-03-02T11:00:00Z', health: { errorRate: 3.4, errorRateDelta: 2.6, crashFree: 97.8, status: 'incident' } },
      { id: 2, key: 'max-retry-count', name: 'Max Retry Count', flagType: 'number', enabled: false, variationName: '5 retries', variationValue: 5, triggeredAt: '2025-03-02T11:00:00Z', health: { errorRate: 1.8, errorRateDelta: 1.0, crashFree: 98.9, status: 'degraded' } },
    ],
    log: [
      { action: 'flags_disabled', fromPercentage: 0, toPercentage: 0, reason: 'Linked flags auto-disabled: new-checkout-flow, redesigned-profile', createdAt: '2025-03-02T11:00:00Z' },
      { action: 'rolled_back', fromPercentage: 25, toPercentage: 0, reason: 'crash_rate 3.4% exceeded threshold 2.0%', createdAt: '2025-03-02T11:00:00Z' },
      { action: 'advanced', fromPercentage: 5, toPercentage: 25, reason: 'All thresholds passed', createdAt: '2025-03-02T10:30:00Z' },
      { action: 'started', fromPercentage: 0, toPercentage: 5, reason: 'Execution started', createdAt: '2025-03-02T09:00:00Z' },
    ],
  },
]

const METRIC_LABELS: Record<string, string> = {
  crash_rate: 'Crash Rate',
  js_error_rate: 'JS Error Rate',
}
const OPERATOR_LABELS: Record<string, string> = {
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
}

// ── API → Frontend Mappers ──────────────────────────────────────────────

function mapPolicyRecord(r: RolloutPolicyRecord): Policy {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    channel: r.channel,
    isActive: r.isActive,
    createdAt: r.createdAt,
    activeExecutions: r.activeExecutionCount,
    stages: r.stages.map((s) => ({
      id: String(s.id),
      order: s.stageOrder,
      targetPercentage: s.percentage,
      waitMinutes: s.durationMinutes,
      minDevices: s.minDevices ?? 0,
      thresholds: (s.thresholds ?? []).map((t) => ({
        id: String(t.id),
        metricType: t.metricType,
        operator: t.operator,
        value: t.value,
        action: t.action as 'gate' | 'rollback',
      })),
    })),
  }
}

function mapStatus(s: string): Execution['status'] {
  if (s === 'running') return 'active'
  return s as Execution['status']
}

function mapExecutionRecord(r: RolloutExecutionRecord): Execution {
  return {
    id: r.id,
    policyId: r.policyId,
    policyName: r.policyName,
    updateId: 0,
    updateGroupId: r.updateGroupId,
    releaseNotes: '',
    currentStage: r.currentStage,
    totalStages: r.stageCount,
    currentPercentage: r.currentPercentage ?? 0,
    status: mapStatus(r.status),
    startedAt: r.startedAt,
    stageEnteredAt: r.startedAt,
    stagePercentages: [],
    worstFlagStatus: r.worstFlagStatus,
    linkedFlagCount: r.linkedFlagCount,
    health: { crashRate: r.crashRate, jsErrorRate: r.jsErrorRate, appLaunches: 0, uniqueDevices: r.uniqueDevices },
    linkedFlags: [],
    log: [],
  }
}

function mapExecutionDetailRecord(r: RolloutExecutionDetailRecord): Execution {
  return {
    id: r.id,
    policyId: r.policyId,
    policyName: r.policyName,
    updateId: 0,
    updateGroupId: r.updateGroupId,
    releaseNotes: r.releaseNotes || '',
    currentStage: r.currentStage,
    totalStages: r.stages.length,
    currentPercentage: r.stages[r.currentStage - 1]?.percentage ?? 0,
    status: mapStatus(r.status),
    startedAt: r.startedAt,
    stageEnteredAt: r.history[r.history.length - 1]?.startedAt ?? r.startedAt,
    stagePercentages: r.stages.map((s) => s.percentage),
    worstFlagStatus: null,
    linkedFlagCount: r.linkedFlags.length,
    health: r.health,
    linkedFlags: r.linkedFlags.map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      flagType: f.flagType as 'boolean' | 'string' | 'number' | 'json',
      enabled: f.enabled,
      variationName: f.variationName,
      variationValue: f.variationValue,
      triggeredAt: f.triggeredAt,
      health: f.health ? {
        errorRate: f.health.errorRate,
        errorRateDelta: f.health.errorRateDelta ?? 0,
        crashFree: f.health.crashFree,
        status: f.health.status as 'healthy' | 'degraded' | 'incident',
      } : undefined,
    })),
    log: buildLogFromHistory(r),
  }
}

function buildLogFromHistory(r: RolloutExecutionDetailRecord): Execution['log'] {
  const log: Execution['log'] = []

  // Add completion entry
  if (r.status === 'completed' && r.completedAt) {
    const lastStage = r.history[r.history.length - 1]
    log.push({
      action: 'completed',
      fromPercentage: lastStage?.percentage ?? 100,
      toPercentage: lastStage?.percentage ?? 100,
      reason: 'Rollout completed successfully',
      createdAt: r.completedAt,
    })
  }

  // Add flags_disabled entry if rolled back with disabled flags
  if (r.status === 'rolled_back') {
    const disabledFlags = r.linkedFlags.filter(f => !f.enabled)
    if (disabledFlags.length > 0) {
      log.push({
        action: 'flags_disabled',
        fromPercentage: 0,
        toPercentage: 0,
        reason: `Linked flags auto-disabled: ${disabledFlags.map(f => f.key).join(', ')}`,
        createdAt: r.completedAt || r.startedAt,
      })
    }
  }

  // Build entries from stage history (reverse chronological)
  for (let i = r.history.length - 1; i >= 0; i--) {
    const h = r.history[i]
    const prevPercentage = i > 0 ? r.history[i - 1].percentage : 0

    // Stage outcome (if completed)
    if (h.healthStatus === 'rolled_back' && h.completedAt) {
      log.push({
        action: 'rolled_back',
        fromPercentage: h.percentage,
        toPercentage: 0,
        reason: r.rollbackReason || `Rolled back at stage ${h.stageOrder}`,
        createdAt: h.completedAt,
      })
    } else if (h.healthStatus === 'gated' && h.gateReason) {
      log.push({
        action: 'gated',
        fromPercentage: h.percentage,
        toPercentage: h.percentage,
        reason: h.gateReason,
        createdAt: h.completedAt || h.startedAt,
      })
    }

    // Stage entry
    log.push({
      action: i === 0 ? 'started' : 'advanced',
      fromPercentage: prevPercentage,
      toPercentage: h.percentage,
      reason: i === 0 ? 'Execution started' : 'All thresholds passed',
      createdAt: h.startedAt,
    })
  }

  return log
}

// ── Component ───────────────────────────────────────────────────────────

type Tab = 'policies' | 'executions'

export default function RolloutPolicies({ defaultTab = 'executions' }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [policies, setPolicies] = useState<Policy[]>(USE_MOCK ? MOCK_POLICIES : [])
  const [executions, setExecutions] = useState<Execution[]>(USE_MOCK ? MOCK_EXECUTIONS : [])
  const [loading, setLoading] = useState(!USE_MOCK)
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null)
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)
  const [newPolicyName, setNewPolicyName] = useState('')
  const [newPolicyDescription, setNewPolicyDescription] = useState('')
  const [newPolicyChannel, setNewPolicyChannel] = useState('production')
  const [newPolicyStages, setNewPolicyStages] = useState([
    { percentage: 5, waitMinutes: 30, minDevices: 50, thresholds: [{ metric: 'crash_rate', operator: 'lt', value: 2.0, action: 'rollback' as const }, { metric: 'js_error_rate', operator: 'lt', value: 5.0, action: 'gate' as const }] },
    { percentage: 25, waitMinutes: 60, minDevices: 200, thresholds: [{ metric: 'crash_rate', operator: 'lt', value: 2.0, action: 'rollback' as const }] },
    { percentage: 50, waitMinutes: 120, minDevices: 500, thresholds: [] },
    { percentage: 100, waitMinutes: 0, minDevices: 0, thresholds: [] },
  ])
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null)
  const [confirmRollback, setConfirmRollback] = useState<{ level: 'flag' | 'bundle' | 'channel', flagId?: number, flagName?: string } | null>(null)
  const [channelOptions, setChannelOptions] = useState<string[]>(['production', 'staging'])

  const isEditing = editingPolicyId !== null

  const fetchPolicies = useCallback(async () => {
    if (USE_MOCK) return
    try {
      const records = await listRolloutPolicies()
      setPolicies(records.map(mapPolicyRecord))
    } catch (err) {
      console.error('Failed to load policies', err)
    }
  }, [])

  const fetchExecutions = useCallback(async () => {
    if (USE_MOCK) return
    try {
      const records = await listRolloutExecutions()
      setExecutions(records.map(mapExecutionRecord))
    } catch (err) {
      console.error('Failed to load executions', err)
    }
  }, [])

  useEffect(() => {
    if (USE_MOCK) return
    let cancelled = false
    async function load() {
      setLoading(true)
      await Promise.all([fetchPolicies(), fetchExecutions()])
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [fetchPolicies, fetchExecutions])

  useEffect(() => {
    async function loadChannels() {
      try {
        const channels = await listChannels()
        if (channels.length > 0) {
          setChannelOptions(channels.map((c) => c.name))
        }
      } catch (err) {
        console.error('Failed to load channels, using defaults', err)
      }
    }
    loadChannels()
  }, [])

  function startEditingPolicy(policy: Policy) {
    setNewPolicyName(policy.name)
    setNewPolicyDescription(policy.description)
    setNewPolicyChannel(policy.channel)
    setNewPolicyStages(policy.stages.map((s) => ({
      percentage: s.targetPercentage,
      waitMinutes: s.waitMinutes,
      minDevices: s.minDevices,
      thresholds: s.thresholds.map((t) => ({
        metric: t.metricType,
        operator: t.operator,
        value: t.value * 100,
        action: t.action,
      })),
    })))
    setEditingPolicyId(policy.id)
    setSelectedPolicy(null)
  }

  function cancelEditing() {
    setEditingPolicyId(null)
    setNewPolicyName('')
    setNewPolicyDescription('')
    setNewPolicyChannel('production')
    setNewPolicyStages([
      { percentage: 5, waitMinutes: 30, minDevices: 50, thresholds: [{ metric: 'crash_rate', operator: 'lt', value: 2.0, action: 'rollback' as const }, { metric: 'js_error_rate', operator: 'lt', value: 5.0, action: 'gate' as const }] },
      { percentage: 25, waitMinutes: 60, minDevices: 200, thresholds: [{ metric: 'crash_rate', operator: 'lt', value: 2.0, action: 'rollback' as const }] },
      { percentage: 50, waitMinutes: 120, minDevices: 500, thresholds: [] },
      { percentage: 100, waitMinutes: 0, minDevices: 0, thresholds: [] },
    ])
  }

  // ── SSE stream for live execution updates ──────────────────────────
  useEffect(() => {
    if (!selectedExecution) return
    if (selectedExecution.status !== 'active' && selectedExecution.status !== 'paused') return
    if (USE_MOCK) return

    const es = new EventSource(`/v1/ota/rollout-executions/${selectedExecution.id}/events`)

    es.onmessage = async () => {
      try {
        const detail = await getRolloutExecution(selectedExecution.id)
        setSelectedExecution(mapExecutionDetailRecord(detail))
        fetchExecutions()
      } catch {
        // Execution may have been deleted or completed
      }
    }

    es.onerror = () => {
      // Connection lost — browser will auto-reconnect
    }

    return () => es.close()
  }, [selectedExecution?.id, selectedExecution?.status, fetchExecutions])

  // ── Execution detail view ──────────────────────────────────────────

  if (selectedExecution) {
    const exec = selectedExecution
    const stageCount = exec.totalStages

    return (
      <div className="p-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button className="hover:text-foreground transition-colors cursor-pointer" onClick={() => setSelectedExecution(null)}>
            Rollouts
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{exec.updateGroupId}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{exec.updateGroupId}</h2>
              <StatusBadge status={exec.status} />
            </div>
            {exec.releaseNotes && (
              <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{exec.releaseNotes}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              Policy: <button
                className="hover:text-primary hover:underline cursor-pointer"
                onClick={() => {
                  const p = policies.find((pol) => pol.id === exec.policyId)
                  if (p) { setSelectedExecution(null); setSelectedPolicy(p) }
                }}
              >{exec.policyName}</button> &middot; Started {formatTimeAgo(exec.startedAt)}
            </p>
          </div>
          {(exec.status === 'active' || exec.status === 'paused') && (
            <div className="flex gap-2">
              {exec.status === 'active' && (
                <Button variant="outline" size="sm" onClick={async () => {
                  if (!USE_MOCK) {
                    try {
                      await pauseExecution(exec.id)
                      await fetchExecutions()
                      setSelectedExecution(null)
                    } catch (err) { console.error('Failed to pause execution', err) }
                  }
                }}>
                  <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause
                </Button>
              )}
              {exec.status === 'paused' && (
                <Button variant="outline" size="sm" onClick={async () => {
                  if (!USE_MOCK) {
                    try {
                      await resumeExecution(exec.id)
                      await fetchExecutions()
                      setSelectedExecution(null)
                    } catch (err) { console.error('Failed to resume execution', err) }
                  }
                }}>
                  <Play className="h-3.5 w-3.5 mr-1.5" /> Resume
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={async () => {
                if (!USE_MOCK) {
                  try {
                    await advanceExecution(exec.id)
                    await fetchExecutions()
                    setSelectedExecution(null)
                  } catch (err) { console.error('Failed to advance execution', err) }
                }
              }}>
                <SkipForward className="h-3.5 w-3.5 mr-1.5" /> Advance
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Rollback <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-1">
                  <div className="space-y-0.5">
                    {exec.linkedFlags.filter(f => f.enabled).length > 0 && (
                      <>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Flag-level</p>
                        {exec.linkedFlags.filter(f => f.enabled).map((flag) => (
                          <button
                            key={flag.id}
                            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer text-left"
                            onClick={() => setConfirmRollback({ level: 'flag', flagId: flag.id, flagName: flag.name })}
                          >
                            <Ban className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            <div className="min-w-0">
                              <span className="font-medium text-xs">Revert {flag.name}</span>
                              <p className="text-[11px] text-muted-foreground">Restore flag to its pre-release state</p>
                            </div>
                          </button>
                        ))}
                        <Separator className="my-1" />
                      </>
                    )}
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Bundle-level</p>
                    <button
                      className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer text-left"
                      onClick={() => setConfirmRollback({ level: 'bundle' })}
                    >
                      <Package className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-xs">Roll back release</span>
                        <p className="text-[11px] text-muted-foreground">Revert update + restore all flags to pre-release state</p>
                      </div>
                    </button>
                    <Separator className="my-1" />
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Channel-level</p>
                    <button
                      className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer text-left"
                      onClick={() => setConfirmRollback({ level: 'channel' })}
                    >
                      <Layers className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-xs">Roll back channel</span>
                        <p className="text-[11px] text-muted-foreground">Revert all releases on {exec.policyName.includes('Staging') ? 'staging' : 'production'}</p>
                      </div>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {/* Stage progress */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Rollout Progress</h3>
          <div className="flex items-center gap-1">
            {Array.from({ length: stageCount }).map((_, i) => {
              const stageNum = i + 1 // stages are 1-indexed
              const isCompleted = stageNum < exec.currentStage
              const isCurrent = stageNum === exec.currentStage
              const isRolledBack = exec.status === 'rolled_back'
              return (
                <div key={i} className="flex-1 flex items-center gap-1">
                  <div
                    className={cn(
                      'h-2 flex-1 rounded-full transition-all',
                      isCompleted && !isRolledBack && 'bg-green-500',
                      isCurrent && exec.status === 'active' && 'bg-blue-500 animate-pulse',
                      isCurrent && exec.status === 'paused' && 'bg-yellow-500',
                      isCurrent && isRolledBack && 'bg-red-500',
                      isCurrent && exec.status === 'completed' && 'bg-green-500',
                      !isCompleted && !isCurrent && 'bg-muted',
                    )}
                  />
                  {i < stageCount - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            {Array.from({ length: stageCount }).map((_, i) => {
              const pct = exec.stagePercentages[i] ?? (i === stageCount - 1 ? 100 : Math.round(100 * (i + 1) / stageCount))
              return (
                <span key={i} className="text-[11px] text-muted-foreground">{pct}%</span>
              )
            })}
          </div>
        </div>

        {/* Health metrics */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Health Metrics</h3>
          <div className="grid grid-cols-4 gap-4">
            <MetricCard
              label="Crash Rate"
              value={`${(exec.health.crashRate * 100).toFixed(2)}%`}
              status={exec.health.crashRate < 0.02 ? 'healthy' : 'critical'}
              threshold="< 2.0%"
            />
            <MetricCard
              label="JS Error Rate"
              value={`${(exec.health.jsErrorRate * 100).toFixed(2)}%`}
              status={exec.health.jsErrorRate < 0.05 ? 'healthy' : 'warning'}
              threshold="< 5.0%"
            />
            <MetricCard
              label="App Launches"
              value={exec.health.appLaunches.toLocaleString()}
              status="neutral"
            />
            <MetricCard
              label="Unique Devices"
              value={exec.health.uniqueDevices.toLocaleString()}
              status="neutral"
            />
          </div>
        </div>

        {/* Linked flags */}
        {exec.linkedFlags.length > 0 && (
          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flag className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Linked Feature Flags</h3>
            </div>
            <div className="space-y-2">
              {exec.linkedFlags.map((flag) => (
                <div
                  key={flag.id}
                  className={cn(
                    'rounded-lg border overflow-hidden',
                    flag.triggeredAt && 'border-red-200 bg-red-50/50',
                    flag.health?.status === 'incident' && !flag.triggeredAt && 'border-destructive/30',
                    flag.health?.status === 'degraded' && !flag.triggeredAt && 'border-amber-500/30',
                  )}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      {flag.enabled ? (
                        <Flag className="h-4 w-4 text-green-600" />
                      ) : (
                        <FlagOff className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <span className="text-sm font-medium">{flag.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 font-mono">{flag.key}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {flag.flagType === 'boolean' ? (
                        flag.enabled ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Enabled</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                            Disabled {flag.triggeredAt && formatTimeAgo(flag.triggeredAt)}
                          </Badge>
                        )
                      ) : (
                        <>
                          {flag.variationName && (
                            <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                              {flag.variationName}
                            </span>
                          )}
                          {flag.enabled ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                              Reverted {flag.triggeredAt && formatTimeAgo(flag.triggeredAt)}
                            </Badge>
                          )}
                        </>
                      )}
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{flag.flagType}</Badge>
                      {flag.enabled && (exec.status === 'active' || exec.status === 'paused') && (
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1 rounded hover:bg-red-50"
                          title="Revert this flag override"
                          onClick={() => setConfirmRollback({ level: 'flag', flagId: flag.id, flagName: flag.name })}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Per-flag health metrics */}
                  {flag.health && (
                    <div className="border-t bg-muted/20 px-4 py-2 flex items-center gap-5">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                        flag.health.status === 'healthy' && 'bg-green-100 text-green-700',
                        flag.health.status === 'degraded' && 'bg-amber-100 text-amber-700',
                        flag.health.status === 'incident' && 'bg-red-100 text-red-700',
                      )}>
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          flag.health.status === 'healthy' && 'bg-green-500',
                          flag.health.status === 'degraded' && 'bg-amber-500',
                          flag.health.status === 'incident' && 'bg-red-500 animate-pulse',
                        )} />
                        {flag.health.status}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Error rate</span>
                        <span className={cn('font-mono font-medium', flag.health.errorRate > 1 && 'text-destructive')}>{flag.health.errorRate}%</span>
                        <ExecDeltaBadge value={flag.health.errorRateDelta} suffix="%" invert />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Crash-free</span>
                        <span className={cn('font-mono font-medium', flag.health.crashFree < 99 && 'text-destructive')}>{flag.health.crashFree}%</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {exec.status === 'rolled_back' && exec.linkedFlags.some(f => !f.enabled) && (
              <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Flags were restored to their pre-release state when rollback was triggered
              </p>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Activity</h3>
          <div className="space-y-0">
            {exec.log.map((entry, i) => (
              <div key={i} className="flex gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center shrink-0',
                    entry.action === 'started' && 'bg-blue-100 text-blue-600',
                    entry.action === 'advanced' && 'bg-green-100 text-green-600',
                    entry.action === 'completed' && 'bg-green-100 text-green-600',
                    entry.action === 'rolled_back' && 'bg-red-100 text-red-600',
                    entry.action === 'paused' && 'bg-yellow-100 text-yellow-600',
                    entry.action === 'flags_disabled' && 'bg-orange-100 text-orange-600',
                  )}>
                    {entry.action === 'started' && <Play className="h-3 w-3" />}
                    {entry.action === 'advanced' && <TrendingUp className="h-3 w-3" />}
                    {entry.action === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                    {entry.action === 'rolled_back' && <XCircle className="h-3 w-3" />}
                    {entry.action === 'paused' && <Pause className="h-3 w-3" />}
                    {entry.action === 'flags_disabled' && <FlagOff className="h-3 w-3" />}
                  </div>
                  {i < exec.log.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{entry.action.replace('_', ' ')}</span>
                    {entry.fromPercentage !== entry.toPercentage && (
                      <span className="text-xs text-muted-foreground">
                        {entry.fromPercentage}% → {entry.toPercentage}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>
                  <span className="text-[11px] text-muted-foreground/60">{formatTimeAgo(entry.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rollback confirmation */}
        <AlertDialog open={confirmRollback !== null} onOpenChange={() => setConfirmRollback(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmRollback?.level === 'flag' && `Revert ${confirmRollback.flagName}?`}
                {confirmRollback?.level === 'bundle' && 'Roll back release?'}
                {confirmRollback?.level === 'channel' && 'Roll back entire channel?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmRollback?.level === 'flag' && (
                  <>This will restore <strong>{confirmRollback.flagName}</strong> to the state it was in before this release started. The update itself will remain deployed.</>
                )}
                {confirmRollback?.level === 'bundle' && (
                  <>This will revert the <strong>{exec.updateGroupId}</strong> update and restore all linked flags to their pre-release state.</>
                )}
                {confirmRollback?.level === 'channel' && (
                  <>This will revert <strong>all active releases</strong> on this channel and restore all linked flags to their pre-release state. This action affects all users on this channel.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={async () => {
                  if (confirmRollback?.level === 'flag' && confirmRollback.flagId) {
                    if (!USE_MOCK) {
                      try {
                        await revertExecutionFlag(exec.id, confirmRollback.flagId)
                        await fetchExecutions()
                        // Refresh the detail view by re-fetching
                        try {
                          const detail = await getRolloutExecution(exec.id)
                          setSelectedExecution(mapExecutionDetailRecord(detail))
                        } catch { setSelectedExecution(null) }
                      } catch (err) { console.error('Failed to revert flag', err) }
                    }
                  } else if (!USE_MOCK && (confirmRollback?.level === 'bundle' || confirmRollback?.level === 'channel')) {
                    try {
                      await cancelExecution(exec.id)
                      await fetchExecutions()
                      setSelectedExecution(null)
                    } catch (err) { console.error('Failed to cancel execution', err) }
                  }
                  setConfirmRollback(null)
                }}
              >
                {confirmRollback?.level === 'flag' && 'Revert Override'}
                {confirmRollback?.level === 'bundle' && 'Roll Back Release'}
                {confirmRollback?.level === 'channel' && 'Roll Back Channel'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ── Create policy view (interaction flow) ────────────────────────

  if (showCreatePolicy || isEditing) {
    function addNewStage() {
      const lastPct = newPolicyStages.length > 0 ? newPolicyStages[newPolicyStages.length - 1].percentage : 0
      const newPct = Math.min(lastPct + 25, 100)
      setNewPolicyStages([...newPolicyStages, { percentage: newPct, waitMinutes: 60, minDevices: 100, thresholds: [] }])
    }

    function removeNewStage(index: number) {
      setNewPolicyStages(newPolicyStages.filter((_, i) => i !== index))
    }

    function addThreshold(stageIndex: number) {
      const next = [...newPolicyStages]
      next[stageIndex].thresholds.push({ metric: 'crash_rate', operator: 'lt', value: 2.0, action: 'rollback' })
      setNewPolicyStages(next)
    }

    function removeThreshold(stageIndex: number, thresholdIndex: number) {
      const next = [...newPolicyStages]
      next[stageIndex].thresholds = next[stageIndex].thresholds.filter((_, i) => i !== thresholdIndex)
      setNewPolicyStages(next)
    }

    return (
      <div className="flex h-full">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button className="hover:text-foreground transition-colors cursor-pointer" onClick={() => { setShowCreatePolicy(false); cancelEditing() }}>
              Rollouts
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{isEditing ? 'Edit Policy' : 'New Policy'}</span>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{isEditing ? 'Edit Rollout Policy' : 'New Rollout Policy'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isEditing
                  ? 'Update stages, health thresholds, and configuration for this policy.'
                  : 'Define stages, health thresholds, and linked flags for progressive delivery.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowCreatePolicy(false); cancelEditing() }}>Cancel</Button>
              <Button disabled={!newPolicyName.trim()} onClick={async () => {
                if (!newPolicyName.trim()) return
                if (!USE_MOCK) {
                  try {
                    const stagesPayload = newPolicyStages.map((s) => ({
                      percentage: s.percentage,
                      durationMinutes: s.waitMinutes,
                      minDevices: s.minDevices,
                      thresholds: s.thresholds.map((t) => ({
                        metricType: t.metric,
                        operator: t.operator,
                        value: t.value / 100,
                        action: t.action,
                      })),
                    }))
                    let policyId: number
                    if (isEditing && editingPolicyId) {
                      const result = await updateRolloutPolicy(editingPolicyId, {
                        name: newPolicyName.trim(),
                        description: newPolicyDescription,
                        channel: newPolicyChannel,
                        stages: stagesPayload,
                      })
                      policyId = result.id
                    } else {
                      const result = await createRolloutPolicy({
                        name: newPolicyName.trim(),
                        description: newPolicyDescription,
                        channel: newPolicyChannel,
                        stages: stagesPayload,
                      })
                      policyId = result.id
                    }
                    await fetchPolicies()
                  } catch (err) {
                    console.error('Failed to create policy', err)
                    return
                  }
                }
                setShowCreatePolicy(false)
                cancelEditing()
              }}>{isEditing ? 'Save Changes' : 'Create Policy'}</Button>
            </div>
          </div>

          {/* Interaction flow */}
          <div className="relative flex flex-col items-center max-w-2xl">
            {/* All traffic label */}
            <span className="text-xs text-muted-foreground font-medium">All traffic on channel</span>
            <div className="w-px h-5 bg-border" />

            {/* Channel selection card */}
            <div className="w-full rounded-lg border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{newPolicyChannel}</Badge>
                  <span className="text-sm text-muted-foreground">New updates on this channel trigger the rollout pipeline</span>
                </div>
              </div>
            </div>

            {/* Stages flow */}
            {newPolicyStages.map((stage, i) => (
              <div key={i} className="w-full flex flex-col items-center">
                <div className="w-px h-6 bg-border" />

                {/* Stage card */}
                <div className="w-full rounded-lg border bg-card overflow-hidden">
                  {/* Stage header */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {i + 1}
                      </div>
                      <div>
                        <span className="text-sm font-medium">
                          {i === newPolicyStages.length - 1 && stage.percentage === 100
                            ? 'Full rollout'
                            : `Roll out to ${stage.percentage}%`}
                        </span>
                        {stage.waitMinutes > 0 && (
                          <span className="text-xs text-muted-foreground ml-2">
                            then wait {stage.waitMinutes >= 60 ? `${stage.waitMinutes / 60}h` : `${stage.waitMinutes}m`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {newPolicyStages.length > 1 && (
                        <button className="text-muted-foreground hover:text-destructive cursor-pointer p-1" onClick={() => removeNewStage(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stage body - editable fields */}
                  <div className="border-t px-5 py-4 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Rollout %</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={stage.percentage}
                          onChange={(e) => {
                            const next = [...newPolicyStages]
                            next[i].percentage = Number(e.target.value)
                            setNewPolicyStages(next)
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Wait (min)</span>
                        <Input
                          type="number"
                          min={0}
                          value={stage.waitMinutes}
                          onChange={(e) => {
                            const next = [...newPolicyStages]
                            next[i].waitMinutes = Number(e.target.value)
                            setNewPolicyStages(next)
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Min devices</span>
                        <Input
                          type="number"
                          min={0}
                          value={stage.minDevices}
                          onChange={(e) => {
                            const next = [...newPolicyStages]
                            next[i].minDevices = Number(e.target.value)
                            setNewPolicyStages(next)
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Thresholds */}
                    {stage.thresholds.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Health Checks</span>
                        {stage.thresholds.map((t, ti) => (
                          <div key={ti} className="flex items-center gap-2">
                            <Select
                              value={t.metric}
                              onValueChange={(v) => {
                                const next = [...newPolicyStages]
                                next[i].thresholds[ti].metric = v
                                setNewPolicyStages(next)
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="crash_rate">Crash Rate</SelectItem>
                                <SelectItem value="js_error_rate">JS Error Rate</SelectItem>
                              </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">&lt;</span>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step={0.1}
                                min={0}
                                value={t.value}
                                onChange={(e) => {
                                  const next = [...newPolicyStages]
                                  next[i].thresholds[ti].value = Number(e.target.value)
                                  setNewPolicyStages(next)
                                }}
                                className="h-8 text-xs w-16"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] px-1.5 py-0 cursor-pointer',
                                t.action === 'rollback' ? 'border-red-200 text-red-600' : 'border-blue-200 text-blue-600',
                              )}
                              onClick={() => {
                                const next = [...newPolicyStages]
                                next[i].thresholds[ti].action = t.action === 'rollback' ? 'gate' : 'rollback'
                                setNewPolicyStages(next)
                              }}
                            >
                              {t.action === 'rollback' ? 'auto-rollback' : 'gate'}
                            </Badge>
                            <button className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => removeThreshold(i, ti)}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => addThreshold(i)}>
                      <Plus className="h-3 w-3 mr-1" /> Add health check
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Add stage button */}
            <div className="w-px h-6 bg-border" />
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
              onClick={addNewStage}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-6 bg-border" />

            {/* Complete card */}
            <div className="w-full rounded-lg border border-dashed bg-muted/30 p-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <span className="text-sm font-medium">Rollout complete</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Update is fully deployed to all devices on this channel.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline preview */}
          <div className="max-w-2xl rounded-lg border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Pipeline Preview</h3>
            <div className="flex items-center gap-1">
              {newPolicyStages.map((stage, i) => (
                <div key={i} className="flex items-center gap-1 flex-1">
                  <div className="flex-1 rounded bg-muted/60 py-1.5 text-center text-xs font-mono text-muted-foreground">
                    {stage.percentage}%
                  </div>
                  {i < newPolicyStages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 border-l overflow-y-auto p-5 space-y-5">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</span>
            <Input
              placeholder="e.g. Safe Production Rollout"
              value={newPolicyName}
              onChange={(e) => setNewPolicyName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</span>
            <textarea
              placeholder="Describe what this policy does..."
              value={newPolicyDescription}
              onChange={(e) => setNewPolicyDescription(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none h-20"
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Channel</span>
            <Select value={newPolicyChannel} onValueChange={setNewPolicyChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {channelOptions.map((ch) => (
                  <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stages</span>
            <p className="text-xs text-muted-foreground">{newPolicyStages.length} stage{newPolicyStages.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Health Checks</span>
            <p className="text-xs text-muted-foreground">
              {newPolicyStages.reduce((sum, s) => sum + s.thresholds.length, 0)} threshold{newPolicyStages.reduce((sum, s) => sum + s.thresholds.length, 0) !== 1 ? 's' : ''} across all stages
            </p>
          </div>


        </div>
      </div>
    )
  }

  // ── Policy detail view ─────────────────────────────────────────────

  if (selectedPolicy) {
    const policy = selectedPolicy

    return (
      <div className="flex h-full">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button className="hover:text-foreground transition-colors cursor-pointer" onClick={() => setSelectedPolicy(null)}>
              Rollouts
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{policy.name}</span>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{policy.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">{policy.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={cn('flex items-center gap-2', policy.activeExecutions > 0 && 'relative group')}>
                <span className="text-sm text-muted-foreground">Active</span>
                <Switch
                  checked={policy.isActive}
                  disabled={policy.activeExecutions > 0}
                  onCheckedChange={async (checked) => {
                    if (USE_MOCK) {
                      setPolicies((prev) =>
                        prev.map((p) => (p.id === policy.id ? { ...p, isActive: checked } : p)),
                      )
                      setSelectedPolicy((prev) => (prev?.id === policy.id ? { ...prev, isActive: checked } : prev))
                    } else {
                      try {
                        await updateRolloutPolicy(policy.id, { isActive: checked })
                        await fetchPolicies()
                      } catch (err) {
                        console.error('Failed to toggle policy active state', err)
                      }
                    }
                  }}
                />
                {policy.activeExecutions > 0 && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Can't deactivate while {policy.activeExecutions} rollout{policy.activeExecutions !== 1 ? 's are' : ' is'} running.
                  </div>
                )}
              </div>
              {policy.activeExecutions > 0 ? (
                <div className="relative group">
                  <Button variant="outline" size="sm" disabled>
                    <Lock className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  <div className="absolute right-0 top-full mt-1.5 w-56 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    This policy has {policy.activeExecutions} active rollout{policy.activeExecutions !== 1 ? 's' : ''}. Complete or cancel {policy.activeExecutions !== 1 ? 'them' : 'it'} before editing.
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => startEditingPolicy(policy)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(policy.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Interaction flow */}
          <div className="relative flex flex-col items-center max-w-2xl">
            {/* All traffic label */}
            <span className="text-xs text-muted-foreground font-medium">All traffic on channel</span>
            <div className="w-px h-5 bg-border" />

            {/* Channel card */}
            <div className="w-full rounded-lg border bg-card p-5">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-xs">{policy.channel}</Badge>
                <span className="text-sm text-muted-foreground">New updates on this channel trigger the rollout pipeline</span>
              </div>
            </div>

            {/* Stages flow */}
            {policy.stages.map((stage, i) => (
              <div key={stage.id} className="w-full flex flex-col items-center">
                <div className="w-px h-6 bg-border" />

                {/* Stage card */}
                <div className="w-full rounded-lg border bg-card overflow-hidden">
                  {/* Stage header */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {i + 1}
                      </div>
                      <div>
                        <span className="text-sm font-medium">
                          {i === policy.stages.length - 1 && stage.targetPercentage === 100
                            ? 'Full rollout'
                            : `Roll out to ${stage.targetPercentage}%`}
                        </span>
                        {stage.waitMinutes > 0 && (
                          <span className="text-xs text-muted-foreground ml-2">
                            then wait {stage.waitMinutes >= 60 ? `${stage.waitMinutes / 60}h` : `${stage.waitMinutes}m`}
                          </span>
                        )}
                      </div>
                    </div>
                    {i === policy.stages.length - 1 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Stage details */}
                  <div className="border-t px-5 py-4 space-y-3">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {stage.waitMinutes > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Wait {stage.waitMinutes >= 60 ? `${stage.waitMinutes / 60}h` : `${stage.waitMinutes}m`}
                        </span>
                      )}
                      {stage.minDevices > 0 && (
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          Min {stage.minDevices} devices
                        </span>
                      )}
                    </div>

                    {stage.thresholds.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Health Checks</span>
                        {stage.thresholds.map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-xs">
                            {t.action === 'rollback' ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <Shield className="h-3.5 w-3.5 text-blue-500" />
                            )}
                            <span className="font-medium">{METRIC_LABELS[t.metricType] || t.metricType}</span>
                            <span className="text-muted-foreground">{OPERATOR_LABELS[t.operator]} {(t.value * 100).toFixed(1)}%</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] px-1.5 py-0',
                                t.action === 'rollback' ? 'border-red-200 text-red-600' : 'border-blue-200 text-blue-600',
                              )}
                            >
                              {t.action === 'rollback' ? 'auto-rollback' : 'gate'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Complete card */}
            <div className="w-px h-6 bg-border" />
            <div className="w-full rounded-lg border border-dashed bg-muted/30 p-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <span className="text-sm font-medium">Rollout complete</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Update is fully deployed to all devices on this channel.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline preview */}
          <div className="max-w-2xl rounded-lg border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Pipeline Preview</h3>
            <div className="flex items-center gap-1">
              {policy.stages.map((stage, i) => (
                <div key={stage.id} className="flex items-center gap-1 flex-1">
                  <div className="flex-1 rounded bg-muted/60 py-1.5 text-center text-xs font-mono text-muted-foreground">
                    {stage.targetPercentage}%
                  </div>
                  {i < policy.stages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 border-l overflow-y-auto p-5 space-y-5">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
            <div className="flex items-center gap-2">
              {policy.isActive ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Channel</span>
            <p className="text-sm">{policy.channel}</p>
          </div>

          <Separator />

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stages</span>
            <p className="text-sm">{policy.stages.length} stage{policy.stages.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Health Checks</span>
            <p className="text-sm">
              {policy.stages.reduce((sum, s) => sum + s.thresholds.length, 0)} threshold{policy.stages.reduce((sum, s) => sum + s.thresholds.length, 0) !== 1 ? 's' : ''}
            </p>
          </div>

          {policy.activeExecutions > 0 && (
            <>
              <Separator />
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Rollouts</span>
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{policy.activeExecutions} running</Badge>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Main list view ─────────────────────────────────────────────────

  const filteredPolicies = search.trim()
    ? policies.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.channel.toLowerCase().includes(search.toLowerCase())
      )
    : policies

  const filteredExecutions = search.trim()
    ? executions.filter((e) =>
        e.policyName.toLowerCase().includes(search.toLowerCase()) ||
        e.updateGroupId.toLowerCase().includes(search.toLowerCase())
      )
    : executions

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{tab === 'executions' ? 'Rollouts' : 'Policies'}</h2>
            <p className="text-sm text-muted-foreground">
              {tab === 'executions'
                ? 'Active and past rollout executions'
                : 'Reusable rollout strategies for progressive delivery'}
            </p>
          </div>
          {tab === 'policies' && (
            <Button onClick={() => setShowCreatePolicy(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Policy
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={tab === 'executions' ? 'Search rollouts...' : 'Search policies...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading...
        </div>
      )}

      {/* Executions list */}
      {!loading && tab === 'executions' && (
        <div className="space-y-2">
          {filteredExecutions.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center">
              <Zap className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <h3 className="mt-3 text-sm font-semibold">No rollouts</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Start a rollout from the Releases page or create a policy first.
              </p>
            </div>
          ) : (
            filteredExecutions.map((exec) => (
              <button
                key={exec.id}
                className="w-full rounded-lg border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer text-left"
                onClick={async () => {
                  if (!USE_MOCK) {
                    try {
                      const detail = await getRolloutExecution(exec.id)
                      setSelectedExecution(mapExecutionDetailRecord(detail))
                    } catch {
                      setSelectedExecution(exec)
                    }
                  } else {
                    setSelectedExecution(exec)
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ExecutionStatusIcon status={exec.status} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{exec.updateGroupId}</span>
                        <StatusBadge status={exec.status} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        <span
                          className="hover:text-primary hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            const p = policies.find((pol) => pol.id === exec.policyId)
                            if (p) setSelectedPolicy(p)
                          }}
                        >
                          {exec.policyName}
                        </span>
                        {' '}&middot; {formatTimeAgo(exec.startedAt)}
                        {(exec.linkedFlags.length > 0 || exec.linkedFlagCount > 0) && (
                          <span className="inline-flex items-center gap-1 ml-2">
                            <Flag className="h-3 w-3" />
                            {exec.linkedFlags.filter(f => !f.enabled).length > 0 ? (
                              <span className="text-red-500">
                                {exec.linkedFlags.filter(f => !f.enabled).length} flag{exec.linkedFlags.filter(f => !f.enabled).length !== 1 ? 's' : ''} disabled
                              </span>
                            ) : (
                              <span>{exec.linkedFlags.length || exec.linkedFlagCount} flag{(exec.linkedFlags.length || exec.linkedFlagCount) !== 1 ? 's' : ''} linked</span>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Mini progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex h-1.5 w-24 rounded-full overflow-hidden bg-muted">
                        <div
                          className={cn(
                            'h-full transition-all',
                            exec.status === 'active' && 'bg-blue-500',
                            exec.status === 'completed' && 'bg-green-500',
                            exec.status === 'rolled_back' && 'bg-red-500',
                            exec.status === 'paused' && 'bg-yellow-500',
                            exec.status === 'cancelled' && 'bg-muted-foreground',
                          )}
                          style={{ width: `${exec.currentPercentage}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                        {exec.currentPercentage}%
                      </span>
                    </div>

                    {/* Health indicators */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {(() => {
                        const worstFlag = (exec.worstFlagStatus as 'healthy' | 'degraded' | 'incident' | null)
                          ?? exec.linkedFlags.reduce<'healthy' | 'degraded' | 'incident'>((worst, f) => {
                            if (!f.health) return worst
                            if (f.health.status === 'incident') return 'incident'
                            if (f.health.status === 'degraded' && worst !== 'incident') return 'degraded'
                            return worst
                          }, 'healthy')
                        if (worstFlag && worstFlag !== 'healthy') {
                          return (
                            <span className={cn(
                              'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                              worstFlag === 'incident' && 'bg-red-100 text-red-700',
                              worstFlag === 'degraded' && 'bg-amber-100 text-amber-700',
                            )}>
                              <span className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                worstFlag === 'incident' && 'bg-red-500 animate-pulse',
                                worstFlag === 'degraded' && 'bg-amber-500',
                              )} />
                              {worstFlag}
                            </span>
                          )
                        }
                        return null
                      })()}
                      <span className={cn(
                        'flex items-center gap-1',
                        exec.health.crashRate >= 0.02 && 'text-red-500',
                      )}>
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          exec.health.crashRate < 0.02 ? 'bg-green-500' : 'bg-red-500',
                        )} />
                        {(exec.health.crashRate * 100).toFixed(1)}%
                      </span>
                      <span>{exec.health.uniqueDevices.toLocaleString()} devices</span>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Policies list */}
      {!loading && tab === 'policies' && (
        <div className="space-y-2">
          {filteredPolicies.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center">
              <Shield className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <h3 className="mt-3 text-sm font-semibold">No policies</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a rollout policy to automate progressive delivery.
              </p>
              <Button className="mt-4" onClick={() => setShowCreatePolicy(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Create Policy
              </Button>
            </div>
          ) : (
            filteredPolicies.map((policy) => (
              <button
                key={policy.id}
                className="w-full rounded-lg border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer text-left"
                onClick={() => setSelectedPolicy(policy)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{policy.name}</span>
                        <Badge variant="outline">{policy.channel}</Badge>
                        {!policy.isActive && <Badge variant="disabled">disabled</Badge>}
                        {policy.activeExecutions > 0 && (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                            {policy.activeExecutions} running
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{policy.description}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Mini pipeline */}
                    <div className="flex items-center gap-1">
                      {policy.stages.map((stage, i) => (
                        <div key={stage.id} className="flex items-center gap-1">
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {stage.targetPercentage}%
                          </span>
                          {i < policy.stages.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                          )}
                        </div>
                      ))}
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      </div>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel any active rollout executions using this policy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={async () => {
              if (confirmDelete === null) return
              if (!USE_MOCK) {
                try {
                  await deleteRolloutPolicy(confirmDelete)
                  await fetchPolicies()
                } catch (err) {
                  console.error('Failed to delete policy', err)
                }
              } else {
                setPolicies((prev) => prev.filter((p) => p.id !== confirmDelete))
              }
              if (selectedPolicy?.id === confirmDelete) setSelectedPolicy(null)
              setConfirmDelete(null)
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Active</Badge>
    case 'completed':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Completed</Badge>
    case 'rolled_back':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rolled Back</Badge>
    case 'paused':
      return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Paused</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function ExecutionStatusIcon({ status }: { status: string }) {
  const base = 'h-9 w-9 flex items-center justify-center rounded-lg'
  switch (status) {
    case 'active':
      return <div className={cn(base, 'bg-blue-100')}><Zap className="h-4 w-4 text-blue-600" /></div>
    case 'completed':
      return <div className={cn(base, 'bg-green-100')}><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
    case 'rolled_back':
      return <div className={cn(base, 'bg-red-100')}><XCircle className="h-4 w-4 text-red-600" /></div>
    case 'paused':
      return <div className={cn(base, 'bg-yellow-100')}><Pause className="h-4 w-4 text-yellow-600" /></div>
    default:
      return <div className={cn(base, 'bg-muted')}><Square className="h-4 w-4 text-muted-foreground" /></div>
  }
}

function MetricCard({ label, value, status, threshold }: {
  label: string
  value: string
  status: 'healthy' | 'warning' | 'critical' | 'neutral'
  threshold?: string
}) {
  return (
    <div className={cn(
      'rounded-lg border p-4',
      status === 'healthy' && 'border-green-200 bg-green-50/50',
      status === 'warning' && 'border-yellow-200 bg-yellow-50/50',
      status === 'critical' && 'border-red-200 bg-red-50/50',
      status === 'neutral' && 'bg-card',
    )}>
      <div className="flex items-center gap-1.5">
        {status === 'healthy' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
        {status === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />}
        {status === 'critical' && <XCircle className="h-3.5 w-3.5 text-red-600" />}
        {status === 'neutral' && <Activity className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {threshold && (
        <span className="text-[11px] text-muted-foreground">Threshold: {threshold}</span>
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function ExecDeltaBadge({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
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
