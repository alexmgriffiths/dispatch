use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub s3_base_url: String,
    pub private_key_path: Option<String>,
    pub host: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            s3_bucket: env::var("S3_BUCKET").expect("S3_BUCKET must be set"),
            s3_region: env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
            s3_base_url: env::var("S3_BASE_URL").expect("S3_BASE_URL must be set"),
            private_key_path: env::var("PRIVATE_KEY_PATH").ok(),
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "9999".to_string())
                .parse()
                .expect("PORT must be a valid number"),
        }
    }
}
