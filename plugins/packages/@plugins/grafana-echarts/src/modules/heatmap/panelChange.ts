// The panel change handler of the heatmap panel: a switch from core Heatmap keeps each core option that the
// ECharts Heatmap reads. Grafana does not keep the options of the previous panel type in a type change.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/migration-handler-for-panels
// Core options: https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/heatmap/panelcfg.cue
import { type PanelModel } from '@grafana/data';
import { type HeatmapColorScalePlacement, type HeatmapColorScheme } from 'lib/echarts/options/types';
import { heatmapColorSchemeOptions } from './constants';

/**
 * The core options that the ECharts Heatmap has with the same path and the same values. An empty list of keys
 * copies the full option. A list of keys copies only those keys, because the ECharts Heatmap does not read the
 * other keys of that option (`parity.md`).
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A copy of each present key of `from` in `keys`. */
const pick = (from: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => from[key] !== undefined).map((key) => [key, structuredClone(from[key])]));

/** The same-path options of `prevOptions`. An option with no kept key is left out. */
const keepSamePathOptions = (prevOptions: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(SAME_PATH_OPTIONS).flatMap(([path, keys]) => {
      const value = prevOptions[path];
      if (keys.length === 0) {
        return value === undefined ? [] : [[path, structuredClone(value)]];
      }
      const kept = isObject(value) ? pick(value, keys) : {};
      return Object.keys(kept).length > 0 ? [[path, kept]] : [];
    })
  );

/**
 * The `heatmapColorScheme` for the core `color.scheme`. Core has the d3 scheme names (`Spectral`, `Oranges`).
 * A name with no ECharts gradient gives no option, so the panel uses its default gradient.
 */
const toColorScheme = (scheme: unknown): HeatmapColorScheme | undefined =>
  typeof scheme === 'string'
    ? heatmapColorSchemeOptions.find((option) => option.value === scheme.toLowerCase())?.value
    : undefined;

/**
 * The `heatmapColorScale.placement` for the core `legend`. The legend of core Heatmap is the color scale, and
 * core draws it below the chart (the default) or on the right. The Grafana legend of the ECharts Heatmap is for
 * the overlay series only, so the handler does not copy `legend`.
 */
const toColorScalePlacement = (legend: unknown): HeatmapColorScalePlacement | undefined => {
  if (!isObject(legend) || typeof legend.show !== 'boolean') {
    return undefined;
  }
  if (!legend.show) {
    return 'none';
  }
  return legend.placement === 'right' ? 'right' : 'bottom';
};

/**
 * The options after a change from `prevPluginId`. For core Heatmap, it gives the core options that the ECharts
 * Heatmap reads. For each other type, it changes nothing. It does not change the field config: core Heatmap has
 * no field option that the cells of the ECharts Heatmap read.
 *
 * Scenes replaces the options of the panel with a result that is not empty. So the result starts from
 * `panel.options`: the options that Grafana cached for this panel type, and the options of a suggestion.
 * https://github.com/grafana/scenes/blob/main/packages/scenes/src/components/VizPanel/VizPanel.tsx
 */
export function heatmapPanelChangeHandler(
  panel: PanelModel,
  prevPluginId: string,
  prevOptions: Record<string, unknown>
): Record<string, unknown> {
  if (prevPluginId !== 'heatmap') {
    // Scenes keeps the options for an empty result.
    return {};
  }
  const scheme = toColorScheme(isObject(prevOptions.color) ? prevOptions.color.scheme : undefined);
  const placement = toColorScalePlacement(prevOptions.legend);
  return {
    ...(isObject(panel.options) ? panel.options : {}),
    ...keepSamePathOptions(prevOptions),
    ...(scheme === undefined ? {} : { heatmapColorScheme: scheme }),
    ...(placement === undefined ? {} : { heatmapColorScale: { placement } }),
  };
}
