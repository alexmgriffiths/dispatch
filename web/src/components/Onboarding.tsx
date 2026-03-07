import { useState } from 'react'
import { register, setToken, setProjectSlug, clearProjectSlug, listProjects, createApiKey } from '../api/client'
import type { CreateApiKeyResponse } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DispatchLogo from './DispatchLogo'
import { Check, Copy, ChevronRight, ChevronLeft, Rocket, User, FolderOpen, Key, Code, ArrowRight, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onComplete: () => void
}

type Step = 'welcome' | 'account' | 'project' | 'apikey' | 'configure' | 'done'
const STEPS: Step[] = ['welcome', 'account', 'project', 'apikey', 'configure', 'done']

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Account
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Project
  const [projectName, setProjectName] = useState('')
  const [projectSlugInput, setProjectSlugInput] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [projectUuid, setProjectUuid] = useState('')

  // API Key
  const [apiKey, setApiKey] = useState<CreateApiKeyResponse | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(step)
  const progress = ((stepIndex) / (STEPS.length - 1)) * 100

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function handleProjectNameChange(value: string) {
    setProjectName(value)
    if (!slugTouched) {
      setProjectSlugInput(slugify(value))
    }
  }

  async function handleCreateAccount() {
    const slug = projectSlugInput.trim() || slugify(projectName)
    if (!email.trim() || !name.trim() || !password || !projectName.trim() || !slug) return
    try {
      setLoading(true)
      setError('')
      const res = await register(email.trim(), name.trim(), password, projectName.trim(), slug)
      setToken(res.token)
      clearProjectSlug() // Clear any stale project slug before fetching

      // Fetch the created project and set it as active
      const projects = await listProjects()
      if (projects.length > 0) {
        const p = projects[0]
        setProjectSlug(p.slug)
        setProjectUuid(p.uuid)
      }

      setStep('apikey')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateApiKey() {
    try {
      setLoading(true)
      setError('')
      const key = await createApiKey('CI/CD Pipeline')
      setApiKey(key)
      setStep('configure')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create API key')
    } finally {
      setLoading(false)
    }
  }

  function handleSkipApiKey() {
    setStep('configure')
  }

  const displayId = projectUuid || projectSlugInput || 'your-project'

  const appJsonSnippet = `{
  "expo": {
    "updates": {
      "url": "${window.location.origin}/v1/ota/manifest/${displayId}",
      "enabled": true,
      "checkAutomatically": "ON_LOAD"
    },
    "runtimeVersion": "1.0.0"
  }
}`

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg mx-auto px-4">
        {/* Progress bar */}
        {step !== 'welcome' && (
          <div className="mb-8">
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              {STEPS.slice(1).map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    'flex items-center gap-1 text-[11px]',
                    i + 1 <= stepIndex ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {i + 1 < stepIndex ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="h-3 w-3 flex items-center justify-center text-[10px]">{i + 1}</span>
                  )}
                  <span className="hidden sm:inline">{
                    s === 'account' ? 'Account' :
                    s === 'project' ? 'Project' :
                    s === 'apikey' ? 'API Key' :
                    s === 'configure' ? 'Configure' : 'Done'
                  }</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {step === 'welcome' && (
            <div className="p-8 text-center space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <DispatchLogo className="h-10 w-10" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Welcome to Dispatch</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  Self-hosted OTA updates for React Native & Expo. Let's get your server set up in a few steps.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <FeatureCard icon={<Rocket className="h-4 w-4" />} label="Instant deploys" />
                <FeatureCard icon={<GitBranch className="h-4 w-4" />} label="Channels & branches" />
                <FeatureCard icon={<Key className="h-4 w-4" />} label="CI/CD ready" />
              </div>
              <Button className="w-full" size="lg" onClick={() => setStep('account')}>
                Get started
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {step === 'account' && (
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <User className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Step 1</span>
                </div>
                <h2 className="text-xl font-semibold">Create your account</h2>
                <p className="text-sm text-muted-foreground">This will be the admin account for your Dispatch server.</p>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); setStep('project') }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Name</Label>
                  <Input
                    id="reg-name"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="jane@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep('welcome')}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={!email.trim() || !name.trim() || password.length < 8}
                  >
                    Continue
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </form>
            </div>
          )}

          {step === 'project' && (
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <FolderOpen className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Step 2</span>
                </div>
                <h2 className="text-xl font-semibold">Set up your project</h2>
                <p className="text-sm text-muted-foreground">
                  Each project has its own builds, releases, and API keys. Name it after your app — you can create more projects later.
                </p>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); handleCreateAccount() }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                    id="project-name"
                    placeholder="My App"
                    value={projectName}
                    onChange={(e) => handleProjectNameChange(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-slug">Slug</Label>
                  <Input
                    id="project-slug"
                    placeholder="my-app"
                    value={projectSlugInput}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setProjectSlugInput(e.target.value)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Used in the manifest URL and API. Lowercase, alphanumeric, and hyphens only.</p>
                </div>

                <div className="rounded-lg bg-muted/50 border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">This will also create:</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="h-3 w-3 text-muted-foreground" />
                      <code className="bg-muted px-1.5 py-0.5 rounded">main</code> branch
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="flex items-center gap-1.5">
                      <Rocket className="h-3 w-3 text-muted-foreground" />
                      <code className="bg-muted px-1.5 py-0.5 rounded">production</code> channel
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setError(''); setStep('account') }}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading || !projectName.trim() || !projectSlugInput.trim()}
                  >
                    {loading ? 'Creating...' : 'Create account & project'}
                    {!loading && <ChevronRight className="h-4 w-4 ml-1" />}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {step === 'apikey' && (
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <Key className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Step 3</span>
                </div>
                <h2 className="text-xl font-semibold">Create an API key</h2>
                <p className="text-sm text-muted-foreground">
                  Generate an API key for your CI/CD pipeline to publish updates automatically.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">CI/CD Pipeline</p>
                    <p className="text-xs text-muted-foreground">Used by GitHub Actions or other CI to push updates</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleSkipApiKey}>
                  Skip for now
                </Button>
                <Button
                  className="flex-1"
                  disabled={loading}
                  onClick={handleCreateApiKey}
                >
                  {loading ? 'Generating...' : 'Generate API key'}
                  {!loading && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </div>
          )}

          {step === 'configure' && (
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <Code className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">Step 4</span>
                </div>
                <h2 className="text-xl font-semibold">Configure your app</h2>
                <p className="text-sm text-muted-foreground">
                  Add the update server URL to your Expo app config.
                </p>
              </div>

              {apiKey && (
                <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    <p className="text-sm font-medium">API key created</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 break-all">{apiKey.key}</code>
                    <button
                      onClick={() => copyText(apiKey.key, 'apikey')}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      {copied === 'apikey' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Save this key — it won't be shown again. Add it as <code className="bg-muted px-1 rounded">OTA_API_KEY</code> in your CI secrets.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div className="rounded-lg border bg-muted overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">app.json</span>
                    <button
                      onClick={() => copyText(appJsonSnippet, 'appjson')}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    >
                      {copied === 'appjson' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <pre className="p-3 text-xs overflow-x-auto"><code>{appJsonSnippet}</code></pre>
                </div>

                <div className="rounded-lg border bg-muted overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">terminal</span>
                    <button
                      onClick={() => copyText('npx expo install expo-updates', 'install')}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    >
                      {copied === 'install' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <pre className="p-3 text-xs"><code>npx expo install expo-updates</code></pre>
                </div>
              </div>

              <Button className="w-full" onClick={() => setStep('done')}>
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {step === 'done' && (
            <div className="p-8 text-center space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Check className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">You're all set!</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  Your Dispatch server is configured and ready. Publish your first update from CI or directly from the dashboard.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 text-left">
                <SummaryRow label="Account" value={email} />
                <SummaryRow label="Project" value={projectName} />
                <SummaryRow label="Channel" value="production → main" />
                {apiKey && <SummaryRow label="API key" value={apiKey.keyPrefix + '...'} />}
              </div>

              <Button className="w-full" size="lg" onClick={onComplete}>
                Go to dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </div>

        {step === 'welcome' && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Already have an account?{' '}
            <button className="text-primary hover:underline" onClick={onComplete}>
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

function FeatureCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center space-y-1.5">
      <div className="flex justify-center text-primary">{icon}</div>
      <p className="text-xs font-medium">{label}</p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium font-mono">{value}</span>
    </div>
  )
}
