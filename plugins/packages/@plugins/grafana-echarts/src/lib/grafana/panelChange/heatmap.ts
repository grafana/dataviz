// The adapter of the core Heatmap panel: it changes Heatmap settings into the settings of the ECharts heatmap panel.
// Core panel: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/heatmap/
// Core options: https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/heatmap/panelcfg.cue
import capabilityFile from './capabilities/heatmap.json';
import { toCapability } from './capabilityFile';
import { isObject, pick } from './objects';
import type { CorePanel, ImportAdapter } from './types';

const TARGET = 'grafana-echartsheatmap-panel';

/**
 * The core options that the heatmap panel has with the same path and the same values. An empty list of keys
 * copies the full option. A list of keys copies only those keys, because the heatmap panel does not read the
 * other keys of that option.
 */
const SAME_PATH_OPTIONS: Record<string, string[]> = {
  calculate: [],
  calculation: [],
  cellGap: [],
  filterValues: ['le', 'ge'],
  yAxis: ['unit', 'decimals', 'min', 'max', 'reverse'],
  color: ['mode', 'fill', 'scale', 'exponent', 'min', 'max'],
  rowsFrame: ['yBucketScale'],
  tooltip: ['mode', 'maxWidth', 'maxHeight'],
};

/** Core `color.scheme` (a d3 scheme name) to `heatmapColorScheme`, for each scheme that the heatmap panel has. */
const COLOR_SCHEMES: Record<string, string> = {
  Spectral: 'spectral',
  Turbo: 'turbo',
  Blues: 'blues',
  Magma: 'magma',
};

/** The status of each Heatmap setting, from capabilities/heatmap.json. */
export const heatmapCapability = toCapability(capabilityFile);

/** The same-path options of `options`. An option with no kept key is left out. */
const translateSamePathOptions = (options: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(SAME_PATH_OPTIONS).flatMap(([path, keys]) => {
      const value = options[path];
      if (keys.length === 0) {
        return value === undefined ? [] : [[path, structuredClone(value)]];
      }
      const kept = isObject(value) ? pick(value, keys) : {};
      return Object.keys(kept).length > 0 ? [[path, kept]] : [];
    })
  );

/** The `heatmapColorScheme` for the core `color`. A scheme with no gradient gives none: the panel default applies. */
const translateColorScheme = (color: unknown) => {
  const scheme = isObject(color) && typeof color.scheme === 'string' ? COLOR_SCHEMES[color.scheme] : undefined;
  return scheme === undefined ? {} : { heatmapColorScheme: scheme };
};

/**
 * The `heatmapColorScale` for the core `legend`. The legend of core Heatmap is the color scale, and core draws
 * it below the chart (the default) or on the right. The Grafana legend of the heatmap panel is for the overlay
 * series only, so the adapter does not copy `legend`.
 */
const translateLegend = (legend: unknown) => {
  if (!isObject(legend) || typeof legend.show !== 'boolean') {
    return {};
  }
  const shown = legend.placement === 'right' ? 'right' : 'bottom';
  return { heatmapColorScale: { placement: legend.show ? shown : 'none' } };
};

/**
 * Makes the heatmap panel from a core Heatmap panel. It does not change `panel`. The field config is empty:
 * core Heatmap has no field setting that the cells of the heatmap panel read.
 */
const translate = (panel: CorePanel) => {
  const options = isObject(panel.options) ? panel.options : {};
  return {
    type: TARGET,
    options: {
      ...translateSamePathOptions(options),
      ...translateColorScheme(options.color),
      ...translateLegend(options.legend),
    },
    fieldConfig: { defaults: {}, overrides: [] },
  };
};

export const heatmapAdapter: ImportAdapter = { capability: heatmapCapability, translate };
