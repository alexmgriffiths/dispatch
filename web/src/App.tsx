import { useCallback, useEffect, useState } from 'react'
import Login from './components/Login'
import LandingPage from './components/LandingPage'
import Onboarding from './components/Onboarding'
import UpdatesList from './components/UpdatesList'
import BuildsList from './components/BuildsList'
import PublishUpdate from './components/PublishUpdate'
import AuditLog from './components/AuditLog'
import Adoption from './components/Adoption'
import Settings from './components/Settings'
import GettingStarted from './components/GettingStarted'
import Playbooks from './components/Playbooks'
import FeatureFlags from './components/FeatureFlags'
import Contexts from './components/Contexts'
import RolloutPolicies from './components/RolloutPolicies'
import Telemetry from './components/Telemetry'
import DispatchLogo from './components/DispatchLogo'
import WelcomeModal, { WELCOME_SEEN_KEY } from './components/WelcomeModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getToken, clearToken, logout, getSetupStatus, listProjects, listUpdates, getProjectSlug, setProjectSlug, clearProjectSlug, getMe } from './api/client'
import type { ProjectRecord } from './api/client'
import ProjectSwitcher from './components/ProjectSwitcher'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  LayoutGrid,
  Layers,
  Upload,
  BarChart3,
  FileText,
  Settings as SettingsIcon,
  BookOpen,
  Rocket,
  LogOut,
  Flag,
  Users,
  Shield,
  Zap,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Page = 'updates' | 'builds' | 'publish' | 'adoption' | 'telemetry' | 'audit' | 'settings' | 'flags' | 'contexts' | 'guide' | 'playbooks' | 'rollouts' | 'policies'

const GUIDE_DISMISSED_KEY = 'dispatch-guide-dismissed'

const PAGE_PATHS: Record<Page, string> = {
  updates: '/releases',
  builds: '/builds',
  publish: '/publish',
  adoption: '/adoption',
  telemetry: '/telemetry',
  audit: '/audit-log',
  settings: '/settings',
  flags: '/flags',
  contexts: '/contexts',
  guide: '/getting-started',
  playbooks: '/playbooks',
  rollouts: '/rollouts',
  policies: '/policies',
}
const PATH_TO_PAGE: Record<string, Page> = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page as Page])
) as Record<string, Page>

function pageFromPath(): Page | null {
  const path = window.location.pathname
  if (path.startsWith('/flags/')) return 'flags'
  return PATH_TO_PAGE[path] ?? null
}

function flagKeyFromPath(): string | null {
  const path = window.location.pathname
  if (path.startsWith('/flags/')) return decodeURIComponent(path.slice('/flags/'.length))
  return null
}

const USE_MOCK = import.meta.env.VITE_MOCK === 'true'

