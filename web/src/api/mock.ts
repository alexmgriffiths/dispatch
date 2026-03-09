import type { UpdateRecord, BuildRecord, AuditLogRecord, WebhookRecord, BranchRecord, ChannelRecord, AdoptionResponse, FlagListItemRecord, FlagWithDetailsRecord, FlagTargetingRuleRecord, FlagEvaluationSummary, FlagContextRecord, FlagContextEvaluationRecord } from './client'

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - Math.floor(Math.random() * 12))
  return d.toISOString()
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function sha(): string {
  return Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

export const mockUpdates: UpdateRecord[] = [
  {
    id: 1,
    runtimeVersion: '2.4.1',
    platform: 'ios',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'production',
    rolloutPercentage: 100,
    isCritical: false,
    isEnabled: true,
    releaseMessage: 'Fix crash on login screen for iOS 18 users',
    expoConfig: {},
    createdAt: daysAgo(0),
    assetCount: 12,
    totalSize: 524288,
    groupId: 'grp-001',
    rollbackToUpdateId: null,
    branchName: 'main',
    totalDownloads: 4823,
    uniqueDevices: 1247,
    runtimeFingerprint: 'abc123def456',
    gitCommitHash: sha(),
    gitBranch: 'main',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12200',
    buildMessage: 'Fix crash on login screen for iOS 18 users',
  },
  {
    id: 2,
    runtimeVersion: '2.4.1',
    platform: 'android',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'production',
    rolloutPercentage: 50,
    isCritical: false,
    isEnabled: true,
    releaseMessage: 'Fix crash on login screen for iOS 18 users',
    expoConfig: {},
    createdAt: daysAgo(1),
    assetCount: 14,
    totalSize: 1048576,
    groupId: 'grp-001',
    rollbackToUpdateId: null,
    branchName: 'main',
    totalDownloads: 2156,
    uniqueDevices: 893,
    runtimeFingerprint: 'abc123def456',
    gitCommitHash: sha(),
    gitBranch: 'main',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12201',
    buildMessage: 'Fix crash on login screen for iOS 18 users',
  },
  {
    id: 3,
    runtimeVersion: '2.4.0',
    platform: 'ios',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'production',
    rolloutPercentage: 100,
    isCritical: true,
    isEnabled: true,
    releaseMessage: 'Critical: Fix payment processing double-charge bug',
    expoConfig: {},
    createdAt: daysAgo(3),
    assetCount: 18,
    totalSize: 2097152,
    groupId: 'grp-002',
    rollbackToUpdateId: null,
    branchName: 'main',
    totalDownloads: 312,
    uniqueDevices: 45,
    runtimeFingerprint: 'xyz789ghi012',
    gitCommitHash: sha(),
    gitBranch: 'fix/payment-bug',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12150',
    buildMessage: 'Critical: Fix payment processing double-charge bug',
  },
  {
    id: 4,
    runtimeVersion: '2.4.0',
    platform: 'android',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'production',
    rolloutPercentage: 100,
    isCritical: true,
    isEnabled: true,
    releaseMessage: 'Critical: Fix payment processing double-charge bug',
    expoConfig: {},
    createdAt: daysAgo(5),
    assetCount: 11,
    totalSize: 786432,
    groupId: 'grp-002',
    rollbackToUpdateId: null,
    branchName: 'main',
    totalDownloads: 18430,
    uniqueDevices: 6102,
    runtimeFingerprint: 'xyz789ghi012',
    gitCommitHash: sha(),
    gitBranch: 'fix/payment-bug',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12151',
    buildMessage: 'Critical: Fix payment processing double-charge bug',
  },
  {
    id: 5,
    runtimeVersion: '2.3.9',
    platform: 'ios',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'canary',
    rolloutPercentage: 10,
    isCritical: false,
    isEnabled: true,
    releaseMessage: 'Experimental: New navigation architecture',
    expoConfig: {},
    createdAt: daysAgo(8),
    assetCount: 22,
    totalSize: 3145728,
    groupId: null,
    rollbackToUpdateId: null,
    branchName: 'canary',
    totalDownloads: 87,
    uniqueDevices: 23,
    runtimeFingerprint: 'nav-arch-001',
    gitCommitHash: sha(),
    gitBranch: 'feat/new-nav',
    ciRunUrl: null,
    buildMessage: 'Experimental: New navigation architecture',
  },
  {
    id: 6,
    runtimeVersion: '2.3.8',
    platform: 'ios',
    updateUuid: uuid(),
    isRollback: true,
    channel: 'production',
    rolloutPercentage: 100,
    isCritical: false,
    isEnabled: true,
    releaseMessage: 'Rollback: Reverting broken push notification handler',
    expoConfig: {},
    createdAt: daysAgo(12),
    assetCount: 0,
    totalSize: 0,
    groupId: null,
    rollbackToUpdateId: 7,
    branchName: 'main',
    totalDownloads: 9210,
    uniqueDevices: 3841,
    runtimeFingerprint: null,
    gitCommitHash: null,
    gitBranch: null,
    ciRunUrl: null,
    buildMessage: null,
  },
  {
    id: 7,
    runtimeVersion: '2.3.7',
    platform: 'android',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'production',
    rolloutPercentage: 100,
    isCritical: false,
    isEnabled: false,
    releaseMessage: 'Performance optimizations for list rendering',
    expoConfig: {},
    createdAt: daysAgo(18),
    assetCount: 9,
    totalSize: 655360,
    groupId: 'grp-003',
    rollbackToUpdateId: null,
    branchName: 'main',
    totalDownloads: 15200,
    uniqueDevices: 5430,
    runtimeFingerprint: 'perf-opt-v1',
    gitCommitHash: sha(),
    gitBranch: 'perf/list-rendering',
    ciRunUrl: 'https://github.com/example/app/actions/runs/11900',
    buildMessage: 'Performance optimizations for list rendering',
  },
  {
    id: 8,
    runtimeVersion: '2.3.7',
    platform: 'ios',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'production',
    rolloutPercentage: 25,
    isCritical: false,
    isEnabled: true,
    releaseMessage: 'Performance optimizations for list rendering',
    expoConfig: {},
    createdAt: daysAgo(22),
    assetCount: 16,
    totalSize: 1572864,
    groupId: 'grp-003',
    rollbackToUpdateId: null,
    branchName: 'main',
    totalDownloads: 1340,
    uniqueDevices: 502,
    runtimeFingerprint: 'perf-opt-v1',
    gitCommitHash: sha(),
    gitBranch: 'perf/list-rendering',
    ciRunUrl: 'https://github.com/example/app/actions/runs/11901',
    buildMessage: 'Performance optimizations for list rendering',
  },
  {
    id: 9,
    runtimeVersion: '2.3.5',
    platform: 'android',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'staging',
    rolloutPercentage: 100,
    isCritical: false,
    isEnabled: false,
    releaseMessage: 'Refactored analytics event tracking',
    expoConfig: {},
    createdAt: daysAgo(30),
    assetCount: 10,
    totalSize: 892416,
    groupId: null,
    rollbackToUpdateId: null,
    branchName: 'staging',
    totalDownloads: 560,
    uniqueDevices: 82,
    runtimeFingerprint: 'analytics-v2',
    gitCommitHash: sha(),
    gitBranch: 'refactor/analytics',
    ciRunUrl: null,
    buildMessage: 'Refactored analytics event tracking',
  },
  {
    id: 10,
    runtimeVersion: '2.3.4',
    platform: 'ios',
    updateUuid: uuid(),
    isRollback: false,
    channel: 'production',
    rolloutPercentage: 100,
    isCritical: false,
    isEnabled: true,
    releaseMessage: 'Updated translations for 12 languages',
    expoConfig: {},
    createdAt: daysAgo(45),
    assetCount: 8,
    totalSize: 458752,
    groupId: null,
    rollbackToUpdateId: null,
    branchName: 'main',
    totalDownloads: 22100,
    uniqueDevices: 8901,
    runtimeFingerprint: 'i18n-v3',
    gitCommitHash: sha(),
    gitBranch: 'main',
    ciRunUrl: 'https://github.com/example/app/actions/runs/11500',
    buildMessage: 'Updated translations for 12 languages',
  },
]

export const mockBuilds: BuildRecord[] = [
  {
    id: 1,
    buildUuid: uuid(),
    runtimeVersion: '2.5.0',
    platform: 'ios',
    gitCommitHash: sha(),
    gitBranch: 'feat/push-notifications-v2',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12345',
    message: 'Redesigned push notification preferences screen',
    createdAt: daysAgo(0),
    assetCount: 15,
    isPublished: false,
  },
  {
    id: 2,
    buildUuid: uuid(),
    runtimeVersion: '2.5.0',
    platform: 'android',
    gitCommitHash: sha(),
    gitBranch: 'feat/push-notifications-v2',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12346',
    message: 'Redesigned push notification preferences screen',
    createdAt: daysAgo(0),
    assetCount: 15,
    isPublished: false,
  },
  {
    id: 3,
    buildUuid: uuid(),
    runtimeVersion: '2.4.2',
    platform: 'ios',
    gitCommitHash: sha(),
    gitBranch: 'fix/deep-linking',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12300',
    message: 'Fix deep link handling for universal links',
    createdAt: daysAgo(1),
    assetCount: 12,
    isPublished: false,
  },
  {
    id: 4,
    buildUuid: uuid(),
    runtimeVersion: '2.4.1',
    platform: 'ios',
    gitCommitHash: sha(),
    gitBranch: 'main',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12200',
    message: 'Fix crash on login screen for iOS 18 users',
    createdAt: daysAgo(2),
    assetCount: 12,
    isPublished: true,
  },
  {
    id: 5,
    buildUuid: uuid(),
    runtimeVersion: '2.4.1',
    platform: 'android',
    gitCommitHash: sha(),
    gitBranch: 'main',
    ciRunUrl: 'https://github.com/example/app/actions/runs/12201',
    message: 'New checkout flow with Apple Pay integration',
    createdAt: daysAgo(2),
    assetCount: 14,
    isPublished: true,
  },
  {
    id: 6,
    buildUuid: uuid(),
    runtimeVersion: '2.4.0',
    platform: 'android',
    gitCommitHash: sha(),
    gitBranch: 'release/2.4.0',
    ciRunUrl: null,
    message: 'Release 2.4.0 build',
    createdAt: daysAgo(6),
    assetCount: 11,
    isPublished: true,
  },
]

export const mockAuditLog: AuditLogRecord[] = [
  {
    id: 1,
    action: 'build.uploaded',
    entityType: 'build',
    entityId: 1,
    details: { runtimeVersion: '2.5.0', platform: 'ios', gitBranch: 'feat/push-notifications-v2' },
    createdAt: daysAgo(0),
    actorType: 'api_key',
    actorName: 'CI/CD Pipeline',
  },
  {
    id: 2,
    action: 'build.uploaded',
    entityType: 'build',
    entityId: 2,
    details: { runtimeVersion: '2.5.0', platform: 'android', gitBranch: 'feat/push-notifications-v2' },
    createdAt: daysAgo(0),
    actorType: 'api_key',
    actorName: 'CI/CD Pipeline',
  },
  {
    id: 3,
    action: 'build.published',
    entityType: 'build',
    entityId: 4,
    details: { updateId: 1, channel: 'production', rolloutPercentage: 100, runtimeVersion: '2.4.1', platform: 'ios' },
    createdAt: daysAgo(0),
    actorType: 'api_key',
    actorName: 'CI/CD Pipeline',
  },
  {
    id: 4,
    action: 'update.patched',
    entityType: 'update',
    entityId: 2,
    details: { rolloutPercentage: 50, isEnabled: null, isCritical: null },
    createdAt: daysAgo(1),
    actorType: 'user',
    actorName: 'Alex',
  },
  {
    id: 5,
    action: 'build.published',
    entityType: 'build',
    entityId: 5,
    details: { updateId: 2, channel: 'production', rolloutPercentage: 50, runtimeVersion: '2.4.1', platform: 'android' },
    createdAt: daysAgo(1),
    actorType: 'user',
    actorName: 'Alex',
  },
  {
    id: 6,
    action: 'update.patched',
    entityType: 'update',
    entityId: 4,
    details: { isCritical: true, rolloutPercentage: null, isEnabled: null },
    createdAt: daysAgo(5),
    actorType: 'user',
    actorName: 'Alex',
  },
  {
    id: 7,
    action: 'webhook.created',
    entityType: 'webhook',
    entityId: 1,
    details: { url: 'https://hooks.slack.com/services/T00/B00/xxx', events: ['build.uploaded', 'build.published'] },
    createdAt: daysAgo(10),
    actorType: 'user',
    actorName: 'Alex',
  },
  {
    id: 8,
    action: 'update.patched',
    entityType: 'update',
    entityId: 7,
    details: { isEnabled: false, rolloutPercentage: null, isCritical: null },
    createdAt: daysAgo(18),
    actorType: 'user',
    actorName: 'Alex',
  },
  {
    id: 9,
    action: 'build.uploaded',
    entityType: 'build',
    entityId: 6,
    details: { runtimeVersion: '2.4.0', platform: 'android', gitBranch: 'release/2.4.0' },
    createdAt: daysAgo(6),
    actorType: 'api_key',
    actorName: 'CI/CD Pipeline',
  },
  {
    id: 10,
    action: 'build.published',
    entityType: 'build',
    entityId: 6,
    details: { updateId: 4, channel: 'production', rolloutPercentage: 100, runtimeVersion: '2.4.0', platform: 'android' },
    createdAt: daysAgo(5),
    actorType: 'api_key',
    actorName: 'CI/CD Pipeline',
  },
]

export const mockBranches: BranchRecord[] = [
  { id: 1, name: 'main', createdAt: daysAgo(90) },
  { id: 2, name: 'staging', createdAt: daysAgo(90) },
  { id: 3, name: 'canary', createdAt: daysAgo(60) },
  { id: 4, name: 'hotfix/payment', createdAt: daysAgo(5) },
]

export const mockChannels: ChannelRecord[] = [
  { name: 'production', branchName: 'main', rolloutBranchName: null, rolloutPercentage: 0, createdAt: daysAgo(90), minRuntimeVersion: null },
  { name: 'staging', branchName: 'staging', rolloutBranchName: null, rolloutPercentage: 0, createdAt: daysAgo(90), minRuntimeVersion: null },
  { name: 'canary', branchName: 'canary', rolloutBranchName: 'main', rolloutPercentage: 25, createdAt: daysAgo(60), minRuntimeVersion: null },
]

function generateAdoptionTimeseries(totalDays = 90): AdoptionResponse['timeseries'] {
  const buckets: AdoptionResponse['timeseries'] = []
  const updateIds = [1, 2, 3, 4]
  for (let day = totalDays - 1; day >= 0; day--) {
    const d = new Date()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    for (const uid of updateIds) {
      const age = totalDays - day
      let downloads: number
      if (uid <= 2) {
        const peak = 600
        downloads = Math.floor(peak * Math.pow(age / totalDays, 2) + Math.random() * 80)
      } else if (uid === 3) {
        const peak = 400
        const mid = totalDays / 2
        downloads = Math.floor(peak * Math.exp(-0.5 * Math.pow((age - mid) / (totalDays / 4), 2)) + Math.random() * 50)
      } else {
        downloads = Math.floor(300 * Math.exp(-age * 0.03) + Math.random() * 30)
      }
      buckets.push({
        bucketTime: d.toISOString(),
        updateId: uid,
        downloads: Math.max(5, downloads),
        uniqueDevices: Math.max(2, Math.floor(downloads * 0.6 + Math.random() * 10)),
      })
    }
  }
  return buckets
}

export const mockAdoption: AdoptionResponse = {
  timeseries: generateAdoptionTimeseries(),
  currentAdoption: [
    { updateId: 1, updateUuid: uuid(), runtimeVersion: '2.4.1', channel: 'production', branchName: 'main', deviceCount: 4230 },
    { updateId: 2, updateUuid: uuid(), runtimeVersion: '2.4.1', channel: 'production', branchName: 'main', deviceCount: 3180 },
    { updateId: 4, updateUuid: uuid(), runtimeVersion: '2.4.0', channel: 'production', branchName: 'main', deviceCount: 2850 },
    { updateId: 3, updateUuid: uuid(), runtimeVersion: '2.4.0', channel: 'production', branchName: 'main', deviceCount: 1920 },
    { updateId: 10, updateUuid: uuid(), runtimeVersion: '2.3.4', channel: 'production', branchName: 'main', deviceCount: 890 },
    { updateId: 8, updateUuid: uuid(), runtimeVersion: '2.3.7', channel: 'production', branchName: 'main', deviceCount: 502 },
    { updateId: 5, updateUuid: uuid(), runtimeVersion: '2.3.9', channel: 'canary', branchName: 'canary', deviceCount: 23 },
  ],
}

export const mockWebhooks: WebhookRecord[] = [
  {
    id: 1,
    url: 'https://hooks.slack.com/services/T00/B00/xxx',
    events: ['build.uploaded', 'build.published'],
    isActive: true,
    secret: null,
    createdAt: daysAgo(10),
  },
  {
    id: 2,
    url: 'https://api.example.com/webhooks/ota',
    events: ['build.uploaded', 'build.published', 'update.created', 'update.patched'],
    isActive: false,
    secret: 'whsec_abc123',
    createdAt: daysAgo(30),
  },
]

// ── Feature Flags ──────────────────────────────────────────────────────

const mockFlagVariations = {
  newCheckout: [
    { id: 1, flagId: 1, value: false, name: 'Off', description: 'Feature disabled', sortOrder: 0, createdAt: daysAgo(30) },
    { id: 2, flagId: 1, value: true, name: 'On', description: 'Feature enabled', sortOrder: 1, createdAt: daysAgo(30) },
  ],
  checkoutLayout: [
    { id: 3, flagId: 2, value: 'multi-step', name: 'Multi-step', description: 'Classic multi-page checkout', sortOrder: 0, createdAt: daysAgo(25) },
    { id: 4, flagId: 2, value: 'single-page', name: 'Single Page', description: 'New single-page checkout', sortOrder: 1, createdAt: daysAgo(25) },
    { id: 5, flagId: 2, value: 'accordion', name: 'Accordion', description: 'Accordion-style checkout', sortOrder: 2, createdAt: daysAgo(25) },
  ],
  maxRetries: [
    { id: 6, flagId: 3, value: 3, name: '3 retries', description: null, sortOrder: 0, createdAt: daysAgo(20) },
    { id: 7, flagId: 3, value: 5, name: '5 retries', description: null, sortOrder: 1, createdAt: daysAgo(20) },
    { id: 8, flagId: 3, value: 10, name: '10 retries', description: null, sortOrder: 2, createdAt: daysAgo(20) },
  ],
  darkMode: [
    { id: 9, flagId: 4, value: false, name: 'Off', description: null, sortOrder: 0, createdAt: daysAgo(60) },
    { id: 10, flagId: 4, value: true, name: 'On', description: null, sortOrder: 1, createdAt: daysAgo(60) },
  ],
  apiConfig: [
    { id: 11, flagId: 5, value: { timeout: 5000, retries: 2 }, name: 'Default', description: null, sortOrder: 0, createdAt: daysAgo(15) },
    { id: 12, flagId: 5, value: { timeout: 10000, retries: 5 }, name: 'Resilient', description: 'Higher timeout and retries', sortOrder: 1, createdAt: daysAgo(15) },
  ],
}

const mockRules: FlagTargetingRuleRecord[] = [
  // Flag 1 (new-checkout): 30% rollout on production
  {
    id: 1, flagId: 1, priority: 0, ruleType: 'percentage_rollout', variantValue: null,
    ruleConfig: { rollout: [{ variationId: 1, weight: 70 }, { variationId: 2, weight: 30 }] },
    createdAt: daysAgo(10), channelName: 'production',
  },
  // Flag 1: force-on for internal user list
  {
    id: 2, flagId: 1, priority: 1, ruleType: 'user_list', variantValue: true,
    ruleConfig: { userIds: ['user-alex', 'user-john', 'user-sarah'] },
    createdAt: daysAgo(28), channelName: null,
  },
  // Flag 2 (checkout-layout): attribute match — iOS only gets single-page
  {
    id: 3, flagId: 2, priority: 0, ruleType: 'attribute', variantValue: 'single-page',
    ruleConfig: { conditions: [{ attribute: 'platform', operator: 'eq', values: ['ios'] }] },
    createdAt: daysAgo(20), channelName: 'production',
  },
  // Flag 2: OTA rule — devices on canary branch get accordion
  {
    id: 4, flagId: 2, priority: 1, ruleType: 'ota_update', variantValue: 'accordion',
    ruleConfig: { matchBy: 'branch', branch: 'canary' },
    createdAt: daysAgo(18), channelName: null,
  },
  // Flag 3 (max-retries): devices on runtime version ≥ 2.4.0 get 5 retries
  {
    id: 5, flagId: 3, priority: 0, ruleType: 'ota_update', variantValue: 5,
    ruleConfig: { matchBy: 'runtime_version', version: '2.4.0', operator: 'semver_gte' },
    createdAt: daysAgo(15), channelName: null,
  },
  // Flag 4 (dark-mode): 50/50 rollout on staging
  {
    id: 6, flagId: 4, priority: 0, ruleType: 'percentage_rollout', variantValue: null,
    ruleConfig: { rollout: [{ variationId: 9, weight: 50 }, { variationId: 10, weight: 50 }] },
    createdAt: daysAgo(5), channelName: 'staging',
  },
  // Flag 5 (api-config): attribute match — premium users get resilient config
  {
    id: 7, flagId: 5, priority: 0, ruleType: 'attribute', variantValue: { timeout: 10000, retries: 5 },
    ruleConfig: { conditions: [{ attribute: 'plan', operator: 'in', values: ['pro', 'enterprise'] }, { attribute: 'region', operator: 'neq', values: ['cn'] }] },
    createdAt: daysAgo(10), channelName: 'production',
  },
  // Flag 1 (new-checkout): segment rule — iOS Pro Users get early access
  {
    id: 8, flagId: 1, priority: 2, ruleType: 'segment', variantValue: true,
    ruleConfig: { segmentKey: 'ios-pro-users' },
    createdAt: daysAgo(7), channelName: null,
  },
]

const mockEnvSettings = {
  newCheckout: [
    { id: 1, flagId: 1, channelName: 'production', enabled: true, defaultValue: false, createdAt: daysAgo(30) },
    { id: 2, flagId: 1, channelName: 'staging', enabled: true, defaultValue: true, createdAt: daysAgo(30) },
    { id: 3, flagId: 1, channelName: 'canary', enabled: false, defaultValue: false, createdAt: daysAgo(30) },
  ],
  checkoutLayout: [
    { id: 4, flagId: 2, channelName: 'production', enabled: true, defaultValue: 'multi-step', createdAt: daysAgo(25) },
    { id: 5, flagId: 2, channelName: 'staging', enabled: true, defaultValue: 'single-page', createdAt: daysAgo(25) },
  ],
  maxRetries: [
    { id: 6, flagId: 3, channelName: 'production', enabled: true, defaultValue: 3, createdAt: daysAgo(20) },
  ],
  darkMode: [
    { id: 7, flagId: 4, channelName: 'production', enabled: false, defaultValue: false, createdAt: daysAgo(60) },
    { id: 8, flagId: 4, channelName: 'staging', enabled: true, defaultValue: false, createdAt: daysAgo(5) },
  ],
  apiConfig: [
    { id: 9, flagId: 5, channelName: 'production', enabled: true, defaultValue: { timeout: 5000, retries: 2 }, createdAt: daysAgo(15) },
  ],
}

export const mockFlags: FlagListItemRecord[] = [
  {
    id: 1, name: 'New Checkout Flow', key: 'new-checkout-flow', flagType: 'boolean',
    defaultValue: false, enabled: true, description: 'Enable the redesigned checkout experience with Apple Pay support',
    createdAt: daysAgo(30), updatedAt: daysAgo(2), createdByName: 'Alex',
    envSettings: mockEnvSettings.newCheckout,
    rules: mockRules.filter(r => r.flagId === 1),
    variations: mockFlagVariations.newCheckout,
    evalTotal7d: 14280,
    evalByChannel7d: { production: 12100, staging: 1850, canary: 330 },
  },
  {
    id: 2, name: 'Checkout Layout', key: 'checkout-layout', flagType: 'string',
    defaultValue: 'multi-step', enabled: true, description: 'Controls which checkout layout variant is shown to users',
    createdAt: daysAgo(25), updatedAt: daysAgo(5), createdByName: 'Alex',
    envSettings: mockEnvSettings.checkoutLayout,
    rules: mockRules.filter(r => r.flagId === 2),
    variations: mockFlagVariations.checkoutLayout,
    evalTotal7d: 8920,
    evalByChannel7d: { production: 7600, staging: 1320 },
  },
  {
    id: 3, name: 'Max Retry Count', key: 'max-retry-count', flagType: 'number',
    defaultValue: 3, enabled: true, description: 'Maximum number of API retries before showing error',
    createdAt: daysAgo(20), updatedAt: daysAgo(8), createdByName: 'Sarah',
    envSettings: mockEnvSettings.maxRetries,
    rules: mockRules.filter(r => r.flagId === 3),
    variations: mockFlagVariations.maxRetries,
    evalTotal7d: 22450,
    evalByChannel7d: { production: 22450 },
  },
  {
    id: 4, name: 'Dark Mode', key: 'dark-mode', flagType: 'boolean',
    defaultValue: false, enabled: false, description: 'Toggle dark mode theme across the application',
    createdAt: daysAgo(60), updatedAt: daysAgo(3), createdByName: 'John',
    envSettings: mockEnvSettings.darkMode,
    rules: mockRules.filter(r => r.flagId === 4),
    variations: mockFlagVariations.darkMode,
    evalTotal7d: 5100,
    evalByChannel7d: { production: 3200, staging: 1900 },
  },
  {
    id: 5, name: 'API Config', key: 'api-config', flagType: 'json',
    defaultValue: { timeout: 5000, retries: 2 }, enabled: true, description: 'Configure API client timeout and retry behavior per user segment',
    createdAt: daysAgo(15), updatedAt: daysAgo(1), createdByName: 'Alex',
    envSettings: mockEnvSettings.apiConfig,
    rules: mockRules.filter(r => r.flagId === 5),
    variations: mockFlagVariations.apiConfig,
    evalTotal7d: 31200,
    evalByChannel7d: { production: 31200 },
  },
]

// Deep-clone helper that produces FlagWithDetailsRecord from the list items
export function getMockFlagDetail(id: number): FlagWithDetailsRecord | null {
  const flag = mockFlags.find(f => f.id === id)
  if (!flag) return null
  const { evalTotal7d, evalByChannel7d, ...rest } = structuredClone(flag)
  return { ...rest, activeExecutions: [] }
}

function generateFlagEvalTimeseries(days: number): FlagEvaluationSummary['daily'] {
  const daily: FlagEvaluationSummary['daily'] = []
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date()
    date.setDate(date.getDate() - d)
    date.setHours(0, 0, 0, 0)
    daily.push({
      date: date.toISOString().slice(0, 10),
      total: Math.floor(800 + Math.random() * 600),
    })
  }
  return daily
}

