import { FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent } from 'test/panel';

// "Fill below to" (`custom.fillBelowTo`, see `lib/echarts/converters/fillBelowTo.ts`) as drawn
// primitives. A fill is a `fill` call on the series layer: the lines and the hidden points draw none.
// Core: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/time-series/#fill-below-to

const START = 1783137094497;

const seriesEvents = async (maxCustom: Record<string, unknown>, minCustom: Record<string, unknown> = {}) => {
  const frame = toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 1, 2, 3].map((i) => START + i * 30 * 60_000) },
      { name: 'max', type: FieldType.number, values: [5, 7, 6, 8], config: { custom: maxCustom } },
      { name: 'min', type: FieldType.number, values: [1, 3, 2, 4], config: { custom: minCustom } },
    ],
  });
  const { container, unmount } = render(
    getComponent([frame], 'line', {
      zLevel: { series: SERIES_ZLEVEL },
      animation: { enabled: false },
      performance: { showPoints: 'never' },
    })
  );
  const events = normalizeCanvasEvents((await getCanvasEvents(container)).seriesEvents);
  unmount();
  return events;
};

const fills = (events: Array<{ type: string }>) => events.filter((event) => event.type === 'fill').length;

describe('cartesian Fill below to', () => {
  it('draws one fill between the series and its target', async () => {
    expect(fills(await seriesEvents({}))).toBe(0);
    expect(fills(await seriesEvents({ fillBelowTo: 'min' }))).toBe(1);
  });

  it('draws the band in the place of the fill to the axis', async () => {
    const toAxis = await seriesEvents({ fillOpacity: 40 });
    const toTarget = await seriesEvents({ fillBelowTo: 'min', fillOpacity: 40 });
    expect(fills(toAxis)).toBe(1);
    expect(fills(toTarget)).toBe(1);
    expect(toTarget).not.toEqual(toAxis);
  });

  it('keeps the fill of the target to the axis', async () => {
    expect(fills(await seriesEvents({ fillBelowTo: 'min' }, { fillOpacity: 40 }))).toBe(2);
  });

  it('draws no fill for a target that the data does not have', async () => {
    expect(await seriesEvents({ fillBelowTo: 'unknown' })).toEqual(await seriesEvents({}));
  });
});
