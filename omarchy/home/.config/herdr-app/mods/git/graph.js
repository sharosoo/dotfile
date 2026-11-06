// Commit graph lanes, computed incrementally so paged log batches extend the same graph.
import { PathBuilder } from "gpui-kit";

export const LANE = 11;
export const MAX_LANES = 10;
const DOT_Y = 10;

export function newGraph() {
  return { lanes: [], next: 0 };
}

// One row per commit: which lane it sits in and which lines pass, end, start or join here.
export function placeCommit(graph, sha, parents) {
  const lanes = graph.lanes, before = lanes.slice();
  let col = lanes.findIndex((l) => l && l.sha === sha);
  const top = col >= 0;
  if (col < 0) {
    col = lanes.indexOf(null);
    if (col < 0) col = lanes.length;
    lanes[col] = { sha, color: graph.next++ };
  }
  const color = lanes[col].color, merging = [];
  for (let i = 0; i < lanes.length; i++) {
    if (i !== col && lanes[i] && lanes[i].sha === sha) { merging.push({ col: i, color: lanes[i].color }); lanes[i] = null; }
  }
  lanes[col] = parents.length ? { sha: parents[0], color } : null;
  const branching = [], joining = [];
  for (const p of parents.slice(1)) {
    let j = lanes.findIndex((l) => l && l.sha === p);
    if (j >= 0) { joining.push({ col: j, color: lanes[j].color }); continue; }
    j = lanes.indexOf(null);
    if (j < 0) j = lanes.length;
    lanes[j] = { sha: p, color: graph.next++ };
    branching.push({ col: j, color: lanes[j].color });
  }
  while (lanes.length && !lanes[lanes.length - 1]) lanes.pop();
  const ended = new Set(merging.map((m) => m.col)), through = [];
  for (let i = 0; i < before.length; i++) if (i !== col && before[i] && !ended.has(i)) through.push({ col: i, color: before[i].color });
  return { col, color, top, bottom: parents.length > 0, merge: parents.length > 1, merging, branching, joining, through,
    width: Math.max(before.length, lanes.length, col + 1) };
}

// Lanes past the cap share the last column; `hidden` counts how many share it so the row can say so.
const x = (i) => Math.min(i, MAX_LANES - 1) * LANE + LANE / 2 + 1;

// Built once when the commit is placed. Paths are geometry only; colors are applied when painting,
// so a theme change needs no rebuild.
export function rowPaths(row, height) {
  const strokes = new Map();
  const add = (color, draw) => {
    if (!strokes.has(color)) strokes.set(color, []);
    strokes.get(color).push(draw);
  };
  const xc = x(row.col);
  for (const l of row.through) add(l.color, (p) => p.move_to(x(l.col), 0).line_to(x(l.col), height));
  if (row.top) add(row.color, (p) => p.move_to(xc, 0).line_to(xc, DOT_Y));
  if (row.bottom) add(row.color, (p) => p.move_to(xc, DOT_Y).line_to(xc, height));
  for (const m of row.merging) add(m.color, (p) => p.move_to(x(m.col), 0).curve_to(xc, DOT_Y, x(m.col), DOT_Y));
  for (const b of [...row.branching, ...row.joining]) add(b.color, (p) => p.move_to(xc, DOT_Y).curve_to(x(b.col), height, x(b.col), DOT_Y));
  const lines = [...strokes].map(([color, draws]) => {
    let p = PathBuilder.stroke(1.5);
    for (const d of draws) p = d(p);
    return { color, path: p.build() };
  });
  const circle = (r) => PathBuilder.fill().move_to(xc + r, DOT_Y).arc_to(r, r, 0, false, true, xc - r, DOT_Y).arc_to(r, r, 0, false, true, xc + r, DOT_Y).close().build();
  return { lines, dot: circle(3.5), ring: circle(5.5), hole: circle(1.8), hidden: row.width > MAX_LANES ? row.width - MAX_LANES + 1 : 0 };
}