// ── Flag health (mock telemetry data for flag list + detail views) ──────

export interface FlagHealthStatus {
  status: 'healthy' | 'degraded' | 'incident'
  errorRate: number
  errorRateDelta: number // vs baseline, negative = improvement
  crashFree: number
  affectedDevices: number
  lastChecked: string
}

export interface FlagVariationHealth {
  variationName: string
  runtimeVersion: string
  channel: string
  devices: number
  errorRate: number
  errorRateDelta: number
  crashFree: number
  status: 'healthy' | 'degraded' | 'incident'
}

const mockFlagHealthMap: Record<number, { summary: FlagHealthStatus; variations: FlagVariationHealth[] }> = {
  1: {
    summary: { status: 'degraded', errorRate: 1.2, errorRateDelta: 0.4, crashFree: 99.1, affectedDevices: 1247, lastChecked: daysAgo(0) },
    variations: [
      { variationName: 'On', runtimeVersion: '2.4.1', channel: 'production', devices: 1247, errorRate: 1.2, errorRateDelta: 0.4, crashFree: 99.1, status: 'degraded' },
      { variationName: 'Off', runtimeVersion: '2.4.1', channel: 'production', devices: 3580, errorRate: 0.5, errorRateDelta: -0.3, crashFree: 99.8, status: 'healthy' },
      { variationName: 'On', runtimeVersion: '2.4.1', channel: 'staging', devices: 340, errorRate: 0.9, errorRateDelta: 0.1, crashFree: 99.4, status: 'healthy' },
      { variationName: 'Off', runtimeVersion: '2.4.1', channel: 'staging', devices: 510, errorRate: 0.3, errorRateDelta: -0.1, crashFree: 99.9, status: 'healthy' },
      { variationName: 'On', runtimeVersion: '2.4.1', channel: 'canary', devices: 18, errorRate: 2.1, errorRateDelta: 1.3, crashFree: 98.5, status: 'degraded' },
      { variationName: 'Off', runtimeVersion: '2.4.1', channel: 'canary', devices: 42, errorRate: 0.4, errorRateDelta: 0.0, crashFree: 99.8, status: 'healthy' },
    ],
  },
  2: {
    summary: { status: 'incident', errorRate: 3.8, errorRateDelta: 3.0, crashFree: 97.2, affectedDevices: 23, lastChecked: daysAgo(0) },
    variations: [
      { variationName: 'Single Page', runtimeVersion: '2.4.1', channel: 'production', devices: 3420, errorRate: 0.6, errorRateDelta: -0.2, crashFree: 99.7, status: 'healthy' },
      { variationName: 'Multi Step', runtimeVersion: '2.4.1', channel: 'production', devices: 1100, errorRate: 0.7, errorRateDelta: -0.1, crashFree: 99.6, status: 'healthy' },
      { variationName: 'Accordion', runtimeVersion: '2.3.9', channel: 'production', devices: 890, errorRate: 0.9, errorRateDelta: 0.2, crashFree: 99.3, status: 'healthy' },
      { variationName: 'Single Page', runtimeVersion: '2.4.1', channel: 'staging', devices: 280, errorRate: 0.4, errorRateDelta: -0.1, crashFree: 99.8, status: 'healthy' },
      { variationName: 'Multi Step', runtimeVersion: '2.4.1', channel: 'staging', devices: 150, errorRate: 0.5, errorRateDelta: 0.0, crashFree: 99.7, status: 'healthy' },
      { variationName: 'Accordion', runtimeVersion: '2.3.9', channel: 'canary', devices: 23, errorRate: 3.8, errorRateDelta: 3.0, crashFree: 97.2, status: 'incident' },
      { variationName: 'Single Page', runtimeVersion: '2.4.1', channel: 'canary', devices: 12, errorRate: 0.8, errorRateDelta: 0.1, crashFree: 99.5, status: 'healthy' },
    ],
  },
  3: {
    summary: { status: 'healthy', errorRate: 0.3, errorRateDelta: -0.5, crashFree: 99.9, affectedDevices: 893, lastChecked: daysAgo(0) },
    variations: [
      { variationName: '3 retries', runtimeVersion: '2.4.1', channel: 'production', devices: 2100, errorRate: 0.4, errorRateDelta: 0.0, crashFree: 99.8, status: 'healthy' },
      { variationName: '5 retries', runtimeVersion: '2.4.1', channel: 'production', devices: 893, errorRate: 0.3, errorRateDelta: -0.5, crashFree: 99.9, status: 'healthy' },
      { variationName: '3 retries', runtimeVersion: '2.4.1', channel: 'staging', devices: 410, errorRate: 0.3, errorRateDelta: -0.1, crashFree: 99.9, status: 'healthy' },
      { variationName: '5 retries', runtimeVersion: '2.4.1', channel: 'staging', devices: 195, errorRate: 0.2, errorRateDelta: -0.3, crashFree: 99.95, status: 'healthy' },
      { variationName: '3 retries', runtimeVersion: '2.4.1', channel: 'canary', devices: 30, errorRate: 0.6, errorRateDelta: 0.1, crashFree: 99.7, status: 'healthy' },
      { variationName: '5 retries', runtimeVersion: '2.4.1', channel: 'canary', devices: 15, errorRate: 0.5, errorRateDelta: 0.0, crashFree: 99.8, status: 'healthy' },
    ],
  },
  4: {
    summary: { status: 'healthy', errorRate: 0.4, errorRateDelta: 0.0, crashFree: 99.7, affectedDevices: 500, lastChecked: daysAgo(0) },
    variations: [
      { variationName: 'true', runtimeVersion: '2.4.1', channel: 'production', devices: 320, errorRate: 0.4, errorRateDelta: 0.0, crashFree: 99.7, status: 'healthy' },
      { variationName: 'false', runtimeVersion: '2.4.1', channel: 'production', devices: 180, errorRate: 0.3, errorRateDelta: -0.1, crashFree: 99.8, status: 'healthy' },
      { variationName: 'true', runtimeVersion: '2.4.1', channel: 'staging', devices: 95, errorRate: 0.5, errorRateDelta: 0.1, crashFree: 99.6, status: 'healthy' },
      { variationName: 'false', runtimeVersion: '2.4.1', channel: 'staging', devices: 60, errorRate: 0.2, errorRateDelta: -0.2, crashFree: 99.9, status: 'healthy' },
      { variationName: 'true', runtimeVersion: '2.4.1', channel: 'canary', devices: 8, errorRate: 0.7, errorRateDelta: 0.2, crashFree: 99.5, status: 'healthy' },
    ],
  },
  5: {
    summary: { status: 'healthy', errorRate: 0.2, errorRateDelta: -0.6, crashFree: 99.95, affectedDevices: 620, lastChecked: daysAgo(0) },
    variations: [
      { variationName: 'Default', runtimeVersion: '2.4.1', channel: 'production', devices: 3200, errorRate: 0.8, errorRateDelta: 0.0, crashFree: 99.5, status: 'healthy' },
      { variationName: 'Resilient', runtimeVersion: '2.4.1', channel: 'production', devices: 620, errorRate: 0.2, errorRateDelta: -0.6, crashFree: 99.95, status: 'healthy' },
      { variationName: 'Default', runtimeVersion: '2.4.1', channel: 'staging', devices: 450, errorRate: 0.6, errorRateDelta: -0.1, crashFree: 99.6, status: 'healthy' },
      { variationName: 'Resilient', runtimeVersion: '2.4.1', channel: 'staging', devices: 110, errorRate: 0.1, errorRateDelta: -0.4, crashFree: 99.98, status: 'healthy' },
      { variationName: 'Default', runtimeVersion: '2.4.1', channel: 'canary', devices: 25, errorRate: 1.1, errorRateDelta: 0.3, crashFree: 99.2, status: 'healthy' },
      { variationName: 'Resilient', runtimeVersion: '2.4.1', channel: 'canary', devices: 10, errorRate: 0.3, errorRateDelta: -0.2, crashFree: 99.9, status: 'healthy' },
    ],
  },
}

