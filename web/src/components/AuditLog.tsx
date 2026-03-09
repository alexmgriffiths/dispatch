import { useEffect, useState, useCallback } from 'react'
import { listAuditLog } from '../api/client'
import type { AuditLogRecord } from '../api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  User,
  Key,
  Search,
  ChevronDown,
  Upload,
  Layers,
  GitBranch,
  Flag,
  Bell,
  RefreshCw,
  Zap,
  Trash2,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'update', label: 'Releases' },
  { key: 'build', label: 'Builds' },
  { key: 'branch', label: 'Branches' },
  { key: 'channel', label: 'Channels' },
  { key: 'flag', label: 'Flags' },
  { key: 'webhook', label: 'Webhooks' },
] as const

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  'build.uploaded':     { label: 'Build uploaded',       icon: <Upload className="h-3.5 w-3.5" />,      color: 'text-blue-500 bg-blue-500/10' },
  'build.published':    { label: 'Build published',      icon: <Zap className="h-3.5 w-3.5" />,         color: 'text-blue-500 bg-blue-500/10' },
  'build.deleted':      { label: 'Build deleted',        icon: <Trash2 className="h-3.5 w-3.5" />,      color: 'text-red-500 bg-red-500/10' },
  'update.created':     { label: 'Release created',      icon: <Plus className="h-3.5 w-3.5" />,        color: 'text-violet-500 bg-violet-500/10' },
  'update.patched':     { label: 'Release modified',     icon: <Pencil className="h-3.5 w-3.5" />,      color: 'text-violet-500 bg-violet-500/10' },
  'update.republished': { label: 'Release republished',  icon: <RefreshCw className="h-3.5 w-3.5" />,   color: 'text-violet-500 bg-violet-500/10' },
  'update.deleted':     { label: 'Release deleted',      icon: <Trash2 className="h-3.5 w-3.5" />,      color: 'text-red-500 bg-red-500/10' },
  'update.rollback':    { label: 'Rollback created',     icon: <RotateCcw className="h-3.5 w-3.5" />,   color: 'text-amber-500 bg-amber-500/10' },
  'branch.created':     { label: 'Branch created',       icon: <GitBranch className="h-3.5 w-3.5" />,   color: 'text-emerald-500 bg-emerald-500/10' },
  'branch.deleted':     { label: 'Branch deleted',       icon: <Trash2 className="h-3.5 w-3.5" />,      color: 'text-red-500 bg-red-500/10' },
  'channel.created':    { label: 'Channel created',      icon: <Layers className="h-3.5 w-3.5" />,      color: 'text-emerald-500 bg-emerald-500/10' },
  'channel.updated':    { label: 'Channel updated',      icon: <Pencil className="h-3.5 w-3.5" />,      color: 'text-emerald-500 bg-emerald-500/10' },
  'channel.deleted':    { label: 'Channel deleted',      icon: <Trash2 className="h-3.5 w-3.5" />,      color: 'text-red-500 bg-red-500/10' },
  'webhook.created':    { label: 'Webhook created',      icon: <Bell className="h-3.5 w-3.5" />,        color: 'text-amber-500 bg-amber-500/10' },
  'webhook.updated':    { label: 'Webhook updated',      icon: <Pencil className="h-3.5 w-3.5" />,      color: 'text-amber-500 bg-amber-500/10' },
  'webhook.deleted':    { label: 'Webhook deleted',      icon: <Trash2 className="h-3.5 w-3.5" />,      color: 'text-red-500 bg-red-500/10' },
  'flag.created':       { label: 'Flag created',         icon: <Flag className="h-3.5 w-3.5" />,        color: 'text-indigo-500 bg-indigo-500/10' },
  'flag.updated':       { label: 'Flag updated',         icon: <Pencil className="h-3.5 w-3.5" />,      color: 'text-indigo-500 bg-indigo-500/10' },
  'flag.deleted':       { label: 'Flag deleted',         icon: <Trash2 className="h-3.5 w-3.5" />,      color: 'text-red-500 bg-red-500/10' },
  'flag.toggled':       { label: 'Flag toggled',         icon: <Zap className="h-3.5 w-3.5" />,         color: 'text-indigo-500 bg-indigo-500/10' },
  'rule.created':       { label: 'Rule created',         icon: <Plus className="h-3.5 w-3.5" />,        color: 'text-indigo-500 bg-indigo-500/10' },
  'rule.updated':       { label: 'Rule updated',         icon: <Pencil className="h-3.5 w-3.5" />,      color: 'text-indigo-500 bg-indigo-500/10' },
  'rule.deleted':       { label: 'Rule deleted',         icon: <Trash2 className="h-3.5 w-3.5" />,      color: 'text-red-500 bg-red-500/10' },
  'env_setting.updated':{ label: 'Environment updated',  icon: <Pencil className="h-3.5 w-3.5" />,      color: 'text-indigo-500 bg-indigo-500/10' },
  'variation.updated':  { label: 'Variation updated',    icon: <Pencil className="h-3.5 w-3.5" />,      color: 'text-indigo-500 bg-indigo-500/10' },
}

