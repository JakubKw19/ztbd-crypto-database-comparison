import { Pool } from "pg";
import { DB_CONFIG } from "./config";

const schema = `
-- ==========================================
-- 1. TABELE SŁOWNIKOWE I RELACYJNE (Meta-dane)
-- ==========================================

-- Tabela 1: Giełdy
CREATE TABLE IF NOT EXISTS exchanges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    country VARCHAR(50),
    trust_score INT CHECK (trust_score BETWEEN 1 AND 10),
    api_base_url TEXT
);

-- Tabela 2: Aktywa (Kryptowaluty/Waluty FIAT)
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL UNIQUE,
    full_name VARCHAR(100),
    asset_type VARCHAR(20)
);

-- Tabela 3: Szczegóły aktywów (Relacja 1:1 z assets)
CREATE TABLE IF NOT EXISTS asset_details (
    asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    max_supply DECIMAL(32, 0),
    consensus_algorithm VARCHAR(50),
    website_url TEXT,
    description TEXT
);

-- Tabela 4: Pary handlowe
CREATE TABLE IF NOT EXISTS trading_pairs (
    id SERIAL PRIMARY KEY,
    exchange_id INTEGER REFERENCES exchanges(id) ON DELETE CASCADE,
    base_asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    quote_asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    symbol_on_exchange VARCHAR(20),
    is_active BOOLEAN DEFAULT true
);

-- ==========================================
-- 2. TABELE SZEREGÓW CZASOWYCH (TimeSeries)
-- ==========================================

-- Tabela 5: Główne notowania cenowe (Ticks)
CREATE TABLE IF NOT EXISTS market_ticks (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id) ON DELETE CASCADE,
    price DECIMAL(24, 10) NOT NULL,
    volume_24h DECIMAL(24, 10),
    last_side VARCHAR(10)
);

-- Tabela 6: Głębokość rynku (Arkusz zleceń)
CREATE TABLE IF NOT EXISTS order_book_depth (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id) ON DELETE CASCADE,
    best_bid DECIMAL(24, 10),
    best_ask DECIMAL(24, 10),
    spread DECIMAL(24, 10)
);

-- Tabela 7: Agregaty OHLC (Świece)
CREATE TABLE IF NOT EXISTS ohlc_data (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id) ON DELETE CASCADE,
    open_price DECIMAL(24, 10),
    high_price DECIMAL(24, 10),
    low_price DECIMAL(24, 10),
    close_price DECIMAL(24, 10),
    interval_minutes INT
);

-- Tabela 8: Metryki sieci blockchain (On-chain)
CREATE TABLE IF NOT EXISTS blockchain_metrics (
    time TIMESTAMPTZ NOT NULL,
    asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    active_addresses INT,
    transaction_count INT,
    average_fee_usd DECIMAL(18, 4)
);

-- Tabela 9: Likwidacje na rynku futures
CREATE TABLE IF NOT EXISTS market_liquidations (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id) ON DELETE CASCADE,
    liquidation_side VARCHAR(10),
    amount_usd DECIMAL(24, 2),
    funding_rate DECIMAL(10, 8)
);

-- Tabela 10: Logi zapytań do API
CREATE TABLE IF NOT EXISTS api_logs (
    id BIGSERIAL PRIMARY KEY,
    request_time TIMESTAMPTZ DEFAULT NOW(),
    exchange_id INTEGER REFERENCES exchanges(id) ON DELETE CASCADE,
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
      // 1. Wykonanie schematu dla 10 tabel
      await pool.query(schema);
      console.log(`✅ 10 Tables created for ${item.name}`);

      // 2. Specyficzna logika dla TimescaleDB (Zmiana tabel na hypertables)
      if (item.isTimescale) {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);

        // Lista tabel, które zawierają kolumnę 'time' i są duże
        const timeSeriesTables = [
          "market_ticks",
          "order_book_depth",
          "ohlc_data",
          "blockchain_metrics",
          "market_liquidations",
        ];

        for (const tableName of timeSeriesTables) {
          const checkHypertable = await pool.query(`
                SELECT * FROM timescaledb_information.hypertables 
                WHERE hypertable_name = '${tableName}'
            `);

          if (checkHypertable.rowCount === 0) {
            await pool.query(
              `SELECT create_hypertable('${tableName}', 'time');`,
            );
            console.log(
              `🚀 TimescaleDB: ${tableName} converted to hypertable!`,
            );
          }
        }
      }

      // 3. Wstawienie przykładowych danych (Seed słownikowy)
      await pool.query(`
        INSERT INTO exchanges (name, trust_score) VALUES ('Binance', 10) ON CONFLICT DO NOTHING;
        INSERT INTO assets (id, symbol, full_name) VALUES (1, 'BTC', 'Bitcoin'), (2, 'USDT', 'Tether') ON CONFLICT DO NOTHING;
        INSERT INTO asset_details (asset_id, max_supply, consensus_algorithm) VALUES (1, 21000000, 'PoW') ON CONFLICT DO NOTHING;
        INSERT INTO trading_pairs (id, exchange_id, base_asset_id, quote_asset_id, symbol_on_exchange) 
        VALUES (1, 1, 1, 2, 'BTCUSDT') ON CONFLICT DO NOTHING;
      `);
      console.log(`✅ Dictionary data seeded for ${item.name}`);
    } catch (err) {
      console.error(`❌ Error migrating ${item.name}:`, err);
    } finally {
      await pool.end();
    }
  }
}

migrate().catch(console.error);
