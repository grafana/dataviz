import {
  axisLabelYs,
  cellHeights,
  cellRects,
  denseCellsFrame,
  largestCell,
  leRowsFrame,
  manyLeRowsFrame,
  namedRowsFrame,
  renderHeatmap,
  sparseCellsFrame,
  wideSparseCellsFrame,
} from 'test/heatmapCanvas';
import { height } from 'test/panel';

// Heatmap core-parity claims, stated as counts and as differences between two
// renders. No baselines here: the drawn geometry is pinned next door in
// `heatmap.canvas.test.tsx`. See `test/heatmapCanvas.tsx` for the fixtures.

describe('heatmap Y bucket scale for le rows', () => {
  it('draws every le bucket at the same height by default (core "Auto")', async () => {
    const { seriesEvents } = await renderHeatmap([leRowsFrame]);
    expect(cellHeights(cellRects(seriesEvents))).toHaveLength(1);
  });

  it('draws exponential le buckets at different heights on a linear scale', async () => {
    const { seriesEvents } = await renderHeatmap([leRowsFrame], { rowsFrame: { yBucketScale: { type: 'linear' } } });
    expect(cellHeights(cellRects(seriesEvents)).length).toBeGreaterThan(1);
  });

  it('draws buckets that grow by a constant ratio at one height on a log scale', async () => {
    // Bounds 1, 4, 16 and +Inf grow by 4 each: one height on a log axis.
    const { seriesEvents } = await renderHeatmap([leRowsFrame], {
      rowsFrame: { yBucketScale: { type: 'log', log: 2 } },
    });
    expect(cellHeights(cellRects(seriesEvents))).toHaveLength(1);
  });

  // An axis break on each bucket collapses the rows into one line (#180).
  it.each([
    ['le rows', leRowsFrame],
    ['named rows', namedRowsFrame],
  ])('fills more than half of the panel height with the %s', async (_name, frame) => {
    const rects = cellRects((await renderHeatmap([frame])).seriesEvents);
    const top = Math.min(...rects.map((rect) => rect.y));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    expect(bottom - top).toBeGreaterThan(height / 2);
  });

  // ECharts reports an option that needs a feature that is not registered, such as axis `breaks` (#180).
  it('logs no ECharts AxisBreak error for the bucket axis', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderHeatmap([leRowsFrame]);
    const messages = consoleError.mock.calls.map((args) => args.join(' '));
    consoleError.mockRestore();
    expect(messages.filter((message) => message.includes('AxisBreak'))).toEqual([]);
  });
});

describe('heatmap dense cells (calculate from data output)', () => {
  it('draws doubling buckets at growing heights on a linear axis', async () => {
    const { seriesEvents } = await renderHeatmap([denseCellsFrame()]);
    expect(cellHeights(cellRects(seriesEvents)).length).toBeGreaterThan(1);
  });

  it('draws doubling buckets at one height on a log2 axis', async () => {
    const { seriesEvents } = await renderHeatmap([denseCellsFrame(2)]);
    expect(cellHeights(cellRects(seriesEvents))).toHaveLength(1);
  });
});

describe('heatmap sparse cells (Prometheus native histogram)', () => {
  it('draws doubling buckets at one height by default (core log 2)', async () => {
    const { seriesEvents } = await renderHeatmap([sparseCellsFrame()]);
    const rects = cellRects(seriesEvents);
    expect(rects).toHaveLength(12);
    expect(cellHeights(rects)).toHaveLength(1);
  });

  it('draws doubling buckets at growing heights on a linear Y bucket scale', async () => {
    const { seriesEvents } = await renderHeatmap([sparseCellsFrame()], {
      rowsFrame: { yBucketScale: { type: 'linear' } },
    });
    expect(cellHeights(cellRects(seriesEvents)).length).toBeGreaterThan(1);
  });

  it('keeps the log scale with a zero bucket, and draws only the buckets above 0', async () => {
    const { seriesEvents } = await renderHeatmap([sparseCellsFrame(true)]);
    const rects = cellRects(seriesEvents);
    // Four of the six buckets in each of the three columns, as in core.
    expect(rects).toHaveLength(12);
    expect(cellHeights(rects)).toHaveLength(1);
  });
});

describe('heatmap cell display', () => {
  it('leaves out cells at or below filterValues.le', async () => {
    const all = cellRects((await renderHeatmap([leRowsFrame])).seriesEvents);
    const kept = cellRects((await renderHeatmap([leRowsFrame], { filterValues: { le: 1e-9 } })).seriesEvents);
    // The fixture has three empty cells.
    expect(all.length - kept.length).toBe(3);
  });

  it('keeps the Y range of every bucket when cells are hidden', async () => {
    const all = cellRects((await renderHeatmap([leRowsFrame])).seriesEvents);
    const kept = cellRects((await renderHeatmap([leRowsFrame], { filterValues: { le: 1e-9 } })).seriesEvents);
    const span = (rects: typeof all) => [
      Math.min(...rects.map((r) => r.y)),
      Math.max(...rects.map((r) => r.y + r.height)),
    ];
    expect(span(kept)).toEqual(span(all));
  });

  it('shrinks each cell by cellGap', async () => {
    const flush = largestCell(cellRects((await renderHeatmap([leRowsFrame], { cellGap: 0 })).seriesEvents));
    const gapped = largestCell(cellRects((await renderHeatmap([leRowsFrame], { cellGap: 3 })).seriesEvents));
    // No gap adds 0.5 px to close seams; a gap removes its size.
    expect(flush.width - gapped.width).toBeCloseTo(3.5);
    expect(flush.height - gapped.height).toBeCloseTo(3.5);
  });
});