function App() {
  const [authed, setAuthed] = useState(() => USE_MOCK || !!getToken())
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [page, setPageState] = useState<Page>(() => {
    const fromUrl = pageFromPath()
    if (fromUrl) return fromUrl
    const defaultPage = localStorage.getItem(GUIDE_DISMISSED_KEY) ? 'updates' : 'guide'
    // Sync URL on first load when landing on /
    window.history.replaceState(null, '', PAGE_PATHS[defaultPage])
    return defaultPage
  })
  const setPage = useCallback((p: Page) => {
    setPageState(p)
    setInitialFlagKey(null)
    const path = PAGE_PATHS[p]
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const p = pageFromPath()
      if (p) setPageState(p)
      setInitialFlagKey(flagKeyFromPath())
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const [publishBuildId, setPublishBuildId] = useState<number | null>(null)
  const [initialFlagKey, setInitialFlagKey] = useState<string | null>(() => flagKeyFromPath())
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem(WELCOME_SEEN_KEY))
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [currentProjectSlug, setCurrentProjectSlug] = useState<string>(getProjectSlug() || '')
  const [projectKey, setProjectKey] = useState(0)
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [projectRole, setProjectRole] = useState<string>('admin')

  useEffect(() => {
    if (!authed && !USE_MOCK) {
      getSetupStatus()
        .then((s) => setNeedsSetup(s.needsSetup))
        .catch(() => setNeedsSetup(false))
    }
  }, [authed])

  useEffect(() => {
    if (authed) {
      listProjects()
        .then((ps) => {
          setProjects(ps)
          if (ps.length > 0) {
            const saved = getProjectSlug()
            const match = saved ? ps.find((p) => p.slug === saved) : null
            const slug = match ? match.slug : ps[0].slug
            setProjectSlug(slug)
            setCurrentProjectSlug(slug)
          }
          // If on guide and there are existing updates, skip to releases
          if (page === 'guide' && !localStorage.getItem(GUIDE_DISMISSED_KEY)) {
            listUpdates().then((updates) => {
              if (updates.length > 0) setPage('updates')
            }).catch(() => {})
          }
        })
        .catch(() => {})
      // Fetch the user's project role
      getMe().then((me) => {
        setProjectRole(me.projectRole ?? 'admin')
      }).catch(() => {})
    }
  }, [authed])

  function handleSwitchProject(slug: string) {
    setProjectSlug(slug)
    setCurrentProjectSlug(slug)
    setProjectKey((k) => k + 1)
    getMe().then((me) => setProjectRole(me.projectRole ?? 'admin')).catch(() => {})
  }

  async function handleLogout() {
    await logout().catch(() => {})
    clearToken()
    clearProjectSlug()
    setAuthed(false)
    setProjects([])
    setCurrentProjectSlug('')
    setNeedsSetup(null)
    window.history.replaceState(null, '', '/')
    getSetupStatus()
      .then((s) => setNeedsSetup(s.needsSetup))
      .catch(() => setNeedsSetup(false))
  }

  if (!authed) {
    if (needsSetup === null && !USE_MOCK) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <DispatchLogo className="h-8 w-8 animate-pulse" />
        </div>
      )
    }
    if (needsSetup || showSetup) {
      return (
        <Onboarding onComplete={() => {
          setNeedsSetup(false)
          setShowSetup(false)
          setCurrentProjectSlug(getProjectSlug() || '')
          setAuthed(true)
        }} />
      )
    }
    if (pathname === '/login') {
      return <Login onLogin={() => { setAuthed(true); window.history.replaceState(null, '', '/releases') }} onSetup={() => setShowSetup(true)} />
    }
    return (
      <LandingPage
        onSignIn={() => { window.history.pushState(null, '', '/login'); setPathname('/login') }}
        onSetup={() => setShowSetup(true)}
        needsSetup={needsSetup ?? false}
      />
    )
  }

  function handlePublishBuild(buildId: number) {
    setPublishBuildId(buildId)
    setPage('publish')
  }

  const docsNavItems: { page: Page; label: string; icon: React.ReactNode }[] = [
    { page: 'guide', label: 'Getting Started', icon: <Rocket className="h-4 w-4" /> },
    { page: 'playbooks', label: 'Playbooks', icon: <BookOpen className="h-4 w-4" /> },
  ]

  const otaNavItems: { page: Page; label: string; icon: React.ReactNode; onClick?: () => void }[] = [
    { page: 'updates', label: 'Releases', icon: <LayoutGrid className="h-4 w-4" /> },
    { page: 'builds', label: 'Builds', icon: <Layers className="h-4 w-4" /> },
    { page: 'publish', label: 'New Release', icon: <Upload className="h-4 w-4" />, onClick: () => { setPublishBuildId(null); setPage('publish') } },
  ]

  const rolloutsNavItems: { page: Page; label: string; icon: React.ReactNode }[] = [
    { page: 'rollouts', label: 'Rollouts', icon: <Zap className="h-4 w-4" /> },
    { page: 'policies', label: 'Policies', icon: <Shield className="h-4 w-4" /> },
  ]

  const flagsNavItems: { page: Page; label: string; icon: React.ReactNode }[] = [
    { page: 'flags', label: 'Feature Flags', icon: <Flag className="h-4 w-4" /> },
    { page: 'contexts', label: 'Contexts', icon: <Users className="h-4 w-4" /> },
  ]

  const insightsNavItems: { page: Page; label: string; icon: React.ReactNode }[] = [
    { page: 'adoption', label: 'Adoption', icon: <BarChart3 className="h-4 w-4" /> },
    { page: 'telemetry', label: 'Telemetry', icon: <Activity className="h-4 w-4" /> },
  ]

  const isAdmin = projectRole === 'admin'
  const isViewer = projectRole === 'viewer'

  const secondaryNavItems: { page: Page; label: string; icon: React.ReactNode }[] = [
    { page: 'audit', label: 'Audit Log', icon: <FileText className="h-4 w-4" /> },
    ...(isAdmin ? [{ page: 'settings' as Page, label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> }] : []),
  ]

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen overflow-hidden">
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}

      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-sidebar">
        <div className="p-5 pb-3">
          <div className="flex items-center gap-2">
            <DispatchLogo className="h-6 w-6" />
            <h1 className="text-lg font-bold tracking-tight text-sidebar-foreground">Dispatch</h1>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="px-3 pb-3">
            <ProjectSwitcher
              projects={projects}
              currentSlug={currentProjectSlug}
              onSwitch={handleSwitchProject}
              onProjectCreated={(p) => setProjects((prev) => [...prev, p])}
            />
          </div>
        )}

        <nav className="flex-1 space-y-1 px-3">
          {docsNavItems.map((item) => (
            <button
              key={item.page}
              onClick={() => setPage(item.page)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                page === item.page
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <Separator className="my-3" />

          <span className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">OTA Updates</span>
          {otaNavItems.map((item) => (
            <button
              key={item.page}
              onClick={item.onClick ?? (() => setPage(item.page))}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                page === item.page
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <span className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Experimentation</span>
          {flagsNavItems.map((item) => (
            <button
              key={item.page}
              onClick={() => setPage(item.page)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                page === item.page
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <span className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Progressive Delivery</span>
          {rolloutsNavItems.map((item) => (
            <button
              key={item.page}
              onClick={() => setPage(item.page)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                page === item.page
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <span className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Insights</span>
          {insightsNavItems.map((item) => (
            <button
              key={item.page}
              onClick={() => setPage(item.page)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                page === item.page
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <Separator className="my-3" />

          {secondaryNavItems.map((item) => (
            <button
              key={item.page}
              onClick={() => setPage(item.page)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                page === item.page
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t p-3 space-y-1">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
          <span className="block px-3 text-[11px] text-muted-foreground">v0.1.0</span>
        </div>
      </aside>

      {/* Main content */}
      <main key={projectKey} className="flex-1 overflow-y-auto bg-background">
        {page === 'updates' && <UpdatesList onPublish={() => setPage('publish')} />}
        {page === 'builds' && <BuildsList onPublish={handlePublishBuild} />}
        {page === 'publish' && (
          <PublishUpdate
            preselectedBuildId={publishBuildId}
            onPublished={() => setPage('updates')}
          />
        )}
        {page === 'adoption' && <Adoption />}
        {page === 'telemetry' && <Telemetry onNavigate={(p) => {
          if (p.startsWith('flags:')) {
            const flagKey = p.slice('flags:'.length)
            setInitialFlagKey(flagKey)
            setPageState('flags')
            window.history.pushState(null, '', `/flags/${encodeURIComponent(flagKey)}`)
          } else {
            setPage(p as Page)
          }
        }} />}
        {page === 'audit' && <AuditLog />}
        {page === 'settings' && <Settings />}
        {page === 'flags' && <FeatureFlags initialFlagKey={initialFlagKey} onFlagSelected={(key) => {
          setInitialFlagKey(key)
          const path = key ? `/flags/${encodeURIComponent(key)}` : '/flags'
          if (window.location.pathname !== path) window.history.pushState(null, '', path)
        }} />}
        {page === 'contexts' && <Contexts />}
        {page === 'guide' && <GettingStarted projectUuid={projects.find(p => p.slug === currentProjectSlug)?.uuid} onNavigate={(p) => setPage(p as Page)} onDismiss={() => { localStorage.setItem(GUIDE_DISMISSED_KEY, '1'); setPage('updates') }} />}
        {page === 'playbooks' && <Playbooks onNavigate={(p) => setPage(p as Page)} />}
        {page === 'rollouts' && <RolloutPolicies defaultTab="executions" />}
        {page === 'policies' && <RolloutPolicies defaultTab="policies" />}
      </main>
    </div>
    </TooltipProvider>
  )
}

export default App
