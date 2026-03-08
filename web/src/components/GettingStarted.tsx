import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, Copy, ChevronRight, Smartphone, GitBranch, Zap, Shield, BarChart3, Layers, X, Terminal, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { HighlightedCode } from '@/components/ui/highlighted-code'

const OTA_HOOK_DEVICE_ONLY = `import { useEffect } from "react"
import * as Updates from "expo-updates"
import * as SecureStore from "expo-secure-store"
import { randomUUID } from "expo-crypto" // or any UUID generator

const DEVICE_ID_KEY = "ota_device_id"

async function getOrCreateDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (!id) {
    id = randomUUID()
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id)
  }
  return id
}

export function useOTAUpdates() {
  useEffect(() => {
    if (__DEV__) return

    async function checkForUpdate() {
      try {
        const deviceId = await getOrCreateDeviceId()

        // Set device header for rollout bucketing
        try {
          Updates.setUpdateRequestHeadersOverride({
            "expo-device-id": deviceId,
          })
        } catch {
          // Requires native config with EXUpdatesRequestHeaders — skip silently
        }

        const check = await Updates.checkForUpdateAsync()
        if (!check.isAvailable) return

        const result = await Updates.fetchUpdateAsync()
        if (!result.isNew) return

        // Critical updates reload immediately; others apply on next launch
        const manifest = (check.manifest ?? result.manifest) as any
        if (manifest?.metadata?.isCritical === true) {
          await Updates.reloadAsync()
        }
      } catch (err: any) {
        console.warn("[OTA]", err.message)
      }
    }

    checkForUpdate()
  }, [])
}`

const OTA_HOOK_WITH_USER = `import { useEffect } from "react"
import * as Updates from "expo-updates"
import * as SecureStore from "expo-secure-store"
import { randomUUID } from "expo-crypto" // or any UUID generator
import { useAuth } from "@/contexts/AuthContext" // replace with your auth hook

const DEVICE_ID_KEY = "ota_device_id"

async function getOrCreateDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (!id) {
    id = randomUUID()
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id)
  }
  return id
}

export function useOTAUpdates() {
  const { userId } = useAuth()

  useEffect(() => {
    if (__DEV__) return

    async function checkForUpdate() {
      try {
        const deviceId = await getOrCreateDeviceId()

        // Set device & user headers for rollout bucketing
        try {
          Updates.setUpdateRequestHeadersOverride({
            "expo-device-id": deviceId,
            "expo-user-id": userId ?? "none",
          })
        } catch {
          // Requires native config with EXUpdatesRequestHeaders — skip silently
        }

        const check = await Updates.checkForUpdateAsync()
        if (!check.isAvailable) return

        const result = await Updates.fetchUpdateAsync()
        if (!result.isNew) return

        // Critical updates reload immediately; others apply on next launch
        const manifest = (check.manifest ?? result.manifest) as any
        if (manifest?.metadata?.isCritical === true) {
          await Updates.reloadAsync()
        }
      } catch (err: any) {
        console.warn("[OTA]", err.message)
      }
    }

    checkForUpdate()
  }, [])
}`

interface Props {
  projectUuid?: string
  onNavigate: (page: string) => void
  onDismiss: () => void
}

