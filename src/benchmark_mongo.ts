import { MongoClient, Db } from "mongodb";
import { performance } from "perf_hooks";
import { DB_CONFIG } from "./config";
import { BenchmarkResult } from "./benchmark_types";

// --- 24 SCENARIUSZE DLA MONGODB (Odpowiedniki SQL) ---
const mongoScenarios = [
  // --- CREATE (ZAPIS) ---
  {
    id: "C1",
    type: "CREATE",
    name: "Pojedynczy INSERT (Tick)",
    op: async (db: Db) =>
      db.collection("market_ticks").insertOne({
        time: new Date(),
        pair_id: 1,
        price: 50000.0,
        volume_24h: 1.5,
        last_side: "buy",
      }),
  },
  {
    id: "C2",
    type: "CREATE",
    name: "Pojedynczy INSERT (Log API)",
    op: async (db: Db) =>
      db.collection("api_logs").insertOne({
        exchange_id: 1,
        endpoint: "/api/v3/ticker",
        response_time_ms: 45,
        status_code: 200,
      }),
  },
  {
    id: "C3",
    type: "CREATE",
    name: "INSERT z naruszeniem unikalności (UPSERT)",
    op: async (db: Db) =>
      db
        .collection("exchanges")
        .updateOne(
          { name: "Binance" },
          { $set: { trust_score: 10 } },
          { upsert: true },
        ),
  },
  {
    id: "C4",
    type: "CREATE",
    name: "Wstawienie do Order Book",
    op: async (db: Db) =>
      db.collection("order_book_depth").insertOne({
        time: new Date(),
        pair_id: 1,
        best_bid: 49999.0,
        best_ask: 50001.0,
        spread: 2.0,
      }),
  },
  {
    id: "C5",
    type: "CREATE",
    name: "Wstawienie agregatu OHLC",
    op: async (db: Db) =>
      db.collection("ohlc_data").insertOne({
        time: new Date(),
        pair_id: 1,
        open_price: 50000,
        high_price: 51000,
        low_price: 49000,
        close_price: 50500,
      }),
  },
  {
    id: "C6",
    type: "CREATE",
    name: "Masowy INSERT (Batch 5 rekordów)",
    op: async (db: Db) =>
      db.collection("market_ticks").insertMany([
        { time: new Date(), pair_id: 1, price: 100 },
        { time: new Date(), pair_id: 1, price: 101 },
        { time: new Date(), pair_id: 1, price: 102 },
        { time: new Date(), pair_id: 1, price: 103 },
        { time: new Date(), pair_id: 1, price: 104 },
      ]),
  },

  // --- READ (ODCZYT) ---
  {
    id: "R1",
    type: "READ",
    name: "Prosty SELECT z limitem",
    op: async (db: Db) =>
      db
        .collection("market_ticks")
        .find()
        .sort({ time: -1 })
        .limit(1000)
        .toArray(),
  },
  {
    id: "R2",
    type: "READ",
    name: "Filtrowanie po czasie",
    op: async (db: Db) => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return db
        .collection("market_ticks")
        .find({ time: { $gte: d } })
        .toArray();
    },
  },
  {
    id: "R3",
    type: "READ",
    name: "Agregacja (AVG, MAX, MIN)",
    op: async (db: Db) =>
      db
        .collection("market_ticks")
        .aggregate([
          { $match: { pair_id: 1 } },
          {
            $group: {
              _id: null,
              avgPrice: { $avg: "$price" },
              maxPrice: { $max: "$price" },
              minPrice: { $min: "$price" },
            },
          },
        ])
        .toArray(),
  },
  {
    id: "R4",
    type: "READ",
    name: "Złożony JOIN (3 tabele - lookup)",
    op: async (db: Db) =>
      db
        .collection("market_ticks")
        .aggregate([
          { $match: { price: { $gt: 40000 } } },
          { $limit: 1000 },
          {
            $lookup: {
              from: "trading_pairs",
              localField: "pair_id",
              foreignField: "_id",
              as: "pair",
            },
          },
          {
            $lookup: {
              from: "exchanges",
              localField: "pair.exchange_id",
              foreignField: "_id",
              as: "exchange",
            },
          },
        ])
        .toArray(),
  },
  {
    id: "R5",
    type: "READ",
    name: "Grupowanie (Time Bucket - wolumen per para)",
    op: async (db: Db) =>
      db
        .collection("market_ticks")
        .aggregate([
          { $group: { _id: "$pair_id", totalVol: { $sum: "$volume_24h" } } },
        ])
        .toArray(),
  },
  {
    id: "R6",
    type: "READ",
    name: "Podzapytanie (Ceny wyższe niż średnia)",
    op: async (db: Db) => {
      // W Mongo typowe podzapytanie wymaga 2 kroków (lub bardzo złożonego pipelinu)
      const agg = await db
        .collection("market_ticks")
        .aggregate([{ $group: { _id: null, avg: { $avg: "$price" } } }])
        .toArray();
      const avgPrice = agg[0]?.avg || 0;
      return db
        .collection("market_ticks")
        .find({ price: { $gt: avgPrice } })
        .limit(500)
        .toArray();
    },
  },

  // --- UPDATE (AKTUALIZACJA) ---
  {
    id: "U1",
    type: "UPDATE",
    name: "Masowy UPDATE po warunku cenowym",
    op: async (db: Db) =>
      db
        .collection("market_ticks")
        .updateMany({ price: { $lt: 30000 } }, { $mul: { volume_24h: 1.1 } }),
  },
  {
    id: "U2",
    type: "UPDATE",
    name: "Punktowy UPDATE po stringu",
    op: async (db: Db) =>
      db
        .collection("trading_pairs")
        .updateOne(
          { symbol_on_exchange: "BTCUSDT" },
          { $set: { is_active: false } },
        ),
  },
  {
    id: "U3",
    type: "UPDATE",
    name: "Aktualizacja słownika (exchanges)",
    op: async (db: Db) =>
      db
        .collection("exchanges")
        .updateOne({ name: "Binance" }, { $set: { trust_score: 9 } }),
  },
  {
    id: "U4",
    type: "UPDATE",
    name: "Zmiana statusu w logach",
    op: async (db: Db) =>
      db
        .collection("api_logs")
        .updateMany(
          { response_time_ms: { $gt: 5000 } },
          { $set: { status_code: 500 } },
        ),
  },
  {
    id: "U5",
    type: "UPDATE",
    name: "Aktualizacja na podstawie daty",
    op: async (db: Db) => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return db
        .collection("market_ticks")
        .updateMany({ time: { $lt: d } }, { $set: { last_side: "unknown" } });
    },
  },
  {
    id: "U6",
    type: "UPDATE",
    name: "Aktualizacja wykorzystująca JOIN",
    op: async (db: Db) => {
      // Brak relacyjności wymusza pobranie ID do tablicy, a następnie wykonanie $in
      const badExchanges = await db
        .collection("exchanges")
        .find({ trust_score: { $lt: 5 } })
        .toArray();
      const ids = badExchanges.map((e) => e._id);
      return db
        .collection("trading_pairs")
        .updateMany(
          { exchange_id: { $in: ids } },
          { $set: { is_active: false } },
        );
    },
  },

  // --- DELETE (USUWANIE) ---
  {
    id: "D1",
    type: "DELETE",
    name: "Czyszczenie starych logów",
    op: async (db: Db) =>
      db.collection("api_logs").deleteMany({ response_time_ms: { $gt: 1000 } }),
  },
  {
    id: "D2",
    type: "DELETE",
    name: "Usuwanie anomalii cenowych",
    op: async (db: Db) =>
      db.collection("market_ticks").deleteMany({
        $or: [{ price: { $lte: 0 } }, { volume_24h: { $lte: 0 } }],
      }),
  },
  {
    id: "D3",
    type: "DELETE",
    name: "Usuwanie danych starszych niż rok",
    op: async (db: Db) => {
      const d = new Date();
      d.setDate(d.getDate() - 365);
      return db.collection("market_ticks").deleteMany({ time: { $lt: d } });
    },
  },
  {
    id: "D4",
    type: "DELETE",
    name: "Punktowy DELETE (Pusta giełda)",
    op: async (db: Db) =>
      db.collection("exchanges").deleteOne({ name: "FakeExchange" }),
  },
  {
    id: "D5",
    type: "DELETE",
    name: "Czyszczenie arkusza zleceń dla pary",
    op: async (db: Db) =>
      db.collection("order_book_depth").deleteMany({ pair_id: 999 }),
  },
  {
    id: "D6",
    type: "DELETE",
    name: "Usuwanie błędnych statusów API",
    op: async (db: Db) =>
      db.collection("api_logs").deleteMany({ status_code: 404 }),
  },
];

