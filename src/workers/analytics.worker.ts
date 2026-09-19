/**
 * Heavy analytics aggregation off the main thread.
 * The UI posts per-shot arrays; the worker returns summaries.
 * @module workers/analytics-worker
 */
import { mean, median, percentile, stddev } from '../analytics/statistics';
import { computeTrackingMetrics } from '../analytics/tracking';
import { buildHeatmap } from '../analytics/heatmap';

export interface AggregateRequest {
  reactionMs: number[];
  errorsDeg: number[];
  trackingErrors: { errorDeg: number; radiusDeg: number }[];
  misses: { dxR: number; dyR: number }[];
}

self.onmessage = (e: MessageEvent<AggregateRequest>): void => {
  const { reactionMs, errorsDeg, trackingErrors, misses } = e.data;
  const result = {
    reaction: {
      mean: mean(reactionMs),
      median: median(reactionMs),
      p95: percentile(reactionMs, 95),
      sd: stddev(reactionMs),
    },
    errorMedian: median(errorsDeg),
    tracking: computeTrackingMetrics(trackingErrors),
    heatmap: buildHeatmap(misses),
  };
  self.postMessage(result);
};
