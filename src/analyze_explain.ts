import { Pool } from "pg";
import { MongoClient } from "mongodb";
import * as ExcelJS from "exceljs";
import { DB_CONFIG } from "./config";

// =========================================================
// ZAPYTANIA TESTOWE (Wymuszające sortowanie w pamięci RAM)
// =========================================================
const PG_QUERY = `SELECT * FROM market_ticks ORDER BY price DESC LIMIT 100;`;
const MONGO_QUERY = {};
const MONGO_SORT = { price: -1 } as const;
const ITERATIONS = 5;

// Interfejs ujednolicający wyniki do Excela
interface ExplainResult {
  database: string;
  operationType: string;
  state: string;
  scanMethod: string;
  costOrDocsExamined: string | number;
  actualAvgTimeMs: number;
  rowsReturned: number;
  performance: string;
}

// Funkcja pomocnicza do oceny wydajności dla Excela
function evaluatePerformance(scanMethod: string, avgTime: number): string {
  const methodLower = scanMethod.toLowerCase();
  // Jeśli baza musi sortować w pamięci lub robi pełne skanowanie
  if (
    methodLower.includes("seq scan") ||
    methodLower.includes("collscan") ||
    methodLower.includes("sort")
  ) {
    return "🔴 Niska (Wąskie gardło - Pełne Skanowanie/Sortowanie w RAM)";
  } else if (methodLower.includes("index") || methodLower.includes("ixscan")) {
    return avgTime < 50
      ? "🟢 Optymalna (Błyskawiczna)"
      : "🟡 Dobra (Zoptymalizowana)";
  }
  return "⚪ Nieokreślona";
}