export function getMockFlagHealth(flagId: number): { summary: FlagHealthStatus; variations: FlagVariationHealth[] } | null {
  return mockFlagHealthMap[flagId] ?? null
}

// ── Segments ───────────────────────────────────────────────────────────

export interface MockSegment {
  id: number
  name: string
  key: string
  description: string
  conditions: { attribute: string; operator: string; values: string[] }[]
  matchType: 'all' | 'any'
  referencedBy: { type: 'flag' | 'rollout'; name: string }[]
  estimatedDevices: number
  createdAt: string
  updatedAt: string
}

export const MOCK_SEGMENTS: MockSegment[] = [
  {
    id: 1, name: 'iOS Pro Users', key: 'ios-pro-users',
    description: 'Pro-tier users on iOS devices. Used for early access rollouts.',
    conditions: [
      { attribute: 'platform', operator: 'eq', values: ['ios'] },
      { attribute: 'plan', operator: 'eq', values: ['pro'] },
    ],
    matchType: 'all',
    referencedBy: [{ type: 'flag', name: 'new-checkout-flow' }, { type: 'rollout', name: 'Safe Production Rollout' }],
    estimatedDevices: 1420, createdAt: '2025-02-15T10:00:00Z', updatedAt: '2025-03-01T14:30:00Z',
  },
  {
    id: 2, name: 'Beta Testers', key: 'beta-testers',
    description: 'Devices on the canary branch that have updated within the last 7 days.',
    conditions: [
      { attribute: 'ota.branch', operator: 'eq', values: ['canary'] },
      { attribute: 'ota.updated_within_days', operator: 'lte', values: ['7'] },
    ],
    matchType: 'all',
    referencedBy: [{ type: 'flag', name: 'checkout-layout' }],
    estimatedDevices: 89, createdAt: '2025-02-20T08:00:00Z', updatedAt: '2025-02-20T08:00:00Z',
  },
  {
    id: 3, name: 'Enterprise Accounts', key: 'enterprise-accounts',
    description: 'Organization contexts on the enterprise tier.',
    conditions: [
      { attribute: 'tier', operator: 'in', values: ['enterprise', 'enterprise_plus'] },
    ],
    matchType: 'all', referencedBy: [],
    estimatedDevices: 3200, createdAt: '2025-01-10T12:00:00Z', updatedAt: '2025-03-05T09:00:00Z',
  },
  {
    id: 4, name: 'Recent Android Users', key: 'recent-android-users',
    description: 'Android users running runtime version 2.4.0 or higher.',
    conditions: [
      { attribute: 'platform', operator: 'eq', values: ['android'] },
      { attribute: 'ota.runtime_version', operator: 'semver_gte', values: ['2.4.0'] },
    ],
    matchType: 'all',
    referencedBy: [{ type: 'flag', name: 'api-config' }],
    estimatedDevices: 2100, createdAt: '2025-03-01T16:00:00Z', updatedAt: '2025-03-06T11:00:00Z',
  },
]

