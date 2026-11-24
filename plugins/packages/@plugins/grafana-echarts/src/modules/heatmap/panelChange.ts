// The panel change handler of the heatmap panel: a switch from core Heatmap keeps each core option that the
// ECharts Heatmap reads. Grafana does not keep the options of the previous panel type in a type change.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/migration-handler-for-panels
// The mapping is the Heatmap adapter in lib/grafana/panelChange.
import { type PanelModel } from '@grafana/data';
import { heatmapAdapter } from 'lib/grafana/panelChange/heatmap';
import { isObject } from 'lib/grafana/panelChange/objects';

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
  const imported = heatmapAdapter.translate({ type: prevPluginId, options: prevOptions });
  return { ...(isObject(panel.options) ? panel.options : {}), ...imported.options };
}
