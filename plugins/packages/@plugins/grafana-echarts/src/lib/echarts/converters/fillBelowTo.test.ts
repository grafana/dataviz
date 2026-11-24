import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type LineSeriesOption } from 'echarts';
import { getPlotGradient } from 'lib/echarts/plotGradient';
import { applyFillBelowTo, FILL_BELOW_TO_DEFAULT_OPACITY, resolveFillBelowTo } from './fillBelowTo';

type FieldInput = { name: string; fillBelowTo?: string; displayName?: string; displayNameFromDS?: string };

const frame = (fields: FieldInput[]): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 1] },
      ...fields.map(({ name, fillBelowTo, ...config }) => ({
        name,
        type: FieldType.number,
        values: [1, 2],
        config: { ...config, ...(fillBelowTo == null ? {} : { custom: { fillBelowTo } }) },
      })),
    ],
  });

describe('resolveFillBelowTo', () => {
  it('gives the series index of the target, by field name', () => {
    expect(
      resolveFillBelowTo([frame([{ name: 'max', fillBelowTo: 'min' }, { name: 'avg' }, { name: 'min' }])])
    ).toEqual([2, undefined, undefined]);
  });

  it('gives an empty result when no series has a Fill below to', () => {
    // `toEqual` reads `[undefined, undefined]` as `[]`, so the test reads the length.
    expect(resolveFillBelowTo([frame([{ name: 'a' }, { name: 'b', fillBelowTo: '' }])])).toHaveLength(0);
  });

  it('finds the target by display name and by data source display name', () => {
    const frames = [
      frame([
        { name: 'a', fillBelowTo: 'Low' },
        { name: 'b', fillBelowTo: 'low-ds' },
        { name: 'c', displayName: 'Low', displayNameFromDS: 'low-ds' },
      ]),
    ];
    expect(resolveFillBelowTo(frames)).toEqual([2, 2, undefined]);
  });

  it('finds a target in another frame', () => {
    expect(resolveFillBelowTo([frame([{ name: 'max', fillBelowTo: 'min' }]), frame([{ name: 'min' }])])).toEqual([
      1,
      undefined,
    ]);
  });

  it('gives null for a target that the data does not have: an unknown name or the series itself', () => {
    const frames = [
      frame([
        { name: 'a', fillBelowTo: 'x' },
        { name: 'b', fillBelowTo: '' },
        { name: 'c', fillBelowTo: 'c' },
      ]),
    ];
    // An empty name is no "Fill below to".
    expect(resolveFillBelowTo(frames)).toEqual([null, undefined, null]);
  });
});

