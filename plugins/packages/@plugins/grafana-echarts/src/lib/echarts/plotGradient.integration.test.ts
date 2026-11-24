import { type EChartsOption, type LinearGradientObject } from 'echarts';
import { type EChartsType, init } from 'lib/echarts/echarts';
import { getPlotGradient } from 'lib/echarts/plotGradient';

// `registerLinePlotGradients` sizes only the gradients of `getPlotGradient` to the plot area. A line series with a
// linear gradient of its own keeps the ECharts sizing: the bounding box of the line.
// https://echarts.apache.org/en/option.html#color

const colorStops = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' },
];

/** A gradient that `getPlotGradient` did not make: ECharts sizes it to the bounding box of the line. */
const ownGradient: LinearGradientObject = { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops, global: false };

const option: EChartsOption = {
  animation: false,
  grid: { left: 40, right: 20, top: 30, bottom: 40 },
  xAxis: { type: 'value' },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'line',
      symbol: 'none',
      data: [
        [0, 1],
        [1, 3],
        [2, 2],
      ],
      lineStyle: { color: getPlotGradient(colorStops) },
    },
    {
      type: 'line',
      symbol: 'none',
      data: [
        [0, 10],
        [1, 30],
        [2, 20],
      ],
      lineStyle: { color: ownGradient },
    },
  ],
};

const isGradient = (value: unknown): value is LinearGradientObject =>
  typeof value === 'object' && value !== null && 'colorStops' in value;

/** The gradient strokes of the drawn lines, in the order of the series. */
const strokes = (chart: EChartsType) => {
  const found: LinearGradientObject[] = [];
  chart.getZr().storage.traverse((el) => {
    const style: Record<string, unknown> = 'style' in el && typeof el.style === 'object' ? { ...el.style } : {};
    if (isGradient(style.stroke)) {
      found.push(style.stroke);
    }
  });
  return found;
};

describe('registerLinePlotGradients', () => {
  let dom: HTMLDivElement;
  let chart: EChartsType;

  beforeEach(() => {
    dom = document.createElement('div');
    document.body.appendChild(dom);
    chart = init(dom, undefined, { renderer: 'canvas', width: 400, height: 300 });
    chart.setOption(option);
  });

  afterEach(() => {
    chart.dispose();
    dom.remove();
  });

  it('sizes a gradient of getPlotGradient to the plot area', () => {
    const [plotStroke] = strokes(chart);
    // The grid: 30 px from the top, and 40 px from the bottom of 300 px.
    expect(plotStroke).toMatchObject({ x: 40, y: 30, x2: 40, y2: 260, global: true, colorStops });
  });

  it('does not change a linear gradient that getPlotGradient did not make', () => {
    expect(strokes(chart)[1]).toEqual(ownGradient);
  });

  it('sizes the gradient again after a resize, and after an option that merges', () => {
    chart.resize({ width: 400, height: 200 });
    expect(strokes(chart)[0]).toMatchObject({ y: 30, y2: 160, global: true });
    expect(strokes(chart)[1]).toEqual(ownGradient);

    // A merge of the same series option keeps the gradient object of the first option.
    chart.setOption({ series: option.series });
    expect(strokes(chart)[0]).toMatchObject({ y: 30, y2: 160, global: true });
    expect(strokes(chart)[1]).toEqual(ownGradient);
  });
});
