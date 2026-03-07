import { useEffect, useRef, useState } from 'react'
import {
  listWebhooks,
  createWebhook,
  deleteWebhook,
  patchWebhook,
  listWebhookDeliveries,
  listUsers,
  inviteUser,
  listBranches,
  createBranch,
  deleteBranch,
  listChannels,
  createChannel,
  deleteChannel,
  patchChannel,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  deleteApiKey,
  getGcPreview,
  runGc,
} from '../api/client'
import type { WebhookRecord, WebhookDeliveryRecord, UserListItem, BranchRecord, ChannelRecord, ApiKeyRecord, GcStats } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoTip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ArrowRight, Copy, Check, ChevronDown, HardDrive } from 'lucide-react'

const ALL_EVENTS = [
  'build.uploaded',
  'build.published',
  'build.deleted',
  'update.created',
  'update.patched',
  'update.republished',
  'update.deleted',
  'rollback.created',
  'branch.created',
  'branch.deleted',
  'channel.created',
  'channel.updated',
  'channel.deleted',
]

export default function Settings() {
  const [tab, setTab] = useState('users')
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([])
  const [users, setUsers] = useState<UserListItem[]>([])
  const [branches, setBranches] = useState<BranchRecord[]>([])
  const [channels, setChannels] = useState<ChannelRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>([...ALL_EVENTS])
  const [newSecret, setNewSecret] = useState('')
  const [saving, setSaving] = useState(false)

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invName, setInvName] = useState('')
  const [invRole, setInvRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [inviteLink, setInviteLink] = useState('')

  const [showBranchForm, setShowBranchForm] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelBranch, setNewChannelBranch] = useState('')

  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  const [gcStats, setGcStats] = useState<GcStats | null>(null)
  const [gcRunning, setGcRunning] = useState(false)
  const [gcResult, setGcResult] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'webhooks') loadWebhooks()
    else if (tab === 'branches') loadBranchesAndChannels()
    else if (tab === 'apikeys') loadApiKeys()
    else if (tab === 'storage') loadGcStats()
    else loadUsers()
  }, [tab])

  async function loadWebhooks() {
    try { setLoading(true); setError(''); setWebhooks(await listWebhooks()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load webhooks') }
    finally { setLoading(false) }
  }

  async function loadUsers() {
    try { setLoading(true); setError(''); setUsers(await listUsers()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load users') }
    finally { setLoading(false) }
  }

  async function loadBranchesAndChannels() {
    try {
      setLoading(true); setError('')
      const [b, c] = await Promise.all([listBranches(), listChannels()])
      setBranches(b); setChannels(c)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  async function loadApiKeys() {
    try { setLoading(true); setError(''); setApiKeys(await listApiKeys()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load API keys') }
    finally { setLoading(false) }
  }

  async function loadGcStats() {
    try { setLoading(true); setError(''); setGcStats(await getGcPreview()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load storage stats') }
    finally { setLoading(false) }
  }

  async function handleRunGc() {
    setGcRunning(true); setError(''); setGcResult(null)
    try {
      const result = await runGc()
      setGcResult(`Cleaned up ${result.deletedObjects} orphaned objects, freed ${formatBytes(result.freedBytes)}`)
      loadGcStats()
    } catch (e) { setError(e instanceof Error ? e.message : 'GC failed') }
    finally { setGcRunning(false) }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  async function handleCreateApiKey() {
    if (!newKeyName.trim()) return
    setSaving(true); setError('')
    try {
      const res = await createApiKey(newKeyName.trim())
      setCreatedKey(res.key)
      setCopiedKey(false)
      setNewKeyName('')
      loadApiKeys()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create API key') }
    finally { setSaving(false) }
  }

  async function handleRevokeApiKey(id: number) {
    try {
      await revokeApiKey(id)
      setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, isActive: false } : k))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke API key') }
  }

  async function handleDeleteApiKey(id: number) {
    try {
      await deleteApiKey(id)
      setApiKeys((prev) => prev.filter((k) => k.id !== id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete API key') }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  async function handleCreateWebhook() {
    if (!newUrl.trim()) return
    setSaving(true); setError('')
    try {
      const wh = await createWebhook({ url: newUrl.trim(), events: newEvents, secret: newSecret || undefined })
      setWebhooks((prev) => [wh, ...prev])
      setShowWebhookForm(false); setNewUrl(''); setNewSecret(''); setNewEvents([...ALL_EVENTS])
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create webhook') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    try { await deleteWebhook(id); setWebhooks((prev) => prev.filter((w) => w.id !== id)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete webhook') }
  }

  async function handleToggle(wh: WebhookRecord) {
    try {
      await patchWebhook(wh.id, { isActive: !wh.isActive })
      setWebhooks((prev) => prev.map((w) => (w.id === wh.id ? { ...w, isActive: !w.isActive } : w)))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update webhook') }
  }

  async function handleInvite() {
    if (!invEmail.trim() || !invName.trim()) return
    setInviting(true); setError(''); setInviteLink('')
    try {
      const res = await inviteUser(invEmail.trim(), invName.trim(), invRole)
      setInviteLink(`${window.location.origin}/accept-invite?token=${res.inviteToken}`)
      setInvEmail(''); setInvName(''); setInvRole('member'); loadUsers()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to invite user') }
    finally { setInviting(false) }
  }

  async function handleCreateBranch() {
    if (!newBranchName.trim()) return
    setSaving(true); setError('')
    try {
      const b = await createBranch(newBranchName.trim())
      setBranches((prev) => [b, ...prev])
      setShowBranchForm(false); setNewBranchName('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create branch') }
    finally { setSaving(false) }
  }

  async function handleDeleteBranch(name: string) {
    try {
      await deleteBranch(name)
      setBranches((prev) => prev.filter((b) => b.name !== name))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete branch') }
  }

  async function handleCreateChannel() {
    if (!newChannelName.trim() || !newChannelBranch) return
    setSaving(true); setError('')
    try {
      const ch = await createChannel({ name: newChannelName.trim(), branchName: newChannelBranch })
      setChannels((prev) => [ch, ...prev])
      setShowChannelForm(false); setNewChannelName(''); setNewChannelBranch('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create channel') }
    finally { setSaving(false) }
  }

  async function handleDeleteChannel(name: string) {
    try {
      await deleteChannel(name)
      setChannels((prev) => prev.filter((c) => c.name !== name))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete channel') }
  }

  async function handleUpdateChannelBranch(chName: string, branchName: string) {
    try {
      await patchChannel(chName, { branchName })
      setChannels((prev) => prev.map((c) => c.name === chName ? { ...c, branchName } : c))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update channel') }
  }

  async function handleUpdateChannelRollout(chName: string, rolloutBranchName: string, rolloutPercentage: number) {
    try {
      await patchChannel(chName, { rolloutBranchName: rolloutBranchName || '', rolloutPercentage })
      setChannels((prev) => prev.map((c) => c.name === chName ? { ...c, rolloutBranchName: rolloutBranchName || null, rolloutPercentage } : c))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update rollout') }
  }

  async function handleUpdateMinVersion(chName: string, minRuntimeVersion: string) {
    try {
      await patchChannel(chName, { minRuntimeVersion: minRuntimeVersion || '' })
      setChannels((prev) => prev.map((c) => c.name === chName ? { ...c, minRuntimeVersion: minRuntimeVersion || null } : c))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update minimum version') }
  }

  function toggleEvent(event: string) {
    setNewEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event])
  }

  function eventLabel(event: string): string {
    const labels: Record<string, string> = {
      'build.uploaded': 'Build Uploaded',
      'build.published': 'Build Published',
      'update.created': 'Update Created',
      'update.patched': 'Update Modified',
    }
    return labels[event] || event
  }

  return (
    <>
      <div className="border-b bg-card px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Settings</h2>
            <p className="text-sm text-muted-foreground">Manage users, API keys, branches, channels, and webhooks</p>
          </div>
          {tab === 'webhooks' && !showWebhookForm && (
            <Button onClick={() => setShowWebhookForm(true)}>
              <Plus className="h-4 w-4" /> Add webhook
            </Button>
          )}
          {tab === 'users' && !showInviteForm && (
            <Button onClick={() => setShowInviteForm(true)}>
              <Plus className="h-4 w-4" /> Invite user
            </Button>
          )}
          {tab === 'apikeys' && !showApiKeyForm && (
            <Button onClick={() => { setShowApiKeyForm(true); setCreatedKey(null) }}>
              <Plus className="h-4 w-4" /> Create key
            </Button>
          )}
          {tab === 'branches' && !showBranchForm && !showChannelForm && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowBranchForm(true)}>
                <Plus className="h-4 w-4" /> Branch
              </Button>
              <Button onClick={() => setShowChannelForm(true)}>
                <Plus className="h-4 w-4" /> Channel
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="apikeys">API Keys</TabsTrigger>
            <TabsTrigger value="branches">Branches & Channels</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
          </TabsList>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">{error}</div>
          )}

          {/* Users tab */}
          <TabsContent value="users" className="space-y-4">
            {showInviteForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Invite User</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" placeholder="user@company.com" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input type="text" placeholder="Jane Smith" value={invName} onChange={(e) => setInvName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={invRole} onValueChange={setInvRole}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {inviteLink && (
                    <div className="rounded-md bg-muted p-3">
                      <span className="text-xs text-muted-foreground">Invite link (share with user):</span>
                      <code className="block mt-1 text-xs text-primary break-all select-all">{inviteLink}</code>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button disabled={inviting || !invEmail.trim() || !invName.trim()} onClick={handleInvite}>
                      {inviting ? 'Inviting...' : 'Send Invite'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowInviteForm(false); setInviteLink('') }}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border bg-card p-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="text-3xl mb-3">&#9898;</div>
                <h3 className="font-semibold">No users</h3>
                <p className="text-sm text-muted-foreground mt-1">Invite team members to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className={cn('flex items-center justify-between rounded-xl border bg-card p-4', !u.isActive && 'opacity-60')}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{u.name}</span>
                        <Badge variant={u.role === 'admin' ? 'critical' : 'production'}>{u.role}</Badge>
                        {!u.hasPassword && <Badge variant="staging">pending invite</Badge>}
                        {!u.isActive && <Badge variant="disabled">inactive</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* API Keys tab */}
          <TabsContent value="apikeys" className="space-y-4">
            {showApiKeyForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Create API Key</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {createdKey ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Copy your API key now. You won't be able to see it again.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono select-all break-all">{createdKey}</code>
                        <Button variant="outline" size="icon" onClick={() => copyKey(createdKey)}>
                          {copiedKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button variant="ghost" onClick={() => { setShowApiKeyForm(false); setCreatedKey(null) }}>Done</Button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Key Name</Label>
                        <Input placeholder="e.g. CI/CD Pipeline, GitHub Actions" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <Button disabled={saving || !newKeyName.trim()} onClick={handleCreateApiKey}>
                          {saving ? 'Creating...' : 'Create Key'}
                        </Button>
                        <Button variant="ghost" onClick={() => setShowApiKeyForm(false)}>Cancel</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border bg-card p-4">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-16 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : apiKeys.length === 0 && !showApiKeyForm ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="text-3xl mb-3">&#128273;</div>
                <h3 className="font-semibold">No API keys</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Create an API key for CI/CD pipelines and programmatic access. Use it as a Bearer token in the Authorization header.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((k) => (
                  <div key={k.id} className={cn('flex items-center justify-between rounded-xl border bg-card p-4', !k.isActive && 'opacity-60')}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{k.name}</span>
                        {k.isActive ? <Badge variant="active">active</Badge> : <Badge variant="disabled">revoked</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <code className="bg-muted px-1.5 py-0.5 rounded">{k.keyPrefix}...</code>
                        <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                        {k.lastUsedAt && <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {k.isActive && (
                        <Button variant="outline" size="sm" onClick={() => handleRevokeApiKey(k.id)}>
                          Revoke
                        </Button>
                      )}
                      {!k.isActive && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteApiKey(k.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Branches & Channels tab */}
          <TabsContent value="branches" className="space-y-6">
            {showBranchForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">New Branch</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Branch Name</Label>
                    <Input placeholder="e.g. staging, hotfix/payment" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={saving || !newBranchName.trim()} onClick={handleCreateBranch}>
                      {saving ? 'Creating...' : 'Create Branch'}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowBranchForm(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {showChannelForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">New Channel</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Channel Name</Label>
                      <Input placeholder="e.g. production, beta" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Points to Branch</Label>
                      <Select value={newChannelBranch} onValueChange={setNewChannelBranch}>
                        <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={saving || !newChannelName.trim() || !newChannelBranch} onClick={handleCreateChannel}>
                      {saving ? 'Creating...' : 'Create Channel'}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowChannelForm(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
            ) : (
              <>
                {/* Channels */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Channels</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Channels are what your app connects to. Each channel points to a branch. Change which branch a channel points to for instant promotion or rollback.
                  </p>
                  {channels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No channels configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {channels.map((ch) => (
                        <ChannelRow
                          key={ch.name}
                          channel={ch}
                          branches={branches}
                          onUpdateBranch={handleUpdateChannelBranch}
                          onUpdateRollout={handleUpdateChannelRollout}
                          onUpdateMinVersion={handleUpdateMinVersion}
                          onDelete={handleDeleteChannel}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Branches */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Branches</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Branches are where updates are published. A branch can be pointed to by multiple channels.
                  </p>
                  {branches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No branches yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {branches.map((b) => {
                        const usedByChannels = channels.filter((c) => c.branchName === b.name || c.rolloutBranchName === b.name)
                        return (
                          <div key={b.name} className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3">
                            <Badge variant="group">{b.name}</Badge>
                            {usedByChannels.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                used by {usedByChannels.map((c) => c.name).join(', ')}
                              </span>
                            )}
                            {usedByChannels.length === 0 && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteBranch(b.name)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* Storage tab */}
          <TabsContent value="storage" className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-2 gap-3 max-w-lg">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : gcStats ? (
              <div className="max-w-lg space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-card p-4">
                    <span className="text-xs text-muted-foreground">Total S3 objects</span>
                    <p className="text-lg font-semibold">{gcStats.totalS3Objects.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <span className="text-xs text-muted-foreground">Referenced</span>
                    <p className="text-lg font-semibold">{gcStats.referencedObjects.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <span className="text-xs text-muted-foreground">Orphaned objects</span>
                    <p className={cn('text-lg font-semibold', gcStats.orphanedObjects > 0 && 'text-amber-500')}>
                      {gcStats.orphanedObjects.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <span className="text-xs text-muted-foreground">Reclaimable space</span>
                    <p className={cn('text-lg font-semibold', gcStats.orphanedSizeBytes > 0 && 'text-amber-500')}>
                      {formatBytes(gcStats.orphanedSizeBytes)}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Orphaned objects are S3 files no longer referenced by any update or build. This can happen when updates
                  are deleted but the underlying assets were shared and not cleaned up, or from interrupted uploads.
                </p>

                {gcStats.orphanedObjects > 0 ? (
                  <div className="flex items-center gap-3">
                    <Button onClick={handleRunGc} disabled={gcRunning}>
                      <HardDrive className="h-4 w-4" />
                      {gcRunning ? 'Cleaning up...' : `Clean up ${gcStats.orphanedObjects} orphaned objects`}
                    </Button>
                    <Button variant="outline" onClick={loadGcStats} disabled={gcRunning}>Refresh</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-emerald-600 font-medium">No orphaned objects found. Storage is clean.</p>
                    <Button variant="outline" size="sm" onClick={loadGcStats}>Refresh</Button>
                  </div>
                )}

                {gcResult && (
                  <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{gcResult}</div>
                )}
              </div>
            ) : null}
          </TabsContent>

          {/* Webhooks tab */}
          <TabsContent value="webhooks" className="space-y-4">
            {showWebhookForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">New Webhook</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Endpoint URL</Label>
                    <Input type="url" placeholder="https://example.com/webhook" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label>Events</Label>
                      <InfoTip>Choose which server events trigger a POST request to your endpoint.</InfoTip>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {ALL_EVENTS.map((ev) => (
                        <div key={ev} className="flex items-center gap-2">
                          <Checkbox
                            id={`ev-${ev}`}
                            checked={newEvents.includes(ev)}
                            onCheckedChange={() => toggleEvent(ev)}
                          />
                          <Label htmlFor={`ev-${ev}`} className="cursor-pointer text-sm font-normal">{eventLabel(ev)}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label>Secret (optional)</Label>
                      <InfoTip>If set, the server will sign each payload using HMAC-SHA256 with this secret. Verify the X-Dispatch-Signature header on your end.</InfoTip>
                    </div>
                    <Input type="text" placeholder="Used to sign webhook payloads" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={saving || !newUrl.trim()} onClick={handleCreateWebhook}>
                      {saving ? 'Creating...' : 'Create Webhook'}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowWebhookForm(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border bg-card p-4">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-56" />
                      <div className="flex gap-1">
                        <Skeleton className="h-4 w-20 rounded-full" />
                        <Skeleton className="h-4 w-20 rounded-full" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-10 rounded-full" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : webhooks.length === 0 && !showWebhookForm ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="text-3xl mb-3">&#9898;</div>
                <h3 className="font-semibold">No webhooks configured</h3>
                <p className="text-sm text-muted-foreground mt-1">Add a webhook to receive notifications.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {webhooks.map((wh) => (
                  <WebhookRow
                    key={wh.id}
                    webhook={wh}
                    eventLabel={eventLabel}
                    onToggle={() => handleToggle(wh)}
                    onDelete={() => handleDelete(wh.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

function ChannelRow({
  channel: ch,
  branches,
  onUpdateBranch,
  onUpdateRollout,
  onUpdateMinVersion,
  onDelete,
}: {
  channel: ChannelRecord
  branches: BranchRecord[]
  onUpdateBranch: (name: string, branch: string) => void
  onUpdateRollout: (name: string, rolloutBranch: string, pct: number) => void
  onUpdateMinVersion: (name: string, minVersion: string) => void
  onDelete: (name: string) => void
}) {
  const [showRollout, setShowRollout] = useState(!!ch.rolloutBranchName)
  const [rolloutBranch, setRolloutBranch] = useState(ch.rolloutBranchName || '')
  const [rolloutPct, setRolloutPct] = useState(ch.rolloutPercentage)
  const [minVersion, setMinVersion] = useState(ch.minRuntimeVersion || '')
  const minVersionTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={ch.name as 'production' | 'staging' | 'canary'}>{ch.name}</Badge>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <InfoTip>Channel points to a branch. Devices built with this channel name receive the latest update from the linked branch.</InfoTip>
          <Select value={ch.branchName} onValueChange={(v) => onUpdateBranch(ch.name, v)}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {ch.rolloutBranchName && (
            <span className="text-[10px] text-muted-foreground">
              + {ch.rolloutPercentage}% to {ch.rolloutBranchName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Rollout</span>
            <InfoTip>Split traffic between two branches. A percentage of devices will receive updates from an alternate branch instead of the primary one.</InfoTip>
            <Switch checked={showRollout} onCheckedChange={(v) => {
              setShowRollout(v)
              if (!v) onUpdateRollout(ch.name, '', 0)
            }} />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(ch.name)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showRollout && (
        <div className="flex items-center gap-3 pl-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Shift traffic to</span>
          <Select value={rolloutBranch} onValueChange={(v) => { setRolloutBranch(v); onUpdateRollout(ch.name, v, rolloutPct) }}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.filter((b) => b.name !== ch.branchName).map((b) => (
                <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 flex-1 max-w-48">
            <Slider
              value={[rolloutPct]}
              max={100}
              step={5}
              onValueChange={([val]) => setRolloutPct(val)}
              onValueCommit={([val]) => onUpdateRollout(ch.name, rolloutBranch, val)}
            />
            <span className="text-xs font-medium w-8 text-right">{rolloutPct}%</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pl-2">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Min runtime version</Label>
        <InfoTip>Devices running a runtime version below this will be told no update is available, with a header signaling they should update from the app store. Leave empty to allow all versions.</InfoTip>
        <Input
          className="h-7 w-40 text-xs"
          placeholder="e.g. 1.0.0"
          value={minVersion}
          onChange={(e) => {
            const val = e.target.value
            setMinVersion(val)
            clearTimeout(minVersionTimer.current)
            minVersionTimer.current = setTimeout(() => onUpdateMinVersion(ch.name, val), 500)
          }}
        />
        {ch.minRuntimeVersion && (
          <span className="text-[10px] text-muted-foreground">
            Devices below {ch.minRuntimeVersion} will be prompted to update the app binary
          </span>
        )}
      </div>
    </div>
  )
}

function WebhookRow({
  webhook: wh,
  eventLabel,
  onToggle,
  onDelete,
}: {
  webhook: WebhookRecord
  eventLabel: (e: string) => string
  onToggle: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRecord[]>([])
  const [loadingDeliveries, setLoadingDeliveries] = useState(false)

  async function loadDeliveries() {
    if (!expanded) {
      setExpanded(true)
      setLoadingDeliveries(true)
      try {
        setDeliveries(await listWebhookDeliveries(wh.id))
      } catch {
        setDeliveries([])
      } finally {
        setLoadingDeliveries(false)
      }
    } else {
      setExpanded(false)
    }
  }

  function statusBadge(status: string) {
    if (status === 'success') return <Badge variant="active">success</Badge>
    if (status === 'failed') return <Badge variant="critical">failed</Badge>
    return <Badge variant="staging">pending</Badge>
  }

  function timeAgo(iso: string) {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (secs < 60) return `${secs}s ago`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
    return `${Math.floor(secs / 86400)}d ago`
  }

  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden', !wh.isActive && 'opacity-60')}>
      <div className="flex items-center justify-between p-4">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{wh.url}</span>
            {wh.isActive ? <Badge variant="active">active</Badge> : <Badge variant="disabled">inactive</Badge>}
          </div>
          <div className="flex flex-wrap gap-1">
            {wh.events.map((ev) => (
              <Badge key={ev} variant="secondary" className="text-[10px]">{eventLabel(ev)}</Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={loadDeliveries}>
            Deliveries
            <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Active</span>
            <Switch checked={wh.isActive} onCheckedChange={onToggle} />
          </div>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 bg-muted/20">
          <h4 className="text-xs font-semibold mb-2">Recent Deliveries</h4>
          {loadingDeliveries ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-14 rounded-full" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No deliveries yet.</p>
          ) : (
            <div className="space-y-1.5">
              {deliveries.map((d) => (
                <div key={d.id} className="flex items-center gap-3 text-xs">
                  {statusBadge(d.status)}
                  <span className="text-muted-foreground">{d.event}</span>
                  {d.httpStatus && (
                    <span className={cn('font-mono', d.httpStatus >= 200 && d.httpStatus < 300 ? 'text-emerald-600' : 'text-destructive')}>
                      {d.httpStatus}
                    </span>
                  )}
                  {d.attempt > 1 && (
                    <span className="text-muted-foreground">attempt {d.attempt}/{d.maxAttempts}</span>
                  )}
                  {d.errorMessage && d.status === 'failed' && (
                    <span className="text-destructive truncate max-w-48">{d.errorMessage}</span>
                  )}
                  <span className="text-muted-foreground ml-auto">{timeAgo(d.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
