import { FieldType, toDataFrame } from '@grafana/data';
import { GraphGradientMode } from '@grafana/schema';
import { render } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { getChart, normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents } from 'test/panel';

// The core "Gradient mode" of line series (#120). Core draws one gradient from the top to the bottom of the plot
// for each series (`plot.bbox`), so two series with different values have the same gradient geometry:
// https://github.com/grafana/grafana/blob/main/packages/grafana-ui/src/components/uPlot/config/gradientFills.ts
// https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/time-series/#gradient-mode

const START = 1783137094497;
const times = [0, 1, 2, 3].map((i) => START + i * 30 * 60_000);

/** Two line series. `b` has values 10 times the values of `a`, so the two lines have different bounding boxes. */
const renderLines = async (
  custom: Record<string, unknown>,
  fillOpacity: number,
  beforeCapture?: (chart: EChartsType) => void
) => {
  const frame = toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: times },
      { name: 'a', type: FieldType.number, values: [1, 3, 2, 4], config: { custom } },
      { name: 'b', type: FieldType.number, values: [10, 30, 20, 40], config: { custom } },
    ],
  });
  const { container, unmount } = render(
    getComponent([frame], 'line', {
      lineWidth: 1,
      fillOpacity,
      zLevel: { series: SERIES_ZLEVEL },
      animation: { enabled: false },
    })
  );
  const { seriesEvents } = await getSeriesCanvasEvents(container, beforeCapture);
  const { chart } = getChart(container);
  const gradients = seriesEvents.filter((event) => event.type === 'createLinearGradient').map((event) => event.props);
  // An x position in the plot, to find the top and the bottom edge of the plot.
  const [x] = chart?.convertToPixel({ seriesIndex: 0 }, [times[1], 3]) ?? [];
  const inPlot = (y: number) => chart?.containPixel({ gridIndex: 0 }, [x, y]) === true;
  const [first] = gradients;
  const edges = first
    ? {
        topInPlot: inPlot(Number(first.y0) + 0.5),
        aboveTopInPlot: inPlot(Number(first.y0) - 0.5),
        bottomInPlot: inPlot(Number(first.y1) - 0.5),
        belowBottomInPlot: inPlot(Number(first.y1) + 0.5),
      }
    : undefined;
  unmount();
  return { gradients, edges, events: normalizeCanvasEvents(seriesEvents) };
};

/** A gradient that starts on the top edge of the plot and ends on the bottom edge. */
const PLOT_EDGES = { topInPlot: true, aboveTopInPlot: false, bottomInPlot: true, belowBottomInPlot: false };

describe('cartesian line gradient mode', () => {
  it.each([
    ['Opacity fills the areas', GraphGradientMode.Opacity, 50],
    ['Hue fills the areas and draws the lines', GraphGradientMode.Hue, 50],
    ['Hue draws the lines when there is no fill', GraphGradientMode.Hue, 0],
  ])('%s with one gradient from the top to the bottom of the plot', async (_, gradientMode, fillOpacity) => {
    const { gradients, edges } = await renderLines({ gradientMode }, fillOpacity);
    // One gradient or more for each series.
    expect(gradients.length).toBeGreaterThanOrEqual(2);
    // The series have different values, but the same gradient geometry.
    const [first] = gradients;
    gradients.forEach((gradient) => expect(gradient).toEqual(first));
    expect(first.x0).toBe(first.x1);
    expect(edges).toEqual(PLOT_EDGES);
  });

  it('draws no gradient for Opacity when there is no fill', async () => {
    const { gradients, events } = await renderLines({ gradientMode: GraphGradientMode.Opacity }, 0);
    expect(gradients).toEqual([]);
    expect(events).toEqual((await renderLines({}, 0)).events);
  });

  it.each([GraphGradientMode.None, GraphGradientMode.Scheme])(
    'draws Gradient mode %s as a field with no gradient mode',
    async (gradientMode) => {
      const { gradients, events } = await renderLines({ gradientMode }, 50);
      expect(gradients).toEqual([]);
      expect(events).toEqual((await renderLines({}, 50)).events);
    }
  );

  it('sizes the gradient to the plot again after a resize', async () => {
    const before = await renderLines({ gradientMode: GraphGradientMode.Opacity }, 50);
    const after = await renderLines({ gradientMode: GraphGradientMode.Opacity }, 50, (chart) =>
      chart.resize({ width: chart.getWidth(), height: chart.getHeight() / 2 })
    );
    expect(after.edges).toEqual(PLOT_EDGES);
    expect(Number(after.gradients[0].y1)).toBeLessThan(Number(before.gradients[0].y1));
  });
});
