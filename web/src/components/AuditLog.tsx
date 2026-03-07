import { useEffect, useState } from 'react'
import { listAuditLog } from '../api/client'
import type { AuditLogRecord } from '../api/client'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { User, Key } from 'lucide-react'

type BadgeVariant = 'ios' | 'android' | 'canary' | 'staging' | 'disabled'

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditLogRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadEntries()
  }, [])

  async function loadEntries() {
    try {
      setLoading(true)
      setError('')
      const data = await listAuditLog()
      setEntries(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
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

  function actionLabel(action: string): string {
    const labels: Record<string, string> = {
      'build.uploaded': 'Build Uploaded',
      'build.published': 'Build Published',
      'build.deleted': 'Build Deleted',
      'update.created': 'Update Created',
      'update.patched': 'Update Modified',
      'update.republished': 'Update Republished',
      'update.deleted': 'Update Deleted',
      'update.rollback': 'Rollback Created',
      'branch.created': 'Branch Created',
      'branch.deleted': 'Branch Deleted',
      'channel.created': 'Channel Created',
      'channel.updated': 'Channel Updated',
      'channel.deleted': 'Channel Deleted',
      'webhook.created': 'Webhook Created',
      'webhook.updated': 'Webhook Updated',
      'webhook.deleted': 'Webhook Deleted',
    }
    return labels[action] || action
  }

  function actionBadgeVariant(action: string): BadgeVariant {
    if (action.startsWith('build.')) return 'ios'
    if (action.startsWith('update.')) return 'canary'
    if (action.startsWith('branch.') || action.startsWith('channel.')) return 'android'
    if (action.startsWith('webhook.')) return 'staging'
    return 'disabled'
  }

  function dotColor(action: string): string {
    if (action.startsWith('build.')) return 'bg-blue-500'
    if (action.startsWith('update.')) return 'bg-violet-500'
    if (action.startsWith('branch.') || action.startsWith('channel.')) return 'bg-emerald-500'
    if (action.startsWith('webhook.')) return 'bg-amber-500'
    return 'bg-gray-400'
  }

  const filtered = filter !== 'all'
    ? entries.filter((e) => e.action.includes(filter))
    : entries

  const actionTypes = [...new Set(entries.map((e) => e.action))]

  return (
    <>
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Audit Log</h2>
            <p className="text-sm text-muted-foreground">Track all changes across your OTA updates</p>
          </div>
          {actionTypes.length > 0 && (
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {actionTypes.map((a) => (
                  <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">{error}</div>
        )}

        {loading ? (
          <div className="relative pl-6 space-y-0">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <Skeleton className="absolute -left-6 top-1.5 h-[10px] w-[10px] rounded-full" />
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-12 ml-auto" />
                </div>
                <div className="flex gap-3 mt-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="text-3xl mb-3">&#9898;</div>
            <h3 className="font-semibold">No events yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Actions will appear here as they happen.</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-0">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            {filtered.map((entry) => (
              <div key={entry.id} className="relative pb-5 last:pb-0">
                <div className={`absolute -left-6 top-1.5 h-[10px] w-[10px] rounded-full ${dotColor(entry.action)} ring-2 ring-background`} />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={actionBadgeVariant(entry.action)}>
                    {actionLabel(entry.action)}
                  </Badge>
                  {entry.entity_id && (
                    <span className="text-xs text-muted-foreground">
                      {entry.entity_type} #{entry.entity_id}
                    </span>
                  )}
                  {entry.actor_name && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {entry.actor_type === 'api_key' ? <Key className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {entry.actor_name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">{timeAgo(entry.created_at)}</span>
                </div>
                {Object.keys(entry.details).length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {Object.entries(entry.details).map(([key, value]) =>
                      value != null ? (
                        <span key={key} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">{key}:</span> {String(value)}
                        </span>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
