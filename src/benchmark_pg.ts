import { Pool } from "pg";
import { performance } from "perf_hooks";
import { DB_CONFIG } from "./config";
import { sqlScenarios } from "./scenarios_sql";

async function runTestWithAverage(pool: Pool, query: string): Promise<{ avgTime: number; explainPlan: string }> {
  const times: number[] = [];
  let explainPlan = "Brak (Operacja DML)";

  try {
    if (!query.toUpperCase().trim().startsWith("INSERT")) {
      const explainResult = await pool.query(`EXPLAIN ANALYZE ${query}`);
      explainPlan = explainResult.rows.map((r) => r["QUERY PLAN"]).join("\n");
    }
  } catch (e) {
    explainPlan = "Brak planu (błąd lub DML)";
  }

  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await pool.query(query);
    const end = performance.now();
    times.push(end - start);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  return { avgTime, explainPlan };
}

async function runBenchmarkPG() {
  // Zmień na DB_CONFIG.timescale dla testów TimescaleDB
  const pool = new Pool(DB_CONFIG.postgres);
  console.log("🚀 BENCHMARK: POSTGRESQL (24 Scenariusze)");

  try {
    // Testy przed optymalizacją
    console.log("🧹 Usuwanie indeksów...");
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_pair_id CASCADE;`);
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_price CASCADE;`);

    const resultsBefore = new Map<string, number>();
    console.log("\n📊 FAZA 1: BEZ INDEKSÓW");
    for (const s of sqlScenarios) {
      const res = await runTestWithAverage(pool, s.query);
      resultsBefore.set(s.id, res.avgTime);
      console.log(`[${s.id}] ${s.name}: ${res.avgTime.toFixed(2)} ms`);
    }

    // Testy po optymalizacji
    console.log("\n⚙️ Zakładanie indeksów...");
    await pool.query(`CREATE INDEX idx_market_ticks_pair_id ON market_ticks(pair_id);`);
    await pool.query(`CREATE INDEX idx_market_ticks_price ON market_ticks(price);`);

    console.log("\n📊 FAZA 2: Z INDEKSAMI");
    for (const s of sqlScenarios) {
      const res = await runTestWithAverage(pool, s.query);
      const timeBefore = resultsBefore.get(s.id) || 0;
      const diff = timeBefore > res.avgTime ? `🔥 -${(((timeBefore - res.avgTime) / timeBefore) * 100).toFixed(1)}%` : `🐌 Wolniej`;

      console.log(`[${s.id}] Czas: ${res.avgTime.toFixed(2)} ms | Różnica: ${diff}`);
    }
  } catch (err) {
    console.error("Błąd bazy:", err);
  } finally {
    await pool.end();
  }
}

runBenchmarkPG();