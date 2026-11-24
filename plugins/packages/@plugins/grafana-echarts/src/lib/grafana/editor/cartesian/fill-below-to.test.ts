import { type Field, type FieldConfigEditorBuilder, FieldType } from '@grafana/data';
import { type EChartsGraphFieldConfig } from 'editor/types';
import { addCartesianFillBelowToFieldConfig } from './fill-below-to';

type Item = {
  path?: string;
  hideFromDefaults?: boolean;
  settings?: { filter: (field: Field) => boolean };
  showIf?: (config: Partial<EChartsGraphFieldConfig>) => boolean;
};
let item: Item = {};
// A builder that keeps the config of the property.
const builder = {
  addFieldNamePicker: (config: Item) => {
    item = config;
    return builder;
  },
} as unknown as FieldConfigEditorBuilder<EChartsGraphFieldConfig>;
addCartesianFillBelowToFieldConfig(builder);

describe('addCartesianFillBelowToFieldConfig', () => {
  it('registers the core path as an override only, with the number fields as targets', () => {
    expect(item.path).toBe('fillBelowTo');
    expect(item.hideFromDefaults).toBe(true);
    expect(item.settings!.filter({ type: FieldType.number } as Field)).toBe(true);
    expect(item.settings!.filter({ type: FieldType.time } as Field)).toBe(false);
  });

  it('shows Fill below to only for a field that draws as a line', () => {
    for (const seriesType of [undefined, 'Auto', 'line']) {
      expect(item.showIf!({ seriesType } as Partial<EChartsGraphFieldConfig>)).toBe(true);
    }
    for (const seriesType of ['bar', 'scatter', 'effectScatter']) {
      expect(item.showIf!({ seriesType } as Partial<EChartsGraphFieldConfig>)).toBe(false);
    }
  });
});
