import {
  mockUpdates,
  mockBuilds,
  mockAuditLog,
  mockWebhooks,
  mockBranches,
  mockChannels,
  mockAdoption,
  mockFlags,
  getMockFlagDetail,
  getMockFlagEvaluations,
  mockObserveEvents,
} from "./mock";

const BASE = "/v1/ota";
const USE_MOCK = import.meta.env.VITE_MOCK === "true";
const TOKEN_KEY = "dispatch-token";
const PROJECT_KEY = "dispatch-project";

function mockDelay(): Promise<void> {
  return USE_MOCK ? new Promise((r) => setTimeout(r, 1000)) : Promise.resolve();
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getProjectSlug(): string | null {
  return localStorage.getItem(PROJECT_KEY);
}

export function setProjectSlug(slug: string): void {
  localStorage.setItem(PROJECT_KEY, slug);
}

export function clearProjectSlug(): void {
  localStorage.removeItem(PROJECT_KEY);
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const projectSlug = getProjectSlug();
  if (projectSlug) {
    headers.set("X-Project", projectSlug);
  }
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  return res;
}

export interface UpdateRecord {
  id: number;
  runtimeVersion: string;
  platform: string;
  updateUuid: string;
  isRollback: boolean;
  channel: string;
  rolloutPercentage: number;
  isCritical: boolean;
  isEnabled: boolean;
  releaseMessage: string;
  expoConfig: Record<string, unknown>;
  createdAt: string;
  assetCount: number;
  totalSize: number;
  groupId: string | null;
  rollbackToUpdateId: number | null;
  branchName: string | null;
  totalDownloads: number;
  uniqueDevices: number;
  runtimeFingerprint: string | null;
  gitCommitHash: string | null;
  gitBranch: string | null;
  ciRunUrl: string | null;
  buildMessage: string | null;
}

export interface UploadedAsset {
  s3Key: string;
  hashSha256: string;
  hashMd5: string;
  contentType: string;
  fileExtension: string;
}

export interface CreateUpdatePayload {
  runtimeVersion: string;
  platform: string;
  expoConfig: Record<string, unknown>;
  isRollback: boolean;
  channel: string;
  rolloutPercentage: number;
  isCritical: boolean;
  releaseMessage: string;
  assets: {
    s3Key: string;
    hashSha256: string;
    hashMd5: string;
    fileExtension: string;
    contentType: string;
    isLaunchAsset: boolean;
  }[];
}

export interface PatchUpdatePayload {
  rolloutPercentage?: number;
  isEnabled?: boolean;
  isCritical?: boolean;
  releaseMessage?: string;
}

export interface BuildRecord {
  id: number;
  buildUuid: string;
  runtimeVersion: string;
  platform: string;
  gitCommitHash: string | null;
  gitBranch: string | null;
  ciRunUrl: string | null;
  message: string;
  createdAt: string;
  assetCount: number;
  isPublished: boolean;
}

export interface PublishBuildPayload {
  channel: string;
  rolloutPercentage: number;
  isCritical: boolean;
  releaseMessage: string;
  groupId?: string;
  linkedFlags?: { flagId: number; enabled: boolean }[];
}

export interface AuditLogRecord {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  details: Record<string, unknown>;
  createdAt: string;
  actorType: "user" | "api_key" | null;
  actorName: string | null;
}

export interface WebhookRecord {
  id: number;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string | null;
  createdAt: string;
}

export interface WebhookDeliveryRecord {
  id: number;
  webhookId: number;
  event: string;
  payload: Record<string, unknown>;
  status: string; // pending, success, failed
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateWebhookPayload {
  url: string;
  events: string[];
  secret?: string;
}

export interface PatchWebhookPayload {
  isActive?: boolean;
  url?: string;
  events?: string[];
}

export interface UserInfo {
  id: number;
  email: string;
  name: string;
  role: string;
  projectRole: string | null;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface UserListItem {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export interface InviteResponse {
  id: number;
  email: string;
  inviteToken: string;
}

export interface BranchRecord {
  id: number;
  name: string;
  createdAt: string;
}

export interface ChannelRecord {
  name: string;
  branchName: string;
  rolloutBranchName: string | null;
  rolloutPercentage: number;
  createdAt: string;
  minRuntimeVersion: string | null;
}

export interface CreateChannelPayload {
  name: string;
  branchName: string;
}

export interface PatchChannelPayload {
  branchName?: string;
  rolloutBranchName?: string;
  rolloutPercentage?: number;
  minRuntimeVersion?: string;
}

export interface AdoptionBucket {
  bucketTime: string;
  updateId: number;
  downloads: number;
  uniqueDevices: number;
}

export interface DeviceCurrentUpdate {
  updateId: number;
  updateUuid: string;
  runtimeVersion: string;
  channel: string;
  branchName: string | null;
  deviceCount: number;
}

export interface AdoptionResponse {
  timeseries: AdoptionBucket[];
  currentAdoption: DeviceCurrentUpdate[];
}

// -- Setup & Registration --

export interface SetupStatus {
  needsSetup: boolean;
  userCount: number;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  if (USE_MOCK) {
    return { needsSetup: false, userCount: 1 };
  }
  const res = await fetch(`${BASE}/auth/setup-status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function register(
  email: string,
  name: string,
  password: string,
  projectName?: string,
  projectSlug?: string,
): Promise<LoginResponse> {
  if (USE_MOCK) {
    return {
      token: "mock-token",
      user: { id: 1, email, name, role: "admin" },
    };
  }
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, password, projectName, projectSlug }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  if (USE_MOCK) {
    return {
      token: "mock-token",
      user: { id: 1, email, name: "Mock User", role: "admin" },
    };
  }
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMe(): Promise<UserInfo> {
  if (USE_MOCK)
    return {
      id: 1,
      email: "admin@dispatch.dev",
      name: "Mock Admin",
      role: "admin",
      projectRole: "admin",
    };
  const res = await authFetch(`${BASE}/auth/me`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function logout(): Promise<void> {
  if (USE_MOCK) return;
  await authFetch(`${BASE}/auth/logout`, { method: "POST" });
}

export async function inviteUser(
  email: string,
  name: string,
  role: string,
): Promise<InviteResponse> {
  if (USE_MOCK) {
    return { id: 99, email, inviteToken: "mock-invite-token" };
  }
  const res = await authFetch(`${BASE}/auth/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, role }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listUsers(): Promise<UserListItem[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [
      {
        id: 1,
        email: "admin@dispatch.dev",
        name: "Admin",
        role: "admin",
        isActive: true,
        hasPassword: true,
        createdAt: new Date().toISOString(),
      },
    ];
  }
  const res = await authFetch(`${BASE}/auth/users`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function acceptInvite(
  inviteToken: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${BASE}/auth/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken, password }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function getUpdateHistory(
  updateId: number,
): Promise<AuditLogRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    const { mockAuditLog } = await import("./mock");
    return structuredClone(
      mockAuditLog.filter(
        (e) => e.entityType === "update" && e.entityId === updateId,
      ),
    );
  }
  const res = await authFetch(`${BASE}/updates/${updateId}/history`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface UpdateListParams {
  platform?: string;
  channel?: string;
  branch?: string;
  runtime_version?: string;
  search?: string;
}

export async function listUpdates(
  params?: UpdateListParams,
): Promise<UpdateRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    let results = structuredClone(mockUpdates);
    if (params?.platform)
      results = results.filter((u) => u.platform === params.platform);
    if (params?.channel)
      results = results.filter((u) => u.channel === params.channel);
    if (params?.branch)
      results = results.filter((u) => u.branchName === params.branch);
    if (params?.runtime_version)
      results = results.filter(
        (u) => u.runtimeVersion === params.runtime_version,
      );
    if (params?.search) {
      const q = params.search.toLowerCase();
      results = results.filter(
        (u) =>
          u.releaseMessage.toLowerCase().includes(q) ||
          u.updateUuid.toLowerCase().includes(q) ||
          u.runtimeVersion.toLowerCase().includes(q) ||
          (u.gitCommitHash && u.gitCommitHash.toLowerCase().includes(q)) ||
          (u.gitBranch && u.gitBranch.toLowerCase().includes(q)),
      );
    }
    return results;
  }
  const query = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) query.set(k, v);
    }
  }
  const qs = query.toString();
  const res = await authFetch(`${BASE}/updates${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadAssets(files: File[]): Promise<UploadedAsset[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const res = await authFetch(`${BASE}/assets/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createUpdate(
  payload: CreateUpdatePayload,
): Promise<{ id: number; updateUuid: string }> {
  const res = await authFetch(`${BASE}/updates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchUpdate(
  id: number,
  payload: PatchUpdatePayload,
): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/updates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function republishUpdate(
  id: number,
  payload: { channels?: string[]; releaseMessage?: string },
): Promise<{
  updates: { id: number; updateUuid: string; channel: string }[];
  groupId: string;
}> {
  if (USE_MOCK) {
    const groupId = crypto.randomUUID();
    return {
      updates: [
        {
          id: Math.floor(Math.random() * 1000),
          updateUuid: crypto.randomUUID(),
          channel: "production",
        },
      ],
      groupId,
    };
  }
  const res = await authFetch(`${BASE}/updates/${id}/republish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRollback(payload: {
  runtimeVersion: string;
  platform: string;
  channel?: string;
  rollbackToUpdateId?: number;
}): Promise<{ id: number; updateUuid: string }> {
  if (USE_MOCK) {
    return {
      id: Math.floor(Math.random() * 1000),
      updateUuid: crypto.randomUUID(),
    };
  }
  const res = await authFetch(`${BASE}/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listBuilds(): Promise<BuildRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(mockBuilds);
  }
  const res = await authFetch(`${BASE}/builds`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function publishBuild(
  buildId: number,
  payload: PublishBuildPayload,
): Promise<{ updateId: number; updateUuid: string }> {
  if (USE_MOCK) {
    return {
      updateId: Math.floor(Math.random() * 1000),
      updateUuid: crypto.randomUUID(),
    };
  }
  const res = await authFetch(`${BASE}/builds/${buildId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listAuditLog(params?: {
  action?: string;
  entityType?: string;
  entityId?: number;
  limit?: number;
  before?: number;
}): Promise<AuditLogRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(mockAuditLog);
  }
  const qs = new URLSearchParams();
  if (params?.action) qs.set("action", params.action);
  if (params?.entityType) qs.set("entity_type", params.entityType);
  if (params?.entityId != null) qs.set("entity_id", String(params.entityId));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.before != null) qs.set("before", String(params.before));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${BASE}/audit-log${suffix}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listWebhooks(): Promise<WebhookRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(mockWebhooks);
  }
  const res = await authFetch(`${BASE}/webhooks`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWebhook(
  payload: CreateWebhookPayload,
): Promise<WebhookRecord> {
  if (USE_MOCK) {
    return {
      id: Math.floor(Math.random() * 1000),
      url: payload.url,
      events: payload.events,
      isActive: true,
      secret: payload.secret || null,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await authFetch(`${BASE}/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteWebhook(id: number): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/webhooks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function patchWebhook(
  id: number,
  payload: PatchWebhookPayload,
): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/webhooks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function listWebhookDeliveries(
  webhookId: number,
): Promise<WebhookDeliveryRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    const now = Date.now();
    return [
      {
        id: 1,
        webhookId,
        event: "update.created",
        payload: {
          event: "update.created",
          data: {},
          timestamp: new Date(now - 120000).toISOString(),
        },
        status: "success",
        httpStatus: 200,
        responseBody: '{"ok":true}',
        errorMessage: null,
        attempt: 1,
        maxAttempts: 3,
        nextRetryAt: null,
        createdAt: new Date(now - 120000).toISOString(),
        completedAt: new Date(now - 119000).toISOString(),
      },
      {
        id: 2,
        webhookId,
        event: "build.published",
        payload: {
          event: "build.published",
          data: {},
          timestamp: new Date(now - 3600000).toISOString(),
        },
        status: "failed",
        httpStatus: 502,
        responseBody: "Bad Gateway",
        errorMessage: "HTTP 502",
        attempt: 3,
        maxAttempts: 3,
        nextRetryAt: null,
        createdAt: new Date(now - 3600000).toISOString(),
        completedAt: new Date(now - 3500000).toISOString(),
      },
      {
        id: 3,
        webhookId,
        event: "update.patched",
        payload: {
          event: "update.patched",
          data: {},
          timestamp: new Date(now - 7200000).toISOString(),
        },
        status: "success",
        httpStatus: 200,
        responseBody: '{"received":true}',
        errorMessage: null,
        attempt: 2,
        maxAttempts: 3,
        nextRetryAt: null,
        createdAt: new Date(now - 7200000).toISOString(),
        completedAt: new Date(now - 7190000).toISOString(),
      },
    ];
  }
  const res = await authFetch(`${BASE}/webhooks/${webhookId}/deliveries`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Branches --

export async function listBranches(): Promise<BranchRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(mockBranches);
  }
  const res = await authFetch(`${BASE}/branches`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBranch(name: string): Promise<BranchRecord> {
  if (USE_MOCK) {
    return {
      id: Math.floor(Math.random() * 1000),
      name,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await authFetch(`${BASE}/branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteBranch(name: string): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/branches/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

// -- Channels --

export async function listChannels(): Promise<ChannelRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(mockChannels);
  }
  const res = await authFetch(`${BASE}/channels`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createChannel(
  payload: CreateChannelPayload,
): Promise<ChannelRecord> {
  if (USE_MOCK) {
    return {
      name: payload.name,
      branchName: payload.branchName,
      rolloutBranchName: null,
      rolloutPercentage: 0,
      createdAt: new Date().toISOString(),
      minRuntimeVersion: null,
    };
  }
  const res = await authFetch(`${BASE}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchChannel(
  name: string,
  payload: PatchChannelPayload,
): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/channels/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function deleteChannel(name: string): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/channels/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

// -- User Overrides --

export interface UserOverrideRecord {
  id: number;
  projectId: number;
  userId: string;
  branchName: string;
  note: string | null;
  createdAt: string;
}

export interface CreateUserOverridePayload {
  userId: string;
  branchName: string;
  note?: string;
}

export async function listUserOverrides(): Promise<UserOverrideRecord[]> {
  if (USE_MOCK) return [];
  const res = await authFetch(`${BASE}/user-overrides`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createUserOverride(
  payload: CreateUserOverridePayload,
): Promise<UserOverrideRecord> {
  if (USE_MOCK) {
    return {
      id: Math.floor(Math.random() * 1000),
      projectId: 1,
      userId: payload.userId,
      branchName: payload.branchName,
      note: payload.note ?? null,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await authFetch(`${BASE}/user-overrides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteUserOverride(id: number): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/user-overrides/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

// -- Feature Flags --

export interface FeatureFlagRecord {
  id: number;
  name: string;
  key: string;
  flagType: string;
  defaultValue: unknown;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
}

export interface FlagEnvSettingRecord {
  id: number;
  flagId: number;
  channelName: string;
  enabled: boolean;
  defaultValue: unknown;
  createdAt: string;
}

export interface FlagTargetingRuleRecord {
  id: number;
  flagId: number;
  priority: number;
  ruleType: string;
  variantValue: unknown;
  ruleConfig: Record<string, unknown>;
  createdAt: string;
  channelName: string | null;
}

export interface FlagVariationRecord {
  id: number;
  flagId: number;
  value: unknown;
  name: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface FlagListItemRecord extends FeatureFlagRecord {
  envSettings: FlagEnvSettingRecord[];
  rules: FlagTargetingRuleRecord[];
  variations: FlagVariationRecord[];
  evalTotal7d: number;
  evalByChannel7d: Record<string, number>;
}

export interface FlagActiveExecutionRecord {
  executionId: number;
  channel: string;
  policyName: string;
  targetEnabled: boolean;
  currentStage: number;
  status: string;
}

export interface FlagWithDetailsRecord extends FeatureFlagRecord {
  envSettings: FlagEnvSettingRecord[];
  rules: FlagTargetingRuleRecord[];
  variations: FlagVariationRecord[];
  activeExecutions: FlagActiveExecutionRecord[];
}

export interface CreateVariationInput {
  value: unknown;
  name?: string;
  description?: string;
}

export interface CreateFlagPayload {
  name: string;
  key: string;
  flagType?: string;
  defaultValue?: unknown;
  enabled?: boolean;
  description?: string;
  variations?: CreateVariationInput[];
}

export interface PatchFlagPayload {
  name?: string;
  defaultValue?: unknown;
  enabled?: boolean;
  description?: string;
}

export interface PatchEnvSettingPayload {
  enabled?: boolean;
  defaultValue?: unknown;
}

export interface CreateRulePayload {
  priority?: number;
  ruleType: string;
  variantValue: unknown;
  ruleConfig?: Record<string, unknown>;
  channelName?: string;
}

export async function listFlags(): Promise<FlagListItemRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(mockFlags);
  }
  const res = await authFetch(`${BASE}/flags`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getFlag(id: number): Promise<FlagWithDetailsRecord> {
  if (USE_MOCK) {
    await mockDelay();
    const flag = getMockFlagDetail(id);
    if (!flag) throw new Error("Flag not found");
    return flag;
  }
  const res = await authFetch(`${BASE}/flags/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createFlag(
  payload: CreateFlagPayload,
): Promise<FeatureFlagRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: Date.now(),
      name: payload.name,
      key: payload.key,
      flagType: payload.flagType ?? "boolean",
      defaultValue: payload.defaultValue ?? false,
      enabled: payload.enabled ?? false,
      description: payload.description ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByName: "You",
    };
  }
  const res = await authFetch(`${BASE}/flags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchFlag(
  id: number,
  payload: PatchFlagPayload,
): Promise<FeatureFlagRecord> {
  if (USE_MOCK) {
    await mockDelay();
    const flag = getMockFlagDetail(id);
    if (!flag) throw new Error("Flag not found");
    return { ...flag, ...payload, updatedAt: new Date().toISOString() };
  }
  const res = await authFetch(`${BASE}/flags/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteFlag(id: number): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    return;
  }
  const res = await authFetch(`${BASE}/flags/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function createFlagRule(
  flagId: number,
  payload: CreateRulePayload,
): Promise<FlagTargetingRuleRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: Date.now(),
      flagId,
      priority: payload.priority ?? 0,
      ruleType: payload.ruleType,
      variantValue: payload.variantValue,
      ruleConfig: payload.ruleConfig ?? {},
      createdAt: new Date().toISOString(),
      channelName: payload.channelName ?? null,
    };
  }
  const res = await authFetch(`${BASE}/flags/${flagId}/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteFlagRule(
  flagId: number,
  ruleId: number,
): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    return;
  }
  const res = await authFetch(`${BASE}/flags/${flagId}/rules/${ruleId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

export interface PatchRulePayload {
  variantValue?: unknown;
  ruleConfig?: Record<string, unknown>;
  priority?: number;
}

export async function patchFlagRule(
  flagId: number,
  ruleId: number,
  payload: PatchRulePayload,
): Promise<FlagTargetingRuleRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: ruleId,
      flagId,
      priority: payload.priority ?? 0,
      ruleType: "attribute",
      variantValue: payload.variantValue ?? null,
      ruleConfig: payload.ruleConfig ?? {},
      createdAt: new Date().toISOString(),
      channelName: null,
    };
  }
  const res = await authFetch(`${BASE}/flags/${flagId}/rules/${ruleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface PatchVariationPayload {
  value?: unknown;
  name?: string;
  description?: string;
}

export async function patchFlagVariation(
  flagId: number,
  variationId: number,
  payload: PatchVariationPayload,
): Promise<FlagVariationRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: variationId,
      flagId,
      value: payload.value ?? null,
      name: payload.name ?? null,
      description: payload.description ?? null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await authFetch(
    `${BASE}/flags/${flagId}/variations/${variationId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchFlagEnvSetting(
  flagId: number,
  channelName: string,
  payload: PatchEnvSettingPayload,
): Promise<FlagEnvSettingRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: Date.now(),
      flagId,
      channelName,
      enabled: payload.enabled ?? true,
      defaultValue: payload.defaultValue ?? null,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await authFetch(
    `${BASE}/flags/${flagId}/env/${encodeURIComponent(channelName)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Flag Evaluations --

export interface FlagEvaluationDailyCount {
  date: string;
  total: number;
}

export interface FlagEvaluationVariationCount {
  variationId: number | null;
  variationName: string | null;
  total: number;
}

export interface FlagEvaluationSummary {
  total: number;
  daily: FlagEvaluationDailyCount[];
  byVariation: FlagEvaluationVariationCount[];
  lastEvaluatedAt: string | null;
}

export async function getFlagEvaluations(
  flagId: number,
  params?: { days?: number; channel?: string },
): Promise<FlagEvaluationSummary> {
  if (USE_MOCK) {
    await mockDelay();
    return getMockFlagEvaluations(flagId, params?.days ?? 7);
  }
  const qs = new URLSearchParams();
  if (params?.days != null) qs.set("days", String(params.days));
  if (params?.channel) qs.set("channel", params.channel);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${BASE}/flags/${flagId}/evaluations${suffix}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Flag Health --

export interface FlagHealthStatus {
  status: "healthy" | "degraded" | "incident";
  errorRate: number;
  errorRateDelta: number;
  crashFree: number;
  affectedDevices: number;
  lastChecked: string;
}

export interface FlagVariationHealth {
  variationName: string;
  runtimeVersion: string;
  channel: string;
  devices: number;
  errorRate: number;
  errorRateDelta: number;
  crashFree: number;
  status: "healthy" | "degraded" | "incident";
}

export interface FlagHealthResponse {
  summary: FlagHealthStatus;
  variations: FlagVariationHealth[];
}

export async function getFlagHealth(
  flagId: number,
): Promise<FlagHealthResponse | null> {
  if (USE_MOCK) {
    const { getMockFlagHealth } = await import("./mock");
    await mockDelay();
    return getMockFlagHealth(flagId);
  }
  const res = await authFetch(`${BASE}/flags/${flagId}/health`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Contexts --

export interface FlagContextRecord {
  id: number;
  projectId: number;
  targetingKey: string;
  kind: string;
  name: string | null;
  attributes: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  evaluationCount: number;
}

export interface FlagContextEvaluationRecord {
  id: number;
  contextId: number;
  flagId: number;
  flagKey: string;
  flagName: string;
  variationValue: unknown;
  channelName: string | null;
  lastEvaluatedAt: string;
  evaluationCount: number;
}

export interface ListContextsResponse {
  contexts: FlagContextRecord[];
  total: number;
}

export interface ContextDetailResponse {
  context: FlagContextRecord;
  evaluations: FlagContextEvaluationRecord[];
}

export async function listContexts(params?: {
  search?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<ListContextsResponse> {
  if (USE_MOCK) {
    const { mockContexts } = await import("./mock");
    await mockDelay();
    let filtered = [...mockContexts];
    if (params?.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.targetingKey.toLowerCase().includes(q) ||
          (c.name && c.name.toLowerCase().includes(q)) ||
          Object.entries(c.attributes).some(
            ([k, v]) =>
              k.toLowerCase().includes(q) ||
              String(v).toLowerCase().includes(q),
          ),
      );
    }
    if (params?.kind) {
      filtered = filtered.filter((c) => c.kind === params.kind);
    }
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 50;
    return {
      contexts: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.kind) qs.set("kind", params.kind);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${BASE}/contexts${suffix}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getContext(id: number): Promise<ContextDetailResponse> {
  if (USE_MOCK) {
    const { mockContexts, getMockContextEvaluations } = await import("./mock");
    await mockDelay();
    const ctx = mockContexts.find((c) => c.id === id);
    if (!ctx) throw new Error("Context not found");
    return { context: ctx, evaluations: getMockContextEvaluations(id) };
  }
  const res = await authFetch(`${BASE}/contexts/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const CONTEXT_KINDS = [
  "user",
  "device",
  "organization",
  "service",
  "environment",
] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

export interface CreateContextPayload {
  targetingKey: string;
  kind: ContextKind;
  name?: string;
  attributes?: Record<string, unknown>;
}

export async function createContext(
  payload: CreateContextPayload,
): Promise<FlagContextRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: Date.now(),
      projectId: 1,
      targetingKey: payload.targetingKey,
      kind: payload.kind,
      name: payload.name ?? null,
      attributes: payload.attributes ?? {},
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      evaluationCount: 0,
    };
  }
  const res = await authFetch(`${BASE}/contexts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteContext(id: number): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    return;
  }
  const res = await authFetch(`${BASE}/contexts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function listContextKinds(): Promise<string[]> {
  if (USE_MOCK) return ["user", "device", "organization", "service"];
  const res = await authFetch(`${BASE}/contexts/kinds`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- API Keys --

export interface ApiKeyRecord {
  id: number;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreateApiKeyResponse {
  id: number;
  name: string;
  key: string;
  keyPrefix: string;
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [
      {
        id: 1,
        name: "CI/CD Pipeline",
        keyPrefix: "dsp_a1b2c3d4",
        isActive: true,
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        lastUsedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 2,
        name: "Staging Deploy",
        keyPrefix: "dsp_e5f6g7h8",
        isActive: true,
        createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        lastUsedAt: null,
      },
    ];
  }
  const res = await authFetch(`${BASE}/auth/api-keys`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createApiKey(
  name: string,
): Promise<CreateApiKeyResponse> {
  if (USE_MOCK) {
    return {
      id: Math.floor(Math.random() * 1000),
      name,
      key: `dsp_${crypto.randomUUID().replace(/-/g, "")}`,
      keyPrefix: "dsp_mock1234",
    };
  }
  const res = await authFetch(`${BASE}/auth/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function revokeApiKey(id: number): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/auth/api-keys/${id}/revoke`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function deleteApiKey(id: number): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/auth/api-keys/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

// -- Adoption Analytics --

// -- Project Storage Stats --

export interface GcStats {
  totalS3Objects: number;
  totalSizeBytes: number;
  updateAssets: number;
  buildAssets: number;
}

export interface GcRunResult {
  deletedObjects: number;
  freedBytes: number;
}

export async function getGcPreview(): Promise<GcStats> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      totalS3Objects: 247,
      totalSizeBytes: 52_428_800,
      updateAssets: 189,
      buildAssets: 58,
    };
  }
  const res = await authFetch(`${BASE}/gc`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runGc(): Promise<GcRunResult> {
  if (USE_MOCK) {
    return { deletedObjects: 16, freedBytes: 4_812_903 };
  }
  const res = await authFetch(`${BASE}/gc`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Projects --

export interface ProjectRecord {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  createdAt: string;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  if (USE_MOCK) {
    return [
      {
        id: 1,
        uuid: "00000000-0000-0000-0000-000000000000",
        name: "Default",
        slug: "default",
        createdAt: new Date().toISOString(),
      },
    ];
  }
  const res = await authFetch(`${BASE}/projects`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createProject(
  name: string,
  slug: string,
): Promise<ProjectRecord> {
  if (USE_MOCK) {
    return {
      id: Math.floor(Math.random() * 1000),
      uuid: "00000000-0000-0000-0000-000000000000",
      name,
      slug,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await authFetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, slug }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteProject(slug: string): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/projects/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

// -- Segments --

export interface SegmentConditionRecord {
  id: number;
  segmentId: number;
  attribute: string;
  operator: string;
  valuesJson: unknown[];
  sortOrder: number;
}

export interface SegmentRecord {
  id: number;
  projectId: number;
  key: string;
  name: string;
  description: string;
  matchType: string;
  estimatedDevices: number;
  createdAt: string;
  updatedAt: string;
  conditions: SegmentConditionRecord[];
}

export interface SegmentDetailRecord extends SegmentRecord {
  referencedBy: { flagId: number; flagKey: string; flagName: string }[];
}

export interface CreateSegmentPayload {
  name: string;
  key: string;
  description?: string;
  matchType?: string;
  conditions?: { attribute: string; operator: string; values: unknown[] }[];
}

export interface UpdateSegmentPayload {
  name?: string;
  description?: string;
  matchType?: string;
  conditions?: { attribute: string; operator: string; values: unknown[] }[];
}

export async function listSegments(): Promise<SegmentRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    const { MOCK_SEGMENTS } = await import("./mock");
    return MOCK_SEGMENTS.map((s) => ({
      id: s.id,
      projectId: 1,
      key: s.key,
      name: s.name,
      description: s.description,
      matchType: s.matchType,
      estimatedDevices: s.estimatedDevices,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      conditions: s.conditions.map((c, i) => ({
        id: i + 1,
        segmentId: s.id,
        attribute: c.attribute,
        operator: c.operator,
        valuesJson: c.values,
        sortOrder: i,
      })),
    }));
  }
  const res = await authFetch(`${BASE}/segments`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSegment(id: number): Promise<SegmentDetailRecord> {
  if (USE_MOCK) {
    await mockDelay();
    const { MOCK_SEGMENTS } = await import("./mock");
    const s = MOCK_SEGMENTS.find((seg) => seg.id === id);
    if (!s) throw new Error("Segment not found");
    return {
      id: s.id,
      projectId: 1,
      key: s.key,
      name: s.name,
      description: s.description,
      matchType: s.matchType,
      estimatedDevices: s.estimatedDevices,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      conditions: s.conditions.map((c, i) => ({
        id: i + 1,
        segmentId: s.id,
        attribute: c.attribute,
        operator: c.operator,
        valuesJson: c.values,
        sortOrder: i,
      })),
      referencedBy: s.referencedBy
        .filter((r) => r.type === "flag")
        .map((r, i) => ({ flagId: i + 1, flagKey: r.name, flagName: r.name })),
    };
  }
  const res = await authFetch(`${BASE}/segments/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSegment(
  payload: CreateSegmentPayload,
): Promise<SegmentRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: Date.now(),
      projectId: 1,
      key: payload.key,
      name: payload.name,
      description: payload.description ?? "",
      matchType: payload.matchType ?? "all",
      estimatedDevices: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      conditions: (payload.conditions ?? []).map((c, i) => ({
        id: Date.now() + i,
        segmentId: Date.now(),
        attribute: c.attribute,
        operator: c.operator,
        valuesJson: c.values,
        sortOrder: i,
      })),
    };
  }
  const res = await authFetch(`${BASE}/segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateSegment(
  id: number,
  payload: UpdateSegmentPayload,
): Promise<SegmentRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id,
      projectId: 1,
      key: "mock-key",
      name: payload.name ?? "Mock",
      description: payload.description ?? "",
      matchType: payload.matchType ?? "all",
      estimatedDevices: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      conditions: [],
    };
  }
  const res = await authFetch(`${BASE}/segments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSegment(id: number): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    return;
  }
  const res = await authFetch(`${BASE}/segments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// -- Rollout Policies --

export interface RolloutStageThresholdRecord {
  id: number;
  stageId: number;
  metricType: string;
  operator: string;
  value: number;
  action: 'gate' | 'rollback';
}

export interface RolloutPolicyStageRecord {
  id: number;
  policyId: number;
  stageOrder: number;
  percentage: number;
  durationMinutes: number;
  minDevices: number;
  thresholds: RolloutStageThresholdRecord[];
}

export interface RolloutPolicyRecord {
  id: number;
  projectId: number;
  name: string;
  description: string;
  channel: string;
  isActive: boolean;
  healthCheckUrl: string | null;
  healthThresholdMs: number | null;
  createdAt: string;
  updatedAt: string;
  stages: RolloutPolicyStageRecord[];
  activeExecutionCount: number;
}

export interface StageThresholdPayload {
  metricType: string;
  operator?: string;
  value: number;
  action?: string;
}

export interface StagePayload {
  percentage: number;
  durationMinutes?: number;
  minDevices?: number;
  thresholds?: StageThresholdPayload[];
}

export interface CreateRolloutPolicyPayload {
  name: string;
  description?: string;
  channel: string;
  isActive?: boolean;
  healthCheckUrl?: string;
  healthThresholdMs?: number;
  stages: StagePayload[];
}

export interface UpdateRolloutPolicyPayload {
  name?: string;
  description?: string;
  channel?: string;
  isActive?: boolean;
  healthCheckUrl?: string;
  healthThresholdMs?: number;
  stages?: StagePayload[];
}

export async function listRolloutPolicies(): Promise<RolloutPolicyRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [];
  }
  const res = await authFetch(`${BASE}/rollout-policies`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRolloutPolicy(
  id: number,
): Promise<RolloutPolicyRecord> {
  if (USE_MOCK) {
    throw new Error("Not found");
  }
  const res = await authFetch(`${BASE}/rollout-policies/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRolloutPolicy(
  payload: CreateRolloutPolicyPayload,
): Promise<RolloutPolicyRecord> {
  if (USE_MOCK) {
    await mockDelay();
    return {
      id: Date.now(),
      projectId: 1,
      name: payload.name,
      description: payload.description ?? "",
      channel: payload.channel,
      isActive: payload.isActive ?? true,
      healthCheckUrl: payload.healthCheckUrl ?? null,
      healthThresholdMs: payload.healthThresholdMs ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stages: payload.stages.map((s, i) => ({
        id: Date.now() + i,
        policyId: Date.now(),
        stageOrder: i + 1,
        percentage: s.percentage,
        durationMinutes: s.durationMinutes ?? 60,
      })),
      activeExecutionCount: 0,
    };
  }
  const res = await authFetch(`${BASE}/rollout-policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRolloutPolicy(
  id: number,
  payload: UpdateRolloutPolicyPayload,
): Promise<RolloutPolicyRecord> {
  if (USE_MOCK) {
    throw new Error("Not found");
  }
  const res = await authFetch(`${BASE}/rollout-policies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteRolloutPolicy(id: number): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/rollout-policies/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function addExecutionFlag(
  executionId: number,
  flagId: number,
  linkType?: string,
): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(`${BASE}/rollout-executions/${executionId}/flags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flagId, linkType }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function removeExecutionFlag(
  executionId: number,
  flagId: number,
): Promise<void> {
  if (USE_MOCK) return;
  const res = await authFetch(
    `${BASE}/rollout-executions/${executionId}/flags/${flagId}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await res.text());
}

// -- Rollout Executions --

export interface RolloutExecutionRecord {
  id: number;
  projectId: number;
  policyId: number;
  updateGroupId: string;
  channel: string;
  currentStage: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  pausedAt: string | null;
  policyName: string;
  stageCount: number;
  currentPercentage: number;
  linkedFlagCount: number;
  crashRate: number;
  jsErrorRate: number;
  uniqueDevices: number;
  worstFlagStatus: string | null;
}

export interface RolloutStageHistoryRecord {
  id: number;
  executionId: number;
  stageOrder: number;
  percentage: number;
  startedAt: string;
  completedAt: string | null;
  healthStatus: string | null;
  gateReason: string | null;
}

export interface ExecutionHealthMetrics {
  crashRate: number;
  jsErrorRate: number;
  appLaunches: number;
  uniqueDevices: number;
}

export interface LinkedFlagRecord {
  id: number;
  key: string;
  name: string;
  flagType: string;
  linkType: string;
  enabled: boolean;
  variationName: string | null;
  variationValue: unknown;
  triggeredAt: string | null;
  health: {
    errorRate: number;
    errorRateDelta: number | null;
    crashFree: number;
    status: string;
  } | null;
}

export interface RolloutExecutionDetailRecord {
  id: number;
  projectId: number;
  policyId: number;
  updateGroupId: string;
  channel: string;
  currentStage: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  pausedAt: string | null;
  lastEvaluatedAt: string | null;
  rollbackReason: string | null;
  policyName: string;
  releaseNotes: string;
  stages: RolloutPolicyStageRecord[];
  history: RolloutStageHistoryRecord[];
  health: ExecutionHealthMetrics;
  linkedFlags: LinkedFlagRecord[];
}

export async function listRolloutExecutions(
  status?: string,
): Promise<RolloutExecutionRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [];
  }
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await authFetch(`${BASE}/rollout-executions${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRolloutExecution(
  id: number,
): Promise<RolloutExecutionDetailRecord> {
  if (USE_MOCK) {
    throw new Error("Not found");
  }
  const res = await authFetch(`${BASE}/rollout-executions/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function pauseExecution(
  id: number,
): Promise<RolloutExecutionRecord> {
  if (USE_MOCK) {
    throw new Error("Not found");
  }
  const res = await authFetch(`${BASE}/rollout-executions/${id}/pause`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resumeExecution(
  id: number,
): Promise<RolloutExecutionRecord> {
  if (USE_MOCK) {
    throw new Error("Not found");
  }
  const res = await authFetch(`${BASE}/rollout-executions/${id}/resume`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cancelExecution(
  id: number,
): Promise<RolloutExecutionRecord> {
  if (USE_MOCK) {
    throw new Error("Not found");
  }
  const res = await authFetch(`${BASE}/rollout-executions/${id}/cancel`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function advanceExecution(
  id: number,
): Promise<RolloutExecutionRecord> {
  if (USE_MOCK) {
    throw new Error("Not found");
  }
  const res = await authFetch(`${BASE}/rollout-executions/${id}/advance`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function revertExecutionFlag(
  executionId: number,
  flagId: number,
): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    return;
  }
  const res = await authFetch(
    `${BASE}/rollout-executions/${executionId}/flags/${flagId}/revert`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await res.text());
}

// -- Telemetry --

export interface TelemetryDailyPoint {
  date: string;
  errorRate: number;
  crashFree: number;
  flagEvals: number;
  updates: number;
}

export interface TelemetryFlagImpact {
  flagId: number;
  flagKey: string;
  flagName: string;
  variationName: string;
  runtimeVersion: string;
  channel: string;
  devices: number;
  errorRate: number;
  errorRateDelta: number;
  crashFree: number;
}

export interface TelemetryEvent {
  id: number;
  timestamp: string;
  type: "crash_spike" | "error_spike" | "latency_spike" | "adoption_drop";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  linkedFlag: { id: number; key: string; variation: string } | null;
  linkedUpdate: { id: number; runtimeVersion: string } | null;
  affectedDevices: number;
  status: "incident" | "degraded" | "healthy";
}

export async function getTelemetryTimeseries(opts?: {
  days?: number;
  channel?: string;
  flagKey?: string;
}): Promise<TelemetryDailyPoint[]> {
  if (USE_MOCK) {
    await mockDelay();
    const days = opts?.days ?? 14;
    const data: TelemetryDailyPoint[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const spikeMultiplier = d >= 4 && d <= 6 ? 2.5 : 1;
      data.push({
        date: date.toISOString().slice(0, 10),
        errorRate: parseFloat(
          (0.8 + Math.random() * 0.4 * spikeMultiplier).toFixed(2),
        ),
        crashFree: parseFloat(
          (99.5 - Math.random() * 0.3 * spikeMultiplier).toFixed(2),
        ),
        flagEvals: Math.floor(12000 + Math.random() * 5000),
        updates: Math.floor(800 + Math.random() * 400),
      });
    }
    return data;
  }
  const params = new URLSearchParams();
  if (opts?.days) params.set("days", String(opts.days));
  if (opts?.channel) params.set("channel", opts.channel);
  if (opts?.flagKey) params.set("flag_key", opts.flagKey);
  const res = await authFetch(`${BASE}/telemetry/timeseries?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTelemetryFlagImpacts(opts?: {
  channel?: string;
  flagKey?: string;
}): Promise<TelemetryFlagImpact[]> {
  if (USE_MOCK) {
    await mockDelay();
    return [
      {
        flagId: 1, flagKey: "new-checkout-flow", flagName: "New Checkout Flow",
        variationName: "On", runtimeVersion: "2.4.1", channel: "production",
        devices: 1247, errorRate: 1.2, errorRateDelta: 0.4, crashFree: 99.1,
      },
      {
        flagId: 2, flagKey: "checkout-layout", flagName: "Checkout Layout",
        variationName: "Single Page", runtimeVersion: "2.4.1", channel: "production",
        devices: 3420, errorRate: 0.6, errorRateDelta: -0.2, crashFree: 99.7,
      },
      {
        flagId: 2, flagKey: "checkout-layout", flagName: "Checkout Layout",
        variationName: "Accordion", runtimeVersion: "2.3.9", channel: "canary",
        devices: 23, errorRate: 3.8, errorRateDelta: 3.0, crashFree: 97.2,
      },
      {
        flagId: 3, flagKey: "max-retry-count", flagName: "Max Retry Count",
        variationName: "5 retries", runtimeVersion: "2.4.1", channel: "production",
        devices: 893, errorRate: 0.3, errorRateDelta: -0.5, crashFree: 99.9,
      },
      {
        flagId: 5, flagKey: "api-config", flagName: "API Config",
        variationName: "Resilient", runtimeVersion: "2.4.1", channel: "production",
        devices: 620, errorRate: 0.2, errorRateDelta: -0.6, crashFree: 99.95,
      },
    ];
  }
  const params = new URLSearchParams();
  if (opts?.channel) params.set("channel", opts.channel);
  if (opts?.flagKey) params.set("flag_key", opts.flagKey);
  const res = await authFetch(`${BASE}/telemetry/flag-impacts?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTelemetryEvents(opts?: {
  days?: number;
  flagKey?: string;
}): Promise<TelemetryEvent[]> {
  if (USE_MOCK) {
    await mockDelay();
    const daysAgo = (d: number) => {
      const date = new Date();
      date.setDate(date.getDate() - d);
      return date.toISOString();
    };
    return [
      {
        id: 1, timestamp: daysAgo(0), type: "error_spike", severity: "warning",
        title: "Error rate elevated for checkout-layout = Accordion",
        description:
          "Error rate jumped to 3.8% on canary channel devices running the Accordion checkout variant on runtime 2.3.9. Baseline is 0.8%.",
        linkedFlag: { id: 2, key: "checkout-layout", variation: "Accordion" },
        linkedUpdate: { id: 5, runtimeVersion: "2.3.9" },
        affectedDevices: 23, status: "degraded",
      },
      {
        id: 2, timestamp: daysAgo(1), type: "crash_spike", severity: "critical",
        title: "Crash-free rate dropped below 99% for new-checkout-flow = On",
        description:
          "Devices with new checkout flow enabled on update 2.4.1 saw crash-free rate drop to 99.1%. Primarily iOS devices.",
        linkedFlag: { id: 1, key: "new-checkout-flow", variation: "On" },
        linkedUpdate: { id: 1, runtimeVersion: "2.4.1" },
        affectedDevices: 1247, status: "incident",
      },
      {
        id: 3, timestamp: daysAgo(3), type: "latency_spike", severity: "info",
        title: "P95 latency increase on production channel",
        description:
          "API response times increased by 120ms on production. Correlates with the rollout of max-retry-count = 5 retries, which is expected behavior.",
        linkedFlag: { id: 3, key: "max-retry-count", variation: "5 retries" },
        linkedUpdate: null,
        affectedDevices: 893, status: "healthy",
      },
      {
        id: 4, timestamp: daysAgo(5), type: "adoption_drop", severity: "warning",
        title: "Update adoption stalled at 42% for runtime 2.4.1",
        description:
          "Rollout to production channel has stalled. 58% of devices remain on older versions.",
        linkedFlag: null,
        linkedUpdate: { id: 1, runtimeVersion: "2.4.1" },
        affectedDevices: 4823, status: "healthy",
      },
    ];
  }
  const params = new URLSearchParams();
  if (opts?.days) params.set("days", String(opts.days));
  if (opts?.flagKey) params.set("flag_key", opts.flagKey);
  const res = await authFetch(`${BASE}/telemetry/events?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Adoption Analytics --

export async function getAdoption(opts?: {
  days?: number;
  updateId?: number;
  bucket?: string;
}): Promise<AdoptionResponse> {
  if (USE_MOCK) {
    await mockDelay();
    const days = opts?.days ?? 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    const data = structuredClone(mockAdoption);
    data.timeseries = data.timeseries.filter(
      (b) => new Date(b.bucketTime) >= cutoff,
    );
    return data;
  }
  const params = new URLSearchParams();
  if (opts?.days) params.set("days", String(opts.days));
  if (opts?.updateId) params.set("update_id", String(opts.updateId));
  if (opts?.bucket) params.set("bucket", opts.bucket);
  const res = await authFetch(`${BASE}/insights/adoption?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -- Observe (Events / Errors / Crashes) --

export interface ObserveEvent {
  id: number;
  updateUuid: string | null;
  deviceId: string;
  channelName: string | null;
  platform: string;
  runtimeVersion: string;
  eventType: string;
  eventName: string | null;
  eventMessage: string | null;
  count: number;
  flagStates: Record<string, unknown> | null;
  stackTrace: string | null;
  errorName: string | null;
  componentStack: string | null;
  isFatal: boolean;
  tags: Record<string, unknown> | null;
  receivedAt: string;
}

export interface ObserveGroup {
  key: string;
  totalCount: number;
  uniqueDevices: number;
  firstSeen: string;
  lastSeen: string;
}

export interface ObserveListResponse {
  events: ObserveEvent[];
  total: number;
}

export interface ObserveGroupResponse {
  groups: ObserveGroup[];
  total: number;
}

export interface ObserveParams {
  type?: string;
  search?: string;
  channel?: string;
  platform?: string;
  deviceId?: string;
  updateUuid?: string;
  from?: string;
  to?: string;
  groupBy?: string;
  limit?: number;
  offset?: number;
}

export async function listObserveEvents(
  params?: ObserveParams,
): Promise<ObserveListResponse> {
  if (USE_MOCK) {
    await mockDelay();
    let filtered: ObserveEvent[] = structuredClone(mockObserveEvents);
    if (params?.type) filtered = filtered.filter((e: ObserveEvent) => e.eventType === params.type);
    if (params?.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (e: ObserveEvent) =>
          (e.eventMessage?.toLowerCase().includes(q)) ||
          (e.eventName?.toLowerCase().includes(q)),
      );
    }
    if (params?.channel) filtered = filtered.filter((e: ObserveEvent) => e.channelName === params.channel);
    if (params?.platform) filtered = filtered.filter((e: ObserveEvent) => e.platform === params.platform);
    const total = filtered.length;
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 50;
    return { events: filtered.slice(offset, offset + limit), total };
  }
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  if (params?.search) qs.set("search", params.search);
  if (params?.channel) qs.set("channel", params.channel);
  if (params?.platform) qs.set("platform", params.platform);
  if (params?.deviceId) qs.set("device_id", params.deviceId);
  if (params?.updateUuid) qs.set("update_uuid", params.updateUuid);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.groupBy) qs.set("group_by", params.groupBy);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${BASE}/observe/events${suffix}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listObserveGroups(
  params?: ObserveParams,
): Promise<ObserveGroupResponse> {
  if (USE_MOCK) {
    await mockDelay();
    let filtered: ObserveEvent[] = structuredClone(mockObserveEvents);
    if (params?.type) filtered = filtered.filter((e: ObserveEvent) => e.eventType === params.type);
    if (params?.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (e: ObserveEvent) =>
          (e.eventMessage?.toLowerCase().includes(q)) ||
          (e.eventName?.toLowerCase().includes(q)),
      );
    }
    if (params?.channel) filtered = filtered.filter((e: ObserveEvent) => e.channelName === params.channel);
    if (params?.platform) filtered = filtered.filter((e: ObserveEvent) => e.platform === params.platform);
    // Group by message or name
    const groupField = params?.groupBy === "name" ? "eventName" : "eventMessage";
    const groupMap = new Map<string, { totalCount: number; uniqueDevices: Set<string>; firstSeen: string; lastSeen: string }>();
    for (const e of filtered) {
      const key = (groupField === "eventName" ? e.eventName : e.eventMessage) || "(empty)";
      const existing = groupMap.get(key);
      if (existing) {
        existing.totalCount += e.count;
        existing.uniqueDevices.add(e.deviceId);
        if (e.receivedAt < existing.firstSeen) existing.firstSeen = e.receivedAt;
        if (e.receivedAt > existing.lastSeen) existing.lastSeen = e.receivedAt;
      } else {
        groupMap.set(key, {
          totalCount: e.count,
          uniqueDevices: new Set([e.deviceId]),
          firstSeen: e.receivedAt,
          lastSeen: e.receivedAt,
        });
      }
    }
    const groups: ObserveGroup[] = Array.from(groupMap.entries())
      .map(([key, v]) => ({ key, totalCount: v.totalCount, uniqueDevices: v.uniqueDevices.size, firstSeen: v.firstSeen, lastSeen: v.lastSeen }))
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 50;
    return { groups: groups.slice(offset, offset + limit), total: groups.length };
  }
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  if (params?.search) qs.set("search", params.search);
  if (params?.channel) qs.set("channel", params.channel);
  if (params?.platform) qs.set("platform", params.platform);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  qs.set("group_by", params?.groupBy || "message");
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await authFetch(`${BASE}/observe/events${suffix}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
