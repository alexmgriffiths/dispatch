import DispatchLogo from './DispatchLogo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Rocket,
  Flag,
  GitBranch,
  BarChart3,
  Shield,
  Zap,
  Upload,
  Users,
  Globe,
  Smartphone,
  Percent,
  Terminal,
  Check,
  ArrowRight,
} from 'lucide-react'

interface Props {
  onSignIn: () => void
  onSetup: () => void
  needsSetup: boolean
}

export default function LandingPage({ onSignIn, onSetup, needsSetup }: Props) {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DispatchLogo className="h-6 w-6" />
            <span className="text-lg font-bold tracking-tight">Dispatch</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            {needsSetup ? (
              <Button onClick={onSetup}>Get started</Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={onSignIn}>Sign in</Button>
                <Button size="sm" onClick={onSignIn}>Dashboard</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-4 text-xs">OTA Updates + Feature Flags</Badge>
          <h1 className="text-5xl font-bold tracking-tight leading-[1.1] mb-6">
            Ship mobile updates<br />without the app store
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl">
            Dispatch is a platform for Expo & React Native that combines
            over-the-air updates with feature flags. Push fixes in seconds, roll out
            features gradually, and skip the app store for every update.
          </p>
          <div className="flex items-center gap-4">
            {needsSetup ? (
              <Button size="lg" onClick={onSetup}>
                <Rocket className="mr-2 h-4 w-4" /> Get started free
              </Button>
            ) : (
              <Button size="lg" onClick={onSignIn}>
                <ArrowRight className="mr-2 h-4 w-4" /> Go to dashboard
              </Button>
            )}
          </div>
        </div>

        {/* Preview card */}
        <div className="mt-16 rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-5 py-3 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <DispatchLogo className="h-4 w-4" />
              <span className="font-medium">Dispatch</span>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="text-foreground font-medium">Releases</span>
              <span>Builds</span>
              <span>Feature Flags</span>
              <span>Adoption</span>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x">
            {/* Release card */}
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Latest release</span>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">Fix checkout crash</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">production</Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <GitBranch className="h-2.5 w-2.5" /> main
                  <span className="font-mono">a3f1b2c</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">100%</span>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">New onboarding</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">staging</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: '25%' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">25%</span>
                </div>
              </div>
            </div>

            {/* Flag card */}
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-medium">Feature flags</span>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium">enable-checkout-v2</span>
                  <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-700">On</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Percent className="h-2.5 w-2.5 text-blue-500" />
                  <span>25% rollout</span>
                  <span className="mx-1">·</span>
                  <Users className="h-2.5 w-2.5 text-green-500" />
                  <span>3 users</span>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium">dark-mode</span>
                  <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-700">On</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>boolean · 12.4k evals/day</span>
                </div>
              </div>
            </div>

            {/* Adoption card */}
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Adoption</span>
              </div>
              <div className="space-y-2">
                {[
                  { version: 'v49 · a3f1b2c', pct: 64, color: 'bg-primary' },
                  { version: 'v49 · e7d42f1', pct: 28, color: 'bg-blue-500' },
                  { version: 'v48 · 7e2d9f4', pct: 8, color: 'bg-muted-foreground/40' },
                ].map((r) => (
                  <div key={r.version} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-muted-foreground">{r.version}</span>
                      <span className="font-medium">{r.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-1 text-[10px] text-muted-foreground">
                1,247 devices · 3 active versions
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Everything you need to ship fast</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              OTA updates and feature flags in one platform. No per-seat pricing, no usage limits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <Upload className="h-5 w-5 text-primary" />,
                title: 'Instant OTA updates',
                desc: 'Push JavaScript bundle updates directly to devices. Skip the app store review cycle for bug fixes and feature releases.',
              },
              {
                icon: <Percent className="h-5 w-5 text-blue-500" />,
                title: 'Percentage rollouts',
                desc: 'Roll out updates gradually with deterministic device bucketing. Start at 5%, validate, then ramp to 100%.',
              },
              {
                icon: <Flag className="h-5 w-5 text-indigo-500" />,
                title: 'Feature flags',
                desc: 'Boolean, string, number, and JSON flags with targeting rules. Percentage rollouts, user lists, and attribute matching.',
              },
              {
                icon: <GitBranch className="h-5 w-5 text-emerald-500" />,
                title: 'Channels & branches',
                desc: 'Map channels to branches for environment management. Production, staging, canary — each with independent rollout controls.',
              },
              {
                icon: <BarChart3 className="h-5 w-5 text-amber-500" />,
                title: 'Adoption analytics',
                desc: 'Track which devices are running which versions. Per-update download counts, device adoption curves, and real-time distribution.',
              },
              {
                icon: <Shield className="h-5 w-5 text-red-500" />,
                title: 'Code signing',
                desc: 'RSA-SHA256 manifest signing for update integrity verification. Devices reject unsigned or tampered updates.',
              },
              {
                icon: <Zap className="h-5 w-5 text-yellow-500" />,
                title: 'Instant rollback',
                desc: 'Roll back to any previous update or the embedded app version with one click. No new build required.',
              },
              {
                icon: <Users className="h-5 w-5 text-violet-500" />,
                title: 'User overrides',
                desc: 'Target individual users or devices with specific branches. Test changes in production without affecting other users.',
              },
              {
                icon: <Globe className="h-5 w-5 text-cyan-500" />,
                title: 'Multi-platform',
                desc: 'Works with Expo and bare React Native on iOS and Android. One CLI, one dashboard, every platform.',
              },
            ].map((feature) => (
              <div key={feature.title} className="rounded-xl border bg-background p-6 space-y-3">
                <div className="flex items-center gap-3">
                  {feature.icon}
                  <h3 className="font-semibold">{feature.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Up and running in minutes</h2>
            <p className="text-muted-foreground text-lg">Three commands to your first OTA update.</p>
          </div>

          <div className="max-w-2xl mx-auto space-y-8">
            {[
              {
                step: '1',
                title: 'Install the CLI',
                code: '$ dispatch login --server https://ota.appdispatch.dev --key <api-key>\n$ dispatch init',
              },
              {
                step: '2',
                title: 'Push an update',
                code: '$ dispatch publish --channel production -m "Fix login bug"',
              },
              {
                step: '3',
                title: 'Or automate with CI/CD',
                code: '# .github/workflows/ota-deploy.yml\n- run: dispatch publish --channel ${{ inputs.channel }}',
              },
            ].map((s) => (
              <div key={s.step} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {s.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  <pre className="text-[12px] bg-muted rounded-lg px-4 py-3 font-mono text-muted-foreground overflow-x-auto whitespace-pre">
                    {s.code}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Why Dispatch</h2>
            <p className="text-muted-foreground text-lg">The only platform that combines OTA updates with feature flags for React Native.</p>
          </div>

          <div className="max-w-3xl mx-auto grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <DispatchLogo className="h-5 w-5" /> Dispatch
              </h3>
              <ul className="space-y-2.5 text-sm">
                {[
                  'OTA updates + feature flags in one tool',
                  'No per-seat pricing',
                  'Percentage rollouts with sticky bucketing',
                  'Code signing & instant rollback',
                  'Full audit trail & webhooks',
                  'OpenFeature-compatible SDK',
                  'CI/CD CLI with GitHub Actions support',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-muted-foreground">Others</h3>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                {[
                  'EAS Update — OTA only, no feature flags',
                  'CodePush — deprecated by Microsoft',
                  'Shorebird — Dart/Flutter only',
                  'LaunchDarkly — flags only, no OTA, expensive',
                  'Flagsmith — flags only, no OTA integration',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="h-4 w-4 shrink-0 mt-0.5 text-center">—</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Simple pricing</h2>
            <p className="text-muted-foreground text-lg">One platform. No per-seat fees. No usage limits.</p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-lg">Community</h3>
                <p className="text-sm text-muted-foreground mt-1">For side projects and small teams</p>
              </div>
              <div>
                <span className="text-4xl font-bold">Free</span>
                <span className="text-muted-foreground ml-1">forever</span>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  'Unlimited OTA updates',
                  'Unlimited devices',
                  '1 project',
                  'Feature flags (all types)',
                  'Percentage rollouts',
                  'Community support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={needsSetup ? onSetup : onSignIn}>
                {needsSetup ? 'Get started' : 'Sign in'}
              </Button>
            </div>

            {/* Pro */}
            <div className="rounded-xl border-2 border-primary bg-card p-6 space-y-5 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="text-[10px]">Most popular</Badge>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Pro</h3>
                <p className="text-sm text-muted-foreground mt-1">For teams shipping production apps</p>
              </div>
              <div>
                <span className="text-4xl font-bold">$49</span>
                <span className="text-muted-foreground ml-1">/mo</span>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  'Everything in Community',
                  'Unlimited projects',
                  'Webhooks & integrations',
                  'Full audit trail',
                  'Code signing',
                  'User overrides & targeting',
                  'Priority support',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full" onClick={needsSetup ? onSetup : onSignIn}>
                Start free trial
              </Button>
            </div>

            {/* Enterprise */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-lg">Enterprise</h3>
                <p className="text-sm text-muted-foreground mt-1">For organizations with custom needs</p>
              </div>
              <div>
                <span className="text-4xl font-bold">Custom</span>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  'Everything in Pro',
                  'SSO / SAML',
                  'Role-based access control',
                  'Dedicated support & SLA',
                  'Custom integrations',
                  'Uptime SLA guarantee',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full">
                Contact us
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-3">Ready to ship faster?</h2>
          <p className="text-muted-foreground mb-6">Start pushing updates in under 5 minutes.</p>
          <div className="flex items-center justify-center gap-4">
            {needsSetup ? (
              <Button size="lg" onClick={onSetup}>
                <Rocket className="mr-2 h-4 w-4" /> Get started free
              </Button>
            ) : (
              <Button size="lg" onClick={onSignIn}>
                <ArrowRight className="mr-2 h-4 w-4" /> Go to dashboard
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <DispatchLogo className="h-4 w-4" />
            <span>Dispatch</span>
          </div>
          <span>OTA updates & feature flags for Expo & React Native</span>
        </div>
      </footer>
    </div>
  )
}
