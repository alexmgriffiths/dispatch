# Progressive Delivery — UI Manual Test Plan

This document walks a tester through every testable feature from a completely fresh project. Follow each section in order — later tests depend on data created in earlier ones. Do not skip steps.

---

## Section A: Environment Setup (From Zero)

### A1. Start the Server

1. Open a terminal
2. Navigate to the project root directory (the folder containing `Cargo.toml`)
3. Run: `cargo run`
4. Wait until you see a log line indicating the server is listening (e.g., `listening on 0.0.0.0:3000`)
5. Open a web browser and navigate to `http://localhost:3000`
6. You should see the Dispatch dashboard with a welcome modal or a login screen

### A2. Log In / Register

1. If this is a fresh database, the server auto-creates an admin account. Use whatever login method is presented (the default admin credentials or registration flow)
2. After logging in, you should see the sidebar on the left with the **Dispatch** logo at the top

### A3. Create a Project

1. Look at the left sidebar near the top, below the Dispatch logo. There should be a **project switcher** dropdown
2. If no projects exist, you should see a prompt or button to create one. Click it
3. In the create project form:
   - **Name**: Type `Test App`
   - **Slug**: It should auto-generate to `test-app`. Leave it as-is
4. Click the **Create** button
5. **Verify**: The project switcher now shows "Test App" as the selected project

### A4. Create a Branch

Channels require a branch. You must create a branch before creating a channel.

1. In the left sidebar, scroll to the bottom and click **Settings** (gear icon). Note: Settings is only visible to admin users
2. You should see a page with tabs at the top: **Users**, **API Keys**, **Branches & Channels**, **User Targeting**, **Webhooks**, **Storage**
3. Click the **Branches & Channels** tab
4. In the **Branches** section, click the **New Branch** button (top-right area)
5. A form appears. In the **Name** field, type: `main`
6. Click **Create Branch**
7. **Verify**: The branch `main` appears in the branches list

### A5. Create Channels

You need at least one channel. We will create two for thorough testing.

1. Still on the **Branches & Channels** tab in Settings
2. Scroll down to the **Channels** section
3. Click the **New Channel** button
4. A form appears:
   - **Name**: Type `production`
   - **Branch**: Select `main` from the dropdown
5. Click **Create Channel**
6. **Verify**: The channel `production` appears in the channels list

7. Click **New Channel** again
   - **Name**: Type `staging`
   - **Branch**: Select `main` from the dropdown
8. Click **Create Channel**
9. **Verify**: Both `production` and `staging` appear in the channels list

### A6. Create an API Key

You need an API key to upload builds via curl.

1. Still in Settings, click the **API Keys** tab
2. Click the **New API Key** button
3. A form appears:
   - **Name**: Type `test-key`
4. Click **Create**
5. **IMPORTANT**: A key value is displayed. Copy it immediately and save it somewhere (e.g., a text file or clipboard). You will NOT be able to see it again. The key looks something like `dp_xxxxxxxxxxxxx`
6. **Verify**: The key `test-key` appears in the API keys list

### A7. Upload a Build via curl

Builds cannot be created from the UI. You must upload them via the API. Open a new terminal window and run the following commands.

**First, create a dummy JavaScript bundle file to upload:**

```bash
echo 'console.log("hello")' > /tmp/test-bundle.js
```

**Then upload it as a build:**

```bash
curl -X POST http://localhost:3000/api/builds \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -F "runtimeVersion=1.0.0" \
  -F "platform=ios" \
  -F "gitBranch=main" \
  -F "gitCommitHash=abc1234" \
  -F "message=Test build for manual testing" \
  -F "assets=@/tmp/test-bundle.js;type=application/javascript"
```

Replace `YOUR_API_KEY_HERE` with the actual API key you copied in step A6.

**Verify**: You should get a JSON response with an `id` and `buildUuid`. If you get a 401 error, double-check the API key.

**Upload a second build** (we need multiple builds for some tests):

```bash
curl -X POST http://localhost:3000/api/builds \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -F "runtimeVersion=1.0.1" \
  -F "platform=ios" \
  -F "gitBranch=main" \
  -F "gitCommitHash=def5678" \
  -F "message=Second test build" \
  -F "assets=@/tmp/test-bundle.js;type=application/javascript"
```

**Upload a third build** (needed for later rollback tests):

```bash
curl -X POST http://localhost:3000/api/builds \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -F "runtimeVersion=1.0.2" \
  -F "platform=ios" \
  -F "gitBranch=main" \
  -F "gitCommitHash=ghi9012" \
  -F "message=Third test build" \
  -F "assets=@/tmp/test-bundle.js;type=application/javascript"
```

### A8. Verify Builds Appear in the UI

