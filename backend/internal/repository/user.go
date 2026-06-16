package repository

import (
	"context"
	"fmt"

	"github.com/avvyyy/project-pulse/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRepo struct{ db *pgxpool.Pool }

func NewUserRepo(db *pgxpool.Pool) *UserRepo { return &UserRepo{db: db} }

func (r *UserRepo) Create(ctx context.Context, email, passwordHash string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email, password_hash, created_at`,
		email, passwordHash,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, created_at
		FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // Return nil, nil for not found to make it easier for caller
		}
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, created_at
		FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}
