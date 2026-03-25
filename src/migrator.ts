import { Pool } from "pg";
import { DB_CONFIG } from "./config";

const schema = `
-- 1. Tabele podstawowe
CREATE TABLE IF NOT EXISTS exchanges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    country VARCHAR(50),
    trust_score INT CHECK (trust_score BETWEEN 1 AND 10),
    api_base_url TEXT
);

CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL UNIQUE,
    full_name VARCHAR(100),
    asset_type VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS trading_pairs (
    id SERIAL PRIMARY KEY,
    exchange_id INTEGER REFERENCES exchanges(id),
    base_asset_id INTEGER REFERENCES assets(id),
    quote_asset_id INTEGER REFERENCES assets(id),
    symbol_on_exchange VARCHAR(20),
    is_active BOOLEAN DEFAULT true
);

-- 2. Tabele szeregów czasowych
CREATE TABLE IF NOT EXISTS market_ticks (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id),
    price DECIMAL(24, 10) NOT NULL,
    volume_24h DECIMAL(24, 10),
    last_side VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS api_logs (
    id BIGSERIAL PRIMARY KEY,
    request_time TIMESTAMPTZ DEFAULT NOW(),
    exchange_id INTEGER REFERENCES exchanges(id),
    endpoint TEXT,
    response_time_ms INT,
    status_code INT
);
`;

async function migrate() {
  const configs = [
    { name: "Standard Postgres", config: DB_CONFIG.postgres },
    { name: "TimescaleDB", config: DB_CONFIG.timescale, isTimescale: true },
  ];

  for (const item of configs) {
    const pool = new Pool(item.config);
    console.log(`\n🛠️  Migrating ${item.name}...`);

    try {
      // Wykonanie schematu
      await pool.query(schema);
      console.log(`✅ Tables created for ${item.name}`);

      if (item.isTimescale) {
        // Specyficzna logika dla TimescaleDB
        await pool.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);

        // Sprawdzamy czy tabela jest już hypertable, żeby nie rzuciło błędem
        const checkHypertable = await pool.query(`
                    SELECT * FROM timescaledb_information.hypertables 
                    WHERE hypertable_name = 'market_ticks'
                `);

        if (checkHypertable.rowCount === 0) {
          await pool.query(`SELECT create_hypertable('market_ticks', 'time');`);
          console.log(`🚀 TimescaleDB: market_ticks converted to hypertable!`);
        }
      }

      // Opcjonalne: Wstawienie przykładowych danych (Seed)
      await pool.query(`
                INSERT INTO exchanges (name, trust_score) VALUES ('Binance', 10) ON CONFLICT DO NOTHING;
                INSERT INTO assets (symbol, full_name) VALUES ('BTC', 'Bitcoin'), ('USDT', 'Tether') ON CONFLICT DO NOTHING;
                INSERT INTO trading_pairs (exchange_id, base_asset_id, quote_asset_id, symbol_on_exchange) 
                VALUES (1, 1, 2, 'BTCUSDT') ON CONFLICT DO NOTHING;
            `);
    } catch (err) {
      console.error(`❌ Error migrating ${item.name}:`, err);
    } finally {
      await pool.end();
    }
  }
}

migrate().catch(console.error);
