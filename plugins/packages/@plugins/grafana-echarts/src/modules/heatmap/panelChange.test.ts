import { type PanelModel } from '@grafana/data';
import { heatmapPanelChangeHandler } from './panelChange';

const panel = (): PanelModel => ({
  id: 1,
  type: 'grafana-echartsheatmap-panel',
  options: {},
  fieldConfig: { defaults: {}, overrides: [] },
});

// The options of a core Heatmap panel with values that are not the default.
// https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/heatmap/panelcfg.cue
const coreOptions = () => ({
  calculate: true,
  calculation: { xBuckets: { mode: 'size', value: '1m' }, yBuckets: { scale: { type: 'log', log: 2 } } },
  yAxis: { unit: 's', decimals: 2, min: 0, max: 10, reverse: true, axisPlacement: 'right', axisWidth: 40 },
  rowsFrame: { layout: 'auto', yBucketScale: { type: 'log', log: 10 } },
  color: {
    mode: 'opacity',
    fill: 'dark-red',
    scale: 'linear',
    exponent: 0.3,
    min: 1,
    max: 50,
    scheme: 'Turbo',
    steps: 64,
    reverse: false,
  },
  cellGap: 0,
  cellValues: { unit: 'short' },
  filterValues: { le: 0.5, ge: 100 },
  showValue: 'auto',
  legend: { show: true, placement: 'right' },
  tooltip: { mode: 'multi', yHistogram: true, showColorScale: true, maxWidth: 300, maxHeight: 200 },
  exemplars: { color: 'rgba(255,0,255,0.7)' },
});

describe('heatmapPanelChangeHandler', () => {
  it('keeps each core Heatmap option that the ECharts Heatmap reads, and no other option', () => {
    const target = panel();
    const options = heatmapPanelChangeHandler(target, 'heatmap', coreOptions());
    expect(options).toEqual({
      calculate: true,
      calculation: { xBuckets: { mode: 'size', value: '1m' }, yBuckets: { scale: { type: 'log', log: 2 } } },
      yAxis: { unit: 's', decimals: 2, min: 0, max: 10, reverse: true },
      rowsFrame: { yBucketScale: { type: 'log', log: 10 } },
      color: { mode: 'opacity', fill: 'dark-red', scale: 'linear', exponent: 0.3, min: 1, max: 50 },
      cellGap: 0,
      filterValues: { le: 0.5, ge: 100 },
      tooltip: { mode: 'multi', maxWidth: 300, maxHeight: 200 },
      heatmapColorScheme: 'turbo',
      heatmapColorScale: { placement: 'right' },
    });
    expect(target.fieldConfig).toEqual({ defaults: {}, overrides: [] });
  });

  it('does not share an object with the options of the core panel', () => {
    const prevOptions = coreOptions();
    const options = heatmapPanelChangeHandler(panel(), 'heatmap', prevOptions);
    expect(options.calculation).not.toBe(prevOptions.calculation);
  });

  it('hides the color scale when the core legend is off', () => {
    const options = heatmapPanelChangeHandler(panel(), 'heatmap', { legend: { show: false, placement: 'right' } });
    expect(options).toEqual({ heatmapColorScale: { placement: 'none' } });
  });

  it.each([
    [{ show: true, placement: 'bottom' }, 'bottom'],
    [{ show: true, placement: 'right' }, 'right'],
    // A panel that Grafana saved before core had `legend.placement`: core draws the legend below the chart.
    [{ show: true }, 'bottom'],
  ])('puts the color scale at the placement of the core legend %j', (legend, placement) => {
    const options = heatmapPanelChangeHandler(panel(), 'heatmap', { legend });
    expect(options).toEqual({ heatmapColorScale: { placement } });
  });

  it('keeps the options that the panel has, for example the layout of a suggestion', () => {
    const target = { ...panel(), options: { heatmapLayout: 'matrix', cellGap: 1, animation: { enabled: true } } };
    const options = heatmapPanelChangeHandler(target, 'heatmap', { cellGap: 4 });
    expect(options).toEqual({ heatmapLayout: 'matrix', cellGap: 4, animation: { enabled: true } });
  });

  it('gives no color scheme for a core scheme with no ECharts gradient', () => {
    const options = heatmapPanelChangeHandler(panel(), 'heatmap', { color: { mode: 'scheme', scheme: 'Oranges' } });
    expect(options).toEqual({ color: { mode: 'scheme' } });
  });

  it('leaves out an option with no key that the ECharts Heatmap reads', () => {
    const options = heatmapPanelChangeHandler(panel(), 'heatmap', {
      rowsFrame: { layout: 'auto' },
      yAxis: { axisPlacement: 'left' },
    });
    expect(options).toEqual({});
  });

  it('changes nothing for another panel type', () => {
    const options = heatmapPanelChangeHandler(panel(), 'timeseries', { tooltip: { mode: 'multi' }, cellGap: 3 });
    expect(options).toEqual({});
  });
});