// ── Mock Contexts ──────────────────────────────────────────────────────

export const mockContexts: FlagContextRecord[] = [
  {
    id: 1, projectId: 1, targetingKey: 'user-8a3f', kind: 'user', name: 'Jane Cooper',
    attributes: { plan: 'pro', region: 'us-east', locale: 'en', signupDate: '2024-06-15' },
    firstSeenAt: daysAgo(45), lastSeenAt: daysAgo(0), evaluationCount: 1243,
  },
  {
    id: 2, projectId: 1, targetingKey: 'user-b7c2', kind: 'user', name: 'Alex Kim',
    attributes: { plan: 'free', region: 'eu-west', locale: 'ko', signupDate: '2025-01-20' },
    firstSeenAt: daysAgo(30), lastSeenAt: daysAgo(0), evaluationCount: 892,
  },
  {
    id: 3, projectId: 1, targetingKey: 'user-d41e', kind: 'user', name: 'Sarah Chen',
    attributes: { plan: 'pro', region: 'ap-southeast', locale: 'zh', signupDate: '2024-09-02' },
    firstSeenAt: daysAgo(60), lastSeenAt: daysAgo(1), evaluationCount: 2105,
  },
  {
    id: 4, projectId: 1, targetingKey: 'device-x92k', kind: 'device', name: null,
    attributes: { platform: 'ios', osVersion: '17.4', appVersion: '2.4.1', model: 'iPhone 15 Pro' },
    firstSeenAt: daysAgo(20), lastSeenAt: daysAgo(0), evaluationCount: 891,
  },
  {
    id: 5, projectId: 1, targetingKey: 'device-a3f7', kind: 'device', name: null,
    attributes: { platform: 'android', osVersion: '14', appVersion: '2.4.0', model: 'Pixel 8' },
    firstSeenAt: daysAgo(15), lastSeenAt: daysAgo(0), evaluationCount: 567,
  },
  {
    id: 6, projectId: 1, targetingKey: 'device-m88q', kind: 'device', name: null,
    attributes: { platform: 'ios', osVersion: '16.7', appVersion: '2.3.9', model: 'iPhone 14' },
    firstSeenAt: daysAgo(40), lastSeenAt: daysAgo(2), evaluationCount: 1340,
  },
  {
    id: 7, projectId: 1, targetingKey: 'org-acme', kind: 'organization', name: 'Acme Inc',
    attributes: { tier: 'enterprise', seats: 250, industry: 'fintech' },
    firstSeenAt: daysAgo(90), lastSeenAt: daysAgo(0), evaluationCount: 5420,
  },
  {
    id: 8, projectId: 1, targetingKey: 'org-globex', kind: 'organization', name: 'Globex Corp',
    attributes: { tier: 'pro', seats: 42, industry: 'ecommerce' },
    firstSeenAt: daysAgo(55), lastSeenAt: daysAgo(1), evaluationCount: 1890,
  },
  {
    id: 9, projectId: 1, targetingKey: 'user-f92a', kind: 'user', name: 'Marcus Johnson',
    attributes: { plan: 'enterprise', region: 'us-west', locale: 'en', signupDate: '2024-03-10' },
    firstSeenAt: daysAgo(120), lastSeenAt: daysAgo(0), evaluationCount: 3210,
  },
  {
    id: 10, projectId: 1, targetingKey: 'device-p44n', kind: 'device', name: null,
    attributes: { platform: 'android', osVersion: '13', appVersion: '2.4.1', model: 'Samsung Galaxy S24' },
    firstSeenAt: daysAgo(10), lastSeenAt: daysAgo(0), evaluationCount: 234,
  },
  {
    id: 11, projectId: 1, targetingKey: 'svc-payments', kind: 'service', name: 'Payment Service',
    attributes: { version: '3.1.0', environment: 'production', runtime: 'node-20' },
    firstSeenAt: daysAgo(70), lastSeenAt: daysAgo(0), evaluationCount: 18420,
  },
  {
    id: 12, projectId: 1, targetingKey: 'user-k8d1', kind: 'user', name: 'Priya Patel',
    attributes: { plan: 'free', region: 'ap-south', locale: 'hi', signupDate: '2025-02-01' },
    firstSeenAt: daysAgo(8), lastSeenAt: daysAgo(0), evaluationCount: 156,
  },
]

