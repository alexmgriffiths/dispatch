use anyhow::{Context, Result, bail};
use console::style;
use indicatif::{ProgressBar, ProgressStyle};
use serde::Deserialize;
use std::path::Path;
use std::process::Command;

use crate::api::{ApiClient, PublishBuildRequest};
use crate::config::{load_credentials, load_project_config};

pub struct PublishOptions {
    pub channel: String,
    pub message: Option<String>,
    pub platform: Option<String>,
    pub rollout: i32,
    pub critical: bool,
    pub no_publish: bool,
    pub runtime_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExpoMetadata {
    #[allow(dead_code)]
    version: u32,
    #[serde(rename = "fileMetadata")]
    file_metadata: FileMetadata,
}

#[derive(Debug, Deserialize)]
struct FileMetadata {
    #[serde(default)]
    ios: BundleMetadata,
    #[serde(default)]
    android: BundleMetadata,
}

#[derive(Debug, Default, Deserialize)]
struct BundleMetadata {
    bundle: Option<String>,
    #[serde(default)]
    assets: Vec<AssetEntry>,
}

#[derive(Debug, Deserialize)]
struct AssetEntry {
    path: String,
    ext: String,
}

pub async fn run(opts: PublishOptions) -> Result<()> {
    let cwd = std::env::current_dir()?;
    let creds = load_credentials()?;
    let project_config = load_project_config(&cwd)?;

    let client = ApiClient::with_project(&creds, &project_config.project_slug)?;

    // Read app.json for expo config
    let app_json_path = cwd.join("app.json");
    if !app_json_path.exists() {
        bail!("No app.json found. Run this from your Expo project root.");
    }
    let app_json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&app_json_path)?)
            .context("Failed to parse app.json")?;
    // Support both { "expo": { ... } } and flat { "name": "...", ... } formats
    let expo_config = app_json
        .get("expo")
        .cloned()
        .unwrap_or_else(|| app_json.clone());

    let dist_dir = cwd.join("dist");

    // Get git info
    let git_commit = git_output(&["rev-parse", "HEAD"]);
    let git_branch = git_output(&["branch", "--show-current"]);

    // Resolve message
    let message = opts.message.unwrap_or_else(|| {
        git_output(&["log", "-1", "--format=%s"]).unwrap_or_else(|| "Update".to_string())
    });

    let platforms: Vec<&str> = match opts.platform.as_deref() {
        Some("ios") => vec!["ios"],
        Some("android") => vec!["android"],
        _ => vec!["ios", "android"],
    };

    // Determine runtime version (using first platform for fingerprint computation)
    let (runtime_version, fingerprint) = if let Some(ref rv) = opts.runtime_version {
        println!("{} Using provided runtime version: {}", style("*").cyan(), style(rv).dim());
        (rv.clone(), None)
    } else {
        println!("{} Computing runtime fingerprint...", style("*").cyan());
        let fp = compute_fingerprint(&cwd, platforms[0])?;
        println!("  Fingerprint: {}", style(&fp).dim());
        let rv = get_runtime_version(&expo_config, &fp);
        println!("  Runtime version: {}", style(&rv).dim());
        (rv, Some(fp))
    };

    println!();
    if opts.no_publish {
        println!(
            "{} Uploading for {}...",
            style("*").cyan(),
            style(platforms.join(", ")).bold()
        );
    } else {
        println!(
            "{} Publishing to {} for {}...",
            style("*").cyan(),
            style(&opts.channel).bold(),
            style(platforms.join(", ")).bold()
        );
    }

    // Generate a shared group_id so both platforms are linked as one release
    let group_id = uuid::Uuid::new_v4().to_string();

    for platform in &platforms {
        // Export this platform
        println!();
        println!("{} Exporting {} bundle...", style("*").cyan(), platform);
        let status = Command::new("npx")
            .args(["expo", "export", "--output-dir", "dist", "--platform", platform])
            .current_dir(&cwd)
            .status()
            .with_context(|| format!("Failed to run expo export for {platform}"))?;
        if !status.success() {
            bail!("expo export failed for {platform} with status {status}");
        }

        // Parse metadata immediately after this platform's export
        let metadata_path = dist_dir.join("metadata.json");
        if !metadata_path.exists() {
            bail!("Export did not produce metadata.json.");
        }
        let metadata: ExpoMetadata =
            serde_json::from_str(&std::fs::read_to_string(&metadata_path)?)
                .context("Failed to parse metadata.json")?;

        let bundle_meta = match *platform {
            "ios" => &metadata.file_metadata.ios,
            "android" => &metadata.file_metadata.android,
            _ => continue,
        };

        let bundle_path = bundle_meta
            .bundle
            .as_ref()
            .context(format!("No bundle for {platform}"))?;

        // Collect assets
        let mut assets: Vec<(String, Vec<u8>)> = Vec::new();

        // Add the bundle (launch asset)
        let bundle_full_path = dist_dir.join(bundle_path);
        let bundle_data = std::fs::read(&bundle_full_path)
            .with_context(|| format!("Failed to read bundle: {}", bundle_full_path.display()))?;
        assets.push((bundle_path.clone(), bundle_data));

        // Add other assets — append the ext from metadata so the server
        // stores the correct file_extension (the filenames in dist/ are bare
        // content hashes with no extension).
        for asset in &bundle_meta.assets {
            let asset_full_path = dist_dir.join(&asset.path);
            if asset_full_path.exists() {
                let data = std::fs::read(&asset_full_path)?;
                let name = if !asset.ext.is_empty() && !asset.path.ends_with(&format!(".{}", asset.ext)) {
                    format!("{}.{}", asset.path, asset.ext)
                } else {
                    asset.path.clone()
                };
                assets.push((name, data));
            }
        }

        let total_size: usize = assets.iter().map(|(_, d)| d.len()).sum();
        let pb = ProgressBar::new(100);
        pb.set_style(
            ProgressStyle::default_bar()
                .template("  {prefix} [{bar:30}] {msg}")
                .unwrap()
                .progress_chars("=> "),
        );
        pb.set_prefix(platform.to_string());
        pb.set_message(format!(
            "{} files, {}",
            assets.len(),
            format_bytes(total_size)
        ));
        pb.set_position(30);

        // Upload build
        let build = client
            .upload_build(
                &runtime_version,
                platform,
                &expo_config,
                git_commit.as_deref(),
                git_branch.as_deref(),
                &message,
                fingerprint.as_deref(),
                &assets,
            )
            .await?;

        pb.set_position(70);

        if opts.no_publish {
            pb.set_position(100);
            pb.finish_with_message(format!(
                "{} files, {} — uploaded (build #{})",
                assets.len(),
                format_bytes(total_size),
                build.id
            ));
        } else {
            // Publish build with shared group_id
            let publish_resp = client
                .publish_build(
                    build.id,
                    &PublishBuildRequest {
                        channel: opts.channel.clone(),
                        branch_name: None,
                        rollout_percentage: opts.rollout,
                        is_critical: opts.critical,
                        release_message: message.clone(),
                        group_id: Some(group_id.clone()),
                    },
                )
                .await?;

            pb.set_position(100);
            pb.finish_with_message(format!(
                "{} files, {} — {}",
                assets.len(),
                format_bytes(total_size),
                style(&publish_resp.update_uuid).dim()
            ));
        }
    }

    println!();
    if opts.no_publish {
        println!("{} Uploaded successfully!", style("✓").green());
        println!();
        println!("  Runtime:   {}", style(&runtime_version).dim());
        println!("  Status:    {}", style("pending — publish from dashboard").yellow());
    } else {
        println!("{} Published successfully!", style("✓").green());
        println!();
        println!("  Channel:   {}", style(&opts.channel).bold());
        println!("  Runtime:   {}", style(&runtime_version).dim());
        println!("  Rollout:   {}%", opts.rollout);
        if opts.critical {
            println!("  Critical:  {}", style("yes").yellow());
        }
    }

    Ok(())
}