1. Go back to the browser
2. In the left sidebar, under the **OTA Updates** section header, click **Builds**
3. **Verify**: You see three builds listed:
   - `1.0.0` / ios / `abc1234` / "Test build for manual testing"
   - `1.0.1` / ios / `def5678` / "Second test build"
   - `1.0.2` / ios / `ghi9012` / "Third test build"
4. None of them should have a "Published" badge — they are all unpublished

### A9. Create Feature Flags

You need at least two feature flags for the publish and rollback tests.

1. In the left sidebar, under the **Experimentation** section header, click **Feature Flags**
2. You should see an empty state with a flag icon and a button to create a flag
3. Click the **New Flag** button (either in the empty state or in the top-right header area)
4. A dialog titled **"Create flag"** appears with these fields:
   - **Name** (left): Type `Enable Checkout V2`
   - **Key** (right): It auto-fills to `enable-checkout-v2`. Leave it as-is
   - **Description**: Type `Controls the new checkout flow`
   - **Flag type**: Leave as **boolean** (default)
5. Click the **Create** button at the bottom of the dialog
6. **Verify**: The flag "Enable Checkout V2" appears in the flag list. It should show as **enabled** (on) by default

7. Click **New Flag** again to create a second flag:
   - **Name**: Type `Dark Mode`
   - **Key**: Auto-fills to `dark-mode`. Leave it
   - **Description**: Type `Toggles dark mode feature`
   - **Flag type**: Leave as **boolean**
8. Click **Create**
9. **Verify**: Both flags now appear in the list: "Enable Checkout V2" and "Dark Mode"

---

## Test 1: Create a Rollout Policy

**Starting point**: You have completed all of Section A. You have a project with channels, builds, and flags.

**Steps:**

1. In the left sidebar, under the **Progressive Delivery** section header, click **Policies** (shield icon)
2. You should see the Policies list view. Since no policies exist yet, you should see:
   - A Shield icon in the center
   - Text: "No policies"
   - A blue **Create Policy** button
3. Click the **Create Policy** button
4. You should now see the policy creation form:
   - At the top: breadcrumb showing "Rollouts > New Policy"
   - On the **right sidebar**: Name input field, Description textarea, Channel dropdown
   - In the **main area**: A vertical flow starting with a channel card, then a stage card, an "Add stage" circle button, and a dashed "Rollout complete" card at the bottom
   - At the very top-right: a **Cancel** button (outline) and a **Create Policy** button (blue, currently disabled because the name is empty)

5. In the right sidebar:
   - In the **Name** field, type: `Test Production Rollout`
   - In the **Description** field, type: `Gradual rollout for testing`
   - Click the **Channel** dropdown. **Verify** it lists your channels: "production" and "staging" (the ones you created in A5). Select **production**
   - **Verify** the sidebar also shows read-only stats: "Stages" count and "Health Checks" count. There should be NO "Linked Flags" section anywhere on this form

6. In the main area, fill out **Stage 1**:
   - In the "Rollout %" input, type `5`
   - In the "Wait (min)" input, type `1`
   - In the "Min devices" input, type `0`
   - Click the **+ Add health check** button (small ghost button at the bottom of the stage card)
   - A new threshold row appears with: a metric dropdown, a "<" operator, a value input, and an action badge
   - Set the metric dropdown to **crash_rate**
   - Set the value to `2`
   - The action badge should say either "gate" or "auto-rollback". Click it to toggle. Set it to **auto-rollback** (red badge)
   - Click **+ Add health check** again to add a second threshold
   - Set metric to **js_error_rate**, value to `5`, action to **gate** (blue badge)

7. Click the **+** circle button below Stage 1 to add Stage 2:
   - Set Rollout % to `25`
   - Set Wait (min) to `1`
   - Leave Min devices at `0`

8. Click the **+** button again to add Stage 3:
   - Set Rollout % to `100`
   - Leave Wait and Min devices at `0`

9. **Verify** the pipeline preview in the sidebar shows three boxes: `5%` → `25%` → `100%`
10. **Verify** the "Health Checks" stat in the sidebar shows "2 thresholds across all stages"
11. **Verify** the **Create Policy** button at top-right is now enabled (blue)

12. Click **Create Policy**

**Expected result:**
- You are returned to the policy list view
- The policy "Test Production Rollout" appears as a card showing:
  - The policy name
  - A "production" channel badge (outline style)
  - The stage pipeline on the right side: three percentage boxes with arrows between them (5% → 25% → 100%)
  - No "Disabled" badge (the policy is active by default)

---

## Test 2: View and Edit a Policy

**Starting point**: "Test Production Rollout" policy exists from Test 1.

**Steps:**

