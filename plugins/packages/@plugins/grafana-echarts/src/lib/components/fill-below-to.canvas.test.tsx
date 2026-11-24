import { FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent, height, width } from 'test/panel';

// Canvas baselines of "Fill below to" (`custom.fillBelowTo`) on cartesian line series. The cases are
// the panels of `cartesian-fill-below-to.json`. The claims are in `fill-below-to.integration.test.tsx`.

// 20 minutes between rows, so the 10 rows fill the 3 h test time range.
const STEP = 20 * 60_000;

/** A series with an `offset` (ms) is in a frame of its own, with times that much later, as a second query. */
type Series = { name: string; values: Array<number | null>; custom?: Record<string, unknown>; offset?: number };

const toFrame = (series: Series[], offset = 0) =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: series[0].values.map((_, i) => 1783137094497 + offset + i * STEP) },
      ...series.map(({ name, values, custom }) => ({ name, type: FieldType.number, values, config: { custom } })),
    ],
  });

const renderEvents = async (series: Series[]) => {
  const frames = [
    toFrame(series.filter(({ offset }) => offset == null)),
    ...series.filter(({ offset }) => offset != null).map((entry) => toFrame([entry], entry.offset)),
  ];
  const { container } = render(
    getComponent(frames, 'line', { zLevel: { series: SERIES_ZLEVEL }, animation: { enabled: false } })
  );
  return getCanvasEvents(container);
};

describe('cartesian Fill below to', () => {
  it('fills from max to min with the default opacity, and not to the axis', async () => {
    const { defaultEvents, seriesEvents } = await renderEvents([
      { name: 'max', values: [40, 46, 52, 48, 55, 61, 58, 50, 47, 53], custom: { fillBelowTo: 'min' } },
      { name: 'avg', values: [30, 34, 39, 36, 41, 45, 43, 38, 35, 40] },
      { name: 'min', values: [20, 23, 27, 25, 28, 31, 29, 26, 24, 27] },
    ]);
    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  it('fills only where the series is above its target, when the lines cross', async () => {
    const { defaultEvents, seriesEvents } = await renderEvents([
      { name: 'a', values: [10, 18, 26, 34, 40, 44, 32, 16, 12, 30], custom: { fillBelowTo: 'b', fillOpacity: 60 } },
      { name: 'b', values: [30, 30, 28, 26, 24, 22, 26, 30, 32, 28], custom: { fillOpacity: 10 } },
    ]);
    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  it('breaks the band at a null of each series, with smooth lines', async () => {
    const { defaultEvents, seriesEvents } = await renderEvents([
      {
        name: 'max',
        values: [40, 46, 52, null, 55, 61, 58, 50, 47, 53],
        custom: { fillBelowTo: 'min', lineInterpolation: 'smooth' },
      },
      {
        name: 'min',
        values: [20, 23, 27, 25, 28, 31, null, 26, 24, 27],
        custom: { lineInterpolation: 'smooth' },
      },
    ]);
    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  it('follows the two lines when the target is a second query with times 8 minutes later', async () => {
    const { defaultEvents, seriesEvents } = await renderEvents([
      { name: 'max', values: [40, 46, 52, 48, 55, 61, 58, 50, 47, 53], custom: { fillBelowTo: 'min' } },
      { name: 'min', values: [20, 33, 22, 35, 24, 37, 26, 39, 28, 30], offset: 8 * 60_000 },
    ]);
    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  it('steps the band with step after lines that cross', async () => {
    const step = { lineInterpolation: 'stepAfter' };
    const { defaultEvents, seriesEvents } = await renderEvents([
      { name: 'a', values: [10, 18, 26, 34, 40, 44, 32, 16, 12, 30], custom: { ...step, fillBelowTo: 'b' } },
      { name: 'b', values: [30, 30, 28, 26, 24, 22, 26, 30, 32, 28], custom: step },
    ]);
    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
