import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { type LineSeriesOption } from 'echarts';
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

  it('has no target for an unknown name, an empty name or the series itself', () => {
    const frames = [
      frame([
        { name: 'a', fillBelowTo: 'x' },
        { name: 'b', fillBelowTo: '' },
        { name: 'c', fillBelowTo: 'c' },
      ]),
    ];
    expect(resolveFillBelowTo(frames)).toEqual([undefined, undefined, undefined]);
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

  it('gives the band the axis and the line shape of the source', () => {
    const shape = { yAxisIndex: 1, zlevel: 3, connectNulls: true, step: 'end' as const };
    const [, , base, band] = applyFillBelowTo([line([5, 6], shape), line([2, 4])], [1, undefined]);
    expect(base).toMatchObject(shape);
    expect(band).toMatchObject(shape);
  });

  it('aligns the target on the x values of the source', () => {
    const target: LineSeriesOption = { type: 'line', data: [{ value: [2, 10] }, [0, 20]] };
    const [, , base] = applyFillBelowTo([line([5, 6, 7]), target], [1, undefined]) as LineSeriesOption[];
    expect(base.data).toEqual([
      [0, 20],
      [1, null],
      [2, 10],
    ]);
  });

  it('adds no band for a source that is not a line, or for a stacked source or target', () => {
    const bar = { type: 'bar' as const, data: [[0, 1]] };
    expect(applyFillBelowTo([bar, line([1])], [1, undefined])).toHaveLength(2);
    expect(applyFillBelowTo([line([1], { stack: 's' }), line([1])], [1, undefined])).toHaveLength(2);
    expect(applyFillBelowTo([line([1]), line([1], { stack: 's' })], [1, undefined])).toHaveLength(2);
  });
});