1. In the left sidebar, click **Policies** (under "Progressive Delivery")
2. Click on the **Test Production Rollout** card in the list
3. **Verify the detail view shows:**
   - Breadcrumb: "Policies > Test Production Rollout"
   - The policy name as the page title
   - An **Edit** button (pencil icon) and a **Delete** button (trash icon, red on hover) in the header
   - A stage pipeline visualization
   - In the right sidebar metadata:
     - **Status**: A green "Active" badge
     - **Created**: A relative time (e.g., "just now")
     - **Stages**: "3"
     - **Thresholds**: A count of health check thresholds

4. Click the **Edit** button (pencil icon)
5. **Verify** you are in the edit form and all fields are pre-populated:
   - Name field shows "Test Production Rollout"
   - Description field shows "Gradual rollout for testing"
   - Channel dropdown shows "production"
   - Three stages with correct percentages (5, 25, 100)
   - Stage 1 has two threshold rows: crash_rate < 2 (auto-rollback) and js_error_rate < 5 (gate)
   - There is NO "Linked Flags" section in the sidebar

6. Change the description to `Updated description for testing`
7. Click **Save Changes** (the button text should say "Save Changes", not "Create Policy")

**Expected result:**
- You are returned to the policy list
- Click back into the policy. The description now shows "Updated description for testing"

---

## Test 3: Policy Active Toggle

**Starting point**: "Test Production Rollout" policy exists.

**Steps:**

1. In the left sidebar, click **Policies** (under "Progressive Delivery")
2. Click on **Test Production Rollout** to open its detail view
3. Find the **Active toggle switch**. It is a toggle/switch UI element near the pipeline visualization area
4. Click the toggle to turn it **OFF**
5. **Verify:**
   - The switch moves to the off position
   - Go back to the policy list (click "Policies" in the breadcrumb or sidebar). The policy card should now show a **"Disabled"** badge next to the channel badge
6. Click back into the policy and toggle it back **ON**
7. **Verify:** The "Disabled" badge disappears from the list view

---

## Test 4: Delete a Policy

**Starting point**: You are on the Policies page.

**Steps:**

1. Click **New Policy** in the header to create a throwaway policy
2. In the right sidebar:
   - Name: `Delete Me`
   - Channel: Select **production**
   - Leave default stage as-is
3. Click **Create Policy**
4. You are returned to the policy list. Click on **Delete Me** to open it
5. Click the **Delete** button (trash icon, turns red on hover)
6. **Verify:** You are returned to the policy list. "Delete Me" is gone. Only "Test Production Rollout" remains

---

## Test 5: Publish a Release with Linked Flags and Policy (Auto-Start Execution)

This test verifies publishing a release with linked flags and a rollout policy. When a release is published to a channel that has an active policy, an execution is auto-started.

**Starting point**: "Test Production Rollout" policy exists, is **active** (toggle ON), and is set to channel "production". Two feature flags exist: "Enable Checkout V2" and "Dark Mode". At least one unpublished build exists.

**Steps:**

1. In the left sidebar, under **OTA Updates**, click **New Release** (upload icon)
2. You should see **Step 1**: heading says "Select builds to include in this release"
3. You should see a list of unpublished builds. Find the build with runtime version `1.0.0` and click its checkbox
4. **Verify:** The build row highlights with a blue border. The **Next** button at the bottom-right becomes enabled
5. Click **Next**

6. You are now on **Step 2**: heading says "Configure delivery, rollout strategy, and flag activation"
7. The page has two panels — a main form on the left and a summary sidebar on the right. In the left panel:
   - **CHANNELS**: You should see checkboxes for "production" and "staging". The "production" checkbox should be checked by default. Leave it checked. Do NOT check "staging"
   - **RELEASE NOTES**: Type `First test release with rollout policy`
   - **INITIAL ROLLOUT**: A slider defaulting to 100%. Leave it as-is (the rollout policy stages will control the actual rollout)
   - **Critical update**: A checkbox. Leave it unchecked
   - Below a horizontal line divider:
   - **ROLLOUT POLICY**: A dropdown button that says "None — instant full deploy". Click it
     - A popover opens with a search input and a list of policies
     - You should see **Test Production Rollout** listed with "production" next to it and the stage percentages "5% → 25% → 100%"
     - Click **Test Production Rollout** to select it
     - The popover closes. The button now shows "Test Production Rollout"
     - Below the dropdown, you should see the stage visualization: three grey rounded pills showing `5%` → `25%` → `100%` with arrow icons between them
   - **FLAG CONFIGURATION**: Below the policy section. Click the **"Add flags to this release..."** button
     - A popover appears with a search input and a list of all your flags
     - You should see two flags:
       - **Enable Checkout V2** — with key `enable-checkout-v2` in monospace text, and a green dot with "On" on the right
       - **Dark Mode** — with key `dark-mode` in monospace text, and a green dot with "On" on the right
     - Click **Enable Checkout V2** to select it. A checkmark appears next to it
     - Click **Dark Mode** to select it as well. A checkmark appears next to it
     - Click anywhere outside the popover to close it
   - **Verify** both flags now appear as cards between the button and the "Add more flags..." text:
     - Each card shows: a Flag icon, the flag name, and an **"Enable"** pill button (green background) on the right
     - Each card also has an **X** button to remove the flag
     - The "Enable" button toggles between "Enable" (green) and "Disable" (grey) on click — leave both as "Enable" for now

