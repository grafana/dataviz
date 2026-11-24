import { normalizeCanvasEvents } from 'test/canvas';
import {
  denseCellsFrame,
  leRowsFrame,
  renderHeatmap,
  sparseCellsFrame,
  wideSparseCellsFrame,
} from 'test/heatmapCanvas';
import { height, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Heatmap core-parity baselines: the cell layer (or the axis layer for labels)
// for each core option the binned layout reads. The claims these pictures
// support are stated as code in `heatmap.integration.test.tsx`.

// Commit the cell layer; grid and axes are viewer-only context.
const renderCells = async (frames: Parameters<typeof renderHeatmap>[0], options: Partial<PanelOptions>) => {
  const { seriesEvents, defaultEvents, axisEvents } = await renderHeatmap(frames, options);
  return { cells: normalizeCanvasEvents(seriesEvents), context: [...defaultEvents, ...axisEvents] };
};

describe('heatmap core parity canvas', () => {
  describe('le rows Y bucket scale', () => {
    it('auto (ordinal rows)', async () => {
      const { cells, context } = await renderCells([leRowsFrame], {});
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });

    it('linear', async () => {
      const { cells, context } = await renderCells([leRowsFrame], { rowsFrame: { yBucketScale: { type: 'linear' } } });
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });

    it('log2', async () => {
      const { cells, context } = await renderCells([leRowsFrame], {
        rowsFrame: { yBucketScale: { type: 'log', log: 2 } },
      });
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });
  });

  describe('dense cells (calculate from data output)', () => {
    it('linear Y axis', async () => {
      const { cells, context } = await renderCells([denseCellsFrame()], {});
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });

    it('log2 Y axis', async () => {
      const { cells, context } = await renderCells([denseCellsFrame(2)], {});
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });
  });

  describe('sparse cells (Prometheus native histogram)', () => {
    it('log2 Y axis by default', async () => {
      const { cells, context } = await renderCells([sparseCellsFrame()], {});
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });

    it('log2 Y axis with a zero bucket', async () => {
      const { cells, context } = await renderCells([sparseCellsFrame(true)], {});
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });

    it('linear Y bucket scale', async () => {
      const { cells, context } = await renderCells([sparseCellsFrame()], {
        rowsFrame: { yBucketScale: { type: 'linear' } },
      });
      expect(cells).toMatchCanvasSnapshot(context, { width, height });
    });
  });

  it('cell gap with hidden empty cells', async () => {
    const { cells, context } = await renderCells([leRowsFrame], { cellGap: 3, filterValues: { le: 1e-9 } });
    expect(cells).toMatchCanvasSnapshot(context, { width, height });
  });

  it('opacity mode, exponential scale, fixed color range', async () => {
    const { cells, context } = await renderCells([leRowsFrame], {
      color: { mode: 'opacity', fill: 'blue', scale: 'exponential', exponent: 0.5, min: 0, max: 12 },
    });
    expect(cells).toMatchCanvasSnapshot(context, { width, height });
  });

  // The axis layer: the Y labels, ticks and split lines. The cell baselines above do not cover it.
  describe('log Y axis ticks', () => {
    const renderAxis = async (frames: Parameters<typeof renderHeatmap>[0], options: Partial<PanelOptions>) => {
      const { seriesEvents, defaultEvents, axisEvents } = await renderHeatmap(frames, options);
      return { axis: normalizeCanvasEvents(axisEvents), context: [...defaultEvents, ...seriesEvents] };
    };

    it('sparse cells, log2 by default, 17 magnitudes', async () => {
      const { axis, context } = await renderAxis([wideSparseCellsFrame()], { yAxis: { unit: 's' } });
      expect(axis).toMatchCanvasSnapshot(context, { width, height });
    });

    it('sparse cells, log10 Y bucket scale', async () => {
      const { axis, context } = await renderAxis([wideSparseCellsFrame()], {
        yAxis: { unit: 's' },
        rowsFrame: { yBucketScale: { type: 'log', log: 10 } },
      });
      expect(axis).toMatchCanvasSnapshot(context, { width, height });
    });

    it('dense cells, log2', async () => {
      const { axis, context } = await renderAxis([denseCellsFrame(2)], {});
      expect(axis).toMatchCanvasSnapshot(context, { width, height });
    });

    it('le rows, log2 Y bucket scale', async () => {
      const { axis, context } = await renderAxis([leRowsFrame], {
        rowsFrame: { yBucketScale: { type: 'log', log: 2 } },
      });
      expect(axis).toMatchCanvasSnapshot(context, { width, height });
    });
  });

  it('long unit labels on the Y axis', async () => {
    const { seriesEvents, defaultEvents, axisEvents } = await renderHeatmap([leRowsFrame], {
      yAxis: { unit: 'kwatt', decimals: 1 },
    });
    // Commit the axis layer; the cells and grid are viewer-only context.
    expect(normalizeCanvasEvents(axisEvents)).toMatchCanvasSnapshot([...defaultEvents, ...seriesEvents], {
      width,
      height,
    });
  });
});
