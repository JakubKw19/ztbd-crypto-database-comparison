import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { performance } from "perf_hooks";
import { DB_CONFIG } from "./config";

const fluxQueries = [
    { id: "R1", name: "Pobranie ostatnich danych", query: `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -30d) |> filter(fn: (r) => r._measurement == "market_ticks") |> limit(n: 1000)` },
    { id: "R2", name: "Filtrowanie cen > 40k", query: `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -30d) |> filter(fn: (r) => r._field == "price" and r._value > 40000) |> limit(n: 1000)` },
    { id: "R3", name: "Agregacja AVG", query: `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -30d) |> filter(fn: (r) => r._field == "price") |> mean()` },
    { id: "R4", name: "Agregacja MAX", query: `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -30d) |> filter(fn: (r) => r._field == "price") |> max()` },
    { id: "R5", name: "Grupowanie w oknach (Windowing)", query: `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -30d) |> filter(fn: (r) => r._field == "volume") |> aggregateWindow(every: 1h, fn: sum)` },
    { id: "R6", name: "Zliczanie rekordów (Count)", query: `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -30d) |> filter(fn: (r) => r._measurement == "market_ticks") |> count()` }
];

async function runBenchmarkInflux() {
    const influx = new InfluxDB({ url: DB_CONFIG.influx.url, token: DB_CONFIG.influx.token });
    const queryApi = influx.getQueryApi(DB_CONFIG.influx.org);
    const writeApi = influx.getWriteApi(DB_CONFIG.influx.org, DB_CONFIG.influx.bucket, 'ms');

    console.log("🚀 BENCHMARK: INFLUXDB");
    console.log("Uwaga: InfluxDB automatycznie indeksuje tagi. Update polega na nadpisaniu, a Delete robi się via API.");

    try {
        // --- CREATE (Zapis) ---
        console.log("\n[CREATE] Testowanie masowego zapisu...");
        const timesC = [];
        for (let i = 0; i < 3; i++) {
            const start = performance.now();
            const points = Array.from({ length: 1000 }).map(() => new Point('market_ticks').tag('pair_id', '1').floatField('price', 50000).timestamp(new Date()));
            writeApi.writePoints(points);
            await writeApi.flush();
            timesC.push(performance.now() - start);
        }
        console.log(`[C1-C6] Średni czas Batch Create (1000): ${(timesC.reduce((a, b) => a + b) / 3).toFixed(2)} ms`);

        // --- READ (Odczyt Flux) ---
        console.log("\n[READ] Testowanie zapytań Flux...");
        for (const s of fluxQueries) {
            const timesR = [];
            for (let i = 0; i < 3; i++) {
                const start = performance.now();
                await new Promise<void>((resolve, reject) => {
                    queryApi.queryRows(s.query, { next: () => { }, error: reject, complete: resolve });
                });
                timesR.push(performance.now() - start);
            }
            console.log(`[${s.id}] ${s.name}: ${(timesR.reduce((a, b) => a + b) / 3).toFixed(2)} ms`);
        }

        // --- UPDATE (Nadpisywanie) ---
        console.log("\n[UPDATE] Testowanie Update (Nadpisywanie punktów)...");
        const specificTime = new Date('2023-01-01T00:00:00Z');
        const startU = performance.now();
        writeApi.writePoint(new Point('market_ticks').tag('pair_id', '1').floatField('price', 99999).timestamp(specificTime));
        await writeApi.flush();
        console.log(`[U1-U6] Średni czas Update (Point Overwrite): ${(performance.now() - startU).toFixed(2)} ms`);

    } catch (err) {
        console.error("Błąd InfluxDB:", err);
    } finally {
        await writeApi.close();
    }
}

runBenchmarkInflux();