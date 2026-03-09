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
  Percent,
  Check,
  ArrowRight,
  Bug,
  Activity,
  Eye,
  Layers,
  AlertTriangle,
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
          <Badge variant="secondary" className="mb-4 text-xs">OTA Updates + Feature Flags + Progressive Delivery</Badge>
          <h1 className="text-5xl font-bold tracking-tight leading-[1.1] mb-6">
            Ship, flag, and observe<br />your mobile releases
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl">
            Dispatch is the release platform for Expo & React Native. Push OTA updates
            in seconds, control features with flags, automate rollouts with health gates,
            and monitor errors — all from one dashboard.
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
              <span>Feature Flags</span>
              <span>Rollouts</span>
              <span>Observe</span>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x">
            {/* Release + rollout card */}
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Active rollout</span>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">Fix checkout crash</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">production</Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <GitBranch className="h-2.5 w-2.5" /> main
                  <span className="mx-1">·</span>
                  <span>Stage 2/3</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: '50%' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">50%</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <Shield className="h-2.5 w-2.5 text-green-500" />
                  <span className="text-green-600">Health gate passed</span>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">Next: 100% in 2h</span>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">New onboarding</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">staging</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: '100%' }} />
                  </div>
                  <span className="text-[10px] text-green-600">Complete</span>
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
                  <span>iOS Pro Users</span>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium">dark-mode</span>
                  <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-700">On</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>boolean · 12.4k evals/day</span>
                  <span className="mx-1">·</span>
                  <span className="text-green-600">healthy</span>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium">pricing-tier</span>
                  <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-700">On</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>string · 3 variations</span>
                </div>
              </div>
            </div>

            {/* Observe card */}
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Observe</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-1">
                <div className="rounded-lg border p-2 text-center">
                  <div className="text-sm font-bold text-amber-600">12</div>
                  <span className="text-[9px] text-muted-foreground">Errors</span>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <div className="text-sm font-bold">0</div>
                  <span className="text-[9px] text-muted-foreground">Crashes</span>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <div className="text-sm font-bold">847</div>
                  <span className="text-[9px] text-muted-foreground">Events</span>
                </div>
              </div>
              <div className="rounded-lg border p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Bug className="h-3 w-3 text-amber-500" />
                  <span className="text-[11px] font-medium truncate">TypeError: Cannot read 'map'</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">x3</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  2m ago · iOS · production
                </div>
              </div>
              <div className="rounded-lg border p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-primary" />
                  <span className="text-[11px] font-medium truncate">checkout_completed</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">x291</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  5m ago · Android · production
                </div>
              </div>
              <div className="pt-1 text-[10px] text-muted-foreground">
                99.8% crash-free · 14.2k devices
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
              OTA updates, feature flags, progressive delivery, and observability in one platform.
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
                icon: <Flag className="h-5 w-5 text-indigo-500" />,
                title: 'Feature flags',
                desc: 'Boolean, string, number, and JSON flags with targeting rules. Percentage rollouts, user lists, attribute matching, segments, and OTA-aware targeting.',
              },
              {
                icon: <Layers className="h-5 w-5 text-blue-500" />,
                title: 'Progressive delivery',
                desc: 'Define multi-stage rollout policies with health gates. Automatically advance from 5% to 25% to 100% — or auto-rollback if errors spike.',
              },
              {
                icon: <Eye className="h-5 w-5 text-amber-500" />,
                title: 'Error & crash monitoring',
                desc: 'Track JS errors, crashes, and custom events from your app. See stack traces, flag correlations, and per-update health at a glance.',
              },
              {
                icon: <Activity className="h-5 w-5 text-emerald-500" />,
                title: 'Health telemetry',
                desc: 'Real-time error rates, crash-free percentages, and flag impact analysis. Correlate health regressions with specific flag changes automatically.',
              },
              {
                icon: <Users className="h-5 w-5 text-violet-500" />,
                title: 'Segments & contexts',
                desc: 'Build reusable audience segments for targeting. Track evaluation contexts across users, devices, and organizations.',
              },
              {
                icon: <GitBranch className="h-5 w-5 text-cyan-500" />,
                title: 'Channels & branches',
                desc: 'Map channels to branches for environment management. Production, staging, canary — each with independent rollout controls.',
              },
              {
                icon: <Shield className="h-5 w-5 text-red-500" />,
                title: 'Code signing & rollback',
                desc: 'RSA-SHA256 manifest signing for integrity verification. Instant rollback to any previous update with one click.',
              },
              {
                icon: <Globe className="h-5 w-5 text-primary" />,
                title: 'OpenFeature SDK',
                desc: 'Standards-based feature flag SDK for React Native. Drop-in OpenFeature provider with built-in health reporting.',
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
                title: 'Connect your project',
                code: '$ dispatch login --server https://ota.appdispatch.dev --key <api-key>\n$ dispatch init',
              },
              {
                step: '2',
                title: 'Push an update',
                code: '$ dispatch publish --channel production -m "Fix login bug"',
              },
              {
                step: '3',
                title: 'Automate with CI/CD',
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
            <p className="text-muted-foreground text-lg">The only platform that combines OTA updates, feature flags, and observability for React Native.</p>
          </div>

          <div className="max-w-3xl mx-auto grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <DispatchLogo className="h-5 w-5" /> Dispatch
              </h3>
              <ul className="space-y-2.5 text-sm">
                {[
                  'OTA updates + feature flags + observability',
                  'Progressive delivery with health gates',
                  'Error & crash monitoring built in',
                  'Audience segments & context targeting',
                  'Code signing & instant rollback',
                  'OpenFeature-compatible SDK',
                  'No per-seat pricing',
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
                  'EAS Update — OTA only, no flags or monitoring',
                  'CodePush — deprecated by Microsoft',
                  'Shorebird — Dart/Flutter only',
                  'LaunchDarkly — flags only, no OTA, expensive',
                  'Sentry — monitoring only, no OTA or flags',
                  'Flagsmith — flags only, no progressive delivery',
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
            <p className="text-muted-foreground text-lg">No per-seat fees. No update limits. Pay for what matters as you scale.</p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-lg">Community</h3>
                <p className="text-sm text-muted-foreground mt-1">For side projects and indie devs</p>
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
                  'Boolean feature flags',
                  'Error monitoring (7-day retention)',
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
                  'All flag types & targeting rules',
                  'Segments & audience targeting',
                  'Progressive delivery & health gates',
                  '30-day monitoring retention',
                  'Code signing, webhooks & audit trail',
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
                  'Custom data retention',
                  'Dedicated support & SLA',
                  'Custom integrations',
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
          <p className="text-muted-foreground mb-6">Start pushing updates in under 5 minutes. No credit card required.</p>
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
          <span>The release platform for Expo & React Native</span>
        </div>
      </footer>
    </div>
  )
}
