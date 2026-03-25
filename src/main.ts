import { DB_CONFIG } from "./config";
import { InfluxProvider } from "./providers/influx_provider";
import { MongoProvider } from "./providers/mongo_provider";
import { PostgresProvider } from "./providers/postgres_provider";
import { MarketTick } from "./types";

async function bootstrap() {
  // 1. Inicjalizacja dostawców
  const pgProvider = new PostgresProvider(DB_CONFIG.postgres);
  const tsProvider = new PostgresProvider(DB_CONFIG.timescale); // Ten sam driver, inny port
  const mongoProvider = new MongoProvider(DB_CONFIG.mongo.uri);
  const influxProvider = new InfluxProvider(
    DB_CONFIG.influx.url,
    DB_CONFIG.influx.token,
    DB_CONFIG.influx.org,
    DB_CONFIG.influx.bucket,
  );

  const providers = [pgProvider, tsProvider, mongoProvider, influxProvider];

  // 2. Połączenie z bazami
  console.log("🚀 Initializing database connections...");
  for (const provider of providers) {
    await provider.connect();
  }

  // 3. Przykładowy Tick do testu
  const tick: MarketTick = {
    time: new Date(),
    pair_id: 1, // Zakładamy, że BTCUSDT ma ID 1
    price: 64500.5,
    volume: 0.05,
    side: "buy",
  };

  // 4. Testowy zapis do wszystkich baz jednocześnie
  console.log("📝 Running write test...");
  await Promise.all(providers.map((p) => p.saveTick(tick)));

  console.log("✅ Data synchronized across all 4 databases.");
}

bootstrap().catch(console.error);
