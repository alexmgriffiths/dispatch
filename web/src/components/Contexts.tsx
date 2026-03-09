import { useEffect, useState, useCallback } from 'react'
import { listContexts, getContext, deleteContext, createContext, listContextKinds, CONTEXT_KINDS, listSegments, getSegment, createSegment, updateSegment, deleteSegment } from '../api/client'
import type { FlagContextRecord, FlagContextEvaluationRecord, ContextKind, SegmentRecord, SegmentDetailRecord } from '../api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Flag,
  Clock,
  Hash,
  Eye,
  Smartphone,
  Tag,
  Globe,
  Plus,
  X,
  Server,
  Layers,
  Filter,
  Pencil,
  Copy,
  Check,
} from 'lucide-react'

const PAGE_SIZE = 50

const USE_MOCK = import.meta.env.VITE_MOCK === 'true'

// ── Segment types ──────────────────────────────────────────────────────

interface SegmentCondition {
  attribute: string
  operator: string
  values: string[]
}

interface Segment extends Omit<SegmentRecord, 'conditions'> {
  conditions: SegmentCondition[]
  referencedBy: { type: string; name: string }[]
}

function mapRecordToSegment(r: SegmentRecord, referencedBy?: { flagId: number; flagKey: string; flagName: string }[]): Segment {
  return {
    ...r,
    conditions: r.conditions.map((c) => ({
      attribute: c.attribute,
      operator: c.operator,
      values: (c.valuesJson ?? []).map(String),
    })),
    referencedBy: (referencedBy ?? []).map((ref) => ({ type: 'flag', name: ref.flagName })),
  }
}

const SEGMENT_OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'in', label: 'is one of' },
  { value: 'not_in', label: 'is not one of' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'not exists' },
  { value: 'semver_gte', label: 'semver >=' },
  { value: 'semver_lte', label: 'semver <=' },
]

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