describe('heatmap colors', () => {
  const alpha = (fill?: string) => Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(fill ?? '')?.[1] ?? 1);

  it('fades the fill from clear to solid in opacity mode', async () => {
    const rects = cellRects(
      (await renderHeatmap([leRowsFrame], { color: { mode: 'opacity', fill: 'blue', scale: 'linear' } })).seriesEvents
    );
    const alphas = rects.map((rect) => alpha(rect.fillStyle));
    expect(Math.min(...alphas)).toBeLessThan(0.05);
    expect(Math.max(...alphas)).toBeGreaterThan(0.95);
  });

  it('keeps low values more visible with the exponential scale', async () => {
    const opts = (scale: 'linear' | 'exponential') => ({ color: { mode: 'opacity' as const, fill: 'blue', scale } });
    const mean = (rects: ReturnType<typeof cellRects>) =>
      rects.reduce((sum, rect) => sum + alpha(rect.fillStyle), 0) / rects.length;
    const linear = cellRects((await renderHeatmap([leRowsFrame], opts('linear'))).seriesEvents);
    const exponential = cellRects((await renderHeatmap([leRowsFrame], opts('exponential'))).seriesEvents);
    expect(mean(exponential)).toBeGreaterThan(mean(linear));
  });

  it('maps colors against color.min and color.max instead of the data range', async () => {
    const fills = async (color?: { min?: number; max?: number }) =>
      cellRects((await renderHeatmap([leRowsFrame], { color: { mode: 'scheme', ...color } })).seriesEvents).map(
        (rect) => rect.fillStyle
      );
    // A max far above the data squeezes every cell into the low end of the scale.
    const wide = new Set(await fills({ min: 0, max: 1000 }));
    const data = new Set(await fills());
    expect(wide.size).toBeLessThan(data.size);
  });
});

describe('heatmap log Y axis ticks', () => {
  // The largest difference between two label gaps, in pixels. Equal steps on a log axis give 0 or 1.
  const gapSpread = (drawn: ReturnType<typeof axisLabelYs>) => {
    const gaps = drawn.slice(1).map((label, i) => label.y - drawn[i].y);
    return Math.max(...gaps) - Math.min(...gaps);
  };

  it('draws the labels of a sparse frame at an equal distance on the default log 2 scale', async () => {
    const { axisEvents } = await renderHeatmap([wideSparseCellsFrame()]);
    const drawn = axisLabelYs(axisEvents);
    // 17 magnitudes in a 300 px panel: a label for each third power of 2, from 2^0 down to 2^-15.
    expect(drawn).toHaveLength(6);
    expect(drawn[0].text).toBe('1');
    expect(gapSpread(drawn)).toBeLessThanOrEqual(1);
  });

  it('draws the labels of a sparse frame at an equal distance on a log 10 scale', async () => {
    const { axisEvents } = await renderHeatmap([wideSparseCellsFrame()], {
      rowsFrame: { yBucketScale: { type: 'log', log: 10 } },
    });
    const drawn = axisLabelYs(axisEvents);
    // 2^-15 to 4 goes out to 10^-5 and 10: a label for each of the 7 powers of 10.
    expect(drawn.map((label) => label.text)).toEqual([
      '10',
      '1',
      '0.100',
      '0.0100',
      '0.00100',
      '0.000100',
      '0.0000100',
    ]);
    expect(gapSpread(drawn)).toBeLessThanOrEqual(1);
  });
});

describe('heatmap Y labels with more buckets than the labels that fit', () => {
  // 60 buckets have 61 bounds. The plot is too short for 61 lines of 12 px text.
  const FONT_SIZE = 12;
  const labels = async (options?: Parameters<typeof renderHeatmap>[1]) =>
    axisLabelYs((await renderHeatmap([manyLeRowsFrame()], options)).axisEvents);
  const gaps = (drawn: Awaited<ReturnType<typeof labels>>) => drawn.slice(1).map((label, i) => label.y - drawn[i].y);

  it.each([
    ['Auto', undefined],
    ['Linear', { rowsFrame: { yBucketScale: { type: 'linear' as const } } }],
  ])('does not draw labels that overlap on the %s scale', async (_name, options) => {
    const drawn = await labels(options);
    expect(drawn.length).toBeGreaterThan(2);
    expect(drawn.length).toBeLessThan(61);
    expect(Math.min(...gaps(drawn))).toBeGreaterThanOrEqual(FONT_SIZE);
    // The axis keeps its two bounds.
    expect(drawn[0].text).toBe('+Inf');
    expect(drawn[drawn.length - 1].text).toBe('0');
  });
});

describe('heatmap Y label width', () => {
  it('moves the cells right to fit a long unit label', async () => {
    const left = async (unit?: string) =>
      Math.min(
        ...cellRects((await renderHeatmap([leRowsFrame], { yAxis: { unit, decimals: 1 } })).seriesEvents).map(
          (r) => r.x
        )
      );
    // "16.0 kW" is wider than "16.0"; `grid.containLabel` must reserve that room.
    expect(await left('kwatt')).toBeGreaterThan(await left());
  });
});
