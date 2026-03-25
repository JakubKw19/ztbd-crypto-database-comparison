export const DB_CONFIG = {
  postgres: {
    user: "user",
    host: "localhost",
    database: "postgres_db",
    password: "password",
    port: 5432,
  },
  timescale: {
    user: "ts_user",
    host: "localhost",
    database: "timescale_db",
    password: "ts_password",
    port: 5433, // Zwróć uwagę na port z Docker Compose
  },
  mongo: {
    uri: "mongodb://mongo_admin:mongo_password@localhost:27017/crypto_db?authSource=admin",
  },
  influx: {
    url: "http://localhost:8086",
    token: "my-super-secret-token-123",
    org: "my_org",
    bucket: "crypto_bucket", // W YAML masz crypto_bucket, a nie my_bucket!
  },
};

export const BINANCE_CONFIG = {
  baseUrl: "https://api.binance.com/api/v3",
  wsUrl: "wss://stream.binance.com:9443/ws",
  defaultPair: "BTCUSDT",
};
