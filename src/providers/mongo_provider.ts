import { MongoClient, Db } from "mongodb";
import { MarketTick } from "../types";
import { DatabaseProvider } from "./abstract_provider";

export class MongoProvider extends DatabaseProvider {
  public readonly name = "MongoDB";
  private client: MongoClient;
  private db?: Db;

  constructor(uri: string) {
    super();
    this.client = new MongoClient(uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db("crypto_db");
    console.log(`[${this.name}] Connected.`);
  }

  async saveTick(tick: MarketTick): Promise<void> {
    await this.db?.collection("market_ticks").insertOne({
      timestamp: tick.time,
      pair_id: tick.pair_id,
      price: tick.price,
      vol: tick.volume,
      side: tick.side,
    });
  }

  async saveLog(log: any): Promise<void> {
    await this.db?.collection("logs").insertOne(log);
  }
}
