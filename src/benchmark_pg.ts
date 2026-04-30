import { Pool } from "pg";
import { performance } from "perf_hooks";
import { sqlScenarios } from "./scenarios_sql";
import { BenchmarkResult } from "./benchmark_types";

async function runTestWithAverage(
  pool: Pool,
  query: string,
): Promise<{ avgTime: number }> {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await pool.query(query);
    const end = performance.now();
    times.push(end - start);
  }
  return { avgTime: times.reduce((a, b) => a + b, 0) / times.length };
}

export async function runBenchmarkPG(
  dbName: string,
  dbConfig: any,
): Promise<BenchmarkResult[]> {
  const pool = new Pool(dbConfig);
  const results: BenchmarkResult[] = [];
  console.log(`\n⏳ Uruchamianie testów dla: ${dbName}...`);

  try {
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_pair_id CASCADE;`);
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_price CASCADE;`);

    const beforeMap = new Map<string, number>();
    for (const s of sqlScenarios) {
      const res = await runTestWithAverage(pool, s.query);
      beforeMap.set(s.id, res.avgTime);
    }

    await pool.query(
      `CREATE INDEX idx_market_ticks_pair_id ON market_ticks(pair_id);`,
    );
    await pool.query(
      `CREATE INDEX idx_market_ticks_price ON market_ticks(price);`,
    );

    for (const s of sqlScenarios) {
      const resAfter = await runTestWithAverage(pool, s.query);
      const timeBefore = beforeMap.get(s.id) || 0;
      const timeAfter = resAfter.avgTime;

      let diff =
        timeBefore > timeAfter
          ? `-${(((timeBefore - timeAfter) / timeBefore) * 100).toFixed(1)}%`
          : `Wolniej`;

      results.push({
        database: dbName,
        id: s.id,
        type: s.type,
        name: s.name,
        timeBefore: Number(timeBefore.toFixed(2)),
        timeAfter: Number(timeAfter.toFixed(2)),
        difference: diff,
      });
    }
  } finally {
    await pool.end();
  }
  return results;
}
