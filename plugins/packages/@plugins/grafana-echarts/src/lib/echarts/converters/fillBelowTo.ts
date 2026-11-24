import { type DataFrame, getFieldDisplayName } from '@grafana/data';
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
 * The index of the "Fill below to" target series of each time-axis series, in the order that
 * `timeSeriesToEChartsOption` emits series. `undefined` for a series with no target. The target is
 * the first other series whose name, data source display name or display name is the option value,
 * as core.
 */
export function resolveFillBelowTo(frames: DataFrame[]): Array<number | undefined> {
  const refs: Array<{ names: Array<string | undefined>; fillBelowTo: unknown }> = [];
  forEachTimeSeriesField(frames, ({ field, frame }) => {
    const config = getFieldConfigFromField(field);
    refs.push({
      names: [field.name, config.displayNameFromDS, getFieldDisplayName(field, frame, frames)],
      fillBelowTo: config.custom?.fillBelowTo,
    });
  });
  return refs.map(({ fillBelowTo }, i) => {
    if (typeof fillBelowTo !== 'string' || fillBelowTo === '') {
      return undefined;
    }
    const target = refs.findIndex(({ names }, t) => t !== i && names.includes(fillBelowTo));
    return target === -1 ? undefined : target;
  });
}

/** A time-axis series of any cartesian type, with the keys that a band reads. Only a line has the line keys. */
type BandSource = { type?: string; data?: unknown; stack?: string; yAxisIndex?: number; zlevel?: number } & Pick<
  LineSeriesOption,
  'areaStyle' | 'lineStyle' | 'connectNulls' | 'smooth' | 'smoothMonotone' | 'step' | 'sampling'
>;

/** The x and the value of one point. */
type Point = [number | string, number | null];

/** The `[x, value]` of an ECharts data item: a point, or `{ value: point }`. `undefined` for other shapes. */
function readPoint(item: unknown): Point | undefined {
  const point: unknown = item != null && typeof item === 'object' && 'value' in item ? item.value : item;
  if (!Array.isArray(point)) {
    return undefined;
  }
  const values: unknown[] = point;
  const [x, value] = values;
  if (typeof x !== 'number' && typeof x !== 'string') {
    return undefined;
  }
  return [x, typeof value === 'number' && Number.isFinite(value) ? value : null];
}

const points = (data: unknown): Point[] =>
  Array.isArray(data) ? data.map(readPoint).filter((point) => point !== undefined) : [];

/**
 * The series with the bands of "Fill below to". A source series loses its fill to the axis, and the
 * two series of its band go after the data series, so the index of each data series does not change.
 * `targets` is from {@link resolveFillBelowTo}.
 *
 * Only a `line` source that is not in a stack gets a band, and only to a target that is not in a
 * stack. The band has a value at each x where the source and the target have a value, and it has a
 * fill only where the source is above the target, as core.
 */
export function applyFillBelowTo<T extends BandSource>(
  series: T[],
  targets: Array<number | undefined>
): Array<T | LineSeriesOption> {
  const bands: LineSeriesOption[] = [];
  const dataSeries = series.map((source, i) => {
    const target = targets[i] === undefined ? undefined : series[targets[i]];
    if (!target || source.type !== 'line' || source.stack != null || target.stack != null) {
      return source;
    }
    const targetValues = new Map(points(target.data));
    const base: Point[] = [];
    const difference: Point[] = [];
    // The last point where the two series have a value, to find where the lines cross.
    let previous: { x: number; target: number; gap: number } | undefined;
    for (const [x, value] of points(source.data)) {
      const targetValue = targetValues.get(x) ?? null;
      if (value == null || targetValue == null) {
        base.push([x, null]);
        difference.push([x, null]);
        previous = undefined;
        continue;
      }
      const gap = value - targetValue;
      if (previous && typeof x === 'number' && previous.gap * gap < 0) {
        // The lines cross between the two points: the band stops at the crossing, not at the next point.
        const ratio = previous.gap / (previous.gap - gap);
        const crossing = previous.x + (x - previous.x) * ratio;
        base.push([crossing, previous.target + (targetValue - previous.target) * ratio]);
        difference.push([crossing, 0]);
      }
      base.push([x, targetValue]);
      // No fill where the source is below the target, as the uPlot band of core.
      difference.push([x, Math.max(gap, 0)]);
      previous = typeof x === 'number' ? { x, target: targetValue, gap } : undefined;
    }

    const id = `${FILL_BELOW_TO_SERIES_ID}:${i}`;
    // The keys of the source that give the two series the shape of its line. No name: the series
    // are not in the legend. `z: 1` draws the band below the lines (the default `z` of a series is 2).
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
      ...(source.connectNulls ? { connectNulls: true } : {}),
      ...(source.smooth ? { smooth: source.smooth, smoothMonotone: source.smoothMonotone } : {}),
      ...(source.step ? { step: source.step } : {}),
      ...(source.sampling ? { sampling: source.sampling } : {}),
    };
    bands.push(
      { ...hidden, id: `${id}:base`, data: base },
      {
        ...hidden,
        id: `${id}:band`,
        data: difference,
        areaStyle: {
          color: source.lineStyle?.color,
          opacity: source.areaStyle?.opacity ?? FILL_BELOW_TO_DEFAULT_OPACITY,
        },
      }
    );
    // The fill of the source is the band.
    return { ...source, areaStyle: undefined };
  });
  return [...dataSeries, ...bands];
}