8. In the **right sidebar**, verify:
   - Under **RELEASE BUNDLE**: header with a Package icon
   - Under **BUILDS**: The selected build with its platform badge (ios), runtime version (1.0.0), and short commit hash (abc1234)
   - A "Change builds" link
   - Under **CHANNELS**: "production" badge
   - Under **ROLLOUT**: "100%"
   - Under **POLICY**: "Test Production Rollout"
   - Under **FLAGS**: Both flag names listed with "on" in green text

9. Click the **Ship to production** button at the bottom of the sidebar

**Expected result:**
- A green success message appears: "Release shipped: ios to production ({8-character-id})"
- After about 1.5 seconds, the page automatically navigates to the Releases page

10. Now navigate to **Progressive Delivery > Rollouts** in the left sidebar (zap icon)
11. **Verify:**
    - A new execution card appears at the top of the list
    - Status: **active** (blue Zap icon, blue "active" badge)
    - The update group ID is shown as the title
    - Below the title: "Test Production Rollout" (the policy name, clickable)
    - A flag count indicator showing "2 flags linked" with a green Flag icon
    - A progress bar filled to approximately 5% (the first stage percentage), colored blue
    - On the right side: crash rate, JS error rate, and device count (all should be 0)

12. Navigate to **Feature Flags** (sidebar) and click on **Enable Checkout V2** to open its detail
13. **Verify the targeting configuration:**
    - The flag is **On** (switch is toggled on)
    - In the rules chain, a **Percentage rollout** rule now exists on the **production** channel
    - The rule shows two variations with weights: the "true" variation at **5%** and the "false" variation at **95%**
    - This rule was automatically created by the rollout execution
14. Click the **production** channel tab
15. **Verify** the blue active rollout banner appears above the Evaluations panel:
    - Shows "Active rollout in progress"
    - Mentions the policy name, channel, stage, and target state
    - Says "All targeting configuration is locked"
16. **Verify** that targeting controls are disabled: the On/Off switch, the Add Rule button, the default cohort variation chips, and any rule edit/delete buttons are all greyed out or non-interactive
17. Go back to the flag list, click on **Dark Mode**, and verify it also has a **Percentage rollout** rule at **5%** on production

---

## Test 6: Execution Detail View

**Starting point**: You have an active execution from Test 5.

**Steps:**

1. In the left sidebar, click **Rollouts** (under "Progressive Delivery")
2. Click on the active execution card you just created

3. **Verify the header area:**
   - Breadcrumb at top: "Rollouts > {updateGroupId}"
   - Title: the update group ID in large bold text
   - A blue **active** status badge next to the title
   - Below the title: the release notes text "First test release with rollout policy"
   - Below that: "Policy: Test Production Rollout · Started just now"
   - On the right side of the header, three action buttons:
     - **Pause** button (outline style, Pause icon + "Pause" text)
     - **Advance** button (outline style, SkipForward icon + "Advance" text)
     - **Rollback** button (outline style, red text, Undo2 icon + "Rollback" text + ChevronDown icon)

4. **Verify the "Rollout Progress" card:**
   - Title: "Rollout Progress"
   - Three stage indicator bars with arrows between them
   - First bar (5%): blue colored with a pulsing animation (this is the current stage)
   - Second bar (25%): grey/muted (future stage)
   - Third bar (100%): grey/muted (future stage)
   - Below each bar: the percentage label ("5%", "25%", "100%")

5. **Verify the "Health Metrics" card:**
   - Title: "Health Metrics"
   - Four metric cards in a row:
     - **Crash Rate**: shows "0.00%" with a green indicator and threshold text "< 2.0%"
     - **JS Error Rate**: shows "0.00%" with a green indicator
     - **App Launches**: shows "0"
     - **Unique Devices**: shows "0"

6. **Verify the "Linked Feature Flags" card:**
   - Title: Flag icon + "Linked Feature Flags"
   - Two flag entries:
     - Each shows: a green Flag icon, the flag name in bold ("Enable Checkout V2" and "Dark Mode"), the flag key in small monospace text
     - A green "Enabled" badge
     - A flag type badge ("boolean")
     - A **Ban** icon button on the far right (orange on hover) — this is the per-flag revert button

