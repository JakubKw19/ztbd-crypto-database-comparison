import { MongoClient } from "mongodb";
import { performance } from "perf_hooks";
import { DB_CONFIG } from "./config";

const mongoScenarios = [
    // CREATE
    { id: "C1", type: "CREATE", name: "Pojedynczy INSERT", op: (c: any) => c.insertOne({ timestamp: new Date(), price: 50000, volume: 1.5 }) },
    { id: "C2", type: "CREATE", name: "Insert Log", op: (c: any) => c.insertOne({ endpoint: '/api/test', status: 200 }) },
    { id: "C3", type: "CREATE", name: "Upsert", op: (c: any) => c.updateOne({ name: 'Binance' }, { $set: { trust: 10 } }, { upsert: true }) },
    { id: "C4", type: "CREATE", name: "Insert OrderBook", op: (c: any) => c.insertOne({ type: 'orderbook', bid: 49999, ask: 50001 }) },
    { id: "C5", type: "CREATE", name: "Insert OHLC", op: (c: any) => c.insertOne({ type: 'ohlc', open: 50000, close: 50500 }) },
    { id: "C6", type: "CREATE", name: "Batch INSERT", op: (c: any) => c.insertMany([{ price: 100 }, { price: 101 }, { price: 102 }]) },

    // READ
    { id: "R1", type: "READ", name: "Prosty Find + Limit", op: (c: any) => c.find({}).limit(1000).toArray() },
    { id: "R2", type: "READ", name: "Filtrowanie po cenie", op: (c: any) => c.find({ price: { $gt: 40000 } }).limit(1000).toArray() },
    { id: "R3", type: "READ", name: "Agregacja (AVG/MAX)", op: (c: any) => c.aggregate([{ $group: { _id: "$pair_id", avgPrice: { $avg: "$price" }, maxPrice: { $max: "$price" } } }]).toArray() },
    { id: "R4", type: "READ", name: "Złożone wyszukiwanie ($or)", op: (c: any) => c.find({ $or: [{ price: { $gt: 60000 } }, { volume: { $gt: 10 } }] }).toArray() },
    { id: "R5", type: "READ", name: "Grupowanie w czasie", op: (c: any) => c.aggregate([{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, totalVol: { $sum: "$volume" } } }]).toArray() },
    { id: "R6", type: "READ", name: "Wyszukiwanie regex", op: (c: any) => c.find({ endpoint: { $regex: /api/ } }).limit(100).toArray() },

    // UPDATE
    { id: "U1", type: "UPDATE", name: "Masowy Update (Mnożenie)", op: (c: any) => c.updateMany({ price: { $lt: 30000 } }, { $mul: { volume: 1.1 } }) },
    { id: "U2", type: "UPDATE", name: "Punktowy Update", op: (c: any) => c.updateOne({ symbol: 'BTCUSDT' }, { $set: { active: false } }) },
    { id: "U3", type: "UPDATE", name: "Dodanie pola do dokumentów", op: (c: any) => c.updateMany({}, { $set: { migrated: true } }) },
    { id: "U4", type: "UPDATE", name: "Update po dacie", op: (c: any) => c.updateMany({ timestamp: { $lt: new Date('2023-01-01') } }, { $set: { archived: true } }) },
    { id: "U5", type: "UPDATE", name: "Inkrementacja logów", op: (c: any) => c.updateMany({ status: 500 }, { $inc: { retry_count: 1 } }) },
    { id: "U6", type: "UPDATE", name: "Usunięcie pola ($unset)", op: (c: any) => c.updateMany({ price: { $lt: 0 } }, { $unset: { volume: "" } }) },

    // DELETE
    { id: "D1", type: "DELETE", name: "Usuwanie starych logów", op: (c: any) => c.deleteMany({ response_time_ms: { $gt: 1000 } }) },
    { id: "D2", type: "DELETE", name: "Usuwanie anomalii", op: (c: any) => c.deleteMany({ price: { $lte: 0 } }) },
    { id: "D3", type: "DELETE", name: "Usuwanie po dacie", op: (c: any) => c.deleteMany({ timestamp: { $lt: new Date('2020-01-01') } }) },
    { id: "D4", type: "DELETE", name: "Punktowy Delete", op: (c: any) => c.deleteOne({ name: 'FakeExchange' }) },
    { id: "D5", type: "DELETE", name: "Usuwanie po regexie", op: (c: any) => c.deleteMany({ endpoint: { $regex: /test/ } }) },
    { id: "D6", type: "DELETE", name: "Czyszczenie błędów", op: (c: any) => c.deleteMany({ status: 404 }) }
];

async function runBenchmarkMongo() {
    const client = new MongoClient(DB_CONFIG.mongo.uri);
    await client.connect();
    const db = client.db('crypto_db');
    const collection = db.collection('market_ticks');
    console.log("🚀 BENCHMARK: MONGODB (24 Scenariusze)");

    try {
        console.log("🧹 Usuwanie indeksów...");
        await collection.dropIndexes();

        const resultsBefore = new Map<string, number>();
        console.log("\n📊 FAZA 1: BEZ INDEKSÓW");
        for (const s of mongoScenarios) {
            const times = [];
            for (let i = 0; i < 3; i++) {
                const start = performance.now();
                await s.op(collection);
                const end = performance.now();
                times.push(end - start);
            }
            const avg = times.reduce((a, b) => a + b, 0) / 3;
            resultsBefore.set(s.id, avg);
            console.log(`[${s.id}] ${s.name}: ${avg.toFixed(2)} ms`);
        }

        console.log("\n⚙️ Zakładanie indeksów...");
        await collection.createIndex({ price: 1 });
        await collection.createIndex({ timestamp: -1 });

        console.log("\n📊 FAZA 2: Z INDEKSAMI");
        for (const s of mongoScenarios) {
            const times = [];
            for (let i = 0; i < 3; i++) {
                const start = performance.now();
                await s.op(collection);
                const end = performance.now();
                times.push(end - start);
            }
            const avg = times.reduce((a, b) => a + b, 0) / 3;
            const timeBefore = resultsBefore.get(s.id) || 0;
            const diff = timeBefore > avg ? `🔥 -${(((timeBefore - avg) / timeBefore) * 100).toFixed(1)}%` : `🐌 Wolniej`;

            console.log(`[${s.id}] Czas: ${avg.toFixed(2)} ms | Różnica: ${diff}`);
        }
    } finally {
        await client.close();
    }
}

runBenchmarkMongo();