use sha2::{Digest, Sha256};
use sqlx::PgPool;

/// Default password used for all test users.
pub const TEST_PASSWORD: &str = "testpassword123";

/// Holds everything needed to make authenticated requests as a test user.
pub struct TestUser {
    pub user_id: i64,
    pub email: String,
    pub token: String,
    pub project_slug: String,
}

/// Create a test user by inserting directly into the database.
/// Also creates a project, project membership, default branch, default channel,
/// and a session token. Returns a TestUser with all context needed for requests.
pub async fn create_test_user(db: &PgPool, email: &str, name: &str) -> TestUser {
    // Hash the test password using the same Argon2 pattern as production code
    let password_hash = dispatch_ota::handlers::auth_handler::hash_password(TEST_PASSWORD)
        .expect("Failed to hash test password");

    // Insert user
    let user_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING id",
    )
    .bind(email)
    .bind(name)
    .bind(&password_hash)
    .fetch_one(db)
    .await
    .expect("Failed to insert test user");

    // Create a project slug from the user name
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let project_name = format!("{}'s Project", name);

    // Create project
    let project_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO projects (name, slug) VALUES ($1, $2) RETURNING id",
    )
    .bind(&project_name)
    .bind(&slug)
    .fetch_one(db)
    .await
    .expect("Failed to insert test project");

    // Create project membership
    sqlx::query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'admin')")
        .bind(project_id)
        .bind(user_id)
        .execute(db)
        .await
        .expect("Failed to insert project membership");

    // Create default branch ("main")
    sqlx::query("INSERT INTO branches (name, project_id) VALUES ('main', $1)")
        .bind(project_id)
        .execute(db)
        .await
        .expect("Failed to insert default branch");

    // Create default channel ("production") pointing to "main" branch
    sqlx::query("INSERT INTO channels (name, branch_name, project_id) VALUES ('production', 'main', $1)")
        .bind(project_id)
        .execute(db)
        .await
        .expect("Failed to insert default channel");

    // Generate a session token (same pattern as auth_handler)
    let token_bytes: [u8; 32] = rand::random();
    let token = hex::encode(token_bytes);
    let token_hash = hex::encode(Sha256::digest(token.as_bytes()));

    sqlx::query(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
    )
    .bind(user_id)
    .bind(&token_hash)
    .execute(db)
    .await
    .expect("Failed to insert test session");

    TestUser {
        user_id,
        email: email.to_string(),
        token,
        project_slug: slug,
    }
}

/// Create a feature flag with two default variations (on/off) and return the flag_id.
pub async fn create_test_flag(db: &PgPool, project_id: i64, key: &str) -> i64 {
    let flag_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO feature_flags (project_id, key, flag_type, default_value, enabled) \
         VALUES ($1, $2, 'boolean', 'false', true) RETURNING id",
    )
    .bind(project_id)
    .bind(key)
    .fetch_one(db)
    .await
    .expect("Failed to insert test flag");

    // Create default "on" variation
    sqlx::query(
        "INSERT INTO flag_variations (flag_id, value, name, sort_order) VALUES ($1, 'true', 'On', 0)",
    )
    .bind(flag_id)
    .execute(db)
    .await
    .expect("Failed to insert 'on' variation");

    // Create default "off" variation
    sqlx::query(
        "INSERT INTO flag_variations (flag_id, value, name, sort_order) VALUES ($1, 'false', 'Off', 1)",
    )
    .bind(flag_id)
    .execute(db)
    .await
    .expect("Failed to insert 'off' variation");

    flag_id
}

/// Look up a project ID from its slug.
pub async fn get_project_id(db: &PgPool, slug: &str) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE slug = $1")
        .bind(slug)
        .fetch_one(db)
        .await
        .expect("Failed to find project by slug")
}
