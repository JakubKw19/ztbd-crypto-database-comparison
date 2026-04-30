export interface BenchmarkResult {
  database: string;
  id: string;
  type: string;
  name: string;
  timeBefore: number;
  timeAfter: number;
  difference: string;
}
