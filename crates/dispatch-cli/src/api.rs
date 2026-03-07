use anyhow::{Context, Result, bail};
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::config::Credentials;

const USER_AGENT: &str = concat!("dispatch-cli/", env!("CARGO_PKG_VERSION"));

pub struct ApiClient {
    client: reqwest::Client,
    base_url: String,
    api_key: String,
}

#[derive(Debug, Deserialize)]
pub struct ProjectRecord {
    pub uuid: String,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct BuildResponse {
    pub id: i64,
    pub build_uuid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PublishResponse {
    pub update_id: i64,
    pub update_uuid: String,
    pub group_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishBuildRequest {
    pub channel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch_name: Option<String>,
    pub rollout_percentage: i32,
    pub is_critical: bool,
    pub release_message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

impl ApiClient {
    pub fn new(creds: &Credentials) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .build()?;
        let base_url = creds.server.trim_end_matches('/').to_string();
        Ok(Self {
            client,
            base_url,
            api_key: creds.api_key.clone(),
        })
    }

    pub fn with_project(creds: &Credentials, project_slug: &str) -> Result<Self> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("X-Project", project_slug.parse()?);
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .default_headers(headers)
            .build()?;
        let base_url = creds.server.trim_end_matches('/').to_string();
        Ok(Self {
            client,
            base_url,
            api_key: creds.api_key.clone(),
        })
    }

    pub async fn list_projects(&self) -> Result<Vec<ProjectRecord>> {
        let resp = self
            .client
            .get(format!("{}/v1/ota/projects", self.base_url))
            .bearer_auth(&self.api_key)
            .send()
            .await
            .context("Failed to connect to server")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            bail!("Server returned {status}: {body}");
        }

        resp.json().await.context("Failed to parse projects response")
    }

    pub async fn upload_build(
        &self,
        runtime_version: &str,
        platform: &str,
        expo_config: &serde_json::Value,
        git_commit_hash: Option<&str>,
        git_branch: Option<&str>,
        message: &str,
        runtime_fingerprint: Option<&str>,
        assets: &[(String, Vec<u8>)],
    ) -> Result<BuildResponse> {
        let mut form = multipart::Form::new()
            .text("runtimeVersion", runtime_version.to_string())
            .text("platform", platform.to_string())
            .text("expoConfig", serde_json::to_string(expo_config)?)
            .text("message", message.to_string());

        if let Some(hash) = git_commit_hash {
            form = form.text("gitCommitHash", hash.to_string());
        }
        if let Some(branch) = git_branch {
            form = form.text("gitBranch", branch.to_string());
        }
        if let Some(fp) = runtime_fingerprint {
            form = form.text("runtimeFingerprint", fp.to_string());
        }

        for (filename, data) in assets {
            let part = multipart::Part::bytes(data.clone())
                .file_name(filename.clone())
                .mime_str(mime_from_ext(filename))?;
            form = form.part("assets", part);
        }

        let resp = self
            .client
            .post(format!("{}/v1/ota/builds", self.base_url))
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .context("Failed to upload build")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            bail!("Upload build failed ({status}): {body}");
        }

        resp.json().await.context("Failed to parse build response")
    }

    pub async fn publish_build(
        &self,
        build_id: i64,
        req: &PublishBuildRequest,
    ) -> Result<PublishResponse> {
        let resp = self
            .client
            .post(format!("{}/v1/ota/builds/{build_id}/publish", self.base_url))
            .bearer_auth(&self.api_key)
            .json(req)
            .send()
            .await
            .context("Failed to publish build")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            bail!("Publish build failed ({status}): {body}");
        }

        resp.json().await.context("Failed to parse publish response")
    }
}

fn mime_from_ext(filename: &str) -> &str {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext {
        "js" => "application/javascript",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}