export function getMockContextEvaluations(contextId: number): FlagContextEvaluationRecord[] {
  // Generate plausible evaluations for each context against our mock flags
  const flags = [
    { id: 1, key: 'new-checkout-flow', name: 'New Checkout Flow' },
    { id: 2, key: 'checkout-layout', name: 'Checkout Layout' },
    { id: 3, key: 'max-retry-count', name: 'Max Retry Count' },
    { id: 5, key: 'api-config', name: 'API Config' },
  ]
  // Each context evaluates 2-4 flags
  const count = 2 + (contextId % 3)
  return flags.slice(0, count).map((flag, i) => ({
    id: contextId * 100 + i,
    contextId,
    flagId: flag.id,
    flagKey: flag.key,
    flagName: flag.name,
    variationValue: flag.id === 1 ? true : flag.id === 2 ? 'single-page' : flag.id === 3 ? 3 : { timeout: 5000, retries: 3 },
    channelName: i % 2 === 0 ? 'production' : 'staging',
    lastEvaluatedAt: daysAgo(i),
    evaluationCount: Math.floor(50 + Math.random() * 500),
  }))
}

export function getMockFlagEvaluations(flagId: number, days = 7): FlagEvaluationSummary {
  const flag = mockFlags.find(f => f.id === flagId)
  const variations = flag?.variations ?? []
  const total = Math.floor(5000 + Math.random() * 20000)
  return {
    total,
    daily: generateFlagEvalTimeseries(days),
    byVariation: variations.map((v, i) => ({
      variationId: v.id,
      variationName: v.name,
      total: i === 0 ? Math.floor(total * 0.6) : Math.floor(total * 0.4 / Math.max(1, variations.length - 1)),
    })),
    lastEvaluatedAt: daysAgo(0),
  }
}