fn compute_fingerprint(cwd: &Path, platform: &str) -> Result<String> {
    // Use the expo-updates fingerprint computation which handles managed vs bare
    // workflow detection and matches what expo run:ios bakes into the binary.
    // Falls back to the @expo/fingerprint CLI if expo-updates is not installed.
    let script = format!(
        r#"
        const {{ createFingerprintAsync }} = require('expo/fingerprint');
        const path = require('path');

        async function run() {{
            // Detect workflow: if native marker files are gitignored, it's managed
            const platform = '{platform}';
            let ignorePaths = [];
            try {{
                const {{ resolveWorkflowAsync }} = require(
                    path.join(process.cwd(), 'node_modules/expo-updates/utils/build/workflow')
                );
                const workflow = await resolveWorkflowAsync(process.cwd(), platform);
                if (workflow === 'managed') {{
                    ignorePaths = ['android/**/*', 'ios/**/*'];
                }}
            }} catch (e) {{
                // expo-updates not installed or old version, try detecting manually
                const fs = require('fs');
                const iosIgnored = fs.existsSync('.gitignore') &&
                    fs.readFileSync('.gitignore', 'utf8').split('\\n').some(l => l.trim() === '/ios' || l.trim() === 'ios/');
                const androidIgnored = fs.existsSync('.gitignore') &&
                    fs.readFileSync('.gitignore', 'utf8').split('\\n').some(l => l.trim() === '/android' || l.trim() === 'android/');
                if (iosIgnored && androidIgnored) {{
                    ignorePaths = ['android/**/*', 'ios/**/*'];
                }}
            }}

            const result = await createFingerprintAsync(process.cwd(), {{
                platforms: [platform],
                ignorePaths,
            }});
            console.log(JSON.stringify({{ hash: result.hash }}));
        }}
        run().catch(e => {{ console.error(e.message); process.exit(1); }});
        "#,
        platform = platform
    );

    let output = Command::new("node")
        .args(["-e", &script])
        .current_dir(cwd)
        .output()
        .context("Failed to compute fingerprint")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("Fingerprint computation failed: {stderr}");
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
        if let Some(hash) = parsed.get("hash").and_then(|h| h.as_str()) {
            return Ok(hash.to_string());
        }
    }
    bail!("Could not parse fingerprint output: {stdout}");
}

fn get_runtime_version(expo_config: &serde_json::Value, fingerprint: &str) -> String {
    // If runtimeVersion is a string, use it directly
    if let Some(rv) = expo_config.get("runtimeVersion") {
        if let Some(s) = rv.as_str() {
            return s.to_string();
        }
        // If it's an object with policy "fingerprint", use the computed fingerprint
        if let Some(policy) = rv.get("policy").and_then(|p| p.as_str()) {
            if policy == "fingerprint" {
                return fingerprint.to_string();
            }
        }
    }
    // Default to fingerprint
    fingerprint.to_string()
}

fn git_output(args: &[&str]) -> Option<String> {
    Command::new("git")
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn format_bytes(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}
