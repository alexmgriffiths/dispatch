import { useEffect, useState } from 'react'
import { listBuilds } from '../api/client'
import type { BuildRecord } from '../api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PlatformBadge } from '@/components/ui/platform-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { GitBranch, Layers, Upload, Terminal } from 'lucide-react'

interface Props {
  onPublish: (buildId: number) => void
}

export default function BuildsList({ onPublish }: Props) {
  const [builds, setBuilds] = useState<BuildRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    loadBuilds()
  }, [])

  async function loadBuilds() {
    try {
      setLoading(true)
      setError('')
      const data = await listBuilds()
      setBuilds(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load builds')
    } finally {
      setLoading(false)
      setInitialLoad(false)
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

  return (
    <>
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Builds</h2>
            <p className="text-sm text-muted-foreground">CI/CD builds waiting to be published</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-3">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {loading && initialLoad ? null : loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-72" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex gap-3">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            ))}
          </div>
        ) : builds.length === 0 ? (
          <BuildsEmptyState />
        ) : (
          <div className="space-y-2">
            {builds.map((b) => (
              <div
                key={b.id}
                className={cn(
                  'flex items-start justify-between gap-4 rounded-xl border bg-card p-4',
                  b.isPublished && 'opacity-60'
                )}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-sm truncate max-w-[120px]">{b.runtimeVersion}</span>
                    <PlatformBadge platform={b.platform} />
                    {b.gitBranch && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        {b.gitBranch}
                      </span>
                    )}
                    {b.isPublished ? (
                      <Badge variant="active">published</Badge>
                    ) : (
                      <Badge variant="staging">pending</Badge>
                    )}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {b.buildUuid}
                    {b.gitCommitHash && <> &middot; {b.gitCommitHash.slice(0, 7)}</>}
                  </div>
                  {b.message && <p className="text-sm text-foreground/80">{b.message}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{timeAgo(b.createdAt)}</span>
                    <span>{b.assetCount} asset{b.assetCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                <div className="shrink-0">
                  {!b.isPublished && (
                    <Button size="sm" onClick={() => onPublish(b.id)}>
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function BuildsEmptyState() {
  return (
    <div className="max-w-6xl mx-auto px-12 py-20">
      <div className="grid grid-cols-2 gap-16 items-start">
        {/* Left — Copy */}
        <div className="space-y-6 pt-8">
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            Upload builds from your CI/CD pipeline
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Builds are JavaScript bundles exported from your Expo project. Upload them from
            your CI/CD pipeline using the Dispatch CLI, then publish them as OTA updates
            to any channel.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Each build captures the runtime version, platform, git branch, and commit — giving
            you a complete audit trail from code to deployment.
          </p>

          <div className="space-y-3 pt-1">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">1</div>
              <div>
                <p className="text-sm font-medium">Publish with --no-publish to upload only</p>
                <pre className="mt-1.5 text-[11px] bg-muted rounded-md px-3 py-2 font-mono overflow-x-auto">
                  <span className="text-muted-foreground select-none">$ </span>dispatch publish --no-publish</pre>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">2</div>
              <div>
                <p className="text-sm font-medium">Then publish from the dashboard</p>
                <p className="text-xs text-muted-foreground mt-0.5">Select a build and choose a channel, rollout percentage, and message.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right — Preview card */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Mini header */}
          <div className="border-b px-5 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="h-4 w-4" />
            <span className="font-medium text-foreground">Builds</span>
            <span className="ml-auto text-xs">3 builds</span>
          </div>

          {/* Mock build rows */}
          <div className="divide-y">
            {[
              { version: '49.0.0', platform: 'ios', branch: 'main', commit: 'a3f1b2c', time: '2m ago', assets: 24, published: false },
              { version: '49.0.0', platform: 'android', branch: 'main', commit: 'a3f1b2c', time: '2m ago', assets: 22, published: false },
              { version: '48.0.0', platform: 'ios', branch: 'main', commit: '7e2d9f4', time: '3d ago', assets: 24, published: true },
            ].map((b, i) => (
              <div key={i} className={cn('px-5 py-3.5 space-y-1.5', b.published && 'opacity-50')}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{b.version}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{b.platform}</Badge>
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <GitBranch className="h-2.5 w-2.5" /> {b.branch}
                  </span>
                  {b.published && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">published</Badge>
                  )}
                  {!b.published && (
                    <div className="ml-auto flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-primary-foreground text-[10px] font-medium">
                      <Upload className="h-2.5 w-2.5" /> Publish
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-0.5">
                  <span className="font-mono">{b.commit}</span>
                  <span>{b.time}</span>
                  <span>{b.assets} assets</span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary footer */}
          <div className="border-t bg-muted/30 px-5 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">CLI command</p>
            <pre className="text-xs font-mono text-muted-foreground">
              <span className="select-none">$ </span>dispatch publish --no-publish
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
