import { apiFetch } from "./client";
import type { BarInterval } from "./market";

export type ChartAnnotationEntityType = "setup" | "trade" | "playbook" | "analysis";

export interface ChartAnnotationScope {
  entityType: ChartAnnotationEntityType;
  entityId: string;
}

export interface ChartAnnotationRecord<TDrawing = unknown> extends ChartAnnotationScope {
  symbol: string;
  interval: BarInterval;
  drawings: TDrawing[];
  updated_at?: string;
}

function annotationPath(scope: ChartAnnotationScope) {
  return `/chart-annotations/${encodeURIComponent(scope.entityType)}/${encodeURIComponent(scope.entityId)}`;
}

export const chartAnnotationsApi = {
  get: <TDrawing = unknown>(
    scope: ChartAnnotationScope,
    symbol: string,
    interval: BarInterval,
  ) =>
    apiFetch<ChartAnnotationRecord<TDrawing>>(
      `${annotationPath(scope)}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
    ),
  save: <TDrawing = unknown>(
    scope: ChartAnnotationScope,
    symbol: string,
    interval: BarInterval,
    drawings: TDrawing[],
  ) =>
    apiFetch<ChartAnnotationRecord<TDrawing>>(annotationPath(scope), {
      method: "PUT",
      body: JSON.stringify({ symbol, interval, drawings }),
    }),
};
