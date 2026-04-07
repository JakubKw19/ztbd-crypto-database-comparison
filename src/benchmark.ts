import { Pool } from "pg";
import { performance } from "perf_hooks";
import { DB_CONFIG } from "./config";

// --- STRUKTURA SCENARIUSZA TESTOWEGO ---
interface BenchmarkScenario {
  id: string;
  type: "CREATE" | "READ" | "UPDATE" | "DELETE";
  name: string;
  query: string;
  params?: any[];
}

// --- DEFINICJA SCENARIUSZY (Przykładowe 8 z 24 wymaganych) ---
const scenarios: BenchmarkScenario[] = [
  // CREATE
  {
    id: "C1",
    type: "CREATE",
    name: "Pojedynczy INSERT (Tick)",
    query: `INSERT INTO market_ticks (time, pair_id, price, volume_24h, last_side) VALUES (NOW(), 1, 50000.00, 1.5, 'buy')`,
  },
  {
    id: "C2",
    type: "CREATE",
    name: "Pojedynczy INSERT (Log API)",
    query: `INSERT INTO api_logs (exchange_id, endpoint, response_time_ms, status_code) VALUES (1, '/api/v3/ticker', 45, 200)`,
  },
  // READ
  {
    id: "R1",
    type: "READ",
    name: "Złożony JOIN 3 tabel (Filtrowanie ceny)",
    query: `
            SELECT e.name, t.price, t.time 
            FROM market_ticks t
            JOIN trading_pairs p ON t.pair_id = p.id
            JOIN exchanges e ON p.exchange_id = e.id
            WHERE t.price > 40000 LIMIT 1000;
        `,
  },
  {
    id: "R2",
    type: "READ",
    name: "Agregacja (Średnia cena dla pary)",
    query: `SELECT AVG(price) as avg_price, MAX(price) as max_price FROM market_ticks WHERE pair_id = 1`,
  },
  // UPDATE
  {
    id: "U1",
    type: "UPDATE",
    name: "Masowy UPDATE (Zmiana wolumenu wg warunku)",
    query: `UPDATE market_ticks SET volume_24h = volume_24h * 1.1 WHERE price < 30000`,
  },
  {
    id: "U2",
    type: "UPDATE",
    name: "Punktowy UPDATE (Zmiana statusu pary)",
    query: `UPDATE trading_pairs SET is_active = false WHERE symbol_on_exchange = 'BTCUSDT'`,
  },
  // DELETE
  {
    id: "D1",
    type: "DELETE",
    name: "Masowy DELETE (Czyszczenie starych logów)",
    query: `DELETE FROM api_logs WHERE response_time_ms > 1000`,
  },
  {
    id: "D2",
    type: "DELETE",
    name: "Usuwanie anomalii cenowych",
    query: `DELETE FROM market_ticks WHERE price < 0 OR volume_24h < 0`,
  },
  // TODO: Skopiuj i dodaj kolejne 16 zapytań wg schematu, aby mieć 24 (min. 6 per CRUD).
];

// --- SILNIK TESTOWY ---
async function runTestWithAverage(
  pool: Pool,
  query: string,
  params: any[] = [],
): Promise<{ avgTime: number; explainPlan: string }> {
  const times: number[] = [];
  let explainPlan = "Brak (Operacja DML lub błąd)";

  // 1. Zbieranie planu zapytania (tylko dla SELECT/UPDATE/DELETE)
  try {
    if (!query.toUpperCase().trim().startsWith("INSERT")) {
      const explainResult = await pool.query(
        `EXPLAIN ANALYZE ${query}`,
        params,
      );
      explainPlan = explainResult.rows.map((r) => r["QUERY PLAN"]).join("\n");
    }
  } catch (e) {
    explainPlan = "Nie można wygenerować EXPLAIN (sprawdź składnię).";
  }

  // 2. Wykonanie 3 prób (Wymóg pkt. 6)
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await pool.query(query, params);
    const end = performance.now();
    times.push(end - start);
  }

  // 3. Obliczanie średniej
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  return { avgTime, explainPlan };
}

