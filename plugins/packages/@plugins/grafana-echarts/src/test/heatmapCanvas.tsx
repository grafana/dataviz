import { type DataFrame, DataFrameType, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { AXIS_ZLEVEL, SERIES_ZLEVEL } from 'test/canvas';
import { getAxisCanvasEvents, getComponent } from 'test/panel';
import { type PanelOptions } from 'types';

/**
 * Render harness and fixtures shared by the heatmap core-parity canvas and
 * integration suites, so both describe the same frames.
 *
 * Cells are on `SERIES_ZLEVEL` and the axes on `AXIS_ZLEVEL`, so the cell layer
 * and the Y labels are read separately. Animation is off for determinism.
 */
export const heatmapCanvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL, axis: AXIS_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  ...extra,
});

/** Render the heatmap panel and read the cell and axis layers of one paint. */
export const renderHeatmap = async (frames: DataFrame[], options: Partial<PanelOptions> = {}) => {
  const { container } = render(
    getComponent(frames, 'heatmap', heatmapCanvasOptions(options), undefined, undefined, 'heatmap')
  );
  return getAxisCanvasEvents(container);
};

const times = [1783137094497, 1783140694497, 1783144294497];

/**
 * Prometheus classic histogram: `le` rows with exponential bounds, a `+Inf` top
 * bucket, and one empty (0) cell per row.
 */
export const leRowsFrame = toDataFrame({
  meta: { type: DataFrameType.HeatmapRows },
  fields: [
    { name: 'time', type: FieldType.time, values: times },
    { name: 'b1', type: FieldType.number, values: [0, 4, 6], labels: { le: '1' } },
    { name: 'b2', type: FieldType.number, values: [5, 0, 7], labels: { le: '4' } },
    { name: 'b3', type: FieldType.number, values: [8, 9, 0], labels: { le: '16' } },
    { name: 'b4', type: FieldType.number, values: [1, 2, 3], labels: { le: '+Inf' } },
  ],
});

/**
 * `le` rows with more buckets than the labels that fit on the Y axis: bounds
 * that grow by 1.3 from 0.001, and a `+Inf` top bucket.
 */
export const manyLeRowsFrame = (buckets = 60) =>
  toDataFrame({
    meta: { type: DataFrameType.HeatmapRows },
    fields: [
      { name: 'time', type: FieldType.time, values: times },
      ...Array.from({ length: buckets }, (_, i) => ({
        name: `b${i}`,
        type: FieldType.number,
        values: [i, i + 1, i + 2],
        labels: { le: i === buckets - 1 ? '+Inf' : String(Number((0.001 * 1.3 ** i).toPrecision(3))) },
      })),
    ],
  });

/** The Y of each axis label of the last paint, in whole pixels, top first. */
export const axisLabelYs = (events: CanvasEvent[]): Array<{ text: string; y: number }> => {
  const lastPaint = events.map((event) => event.type).lastIndexOf('clearRect');
  return events
    .slice(lastPaint === -1 ? 0 : lastPaint)
    .filter((event) => event.type === 'fillText')
    .map((event) => ({ text: String(event.props?.text), y: Math.round(event.transform?.[5] ?? 0) }))
    .sort((a, b) => a.y - b.y);
};

/**
 * Dense heatmap-cells in the shape of core's "Calculate from data" output: an
 * `xMin` time, a `yMin` lower bound per bucket and a `Count`. Buckets 1, 2, 4, 8.
 */
export const denseCellsFrame = (log?: number) => {
  const ys = [1, 2, 4, 8];
  return toDataFrame({
    meta: { type: DataFrameType.HeatmapCells },
    fields: [
      { name: 'xMin', type: FieldType.time, values: times.flatMap((t) => ys.map(() => t)) },
      {
        name: 'yMin',
        type: FieldType.number,
        values: times.flatMap(() => ys),
        config: log ? { custom: { scaleDistribution: { type: 'log', log } } } : {},
      },
      { name: 'Count', type: FieldType.number, values: [0, 1, 2, 3, 4, 5, 0, 7, 8, 9, 10, 0] },
    ],
  });
};

type CanvasEvent = { type: string; props?: Record<string, unknown>; transform?: number[] };
export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
  fillStyle?: string;
}

/**
 * The cell rects of the last paint, each with the fill style it was painted
 * with. A cell is one `rect` followed by one `fill`.
 */
export const cellRects = (events: CanvasEvent[]): CellRect[] => {
  const lastPaint = events.map((event) => event.type).lastIndexOf('clearRect');
  const rects: CellRect[] = [];
  let fillStyle: string | undefined;
  for (const event of events.slice(lastPaint === -1 ? 0 : lastPaint)) {
    if (event.type === 'fillStyle') {
      fillStyle = String(event.props?.value);
    }
    if (event.type === 'rect') {
      const { x, y, width, height } = event.props as Omit<CellRect, 'fillStyle'>;
      rects.push({ x, y, width, height, fillStyle });
    }
  }
  return rects;
};

/**
 * Distinct cell heights in whole pixels. Flooring absorbs the 0.5 px seam
 * padding that the grid clip removes from edge cells.
 */
export const cellHeights = (rects: CellRect[]) =>
  Array.from(new Set(rects.map((rect) => Math.floor(rect.height)))).sort((a, b) => a - b);

/** The largest cell, which is never clipped by the grid edge. */
export const largestCell = (rects: CellRect[]) =>
  rects.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
