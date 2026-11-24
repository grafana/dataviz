import { FieldType, toDataFrame } from '@grafana/data';
import { GraphGradientMode } from '@grafana/schema';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent, height, width } from 'test/panel';

// Canvas baseline of the core "Gradient mode" of line series (#120): `a` has Opacity, and `b` has Hue. The two
// series have a fill opacity of 40. The claims are in `gradient-mode.integration.test.tsx`.

const START = 1783137094497;
const times = [0, 1, 2, 3].map((i) => START + i * 30 * 60_000);

describe('cartesian line gradient mode', () => {
  it('draws the gradient of each series over the plot', async () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: times },
        {
          name: 'a',
          type: FieldType.number,
          values: [6, 5, 8, 7],
          config: { custom: { gradientMode: GraphGradientMode.Opacity } },
        },
        {
          name: 'b',
          type: FieldType.number,
          values: [1, 3, 2, 4],
          config: { custom: { gradientMode: GraphGradientMode.Hue } },
        },
      ],
    });
    const { container } = render(
      getComponent([frame], 'line', {
        lineWidth: 2,
        fillOpacity: 40,
        zLevel: { series: SERIES_ZLEVEL },
        animation: { enabled: false },
      })
    );
    const { defaultEvents, seriesEvents } = await getCanvasEvents(container);
    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
