import { useCallback, useEffect, useState } from 'react'
import Joyride, { ACTIONS, EVENTS, STATUS } from 'react-joyride-react19-compat'
import type { CallBackProps } from 'react-joyride-react19-compat'
import Login from './components/Login'
import Onboarding from './components/Onboarding'
import UpdatesList from './components/UpdatesList'
import BuildsList from './components/BuildsList'
import PublishUpdate from './components/PublishUpdate'
import AuditLog from './components/AuditLog'
import Adoption from './components/Adoption'
import Settings from './components/Settings'
import GettingStarted from './components/GettingStarted'
import Playbooks from './components/Playbooks'
import DispatchLogo from './components/DispatchLogo'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getToken, clearToken, logout, getSetupStatus, listProjects, getProjectSlug, setProjectSlug, clearProjectSlug } from './api/client'
import type { ProjectRecord } from './api/client'
import ProjectSwitcher from './components/ProjectSwitcher'
import { tourSteps } from './tour'
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
  HelpCircle,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Page = 'updates' | 'builds' | 'publish' | 'adoption' | 'audit' | 'settings' | 'guide' | 'playbooks'

const TOUR_SEEN_KEY = 'dispatch-tour-seen'
const GUIDE_DISMISSED_KEY = 'dispatch-guide-dismissed'

const USE_MOCK = import.meta.env.VITE_MOCK === 'true'

function App() {
  const [authed, setAuthed] = useState(() => USE_MOCK || !!getToken())
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [page, setPage] = useState<Page>(() => localStorage.getItem(GUIDE_DISMISSED_KEY) ? 'updates' : 'guide')
  const [publishBuildId, setPublishBuildId] = useState<number | null>(null)
  const [runTour, setRunTour] = useState(() => !localStorage.getItem(TOUR_SEEN_KEY))
  const [tourStep, setTourStep] = useState(0)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [currentProjectSlug, setCurrentProjectSlug] = useState<string>(getProjectSlug() || '')
  const [projectKey, setProjectKey] = useState(0)

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
        })
        .catch(() => {})
    }
  }, [authed])

  const handleTourCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type } = data

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false)
      setTourStep(0)
      localStorage.setItem(TOUR_SEEN_KEY, '1')
      return
    }

    if (type === EVENTS.STEP_AFTER) {
      setTourStep(index + (action === ACTIONS.PREV ? -1 : 1))
    }
  }, [])

  function handleSwitchProject(slug: string) {
    setProjectSlug(slug)
    setCurrentProjectSlug(slug)
    setProjectKey((k) => k + 1)
  }

  async function handleLogout() {
    await logout().catch(() => {})
    clearToken()
    clearProjectSlug()
    setAuthed(false)
    setProjects([])
    setCurrentProjectSlug('')
    setNeedsSetup(null)
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
    return <Login onLogin={() => setAuthed(true)} onSetup={() => setShowSetup(true)} />
  }

  function handlePublishBuild(buildId: number) {
    setPublishBuildId(buildId)
    setPage('publish')
  }

  function handleStartTour() {
    setTourStep(0)
    setRunTour(true)
  }

  const navItems: { id: string; page: Page; label: string; icon: React.ReactNode; onClick?: () => void }[] = [
    { id: 'tour-nav-guide', page: 'guide', label: 'Getting Started', icon: <Rocket className="h-4 w-4" /> },
    { id: 'tour-nav-playbooks', page: 'playbooks', label: 'Playbooks', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'tour-nav-releases', page: 'updates', label: 'Releases', icon: <LayoutGrid className="h-4 w-4" /> },
    { id: 'tour-nav-builds', page: 'builds', label: 'Builds', icon: <Layers className="h-4 w-4" /> },
    { id: 'tour-nav-publish', page: 'publish', label: 'Publish', icon: <Upload className="h-4 w-4" />, onClick: () => { setPublishBuildId(null); setPage('publish') } },
  ]

  const secondaryNavItems: { page: Page; label: string; icon: React.ReactNode }[] = [
    { page: 'adoption', label: 'Adoption', icon: <BarChart3 className="h-4 w-4" /> },
    { page: 'audit', label: 'Audit Log', icon: <FileText className="h-4 w-4" /> },
    { page: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
  ]

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen overflow-hidden">
      <Joyride
        steps={tourSteps}
        run={runTour}
        stepIndex={tourStep}
        continuous
        showSkipButton
        showProgress
        scrollToFirstStep
        disableOverlayClose
        callback={handleTourCallback}
        styles={{
          options: {
            primaryColor: '#635bff',
            zIndex: 10000,
            arrowColor: '#fff',
            backgroundColor: '#fff',
            textColor: '#1a1f36',
          },
          tooltip: { borderRadius: 10, fontSize: 13, padding: '16px 20px' },
          tooltipTitle: { fontSize: 14, fontWeight: 650 },
          tooltipContent: { fontSize: 13, lineHeight: '1.55', color: '#4f566b', padding: '8px 0 0' },
          buttonNext: { borderRadius: 6, fontSize: 12, fontWeight: 550, padding: '6px 14px' },
          buttonBack: { borderRadius: 6, fontSize: 12, fontWeight: 550, color: '#3c4257', marginRight: 8 },
          buttonSkip: { fontSize: 12, color: '#8792a2' },
          spotlight: { borderRadius: 8 },
        }}
        locale={{ back: 'Back', close: 'Got it', last: 'Done', next: 'Next', skip: 'Skip tour' }}
      />

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
          {navItems.map((item) => (
            <button
              key={item.page}
              id={item.id}
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
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleStartTour}>
            <HelpCircle className="h-4 w-4" />
            Tour
          </Button>
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
        {page === 'audit' && <AuditLog />}
        {page === 'settings' && <Settings />}
        {page === 'guide' && <GettingStarted projectUuid={projects.find(p => p.slug === currentProjectSlug)?.uuid} onNavigate={(p) => setPage(p as Page)} onDismiss={() => { localStorage.setItem(GUIDE_DISMISSED_KEY, '1'); setPage('updates') }} />}
        {page === 'playbooks' && <Playbooks onNavigate={(p) => setPage(p as Page)} />}
      </main>
    </div>
    </TooltipProvider>
  )
}

export default App
