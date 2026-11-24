import { FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent } from 'test/panel';

// "Fill below to" (`custom.fillBelowTo`, see `lib/echarts/converters/fillBelowTo.ts`) as drawn
// primitives. A fill is a `fill` call on the series layer: the lines and the hidden points draw none.
// Core: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/time-series/#fill-below-to

const START = 1783137094497;

const STEP = 30 * 60_000;
const times = (offset = 0) => ({
  name: 'time',
  type: FieldType.time,
  values: [0, 1, 2, 3].map((i) => START + offset + i * STEP),
});

/**
 * The series layer of a `max` and a `min` series. With `minOffset`, `min` is in a frame of its own,
 * with times that many ms after the times of `max`, as a second query.
 */
const seriesEvents = async (
  maxCustom: Record<string, unknown>,
  minCustom: Record<string, unknown> = {},
  minOffset?: number
) => {
  const max = { name: 'max', type: FieldType.number, values: [5, 7, 6, 8], config: { custom: maxCustom } };
  const min = { name: 'min', type: FieldType.number, values: [1, 3, 2, 4], config: { custom: minCustom } };
  const frames =
    minOffset == null
      ? [toDataFrame({ fields: [times(), max, min] })]
      : [toDataFrame({ fields: [times(), max] }), toDataFrame({ fields: [times(minOffset), min] })];
  const { container, unmount } = render(
    getComponent(frames, 'line', {
      zLevel: { series: SERIES_ZLEVEL },
      animation: { enabled: false },
      performance: { showPoints: 'never' },
    })
  );
  const events = normalizeCanvasEvents((await getCanvasEvents(container)).seriesEvents);
  unmount();
  return events;
};

/**
 * The fills that have a shape: a `fill` call on a path (from its `beginPath`) with a `lineTo`. A band
 * with no value makes a `fill` call on an empty path, which draws nothing.
 */
const fills = (events: Array<{ type: string }>) => {
  let total = 0;
  let hasLine = false;
  for (const { type } of events) {
    if (type === 'beginPath') {
      hasLine = false;
    } else if (type === 'lineTo') {
      hasLine = true;
    } else if (type === 'fill' && hasLine) {
      total++;
    }
  }
  return total;
};

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

  // Core sets the fill opacity to 0 when it cannot make the band (`preparePlotConfigBuilder`).
  it('removes the fill to the axis for a target that the data does not have', async () => {
    expect(fills(await seriesEvents({ fillOpacity: 40 }))).toBe(1);
    expect(await seriesEvents({ fillBelowTo: 'unknown', fillOpacity: 40 })).toEqual(await seriesEvents({}));
  });

  // Two queries: the times of the target are 30 s after the times of the series, so no time is equal.
  it('draws one band to a target in another frame with different times', async () => {
    expect(fills(await seriesEvents({}, {}, 30_000))).toBe(0);
    expect(fills(await seriesEvents({ fillBelowTo: 'min' }, {}, 30_000))).toBe(1);
  });
});