export default function GettingStarted({ projectUuid, onNavigate, onDismiss }: Props) {
  const [openSection, setOpenSection] = useState<string | null>('apikey')
  const [copied, setCopied] = useState<string | null>(null)
  const [setupTab, setSetupTab] = useState<'cli' | 'manual'>('cli')
  const [showHookModal, setShowHookModal] = useState(false)
  const [hookVariant, setHookVariant] = useState<'device' | 'user'>('device')

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function toggle(id: string) {
    setOpenSection(prev => prev === id ? null : id)
  }

  return (
    <>
      <div className="border-b bg-card px-6 py-5 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Getting Started</h2>
          <p className="text-sm text-muted-foreground">Set up OTA updates for your React Native / Expo app</p>
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" />
          Don't show on login
        </Button>
      </div>

      <div className="p-6 max-w-3xl space-y-3">
        {/* Step 1: API Key */}
        <Section
          number={1}
          title="Create an API key"
          icon={<Key className="h-4 w-4" />}
          open={openSection === 'apikey'}
          onToggle={() => toggle('apikey')}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Generate an API key to authenticate the CLI and CI/CD pipelines. You'll need this for the next step.
          </p>
          <Button variant="outline" size="sm" onClick={() => onNavigate('settings')}>
            Go to Settings &gt; API Keys
          </Button>
        </Section>

        {/* Step 2: App Setup */}
        <Section
          number={2}
          title="Configure your app"
          icon={<Smartphone className="h-4 w-4" />}
          open={openSection === 'setup'}
          onToggle={() => toggle('setup')}
        >
          <div className="flex gap-1 mb-4 rounded-lg bg-muted p-1">
            <button
              onClick={() => setSetupTab('cli')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                setupTab === 'cli' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Terminal className="h-3 w-3" />
              CLI (recommended)
            </button>
            <button
              onClick={() => setSetupTab('manual')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                setupTab === 'manual' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Smartphone className="h-3 w-3" />
              Manual
            </button>
          </div>

          {setupTab === 'cli' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Install the Dispatch CLI and run two commands from your Expo project root. It handles <code className="text-xs bg-muted px-1 py-0.5 rounded">app.json</code> configuration, installs dependencies, and sets up fingerprint-based versioning automatically.
              </p>

              <CodeBlock
                id="cli-install"
                language="bash"
                copied={copied}
                onCopy={copyText}
                code="curl -fsSL https://github.com/dispatchOTA/cli/releases/latest/download/dispatch-aarch64-apple-darwin -o /usr/local/bin/dispatch && chmod +x /usr/local/bin/dispatch"
              />

              <CodeBlock
                id="cli-login"
                language="bash"
                copied={copied}
                onCopy={copyText}
                code={`dispatch login --server ${window.location.origin} --key <your-api-key>`}
              />

              <CodeBlock
                id="cli-init"
                language="bash"
                copied={copied}
                onCopy={copyText}
                code="dispatch init"
              />

              <p className="text-xs text-muted-foreground">
                <code className="text-xs bg-muted px-1 py-0.5 rounded">dispatch init</code> will prompt you to select a project, install <code className="text-xs bg-muted px-1 py-0.5 rounded">expo-updates</code>, patch your <code className="text-xs bg-muted px-1 py-0.5 rounded">app.json</code>, and configure <code className="text-xs bg-muted px-1 py-0.5 rounded">expo-device-id</code> and <code className="text-xs bg-muted px-1 py-0.5 rounded">expo-user-id</code> headers for rollout bucketing and user targeting.
              </p>

            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Add the update server URL to your <code className="text-xs bg-muted px-1 py-0.5 rounded">app.json</code> and install the expo-updates package.
                No custom SDK needed — the standard <code className="text-xs bg-muted px-1 py-0.5 rounded">expo-updates</code> client works out of the box.
              </p>

              <CodeBlock
                id="app-json"
                language="json"
                copied={copied}
                onCopy={copyText}
                code={`{
  "expo": {
    "updates": {
      "url": "${window.location.origin}/v1/ota/manifest/${projectUuid || '<project-uuid>'}",
      "enabled": true,
      "checkAutomatically": "ON_LOAD"
    },
    "runtimeVersion": "1.0.0"
  }
}`}
              />

              <CodeBlock
                id="install"
                language="bash"
                copied={copied}
                onCopy={copyText}
                code="npx expo install expo-updates"
              />

              <p className="text-xs font-semibold mt-4 mb-2">Device &amp; user tracking for rollouts</p>
              <p className="text-sm text-muted-foreground mb-2">
                Rollout bucketing requires a stable <code className="text-xs bg-muted px-1 py-0.5 rounded">expo-device-id</code> header. You can also send <code className="text-xs bg-muted px-1 py-0.5 rounded">expo-user-id</code> for user-level targeting. Both must be registered in your iOS native config — adding <code className="text-xs bg-muted px-1 py-0.5 rounded">requestHeaders</code> to <code className="text-xs bg-muted px-1 py-0.5 rounded">app.json</code> is <strong>not enough</strong>, Expo's prebuild won't sync it to <code className="text-xs bg-muted px-1 py-0.5 rounded">Expo.plist</code>.
              </p>

              <CodeBlock
                id="expo-plist-manual"
                language="xml"
                copied={copied}
                onCopy={copyText}
                code={`<!-- ios/<YourApp>/Supporting/Expo.plist -->
<key>EXUpdatesRequestHeaders</key>
<dict>
  <key>expo-device-id</key>
  <string>none</string>
  <key>expo-user-id</key>
  <string>none</string>
</dict>`}
              />

              <p className="text-xs text-muted-foreground mt-2 mb-2">
                Then set the header at runtime before the first update check:
              </p>

              <CodeBlock
                id="device-id-js-manual"
                language="typescript"
                copied={copied}
                onCopy={copyText}
                code={`import * as Updates from 'expo-updates';

const deviceId = await getOrCreateDeviceId();
Updates.setUpdateRequestHeadersOverride({
  'expo-device-id': deviceId,
  'expo-user-id': currentUser?.id ?? 'anonymous',
});`}
              />

              <p className="text-xs text-muted-foreground mt-2">
                Without the <code className="text-xs bg-muted px-1 py-0.5 rounded">Expo.plist</code> placeholder, <code className="text-xs bg-muted px-1 py-0.5 rounded">setUpdateRequestHeadersOverride()</code> will throw <code className="text-xs bg-muted px-1 py-0.5 rounded">InvalidRequestHeadersOverrideException</code>.
              </p>

            </div>
          )}

          <div className="mt-4 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              You'll need a React hook to check for updates and set the device/user headers at runtime.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowHookModal(true)}>
              View sample hook
            </Button>
          </div>
        </Section>

        {/* Step 3: Publish */}
        <Section
          number={3}
          title="Publish an update"
          icon={<Zap className="h-4 w-4" />}
          open={openSection === 'cicd'}
          onToggle={() => toggle('cicd')}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Publish updates from the CLI or automate with CI/CD. The CLI exports your JS bundles, uploads them, and publishes in one command.
          </p>

          <CodeBlock
            id="cli-publish"
            language="bash"
            copied={copied}
            onCopy={copyText}
            code={`# Publish to production (default)
dispatch publish

# Upload without publishing (review in dashboard first)
dispatch publish --no-publish

# Publish to a specific channel with options
dispatch publish --channel staging --rollout 50 --message "Bug fixes"`}
          />

          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 mt-3 mb-3">
            <p className="text-xs font-semibold">CI/CD with GitHub Actions</p>
            <p className="text-xs text-muted-foreground">
              Add these to your GitHub repo settings, then use <code className="bg-muted px-1 py-0.5 rounded">dispatch login</code> and <code className="bg-muted px-1 py-0.5 rounded">dispatch publish</code> in your workflow.
            </p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Secret</span>
              <span><code className="bg-muted px-1 py-0.5 rounded">DISPATCH_SERVER</code> — your server URL (e.g. <code className="bg-muted px-1 py-0.5 rounded">{window.location.origin}</code>)</span>
              <span className="text-muted-foreground">Secret</span>
              <span><code className="bg-muted px-1 py-0.5 rounded">DISPATCH_API_KEY</code> — create one in <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; API Keys</button></span>
            </div>
          </div>
        </Section>

        <div className="pt-2 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Concepts</p>
        </div>

        {/* Step 4: Channels & Branches */}
        <Section
          number={4}
          title="Channels & branches"
          icon={<GitBranch className="h-4 w-4" />}
          open={openSection === 'channels'}
          onToggle={() => toggle('channels')}
        >
          <p className="text-sm text-muted-foreground mb-3">
            <strong>Channels</strong> are what devices connect to (production, staging, canary).
            <strong> Branches</strong> are where updates live. A channel points to a branch.
          </p>

          <div className="space-y-2 mb-3">
            <UseCaseRow
              title="Instant promotion"
              description="Point the production channel from one branch to another. All devices instantly get the new branch's latest update."
            />
            <UseCaseRow
              title="Instant rollback"
              description="Switch the channel pointer back. No new build needed."
            />
            <UseCaseRow
              title="Gradual rollout"
              description="Set a rollout branch at 10%. That percentage of devices get the new branch, the rest stay on the current one. Ramp up as you gain confidence."
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Configure in <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; Branches & Channels</button>.
            Rollout uses deterministic device bucketing — the same device always gets the same result.
          </p>
        </Section>

        {/* Step 5: Rollout & Rollback */}
        <Section
          number={5}
          title="Rollout & rollback"
          icon={<Layers className="h-4 w-4" />}
          open={openSection === 'rollout'}
          onToggle={() => toggle('rollout')}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Two ways to control who gets what:
          </p>

          <div className="space-y-2 mb-3">
            <UseCaseRow
              title="Per-update rollout"
              description="Drag the rollout slider on any release to control what % of devices receive that specific update. Start at 10%, ramp to 100%."
            />
            <UseCaseRow
              title="Per-channel rollout"
              description="Set a rollout branch on a channel to split traffic between two branches. Affects all updates on those branches."
            />
            <UseCaseRow
              title="Critical updates"
              description="Toggle 'Critical' to force an immediate reload instead of waiting for the next app launch. Use for security fixes."
            />
            <UseCaseRow
              title="Republish"
              description="Clone any update to new channels from the update detail drawer. Same assets, new UUID — no re-upload needed."
            />
            <UseCaseRow
              title="Rollback to specific update"
              description="From the update detail drawer, click 'Rollback to this' to create a rollback pointing devices back to a known-good update."
            />
            <UseCaseRow
              title="Minimum runtime version"
              description="Set a minimum version per channel in Settings. Devices below this threshold are told to update from the app store instead of receiving OTA updates."
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => onNavigate('updates')}>
            Go to Releases
          </Button>
        </Section>

        {/* Step 6: Monitor */}
        <Section
          number={6}
          title="Monitor adoption"
          icon={<BarChart3 className="h-4 w-4" />}
          open={openSection === 'monitor'}
          onToggle={() => toggle('monitor')}
        >
          <p className="text-sm text-muted-foreground mb-3">
            The Adoption dashboard shows download trends and which update each device is currently running.
            Use it to verify rollouts are progressing and catch issues early.
          </p>
          <Button variant="outline" size="sm" onClick={() => onNavigate('adoption')}>
            Go to Adoption
          </Button>
        </Section>

        {/* Step 7: Code Signing */}
        <Section
          number={7}
          title="Code signing (optional)"
          icon={<Shield className="h-4 w-4" />}
          open={openSection === 'signing'}
          onToggle={() => toggle('signing')}
        >
          <p className="text-sm text-muted-foreground mb-3">
            Sign manifests so devices verify updates came from you. Set <code className="text-xs bg-muted px-1 py-0.5 rounded">PRIVATE_KEY_PATH</code> on the server
            and configure the public key in your app.
          </p>

          <CodeBlock
            id="keygen"
            language="bash"
            copied={copied}
            onCopy={copyText}
            code={`# Generate key pair
openssl genpkey -algorithm RSA -out private-key.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in private-key.pem -pubout -out public-key.pem`}
          />

          <p className="text-xs text-muted-foreground mt-2">
            Set <code className="text-xs bg-muted px-1 py-0.5 rounded">PRIVATE_KEY_PATH=./private-key.pem</code> in your server environment, then add <code className="text-xs bg-muted px-1 py-0.5 rounded">updates.codeSigningCertificate</code> to your app.json pointing to the public key.
          </p>
        </Section>

        {/* Runtime version callout */}
        <div className="rounded-xl border bg-card p-4 mt-6">
          <h4 className="text-sm font-semibold mb-1">Runtime version</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Devices only receive updates matching their runtime version. Bump it when native dependencies change
            (new packages, Expo SDK upgrade, iOS/Android folder changes). If you use fingerprint-based versioning,
            the CI workflow handles this automatically.
          </p>
        </div>

      </div>

      <Dialog open={showHookModal} onOpenChange={setShowHookModal}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>OTA Update Hook</DialogTitle>
            <DialogDescription>
              Sample React hook that checks for updates on mount, handles critical reloads, and sends tracking headers for rollout bucketing. Adapt to fit your app.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setHookVariant('device')}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                hookVariant === 'device' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Device only
            </button>
            <button
              onClick={() => setHookVariant('user')}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                hookVariant === 'user' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              With user targeting
            </button>
          </div>

          {hookVariant === 'user' && (
            <p className="text-xs text-muted-foreground -mb-1">
              This sample uses a <code className="text-xs bg-muted px-1 py-0.5 rounded">useAuth()</code> hook to get the current user ID — replace this with your own authentication context.
            </p>
          )}

          <HighlightedCode
            id={`ota-hook-${hookVariant}`}
            code={hookVariant === 'device' ? OTA_HOOK_DEVICE_ONLY : OTA_HOOK_WITH_USER}
            language="typescript"
            copied={copied}
            onCopy={copyText}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function Section({
  number,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  number: number
  title: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-accent/30 transition-colors cursor-pointer"
      >
        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
          {number}
        </span>
        <span className="flex items-center gap-2 flex-1 text-sm font-semibold">
          {icon}
          {title}
        </span>
        <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t">
          {children}
        </div>
      )}
    </div>
  )
}

function CodeBlock({
  id,
  code,
  language,
  copied,
  onCopy,
}: {
  id: string
  code: string
  language: string
  copied: string | null
  onCopy: (text: string, id: string) => void
}) {
  return (
    <div className="relative group rounded-lg bg-muted border">
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{language}</span>
        <button
          onClick={() => onCopy(code, id)}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
        >
          {copied === id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="p-3 text-xs overflow-x-auto"><code>{code}</code></pre>
    </div>
  )
}

function UseCaseRow({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
      <div>
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground"> — {description}</span>
      </div>
    </div>
  )
}
