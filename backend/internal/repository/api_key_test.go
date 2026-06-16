package repository

import (
	"context"
	"testing"

	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAPIKeySoftDeleteFields(t *testing.T) {
	t.Skip("integration test requires database migration and container setup")

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, "postgresql://pulse:pulse_secret@localhost:5432/pulse_db?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	repo := NewAPIKeyRepo(pool)
	key, err := repo.Create(ctx, "00000000-0000-0000-0000-000000000000", "soft-delete-test", "deadbeef", 1000)
	if err != nil {
		t.Fatal(err)
	}
	if !key.IsActive {
		t.Fatalf("expected new key to be active")
	}
	if key.DisabledAt != nil {
		t.Fatalf("expected disabledAt to be nil")
	}

	err = repo.Delete(ctx, "00000000-0000-0000-0000-000000000000", key.ID)
	if err != nil {
		t.Fatal(err)
	}

	var deleted models.APIKey
	err = pool.QueryRow(ctx, `SELECT is_active, disabled_at FROM api_keys WHERE id = $1`, key.ID).Scan(&deleted.IsActive, &deleted.DisabledAt)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.IsActive {
		t.Fatalf("expected key to be inactive after delete")
	}
	if deleted.DisabledAt == nil || deleted.DisabledAt.IsZero() {
		t.Fatalf("expected disabledAt to be set after delete")
	}
}
