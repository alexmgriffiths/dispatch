import type { Step } from 'react-joyride-react19-compat'

export const tourSteps: Step[] = [
  {
    target: '#tour-nav-releases',
    title: 'Releases',
    content:
      'View all published OTA updates. Each release targets a specific runtime version, platform, and channel.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-builds',
    title: 'Builds',
    content:
      'CI/CD builds appear here automatically after your pipeline uploads them. Builds are staged — not live until you publish them.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-publish',
    title: 'Publish',
    content:
      'Select a build, choose a channel and rollout percentage, then publish it as a live OTA update.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-first-release',
    title: 'Release Row',
    content:
      'Each row is a published update. Tags show platform (iOS/Android), channel (production/staging/canary), and status flags like critical or disabled.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '#tour-controls',
    title: 'Release Controls',
    content:
      "Each release has inline controls: toggle Active to enable/disable delivery, toggle Critical to force immediate updates, and adjust the Rollout slider for gradual percentage-based rollouts.",
    placement: 'left',
    disableBeacon: true,
  },
  {
    target: '#tour-publish-btn',
    title: 'Publish New Update',
    content:
      "Click here to publish a new OTA update from a CI/CD build. You'll choose the channel, rollout percentage, and whether it's critical.",
    placement: 'bottom',
    disableBeacon: true,
  },
]
