import { type Field, type FieldConfigEditorBuilder, FieldType } from '@grafana/data';
import { cartesianGraphStylesCategoryName } from 'editor/cartesian';
import { type EChartsGraphFieldConfig } from 'editor/types';

/**
 * Register the core Time series "Fill below to" field config (`custom.fillBelowTo`): the name of the series
 * where the fill of this series stops. It is an override only, as core (`hideFromDefaults`).
 * The core registration: `getGraphFieldConfig` in public/app/plugins/panel/timeseries/config.ts.
 * Rendered by `lib/echarts/converters/fillBelowTo.ts`.
 * https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/time-series/#fill-below-to
 */
export function addCartesianFillBelowToFieldConfig(builder: FieldConfigEditorBuilder<EChartsGraphFieldConfig>) {
  builder.addFieldNamePicker({
    path: 'fillBelowTo',
    name: 'Fill below to',
    description: 'Fill the area between this series and another series. Applies to line series on a time axis.',
    category: [cartesianGraphStylesCategoryName],
    hideFromDefaults: true,
    settings: { filter: (field: Field) => field.type === FieldType.number },
    // Only line series read it. A field-config `showIf` sees only the config of this field.
    showIf: (config) => config.seriesType === undefined || config.seriesType === 'Auto' || config.seriesType === 'line',
  });
}
