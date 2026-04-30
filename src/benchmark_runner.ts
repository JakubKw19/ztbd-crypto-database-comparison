import * as ExcelJS from "exceljs";
import { DB_CONFIG } from "./config";
import { runBenchmarkPG } from "./benchmark_pg";
import { runBenchmarkMongo } from "./benchmark_mongo";
import { runBenchmarkInflux } from "./benchmark_influx";
import { BenchmarkResult } from "./benchmark_types";

async function main() {
  console.log("==================================================");
  console.log("🚀 ROZPOCZYNANIE GLOBALNEGO BENCHMARKU WSZYSTKICH BAZ");
  console.log("==================================================");

  const allResults: BenchmarkResult[] = [];

  // 1. PostgreSQL
  const pgResults = await runBenchmarkPG("PostgreSQL", DB_CONFIG.postgres);
  allResults.push(...pgResults);

  // 2. TimescaleDB
  const tsResults = await runBenchmarkPG("TimescaleDB", DB_CONFIG.timescale);
  allResults.push(...tsResults);

  // 3. MongoDB
  const mongoResults = await runBenchmarkMongo();
  allResults.push(...mongoResults);

  // 4. InfluxDB
  const influxResults = await runBenchmarkInflux();
  allResults.push(...influxResults);

  console.log("\n✅ Testy zakończone. Zapisywanie do Excela...");

  // --- TWORZENIE PLIKU EXCEL ---
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Wyniki Benchmarku", {
    views: [{ state: "frozen", ySplit: 1 }], // Zamrożenie pierwszego wiersza (nagłówków)
  });

  // Definiowanie kolumn
  sheet.columns = [
    { header: "Baza Danych", key: "database", width: 20 },
    { header: "ID", key: "id", width: 8 },
    { header: "Typ Operacji", key: "type", width: 15 },
    { header: "Opis Scenariusza", key: "name", width: 50 },
    { header: "Czas: Bez Indeksów [ms]", key: "timeBefore", width: 25 },
    { header: "Czas: Z Indeksami [ms]", key: "timeAfter", width: 25 },
    { header: "Zysk optymalizacyjny", key: "difference", width: 20 },
  ];

  // Kolorowanie i pogrubienie nagłówka
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD3D3D3" },
  };

  // Wrzucanie wyników z tablicy
  sheet.addRows(allResults);

  // Zapisanie pliku na dysku
  const fileName = `benchmark_results_${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
  await workbook.xlsx.writeFile(fileName);

  console.log(`\n🎉 SUKCES! Plik zapisany jako: ${fileName}`);
  console.log(
    "Możesz go teraz otworzyć w programie Microsoft Excel lub Google Sheets.",
  );
}

main().catch(console.error);
