use anyhow::{Result, bail};
use console::style;

use crate::api::ApiClient;
use crate::config::{Credentials, save_credentials};

pub async fn run(server: &str, key: &str) -> Result<()> {
    let creds = Credentials {
        server: server.trim_end_matches('/').to_string(),
        api_key: key.to_string(),
    };

    println!("{} Validating API key...", style("*").cyan());

    let client = ApiClient::new(&creds)?;
    let projects = match client.list_projects().await {
        Ok(p) => p,
        Err(e) => bail!("Authentication failed: {e}"),
    };

    save_credentials(&creds)?;

    println!("{} Logged in successfully!", style("✓").green());
    println!();

    if projects.is_empty() {
        println!("  No projects found. Create one in the dashboard first.");
    } else {
        println!("  {} project(s):", projects.len());
        for p in &projects {
            println!("    {} {}", style("·").dim(), p.name);
        }
    }

    println!();
    println!(
        "  Credentials saved to {}",
        style("~/.dispatch/credentials.json").dim()
    );

    Ok(())
}
