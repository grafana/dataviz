import { type LinearGradientObject } from 'echarts';
import { registerUpdateLifecycle } from 'echarts/core';

// A gradient over the plot area of a line series. Core draws the gradient of a series from the top to the bottom of
// the plot (`plot.bbox`), so each series shows a part of one gradient. ECharts sizes a gradient that is not `global`
// to the bounding box of the line or of the area, so each series shows a full gradient of its own.
// Core: https://github.com/grafana/grafana/blob/main/packages/grafana-ui/src/components/uPlot/config/gradientFills.ts
// ECharts: https://echarts.apache.org/en/option.html#color

/**
 * A vertical gradient from the top (offset 0) to the bottom (offset 1) of the plot. The coordinates are fractions
 * of the plot area. `registerLinePlotGradients` changes them to px of the canvas before a line series draws.
 */
export function getPlotGradient(colorStops: LinearGradientObject['colorStops']): LinearGradientObject {
  return { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops, global: false };
}

/** The gradient in fractions of the plot, for each gradient in px that this file made. A resize reads it again. */
const plotGradients = new WeakMap<LinearGradientObject, LinearGradientObject>();

/** The gradient in fractions of the plot, or `undefined` when `color` is not a gradient of `getPlotGradient`. */
function toPlotGradient(color: unknown): LinearGradientObject | undefined {
  if (!isLinearGradient(color)) {
    return undefined;
  }
  // A gradient that is not `global` comes from a new option. A `global` gradient is known only if this file made it.
  return color.global ? plotGradients.get(color) : color;
}

function isLinearGradient(color: unknown): color is LinearGradientObject {
  return typeof color === 'object' && color !== null && 'type' in color && color.type === 'linear';
}

/** The style objects of a line series option that can have a gradient color. */
function isColorStyle(style: unknown): style is { color?: unknown } {
  return typeof style === 'object' && style !== null;
}

/**
 * Size the plot gradients of each line series to the plot area, in px of the canvas (`global: true`). The hook
 * runs after ECharts sizes the grid and before the series draw, also on a resize.
 * https://echarts.apache.org/en/option.html#series-line.lineStyle.color
 * https://echarts.apache.org/en/option.html#series-line.areaStyle.color
 */
export function registerLinePlotGradients(): void {
  registerUpdateLifecycle('series:beforeupdate', (ecModel) => {
    ecModel.eachSeriesByType('line', (seriesModel) => {
      const plot = seriesModel.coordinateSystem?.getArea?.();
      if (!plot) {
        return;
      }
      // A copy of the keys only: each style is the object of the series option, so the color below changes the option.
      const option: Record<string, unknown> = { ...seriesModel.option };
      for (const style of [option.lineStyle, option.areaStyle]) {
        const gradient = isColorStyle(style) ? toPlotGradient(style.color) : undefined;
        if (isColorStyle(style) && gradient) {
          const sized: LinearGradientObject = {
            ...gradient,
            x: plot.x + gradient.x * plot.width,
            y: plot.y + gradient.y * plot.height,
            x2: plot.x + gradient.x2 * plot.width,
            y2: plot.y + gradient.y2 * plot.height,
            global: true,
          };
          plotGradients.set(sized, gradient);
          style.color = sized;
        }
      }
    });
  });
}
