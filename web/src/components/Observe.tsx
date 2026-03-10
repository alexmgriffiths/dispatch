import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
  Bug,
  Zap,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
  Flag,
  Clock,
  Eye,
} from 'lucide-react'
import {
  listObserveEvents,
} from '../api/client'
import type {
  ObserveEvent,
  ObserveParams,
} from '../api/client'

type Tab = 'all' | 'events' | 'errors' | 'crashes'

const PAGE_SIZE = 50

const TAB_CONFIG: Record<Tab, { label: string; eventType: string | undefined; icon: React.ReactNode }> = {
  all: { label: 'All', eventType: undefined, icon: <Eye className="h-4 w-4" /> },
  errors: { label: 'Errors', eventType: 'js_error', icon: <Bug className="h-4 w-4" /> },
  crashes: { label: 'Crashes', eventType: 'crash', icon: <AlertTriangle className="h-4 w-4" /> },
  events: { label: 'Events', eventType: 'custom', icon: <Zap className="h-4 w-4" /> },
}

function eventTypeIcon(eventType: string) {
  switch (eventType) {
    case 'crash': return <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
    case 'js_error': return <Bug className="h-3.5 w-3.5 text-amber-500 shrink-0" />
    case 'custom': return <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
    default: return <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  }
}

export default function Observe() {
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [events, setEvents] = useState<ObserveEvent[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [counts, setCounts] = useState<{ errors: number; crashes: number; events: number }>({ errors: 0, crashes: 0, events: 0 })

  const config = TAB_CONFIG[tab]

  // Fetch summary counts (no filters applied — shows totals)
  useEffect(() => {
    async function fetchCounts() {
      try {
        const [err, crash, custom] = await Promise.all([
          listObserveEvents({ type: 'js_error', limit: 0 }),
          listObserveEvents({ type: 'crash', limit: 0 }),
          listObserveEvents({ type: 'custom', limit: 0 }),
        ])
        setCounts({ errors: err.total, crashes: crash.total, events: custom.total })
      } catch {
        // silent — cards will show 0
      }
    }
    fetchCounts()
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: ObserveParams = {
        type: config.eventType,
        limit: PAGE_SIZE,
        offset,
      }
      if (search) params.search = search
      if (channelFilter) params.channel = channelFilter
      if (platformFilter) params.platform = platformFilter

      const res = await listObserveEvents(params)
      // Filter out app_launch heartbeats — they're noise in the observe view
      const filtered = tab === 'all'
        ? res.events.filter((e: ObserveEvent) => e.eventType !== 'app_launch')
        : res.events
      setEvents(filtered)
      setTotal(res.total)
    } catch (e) {
      console.error('Failed to load observe data', e)
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [tab, search, channelFilter, platformFilter, offset, config.eventType])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
    setExpandedId(null)
  }, [tab, search, channelFilter, platformFilter])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-5">
        <h2 className="text-lg font-semibold">Observe</h2>
        <p className="text-sm text-muted-foreground">
          Events, errors, and crashes from your devices
        </p>

        {/* Tabs */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex rounded-lg border bg-muted/30 p-0.5">
            {(Object.keys(TAB_CONFIG) as Tab[]).map((t) => (
              <button
                key={t}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer',
                  tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(t)}
              >
                {TAB_CONFIG[t].icon}
                {TAB_CONFIG[t].label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring w-56"
            />
          </div>

          {/* Channel filter */}
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All channels</option>
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="canary">canary</option>
          </select>

          {/* Platform filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All platforms</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Summary cards — hidden when truly empty */}
        {(total > 0 || search || channelFilter || platformFilter || (loading && !initialLoad)) && <div className="grid grid-cols-3 gap-3">
          <button
            className={cn(
              'rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/30 cursor-pointer',
              tab === 'errors' && 'border-amber-500/40 bg-amber-500/5',
            )}
            onClick={() => setTab(tab === 'errors' ? 'all' : 'errors')}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Errors</span>
              <Bug className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-2xl font-bold">{counts.errors.toLocaleString()}</span>
          </button>
          <button
            className={cn(
              'rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/30 cursor-pointer',
              tab === 'crashes' && 'border-destructive/40 bg-destructive/5',
            )}
            onClick={() => setTab(tab === 'crashes' ? 'all' : 'crashes')}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Crashes</span>
              <AlertTriangle className={cn('h-4 w-4', counts.crashes > 0 ? 'text-destructive' : 'text-muted-foreground')} />
            </div>
            <span className={cn('text-2xl font-bold', counts.crashes > 0 && 'text-destructive')}>{counts.crashes.toLocaleString()}</span>
          </button>
          <button
            className={cn(
              'rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/30 cursor-pointer',
              tab === 'events' && 'border-primary/40 bg-primary/5',
            )}
            onClick={() => setTab(tab === 'events' ? 'all' : 'events')}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Custom Events</span>
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <span className="text-2xl font-bold">{counts.events.toLocaleString()}</span>
          </button>
        </div>}

        {loading && !initialLoad ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : loading && initialLoad ? (
          null
        ) : total === 0 ? (
          (search || channelFilter || platformFilter) ? (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-sm text-muted-foreground">No {tab === 'all' ? 'events' : config.label.toLowerCase()} match your filters.</p>
            </div>
          ) : (
            <ObserveEmptyState />
          )
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                expanded={expandedId === event.id}
                onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EventRow({ event, expanded, onToggle }: { event: ObserveEvent; expanded: boolean; onToggle: () => void }) {
  const flagCount = event.flagStates ? Object.keys(event.flagStates).length : 0
  const typeIcon = eventTypeIcon(event.eventType)

  return (
    <div>
      <div
        className={cn(
          'px-5 py-3.5 cursor-pointer transition-colors hover:bg-muted/30 space-y-1.5',
          expanded && 'bg-muted/20',
        )}
        onClick={onToggle}
      >
        {/* Line 1: icon + message + badges */}
        <div className="flex items-center gap-2">
          {typeIcon}
          <span className="text-sm font-mono truncate" title={event.eventMessage || event.eventName || undefined}>
            {event.eventMessage || event.eventName || '(no message)'}
          </span>
          {event.isFatal && (
            <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-1.5 py-0 text-[10px] font-medium shrink-0">
              FATAL
            </span>
          )}
          {event.errorName && (
            <span className="inline-flex items-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0 text-[10px] font-medium shrink-0">
              {event.errorName}
            </span>
          )}
          {event.count > 1 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium shrink-0 ml-auto">
              {event.count}x
            </span>
          )}
        </div>

        {/* Line 2: metadata with middot separators */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-5">
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> {formatRelative(event.receivedAt)}
          </span>
          <span>&middot;</span>
          <span className="flex items-center gap-1">
            {event.platform === 'ios' ? <Monitor className="h-2.5 w-2.5" /> : <Smartphone className="h-2.5 w-2.5" />}
            {event.platform}
          </span>
          {event.channelName && (
            <>
              <span>&middot;</span>
              <span>{event.channelName}</span>
            </>
          )}
          <span>&middot;</span>
          <span className="font-mono">{event.deviceId.slice(0, 12)}</span>
          {flagCount > 0 && (
            <>
              <span>&middot;</span>
              <span className="inline-flex items-center gap-1">
                <Flag className="h-2.5 w-2.5" /> {flagCount} flag{flagCount !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>

        {/* Line 3: stack trace preview (collapsed only, errors/crashes) */}
        {!expanded && event.stackTrace && (
          <pre className="text-[10px] font-mono bg-muted/50 rounded px-2.5 py-1.5 text-muted-foreground ml-5 overflow-hidden max-h-10 truncate">
            {event.stackTrace.split('\n').slice(0, 2).join('\n')}
          </pre>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t bg-muted/10">
          <EventDetail event={event} />
        </div>
      )}
    </div>
  )
}

function EventDetail({ event }: { event: ObserveEvent }) {
  const flagCount = event.flagStates ? Object.keys(event.flagStates).length : 0
  const tagCount = event.tags ? Object.keys(event.tags).length : 0

  return (
    <div className="px-5 py-4 pl-10 space-y-3">
      {/* Top row: metadata badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(event.receivedAt).toLocaleString()}
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {event.platform === 'ios' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
          {event.platform}
        </span>
        {event.channelName && (
          <>
            <span className="text-muted-foreground/40">|</span>
            <span className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px]">
              {event.channelName}
            </span>
          </>
        )}
        <span className="text-muted-foreground/40">|</span>
        <span className="text-xs text-muted-foreground">v{event.runtimeVersion}</span>
        <span className="text-muted-foreground/40">|</span>
        <span className="text-xs text-muted-foreground font-mono" title={event.deviceId}>
          {event.deviceId.slice(0, 16)}...
        </span>
        {event.isFatal && (
          <>
            <span className="text-muted-foreground/40">|</span>
            <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-medium">
              FATAL
            </span>
          </>
        )}
        {event.errorName && (
          <>
            <span className="text-muted-foreground/40">|</span>
            <span className="inline-flex items-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 text-[10px] font-medium">
              {event.errorName}
            </span>
          </>
        )}
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium ml-auto">
          {event.count}x
        </span>
      </div>

      {/* Stack trace */}
      {event.stackTrace && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Stack Trace</p>
          <pre className="text-xs font-mono bg-background border rounded-md p-3 overflow-x-auto whitespace-pre max-h-48 overflow-y-auto text-foreground/80">
            {event.stackTrace}
          </pre>
        </div>
      )}

      {/* Component stack */}
      {event.componentStack && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Component Stack</p>
          <pre className="text-xs font-mono bg-background border rounded-md p-3 overflow-x-auto whitespace-pre max-h-32 overflow-y-auto text-foreground/80">
            {event.componentStack}
          </pre>
        </div>
      )}

      {/* Tags + Flags row */}
      {(tagCount > 0 || flagCount > 0) && (
        <div className="flex gap-6">
          {/* Tags */}
          {tagCount > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Tags</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(event.tags!).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono">
                    {key}: {String(val)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Flag states */}
          {flagCount > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Flag States</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(event.flagStates!).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono">
                    <Flag className="h-2.5 w-2.5 text-muted-foreground" />
                    {key}={String(val)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Update UUID */}
      {event.updateUuid && (
        <p className="text-[10px] text-muted-foreground font-mono">
          Update: {event.updateUuid}
        </p>
      )}
    </div>
  )
}

function ObserveEmptyState() {
  return (
    <div className="max-w-6xl mx-auto px-12 py-20">
      <div className="grid grid-cols-2 gap-16 items-start">
        {/* Left — Copy */}
        <div className="space-y-6 pt-8">
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            Real-time visibility into your app's health
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Observe captures JS errors, crashes, and custom events from your devices in real time.
            Every event includes the stack trace, device metadata, active feature flags, and the
            OTA update that was running — so you can pinpoint exactly what went wrong and why.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Install the <code className="text-xs bg-muted px-1 py-0.5 rounded">@appdispatch/health-reporter</code> package
            in your React Native app to start reporting events automatically.
          </p>
        </div>

        {/* Right — Preview card */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Mini header */}
          <div className="border-b px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="h-4 w-4" />
            <span className="font-medium text-foreground">Observe</span>
            <span className="ml-auto text-xs">3 events</span>
          </div>

          {/* Mock event rows */}
          <div className="divide-y">
            {/* JS Error */}
            <div className="px-5 py-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <Bug className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-mono truncate">TypeError: Cannot read property 'map' of undefined</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-5">
                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> 2m ago</span>
                <span>&middot;</span>
                <span className="flex items-center gap-1"><Smartphone className="h-2.5 w-2.5" /> ios</span>
                <span>&middot;</span>
                <span className="inline-flex items-center gap-1"><Flag className="h-2.5 w-2.5" /> 2 flags</span>
              </div>
              {/* Mini stack trace */}
              <pre className="text-[10px] font-mono bg-muted/50 rounded px-2.5 py-1.5 text-muted-foreground ml-5 overflow-hidden max-h-10">
                at CheckoutScreen (checkout.tsx:42){'\n'}at RenderComponent (react-native:1234)
              </pre>
            </div>

            {/* Crash */}
            <div className="px-5 py-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-sm font-mono truncate">Native crash in libhermes.so</span>
                <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-1.5 py-0 text-[10px] font-medium">FATAL</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-5">
                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> 15m ago</span>
                <span>&middot;</span>
                <span className="flex items-center gap-1"><Smartphone className="h-2.5 w-2.5" /> android</span>
                <span>&middot;</span>
                <span>3x</span>
              </div>
            </div>

            {/* Custom event */}
            <div className="px-5 py-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-mono truncate">checkout_completed</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-5">
                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> 1h ago</span>
                <span>&middot;</span>
                <span className="flex items-center gap-1"><Monitor className="h-2.5 w-2.5" /> ios</span>
                <span>&middot;</span>
                <span>production</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t bg-muted/30 px-5 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Captures</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>JS errors with stack traces</span>
              <span>Native crashes</span>
              <span>Custom events</span>
              <span>Flag state correlation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(iso).toLocaleDateString()
}