// --- GŁÓWNA LOGIKA BENCHMARKU ---
async function runBenchmark() {
  // Łączymy się z bazą testową (wybierz Postgres lub Timescale)
  const pool = new Pool(DB_CONFIG.postgres);

  console.log("==========================================");
  console.log("🚀 ROZPOCZĘCIE BENCHMARKU (Standard Postgres)");
  console.log("==========================================\n");

  try {
    // KROK 1: Usunięcie indeksów (Stan surowy)
    console.log("🧹 Czyszczenie indeksów (Stan przed optymalizacją)...");
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_pair_id CASCADE;`);
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_price CASCADE;`);
    console.log("✅ Indeksy usunięte.\n");

    // KROK 2: Testy BEZ INDEKSÓW
    console.log("📊 FAZA 1: Testy BEZ indeksów");
    const resultsBefore = new Map<string, number>();

    for (const s of scenarios) {
      console.log(`Testowanie [${s.id}] ${s.name}...`);
      const res = await runTestWithAverage(pool, s.query, s.params);
      resultsBefore.set(s.id, res.avgTime);
      console.log(`   -> Średni czas: ${res.avgTime.toFixed(2)} ms`);

      if (s.type === "READ") {
        console.log(
          `   -> Fragment EXPLAIN: ${res.explainPlan.substring(0, 150)}...`,
        );
      }
    }

    // KROK 3: Założenie indeksów (Optymalizacja)
    console.log("\n⚙️ Zakładanie indeksów (Optymalizacja)...");
    const indexStart = performance.now();
    await pool.query(
      `CREATE INDEX idx_market_ticks_pair_id ON market_ticks(pair_id);`,
    );
    await pool.query(
      `CREATE INDEX idx_market_ticks_price ON market_ticks(price);`,
    );
    const indexEnd = performance.now();
    console.log(
      `✅ Indeksy utworzone w ${((indexEnd - indexStart) / 1000).toFixed(2)} sek.\n`,
    );

    // KROK 4: Testy Z INDEKSAMI
    console.log("📊 FAZA 2: Testy Z indeksami");
    console.log("---------------------------------------------------------");
    console.log(
      String("ID").padEnd(5) +
        String("Typ").padEnd(10) +
        String("Czas BEZ [ms]").padEnd(15) +
        String("Czas Z [ms]").padEnd(15) +
        String("Zysk").padEnd(10),
    );
    console.log("---------------------------------------------------------");

    for (const s of scenarios) {
      const res = await runTestWithAverage(pool, s.query, s.params);
      const timeBefore = resultsBefore.get(s.id) || 0;
      const timeAfter = res.avgTime;

      // Obliczanie procentowej różnicy
      let diff = "";
      if (timeBefore > timeAfter) {
        const percent = ((timeBefore - timeAfter) / timeBefore) * 100;
        diff = `🔥 -${percent.toFixed(1)}%`;
      } else {
        diff = `🐌 Wolniej`; // Typowe dla INSERT/UPDATE po dodaniu indeksów
      }

      console.log(
        String(s.id).padEnd(5) +
          String(s.type).padEnd(10) +
          String(timeBefore.toFixed(2)).padEnd(15) +
          String(timeAfter.toFixed(2)).padEnd(15) +
          diff,
      );

      // Zapisz/wyświetl EXPLAIN dla testów READ po indeksach (żeby udowodnić Index Scan)
      if (s.id === "R1") {
        console.log(
          `\n🔍 Dowód EXPLAIN dla R1 po dodaniu indeksów:\n${res.explainPlan}\n`,
        );
      }
    }
  } catch (err) {
    console.error("❌ Błąd podczas benchmarku:", err);
  } finally {
    await pool.end();
    console.log("\n🏁 Benchmark zakończony.");
  }
}

runBenchmark();
