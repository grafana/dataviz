import { VizOrientation } from '@grafana/data';
import { layoutRepeaterCells } from './layout';

const SPACING = 16;

const layout = (width: number, height: number, count: number) =>
  layoutRepeaterCells({ width, height, count, spacing: SPACING });

// Gives one [width, height, count] case for each count of each panel.
const matrix = (panels: Array<[number, number, number[]]>) =>
  panels.flatMap(([width, height, counts]) => counts.map((count): [number, number, number] => [width, height, count]));

// Checks the count first: the bounds loop checks nothing when there is no cell.
const expectCellsInPanel = (
  cells: ReturnType<typeof layoutRepeaterCells>,
  { width, height, count }: { width: number; height: number; count: number }
) => {
  expect(cells).toHaveLength(count);
  for (const cell of cells) {
    expect(cell.x + cell.width).toBeLessThanOrEqual(width + 1e-9);
    expect(cell.y + cell.height).toBeLessThanOrEqual(height + 1e-9);
    expect(cell.width).toBeGreaterThan(0);
    expect(cell.height).toBeGreaterThan(0);
  }
  // No two cells overlap.
  cells.forEach((a, i) => {
    for (const b of cells.slice(i + 1)) {
      const apart =
        a.x + a.width <= b.x + 1e-9 ||
        b.x + b.width <= a.x + 1e-9 ||
        a.y + a.height <= b.y + 1e-9 ||
        b.y + b.height <= a.y + 1e-9;
      expect(apart).toBe(true);
    }
  });
};

describe('layoutRepeaterCells with an orientation', () => {
  const oriented = (orientation: VizOrientation, count = 3) =>
    layoutRepeaterCells({ width: 400, height: 300, count, spacing: SPACING, orientation });

  it('gives the automatic grid for the orientation Auto, as for no orientation', () => {
    expect(oriented(VizOrientation.Auto, 4)).toEqual(layout(400, 300, 4));
  });

  it('Horizontal: cells as wide as the panel, one below the other, with the spacing between them', () => {
    // (300 - 2 * 16) / 3 = 89.33
    const cells = oriented(VizOrientation.Horizontal);
    expect(cells.map((cell) => cell.x)).toEqual([0, 0, 0]);
    expect(cells.map((cell) => cell.width)).toEqual([400, 400, 400]);
    expect(cells[0].height).toBeCloseTo(89.33, 1);
    expect(cells[1].y).toBeCloseTo(89.33 + 16, 1);
    expect(cells[2].y + cells[2].height).toBeCloseTo(300);
  });

  it('Vertical: cells as high as the panel, side by side, with the spacing between them', () => {
    // (400 - 2 * 16) / 3 = 122.67
    const cells = oriented(VizOrientation.Vertical);
    expect(cells.map((cell) => cell.y)).toEqual([0, 0, 0]);
    expect(cells.map((cell) => cell.height)).toEqual([300, 300, 300]);
    expect(cells[0].width).toBeCloseTo(122.67, 1);
    expect(cells[1].x).toBeCloseTo(122.67 + 16, 1);
    expect(cells[2].x + cells[2].width).toBeCloseTo(400);
  });

  it('gives one value the full panel in each orientation', () => {
    const full = [{ x: 0, y: 0, width: 400, height: 300 }];
    expect(oriented(VizOrientation.Horizontal, 1)).toEqual(full);
    expect(oriented(VizOrientation.Vertical, 1)).toEqual(full);
  });

  it('gives no cell for no value', () => {
    expect(oriented(VizOrientation.Horizontal, 0)).toEqual([]);
  });

  it('gives no cell when the spacing is larger than the share of one cell', () => {
    // 20 values have 19 spaces of 16 px, which are higher than 300 px. The same spaces are narrower than 400 px.
    expect(oriented(VizOrientation.Horizontal, 20)).toEqual([]);
    expect(oriented(VizOrientation.Vertical, 20)).toHaveLength(20);
    // 27 values have 26 spaces of 16 px, which are wider than 400 px.
    expect(oriented(VizOrientation.Vertical, 27)).toEqual([]);
  });

  // The same panels and counts fit in both orientations.
  const orientedFits = matrix([
    [640, 360, [1, 2, 5, 7, 12]],
    [100, 100, [1, 2, 5, 7]],
    [17, 23, [1, 2]],
  ]);
  const orientedNoSpace = matrix([
    [640, 360, [50]],
    [100, 100, [12, 50]],
    [17, 23, [5, 7, 12, 50]],
  ]);

  describe.each([VizOrientation.Horizontal, VizOrientation.Vertical])('%s', (orientation) => {
    it.each(orientedFits)(
      '%i x %i, %i values: gives one cell for each value, inside the panel, with a size above zero',
      (width, height, count) => {
        expectCellsInPanel(layoutRepeaterCells({ width, height, count, spacing: SPACING, orientation }), {
          width,
          height,
          count,
        });
      }
    );

    it.each(orientedNoSpace)('%i x %i, %i values: gives no cell when there is no space', (width, height, count) => {
      expect(layoutRepeaterCells({ width, height, count, spacing: SPACING, orientation })).toEqual([]);
    });
  });
});

