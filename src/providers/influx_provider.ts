import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";
import { DatabaseProvider } from "./abstract_provider";
import { ApiLog, MarketTick } from "../types";

export class InfluxProvider extends DatabaseProvider {
  public readonly name = "InfluxDB";
  private client: InfluxDB;
  private writeApi: WriteApi;

  constructor(url: string, token: string, org: string, bucket: string) {
    super();
    this.client = new InfluxDB({ url, token });
    // InfluxDB grupuje zapisy w pakiety (batching) dla ekstremalnej wydajności
    this.writeApi = this.client.getWriteApi(org, bucket, "ms");
  }

  async connect(): Promise<void> {
    // InfluxDB używa HTTP, więc "połączenie" sprawdzamy przez ping
    try {
      // W nowszych wersjach klienta samo utworzenie API wystarczy,
      // ale warto wysłać pusty punkt testowy lub sprawdzić status.
      console.log(`[${this.name}] Ready to write.`);
    } catch (err) {
      throw new Error(`InfluxDB connection failed: ${err}`);
    }
  }

  async saveTick(tick: MarketTick): Promise<void> {
    // Mapowanie na Line Protocol:
    // measurement: market_ticks
    // tags: pair_id (indeksowane, do szybkich filtrów)
    // fields: price, volume (nieindeksowane dane liczbowe)
    const point = new Point("market_ticks")
      .tag("pair_id", tick.pair_id.toString())
      .tag("side", tick.side)
      .floatField("price", tick.price)
      .floatField("volume", tick.volume)
      .timestamp(new Date(tick.time));

    this.writeApi.writePoint(point);

    // flush() wymusza natychmiastowy zapis (używaj tylko w benchmarkach,
    // w produkcji Influx robi to automatycznie w tle dla wydajności).
    await this.writeApi.flush();
  }

  async saveLog(log: ApiLog): Promise<void> {
    const point = new Point("api_logs")
      .tag("endpoint", log.endpoint)
      .tag("exchange_id", log.exchange_id.toString())
      .intField("response_time", log.responseTimeMs)
      .intField("status_code", log.statusCode)
      .timestamp(new Date());

    this.writeApi.writePoint(point);
    await this.writeApi.flush();
  }

  // Specyficzne dla TSDB: zapytanie o średnią w języku Flux
  async getAveragePriceFlux(
    pairId: number,
    range: string = "-1h",
  ): Promise<void> {
    const queryApi = this.client.getQueryApi("my_org");
    const fluxQuery = `
            from(bucket: "crypto_bucket")
            |> range(start: ${range})
            |> filter(fn: (r) => r["_measurement"] == "market_ticks")
            |> filter(fn: (r) => r["pair_id"] == "${pairId}")
            |> filter(fn: (r) => r["_field"] == "price")
            |> mean()
        `;

    // Tutaj logika odbierania streamu danych Flux
  }
}
