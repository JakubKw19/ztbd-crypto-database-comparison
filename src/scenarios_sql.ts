export interface BenchmarkScenario {
    id: string;
    type: "CREATE" | "READ" | "UPDATE" | "DELETE";
    name: string;
    query: string;
}

export const sqlScenarios: BenchmarkScenario[] = [
    // --- CREATE (6 scenariuszy) ---
    { id: "C1", type: "CREATE", name: "Pojedynczy INSERT (Tick)", query: `INSERT INTO market_ticks (time, pair_id, price, volume_24h, last_side) VALUES (NOW(), 1, 50000.00, 1.5, 'buy')` },
    { id: "C2", type: "CREATE", name: "Pojedynczy INSERT (Log API)", query: `INSERT INTO api_logs (exchange_id, endpoint, response_time_ms, status_code) VALUES (1, '/api/v3/ticker', 45, 200)` },
    { id: "C3", type: "CREATE", name: "INSERT z naruszeniem unikalności (UPSERT)", query: `INSERT INTO exchanges (name, trust_score) VALUES ('Binance', 10) ON CONFLICT (name) DO UPDATE SET trust_score = 10` },
    { id: "C4", type: "CREATE", name: "Wstawienie do Order Book", query: `INSERT INTO order_book_depth (time, pair_id, best_bid, best_ask, spread) VALUES (NOW(), 1, 49999.0, 50001.0, 2.0)` },
    { id: "C5", type: "CREATE", name: "Wstawienie agregatu OHLC", query: `INSERT INTO ohlc_data (time, pair_id, open_price, high_price, low_price, close_price) VALUES (NOW(), 1, 50000, 51000, 49000, 50500)` },
    { id: "C6", type: "CREATE", name: "Masowy INSERT (Batch 5 rekordów - symulacja)", query: `INSERT INTO market_ticks (time, pair_id, price) VALUES (NOW(), 1, 100), (NOW(), 1, 101), (NOW(), 1, 102), (NOW(), 1, 103), (NOW(), 1, 104)` },

    // --- READ (6 scenariuszy) ---
    { id: "R1", type: "READ", name: "Prosty SELECT z limitem", query: `SELECT * FROM market_ticks ORDER BY time DESC LIMIT 1000` },
    { id: "R2", type: "READ", name: "Filtrowanie po czasie", query: `SELECT * FROM market_ticks WHERE time >= NOW() - INTERVAL '7 days'` },
    { id: "R3", type: "READ", name: "Agregacja (AVG, MAX, MIN)", query: `SELECT AVG(price), MAX(price), MIN(price) FROM market_ticks WHERE pair_id = 1` },
    { id: "R4", type: "READ", name: "Złożony JOIN (3 tabele)", query: `SELECT e.name, t.price, t.time FROM market_ticks t JOIN trading_pairs p ON t.pair_id = p.id JOIN exchanges e ON p.exchange_id = e.id WHERE t.price > 40000 LIMIT 1000` },
    { id: "R5", type: "READ", name: "Grupowanie (Time Bucket - wolumen per para)", query: `SELECT pair_id, SUM(volume_24h) FROM market_ticks GROUP BY pair_id` },
    { id: "R6", type: "READ", name: "Podzapytanie (Ceny wyższe niż średnia)", query: `SELECT price FROM market_ticks WHERE price > (SELECT AVG(price) FROM market_ticks) LIMIT 500` },

    // --- UPDATE (6 scenariuszy) ---
    { id: "U1", type: "UPDATE", name: "Masowy UPDATE po warunku cenowym", query: `UPDATE market_ticks SET volume_24h = volume_24h * 1.1 WHERE price < 30000` },
    { id: "U2", type: "UPDATE", name: "Punktowy UPDATE po stringu", query: `UPDATE trading_pairs SET is_active = false WHERE symbol_on_exchange = 'BTCUSDT'` },
    { id: "U3", type: "UPDATE", name: "Aktualizacja słownika (exchanges)", query: `UPDATE exchanges SET trust_score = 9 WHERE name = 'Binance'` },
    { id: "U4", type: "UPDATE", name: "Zmiana statusu w logach", query: `UPDATE api_logs SET status_code = 500 WHERE response_time_ms > 5000` },
    { id: "U5", type: "UPDATE", name: "Aktualizacja na podstawie daty", query: `UPDATE market_ticks SET last_side = 'unknown' WHERE time < NOW() - INTERVAL '30 days'` },
    { id: "U6", type: "UPDATE", name: "Aktualizacja wykorzystująca JOIN", query: `UPDATE trading_pairs SET is_active = false WHERE exchange_id IN (SELECT id FROM exchanges WHERE trust_score < 5)` },

    // --- DELETE (6 scenariuszy) ---
    { id: "D1", type: "DELETE", name: "Czyszczenie starych logów", query: `DELETE FROM api_logs WHERE response_time_ms > 1000` },
    { id: "D2", type: "DELETE", name: "Usuwanie anomalii cenowych", query: `DELETE FROM market_ticks WHERE price <= 0 OR volume_24h <= 0` },
    { id: "D3", type: "DELETE", name: "Usuwanie danych starszych niż rok", query: `DELETE FROM market_ticks WHERE time < NOW() - INTERVAL '1 year'` },
    { id: "D4", type: "DELETE", name: "Punktowy DELETE (Pusta giełda)", query: `DELETE FROM exchanges WHERE name = 'FakeExchange'` },
    { id: "D5", type: "DELETE", name: "Czyszczenie arkusza zleceń dla pary", query: `DELETE FROM order_book_depth WHERE pair_id = 999` },
    { id: "D6", type: "DELETE", name: "Usuwanie błędnych statusów API", query: `DELETE FROM api_logs WHERE status_code = 404` }
];