function getActionMeta(action: string) {
  return ACTION_META[action] ?? {
    label: action,
    icon: <Zap className="h-3.5 w-3.5" />,
    color: 'text-muted-foreground bg-muted',
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const entryDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = today.getTime() - entryDate.getTime()
  const days = Math.floor(diff / 86400000)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: now.getFullYear() !== d.getFullYear() ? 'numeric' : undefined })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function groupByDate(entries: AuditLogRecord[]): { date: string; entries: AuditLogRecord[] }[] {
  const groups: Map<string, AuditLogRecord[]> = new Map()
  for (const entry of entries) {
    const key = formatDate(entry.createdAt)
    const list = groups.get(key) ?? []
    list.push(entry)
    groups.set(key, list)
  }
  return [...groups.entries()].map(([date, entries]) => ({ date, entries }))
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditLogRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [hasMore, setHasMore] = useState(true)

  const PAGE_SIZE = 100

  const loadEntries = useCallback(async (append = false, cursor?: number) => {
    try {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError('')

      const data = await listAuditLog({ limit: PAGE_SIZE + 1, before: cursor })

      if (data.length > PAGE_SIZE) {
        setHasMore(true)
        data.pop()
      } else {
        setHasMore(false)
      }

      if (append) {
        setEntries(prev => [...prev, ...data])
      } else {
        setEntries(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Filter by category and search
  const filtered = entries.filter((e) => {
    if (category !== 'all') {
      const actionPrefix = (e.action ?? '').split('.')[0]
      // Map flag-related entity types to 'flag' category
      const flagTypes = ['flag', 'rule', 'env_setting', 'variation']
      if (category === 'flag') {
        if (!flagTypes.includes(actionPrefix)) return false
      } else {
        if (actionPrefix !== category) return false
      }
    }
    if (search) {
      const q = search.toLowerCase()
      const meta = getActionMeta(e.action)
      const detailVals = e.details && typeof e.details === 'object' ? Object.values(e.details).map(String) : []
      const haystack = [
        meta.label,
        e.actorName,
        e.entityType,
        e.action,
        ...detailVals,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const grouped = groupByDate(filtered)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Audit Log</h2>
            <p className="text-sm text-muted-foreground">Track all changes across your project</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEntries()}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="border-b px-6 py-3 flex items-center gap-4">
        {/* Category tabs */}
        <div className="flex items-center gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer',
                category === cat.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="pl-9 h-8 text-xs"
          />
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-6 mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="px-6 py-4 space-y-6">
            <div className="space-y-3">
              <Skeleton className="h-4 w-16" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-20" />
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No events found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? 'Try a different search term.' : 'Actions will appear here as they happen.'}
            </p>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-6">
            {grouped.map((group) => (
              <div key={group.date}>
                {/* Date header */}
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.date}
                  </span>
                </div>

                {/* Events */}
                <div className="space-y-0.5">
                  {group.entries.map((entry) => {
                    const meta = getActionMeta(entry.action)
                    const details = entry.details && typeof entry.details === 'object' ? Object.entries(entry.details).filter(([, v]) => v != null) : []

                    return (
                      <div
                        key={entry.id}
                        className="group flex items-start gap-3 rounded-lg px-3 py-2.5 -mx-3 transition-colors hover:bg-muted/50"
                      >
                        {/* Icon */}
                        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.color)}>
                          {meta.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{meta.label}</span>
                            {entry.entityId && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {entry.entityType} #{entry.entityId}
                              </span>
                            )}
                          </div>

                          {/* Details */}
                          {details.length > 0 && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {details.map(([key, value]) => (
                                <span key={key} className="text-xs text-muted-foreground">
                                  <span className="text-foreground/60">{key}:</span>{' '}
                                  {typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Actor */}
                          {entry.actorName && (
                            <div className="flex items-center gap-1 mt-1">
                              {entry.actorType === 'api_key' ? (
                                <Key className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <User className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className="text-xs text-muted-foreground">{entry.actorName}</span>
                            </div>
                          )}
                        </div>

                        {/* Time */}
                        <span className="text-[11px] text-muted-foreground shrink-0 pt-0.5">
                          {formatTime(entry.createdAt)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const lastId = entries.length > 0 ? entries[entries.length - 1].id : undefined
                    loadEntries(true, lastId)
                  }}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
                      Load more
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {entries.length > 0 && (
        <div className="border-t px-6 py-2 text-xs text-muted-foreground">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          {category !== 'all' && ` in ${CATEGORIES.find(c => c.key === category)?.label}`}
          {search && ` matching "${search}"`}
        </div>
      )}
    </div>
  )
}
