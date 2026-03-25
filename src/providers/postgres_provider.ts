import { MarketTick, ApiLog } from "../types";
import { Pool } from "pg";
import { DatabaseProvider } from "./abstract_provider";

export class PostgresProvider extends DatabaseProvider {
  public readonly name = "PostgreSQL/Timescale";
  private pool: Pool;

  constructor(config: any) {
    super();
    this.pool = new Pool(config);
  }

  async connect(): Promise<void> {
    await this.pool.connect();
    console.log(`[${this.name}] Connected.`);
  }

  async saveTick(tick: MarketTick): Promise<void> {
    const query = `
            INSERT INTO market_ticks (time, pair_id, price, volume_24h, last_side)
            VALUES ($1, $2, $3, $4, $5)`;
    await this.pool.query(query, [
      tick.time,
      tick.pair_id,
      tick.price,
      tick.volume,
      tick.side,
    ]);
  }

  async saveLog(log: ApiLog): Promise<void> {
    await this.pool.query(
      `INSERT INTO api_logs (exchange_id, endpoint, response_time_ms, status_code) VALUES ($1, $2, $3, $4)`,
      [log.exchange_id, log.endpoint, log.responseTimeMs, log.statusCode],
    );
  }
}
