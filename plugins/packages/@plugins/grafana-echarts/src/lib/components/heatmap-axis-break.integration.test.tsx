import { use as registerEChartsModules } from 'echarts/core';
import { AxisBreak } from 'echarts/features';
import { cellRects, leRowsFrame, namedRowsFrame, renderHeatmap } from 'test/heatmapCanvas';
import { height } from 'test/panel';

// The plugin does not register `AxisBreak`, so ECharts ignores an axis `breaks` option.
// This suite registers the feature for this file only. If the bucket axis sets `breaks`
// from the buckets again, each bucket becomes a break. A browser then draws the rows
// collapsed into one line (#180), and this render throws in `setOption`.
// https://echarts.apache.org/en/option.html#yAxis.breaks
registerEChartsModules([AxisBreak]);

describe('heatmap bucket axis with the AxisBreak feature registered', () => {
  it.each([
    ['le rows', leRowsFrame],
    ['named rows', namedRowsFrame],
  ])('fills more than half of the panel height with the %s', async (_name, frame) => {
    const rects = cellRects((await renderHeatmap([frame])).seriesEvents);
    const top = Math.min(...rects.map((rect) => rect.y));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    expect(bottom - top).toBeGreaterThan(height / 2);
  });
});
