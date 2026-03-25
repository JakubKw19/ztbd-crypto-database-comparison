import { ApiLog, MarketTick } from "../types";

export abstract class DatabaseProvider {
  public abstract readonly name: string;

  abstract connect(): Promise<void>;
  abstract saveTick(tick: MarketTick): Promise<void>;
  abstract saveLog(log: ApiLog): Promise<void>;

  // Metoda pomocnicza do mierzenia czasu wykonania (Benchmark)
  protected async measure<T>(
    operation: () => Promise<T>,
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await operation();
    const end = performance.now();
    return { result, duration: end - start };
  }
}
