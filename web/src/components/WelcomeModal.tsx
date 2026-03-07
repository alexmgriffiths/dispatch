import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import DispatchLogo from './DispatchLogo'
import { Rocket, GitBranch, Layers, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'

const WELCOME_SEEN_KEY = 'dispatch-welcome-seen'

interface Props {
  onClose: () => void
}

const slides = [
  {
    icon: <Rocket className="h-6 w-6" />,
    title: 'Ship updates instantly',
    description:
      'Dispatch delivers OTA updates to your React Native / Expo apps without going through the app store. Push bug fixes, new features, and content changes in seconds.',
  },
  {
    icon: <GitBranch className="h-6 w-6" />,
    title: 'Channels & branches',
    description:
      'Organize releases with channels (production, staging, canary) and branches. Promote or roll back instantly by switching which branch a channel points to.',
  },
  {
    icon: <Layers className="h-6 w-6" />,
    title: 'Gradual rollouts',
    description:
      'Control risk with percentage-based rollouts. Start at 10%, monitor adoption, then ramp to 100%. Roll back to any previous update with one click.',
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: 'Monitor everything',
    description:
      'Track which update every device is running, monitor download trends, and audit every action. Code signing ensures updates are verified end-to-end.',
  },
]

export default function WelcomeModal({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const isLast = step === slides.length - 1

  function handleClose() {
    localStorage.setItem(WELCOME_SEEN_KEY, '1')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden [&>button]:hidden">
        {/* Header with logo */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <DispatchLogo className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight">Welcome to Dispatch</span>
        </div>

        {/* Slide content */}
        <div className="px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 text-primary shrink-0">
              {slides[step].icon}
            </div>
            <div className="space-y-1.5 min-w-0">
              <h3 className="text-sm font-semibold">{slides[step].title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {slides[step].description}
              </p>
            </div>
          </div>
        </div>

        {/* Dots + navigation */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={handleClose}>
                Get Started
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { WELCOME_SEEN_KEY }
