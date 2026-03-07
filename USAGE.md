# Dispatch OTA Updates

Self-hosted over-the-air updates for React Native / Expo apps. Works with the standard `expo-updates` client — no custom SDK needed.

## Quick Start

### 1. Configure your app

In your `app.json`:

```json
{
  "expo": {
    "updates": {
      "url": "https://your-server.com/v1/ota/manifest",
      "enabled": true,
      "checkAutomatically": "ON_LOAD"
    },
    "runtimeVersion": "1.0.0"
  }
}
```

Install the client if you haven't:

```bash
npx expo install expo-updates
```

That's it. The standard `expo-updates` package handles everything — checking for updates, downloading assets, and applying them on next launch.

### 2. Set up CI/CD

Copy `examples/ota-deploy.yml` to your app repo at `.github/workflows/ota-deploy.yml`.

Add these to your GitHub repo settings:

| Setting | Where | Value |
|---------|-------|-------|
| `OTA_SERVER_URL` | Variables | `https://your-server.com/v1/ota` |
| `OTA_API_KEY` | Secrets | API key from Dashboard > Settings > API Keys |

Every push to `main` will now:
1. Export your JS bundle for iOS and Android
2. Upload both builds to the server
3. Publish them as a grouped update to the `production` channel

If the push includes native changes (iOS/Android folders, Podfile, gradle files, new packages), the workflow skips OTA and warns you that a full app store build is needed.

### 3. Manual deploys

You can also trigger the workflow manually from GitHub Actions with options for:
- **Channel** — production, staging, or canary
- **Critical** — forces immediate reload instead of waiting for next app launch
- **Rollout %** — deploy to a subset of users (e.g. 10%)
- **Auto-publish** — set to false to upload without publishing (publish later from the dashboard)

---

## Dashboard

The web dashboard is served at the root of your server URL.

### Releases

The main page. Shows all published updates grouped by iOS + Android pairs. For each update you can:

- **Toggle Active** — instantly disable/enable an update
- **Toggle Critical** — mark as must-apply-immediately
- **Adjust Rollout** — drag the slider to control what percentage of devices receive it
- Click any update to open the detail drawer with build info, analytics, and actions

### Builds

Shows uploads from CI/CD that haven't been published yet. Click "Publish" on any build to go to the publish flow (or publish from CI automatically).

### Publish

Select one or both platform builds (iOS/Android), pick channels, set rollout %, and publish. Selecting both platforms groups them into a single release.

### Adoption

Time-series view of downloads and device distribution. Use the time selector (7/14/30/90 days) to zoom in. The stacked bar shows which update each device is currently running.

### Settings

**Branches & Channels** — Channels are what devices connect to (e.g. `production`). Branches are where updates live (e.g. `main`). A channel points to a branch. Change the pointer to instantly promote or roll back all devices on that channel.

**API Keys** — Create keys for CI/CD. Each key gets full API access.

**Webhooks** — Get notified on `build.uploaded`, `build.published`, `update.created`, `update.patched`.

**Team** — Invite members and manage roles.

---

## Key Concepts

### Runtime Version

This determines compatibility between your JS bundle and the native binary. Devices only receive updates that match their runtime version. Bump it whenever you change native dependencies, add native modules, or update Expo SDK.

If you use fingerprint-based versioning (`runtimeVersion: { policy: "fingerprint" }` in app.json), the CI workflow auto-detects this and sends the fingerprint hash.

### Channels & Branches

**Channels** are what the app connects to — set `expo-channel-name` in your app config or it defaults to `production`.

**Branches** are where updates are stored. A channel points to a branch.

This indirection lets you:
- **Promote**: Point `production` from `staging` branch to `main` branch — all production users instantly get the latest `main` update
- **Roll back**: Point `production` back to the previous branch
- **Gradual migration**: Set a rollout branch on a channel at 10% — 10% of users get the new branch, 90% stay on the old one

### Rollout

Two levels of rollout control:

**Per-update**: Set rollout % on individual updates. 50% means half of devices get this specific update.

**Per-channel**: Set a rollout branch on a channel. 20% means 20% of devices on this channel are routed to a different branch entirely.

Both use deterministic bucketing — the same device always gets the same result, so users don't flip between versions on each app launch.

### Critical Updates

Normal updates download in the background and apply on the next cold start. Critical updates force an immediate reload while the user is in the app. Use sparingly — only for security fixes or broken releases.

### Republish & Rollback

From the update detail drawer:
- **Republish** — Clone an existing update to one or more channels. Creates a new update with the same assets (no duplication). Useful for promoting a staging update to production.
- **Rollback to this** — Creates a rollback marker that tells devices to revert to this specific update.

---

## Code Signing (Optional)

For additional security, you can sign manifests so devices verify updates came from you.

1. Generate an RSA key pair:
   ```bash
   openssl genpkey -algorithm RSA -out private-key.pem -pkeyopt rsa_keygen_bits:2048
   openssl rsa -in private-key.pem -pubout -out public-key.pem
   ```

2. Set `PRIVATE_KEY_PATH=./private-key.pem` in your server env

3. Configure the public key in your app's `app.json`:
   ```json
   {
     "expo": {
       "updates": {
         "codeSigningCertificate": "./public-key.pem"
       }
     }
   }
   ```

The server signs manifests automatically when a client requests it.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `S3_BUCKET` | Yes | S3 bucket for assets |
| `S3_BASE_URL` | Yes | Public URL prefix for assets (CloudFront or S3) |
| `S3_REGION` | No | AWS region (default: `us-east-1`) |
| `PRIVATE_KEY_PATH` | No | RSA private key for code signing |
| `HOST` | No | Bind address (default: `0.0.0.0`) |
| `PORT` | No | Server port (default: `9999`) |
| `ADMIN_PASSWORD` | No | Seeds a default admin account on first run |
