export const GRID_COLUMNS = 25;
export const GRID_ROWS = 30;
export const GRID_Q_MIN = -12;
export const GRID_Q_MAX = GRID_Q_MIN + GRID_COLUMNS - 1;
export const GRID_ROW_MIN = -25;
export const GRID_ROW_MAX = GRID_ROW_MIN + GRID_ROWS - 1;

export function axialToGridRow(q, r) {
  return r + Math.floor(q / 2);
}

export function gridRowToAxialR(q, row) {
  return row - Math.floor(q / 2);
}

export function isWithinGrid(q, r) {
  const row = axialToGridRow(q, r);
  return q >= GRID_Q_MIN && q <= GRID_Q_MAX &&
    row >= GRID_ROW_MIN && row <= GRID_ROW_MAX;
}

export function isGridEdge(q, r) {
  const row = axialToGridRow(q, r);
  return q === GRID_Q_MIN || q === GRID_Q_MAX ||
    row === GRID_ROW_MIN || row === GRID_ROW_MAX;
}

export function clipHoleToGrid(hole) {
  const layout = Object.fromEntries(
    Object.entries(hole.layout || {}).filter(([key]) => {
      const [q, r] = key.split(',').map(Number);
      return isWithinGrid(q, r);
    })
  );
  const slopeArrows = Object.fromEntries(
    Object.entries(hole.slopeArrows || {}).filter(([key]) => {
      const [q, r] = key.split(',').map(Number);
      return isWithinGrid(q, r);
    })
  );
  return { ...hole, layout, slopeArrows };
}
