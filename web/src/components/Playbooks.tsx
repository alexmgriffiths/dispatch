import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight, Rocket, Shield, Gauge, ArrowLeftRight, Smartphone, AlertTriangle,
  Webhook, Terminal, GitBranch, Lock, Clock, Fingerprint,
} from 'lucide-react'

interface Props {
  onNavigate: (page: string) => void
}

export default function Playbooks({ onNavigate }: Props) {
  const [openSection, setOpenSection] = useState<string | null>('slow-roll')

  function toggle(id: string) {
    setOpenSection(prev => prev === id ? null : id)
  }

  return (
    <>
      <div className="border-b bg-card px-6 py-5">
        <h2 className="text-lg font-semibold">Playbooks</h2>
        <p className="text-sm text-muted-foreground">Common deployment workflows and best practices</p>
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        {/* Left column */}
        <div className="space-y-3">
          <Playbook
            title="Slow roll to production"
            subtitle="Avoid shipping to 100% of users on day one"
            icon={<Gauge className="h-4 w-4" />}
            open={openSection === 'slow-roll'}
            onToggle={() => toggle('slow-roll')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              By default, updates published to the <strong>main</strong> branch go to all devices at 100%.
              Here's how to roll out gradually instead.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Publish your update normally.</strong> It lands on your production branch at 100% rollout.
              </Step>
              <Step n={2}>
                <strong>Lower the rollout percentage.</strong> Go to{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('updates')}>Releases</button>,
                open the update, and drag the rollout slider down to 5-10%.
              </Step>
              <Step n={3}>
                <strong>Monitor adoption.</strong> Check the{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('adoption')}>Adoption</button>{' '}
                dashboard to see download trends. Watch for error spikes in your error tracker.
              </Step>
              <Step n={4}>
                <strong>Ramp up.</strong> If things look good after a few hours, increase to 25%, then 50%, then 100%.
              </Step>
            </ol>

            <Warning>
              Rollout bucketing requires each device to send a stable <Code>expo-device-id</Code> header. Without it, bucketing is random and non-sticky — devices may flip between the old and new update on every check. See the <button className="text-primary hover:underline" onClick={() => onNavigate('getting-started')}>Getting Started</button> guide for setup instructions.
            </Warning>

            <Tip>
              You can also set rollout percentage in CI by passing <Code>--rollout 10</Code> to the publish step.
              This way updates never start at 100%.
            </Tip>
          </Playbook>

          <Playbook
            title="Canary deployments with channels"
            subtitle="Test updates with your team before shipping to everyone"
            icon={<Rocket className="h-4 w-4" />}
            open={openSection === 'canary'}
            onToggle={() => toggle('canary')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Use a separate <strong>canary</strong> channel to validate updates with your team before promoting to production.
              This requires a dedicated test build of your app — the channel is set at build time, not per-device.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Create a canary channel.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; Channels</button>,
                create a channel called <Code>canary</Code> pointing to a <Code>canary</Code> branch.
              </Step>
              <Step n={2}>
                <strong>Build a canary version of your app.</strong> Set <Code>"expo-channel-name": "canary"</Code> in
                your app config's request headers and create a build. Distribute it to your team via TestFlight (iOS) or
                internal testing track (Android).
              </Step>
              <Step n={3}>
                <strong>Deploy to canary first.</strong> Publish updates to the canary branch. Only the canary app build
                will receive them — production users are completely unaffected.
              </Step>
              <Step n={4}>
                <strong>Validate.</strong> Have your team use the canary build for a few hours or days. Check for crashes, regressions, and performance.
              </Step>
              <Step n={5}>
                <strong>Promote to production.</strong> Once validated, republish the same update to production using the
                "Republish" action in the update drawer — same assets, no re-upload needed.
              </Step>
            </ol>

            <Tip>
              The canary build is a one-time setup. Once your team has it installed, every future canary deployment is just
              a publish to the canary branch — no new app build needed. Only the OTA updates change.
            </Tip>
          </Playbook>

          <Playbook
            title="Channel-level traffic splitting"
            subtitle="Route a percentage of production traffic to a new branch"
            icon={<ArrowLeftRight className="h-4 w-4" />}
            open={openSection === 'channel-split'}
            onToggle={() => toggle('channel-split')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Instead of adjusting rollout per-update, you can split an entire channel's traffic between two branches.
              This is great for A/B testing or staged branch promotion.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Create a new branch</strong> (e.g. <Code>release-v2</Code>) and publish your update there.
              </Step>
              <Step n={2}>
                <strong>Set a rollout branch.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; Channels</button>,
                edit your production channel. Set <Code>release-v2</Code> as the rollout branch at 10%.
              </Step>
              <Step n={3}>
                <strong>Ramp up.</strong> Increase the rollout percentage as confidence grows. At 100%, all devices are on the new branch.
              </Step>
              <Step n={4}>
                <strong>Finalize.</strong> Once fully rolled out, update the channel's main branch pointer to <Code>release-v2</Code> and remove the rollout branch.
              </Step>
            </ol>

            <Warning>
              Deterministic bucketing requires each device to send a stable <Code>expo-device-id</Code> header. Without it, devices are bucketed randomly on every request. See <button className="text-primary hover:underline" onClick={() => onNavigate('getting-started')}>Getting Started &gt; Enable device tracking</button>.
            </Warning>

            <Tip>
              Device bucketing is deterministic — the same device always gets the same branch for a given rollout percentage. Users won't flip between versions.
            </Tip>
          </Playbook>

          <Playbook
            title="Emergency rollback"
            subtitle="Quickly revert a bad update"
            icon={<AlertTriangle className="h-4 w-4" />}
            open={openSection === 'emergency'}
            onToggle={() => toggle('emergency')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Something went wrong in production. Here's how to get back to a known-good state fast.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Open the last known-good update.</strong> Go to{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('updates')}>Releases</button>{' '}
                and find the update you want to revert to.
              </Step>
              <Step n={2}>
                <strong>Click "Rollback to this".</strong> This creates a rollback directive that tells devices to use that specific update.
              </Step>
              <Step n={3}>
                <strong>Mark it critical.</strong> Toggle the "Critical" flag so devices reload immediately instead of waiting for the next app launch.
              </Step>
            </ol>

            <Tip>
              Alternatively, if you use channel-level branching, you can instantly switch the channel's branch pointer back to the previous branch. No new update needed — all devices get the old branch's latest update immediately.
            </Tip>
          </Playbook>

          <Playbook
            title="Coordinated multi-platform releases"
            subtitle="Ship iOS and Android updates together"
            icon={<Smartphone className="h-4 w-4" />}
            open={openSection === 'multi-platform'}
            onToggle={() => toggle('multi-platform')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              When you need iOS and Android to update in lockstep, use the <strong>group ID</strong> to link platform-specific bundles into a single logical release.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Export both platforms.</strong> Run the expo export for iOS and Android separately — each produces its own bundle.
              </Step>
              <Step n={2}>
                <strong>Publish with the same group ID.</strong> When creating updates for both platforms, use the same <Code>group_id</Code>. The CI workflow does this automatically.
              </Step>
              <Step n={3}>
                <strong>Manage as one.</strong> In the Releases view, updates with the same group ID appear together. Adjusting rollout or rolling back affects both platforms.
              </Step>
            </ol>

            <Tip>
              If only one platform needs a fix, you can publish a single-platform update with a unique group ID. The other platform stays untouched.
            </Tip>
          </Playbook>

          <Playbook
            title="Staging environment"
            subtitle="Preview updates before they reach any real users"
            icon={<Shield className="h-4 w-4" />}
            open={openSection === 'staging'}
            onToggle={() => toggle('staging')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Set up a full staging pipeline using channels and branches. No separate server needed.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Create a staging channel and branch.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings</button>,
                create a <Code>staging</Code> branch and a <Code>staging</Code> channel that points to it.
              </Step>
              <Step n={2}>
                <strong>Deploy to staging from CI.</strong> Have your CI pipeline publish to the staging branch on every push (or on a staging Git branch).
              </Step>
              <Step n={3}>
                <strong>Test with a staging build.</strong> Build a version of your app that connects to the staging channel. QA tests against this.
              </Step>
              <Step n={4}>
                <strong>Promote to production.</strong> Once approved, republish the update to your production branch or switch the production channel's pointer.
              </Step>
            </ol>

            <Tip>
              You can chain environments: <Code>dev → staging → canary → production</Code>. Each is just a channel pointing to a branch.
            </Tip>
          </Playbook>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          <Playbook
            title="CI/CD automation"
            subtitle="Publish updates automatically from your pipeline"
            icon={<Terminal className="h-4 w-4" />}
            open={openSection === 'ci-cd'}
            onToggle={() => toggle('ci-cd')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Automate OTA publishing from GitHub Actions, GitLab CI, or any CI provider using the API and an API key.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Create an API key.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; API Keys</button>,
                create a key named after your pipeline (e.g. <Code>github-actions</Code>).
              </Step>
              <Step n={2}>
                <strong>Store it as a secret.</strong> Add the key as <Code>DISPATCH_API_KEY</Code> in your CI environment secrets.
              </Step>
              <Step n={3}>
                <strong>Export the bundle.</strong> Run <Code>npx expo export --platform all</Code> to produce the JS bundles and assets.
              </Step>
              <Step n={4}>
                <strong>Upload assets.</strong> POST the exported files to <Code>/v1/ota/assets/upload</Code> with your Bearer token. The response returns S3 keys and hashes.
              </Step>
              <Step n={5}>
                <strong>Create the update.</strong> POST to <Code>/v1/ota/updates</Code> with the asset manifest, runtime version, channel, and rollout percentage.
              </Step>
            </ol>

            <Tip>
              Use the same <Code>group_id</Code> for iOS and Android exports in the same CI run to keep them linked as a single release.
            </Tip>
          </Playbook>

          <Playbook
            title="Webhook monitoring"
            subtitle="Get notified about deployments and failures"
            icon={<Webhook className="h-4 w-4" />}
            open={openSection === 'webhooks'}
            onToggle={() => toggle('webhooks')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Use webhooks to integrate Dispatch with Slack, PagerDuty, or your own monitoring. Every webhook retries up to 3 times with exponential backoff.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Add a webhook.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; Webhooks</button>,
                add your endpoint URL and select which events to subscribe to.
              </Step>
              <Step n={2}>
                <strong>Add a signing secret.</strong> Set a secret so your endpoint can verify payloads using the <Code>X-Dispatch-Signature</Code> header (HMAC-SHA256).
              </Step>
              <Step n={3}>
                <strong>Monitor deliveries.</strong> Click "Deliveries" on any webhook to see recent delivery attempts, HTTP status codes, and retry history.
              </Step>
            </ol>

            <Tip>
              Failed deliveries retry after 5 seconds, then 25 seconds. If all 3 attempts fail, the delivery is marked as permanently failed — check the delivery log for error details.
            </Tip>
          </Playbook>

          <Playbook
            title="Runtime version management"
            subtitle="Handle native code changes safely"
            icon={<Fingerprint className="h-4 w-4" />}
            open={openSection === 'runtime-version'}
            onToggle={() => toggle('runtime-version')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              The runtime version determines which OTA updates are compatible with a given app binary.
              When native code changes, you need a new runtime version.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Understand the boundary.</strong> OTA updates can only change JavaScript and assets. If you add a native module, change app.json config, or update the Expo SDK, the native binary must change too.
              </Step>
              <Step n={2}>
                <strong>Bump the runtime version.</strong> Update <Code>runtimeVersion</Code> in your app config. Devices with the old binary will stop receiving new OTA updates — they'll need to update from the app store first.
              </Step>
              <Step n={3}>
                <strong>Set a minimum runtime version.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; Channels</button>,
                set the min runtime version. Devices below this version are told to update the app binary instead.
              </Step>
            </ol>

            <Tip>
              Use <Code>expo-updates</Code> fingerprint-based runtime versioning to auto-detect native changes. This avoids manual version bumps entirely.
            </Tip>
          </Playbook>

          <Playbook
            title="Branch-per-feature workflow"
            subtitle="Isolate features using OTA branches"
            icon={<GitBranch className="h-4 w-4" />}
            open={openSection === 'branch-per-feature'}
            onToggle={() => toggle('branch-per-feature')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Use OTA branches to test individual features in isolation before merging into the main release.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Create a feature branch.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; Branches</button>,
                create a branch like <Code>feat/new-onboarding</Code>.
              </Step>
              <Step n={2}>
                <strong>Publish to the feature branch.</strong> Have CI publish updates from the feature's Git branch to the corresponding OTA branch.
              </Step>
              <Step n={3}>
                <strong>Point a test channel to it.</strong> Use your canary or staging channel to temporarily point to the feature branch for testing.
              </Step>
              <Step n={4}>
                <strong>Promote or discard.</strong> If the feature is good, republish the update to your production branch. If not, just switch the channel pointer back.
              </Step>
            </ol>

            <Tip>
              Feature branches are cheap — they don't duplicate assets. The content-addressed storage means identical files are shared across branches.
            </Tip>
          </Playbook>

          <Playbook
            title="API key rotation"
            subtitle="Rotate secrets without downtime"
            icon={<Lock className="h-4 w-4" />}
            open={openSection === 'key-rotation'}
            onToggle={() => toggle('key-rotation')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Rotate API keys regularly to limit exposure. Dispatch supports multiple active keys, so you can rotate without interrupting CI.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Create a new key.</strong> In{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('settings')}>Settings &gt; API Keys</button>,
                create a new key. Copy it immediately — it won't be shown again.
              </Step>
              <Step n={2}>
                <strong>Update your CI secrets.</strong> Replace <Code>DISPATCH_API_KEY</Code> in your CI provider with the new key. Both old and new keys work simultaneously.
              </Step>
              <Step n={3}>
                <strong>Revoke the old key.</strong> Once the new key is deployed across all pipelines, revoke the old key. Revoked keys return 401 immediately.
              </Step>
            </ol>

            <Tip>
              Check the "Last used" timestamp on each key to confirm the old key is no longer in use before revoking it.
            </Tip>
          </Playbook>

          <Playbook
            title="Scheduled maintenance windows"
            subtitle="Control when updates reach devices"
            icon={<Clock className="h-4 w-4" />}
            open={openSection === 'maintenance'}
            onToggle={() => toggle('maintenance')}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Some teams prefer to ship during low-traffic windows. Here's how to publish now but delay exposure.
            </p>

            <ol className="space-y-3 text-sm">
              <Step n={1}>
                <strong>Publish with 0% rollout.</strong> Create the update via CI with <Code>--rollout 0</Code>. The update is uploaded and ready but no devices receive it.
              </Step>
              <Step n={2}>
                <strong>Verify the update.</strong> Check the{' '}
                <button className="text-primary hover:underline" onClick={() => onNavigate('updates')}>Releases</button>{' '}
                page to confirm the correct assets, message, and platform are present.
              </Step>
              <Step n={3}>
                <strong>Open the rollout.</strong> During your maintenance window, bump rollout to 10%, monitor briefly, then push to 100%.
              </Step>
            </ol>

            <Tip>
              Combine this with the Critical flag to force immediate reloads during the window, ensuring all active users pick up the update quickly.
            </Tip>
          </Playbook>
        </div>
      </div>
    </>
  )
}

function Playbook({
  title,
  subtitle,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string
  subtitle: string
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
        <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 text-primary shrink-0">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold block">{title}</span>
          <span className="text-xs text-muted-foreground block">{subtitle}</span>
        </div>
        <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform shrink-0', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t">
          {children}
        </div>
      )}
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[11px] font-bold shrink-0 mt-0.5">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 mt-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground/70">Tip: </span>
        {children}
      </p>
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mt-3">
      <p className="text-xs text-amber-800">
        <span className="font-semibold">Required: </span>
        {children}
      </p>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-xs bg-muted px-1 py-0.5 rounded">{children}</code>
}