export default function Contexts() {
  const [view, setView] = useState<'contexts' | 'segments'>('contexts')
  const [contexts, setContexts] = useState<FlagContextRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [kinds, setKinds] = useState<string[]>([])
  const [offset, setOffset] = useState(0)

  // Detail view
  const [selectedContext, setSelectedContext] = useState<FlagContextRecord | null>(null)
  const [evaluations, setEvaluations] = useState<FlagContextEvaluationRecord[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  // Create
  const [showCreate, setShowCreate] = useState(false)
  const [createKind, setCreateKind] = useState<ContextKind>('user')
  const [createKey, setCreateKey] = useState('')
  const [createName, setCreateName] = useState('')
  const [createAttrs, setCreateAttrs] = useState<{ key: string; value: string }[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<FlagContextRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setOffset(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchContexts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listContexts({
        search: debouncedSearch || undefined,
        kind: kindFilter !== 'all' ? kindFilter : undefined,
        limit: PAGE_SIZE,
        offset,
      })
      setContexts(res.contexts)
      setTotal(res.total)
    } catch {
      setContexts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, kindFilter, offset])

  useEffect(() => {
    fetchContexts()
  }, [fetchContexts])

  // Only show skeletons after a delay so fast loads don't flash
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), 500)
    return () => clearTimeout(timer)
  }, [loading])

  useEffect(() => {
    listContextKinds().then(setKinds).catch(() => setKinds([]))
  }, [])

  async function handleViewDetail(ctx: FlagContextRecord) {
    setSelectedContext(ctx)
    setShowDetail(true)
    setDetailLoading(true)
    try {
      const detail = await getContext(ctx.id)
      setSelectedContext(detail.context)
      setEvaluations(detail.evaluations)
    } catch {
      // ignore
    } finally {
      setDetailLoading(false)
    }
  }

  function resetCreateForm() {
    setCreateKind('user')
    setCreateKey('')
    setCreateName('')
    setCreateAttrs([])
    setCreateError('')
  }

  async function handleCreate() {
    if (!createKey.trim()) {
      setCreateError('Targeting key is required')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const attrs: Record<string, unknown> = {}
      for (const a of createAttrs) {
        if (a.key.trim()) attrs[a.key.trim()] = a.value
      }
      await createContext({
        targetingKey: createKey.trim(),
        kind: createKind,
        name: createName.trim() || undefined,
        attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
      })
      setShowCreate(false)
      resetCreateForm()
      fetchContexts()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create context')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteContext(deleteTarget.id)
      setDeleteTarget(null)
      if (showDetail && selectedContext?.id === deleteTarget.id) {
        setShowDetail(false)
        setSelectedContext(null)
      }
      fetchContexts()
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  if (view === 'segments') {
    return <SegmentsView onSwitchToContexts={() => setView('contexts')} />
  }

  return (
    <>
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Contexts</h2>
            <p className="text-sm text-muted-foreground">Users, devices, and entities that evaluate your flags</p>
          </div>
          <Button onClick={() => { resetCreateForm(); setShowCreate(true) }}>
            <Plus className="mr-1 h-4 w-4" /> Create context
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* View switcher */}
          <div className="flex rounded-lg border bg-muted/30 p-0.5 mr-2">
            <button
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer',
                view === 'contexts' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setView('contexts')}
            >
              Contexts
            </button>
            <button
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer',
                view === 'segments' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setView('segments')}
            >
              Segments
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by key, name, or attribute..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          {kinds.length > 0 && (
            <Select value={kindFilter} onValueChange={(v) => { setKindFilter(v); setOffset(0) }}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="All kinds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-sm text-muted-foreground ml-auto">
            {total} context{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="px-6 py-6">

      {/* Table */}
      {loading && !showSkeleton ? (
        null
      ) : showSkeleton ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : contexts.length === 0 ? (
        <EmptyState search={debouncedSearch} />
      ) : (
        <>
          <div className="rounded-lg border bg-card divide-y">
            {contexts.map((ctx) => (
              <div
                key={ctx.id}
                className="flex items-center gap-4 px-5 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handleViewDetail(ctx)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <KindIcon kind={ctx.kind} />
                    <span className="font-mono text-sm font-medium">{ctx.targetingKey}</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{ctx.kind}</span>
                  </div>
                  {ctx.name && (
                    <span className="text-xs text-muted-foreground ml-7">{ctx.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {Object.entries(ctx.attributes).slice(0, 3).map(([key, value]) => (
                    <span key={key} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                      <Tag className="h-2.5 w-2.5" />{key}:{String(value)}
                    </span>
                  ))}
                  {Object.keys(ctx.attributes).length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{Object.keys(ctx.attributes).length - 3}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{ctx.evaluationCount.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">{formatRelative(ctx.lastSeenAt)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(ctx) }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-violet-500" />
              Context Detail
            </DialogTitle>
          </DialogHeader>
          {selectedContext && (
            <div className="space-y-6">
              {/* Context info */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-medium">{selectedContext.targetingKey}</span>
                      <Badge variant="secondary" className="text-xs">{selectedContext.kind}</Badge>
                    </div>
                    {selectedContext.name && (
                      <p className="text-sm text-muted-foreground mt-0.5">{selectedContext.name}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(selectedContext)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Evaluations:</span>
                    <span className="font-medium">{selectedContext.evaluationCount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">First seen:</span>
                    <span className="font-medium">{formatDate(selectedContext.firstSeenAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Last seen:</span>
                    <span className="font-medium">{formatDate(selectedContext.lastSeenAt)}</span>
                  </div>
                </div>
              </div>

              {/* Attributes */}
              {Object.keys(selectedContext.attributes).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Attributes</h3>
                  <div className="rounded-lg border divide-y">
                    {Object.entries(selectedContext.attributes).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm font-mono text-muted-foreground">{key}</span>
                        <span className="text-sm font-mono">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Flag evaluations */}
              <div>
                <h3 className="text-sm font-medium mb-2">Flag Evaluations</h3>
                {detailLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                ) : evaluations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No flag evaluations recorded yet.</p>
                ) : (
                  <div className="rounded-lg border divide-y">
                    {evaluations.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Flag className="h-4 w-4 text-indigo-500" />
                          <div>
                            <span className="text-sm font-medium">{ev.flagName}</span>
                            <span className="text-xs text-muted-foreground ml-2 font-mono">{ev.flagKey}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {ev.channelName && (
                            <Badge variant="outline" className="text-xs">{ev.channelName}</Badge>
                          )}
                          <div className="text-right">
                            <div className="text-sm font-mono">
                              {ev.variationValue !== null ? JSON.stringify(ev.variationValue) : '—'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {ev.evaluationCount.toLocaleString()} evals · {formatRelative(ev.lastEvaluatedAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create context</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Kind */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Kind</label>
              <div className="grid grid-cols-5 gap-2">
                {CONTEXT_KINDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setCreateKind(k)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors cursor-pointer',
                      createKind === k
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    <KindIconLarge kind={k} selected={createKind === k} />
                    <span className="capitalize">{k}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Targeting key */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Targeting key</label>
              <Input
                value={createKey}
                onChange={(e) => setCreateKey(e.target.value)}
                placeholder={createKind === 'user' ? 'user-abc123' : createKind === 'device' ? 'device-xyz' : 'my-context-id'}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Unique identifier used in targeting rules</p>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={createKind === 'user' ? 'Jane Cooper' : createKind === 'organization' ? 'Acme Inc' : ''}
              />
            </div>

            {/* Attributes */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Attributes <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCreateAttrs([...createAttrs, { key: '', value: '' }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {createAttrs.length > 0 && (
                <div className="space-y-2">
                  {createAttrs.map((attr, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={attr.key}
                        onChange={(e) => {
                          const next = [...createAttrs]
                          next[i] = { ...next[i], key: e.target.value }
                          setCreateAttrs(next)
                        }}
                        placeholder="key"
                        className="font-mono text-sm flex-1"
                      />
                      <Input
                        value={attr.value}
                        onChange={(e) => {
                          const next = [...createAttrs]
                          next[i] = { ...next[i], value: e.target.value }
                          setCreateAttrs(next)
                        }}
                        placeholder="value"
                        className="font-mono text-sm flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setCreateAttrs(createAttrs.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {createAttrs.length === 0 && (
                <p className="text-xs text-muted-foreground">Key-value pairs used by attribute targeting rules</p>
              )}
            </div>

            {createError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{createError}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button disabled={creating} onClick={handleCreate}>
                {creating ? 'Creating...' : 'Create context'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete context</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete context <span className="font-mono font-medium text-foreground">{deleteTarget?.targetingKey}</span>?
            This will remove all evaluation history for this context. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}

// ── Segments View ──────────────────────────────────────────────────────

function SegmentsView({ onSwitchToContexts }: { onSwitchToContexts: () => void }) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Segment | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchSegments = useCallback(async () => {
    try {
      setLoading(true)
      const records = await listSegments()
      setSegments(records.map((r) => mapRecordToSegment(r)))
    } catch (e) {
      console.error('Failed to load segments', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSegments() }, [fetchSegments])

  const selectSegment = useCallback(async (segment: Segment) => {
    try {
      const detail = await getSegment(segment.id)
      setSelectedSegment(mapRecordToSegment(detail, detail.referencedBy))
    } catch (e) {
      console.error('Failed to load segment detail', e)
      setSelectedSegment(segment)
    }
  }, [])

  // Create / edit form
  const [formName, setFormName] = useState('')
  const [formKey, setFormKey] = useState('')
  const [formKeyManual, setFormKeyManual] = useState(false)
  const [formDescription, setFormDescription] = useState('')
  const [formMatchType, setFormMatchType] = useState<'all' | 'any'>('all')
  const [formConditions, setFormConditions] = useState<SegmentCondition[]>([
    { attribute: '', operator: 'eq', values: [''] },
  ])
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  const filteredSegments = segments.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  })

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  function resetForm() {
    setFormName('')
    setFormKey('')
    setFormKeyManual(false)
    setFormDescription('')
    setFormMatchType('all')
    setFormConditions([{ attribute: '', operator: 'eq', values: [''] }])
    setEditingSegment(null)
  }

  function openEdit(segment: Segment) {
    setEditingSegment(segment)
    setFormName(segment.name)
    setFormKey(segment.key)
    setFormKeyManual(true)
    setFormDescription(segment.description)
    setFormMatchType(segment.matchType)
    setFormConditions(segment.conditions.length > 0 ? [...segment.conditions] : [{ attribute: '', operator: 'eq', values: [''] }])
    setShowCreate(true)
  }

  async function handleSave() {
    const validConditions = formConditions.filter((c) => c.attribute.trim())
    if (!formName.trim() || validConditions.length === 0) return

    const key = formKey.trim() || slugify(formName)
    const conditionsPayload = validConditions.map((c) => ({
      attribute: c.attribute,
      operator: c.operator,
      values: c.values as unknown[],
    }))

    setSaving(true)
    try {
      if (editingSegment) {
        await updateSegment(editingSegment.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          matchType: formMatchType,
          conditions: conditionsPayload,
        })
      } else {
        await createSegment({
          name: formName.trim(),
          key,
          description: formDescription.trim(),
          matchType: formMatchType,
          conditions: conditionsPayload,
        })
      }
      setShowCreate(false)
      resetForm()
      await fetchSegments()
      // If we were viewing the edited segment in detail, refresh it
      if (editingSegment && selectedSegment?.id === editingSegment.id) {
        try {
          const detail = await getSegment(editingSegment.id)
          setSelectedSegment(mapRecordToSegment(detail, detail.referencedBy))
        } catch { /* list already refreshed */ }
      }
    } catch (e) {
      console.error('Failed to save segment', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteSegment(deleteTarget.id)
      if (selectedSegment?.id === deleteTarget.id) setSelectedSegment(null)
      setDeleteTarget(null)
      await fetchSegments()
    } catch (e) {
      console.error('Failed to delete segment', e)
    }
  }

  function addCondition() {
    setFormConditions((prev) => [...prev, { attribute: '', operator: 'eq', values: [''] }])
  }

  function updateCondition(index: number, patch: Partial<SegmentCondition>) {
    setFormConditions((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c))
  }

  function removeCondition(index: number) {
    setFormConditions((prev) => prev.filter((_, i) => i !== index))
  }

  const operatorLabel = (op: string) => SEGMENT_OPERATORS.find((o) => o.value === op)?.label ?? op
  const needsValue = (op: string) => op !== 'exists' && op !== 'not_exists'

  // ── Detail view ──────────────────────────────────────────────────────

  if (selectedSegment) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b bg-card px-6 py-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <button className="hover:text-foreground transition-colors cursor-pointer" onClick={() => setSelectedSegment(null)}>
              Segments
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{selectedSegment.name}</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{selectedSegment.name}</h2>
              {selectedSegment.description && (
                <p className="text-sm text-muted-foreground mt-1">{selectedSegment.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(selectedSegment)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(selectedSegment)}
                disabled={selectedSegment.referencedBy.length > 0}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key + metadata */}
          <div className="rounded-lg border bg-card p-5">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Key</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm font-mono">{selectedSegment.key}</code>
                  <button
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedSegment.key)
                      setCopiedKey(true)
                      setTimeout(() => setCopiedKey(false), 2000)
                    }}
                  >
                    {copiedKey ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Estimated devices</span>
                <p className="text-sm font-medium mt-1">{selectedSegment.estimatedDevices.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Match logic</span>
                <p className="text-sm font-medium mt-1">{selectedSegment.matchType === 'all' ? 'All conditions (AND)' : 'Any condition (OR)'}</p>
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Conditions</h3>
            <div className="space-y-2">
              {selectedSegment.conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground uppercase w-8">
                      {selectedSegment.matchType === 'all' ? 'AND' : 'OR'}
                    </span>
                  )}
                  {i === 0 && <span className="w-8" />}
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    <code className="font-mono font-medium">{cond.attribute}</code>
                    <span className="text-muted-foreground">{operatorLabel(cond.operator)}</span>
                    {needsValue(cond.operator) && (
                      <code className="font-mono text-muted-foreground">{cond.values.join(', ')}</code>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Referenced by */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Referenced by</h3>
            {selectedSegment.referencedBy.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not referenced by any flags or rollouts yet.</p>
            ) : (
              <div className="space-y-2">
                {selectedSegment.referencedBy.map((ref, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border px-4 py-2.5">
                    {ref.type === 'flag' ? (
                      <Flag className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Layers className="h-3.5 w-3.5 text-blue-500" />
                    )}
                    <span className="text-sm font-mono">{ref.name}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">{ref.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create/Edit dialog and delete confirmation render here too */}
        {renderCreateDialog()}
        {renderDeleteConfirm()}
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────

  function renderCreateDialog() {
    return (
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); resetForm() } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSegment ? 'Edit segment' : 'Create segment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Name + Key */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value)
                    if (!formKeyManual) setFormKey(slugify(e.target.value))
                  }}
                  placeholder="e.g. iOS Pro Users"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Key</label>
                <Input
                  value={formKey}
                  onChange={(e) => { setFormKey(e.target.value); setFormKeyManual(true) }}
                  placeholder="auto-generated"
                  className="mt-1 font-mono text-sm"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What does this segment target?"
                className="mt-1"
              />
            </div>

            {/* Match type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Match logic</label>
              <div className="flex gap-2 mt-1">
                <button
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer',
                    formMatchType === 'all' ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setFormMatchType('all')}
                >
                  All conditions (AND)
                </button>
                <button
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer',
                    formMatchType === 'any' ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setFormMatchType('any')}
                >
                  Any condition (OR)
                </button>
              </div>
            </div>

            {/* Conditions */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Conditions</label>
              <div className="space-y-2 mt-2">
                {formConditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i > 0 && (
                      <span className="text-[10px] font-medium text-muted-foreground uppercase w-8 shrink-0 text-center">
                        {formMatchType === 'all' ? 'AND' : 'OR'}
                      </span>
                    )}
                    {i === 0 && <span className="w-8 shrink-0" />}
                    <Input
                      value={cond.attribute}
                      onChange={(e) => updateCondition(i, { attribute: e.target.value })}
                      placeholder="attribute"
                      className="flex-1 font-mono text-xs h-8"
                    />
                    <Select value={cond.operator} onValueChange={(v) => updateCondition(i, { operator: v })}>
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEGMENT_OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {needsValue(cond.operator) && (
                      <Input
                        value={cond.values.join(', ')}
                        onChange={(e) => updateCondition(i, { values: e.target.value.split(',').map((v) => v.trim()) })}
                        placeholder="value(s)"
                        className="flex-1 font-mono text-xs h-8"
                      />
                    )}
                    {formConditions.length > 1 && (
                      <button
                        className="text-muted-foreground hover:text-destructive cursor-pointer p-1"
                        onClick={() => removeCondition(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer ml-8"
                  onClick={addCondition}
                >
                  <Plus className="h-3 w-3" /> Add condition
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); resetForm() }}>Cancel</Button>
              <Button
                disabled={saving || !formName.trim() || formConditions.every((c) => !c.attribute.trim())}
                onClick={handleSave}
              >
                {saving ? 'Saving...' : editingSegment ? 'Save changes' : 'Create segment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  function renderDeleteConfirm() {
    return (
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segment</AlertDialogTitle>
            <AlertDialogDescription>
              Delete segment <span className="font-mono font-medium">{deleteTarget?.name}</span>?
              {deleteTarget && deleteTarget.referencedBy.length > 0 && (
                <> This segment is referenced by {deleteTarget.referencedBy.length} rule{deleteTarget.referencedBy.length !== 1 ? 's' : ''}. Those rules will stop matching.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete segment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Segments</h2>
            <p className="text-sm text-muted-foreground">Reusable audience definitions for flag rules and rollouts</p>
          </div>
          <Button onClick={() => { resetForm(); setShowCreate(true) }}>
            <Plus className="mr-1 h-4 w-4" /> Create segment
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {/* View switcher */}
          <div className="flex rounded-lg border bg-muted/30 p-0.5 mr-2">
            <button
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onSwitchToContexts}
            >
              Contexts
            </button>
            <button
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors bg-background shadow-sm text-foreground cursor-pointer"
              onClick={() => {}}
            >
              Segments
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search segments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <span className="text-sm text-muted-foreground ml-auto">
            {filteredSegments.length} segment{filteredSegments.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            {search ? (
              <p className="text-sm text-muted-foreground">No segments match your search.</p>
            ) : (
              <>
                <Filter className="h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium mb-1">No segments yet</p>
                <p className="text-xs text-muted-foreground mb-4">Create a segment to define reusable audience conditions.</p>
                <Button size="sm" onClick={() => { resetForm(); setShowCreate(true) }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Create segment
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredSegments.map((segment) => (
              <button
                key={segment.id}
                className="flex items-center gap-4 px-6 py-4 w-full text-left hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => selectSegment(segment)}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/50">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{segment.name}</span>
                    <code className="text-[11px] text-muted-foreground font-mono">{segment.key}</code>
                  </div>
                  {segment.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{segment.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {segment.conditions.slice(0, 3).map((cond, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {cond.attribute} {operatorLabel(cond.operator)} {needsValue(cond.operator) ? cond.values[0] : ''}
                        {cond.values.length > 1 && needsValue(cond.operator) && `, +${cond.values.length - 1}`}
                      </span>
                    ))}
                    {segment.conditions.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{segment.conditions.length - 3} more</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">~{segment.estimatedDevices.toLocaleString()} devices</span>
                  </div>
                  {segment.referencedBy.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {segment.referencedBy.length} ref{segment.referencedBy.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {renderCreateDialog()}
      {renderDeleteConfirm()}
    </div>
  )
}

function EmptyState({ search }: { search: string }) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">No contexts match your search.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-12 py-20">
        <div className="grid grid-cols-2 gap-16 items-start">
          {/* Left — Copy */}
          <div className="space-y-6 pt-8">
            <h2 className="text-3xl font-bold tracking-tight leading-tight">
              See who's evaluating your flags
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Contexts are the users, devices, and entities that your feature flags are evaluated against.
              When your SDK reports evaluations with context data, they appear here automatically — giving
              you visibility into who is getting which flag values.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Include a <code className="text-xs bg-muted px-1 py-0.5 rounded">context</code> object
              when reporting evaluations from your SDK. Each context has a targeting key, a kind (e.g. user,
              device), and optional attributes for targeting rules.
            </p>
          </div>

          {/* Right — Preview card */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {/* Mini header */}
            <div className="border-b px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="font-medium text-foreground">Contexts</span>
              <span className="ml-auto text-xs">3 contexts</span>
            </div>

            {/* Mock context rows */}
            <div className="divide-y">
              {[
                { key: 'user-8a3f', name: 'Jane Cooper', kind: 'user', attrs: ['plan:pro', 'version:2.1.0'], evals: 1243, icon: <Users className="h-3.5 w-3.5 text-violet-500" /> },
                { key: 'device-x92k', name: null, kind: 'device', attrs: ['platform:ios', 'os:17.4'], evals: 891, icon: <Smartphone className="h-3.5 w-3.5 text-blue-500" /> },
                { key: 'org-acme', name: 'Acme Inc', kind: 'organization', attrs: ['tier:enterprise'], evals: 5420, icon: <Globe className="h-3.5 w-3.5 text-emerald-500" /> },
              ].map((ctx) => (
                <div key={ctx.key} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {ctx.icon}
                      <span className="font-mono text-sm font-medium">{ctx.key}</span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{ctx.kind}</span>
                    </div>
                    {ctx.name && (
                      <span className="text-xs text-muted-foreground ml-7">{ctx.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ctx.attrs.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        <Tag className="h-2.5 w-2.5" />{a}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{ctx.evals.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* SDK snippet */}
            <div className="border-t bg-muted/30 px-5 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">SDK usage</p>
              <pre className="text-xs font-mono text-muted-foreground leading-relaxed"><code>{`// Include context when reporting evaluations
provider.reportEvaluations({
  evaluations: [...],
  context: {
    targetingKey: "user-8a3f",
    kind: "user",
    name: "Jane Cooper",
    attributes: { plan: "pro" }
  }
})`}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'device':
      return <Smartphone className="h-3.5 w-3.5 text-blue-500" />
    case 'organization':
      return <Globe className="h-3.5 w-3.5 text-emerald-500" />
    case 'service':
      return <Server className="h-3.5 w-3.5 text-amber-500" />
    case 'environment':
      return <Layers className="h-3.5 w-3.5 text-cyan-500" />
    default:
      return <Users className="h-3.5 w-3.5 text-violet-500" />
  }
}

function KindIconLarge({ kind, selected }: { kind: string; selected: boolean }) {
  const cls = `h-5 w-5 ${selected ? '' : 'opacity-60'}`
  switch (kind) {
    case 'device':
      return <Smartphone className={`${cls} text-blue-500`} />
    case 'organization':
      return <Globe className={`${cls} text-emerald-500`} />
    case 'service':
      return <Server className={`${cls} text-amber-500`} />
    case 'environment':
      return <Layers className={`${cls} text-cyan-500`} />
    default:
      return <Users className={`${cls} text-violet-500`} />
  }
}
