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
    #[allow(dead_code)]
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
    let expo_config = app_json
        .get("expo")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    // Compute fingerprint
    println!("{} Computing runtime fingerprint...", style("*").cyan());
    let fingerprint = compute_fingerprint(&cwd)?;
    println!("  Fingerprint: {}", style(&fingerprint).dim());

    // Get runtime version from app.json or use fingerprint
    let runtime_version = get_runtime_version(&expo_config, &fingerprint);
    println!("  Runtime version: {}", style(&runtime_version).dim());

    // Export bundles
    let dist_dir = cwd.join("dist");
    println!();
    println!("{} Exporting bundles...", style("*").cyan());
    export_bundles(&cwd)?;

    // Parse metadata
    let metadata_path = dist_dir.join("metadata.json");
    if !metadata_path.exists() {
        bail!("Export did not produce metadata.json. Check `npx expo export` output.");
    }
    let metadata: ExpoMetadata =
        serde_json::from_str(&std::fs::read_to_string(&metadata_path)?)
            .context("Failed to parse metadata.json")?;

    // Get git info
    let git_commit = git_output(&["rev-parse", "HEAD"]);
    let git_branch = git_output(&["branch", "--show-current"]);

    // Resolve message
    let message = opts.message.unwrap_or_else(|| {
        git_output(&["log", "-1", "--format=%s"]).unwrap_or_else(|| "Update".to_string())
    });

    // Determine platforms to publish
    let platforms = match opts.platform.as_deref() {
        Some("ios") => vec!["ios"],
        Some("android") => vec!["android"],
        _ => {
            let mut p = Vec::new();
            if metadata.file_metadata.ios.bundle.is_some() {
                p.push("ios");
            }
            if metadata.file_metadata.android.bundle.is_some() {
                p.push("android");
            }
            p
        }
    };

    if platforms.is_empty() {
        bail!("No bundles found in export output.");
    }

    println!();
    println!(
        "{} Publishing to {} for {}...",
        style("*").cyan(),
        style(&opts.channel).bold(),
        style(platforms.join(", ")).bold()
    );

    for platform in &platforms {
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

        // Add other assets
        for asset in &bundle_meta.assets {
            let asset_full_path = dist_dir.join(&asset.path);
            if asset_full_path.exists() {
                let data = std::fs::read(&asset_full_path)?;
                assets.push((asset.path.clone(), data));
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
        pb.set_prefix(format!("{platform}"));
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
                Some(&fingerprint),
                &assets,
            )
            .await?;

        pb.set_position(70);

        // Publish build
        let publish_resp = client
            .publish_build(
                build.id,
                &PublishBuildRequest {
                    channel: opts.channel.clone(),
                    branch_name: None,
                    rollout_percentage: opts.rollout,
                    is_critical: opts.critical,
                    release_message: message.clone(),
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

    println!();
    println!("{} Published successfully!", style("✓").green());
    println!();
    println!("  Channel:   {}", style(&opts.channel).bold());
    println!("  Runtime:   {}", style(&runtime_version).dim());
    println!("  Rollout:   {}%", opts.rollout);
    if opts.critical {
        println!("  Critical:  {}", style("yes").yellow());
    }

    Ok(())
}

fn compute_fingerprint(cwd: &Path) -> Result<String> {
    let output = Command::new("npx")
        .args(["--yes", "@expo/fingerprint", "."])
        .current_dir(cwd)
        .output()
        .context("Failed to run @expo/fingerprint")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("Fingerprint computation failed: {stderr}");
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // The output is a JSON object with a "hash" field
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout.trim()) {
        if let Some(hash) = parsed.get("hash").and_then(|h| h.as_str()) {
            return Ok(hash.to_string());
        }
    }
    // Fallback: use the full output trimmed
    Ok(stdout.trim().to_string())
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

fn export_bundles(cwd: &Path) -> Result<()> {
    let status = Command::new("npx")
        .args(["expo", "export", "--output-dir", "dist"])
        .current_dir(cwd)
        .status()
        .context("Failed to run expo export")?;

    if !status.success() {
        bail!("expo export failed with status {status}");
    }
    Ok(())
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
