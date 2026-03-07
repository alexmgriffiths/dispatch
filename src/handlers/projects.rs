use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use crate::auth::RequireAuth;
use crate::errors::AppError;
use crate::handlers::audit::record_audit;
use crate::models::Project;
use crate::routes::AppState;

/// List all projects the current user has access to.
pub async fn handle_list_projects(
    State(state): State<AppState>,
    auth: RequireAuth,
) -> Result<impl IntoResponse, AppError> {
    let user_id = auth
        .user_id
        .ok_or_else(|| AppError::BadRequest("API keys are scoped to a single project".into()))?;

    let projects = sqlx::query_as::<_, Project>(
        "SELECT p.* FROM projects p
         JOIN project_members pm ON pm.project_id = p.id
         WHERE pm.user_id = $1
         ORDER BY p.created_at ASC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(projects))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub slug: String,
}

/// Create a new project and add the current user as admin.
pub async fn handle_create_project(
    State(state): State<AppState>,
    auth: RequireAuth,
    Json(body): Json<CreateProjectRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = auth
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Only users can create projects".into()))?;

    let name = body.name.trim().to_string();
    let slug = body.slug.trim().to_lowercase();

    if name.is_empty() {
        return Err(AppError::BadRequest("Project name is required".into()));
    }
    if slug.is_empty() || !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(AppError::BadRequest(
            "Slug must be alphanumeric with hyphens only".into(),
        ));
    }

    let mut tx = state.db.begin().await?;

    let project = sqlx::query_as::<_, Project>(
        "INSERT INTO projects (name, slug) VALUES ($1, $2) RETURNING *",
    )
    .bind(&name)
    .bind(&slug)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key") {
            AppError::BadRequest(format!("Project slug '{slug}' already taken"))
        } else {
            AppError::Internal(e.to_string())
        }
    })?;

    // Add creator as admin
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'admin')",
    )
    .bind(project.id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    // Create default branch + channel for the project
    sqlx::query("INSERT INTO branches (name, project_id) VALUES ('main', $1)")
        .bind(project.id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO channels (name, branch_name, project_id) VALUES ('production', 'main', $1)",
    )
    .bind(project.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let no_project_auth = RequireAuth {
        user_id: Some(user_id),
        api_key_id: None,
        project_id: Some(project.id),
    };
    record_audit(
        &state.db,
        &no_project_auth,
        "project.created",
        "project",
        Some(project.id),
        serde_json::json!({ "name": name, "slug": slug }),
    )
    .await;

    Ok((StatusCode::CREATED, Json(project)))
}

/// Delete a project (admin only).
pub async fn handle_delete_project(
    State(state): State<AppState>,
    auth: RequireAuth,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = auth
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Only users can delete projects".into()))?;

    // Verify user is admin of this project
    let project_id = sqlx::query_scalar::<_, i64>(
        "SELECT p.id FROM projects p
         JOIN project_members pm ON pm.project_id = p.id
         WHERE p.slug = $1 AND pm.user_id = $2 AND pm.role = 'admin'",
    )
    .bind(&slug)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Project not found or insufficient permissions".into()))?;

    // Count remaining projects for this user
    let project_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM project_members WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    if project_count <= 1 {
        return Err(AppError::BadRequest(
            "Cannot delete your last project".into(),
        ));
    }

    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