export async function runBenchmarkMongo(): Promise<BenchmarkResult[]> {
  const client = new MongoClient(DB_CONFIG.mongo.uri);
  await client.connect();
  const db = client.db("crypto_db");
  const results: BenchmarkResult[] = [];
  console.log(`\n⏳ Uruchamianie testów dla: MongoDB...`);

  try {
    try {
      await db.collection("market_ticks").dropIndexes();
    } catch (e) {}

    const beforeMap = new Map<string, number>();
    for (const s of mongoScenarios) {
      const times = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await s.op(db);
        times.push(performance.now() - start);
      }
      beforeMap.set(s.id, times.reduce((a, b) => a + b, 0) / 3);
    }

    await db.collection("market_ticks").createIndex({ pair_id: 1 });
    await db.collection("market_ticks").createIndex({ price: 1 });
    await db.collection("market_ticks").createIndex({ time: -1 });

    for (const s of mongoScenarios) {
      const times = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await s.op(db);
        times.push(performance.now() - start);
      }
      const timeAfter = times.reduce((a, b) => a + b, 0) / 3;
      const timeBefore = beforeMap.get(s.id) || 0;
      const diff =
        timeBefore > timeAfter
          ? `-${(((timeBefore - timeAfter) / timeBefore) * 100).toFixed(1)}%`
          : `Wolniej`;

      results.push({
        database: "MongoDB",
        id: s.id,
        type: s.type,
        name: s.name,
        timeBefore: Number(timeBefore.toFixed(2)),
        timeAfter: Number(timeAfter.toFixed(2)),
        difference: diff,
      });
    }
  } finally {
    await client.close();
  }
  return results;
}
