import { useEffect, useState } from 'react'
import { listBuilds, listChannels, publishBuild } from '../api/client'
import type { BuildRecord, ChannelRecord } from '../api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoTip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { GitBranch } from 'lucide-react'

interface Props {
  preselectedBuildId: number | null
  onPublished: () => void
}

export default function PublishUpdate({ preselectedBuildId, onPublished }: Props) {
  const [builds, setBuilds] = useState<BuildRecord[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    loadBuilds()
    listChannels().then(setAvailableChannels).catch(() => {})
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
            })
          )
        )
      )
      const platforms = ids.map(id => builds.find(b => b.id === id)?.platform).filter(Boolean)
      const summary = `${platforms.join(' + ')} to ${channels.join(', ')}`
      setSuccess(`Published ${summary} (group ${groupId.slice(0, 8)})`)
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

  return (
    <>
      <div className="border-b bg-card px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold">Publish</h2>
          <p className="text-sm text-muted-foreground">Select a CI/CD build and configure the release</p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        {success && <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{success}</div>}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Select Build</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
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
            ) : unpublishedBuilds.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="text-3xl mb-3">&#9898;</div>
                <h3 className="font-semibold">No builds available</h3>
                <p className="text-sm text-muted-foreground mt-1">Push a build from CI/CD to get started.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Select one or both platforms to publish together as a group.
                </p>
                <div className="space-y-2">
                  {unpublishedBuilds.map((b) => (
                    <label
                      key={b.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent/50',
                        selectedBuildIds.has(b.id) && 'border-primary bg-primary/5'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedBuildIds.has(b.id)}
                        onChange={() => toggleBuild(b.id)}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-sm truncate max-w-[120px]">{b.runtimeVersion}</span>
                          <Badge variant={b.platform as 'ios' | 'android'}>{b.platform}</Badge>
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
              </>
            )}
          </CardContent>
        </Card>

        {selectedBuilds.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Release Configuration</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Publishing {selectedBuilds.map(b => b.platform).join(' + ')}
                  {selectedBuilds.length > 1 && ' as a grouped release'}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Channels</Label>
                    <InfoTip>Publish to one or more channels. Devices built with a given channel name will receive updates from that channel.</InfoTip>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {(availableChannels.length > 0
                      ? availableChannels.map(ch => ch.name)
                      : ['production', 'staging', 'canary']
                    ).map(ch => (
                      <label key={ch} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox
                          checked={selectedChannels.has(ch)}
                          onCheckedChange={() => toggleChannel(ch)}
                        />
                        {ch}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Rollout</Label>
                    <InfoTip>Start low (e.g. 10%) to limit blast radius, then increase as you gain confidence. You can adjust this later from the Releases page.</InfoTip>
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[rolloutPercentage]}
                      max={100}
                      step={1}
                      onValueChange={([val]) => setRolloutPercentage(val)}
                    />
                    <span className="text-sm font-medium w-10 text-right">{rolloutPercentage}%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Release Notes</Label>
                  <Input
                    value={releaseMessage}
                    onChange={(e) => setReleaseMessage(e.target.value)}
                    placeholder="What changed in this update?"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="critical"
                    checked={isCritical}
                    onCheckedChange={(checked) => setIsCritical(checked === true)}
                  />
                  <Label htmlFor="critical" className="cursor-pointer">Critical update</Label>
                  <InfoTip>Critical updates force an immediate reload of the JS bundle instead of waiting for the next cold start. Use for security or data-loss fixes only.</InfoTip>
                </div>
              </CardContent>
            </Card>

            <Button disabled={publishing || selectedChannels.size === 0} onClick={handlePublish}>
              {publishing
                ? 'Publishing...'
                : `Publish${selectedBuilds.length > 1 ? ` ${selectedBuilds.length} Builds` : ''} to ${[...selectedChannels].join(', ')}`}
            </Button>
          </>
        )}
      </div>
    </>
  )
}
