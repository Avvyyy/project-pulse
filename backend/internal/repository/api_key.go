package repository

import (
	"context"
	"fmt"

	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

type APIKeyRepo struct{ db *pgxpool.Pool }

func NewAPIKeyRepo(db *pgxpool.Pool) *APIKeyRepo { return &APIKeyRepo{db: db} }

func (r *APIKeyRepo) Create(ctx context.Context, name, keyHash string, rateLimit int) (*models.APIKey, error) {
	var k models.APIKey
	err := r.db.QueryRow(ctx, `
		INSERT INTO api_keys (name, key_hash, rate_limit_per_minute)
		VALUES ($1, $2, $3)
		RETURNING id, name, rate_limit_per_minute, created_at`,
		name, keyHash, rateLimit,
	).Scan(&k.ID, &k.Name, &k.RateLimitPerMinute, &k.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create api key: %w", err)
	}
	return &k, nil
}

func (r *APIKeyRepo) GetByHash(ctx context.Context, hash string) (*models.APIKey, error) {
	var k models.APIKey
	err := r.db.QueryRow(ctx, `
		SELECT id, name, key_hash, rate_limit_per_minute, created_at
		FROM api_keys WHERE key_hash = $1`, hash,
	).Scan(&k.ID, &k.Name, &k.KeyHash, &k.RateLimitPerMinute, &k.CreatedAt)
	if err != nil {
		return nil, err // pgx.ErrNoRows when not found
	}
	return &k, nil
}

func (r *APIKeyRepo) List(ctx context.Context) ([]models.APIKey, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, rate_limit_per_minute, created_at
		FROM api_keys ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []models.APIKey
	for rows.Next() {
		var k models.APIKey
		if err := rows.Scan(&k.ID, &k.Name, &k.RateLimitPerMinute, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

func (r *APIKeyRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM api_keys WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("api key not found")
	}
	return nil
}

func (r *APIKeyRepo) GetHashByID(ctx context.Context, id string) (string, error) {
	var hash string
	err := r.db.QueryRow(ctx, `SELECT key_hash FROM api_keys WHERE id = $1`, id).Scan(&hash)
	return hash, err
}
