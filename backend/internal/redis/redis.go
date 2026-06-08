package redisclient

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

func New(addr, password string, db int) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &Client{rdb: rdb}, nil
}

func (c *Client) Close() error { return c.rdb.Close() }

// CheckIPRateLimit returns true if the request is allowed.
func (c *Client) CheckIPRateLimit(ctx context.Context, ip string, limitPerMin int) (bool, error) {
	key := fmt.Sprintf("ip_rl:%s", ip)
	count, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true, nil // fail open
	}
	if count == 1 {
		c.rdb.Expire(ctx, key, time.Minute)
	}
	return count <= int64(limitPerMin), nil
}

// CheckKeyRateLimit returns true if the request is allowed.
func (c *Client) CheckKeyRateLimit(ctx context.Context, keyID string, limitPerMin int) (bool, error) {
	key := fmt.Sprintf("key_rl:%s", keyID)
	count, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true, nil
	}
	if count == 1 {
		c.rdb.Expire(ctx, key, time.Minute)
	}
	return count <= int64(limitPerMin), nil
}

type CachedKey struct {
	ID           string `json:"id"`
	RateLimit    int    `json:"rate_limit"`
}

func (c *Client) CacheAPIKey(ctx context.Context, hash string, id string, rateLimit int) error {
	data, _ := json.Marshal(CachedKey{ID: id, RateLimit: rateLimit})
	return c.rdb.Set(ctx, "apikey:"+hash, data, 5*time.Minute).Err()
}

func (c *Client) GetCachedAPIKey(ctx context.Context, hash string) (*CachedKey, error) {
	data, err := c.rdb.Get(ctx, "apikey:"+hash).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var k CachedKey
	if err := json.Unmarshal(data, &k); err != nil {
		return nil, err
	}
	return &k, nil
}

func (c *Client) InvalidateAPIKey(ctx context.Context, hash string) error {
	return c.rdb.Del(ctx, "apikey:"+hash).Err()
}

// RecordFailedAuth increments failed auth counter. Returns new count.
func (c *Client) RecordFailedAuth(ctx context.Context, ip string) (int64, error) {
	key := fmt.Sprintf("auth_fail:%s", ip)
	count, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	if count == 1 {
		c.rdb.Expire(ctx, key, 5*time.Minute)
	}
	if count >= 20 {
		c.rdb.Set(ctx, "auth_blocked:"+ip, 1, 15*time.Minute)
	}
	return count, nil
}

func (c *Client) IsAuthBlocked(ctx context.Context, ip string) (bool, error) {
	n, err := c.rdb.Exists(ctx, "auth_blocked:"+ip).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (c *Client) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}
