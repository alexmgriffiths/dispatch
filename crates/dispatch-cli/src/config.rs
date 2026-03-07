use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct Credentials {
    pub server: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectConfig {
    #[serde(rename = "projectUuid")]
    pub project_uuid: String,
    #[serde(rename = "projectSlug")]
    pub project_slug: String,
}

fn credentials_path() -> Result<PathBuf> {
    let home = dirs::home_dir().context("Could not determine home directory")?;
    Ok(home.join(".dispatch").join("credentials.json"))
}

pub fn load_credentials() -> Result<Credentials> {
    let path = credentials_path()?;
    let data = std::fs::read_to_string(&path)
        .with_context(|| format!("No credentials found at {}. Run `dispatch login` first.", path.display()))?;
    serde_json::from_str(&data).context("Invalid credentials file")
}

pub fn save_credentials(creds: &Credentials) -> Result<()> {
    let path = credentials_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(creds)?;
    std::fs::write(&path, data)?;
    Ok(())
}

fn project_config_path(project_dir: &Path) -> PathBuf {
    project_dir.join(".dispatch").join("config.json")
}

pub fn load_project_config(project_dir: &Path) -> Result<ProjectConfig> {
    let path = project_config_path(project_dir);
    let data = std::fs::read_to_string(&path)
        .with_context(|| format!("No project config found at {}. Run `dispatch init` first.", path.display()))?;
    serde_json::from_str(&data).context("Invalid project config file")
}

pub fn save_project_config(project_dir: &Path, config: &ProjectConfig) -> Result<()> {
    let path = project_config_path(project_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, data)?;
    Ok(())
}
