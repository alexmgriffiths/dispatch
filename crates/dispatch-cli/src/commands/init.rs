use anyhow::{Context, Result, bail};
use console::style;
use dialoguer::Select;
use std::path::Path;
use std::process::Command;

use crate::api::ApiClient;
use crate::config::{ProjectConfig, load_credentials, save_project_config};

pub async fn run() -> Result<()> {
    let cwd = std::env::current_dir()?;
    let creds = load_credentials()?;

    // Check app.json exists
    let app_json_path = cwd.join("app.json");
    if !app_json_path.exists() {
        bail!(
            "No app.json found in current directory. Run this command from your Expo project root."
        );
    }

    // Fetch projects
    println!("{} Fetching projects...", style("*").cyan());
    let client = ApiClient::new(&creds)?;
    let projects = client.list_projects().await?;

    if projects.is_empty() {
        bail!("No projects found. Create one in the Dispatch dashboard first.");
    }

    // Select project
    let project_names: Vec<String> = projects.iter().map(|p| p.name.clone()).collect();
    let selection = Select::new()
        .with_prompt("Select a project")
        .items(&project_names)
        .default(0)
        .interact()?;

    let project = &projects[selection];
    println!(
        "{} Selected: {} ({})",
        style("✓").green(),
        style(&project.name).bold(),
        style(&project.slug).dim()
    );

    // Install dependencies
    println!();
    println!(
        "{} Installing expo-updates...",
        style("*").cyan()
    );
    run_cmd("npx", &["expo", "install", "expo-updates"], &cwd)?;

    println!(
        "{} Installing @expo/fingerprint...",
        style("*").cyan()
    );
    run_cmd("npm", &["install", "--save-dev", "@expo/fingerprint"], &cwd)?;

    // Patch app.json
    println!();
    println!("{} Updating app.json...", style("*").cyan());
    patch_app_json(&app_json_path, &creds.server, &project.uuid)?;

    // Write project config
    save_project_config(
        &cwd,
        &ProjectConfig {
            project_uuid: project.uuid.clone(),
            project_slug: project.slug.clone(),
        },
    )?;

    // Add .dispatch/ to .gitignore
    add_to_gitignore(&cwd)?;

    println!();
    println!("{} Project initialized!", style("✓").green());
    println!();
    println!("  Project:  {}", style(&project.name).bold());
    println!("  UUID:     {}", style(&project.uuid).dim());
    println!("  Server:   {}", style(&creds.server).dim());
    println!();
    println!(
        "  Next: run {} to publish an update.",
        style("dispatch publish").cyan()
    );

    Ok(())
}

fn run_cmd(program: &str, args: &[&str], cwd: &Path) -> Result<()> {
    let status = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .status()
        .with_context(|| format!("Failed to run {program}"))?;

    if !status.success() {
        bail!("{program} exited with status {status}");
    }
    Ok(())
}

fn patch_app_json(path: &Path, server_url: &str, project_uuid: &str) -> Result<()> {
    let content = std::fs::read_to_string(path)?;
    let mut root: serde_json::Value = serde_json::from_str(&content)
        .context("Failed to parse app.json")?;

    let expo = root
        .get_mut("expo")
        .context("app.json missing \"expo\" key")?;

    let server_url = server_url.trim_end_matches('/');
    let manifest_url = format!("{server_url}/v1/ota/manifest/{project_uuid}");

    // Set updates config
    let updates = serde_json::json!({
        "url": manifest_url,
        "enabled": true,
        "checkAutomatically": "ON_LOAD"
    });
    expo.as_object_mut()
        .unwrap()
        .insert("updates".to_string(), updates);

    // Set runtimeVersion to fingerprint policy
    expo.as_object_mut()
        .unwrap()
        .insert("runtimeVersion".to_string(), serde_json::json!({
            "policy": "fingerprint"
        }));

    let output = serde_json::to_string_pretty(&root)?;
    std::fs::write(path, output + "\n")?;
    Ok(())
}

fn add_to_gitignore(project_dir: &Path) -> Result<()> {
    let gitignore_path = project_dir.join(".gitignore");
    let entry = ".dispatch/";

    if gitignore_path.exists() {
        let content = std::fs::read_to_string(&gitignore_path)?;
        if content.lines().any(|line| line.trim() == entry) {
            return Ok(());
        }
        let mut new_content = content;
        if !new_content.ends_with('\n') {
            new_content.push('\n');
        }
        new_content.push_str(entry);
        new_content.push('\n');
        std::fs::write(&gitignore_path, new_content)?;
    } else {
        std::fs::write(&gitignore_path, format!("{entry}\n"))?;
    }

    Ok(())
}
