export interface MarketTick {
  time: Date;
  pair_id: number;
  price: number;
  volume: number;
  side: "buy" | "sell";
}

export interface ApiLog {
  exchange_id: number;
  endpoint: string;
  responseTimeMs: number;
  statusCode: number;
}