7. **Verify the "Activity" card:**
   - Title: "Activity"
   - At least one entry: a blue Play icon with "Started" text, showing "0% → 5%", with "Execution started" reason and a timestamp

---

## Test 7: Pause and Resume an Execution

**Starting point**: You are viewing the active execution detail from Test 6.

**Steps:**

1. Click the **Pause** button in the header

2. **Verify immediately:**
   - The status badge changes from blue "active" to yellow "paused"
   - The **Pause** button is replaced by a **Resume** button (Play icon + "Resume" text)
   - The current stage indicator bar changes from blue (pulsing) to yellow (static)
   - The **Advance** and **Rollback** buttons remain visible

3. Go back to the Rollouts list (click "Rollouts" in the breadcrumb or sidebar)
4. **Verify** the execution card now shows a yellow Pause icon and a yellow "paused" badge

5. Click back into the execution and click the **Resume** button

6. **Verify:**
   - Status badge returns to blue "active"
   - **Resume** button is replaced by **Pause** button again
   - Current stage bar returns to blue with pulsing animation

---

## Test 8: Manually Advance an Execution

**Starting point**: You are viewing the active execution detail (resumed from Test 7, currently at Stage 1 = 5%).

**Steps:**

1. Click the **Advance** button

2. **Verify immediately:**
   - The first stage bar (5%) turns green (completed)
   - The second stage bar (25%) turns blue with pulsing animation (now current)
   - The percentage labels still show 5%, 25%, 100%
   - The Activity timeline now has a new entry at the top: a green TrendingUp icon with "Advanced" text, showing "5% → 25%"

3. Navigate to **Feature Flags** and click on **Enable Checkout V2**
4. **Verify** the percentage_rollout rule on the production channel now shows **25%** (updated from 5%)
5. Go back to the execution detail

6. Click **Advance** again

7. **Verify:**
   - First two bars are green, third bar (100%) is blue pulsing
   - Activity timeline has another "Advanced" entry: "25% → 100%"

8. Click **Advance** one more time (advancing past the final stage)

9. **Verify:**
   - Status badge changes to green **"completed"**
   - All three stage bars are green
   - The **Pause**, **Advance**, and **Rollback** buttons **disappear** from the header (no actions available on completed executions)
   - Activity timeline has a green CheckCircle entry: "Completed" at "100%"
   - Both linked flags still show green "Enabled" badges (flags are NOT disabled on completion — this is intentional)

10. Navigate to **Feature Flags** and click on **Enable Checkout V2**
11. **Verify:**
    - The percentage_rollout rule that was created by the execution is now **gone** (deleted on completion)
    - The flag is still **On** and serves its default value to all users
    - The active rollout banner is **gone** (no active execution)
    - All targeting controls are re-enabled (you can toggle, add rules, edit variations, etc.)

---

## Test 9: Publish a Second Release (Setup for Rollback Tests)

You need a fresh active execution for the rollback tests. This test creates one. We also set up a mixed flag state so rollback behavior is visible.

**Starting point**: The execution from Tests 5-8 is completed. You still have unpublished builds (1.0.1 and 1.0.2). Both flags are enabled (from the completed execution).

**Steps:**

1. In the left sidebar, click **Feature Flags** (under "Experimentation")
2. **Verify** both flags ("Enable Checkout V2" and "Dark Mode") are still **enabled**
3. Click on **Dark Mode** to open its detail view
4. Find the channel tabs/settings and **disable** it on the **production** channel. This gives us a mixed pre-execution state for rollback testing (Checkout V2 = enabled, Dark Mode = disabled)
5. Go back to the flag list. **Verify** "Enable Checkout V2" is enabled and "Dark Mode" is disabled (on production)
6. In the left sidebar, click **New Release** (under "OTA Updates")
7. Select the build with runtime version `1.0.1`, click **Next**
8. On Step 2:
   - **CHANNELS**: Check **production**
   - **RELEASE NOTES**: Type `Second release for rollback testing`
   - Leave rollout at 100%
   - **ROLLOUT POLICY**: Click the dropdown and select **Test Production Rollout**
   - **FLAG CONFIGURATION**: Click "Add flags to this release...", select both **Enable Checkout V2** and **Dark Mode**, close the popover. Leave both set to **Enable** — this means Dark Mode will be turned ON by the execution (changing from its current disabled state)
9. Click **Ship to production**

10. Navigate to **Rollouts** (sidebar). **Verify** a new active execution appeared at 5%
11. Navigate to **Feature Flags**. **Verify** both flags now show as **enabled** on production (the execution applied the target states immediately)
12. Click on **Dark Mode** to open its detail. **Verify** a percentage_rollout rule exists on the production channel at **5%** (true=5%, false=95%). This rule was created by the execution start
13. Go back to the flag list

---

## Test 10: Flag-Level Rollback (Revert a Single Flag)

