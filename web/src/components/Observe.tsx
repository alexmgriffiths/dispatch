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
} from 'lucide-react'
import {
  listObserveEvents,
} from '../api/client'
import type {
  ObserveEvent,
  ObserveParams,
} from '../api/client'

type Tab = 'events' | 'errors' | 'crashes'

const PAGE_SIZE = 50

const TAB_CONFIG: Record<Tab, { label: string; eventType: string | undefined; icon: React.ReactNode }> = {
  events: { label: 'Events', eventType: 'custom', icon: <Zap className="h-4 w-4" /> },
  errors: { label: 'Errors', eventType: 'js_error', icon: <Bug className="h-4 w-4" /> },
  crashes: { label: 'Crashes', eventType: 'crash', icon: <AlertTriangle className="h-4 w-4" /> },
}

export default function Observe() {
  const [tab, setTab] = useState<Tab>('errors')
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [events, setEvents] = useState<ObserveEvent[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const config = TAB_CONFIG[tab]

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
      setEvents(res.events)
      setTotal(res.total)
    } catch (e) {
      console.error('Failed to load observe data', e)
    } finally {
      setLoading(false)
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
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            {config.icon}
            <p className="mt-2 text-sm">No {config.label.toLowerCase()} found</p>
            <p className="text-xs">Events will appear here as your devices report them</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {/* Header row */}
            <div className="flex items-center gap-4 px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="w-5" />
              <div className="w-32">Time</div>
              <div className="flex-1">{tab === 'events' ? 'Event' : 'Message'}</div>
              <div className="w-20 text-right">Count</div>
              <div className="w-28">Device</div>
              <div className="w-20">Platform</div>
              <div className="w-24">Channel</div>
              <div className="w-20">Flags</div>
            </div>

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

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors hover:bg-muted/30',
          expanded && 'bg-muted/20',
        )}
        onClick={onToggle}
      >
        <div className="w-5 shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>

        <div className="w-32 shrink-0">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelative(event.receivedAt)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono truncate" title={event.eventMessage || event.eventName || undefined}>
            {event.eventMessage || event.eventName || '(no message)'}
          </p>
        </div>

        <div className="w-20 text-right shrink-0">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {event.count}
          </span>
        </div>

        <div className="w-28 shrink-0">
          <span className="text-xs text-muted-foreground font-mono truncate block" title={event.deviceId}>
            {event.deviceId.slice(0, 12)}
          </span>
        </div>

        <div className="w-20 shrink-0">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {event.platform === 'ios' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
            {event.platform}
          </span>
        </div>

        <div className="w-24 shrink-0">
          {event.channelName && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
              {event.channelName}
            </span>
          )}
        </div>

        <div className="w-20 shrink-0">
          {flagCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={JSON.stringify(event.flagStates, null, 2)}>
              <Flag className="h-3 w-3" />
              {flagCount}
            </span>
          )}
        </div>
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
