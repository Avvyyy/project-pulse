package repository

import (
	"context"
	"fmt"

	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

type APIKeyRepo struct{ db *pgxpool.Pool }

func NewAPIKeyRepo(db *pgxpool.Pool) *APIKeyRepo { return &APIKeyRepo{db: db} }

func (r *APIKeyRepo) Create(ctx context.Context, userID, name, keyHash string, rateLimit int) (*models.APIKey, error) {
	var k models.APIKey
	err := r.db.QueryRow(ctx, `
		INSERT INTO api_keys (user_id, name, key_hash, rate_limit_per_minute, is_active)
		VALUES ($1, $2, $3, $4, true)
		RETURNING id, user_id, name, rate_limit_per_minute, is_active, disabled_at, created_at`,
		userID, name, keyHash, rateLimit,
	).Scan(&k.ID, &k.UserID, &k.Name, &k.RateLimitPerMinute, &k.IsActive, &k.DisabledAt, &k.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create api key: %w", err)
	}
	return &k, nil
}

func (r *APIKeyRepo) GetByHash(ctx context.Context, hash string) (*models.APIKey, error) {
	var k models.APIKey
	err := r.db.QueryRow(ctx, `
		SELECT id, user_id, name, key_hash, rate_limit_per_minute, is_active, disabled_at, created_at
		FROM api_keys WHERE key_hash = $1 AND is_active = true`, hash,
	).Scan(&k.ID, &k.UserID, &k.Name, &k.KeyHash, &k.RateLimitPerMinute, &k.IsActive, &k.DisabledAt, &k.CreatedAt)
	if err != nil {
		return nil, err // pgx.ErrNoRows when not found or inactive
	}
	return &k, nil
}

func (r *APIKeyRepo) List(ctx context.Context, userID string) ([]models.APIKey, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, name, rate_limit_per_minute, is_active, disabled_at, created_at
		FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := make([]models.APIKey, 0)
	for rows.Next() {
		var k models.APIKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &k.RateLimitPerMinute, &k.IsActive, &k.DisabledAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

func (r *APIKeyRepo) Delete(ctx context.Context, userID, id string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE api_keys
		SET is_active = false, disabled_at = NOW()
		WHERE id = $1 AND user_id = $2 AND is_active = true`,
		id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("api key not found or unauthorized")
	}
	return nil
}

func (r *APIKeyRepo) GetHashByID(ctx context.Context, id string) (string, error) {
	var hash string
	err := r.db.QueryRow(ctx, `SELECT key_hash FROM api_keys WHERE id = $1`, id).Scan(&hash)
	return hash, err
}
