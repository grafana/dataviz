import { type PanelModel } from '@grafana/data';
import { heatmapPanelChangeHandler } from './panelChange';

const panel = (options: Record<string, unknown> = {}): PanelModel => ({
  id: 1,
  type: 'grafana-echartsheatmap-panel',
  options,
  fieldConfig: { defaults: {}, overrides: [] },
});

// The mapping of each option is in the test of the adapter (lib/grafana/panelChange/heatmap.test.ts).
describe('heatmapPanelChangeHandler', () => {
  it('gives the options of the adapter for core Heatmap, and does not change the field config', () => {
    const target = panel();
    const options = heatmapPanelChangeHandler(target, 'heatmap', {
      cellGap: 0,
      yAxis: { unit: 's', axisPlacement: 'left' },
      color: { mode: 'scheme', scheme: 'Turbo', steps: 64 },
      legend: { show: true, placement: 'right' },
      exemplars: { color: 'rgba(255,0,255,0.7)' },
    });
    expect(options).toEqual({
      cellGap: 0,
      yAxis: { unit: 's' },
      color: { mode: 'scheme' },
      heatmapColorScheme: 'turbo',
      heatmapColorScale: { placement: 'right' },
    });
    expect(target.fieldConfig).toEqual({ defaults: {}, overrides: [] });
  });

  it('keeps the options that the panel has, for example the layout of a suggestion', () => {
    const target = panel({ heatmapLayout: 'matrix', cellGap: 1, animation: { enabled: true } });
    const options = heatmapPanelChangeHandler(target, 'heatmap', { cellGap: 4 });
    expect(options).toEqual({ heatmapLayout: 'matrix', cellGap: 4, animation: { enabled: true } });
  });

  it('changes nothing for another panel type', () => {
    const target = panel({ heatmapLayout: 'matrix' });
    const options = heatmapPanelChangeHandler(target, 'timeseries', { tooltip: { mode: 'multi' }, cellGap: 3 });
    expect(options).toEqual({});
  });
});
