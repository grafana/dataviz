import { type DataFrame, type Field, getFieldDisplayName } from '@grafana/data';
import { type LineSeriesOption } from 'echarts';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { getFieldConfigFromField } from 'lib/grafana/fields/fieldConfig';

/**
 * Core Time series "Fill below to" (`custom.fillBelowTo`): the fill of a line series goes to another
 * series, not to the axis. Core adds a uPlot band between the two series (`preparePlotConfigBuilder`):
 * https://github.com/grafana/grafana/blob/main/public/app/core/components/TimeSeries/utils.ts
 *
 * ECharts has no band between two series. Each band is two more line series in one stack, with no
 * line and no symbol: the base has the values of the target, and the band has the difference to the
 * source, with the fill.
 * https://echarts.apache.org/en/option.html#series-line.stack
 * https://echarts.apache.org/en/option.html#series-line.areaStyle
 */

/** The fill opacity of a band whose series has no "Fill opacity", as core (35, the flot default). */
export const FILL_BELOW_TO_DEFAULT_OPACITY = 0.35;

/** The id prefix of the two series of a band. */
export const FILL_BELOW_TO_SERIES_ID = '__fillBelowTo';

/**
 * The "Fill below to" target of each time-axis series, in the order that `timeSeriesToEChartsOption`
 * emits series: the index of the target series, `null` for a target that the data does not have, and
 * `undefined` for a series with no "Fill below to". The target is the first other series whose name,
 * data source display name or display name is the option value, as core. The result is empty when no
 * series has a "Fill below to".
 */
export function resolveFillBelowTo(frames: DataFrame[]): Array<number | null | undefined> {
  const refs: Array<{ field: Field; frame: DataFrame; fillBelowTo: unknown }> = [];
  forEachTimeSeriesField(frames, ({ field, frame }) => {
    refs.push({ field, frame, fillBelowTo: getFieldConfigFromField(field).custom?.fillBelowTo });
  });
  const isSet = (fillBelowTo: unknown): fillBelowTo is string => typeof fillBelowTo === 'string' && fillBelowTo !== '';
  // The usual panel has no "Fill below to": it does not pay for the display names.
  if (!refs.some(({ fillBelowTo }) => isSet(fillBelowTo))) {
    return [];
  }
  const names = refs.map(({ field, frame }) => [
    field.name,
    getFieldConfigFromField(field).displayNameFromDS,
    getFieldDisplayName(field, frame, frames),
  ]);
  return refs.map(({ fillBelowTo }, i) => {
    if (!isSet(fillBelowTo)) {
      return undefined;
    }
    const target = names.findIndex((fieldNames, t) => t !== i && fieldNames.includes(fillBelowTo));
    return target === -1 ? null : target;
  });
}

/** A time-axis series of any cartesian type, with the keys that a band reads. Only a line has the line keys. */
type BandSource = { type?: string; data?: unknown; stack?: string; yAxisIndex?: number; zlevel?: number } & Pick<
  LineSeriesOption,
  'areaStyle' | 'lineStyle' | 'connectNulls' | 'smooth' | 'smoothMonotone' | 'step'
>;

/** The time and the value of one point. */
type Point = [number, number | null];

/** The `[x, value]` of an ECharts data item: a point, or `{ value: point }`. `undefined` for other shapes. */
function readPoint(item: unknown): Point | undefined {
  const point: unknown = item != null && typeof item === 'object' && 'value' in item ? item.value : item;
  if (!Array.isArray(point)) {
    return undefined;
  }
  const values: unknown[] = point;
  const [x, value] = values;
  if (typeof x !== 'number') {
    return undefined;
  }
  return [x, typeof value === 'number' && Number.isFinite(value) ? value : null];
}

/**
 * The points of the line of a series, in x order. A series with `connectNulls` draws its line over the
 * nulls, so they are left out.
 */
function linePoints({ data, connectNulls }: BandSource): Point[] {
  const points = Array.isArray(data) ? data.map(readPoint).filter((point) => point !== undefined) : [];
  return (connectNulls ? points.filter(([, value]) => value != null) : points).sort((a, b) => a[0] - b[0]);
}

/**
 * The value of a line at `x`: the value of the point at `x`, or the value on the segment between the
 * two points around `x`. A stepped line has the value of one end of the segment. `null` where the
 * line has no segment: before the first point, after the last point and next to a null.
 * https://echarts.apache.org/en/option.html#series-line.step
 */
function valueAt(points: Point[], x: number, step: LineSeriesOption['step']): number | null {
  // The first point at or after `x`.
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (points[middle][0] < x) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  if (low === points.length) {
    return null;
  }
  const [nextX, next] = points[low];
  if (nextX === x) {
    return next;
  }
  if (low === 0) {
    return null;
  }
  const [previousX, previous] = points[low - 1];
  if (previous == null || next == null) {
    return null;
  }
  if (step === 'end') {
    return previous;
  }
  if (step === 'start') {
    return next;
  }
  if (step === 'middle') {
    return x < (previousX + nextX) / 2 ? previous : next;
  }
  return previous + ((next - previous) * (x - previousX)) / (nextX - previousX);
}

