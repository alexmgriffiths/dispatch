import { useEffect, useState } from 'react'
import { getUpdateHistory, republishUpdate, createRollback, listChannels } from '../api/client'
import type { UpdateRecord, AuditLogRecord, ChannelRecord } from '../api/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { GitBranch, GitCommit, ExternalLink, Copy, RotateCcw, Repeat2 } from 'lucide-react'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

interface Props {
  update: UpdateRecord | null
  onClose: () => void
  onRefresh?: () => void
}

export default function UpdateDrawer({ update, onClose, onRefresh }: Props) {
  const [history, setHistory] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [channels, setChannels] = useState<ChannelRecord[]>([])

  // Republish state
  const [showRepublish, setShowRepublish] = useState(false)
  const [republishChannels, setRepublishChannels] = useState<Set<string>>(new Set())
  const [republishMessage, setRepublishMessage] = useState('')
  const [republishing, setRepublishing] = useState(false)

  // Rollback state
  const [rollingBack, setRollingBack] = useState(false)

  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!update) return
    setLoading(true)
    setShowRepublish(false)
    setActionResult(null)
    getUpdateHistory(update.id)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
    listChannels()
      .then(setChannels)
      .catch(() => setChannels([]))
  }, [update?.id])

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function actionLabel(action: string): string {
    switch (action) {
      case 'build.published': return 'Published'
      case 'update.created': return 'Created'
      case 'update.patched': return 'Updated'
      case 'update.rollback': return 'Rolled back'
      case 'update.republished': return 'Republished'
      default: return action.replace('.', ' ')
    }
  }

  function detailSummary(entry: AuditLogRecord): string {
    const d = entry.details
    const parts: string[] = []
    if (d.rollout_percentage !== undefined && d.rollout_percentage !== null) {
      parts.push(`rollout \u2192 ${d.rollout_percentage}%`)
    }
    if (d.is_critical !== undefined && d.is_critical !== null) {
      parts.push(`critical \u2192 ${d.is_critical ? 'yes' : 'no'}`)
    }
    if (d.is_enabled !== undefined && d.is_enabled !== null) {
      parts.push(`enabled \u2192 ${d.is_enabled ? 'yes' : 'no'}`)
    }
    if (d.channel) parts.push(`channel: ${d.channel}`)
    if (d.source_update_id) parts.push(`from update #${d.source_update_id}`)
    if (d.release_message) parts.push(`"${d.release_message}"`)
    return parts.join(', ') || 'No details'
  }

  function toggleRepublishChannel(name: string) {
    setRepublishChannels(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function handleRepublish() {
    if (!update || republishChannels.size === 0) return
    setRepublishing(true)
    setActionResult(null)
    try {
      const result = await republishUpdate(update.id, {
        channels: [...republishChannels],
        releaseMessage: republishMessage || undefined,
      })
      setActionResult({
        type: 'success',
        message: `Republished to ${result.updates.map(u => u.channel).join(', ')} (group ${result.groupId.slice(0, 8)})`,
      })
      setShowRepublish(false)
      onRefresh?.()
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : 'Republish failed' })
    } finally {
      setRepublishing(false)
    }
  }

  async function handleRollbackToThis() {
    if (!update) return
    setRollingBack(true)
    setActionResult(null)
    try {
      await createRollback({
        runtimeVersion: update.runtime_version,
        platform: update.platform,
        channel: update.channel,
        rollbackToUpdateId: update.id,
      })
      setActionResult({ type: 'success', message: `Created rollback to update #${update.id}` })
      onRefresh?.()
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : 'Rollback failed' })
    } finally {
      setRollingBack(false)
    }
  }

  if (!update) return null

  return (
    <Sheet open={!!update} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="flex flex-col p-0 sm:max-w-lg">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>Update Details</SheetTitle>
          <SheetDescription className="font-mono text-xs truncate">
            {update.update_uuid}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 pb-6 space-y-6">
            {/* Action result */}
            {actionResult && (
              <div className={cn(
                'rounded-md px-3 py-2 text-sm',
                actionResult.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-destructive/10 text-destructive'
              )}>
                {actionResult.message}
              </div>
            )}

            {/* Overview */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Overview</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Runtime Version" value={`v${update.runtime_version}`} />
                {update.runtime_fingerprint && (
                  <Field label="Fingerprint" value={update.runtime_fingerprint} mono />
                )}
                <Field label="Platform">
                  <Badge variant={update.platform as 'ios' | 'android'}>{update.platform}</Badge>
                </Field>
                <Field label="Channel">
                  <Badge variant={update.channel as 'production' | 'staging' | 'canary'}>{update.channel}</Badge>
                </Field>
                {update.branch_name && (
                  <Field label="Branch">
                    <span className="inline-flex items-center gap-1 text-sm">
                      <GitBranch className="h-3 w-3 text-muted-foreground" />
                      {update.branch_name}
                    </span>
                  </Field>
                )}
                <Field label="Status">
                  <div className="flex gap-1">
                    {update.is_enabled ? <Badge variant="active">Active</Badge> : <Badge variant="disabled">Disabled</Badge>}
                    {update.is_critical && <Badge variant="critical">Critical</Badge>}
                    {update.is_rollback && <Badge variant="rollback">Rollback</Badge>}
                  </div>
                </Field>
                <Field label="Rollout" value={`${update.rollout_percentage}%`} />
                <Field label="Assets" value={`${update.asset_count}${update.total_size > 0 ? ` (${formatSize(update.total_size)})` : ''}`} />
                <Field label="Created" value={formatDate(update.created_at)} />
                {update.group_id && <Field label="Group" value={update.group_id} mono />}
                {update.rollback_to_update_id && <Field label="Rolls back to" value={`Update #${update.rollback_to_update_id}`} />}
              </div>
              {update.release_message && (
                <div className="mt-3">
                  <span className="text-xs text-muted-foreground">Release Notes</span>
                  <p className="text-sm mt-0.5">{update.release_message}</p>
                </div>
              )}
            </section>

            {/* Git / Build Info */}
            {(update.git_commit_hash || update.git_branch || update.build_message) && (
              <>
                <Separator />
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Build Info</h4>
                  <div className="space-y-2">
                    {update.git_commit_hash && (
                      <div className="flex items-center gap-2 text-sm">
                        <GitCommit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-xs">{update.git_commit_hash.slice(0, 7)}</span>
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => navigator.clipboard.writeText(update.git_commit_hash!)}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {update.git_branch && (
                      <div className="flex items-center gap-2 text-sm">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{update.git_branch}</span>
                      </div>
                    )}
                    {update.ci_run_url && (
                      <div className="flex items-center gap-2 text-sm">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <a
                          href={update.ci_run_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate"
                        >
                          CI/CD Run
                        </a>
                      </div>
                    )}
                    {update.build_message && (
                      <p className="text-sm text-foreground/80">{update.build_message}</p>
                    )}
                  </div>
                </section>
              </>
            )}

            <Separator />

            {/* Analytics */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Analytics</h4>
              <div className="flex gap-8">
                <div>
                  <div className="text-2xl font-bold">{update.total_downloads.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Downloads</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{update.unique_devices.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Unique Devices</div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Actions */}
            {!update.is_rollback && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowRepublish(!showRepublish); setRepublishChannels(new Set([update.channel])); setRepublishMessage('') }}
                  >
                    <Repeat2 className="h-3.5 w-3.5 mr-1.5" />
                    Republish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRollbackToThis}
                    disabled={rollingBack}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {rollingBack ? 'Rolling back...' : 'Rollback to this'}
                  </Button>
                </div>

                {showRepublish && (
                  <div className="mt-3 rounded-lg border p-3 space-y-3">
                    <div>
                      <Label className="text-xs">Target Channels</Label>
                      <div className="flex flex-wrap gap-3 mt-1.5">
                        {channels.length > 0 ? channels.map(ch => (
                          <label key={ch.name} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <Checkbox
                              checked={republishChannels.has(ch.name)}
                              onCheckedChange={() => toggleRepublishChannel(ch.name)}
                            />
                            {ch.name}
                          </label>
                        )) : (
                          ['production', 'staging', 'canary'].map(ch => (
                            <label key={ch} className="flex items-center gap-1.5 text-sm cursor-pointer">
                              <Checkbox
                                checked={republishChannels.has(ch)}
                                onCheckedChange={() => toggleRepublishChannel(ch)}
                              />
                              {ch}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Release Message (optional)</Label>
                      <Input
                        className="mt-1"
                        value={republishMessage}
                        onChange={e => setRepublishMessage(e.target.value)}
                        placeholder={update.release_message || 'Republished update'}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={republishing || republishChannels.size === 0}
                      onClick={handleRepublish}
                    >
                      {republishing ? 'Republishing...' : `Republish to ${republishChannels.size} channel${republishChannels.size !== 1 ? 's' : ''}`}
                    </Button>
                  </div>
                )}
              </section>
            )}

            <Separator />

            {/* Change History */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Change History</h4>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading history...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history entries found</p>
              ) : (
                <div className="relative pl-5 space-y-4">
                  <div className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-border" />
                  {history.map((entry) => (
                    <div key={entry.id} className="relative">
                      <div className="absolute -left-5 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{actionLabel(entry.action)}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(entry.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{detailSummary(entry)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      {children ?? <div className={`text-sm ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</div>}
    </div>
  )
}
