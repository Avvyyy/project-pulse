export default () => ({
  app: {
    env:         process.env.APP_ENV ?? 'development',
    port:        parseInt(process.env.APP_PORT ?? '8080', 10),
    adminSecret: process.env.ADMIN_SECRET ?? 'admin-secret-change-in-production',
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://pulse:pulse_secret@localhost:5432/pulse_db',
  },
  redis: {
    host:     process.env.REDIS_HOST ?? 'localhost',
    port:     parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? '',
    db:       parseInt(process.env.REDIS_DB ?? '0', 10),
  },
  elasticsearch: {
    url:         process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
    indexEvents: process.env.ELASTICSEARCH_INDEX_EVENTS ?? 'pulse_events',
  },
  rateLimit: {
    defaultPerMinute: parseInt(process.env.RATE_LIMIT_DEFAULT_PER_MINUTE ?? '1000', 10),
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000',
  },
});