// ---------------------------------------------------------
// 1. ANALIZA POSTGRESQL (Tabela płaska)
// ---------------------------------------------------------
async function analyzePostgres(): Promise<ExplainResult[]> {
  const pool = new Pool(DB_CONFIG.postgres);
  const results: ExplainResult[] = [];
  console.log("==========================================");
  console.log("🐘 ANALIZA EXPLAIN: POSTGRESQL (Wiarygodność statystyczna)");
  console.log("==========================================\n");

  try {
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_price CASCADE;`);
    let totalTimeBefore = 0;
    let planBefore: any = null;

    for (let i = 0; i < ITERATIONS; i++) {
      const res = await pool.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${PG_QUERY}`,
      );
      const plan = res.rows[0]["QUERY PLAN"][0].Plan;
      totalTimeBefore += plan["Actual Total Time"];
      if (i === 0) planBefore = plan;
    }
    const avgTimeBefore = Number((totalTimeBefore / ITERATIONS).toFixed(3));

    // Złapanie głównego węzła (często będzie to 'Limit -> Sort')
    let scanMethodBefore = planBefore["Node Type"];
    if (planBefore.Plans && planBefore.Plans.length > 0) {
      scanMethodBefore = `${planBefore["Node Type"]} -> ${planBefore.Plans[0]["Node Type"]}`;
    }

    console.log("🔴 PRZED OPTYMALIZACJĄ:");
    console.log(`   - Metoda: ${scanMethodBefore}`);
    console.log(`   - Średni czas (ms): ${avgTimeBefore}\n`);

    results.push({
      database: "PostgreSQL",
      operationType: "READ (Sortowanie i Limit)",
      state: "Przed Optymalizacją",
      scanMethod: scanMethodBefore,
      costOrDocsExamined: planBefore["Total Cost"],
      actualAvgTimeMs: avgTimeBefore,
      rowsReturned: planBefore["Actual Rows"],
      performance: evaluatePerformance(scanMethodBefore, avgTimeBefore),
    });

    // Tworzymy indeks z sortowaniem malejącym dla optymalizacji
    await pool.query(
      `CREATE INDEX idx_market_ticks_price ON market_ticks(price DESC);`,
    );
    let totalTimeAfter = 0;
    let planAfter: any = null;

    for (let i = 0; i < ITERATIONS; i++) {
      const res = await pool.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${PG_QUERY}`,
      );
      const plan = res.rows[0]["QUERY PLAN"][0].Plan;
      totalTimeAfter += plan["Actual Total Time"];
      if (i === 0) planAfter = plan;
    }
    const avgTimeAfter = Number((totalTimeAfter / ITERATIONS).toFixed(3));

    let scanMethodAfter = planAfter["Node Type"];
    if (planAfter.Plans && planAfter.Plans.length > 0) {
      scanMethodAfter = `${planAfter["Node Type"]} -> ${planAfter.Plans[0]["Node Type"]}`;
    }

    console.log("🟢 PO OPTYMALIZACJI:");
    console.log(`   - Metoda: ${scanMethodAfter}`);
    console.log(`   - Średni czas (ms): ${avgTimeAfter}\n`);

    results.push({
      database: "PostgreSQL",
      operationType: "READ (Sortowanie i Limit)",
      state: "Po Optymalizacji",
      scanMethod: scanMethodAfter,
      costOrDocsExamined: planAfter["Total Cost"],
      actualAvgTimeMs: avgTimeAfter,
      rowsReturned: planAfter["Actual Rows"],
      performance: evaluatePerformance(scanMethodAfter, avgTimeAfter),
    });
  } finally {
    await pool.end();
  }
  return results;
}

// ---------------------------------------------------------
// 2. ANALIZA TIMESCALEDB (Hypertable)
// ---------------------------------------------------------
async function analyzeTimescale(): Promise<ExplainResult[]> {
  const pool = new Pool(DB_CONFIG.timescale);
  const results: ExplainResult[] = [];
  console.log("==========================================");
  console.log("⏱️  ANALIZA EXPLAIN: TIMESCALEDB (Hypertable)");
  console.log("==========================================\n");

  try {
    await pool.query(`DROP INDEX IF EXISTS idx_market_ticks_price CASCADE;`);
    let totalTimeBefore = 0;
    let planBefore: any = null;

    for (let i = 0; i < ITERATIONS; i++) {
      const res = await pool.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${PG_QUERY}`,
      );
      const plan = res.rows[0]["QUERY PLAN"][0].Plan;
      totalTimeBefore += plan["Actual Total Time"];
      if (i === 0) planBefore = plan;
    }
    const avgTimeBefore = Number((totalTimeBefore / ITERATIONS).toFixed(3));

    let scanMethodBefore = planBefore["Node Type"];
    if (planBefore.Plans && planBefore.Plans.length > 0) {
      scanMethodBefore = `${planBefore["Node Type"]} -> ${planBefore.Plans[0]["Node Type"]}`;
    }

    console.log("🔴 PRZED OPTYMALIZACJĄ:");
    console.log(`   - Metoda: ${scanMethodBefore}`);
    console.log(`   - Średni czas (ms): ${avgTimeBefore}\n`);

    results.push({
      database: "TimescaleDB",
      operationType: "READ (Sortowanie i Limit)",
      state: "Przed Optymalizacją",
      scanMethod: scanMethodBefore,
      costOrDocsExamined: planBefore["Total Cost"],
      actualAvgTimeMs: avgTimeBefore,
      rowsReturned: planBefore["Actual Rows"],
      performance: evaluatePerformance(scanMethodBefore, avgTimeBefore),
    });

    await pool.query(
      `CREATE INDEX idx_market_ticks_price ON market_ticks(price DESC);`,
    );
    let totalTimeAfter = 0;
    let planAfter: any = null;

    for (let i = 0; i < ITERATIONS; i++) {
      const res = await pool.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${PG_QUERY}`,
      );
      const plan = res.rows[0]["QUERY PLAN"][0].Plan;
      totalTimeAfter += plan["Actual Total Time"];
      if (i === 0) planAfter = plan;
    }
    const avgTimeAfter = Number((totalTimeAfter / ITERATIONS).toFixed(3));

    let scanMethodAfter = planAfter["Node Type"];
    if (planAfter.Plans && planAfter.Plans.length > 0) {
      scanMethodAfter = `${planAfter["Node Type"]} -> ${planAfter.Plans[0]["Node Type"]}`;
    }

    console.log("🟢 PO OPTYMALIZACJI:");
    console.log(`   - Metoda: ${scanMethodAfter}`);
    console.log(`   - Średni czas (ms): ${avgTimeAfter}\n`);

    results.push({
      database: "TimescaleDB",
      operationType: "READ (Sortowanie i Limit)",
      state: "Po Optymalizacji",
      scanMethod: scanMethodAfter,
      costOrDocsExamined: planAfter["Total Cost"],
      actualAvgTimeMs: avgTimeAfter,
      rowsReturned: planAfter["Actual Rows"],
      performance: evaluatePerformance(scanMethodAfter, avgTimeAfter),
    });
  } finally {
    await pool.end();
  }
  return results;
}

// ---------------------------------------------------------
// 3. ANALIZA MONGODB (Kolekcja dokumentów)
// ---------------------------------------------------------
async function analyzeMongo(): Promise<ExplainResult[]> {
  const client = new MongoClient(DB_CONFIG.mongo.uri);
  const results: ExplainResult[] = [];
  await client.connect();
  const db = client.db("crypto_db");
  const collection = db.collection("market_ticks");

  console.log("==========================================");
  console.log("🍃 ANALIZA EXPLAIN: MONGODB (Model dokumentowy)");
  console.log("==========================================\n");

  try {
    try {
      await collection.dropIndex("price_-1");
    } catch (e) {}

    let totalTimeBefore = 0;
    let planBefore: any = null;
    let statsBefore: any = null;

    for (let i = 0; i < ITERATIONS; i++) {
      const explain: any = await collection
        .find(MONGO_QUERY)
        .sort(MONGO_SORT)
        .limit(100)
        .explain("executionStats");
      totalTimeBefore += explain.executionStats.executionTimeMillis;
      if (i === 0) {
        planBefore = explain.queryPlanner.winningPlan;
        statsBefore = explain.executionStats;
      }
    }
    const avgTimeBefore = Number((totalTimeBefore / ITERATIONS).toFixed(3));

    // W Mongo sortowanie bez indeksu daje etap 'SORT'
    let scanMethodBefore = planBefore.stage;
    if (planBefore.inputStage) {
      scanMethodBefore = `${planBefore.stage} -> ${planBefore.inputStage.stage}`;
    }

    console.log("🔴 PRZED OPTYMALIZACJĄ:");
    console.log(`   - Metoda skanowania: ${scanMethodBefore}`);
    console.log(`   - Średni czas wykonania (ms): ${avgTimeBefore}\n`);

    results.push({
      database: "MongoDB",
      operationType: "READ (Sortowanie i Limit)",
      state: "Przed Optymalizacją",
      scanMethod: scanMethodBefore,
      costOrDocsExamined: statsBefore.totalDocsExamined,
      actualAvgTimeMs: avgTimeBefore,
      rowsReturned: statsBefore.nReturned,
      performance: evaluatePerformance(scanMethodBefore, avgTimeBefore),
    });

    // Zakładamy indeks zgodny z kierunkiem sortowania (-1)
    await collection.createIndex({ price: -1 });

    let totalTimeAfter = 0;
    let planAfter: any = null;
    let statsAfter: any = null;

    for (let i = 0; i < ITERATIONS; i++) {
      const explain: any = await collection
        .find(MONGO_QUERY)
        .sort(MONGO_SORT)
        .limit(100)
        .explain("executionStats");
      totalTimeAfter += explain.executionStats.executionTimeMillis;
      if (i === 0) {
        planAfter = explain.queryPlanner.winningPlan;
        statsAfter = explain.executionStats;
      }
    }
    const avgTimeAfter = Number((totalTimeAfter / ITERATIONS).toFixed(3));

    let scanMethodAfter = planAfter.stage;
    if (planAfter.inputStage) {
      scanMethodAfter = `${planAfter.stage} -> ${planAfter.inputStage.stage}`;
    }

    console.log("🟢 PO OPTYMALIZACJI:");
    console.log(`   - Metoda skanowania: ${scanMethodAfter}`);
    console.log(`   - Średni czas wykonania (ms): ${avgTimeAfter}\n`);

    results.push({
      database: "MongoDB",
      operationType: "READ (Sortowanie i Limit)",
      state: "Po Optymalizacji",
      scanMethod: scanMethodAfter,
      costOrDocsExamined: statsAfter.totalDocsExamined,
      actualAvgTimeMs: avgTimeAfter,
      rowsReturned: statsAfter.nReturned,
      performance: evaluatePerformance(scanMethodAfter, avgTimeAfter),
    });
  } finally {
    await client.close();
  }
  return results;
}

// ---------------------------------------------------------
// ZBIERANIE DANYCH I ZAPIS DO EXCELA
// ---------------------------------------------------------
async function runAnalyzers() {
  const allResults: ExplainResult[] = [];

  allResults.push(...(await analyzePostgres()));
  allResults.push(...(await analyzeTimescale()));
  allResults.push(...(await analyzeMongo()));

  console.log(
    "📊 Generowanie pliku Excel z uśrednionymi wynikami i oceną Performance...",
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Analiza Wydajności", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Baza Danych", key: "database", width: 15 },
    { header: "Typ Operacji", key: "operationType", width: 28 },
    { header: "Stan Optymalizacji", key: "state", width: 25 },
    { header: "Performance (Ocena)", key: "performance", width: 55 },
    { header: "Metoda Skanowania", key: "scanMethod", width: 35 },
    { header: "Koszt / Zbadane Dok.", key: "costOrDocsExamined", width: 25 },
    { header: "ŚREDNI Czas [ms]", key: "actualAvgTimeMs", width: 20 },
    { header: "Zwrócone Wiersze", key: "rowsReturned", width: 20 },
  ];

  // Stylowanie nagłówków
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD3D3D3" },
  };

  // Wstawienie danych
  sheet.addRows(allResults);

  const fileName = `explain_performance_results_${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
  await workbook.xlsx.writeFile(fileName);

  console.log(`🎉 SUKCES! Zapisano plik: ${fileName}`);
}

runAnalyzers().catch(console.error);
