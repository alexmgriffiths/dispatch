.PHONY: test test-coverage docker-up docker-down migrate

TEST_DB_URL ?= postgres://ota_user:ota_pass@localhost:5435/ota_test

# Start Docker services (Postgres + MinIO)
docker-up:
	docker compose up -d db minio minio-init
	@echo "Waiting for services..."
	@until docker compose exec -T db pg_isready -U ota_user -d ota 2>/dev/null; do sleep 1; done
	@echo "Services ready"

# Stop Docker services
docker-down:
	docker compose down

# Create test database if it doesn't exist and run migrations
migrate:
	@docker compose exec -T db psql -U ota_user -d ota -tc \
		"SELECT 1 FROM pg_database WHERE datname = 'ota_test'" | grep -q 1 || \
		docker compose exec -T db psql -U ota_user -d ota -c "CREATE DATABASE ota_test OWNER ota_user"
	DATABASE_URL=$(TEST_DB_URL) sqlx migrate run --source ./migrations

# Run all tests
test: docker-up migrate
	DATABASE_URL=$(TEST_DB_URL) \
	S3_BUCKET=ota-updates \
	S3_BASE_URL=http://localhost:9000/ota-updates \
	S3_REGION=us-east-1 \
	AWS_ENDPOINT_URL=http://localhost:9000 \
	AWS_ACCESS_KEY_ID=minioadmin \
	AWS_SECRET_ACCESS_KEY=minioadmin \
	cargo test -- --test-threads=1 --nocapture

# Run tests with coverage
test-coverage: docker-up migrate
	DATABASE_URL=$(TEST_DB_URL) \
	S3_BUCKET=ota-updates \
	S3_BASE_URL=http://localhost:9000/ota-updates \
	S3_REGION=us-east-1 \
	AWS_ENDPOINT_URL=http://localhost:9000 \
	AWS_ACCESS_KEY_ID=minioadmin \
	AWS_SECRET_ACCESS_KEY=minioadmin \
	cargo llvm-cov --fail-under-lines 60 -- --test-threads=1
