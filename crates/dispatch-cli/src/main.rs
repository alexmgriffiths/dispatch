mod api;
mod commands;
mod config;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "dispatch", about = "Dispatch OTA — publish updates for your Expo app")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Authenticate with your Dispatch server
    Login {
        /// Server URL (e.g. https://ota.example.com)
        #[arg(long)]
        server: String,
        /// API key from Settings > API Keys
        #[arg(long)]
        key: String,
    },
    /// Initialize the current Expo project for Dispatch OTA
    Init,
    /// Export and publish an OTA update
    Publish {
        /// Target channel
        #[arg(long, default_value = "production")]
        channel: String,
        /// Release message (defaults to latest git commit message)
        #[arg(long, short)]
        message: Option<String>,
        /// Platform: ios, android, or both
        #[arg(long)]
        platform: Option<String>,
        /// Rollout percentage (0-100)
        #[arg(long, default_value = "100")]
        rollout: i32,
        /// Force immediate reload on devices
        #[arg(long, default_value = "false")]
        critical: bool,
        /// Upload build without publishing (publish later from the dashboard)
        #[arg(long, default_value = "false")]
        no_publish: bool,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Login { server, key } => commands::login::run(&server, &key).await,
        Commands::Init => commands::init::run().await,
        Commands::Publish {
            channel,
            message,
            platform,
            rollout,
            critical,
            no_publish,
        } => {
            commands::publish::run(commands::publish::PublishOptions {
                channel,
                message,
                platform,
                rollout,
                critical,
                no_publish,
            })
            .await
        }
    };

    if let Err(e) = result {
        eprintln!("{}: {e:#}", console::style("error").red().bold());
        std::process::exit(1);
    }
}
