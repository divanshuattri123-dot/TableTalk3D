export function tileLayout(position: number, size: number) {
  const side = size / 4, quarter = Math.floor(position / side), offset = position % side;
  const edge = (side - 1) / 2 + .75, along = offset === 0 ? edge : side / 2 - offset;
  const x = quarter === 0 ? along : quarter === 1 ? -edge : quarter === 2 ? -along : edge;
  const z = quarter === 0 ? edge : quarter === 1 ? along : quarter === 2 ? -edge : -along;
  const corner = offset === 0;
  return { x, z, width: corner || quarter % 2 === 1 ? 1.5 : 1, depth: corner || quarter % 2 === 0 ? 1.5 : 1, quarter, corner };
}

export const boardSpan = (size: number) => size / 4 + 2;
export function boardFrustum(size: number, aspect: number) {
  const span = boardSpan(size) + .45;
  return { width: span * Math.max(1, aspect), height: span * Math.max(1, 1 / aspect) };
}
