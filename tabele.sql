-- 1. Tabela Giełd
CREATE TABLE exchanges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    country VARCHAR(50),
    trust_score INT CHECK (trust_score BETWEEN 1 AND 10),
    api_base_url TEXT
);

-- 2. Tabela Aktywów (Kryptowalut/Walut)
CREATE TABLE assets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL UNIQUE, -- np. BTC
    full_name VARCHAR(100),
    asset_type VARCHAR(20) -- np. 'crypto', 'fiat', 'stablecoin'
);

-- 3. Tabela Szczegółów Aktywów (Relacja 1:1 z assets)
CREATE TABLE asset_details (
    asset_id INTEGER PRIMARY KEY REFERENCES assets(id),
    max_supply DECIMAL,
    consensus_algorithm VARCHAR(50), -- np. 'PoW', 'PoS'
    website_url TEXT,
    description TEXT
);

-- 4. Tabela Par Handlowych (Łącznik giełdy i aktywów)
CREATE TABLE trading_pairs (
    id SERIAL PRIMARY KEY,
    exchange_id INTEGER REFERENCES exchanges(id),
    base_asset_id INTEGER REFERENCES assets(id),
    quote_asset_id INTEGER REFERENCES assets(id),
    symbol_on_exchange VARCHAR(20), -- np. 'BTCUSDT'
    is_active BOOLEAN DEFAULT true
);

-- 5. Tabela Notowań (Market Ticks) - Główna tabela szeregów czasowych
CREATE TABLE market_ticks (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id),
    price DECIMAL(24, 10) NOT NULL,
    volume_24h DECIMAL(24, 10),
    last_side VARCHAR(10) -- 'buy' lub 'sell'
);

-- 6. Tabela Arkusza Zleceń (Order Book Depth)
CREATE TABLE order_book_depth (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id),
    best_bid DECIMAL(24, 10),
    best_ask DECIMAL(24, 10),
    spread DECIMAL(24, 10)
);

-- 7. Tabela Agregatów OHLC (Open, High, Low, Close)
CREATE TABLE ohlc_data (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id),
    open_price DECIMAL(24, 10),
    high_price DECIMAL(24, 10),
    low_price DECIMAL(24, 10),
    close_price DECIMAL(24, 10),
    bucket_interval_minutes INT -- np. 1, 5, 15, 60
);

-- 8. Tabela Wskaźników Technicznych
CREATE TABLE technical_indicators (
    time TIMESTAMPTZ NOT NULL,
    pair_id INTEGER REFERENCES trading_pairs(id),
    rsi_14 DECIMAL(10, 5),
    sma_50 DECIMAL(24, 10),
    ema_200 DECIMAL(24, 10)
);

-- 9. Tabela Sentymentu Społecznego
CREATE TABLE social_sentiment (
    time TIMESTAMPTZ NOT NULL,
    asset_id INTEGER REFERENCES assets(id),
    sentiment_score DECIMAL(5, 2), -- skala -1.0 do 1.0
    mention_count INT,
    source_name VARCHAR(30) -- np. 'Twitter', 'Reddit'
);

-- 10. Tabela Logów API (Do testów opóźnień)
CREATE TABLE api_logs (
    id BIGSERIAL PRIMARY KEY,
    request_time TIMESTAMPTZ DEFAULT NOW(),
    exchange_id INTEGER REFERENCES exchanges(id),
    endpoint TEXT,
    response_time_ms INT,
    status_code INT
);