**Starting point**: You have the active execution from Test 9 with two linked flags. Both flags are currently enabled on production with percentage_rollout targeting rules at 5% (the execution applied `target_enabled = true` and created rules on start). Before the execution started, "Enable Checkout V2" was enabled and "Dark Mode" was disabled — these are the pre-execution states that will be restored on revert.

**Steps:**

1. In the left sidebar, click **Rollouts** (under "Progressive Delivery")
2. Click on the active execution (the one at 5%, from Test 9)
3. Click the **Rollback** button (the dropdown button with red text: Undo2 icon + "Rollback" + ChevronDown icon)

4. **Verify the rollback popover appears with three sections separated by horizontal lines:**
   - **FLAG-LEVEL** (uppercase label at top):
     - One button per enabled linked flag, each showing:
       - An orange Ban icon on the left
       - "Revert {flagName}" as the main text (e.g., "Revert Dark Mode")
       - "Restore flag to its pre-release state" as subtitle text
   - A horizontal separator line
   - **BUNDLE-LEVEL** (uppercase label):
     - One button: red Package icon + "Roll back release" + "Revert update + restore all flags to pre-release state"
   - A horizontal separator line
   - **CHANNEL-LEVEL** (uppercase label):
     - One button: dark red Layers icon + "Roll back channel" + "Revert all releases on production"

5. Click the flag-level option: **"Revert Dark Mode"** (we pick Dark Mode because its pre-execution state was disabled, so the revert will actually change something visible)

6. **Verify a confirmation dialog appears:**
   - Title: "Revert Dark Mode?"
   - Description: "This will restore Dark Mode to the state it was in before this release started."
   - Two buttons: **Cancel** (left) and a red confirmation button (right) labeled "Revert Override"

7. Click **Revert Override**

8. **Verify in the Linked Feature Flags card:**
   - "Dark Mode" icon changes from a green Flag to a red FlagOff icon
   - Its badge changes from green "Enabled" to red "Disabled"
   - The Ban (revert) button **disappears** for this flag (already reverted)
   - "Enable Checkout V2" still shows green "Enabled" with its Ban button still visible
   - The execution **remains active** — its status badge is still blue "active"

