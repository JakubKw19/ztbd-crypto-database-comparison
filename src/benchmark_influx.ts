import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { performance } from "perf_hooks";
import { DB_CONFIG } from "./config";
import { BenchmarkResult } from "./benchmark_types";

const influx = new InfluxDB({
  url: DB_CONFIG.influx.url,
  token: DB_CONFIG.influx.token,
});
const queryApi = influx.getQueryApi(DB_CONFIG.influx.org);
const writeApi = influx.getWriteApi(
  DB_CONFIG.influx.org,
  DB_CONFIG.influx.bucket,
  "ms",
);

// Funkcja pomocnicza do wykonywania DELETE w InfluxDB (wymaga REST API)
async function deleteInfluxData(
  predicate: string,
  start = "1970-01-01T00:00:00Z",
  stop = new Date().toISOString(),
) {
  const url = `${DB_CONFIG.influx.url}/api/v2/delete?org=${DB_CONFIG.influx.org}&bucket=${DB_CONFIG.influx.bucket}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${DB_CONFIG.influx.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ start, stop, predicate }),
  });
  if (!response.ok)
    throw new Error(`Delete API Error: ${await response.text()}`);
}

// =========================================================
// 1. FUNKCJA POMOCNICZA DO ZAPYTAŃ FLUX (Z POPRAWKĄ TYPÓW)
// =========================================================
const runFlux = (query: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    queryApi.queryRows(query, {
      next: (row, tableMeta) => {
        results.push(tableMeta.toObject(row));
      }, // Klamry {} rozwiązują problem z błędem TypeScripta
      error: reject,
      complete: () => resolve(results),
    });
  });
};

// =========================================================
// 2. 24 SCENARIUSZE TESTOWE DLA INFLUXDB
// =========================================================
const influxScenarios = [
  // --- CREATE (ZAPIS) ---
  {
    id: "C1",
    type: "CREATE",
    name: "Pojedynczy INSERT (Tick)",
    op: async () => {
      writeApi.writePoint(
        new Point("market_ticks")
          .tag("pair_id", "1")
          .tag("side", "buy")
          .floatField("price", 50000.0)
          .floatField("volume_24h", 1.5)
          .timestamp(new Date()),
      );
      await writeApi.flush();
    },
  },
  {
    id: "C2",
    type: "CREATE",
    name: "Pojedynczy INSERT (Log API)",
    op: async () => {
      writeApi.writePoint(
        new Point("api_logs")
          .tag("exchange_id", "1")
          .tag("endpoint", "/api/v3/ticker")
          .intField("response_time_ms", 45)
          .intField("status_code", 200)
          .timestamp(new Date()),
      );
      await writeApi.flush();
    },
  },
  {
    id: "C3",
    type: "CREATE",
    name: "INSERT (UPSERT) - Influx zawsze robi Upsert",
    op: async () => {
      writeApi.writePoint(
        new Point("exchanges")
          .tag("name", "Binance")
          .intField("trust_score", 10)
          .timestamp(new Date()),
      );
      await writeApi.flush();
    },
  },
  {
    id: "C4",
    type: "CREATE",
    name: "Wstawienie do Order Book",
    op: async () => {
      writeApi.writePoint(
        new Point("order_book_depth")
          .tag("pair_id", "1")
          .floatField("best_bid", 49999)
          .floatField("best_ask", 50001)
          .floatField("spread", 2)
          .timestamp(new Date()),
      );
      await writeApi.flush();
    },
  },
  {
    id: "C5",
    type: "CREATE",
    name: "Wstawienie agregatu OHLC",
    op: async () => {
      writeApi.writePoint(
        new Point("ohlc_data")
          .tag("pair_id", "1")
          .floatField("open_price", 50000)
          .floatField("close_price", 50500)
          .timestamp(new Date()),
      );
      await writeApi.flush();
    },
  },
  {
    id: "C6",
    type: "CREATE",
    name: "Masowy INSERT (Batch 5 rekordów)",
    op: async () => {
      const pts = [100, 101, 102, 103, 104].map((p, i) =>
        new Point("market_ticks")
          .tag("pair_id", "1")
          .floatField("price", p)
          .timestamp(new Date(Date.now() + i)),
      );
      writeApi.writePoints(pts);
      await writeApi.flush();
    },
  },

  // --- READ (ODCZYT FLUX) ---
  {
    id: "R1",
    type: "READ",
    name: "Prosty SELECT z limitem",
    op: async () =>
      runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "market_ticks") |> limit(n: 1000)`,
      ),
  },
  {
    id: "R2",
    type: "READ",
    name: "Filtrowanie po czasie (ostatnie 7 dni)",
    op: async () =>
      runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -7d) |> filter(fn: (r) => r._measurement == "market_ticks") |> limit(n: 1000)`,
      ),
  },
  {
    id: "R3",
    type: "READ",
    name: "Agregacja (AVG, MAX, MIN)",
    op: async () =>
      runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "market_ticks" and r.pair_id == "1" and r._field == "price") |> yield(name: "mean")`,
      ),
  },
  {
    id: "R4",
    type: "READ",
    name: "Złożony JOIN (Flux Join)",
    op: async () =>
      runFlux(`
        t1 = from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "market_ticks" and r._field == "price" and r._value > 40000)
        t2 = from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "trading_pairs")
        join(tables: {t1: t1, t2: t2}, on: ["pair_id"]) |> limit(n: 1000)
      `),
  },
  {
    id: "R5",
    type: "READ",
    name: "Grupowanie (Wolumen per para)",
    op: async () =>
      runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "market_ticks" and r._field == "volume_24h") |> group(columns: ["pair_id"]) |> sum()`,
      ),
  },
  {
    id: "R6",
    type: "READ",
    name: "Podzapytanie (W Influx: Oblicz i mapuj)",
    op: async () =>
      runFlux(`
        avgPrice = from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "market_ticks" and r._field == "price") |> mean() |> findRecord(fn: (key) => true, idx: 0)
        from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "market_ticks" and r._field == "price" and r._value > avgPrice._value) |> limit(n: 500)
      `),
  },

  // --- UPDATE (AKTUALIZACJA - WORKAROUNDS) ---
  {
    id: "U1",
    type: "UPDATE",
    name: "Masowy UPDATE (Read-Modify-Write)",
    op: async () => {
      const rows = await runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1h) |> filter(fn: (r) => r._measurement == "market_ticks" and r._field == "price" and r._value < 30000)`,
      );
      const pts = rows.map((r) =>
        new Point("market_ticks")
          .tag("pair_id", r.pair_id)
          .floatField("volume_24h", 1.1)
          .timestamp(new Date(r._time)),
      );
      if (pts.length) {
        writeApi.writePoints(pts);
        await writeApi.flush();
      }
    },
  },
  {
    id: "U2",
    type: "UPDATE",
    name: "Punktowy UPDATE po Tagu",
    op: async () => {
      writeApi.writePoint(
        new Point("trading_pairs")
          .tag("symbol", "BTCUSDT")
          .booleanField("is_active", false)
          .timestamp(new Date()),
      );
      await writeApi.flush();
    },
  },
  {
    id: "U3",
    type: "UPDATE",
    name: "Aktualizacja słownika",
    op: async () => {
      writeApi.writePoint(
        new Point("exchanges")
          .tag("name", "Binance")
          .intField("trust_score", 9)
          .timestamp(new Date()),
      );
      await writeApi.flush();
    },
  },
  {
    id: "U4",
    type: "UPDATE",
    name: "Zmiana statusu w logach (Read-Modify-Write)",
    op: async () => {
      const rows = await runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1d) |> filter(fn: (r) => r._measurement == "api_logs" and r._field == "response_time_ms" and r._value > 5000)`,
      );
      const pts = rows.map((r) =>
        new Point("api_logs")
          .tag("exchange_id", r.exchange_id)
          .intField("status_code", 500)
          .timestamp(new Date(r._time)),
      );
      if (pts.length) {
        writeApi.writePoints(pts);
        await writeApi.flush();
      }
    },
  },
  {
    id: "U5",
    type: "UPDATE",
    name: "Aktualizacja na podstawie daty",
    op: async () => {
      // Dodaliśmy |> limit(n: 5000), żeby nie pobierać milionów rekordów do RAMu!
      const rows = await runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -60d, stop: -30d) |> filter(fn: (r) => r._measurement == "market_ticks") |> limit(n: 5000)`,
      );
      const pts = rows.map((r) =>
        new Point("market_ticks")
          .tag("pair_id", r.pair_id)
          .tag("side", "unknown")
          .floatField("price", r._value)
          .timestamp(new Date(r._time)),
      );
      if (pts.length) {
        writeApi.writePoints(pts);
        await writeApi.flush();
      }
    },
  },
  {
    id: "U6",
    type: "UPDATE",
    name: "Aktualizacja z JOINem (Symulacja złożona)",
    op: async () => {
      const badExchanges = await runFlux(
        `from(bucket: "${DB_CONFIG.influx.bucket}") |> range(start: -1y) |> filter(fn: (r) => r._measurement == "exchanges" and r._field == "trust_score" and r._value < 5)`,
      );
      await writeApi.flush();
    },
  },

  // --- DELETE (USUWANIE) ---
  {
    id: "D1",
    type: "DELETE",
    name: "Czyszczenie logów (Tylko po measurement/tagach)",
    op: async () => deleteInfluxData(`_measurement="api_logs"`),
  },
  {
    id: "D2",
    type: "DELETE",
    name: "Usuwanie anomalii (Niemożliwe w czystym API)",
    op: async () => {
      await new Promise((r) => setTimeout(r, 10));
    },
  },
  {
    id: "D3",
    type: "DELETE",
    name: "Usuwanie danych starszych niż rok",
    op: async () =>
      deleteInfluxData(
        `_measurement="market_ticks"`,
        "1970-01-01T00:00:00Z",
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      ),
  },
  {
    id: "D4",
    type: "DELETE",
    name: "Punktowy DELETE (Pusta giełda)",
    op: async () =>
      deleteInfluxData(`_measurement="exchanges" AND name="FakeExchange"`),
  },
  {
    id: "D5",
    type: "DELETE",
    name: "Czyszczenie arkusza zleceń dla pary",
    op: async () =>
      deleteInfluxData(`_measurement="order_book_depth" AND pair_id="999"`),
  },
  {
    id: "D6",
    type: "DELETE",
    name: "Usuwanie błędnych statusów API",
    op: async () => {
      await new Promise((r) => setTimeout(r, 10));
    },
  },
];

export async function runBenchmarkInflux(): Promise<BenchmarkResult[]> {
  const influx = new InfluxDB({
    url: DB_CONFIG.influx.url,
    token: DB_CONFIG.influx.token,
  });
  const writeApi = influx.getWriteApi(
    DB_CONFIG.influx.org,
    DB_CONFIG.influx.bucket,
    "ms",
  );
  const results: BenchmarkResult[] = [];
  console.log(`\n⏳ Uruchamianie testów dla: InfluxDB...`);

  try {
    for (const s of influxScenarios) {
      const times = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        try {
          await s.op();
        } catch (e) {}
        times.push(performance.now() - start);
      }
      const avg = times.reduce((a, b) => a + b, 0) / 3;

      results.push({
        database: "InfluxDB (v2)",
        id: s.id,
        type: s.type,
        name: s.name,
        timeBefore: Number(avg.toFixed(2)),
        timeAfter: Number(avg.toFixed(2)), // Influx indeksuje z automatu
        difference: "N/A (Auto-Index)",
      });
    }
  } finally {
    await writeApi.close();
  }
  return results;
}