describe('applyFillBelowTo', () => {
  const line = (values: Array<number | null>, extra: LineSeriesOption = {}): LineSeriesOption => ({
    type: 'line',
    name: 'series',
    data: values.map((value, i) => [i, value]),
    lineStyle: { color: 'red' },
    ...extra,
  });

  it('returns the series as they are with no target', () => {
    const series = [line([1, 2]), line([3, 4])];
    expect(applyFillBelowTo(series, [undefined, undefined])).toEqual(series);
  });

  it('adds a base and a band after the data series, in one stack', () => {
    const series = [line([5, 1, 7]), line([2, 4, null])];
    const [source, target, base, band] = applyFillBelowTo(series, [1, undefined]) as LineSeriesOption[];
    expect([source, target]).toEqual(series);
    // The base has the target values. The band has the difference: 0 where the source is below the
    // target, and a point at x 0.5, where the lines cross.
    expect(base.data).toEqual([
      [0, 2],
      [0.5, 3],
      [1, 4],
      [2, null],
    ]);
    expect(band.data).toEqual([
      [0, 3],
      [0.5, 0],
      [1, 0],
      [2, null],
    ]);
    expect(base.stack).toBe(band.stack);
    expect(base.stackStrategy).toBe('all');
    expect(base.areaStyle).toBeUndefined();
    expect(band.areaStyle).toEqual({ color: 'red', opacity: FILL_BELOW_TO_DEFAULT_OPACITY });
    // The two series draw no line, are not in the legend and take no pointer events.
    for (const hidden of [base, band]) {
      expect(hidden).toMatchObject({ lineStyle: { opacity: 0 }, symbol: 'none', silent: true });
      expect(hidden.name).toBeUndefined();
    }
  });

  it('moves the fill of the source to the band, with its opacity', () => {
    const series = [line([5, 6], { areaStyle: { opacity: 0.6 } }), line([2, 4], { areaStyle: { opacity: 0.1 } })];
    const [source, target, , band] = applyFillBelowTo(series, [1, undefined]) as LineSeriesOption[];
    expect(source.areaStyle).toBeUndefined();
    expect(target.areaStyle).toEqual({ opacity: 0.1 });
    expect(band.areaStyle).toEqual({ color: 'red', opacity: 0.6 });
  });

  // A gradient mode (#120) gives the source an `areaStyle` with a gradient color. Its color stops have the fill
  // opacity, so the opacity of the `areaStyle` is 1 (`getLineGradientColors`).
  it('moves the gradient fill of the source to the band', () => {
    const gradient = getPlotGradient([
      { offset: 0, color: 'rgba(255, 0, 0, 0.5)' },
      { offset: 1, color: 'rgba(255, 0, 0, 0)' },
    ]);
    const series = [line([5, 6], { areaStyle: { color: gradient, opacity: 1 } }), line([2, 4])];
    const [source, , , band] = applyFillBelowTo(series, [1, undefined]) as LineSeriesOption[];
    expect(source.areaStyle).toBeUndefined();
    expect(band.areaStyle).toEqual({ color: gradient, opacity: 1 });
  });

  it('gives a band with no fill of the source the gradient of a Hue line, at the default opacity', () => {
    const gradient = getPlotGradient([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#990000' },
    ]);
    const series = [line([5, 6], { lineStyle: { color: gradient } }), line([2, 4])];
    const [, , , band] = applyFillBelowTo(series, [1, undefined]) as LineSeriesOption[];
    expect(band.areaStyle).toEqual({ color: gradient, opacity: FILL_BELOW_TO_DEFAULT_OPACITY });
  });

  it('gives the band the axis and the line shape of the source, and no sampling', () => {
    const shape = { yAxisIndex: 1, zlevel: 3, smooth: true, smoothMonotone: 'x' as const };
    const source = line([5, 6], { ...shape, sampling: 'lttb' });
    const [, , base, band] = applyFillBelowTo([source, line([2, 4], { yAxisIndex: 1 })], [1, undefined]);
    for (const hidden of [base, band] as LineSeriesOption[]) {
      expect(hidden).toMatchObject(shape);
      expect(hidden.sampling).toBeUndefined();
    }
  });

  // Two queries have their own times. Core joins the frames, so the band follows the two lines.
  it('follows the two lines when the series have different x values', () => {
    const target: LineSeriesOption = { type: 'line', data: [{ value: [2.5, 10] }, [0.5, 20], [1.5, 0]] };
    const [, , base, band] = applyFillBelowTo([line([25, 25, 25, 25]), target], [1, undefined]) as LineSeriesOption[];
    // A point at each x of the two series. No value before the first point of the target (x 0) and
    // after its last point (x 3). The target is on its segment at the x values of the source.
    expect(base.data).toEqual([
      [0, null],
      [0.5, 20],
      [1, 10],
      [1.5, 0],
      [2, 5],
      [2.5, 10],
      [3, null],
    ]);
    expect(band.data).toEqual([
      [0, null],
      [0.5, 5],
      [1, 15],
      [1.5, 25],
      [2, 20],
      [2.5, 15],
      [3, null],
    ]);
  });

  it('breaks the band at a null of the target, and not at a null that the line connects', () => {
    const source = line([9, 9, 9]);
    const base = (target: LineSeriesOption) =>
      (applyFillBelowTo([source, target], [1, undefined]) as LineSeriesOption[])[2].data;
    expect(base(line([1, null, 3]))).toEqual([
      [0, 1],
      [1, null],
      [2, 3],
    ]);
    expect(base(line([1, null, 3], { connectNulls: true }))).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('holds the value of a stepped line between its points, with no crossing point', () => {
    // The source steps at the end of a segment: 1 until x 2, then 9. The target is 5 at x 1.
    const source = line([1, null, 9], { step: 'end', connectNulls: true });
    const target: LineSeriesOption = {
      type: 'line',
      step: 'end',
      data: [
        [0, 5],
        [1, 5],
        [2, 5],
      ],
    };
    const [, , base, band] = applyFillBelowTo([source, target], [1, undefined]) as LineSeriesOption[];
    expect(base.data).toEqual([
      [0, 5],
      [1, 5],
      [2, 5],
    ]);
    expect(band.data).toEqual([
      [0, 0],
      [1, 0],
      [2, 4],
    ]);
    expect(band.step).toBe('end');
  });

  it('removes the fill of a source whose target is not in the data, as core', () => {
    const series = [line([5, 6], { areaStyle: { opacity: 0.4 } }), line([2, 4])];
    const result = applyFillBelowTo(series, [null, undefined]) as LineSeriesOption[];
    expect(result).toHaveLength(2);
    expect(result[0].areaStyle).toBeUndefined();
  });

  it('adds no band, and keeps the fill, where the chart cannot draw the band', () => {
    const fill = { areaStyle: { opacity: 0.4 } };
    const bar = { type: 'bar' as const, data: [[0, 1]] };
    expect(applyFillBelowTo([bar, line([1])], [1, undefined])).toHaveLength(2);
    // A source or a target in a stack, and a target on another y-axis.
    for (const [source, target] of [
      [line([1], { ...fill, stack: 's' }), line([1])],
      [line([1], fill), line([1], { stack: 's' })],
      [line([1], fill), line([1], { yAxisIndex: 1 })],
    ]) {
      const result = applyFillBelowTo([source, target], [1, undefined]) as LineSeriesOption[];
      expect(result).toHaveLength(2);
      expect(result[0].areaStyle).toEqual(fill.areaStyle);
    }
  });
});