9. Navigate to **Feature Flags** in the sidebar (under "Experimentation")
10. **Verify** "Dark Mode" now shows as **disabled/off** on production (restored to its pre-execution state)
11. Click on **Dark Mode**. **Verify** the percentage_rollout rule that was created by the execution is **gone** (deleted on per-flag revert)
12. Go back to the flag list. Click on **Enable Checkout V2**. **Verify** it still has a percentage_rollout rule at 5% on production (only Dark Mode's rule was deleted, not this one)
13. **Verify** "Enable Checkout V2" is still **enabled/on**

---

## Test 11: Bundle-Level Rollback (Roll Back Entire Release)

**Starting point**: The execution from Test 9 is still active (Dark Mode was reverted in Test 10, Checkout V2 still enabled). Pre-execution states: Checkout V2 = enabled, Dark Mode = disabled.

**Steps:**

1. Navigate back to **Rollouts** (sidebar), click on the active execution
2. Click the **Rollback** dropdown button
3. In the popover, click **"Roll back release"** (under BUNDLE-LEVEL, with the red Package icon)

4. **Verify a confirmation dialog appears:**
   - Title: "Roll back release?"
   - Description: "This will revert the {updateGroupId} update and restore all linked flags to their pre-release state."
   - Two buttons: **Cancel** and a red **Roll Back Release** button

5. Click **Roll Back Release**

6. **Verify:**
   - Status badge changes to red **"rolled_back"**
   - The current stage bar turns red
   - All three action buttons (**Pause**, **Advance**, **Rollback**) **disappear** from the header
   - In the Linked Feature Flags card:
     - Flags show their target state from the execution configuration (both show "Enabled" since that was the configured target)
   - A red warning banner appears below the flags card:
     - AlertTriangle icon + text: "Flags were restored to their pre-release state when rollback was triggered"
   - The Activity timeline shows new entries:
     - A red XCircle "Rolled back" entry

7. Navigate to **Feature Flags** in the sidebar
8. **Verify** flags were restored to their pre-execution states:
   - "Enable Checkout V2" shows as **enabled/on** (it was enabled before the execution)
   - "Dark Mode" shows as **disabled/off** (it was disabled before the execution — same as after Test 10's per-flag revert)
9. Click on **Enable Checkout V2**. **Verify:**
   - The percentage_rollout rule from the execution is **gone** (deleted on rollback)
   - No active rollout banner
   - All targeting controls are re-enabled

---

## Test 12: Feature Flags — Health Panel (Empty State)

**Starting point**: You are on the Feature Flags page.

**Steps:**

1. In the left sidebar, click **Feature Flags** (under "Experimentation")
2. Click on **Enable Checkout V2** (or either flag) to open its detail view
3. Look for the **Health** panel — it is a collapsible section with an Activity icon and "Health" label
4. Click to expand it if collapsed

5. **Verify the empty state shows:**
   - An Activity icon (greyed out)
   - Text: "No health data yet"
   - Text: `Install @appdispatch/react-native in your app to track errors, crashes, and flag-error correlation.`
   - The package name `@appdispatch/react-native` should appear in a code-styled inline badge

---

## Test 13: Feature Flags — Setup Guide

**Steps:**

1. From the Feature Flags page, look for a **Setup Guide** or **SDK Integration** button in the header area or empty state
2. Click it to open the setup guide dialog

3. **Verify the dialog contains four sections, each with a copy button:**
   - **1. Install**: The command should be `npm install @appdispatch/react-native @openfeature/react-sdk`
     - It must say `@appdispatch/react-native`, NOT `@appdispatch/openfeature-provider` or `@appdispatch/health-reporter`
   - **2. Setup provider**: The code should import from `@appdispatch/react-native`:
     ```
     import { DispatchProvider } from '@appdispatch/react-native'
     ```
   - **3. Use in React**: Shows a React hook usage example
   - **4. Server-side (Node.js)**: Also imports from `@appdispatch/react-native`

4. At the bottom of the dialog, there should be a link: "View package on npm →"
   - **Verify** the link URL contains `@appdispatch/react-native`

5. Click any **Copy** button and paste somewhere to verify the content was copied correctly

---

## Test 14: Telemetry Page (Empty State)

**Steps:**

1. In the left sidebar, under the **Insights** section header, click **Telemetry** (activity icon)

2. **Verify the header:**
   - Title: "Telemetry"
   - Subtitle: "Cross-dimensional health metrics across flags, updates, and devices"
   - Three filter dropdowns on the right:
     - **Channel** filter (default: "All channels")
     - **Flag** filter (default: "All flags")
     - **Days** filter (default: "14 days", options: 7 days, 14 days, 30 days)

3. **Verify the summary cards** (four cards in a horizontal row):
   - **Devices tracked**: Shows "0"
   - **Weighted error rate**: Shows "0.00%"
   - **Crash-free rate**: Shows "100.00%" — should have a green-tinted border
   - **Active issues**: Shows "0"

4. **Verify the charts section** (two charts side by side):
   - Left: "Error rate over time" — should be empty/flat with no data
   - Right: "Flag evaluations over time" — should be empty with no data

5. **Verify the "Correlated events" section:**
   - Title: "Correlated events"
   - Should show: "No events match the current filters." (empty state)

6. **Verify the "Flag impact by update" table:**
   - Title: "Flag impact by update"
   - Should show: "No data matches the current filters." (empty state)

---

## Test 15: Policy with Active Execution Guards

This test verifies that policies are protected when an execution is running.

**Starting point**: You need a policy with an active execution. To set this up:

1. First, re-enable both flags: Go to **Feature Flags**, click on each disabled flag, and toggle it back **on**
2. Go to **New Release**, select the build with runtime version `1.0.2`, click **Next**
3. On Step 2: check **production** channel, type release notes "Guard test release", select **Test Production Rollout** as policy, add both flags, click **Ship to production**
4. Navigate to **Rollouts** and verify a new active execution exists

**Now test the guards:**

5. Navigate to **Policies** (sidebar) and click on **Test Production Rollout**

6. **Verify the Active toggle:**
   - The toggle switch should be **greyed out / disabled** (you cannot click it)
   - Hover over the toggle. A tooltip should appear saying something like "Can't deactivate while 1 rollout(s) running"

7. **Verify the Edit button:**
   - Click the **Edit** button (pencil icon)
   - Try to modify the stages
   - Try to save. **Verify** the save is blocked with an error message indicating you cannot modify while an execution is running

8. **Verify the Delete button:**
   - Click the **Delete** button (trash icon)
   - **Verify** the delete is blocked with an error message. The policy should NOT be deleted

---

## Test 16: Completed/Rolled-Back Execution — No Actions

**Starting point**: You should have at least one completed execution (from Test 8) and one rolled-back execution (from Test 11) in the Rollouts list.

**Steps:**

1. In the left sidebar, click **Rollouts**
2. Find and click on the **completed** execution (green CheckCircle icon, green "completed" badge)

3. **Verify:**
   - The status badge shows green "completed"
   - There are **NO action buttons** in the header (no Pause, no Advance, no Rollback)
   - The Activity timeline shows the full history: "Started", "Advanced" entries, and "Completed"

4. Go back to the Rollouts list and click on the **rolled_back** execution (red XCircle icon, red "rolled_back" badge)

5. **Verify:**
   - The status badge shows red "rolled_back"
   - There are **NO action buttons** in the header
   - The Activity timeline shows "Rolled back" entries
   - A red warning banner: "Flags were restored to their pre-release state when rollback was triggered"

---

## Test 17: Search and Filtering

**Steps:**

1. Navigate to **Rollouts** (sidebar)
2. **Verify** there is a search input at the top with placeholder "Search rollouts..."
3. Type part of an update group ID or the word "production"
4. **Verify** the list filters to show only matching executions
5. Clear the search field and verify all executions reappear

6. Click the **Policies** nav item in the sidebar
7. **Verify** the search placeholder changes to "Search policies..."
8. Type `Test` in the search field
9. **Verify** the list filters to show only "Test Production Rollout"
10. Clear the search

---

## Test 18: Cross-Navigation Between Executions and Policies

**Steps:**

1. Navigate to **Rollouts** and click on any execution
2. In the execution detail header, find the policy name text (e.g., "Policy: Test Production Rollout"). It should be a clickable link
3. Click the policy name
4. **Verify** you are navigated to the **policy detail view** for "Test Production Rollout"
5. Click "Policies" in the breadcrumb to go back to the policy list
6. Click **Rollouts** in the left sidebar to go back to the executions list

---

## Test 19: Empty States

These tests verify what the UI shows when there is no data. You can visually check these on a separate fresh project, or simply verify the expected behavior described here.

**Executions empty state:**
- If no executions exist, navigating to **Rollouts** shows: a Zap icon, "No rollouts" heading, and a guidance message

**Policies empty state:**
- If no policies exist, navigating to **Policies** shows: a Shield icon, "No policies" heading, and a **Create Policy** button

**Feature Flags empty state:**
- If no flags exist, navigating to **Feature Flags** shows: a Flag icon, a heading, and a **New Flag** button

**New Release empty state:**
- If no unpublished builds exist, navigating to **New Release** shows: instructions for uploading builds via CLI, including install and publish commands

---

## Test 20: End-to-End Rollback Path (Full Walkthrough)

This is a complete walkthrough from flag setup through rollback with pre-execution state restoration, using only data you create during this test.

**Starting point**: You need at least one unpublished build. If all builds have been published, upload a new one using the curl command from A7 (use runtime version `2.0.0`).

**Steps:**

1. Navigate to **Feature Flags** (sidebar). Set up a known pre-execution state:
   - Click on **Enable Checkout V2** and **disable** it on the **production** channel (so the execution will change it from off → on, and rollback will restore to off)
   - Click on **Dark Mode**, toggle it **on** if off (this flag won't be linked to the release, so it should be unaffected)
   - Go back to the flag list and verify: "Enable Checkout V2" = disabled, "Dark Mode" = enabled (on production)

2. Navigate to **Policies** (sidebar). If "Test Production Rollout" has an active execution blocking it, use it as-is. If not, verify it exists and is active

3. Navigate to **New Release** (sidebar)
4. Select an unpublished build, click **Next**
5. On Step 2:
   - Check **production** channel
   - Release notes: `E2E rollback verification`
   - Select **Test Production Rollout** as rollout policy
   - Add **Enable Checkout V2** under FLAG CONFIGURATION, leave it set to **Enable**
   - Click **Ship to production**

6. Navigate to **Rollouts**. **Verify** a new active execution at 5%
7. Navigate to **Feature Flags**. **Verify** "Enable Checkout V2" is now **enabled/on** (the execution applied the target state immediately)
8. Click on **Enable Checkout V2**. **Verify** a percentage_rollout rule exists on production at **5%** (true=5%, false=95%)
9. Navigate back to **Rollouts** and click into the execution
10. **Verify** "Enable Checkout V2" shows as "Enabled" in the Linked Feature Flags card

11. Click the **Rollback** dropdown (red text button with ChevronDown)
12. Click **"Roll back release"** (BUNDLE-LEVEL, Package icon)
13. In the confirmation dialog, click **Roll Back Release**

14. **Verify in the execution detail:**
    - Status badge: red **"rolled_back"**
    - Current stage bar turned red
    - All action buttons are **gone**
    - Red warning banner: "Flags were restored to their pre-release state when rollback was triggered"
    - Activity timeline shows "Rolled back" entry

15. Navigate to **Feature Flags** (sidebar)
16. **Verify** "Enable Checkout V2" is now **disabled/off** (restored to its pre-execution state — it was disabled before the release)
17. Click on **Enable Checkout V2**. **Verify:**
    - The percentage_rollout rule from the execution is **gone** (deleted on rollback)
    - No active rollout banner
    - All targeting controls are re-enabled
18. **Verify** "Dark Mode" is still **enabled/on** (it was NOT linked to this release, so it was not affected)
