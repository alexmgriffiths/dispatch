import { useEffect, useState } from 'react'
import { listBuilds } from '../api/client'
import type { BuildRecord } from '../api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { GitBranch } from 'lucide-react'

interface Props {
  onPublish: (buildId: number) => void
}

export default function BuildsList({ onPublish }: Props) {
  const [builds, setBuilds] = useState<BuildRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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

        {loading ? (
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
          <div className="flex flex-col items-center py-16 text-center">
            <div className="text-3xl mb-3">&#9898;</div>
            <h3 className="font-semibold">No builds yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Configure your CI/CD pipeline to upload builds here.</p>
          </div>
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
                    <Badge variant={b.platform as 'ios' | 'android'}>{b.platform}</Badge>
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
