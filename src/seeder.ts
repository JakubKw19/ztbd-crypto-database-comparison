import { Pool } from "pg";
import { MongoClient } from "mongodb";
import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { DB_CONFIG } from "./config";
import { MarketTick } from "./types";

// ==========================================
// ⚙️ KONFIGURACJA TESTU (Zmieniaj te wartości)
// ==========================================
// Krok 1: 500000 (Mały zbiór)
// Krok 2: 1000000 (Średni zbiór)
// Krok 3: 10000000 (Duży zbiór)
const TOTAL_RECORDS = 500000;
const BATCH_SIZE = 10000; // 10 000 rekordów na paczkę to optymalna wielkość

async function seedData() {
  console.log(`🚀 Rozpoczynam generowanie ${TOTAL_RECORDS} rekordów...`);
  console.log(`📦 Rozmiar paczki (Batch): ${BATCH_SIZE}`);

  // 1. INICJALIZACJA POŁĄCZEŃ
  const pgPool = new Pool(DB_CONFIG.postgres);
  const tsPool = new Pool(DB_CONFIG.timescale);

  const mongoClient = new MongoClient(DB_CONFIG.mongo.uri);
  await mongoClient.connect();
  const mongoCollection = mongoClient
    .db("crypto_db")
    .collection("market_ticks");

  const influxClient = new InfluxDB({
    url: DB_CONFIG.influx.url,
    token: DB_CONFIG.influx.token,
  });
  const influxWriteApi = influxClient.getWriteApi(
    DB_CONFIG.influx.org,
    DB_CONFIG.influx.bucket,
    "ms",
  );

  // 2. STANY POCZĄTKOWE GENERATORA
  let currentPrice = 60000;
  let currentTime = new Date();
  currentTime.setDate(currentTime.getDate() - 365); // Zaczynamy generowanie od roku wstecz

  // 3. GŁÓWNA PĘTLA BATCHINGU (Zoptymalizowana pod RAM)
  for (let i = 0; i < TOTAL_RECORDS; i += BATCH_SIZE) {
    const batchStart = performance.now();
    const batch: MarketTick[] = [];

    // Zabezpieczenie na wypadek gdyby TOTAL_RECORDS nie dzieliło się równo przez BATCH_SIZE
    const currentBatchSize = Math.min(BATCH_SIZE, TOTAL_RECORDS - i);

    // A. Generowanie danych dla bieżącej paczki w pamięci
    for (let j = 0; j < currentBatchSize; j++) {
      currentPrice += (Math.random() - 0.5) * 20; // Błądzenie losowe ceny
      currentTime = new Date(currentTime.getTime() + 1000); // Każdy tick jest o 1 sekundę nowszy

      batch.push({
        time: new Date(currentTime),
        pair_id: 1, // 1 = BTCUSDT (Zgodnie z naszym migratorem)
        price: Number(currentPrice.toFixed(2)),
        volume: Number((Math.random() * 2).toFixed(4)),
        side: Math.random() > 0.5 ? "buy" : "sell",
      });
    }

    // B. Równoległy zapis paczki do wszystkich 4 baz
    try {
      await Promise.all([
        seedPostgres(pgPool, batch),
        seedPostgres(tsPool, batch),
        seedMongo(mongoCollection, batch),
        seedInflux(influxWriteApi, batch),
      ]);

      const batchEnd = performance.now();
      const progress = (((i + currentBatchSize) / TOTAL_RECORDS) * 100).toFixed(
        1,
      );
      console.log(
        `[${progress}%] Zapisano paczkę ${Math.floor(i / BATCH_SIZE) + 1} w ${(batchEnd - batchStart).toFixed(0)}ms`,
      );
    } catch (err) {
      console.error("❌ Błąd podczas zapisu paczki. Przerywam działanie.", err);
      break; // Przerywamy pętlę w razie błędu
    }
  }

  // 4. ZAMKNIĘCIE POŁĄCZEŃ
  console.log("🧹 Zamykanie połączeń...");
  await influxWriteApi.flush(); // Wymuszenie zrzutu resztek danych w Influxie
  await influxWriteApi.close();
  await mongoClient.close();
  await pgPool.end();
  await tsPool.end();

  console.log("🎉 Zakończono seedowanie wszystkich baz!");
}

// ==========================================
// 🛠️ FUNKCJE POMOCNICZE (Zapis do poszczególnych baz)
// ==========================================

async function seedPostgres(pool: Pool, batch: MarketTick[]) {
  // Generowanie zapytania dla masowego insertu: INSERT INTO ... VALUES ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10) ...
  const values: any[] = [];
  const placeholders: string[] = [];

  let paramIndex = 1;
  for (const tick of batch) {
    placeholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
    );
    values.push(tick.time, tick.pair_id, tick.price, tick.volume, tick.side);
  }

  const query = `
        INSERT INTO market_ticks (time, pair_id, price, volume_24h, last_side) 
        VALUES ${placeholders.join(", ")}
    `;
  await pool.query(query, values);
}

async function seedMongo(collection: any, batch: MarketTick[]) {
  // Mapowanie obiektów pod MongoDB (zmiana nazwy pola time na timestamp dla czytelności w Mongo)
  const docs = batch.map((t) => ({
    timestamp: t.time,
    pair_id: t.pair_id,
    price: t.price,
    volume: t.volume,
    side: t.side,
  }));
  await collection.insertMany(docs);
}

async function seedInflux(writeApi: any, batch: MarketTick[]) {
  // Mapowanie na Line Protocol (Punkty w InfluxDB)
  const points = batch.map((t) =>
    new Point("market_ticks")
      .tag("pair_id", t.pair_id.toString())
      .tag("side", t.side)
      .floatField("price", t.price)
      .floatField("volume", t.volume)
      .timestamp(t.time),
  );
  writeApi.writePoints(points);
}

// Uruchomienie skryptu
seedData().catch(console.error);
