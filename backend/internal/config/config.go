package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppEnv  string
	AppPort string

	AdminSecret string
	JWTSecret   string

	PostgresDSN string

	RedisAddr     string
	RedisPassword string
	RedisDB       int

	ElasticsearchURL         string
	ElasticsearchIndexEvents string

	RateLimitDefaultPerMinute int
	CORSAllowedOrigins        []string
}

func Load() (*Config, error) {
	c := &Config{
		AppEnv:  getEnv("APP_ENV", "development"),
		AppPort: getEnv("APP_PORT", "8080"),

		AdminSecret: getEnv("ADMIN_SECRET", ""),
		JWTSecret:   getEnv("JWT_SECRET", "super-secret-jwt-key-for-dev"),

		PostgresDSN: getEnv("DATABASE_URL", ""),

		RedisAddr:     fmt.Sprintf("%s:%s", getEnv("REDIS_HOST", "localhost"), getEnv("REDIS_PORT", "6379")),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),

		ElasticsearchURL:         getEnv("ELASTICSEARCH_URL", "http://localhost:9200"),
		ElasticsearchIndexEvents: getEnv("ELASTICSEARCH_INDEX_EVENTS", "pulse_events"),

		CORSAllowedOrigins: strings.Split(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000"), ","),
	}

	if db, err := strconv.Atoi(getEnv("REDIS_DB", "0")); err == nil {
		c.RedisDB = db
	}
	if rl, err := strconv.Atoi(getEnv("RATE_LIMIT_DEFAULT_PER_MINUTE", "1000")); err == nil {
		c.RateLimitDefaultPerMinute = rl
	} else {
		c.RateLimitDefaultPerMinute = 1000
	}

	if c.PostgresDSN == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if c.AppEnv == "production" && (c.AdminSecret == "" || c.AdminSecret == "admin-secret-change-in-production") {
		return nil, fmt.Errorf("ADMIN_SECRET must be set to a non-default value in production")
	}
	if c.AppEnv == "production" && (c.JWTSecret == "" || c.JWTSecret == "super-secret-jwt-key-for-dev") {
		return nil, fmt.Errorf("JWT_SECRET must be set to a non-default value in production")
	}
	if c.AdminSecret == "" {
		c.AdminSecret = "admin-secret-change-in-production"
	}
	if c.JWTSecret == "" {
		c.JWTSecret = "super-secret-jwt-key-for-dev"
	}

	return c, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
