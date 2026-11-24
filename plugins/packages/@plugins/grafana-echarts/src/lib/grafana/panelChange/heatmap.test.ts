// The adapter of the core Heatmap panel.
import { PanelOptionsEditorBuilder, type StandardEditorContext } from '@grafana/data';

// Fills the registries that Grafana fills before it loads a plugin. It must load before the heatmap module.
import 'test/standardRegistries';
import { heatmapColorSchemeOptions } from 'modules/heatmap/constants';
import { plugin as heatmap } from 'modules/heatmap/module';
import { type PanelOptions } from 'types';
import { heatmapAdapter, heatmapCapability } from './heatmap';
import type { CorePanel } from './types';

jest.mock('@grafana/i18n', () => ({
  initPluginTranslations: jest.fn(),
  t: (key: string) => key,
}));

const translate = (options: CorePanel['options']) => heatmapAdapter.translate({ type: 'heatmap', options });

/**
 * The options of a core Heatmap panel with values that are not the default.
 * https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/heatmap/panelcfg.cue
 */
const fullOptions = () => ({
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

describe('heatmapAdapter.translate', () => {
  it('gives the type of the heatmap panel, and no field setting', () => {
    expect(translate({})).toEqual({
      type: 'grafana-echartsheatmap-panel',
      options: {},
      fieldConfig: { defaults: {}, overrides: [] },
    });
  });

  it('keeps each core Heatmap option that the heatmap panel reads, and no other option', () => {
    expect(translate(fullOptions()).options).toEqual({
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
  });

  it('gives no reference to a value of the core panel', () => {
    const options = fullOptions();
    expect(translate(options).options.calculation).not.toBe(options.calculation);
  });

  it('hides the color scale when the core legend is off', () => {
    expect(translate({ legend: { show: false, placement: 'right' } }).options).toEqual({
      heatmapColorScale: { placement: 'none' },
    });
  });

  it.each([
    [{ show: true, placement: 'bottom' }, 'bottom'],
    [{ show: true, placement: 'right' }, 'right'],
    // A panel that Grafana saved before core had `legend.placement`: core draws the legend below the chart.
    [{ show: true }, 'bottom'],
  ])('puts the color scale at the placement of the core legend %j', (legend, placement) => {
    expect(translate({ legend }).options).toEqual({ heatmapColorScale: { placement } });
  });

  it('gives no color scheme for a core scheme with no gradient, so the panel default applies', () => {
    expect(translate({ color: { mode: 'scheme', scheme: 'Oranges' } }).options).toEqual({
      color: { mode: 'scheme' },
    });
  });

  it.each(['Spectral', 'Turbo', 'Blues', 'Magma'])('gives a color scheme of the heatmap panel for %s', (scheme) => {
    const { heatmapColorScheme } = translate({ color: { scheme } }).options;
    expect(heatmapColorSchemeOptions.map((option) => option.value)).toContain(heatmapColorScheme);
  });

  it('leaves out an option with no key that the heatmap panel reads', () => {
    expect(translate({ rowsFrame: { layout: 'auto' }, yAxis: { axisPlacement: 'left' } }).options).toEqual({});
  });

  // The heatmap panel ignores an option that it does not register.
  it('writes only options that the heatmap panel registers', () => {
    // https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/panel/PanelPlugin.ts
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    heatmap.getPanelOptionsSupplier()(builder, { data: [] } as StandardEditorContext<PanelOptions>);
    const paths = builder.getItems().map((item) => item.path.split('.')[0]);
    expect(paths).toEqual(expect.arrayContaining(Object.keys(translate(fullOptions()).options)));
  });
});

describe('heatmapCapability', () => {
  it('names core Heatmap and the heatmap panel', () => {
    expect(heatmapCapability).toMatchObject({ source: 'heatmap', target: 'grafana-echartsheatmap-panel' });
  });

  it('gives a supported entry to each core option that the adapter reads', () => {
    const read = ['calculate', 'calculation', 'cellGap', 'filterValues', 'yAxis', 'rowsFrame', 'color', 'tooltip'];
    for (const key of [...read, 'legend']) {
      expect(heatmapCapability.options[key]).toMatchObject({ status: 'supported' });
    }
    // Each same-path option that the adapter writes is one of the options that it reads.
    const written = Object.keys(translate(fullOptions()).options).filter((key) => !key.startsWith('heatmapColor'));
    expect(read).toEqual(expect.arrayContaining(written));
  });

  it('gives the status supported to each core color scheme that the adapter changes', () => {
    const schemes = Object.keys(heatmapCapability.options['color.scheme'].values ?? {});
    for (const scheme of schemes) {
      expect(translate({ color: { scheme } }).options).toHaveProperty('heatmapColorScheme');
    }
    expect(schemes).toHaveLength(4);
  });
});