describe('layoutRepeaterCells', () => {
  it('gives one value the full panel', () => {
    expect(layout(400, 300, 1)).toEqual([{ x: 0, y: 0, width: 400, height: 300 }]);
  });

  it('puts four values in a 2 x 2 grid with the spacing between the cells', () => {
    expect(layout(400, 300, 4)).toEqual([
      { x: 0, y: 0, width: 192, height: 142 },
      { x: 208, y: 0, width: 192, height: 142 },
      { x: 0, y: 158, width: 192, height: 142 },
      { x: 208, y: 158, width: 192, height: 142 },
    ]);
  });

  it('makes the cell of a last row that is not full as wide as the panel', () => {
    const cells = layout(400, 300, 3);
    expect(cells).toHaveLength(3);
    expect(cells[2]).toEqual({ x: 0, y: 158, width: 400, height: 142 });
  });

  it('puts the values side by side in a wide panel', () => {
    const cells = layout(1200, 200, 4);
    expect(new Set(cells.map((cell) => cell.y))).toEqual(new Set([0]));
    expect(cells.map((cell) => cell.x)).toEqual([0, 304, 608, 912]);
  });

  it('puts the values one below the other in a tall panel', () => {
    const cells = layout(200, 1200, 4);
    expect(new Set(cells.map((cell) => cell.x))).toEqual(new Set([0]));
    expect(cells.every((cell) => cell.width === 200)).toBe(true);
  });

  const fits = matrix([
    [640, 360, [1, 2, 5, 7, 12, 50, 200]],
    [100, 100, [1, 2, 5, 7, 12]],
    [300, 40, [1, 2, 5, 7, 12, 50]],
    [40, 300, [1, 2, 5, 7, 12, 50]],
    [17, 23, [1, 2]],
  ]);
  const noSpace = matrix([
    [100, 100, [50, 200]],
    [300, 40, [200]],
    [40, 300, [200]],
    [17, 23, [5, 7, 12, 50, 200]],
  ]);

  it.each(fits)(
    '%i x %i, %i values: gives one cell for each value, inside the panel, with a size above zero',
    (width, height, count) => {
      expectCellsInPanel(layout(width, height, count), { width, height, count });
    }
  );

  it.each(noSpace)('%i x %i, %i values: gives no cell when there is no space', (width, height, count) => {
    expect(layout(width, height, count)).toEqual([]);
  });

  it('gives no cell when the spacing is larger than the share of one cell', () => {
    // 50 values in 100 x 100 give 8 columns. The 7 spaces of 16 px are wider than the panel.
    expect(layout(100, 100, 50)).toEqual([]);
    // 4 values give 2 x 2, with cells of 42 x 42.
    expect(layout(100, 100, 4)).toHaveLength(4);
  });

  it.each([
    ['no value', 400, 300, 0],
    ['no width', 0, 300, 3],
    ['no height', 400, 0, 3],
    ['a width that is not a number', NaN, 300, 3],
    ['a height that is not a number', 400, NaN, 3],
  ])('gives no cell for %s', (_, width, height, count) => {
    expect(layout(width, height, count)).toEqual([]);
  });
});
