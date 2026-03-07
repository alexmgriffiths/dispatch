import {
  mockUpdates,
  mockBuilds,
  mockAuditLog,
  mockWebhooks,
  mockBranches,
  mockChannels,
  mockAdoption,
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
  runtime_version: string;
  platform: string;
  update_uuid: string;
  is_rollback: boolean;
  channel: string;
  rollout_percentage: number;
  is_critical: boolean;
  is_enabled: boolean;
  release_message: string;
  expo_config: Record<string, unknown>;
  created_at: string;
  asset_count: number;
  total_size: number;
  group_id: string | null;
  rollback_to_update_id: number | null;
  branch_name: string | null;
  total_downloads: number;
  unique_devices: number;
  runtime_fingerprint: string | null;
  git_commit_hash: string | null;
  git_branch: string | null;
  ci_run_url: string | null;
  build_message: string | null;
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
  build_uuid: string;
  runtime_version: string;
  platform: string;
  git_commit_hash: string | null;
  git_branch: string | null;
  ci_run_url: string | null;
  message: string;
  created_at: string;
  asset_count: number;
  is_published: boolean;
}

export interface PublishBuildPayload {
  channel: string;
  rolloutPercentage: number;
  isCritical: boolean;
  releaseMessage: string;
  groupId?: string;
}

export interface AuditLogRecord {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
  actor_type: "user" | "api_key" | null;
  actor_name: string | null;
}

export interface WebhookRecord {
  id: number;
  url: string;
  events: string[];
  is_active: boolean;
  secret: string | null;
  created_at: string;
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
  created_at: string;
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
        (e) => e.entity_type === "update" && e.entity_id === updateId,
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
      results = results.filter((u) => u.branch_name === params.branch);
    if (params?.runtime_version)
      results = results.filter(
        (u) => u.runtime_version === params.runtime_version,
      );
    if (params?.search) {
      const q = params.search.toLowerCase();
      results = results.filter(
        (u) =>
          u.release_message.toLowerCase().includes(q) ||
          u.update_uuid.toLowerCase().includes(q) ||
          u.runtime_version.toLowerCase().includes(q) ||
          (u.git_commit_hash && u.git_commit_hash.toLowerCase().includes(q)) ||
          (u.git_branch && u.git_branch.toLowerCase().includes(q)),
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

export async function listAuditLog(): Promise<AuditLogRecord[]> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(mockAuditLog);
  }
  const res = await authFetch(`${BASE}/audit-log`);
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
      is_active: true,
      secret: payload.secret || null,
      created_at: new Date().toISOString(),
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
        payload: { event: "update.created", data: {}, timestamp: new Date(now - 120000).toISOString() },
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
        payload: { event: "build.published", data: {}, timestamp: new Date(now - 3600000).toISOString() },
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
        payload: { event: "update.patched", data: {}, timestamp: new Date(now - 7200000).toISOString() },
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
      created_at: new Date().toISOString(),
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

// -- Asset Garbage Collection --

export interface GcStats {
  totalS3Objects: number;
  referencedObjects: number;
  orphanedObjects: number;
  orphanedSizeBytes: number;
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
      referencedObjects: 231,
      orphanedObjects: 16,
      orphanedSizeBytes: 4_812_903,
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
      { id: 1, uuid: "00000000-0000-0000-0000-000000000000", name: "Default", slug: "default", createdAt: new Date().toISOString() },
    ];
  }
  const res = await authFetch(`${BASE}/projects`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createProject(name: string, slug: string): Promise<ProjectRecord> {
  if (USE_MOCK) {
    return { id: Math.floor(Math.random() * 1000), uuid: "00000000-0000-0000-0000-000000000000", name, slug, createdAt: new Date().toISOString() };
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
  const res = await authFetch(`${BASE}/projects/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
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
