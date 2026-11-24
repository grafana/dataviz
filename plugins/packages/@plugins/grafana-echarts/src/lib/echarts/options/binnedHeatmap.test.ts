import { FieldType } from '@grafana/data';
import { type BinnedHeatmapData } from 'lib/echarts/converters/binnedHeatmap';
import { getBinnedHeatmapBucketAxis, getBinnedHeatmapYAxis } from 'lib/echarts/options/binnedHeatmap';

const baseData = (overrides: Partial<BinnedHeatmapData>): BinnedHeatmapData => ({
  cells: [],
  valueMin: 0,
  valueMax: 1,
  yMin: 0,
  yMax: 1,
  xIsTime: true,
  yBuckets: [],
  yLabelPlacement: 'bound',
  valueField: { name: 'value', type: FieldType.number, values: [], config: {} },
  ...overrides,
});

describe('getBinnedHeatmapBucketAxis', () => {
  it('returns nothing when there are no buckets', () => {
    expect(getBinnedHeatmapBucketAxis(baseData({ yBuckets: [] }))).toEqual({});
  });

  it('places labels at bucket upper bounds (plus the first lower bound) for "bound" placement', () => {
    const axis = getBinnedHeatmapBucketAxis(
      baseData({
        yLabelPlacement: 'bound',
        yBuckets: [
          { start: 0, end: 10, label: '10' },
          { start: 10, end: 20, label: '20' },
          { start: 20, end: 30, label: '+Inf' },
        ],
      })
    );

    // Labels at 0, 10, 20, 30; grid lines at every boundary.
    expect((axis.axisLabel as { customValues: number[] }).customValues).toEqual([0, 10, 20, 30]);

    const formatter = (axis.axisLabel as { formatter: (v: number) => string }).formatter;
    expect(formatter(0)).toBe('0');
    expect(formatter(10)).toBe('10');
    expect(formatter(30)).toBe('+Inf');
    // Values between bounds are not drawn; they get the widest label so
    // `grid.containLabel` reserves room for it.
    expect(formatter(15)).toBe('+Inf');
  });

  // An axis break collapses its range, so breaks made from the buckets collapse all cells (#180).
  it('sets no axis breaks', () => {
    const axis = getBinnedHeatmapBucketAxis(baseData({ yBuckets: [{ start: 0, end: 10, label: '10' }] }));

    expect(axis).not.toHaveProperty('breaks');
  });

  it('places labels at bucket centers for "center" (ordinal) placement', () => {
    const axis = getBinnedHeatmapBucketAxis(
      baseData({
        yLabelPlacement: 'center',
        yBuckets: [
          { start: 0, end: 1, label: 'a' },
          { start: 1, end: 2, label: 'b' },
        ],
      })
    );

    expect((axis.axisLabel as { customValues: number[] }).customValues).toEqual([0.5, 1.5]);

    const formatter = (axis.axisLabel as { formatter: (v: number) => string }).formatter;
    expect(formatter(0.5)).toBe('a');
    expect(formatter(1.5)).toBe('b');
  });

  it('hides labels that overlap, but keeps the first and the last label', () => {
    const axis = getBinnedHeatmapBucketAxis(baseData({ yBuckets: [{ start: 0, end: 1, label: '1' }] }));
    expect(axis.axisLabel).toMatchObject({ hideOverlap: true, showMinLabel: true, showMaxLabel: true });
  });
});

describe('getBinnedHeatmapYAxis', () => {
  const buckets = [
    { start: 0, end: 1, label: '1' },
    { start: 1, end: 2, label: '512' },
  ];
  const labelFormatter = (axis: object) =>
    (axis as { axisLabel: { formatter: (v: number) => string } }).axisLabel.formatter;

  it('formats numeric bucket labels with the unit and decimals, and reverses', () => {
    const axis = getBinnedHeatmapYAxis(baseData({ yLabelPlacement: 'center', yBuckets: buckets }), {
      unit: 'kwatt',
      decimals: 1,
      reverse: true,
    });
    expect(labelFormatter(axis)(1.5)).toBe('512.0 kW');
    expect(axis).toMatchObject({ inverse: true });
  });

  it('uses a log axis snapped to whole magnitudes for a log Y scale', () => {
    const axis = getBinnedHeatmapYAxis(baseData({ yScale: { type: 'log', log: 10 }, yMin: 0.02, yMax: 15000 }), {
      min: 700,
    });
    expect(axis).toMatchObject({ type: 'log', logBase: 10, min: 100, max: 100000 });
  });

  it('sets log ticks at an equal distance, a tick for each second power of 2 in a 370 px plot', () => {
    // A native histogram from 36 µs to 2.83 s on a log 2 axis: 17 magnitudes.
    const data = baseData({ yScale: { type: 'log', log: 2 }, yMin: 2 ** -14.75, yMax: 2 ** 1.5 });
    const axis = getBinnedHeatmapYAxis(data, undefined, 370);
    expect(axis).toMatchObject({ min: 2 ** -15, max: 4 });
    const ticks = [-14, -12, -10, -8, -6, -4, -2, 0, 2].map((e) => 2 ** e);
    expect(axis).toMatchObject({ axisLabel: { customValues: ticks }, axisTick: { customValues: ticks } });
  });

  it('uses a larger tick step in a short plot', () => {
    const data = baseData({ yScale: { type: 'log', log: 2 }, yMin: 2 ** -14.75, yMax: 2 ** 1.5 });
    const axis = getBinnedHeatmapYAxis(data, undefined, 150);
    const ticks = [-15, -10, -5, 0].map((e) => 2 ** e);
    expect(axis).toMatchObject({ axisLabel: { customValues: ticks } });
  });

  it('formats a log tick the same with and without float noise', () => {
    // `10 ** -4` is 0.00009999999999999999 in some Node versions, which gave "100.0 µs" for "100 µs".
    const axis = getBinnedHeatmapYAxis(baseData({ yScale: { type: 'log', log: 10 }, yMin: 0.00002, yMax: 0.5 }), {
      unit: 's',
    });
    const format = (axis.axisLabel as { formatter: (value: number) => string }).formatter;
    expect(format(0.00009999999999999999)).toBe('100 µs');
    expect(format(0.0001)).toBe('100 µs');
  });

  it('keeps a whole magnitude whole in the log range', () => {
    const axis = getBinnedHeatmapYAxis(baseData({ yScale: { type: 'log', log: 10 }, yMin: 1000, yMax: 1000000 }), {});
    expect(axis).toMatchObject({ min: 1000, max: 1000000 });
  });

  it('leaves a linear range to ECharts unless min/max are set', () => {
    const axis = getBinnedHeatmapYAxis(baseData({ yScale: { type: 'linear' } }), { max: '15000' });
    expect(axis).toMatchObject({ type: 'value', min: undefined, max: 15000 });
  });
});