/**
 * The data of the two series of a band. The points are at each x of the source and of the target, so
 * series with different times get a band that follows the two lines, as the joined frame of core.
 * The band has a fill only where the source is above the target, as the uPlot band of core.
 */
function bandData(source: BandSource, target: BandSource): { base: Point[]; difference: Point[] } {
  const sourcePoints = linePoints(source);
  const targetPoints = linePoints(target);
  const xs = [...new Set([...sourcePoints, ...targetPoints].map(([x]) => x))].sort((a, b) => a - b);
  const base: Point[] = [];
  const difference: Point[] = [];
  // The last x where the two lines have a value, to find where straight lines cross.
  let previous: { x: number; target: number; gap: number } | undefined;
  for (const x of xs) {
    const value = valueAt(sourcePoints, x, source.step);
    const targetValue = valueAt(targetPoints, x, target.step);
    if (value == null || targetValue == null) {
      base.push([x, null]);
      difference.push([x, null]);
      previous = undefined;
      continue;
    }
    const gap = value - targetValue;
    // Straight lines cross between two points: the band stops at the crossing. Stepped lines cross
    // at a point, where the band steps to 0.
    if (previous && !source.step && !target.step && previous.gap * gap < 0) {
      const ratio = previous.gap / (previous.gap - gap);
      base.push([previous.x + (x - previous.x) * ratio, previous.target + (targetValue - previous.target) * ratio]);
      difference.push([previous.x + (x - previous.x) * ratio, 0]);
    }
    base.push([x, targetValue]);
    difference.push([x, Math.max(gap, 0)]);
    previous = { x, target: targetValue, gap };
  }
  return { base, difference };
}

/**
 * The series with the bands of "Fill below to". A source series loses its fill to the axis, and the
 * two series of its band go after the data series, so the index of each data series does not change.
 * `targets` is from {@link resolveFillBelowTo}.
 *
 * A source whose target is not in the data has no fill, as core. The chart cannot draw a band for a
 * source that is not a `line`, for a source or a target in a stack, and for a source and a target on
 * different y-axes (the stack has one axis). Such a source keeps its fill to the axis.
 */
export function applyFillBelowTo<T extends BandSource>(
  series: T[],
  targets: Array<number | null | undefined>
): Array<T | LineSeriesOption> {
  const bands: LineSeriesOption[] = [];
  const dataSeries = series.map((source, i) => {
    const targetIndex = targets[i];
    if (targetIndex === undefined) {
      return source;
    }
    if (targetIndex === null) {
      return { ...source, areaStyle: undefined };
    }
    const target = series[targetIndex];
    const sameAxis = (source.yAxisIndex ?? 0) === (target.yAxisIndex ?? 0);
    if (source.type !== 'line' || source.stack != null || target.stack != null || !sameAxis) {
      return source;
    }

    const id = `${FILL_BELOW_TO_SERIES_ID}:${i}`;
    // The two series have the line shape of the source. No name: the series are not in the legend.
    // `z: 1` draws the band below the lines (the default `z` of a series is 2). No `sampling`: the
    // band keeps each point, because a sample of the difference is not a sample of the two lines.
    const hidden: LineSeriesOption = {
      type: 'line',
      stack: id,
      // The band is on the base also where the target is below zero.
      // https://echarts.apache.org/en/option.html#series-line.stackStrategy
      stackStrategy: 'all',
      yAxisIndex: source.yAxisIndex,
      zlevel: source.zlevel,
      z: 1,
      symbol: 'none',
      lineStyle: { opacity: 0 },
      silent: true,
      legendHoverLink: false,
      tooltip: { show: false },
      emphasis: { disabled: true },
      ...(source.smooth ? { smooth: source.smooth, smoothMonotone: source.smoothMonotone } : {}),
      ...(source.step ? { step: source.step } : {}),
    };
    const { base, difference } = bandData(source, target);
    bands.push(
      { ...hidden, id: `${id}:base`, data: base },
      {
        ...hidden,
        id: `${id}:band`,
        data: difference,
        // The fill of the source: its opacity, and its gradient for a gradient mode (`getLineGradientColors`).
        // A source with no fill has the line color at the default opacity.
        areaStyle: { color: source.lineStyle?.color, opacity: FILL_BELOW_TO_DEFAULT_OPACITY, ...source.areaStyle },
      }
    );
    // The fill of the source is the band.
    return { ...source, areaStyle: undefined };
  });
  return [...dataSeries, ...bands];
}
