#!/usr/bin/env node
// Validate content.json, compute the whole video layout automatically, check geometry, write layout.json.
// Every content problem exits 4 with ONE line: "FIX: <what to change>".
'use strict';
const fs = require('fs');

// DejaVu Sans advance widths (em) for ASCII 32..126, measured from the installed TTFs.
const REG = [0.318,0.401,0.46,0.838,0.636,0.95,0.78,0.275,0.39,0.39,0.5,0.838,0.318,0.361,0.318,0.337,0.636,0.636,0.636,0.636,0.636,0.636,0.636,0.636,0.636,0.636,0.337,0.337,0.838,0.838,0.838,0.531,1.0,0.684,0.686,0.698,0.77,0.632,0.575,0.775,0.752,0.295,0.295,0.656,0.557,0.863,0.748,0.787,0.603,0.787,0.695,0.635,0.611,0.732,0.684,0.989,0.685,0.611,0.685,0.39,0.337,0.39,0.838,0.5,0.5,0.613,0.635,0.55,0.635,0.615,0.352,0.635,0.634,0.278,0.278,0.579,0.278,0.974,0.634,0.612,0.635,0.635,0.411,0.521,0.392,0.634,0.592,0.818,0.592,0.592,0.525,0.636,0.337,0.636,0.838];
const BOLD = [0.348,0.456,0.521,0.838,0.696,1.002,0.872,0.306,0.457,0.457,0.523,0.838,0.38,0.415,0.38,0.365,0.696,0.696,0.696,0.696,0.696,0.696,0.696,0.696,0.696,0.696,0.4,0.4,0.838,0.838,0.838,0.58,1.0,0.774,0.762,0.734,0.83,0.683,0.683,0.821,0.837,0.372,0.372,0.775,0.637,0.995,0.837,0.85,0.733,0.85,0.77,0.72,0.682,0.812,0.774,1.103,0.771,0.724,0.725,0.457,0.365,0.457,0.838,0.5,0.5,0.675,0.716,0.593,0.716,0.678,0.435,0.716,0.712,0.343,0.343,0.665,0.343,1.042,0.712,0.687,0.716,0.716,0.493,0.595,0.478,0.712,0.652,0.924,0.645,0.652,0.582,0.712,0.365,0.712,0.838];

const [inPath, outPath] = process.argv.slice(2);
const die = (m) => { process.stderr.write('FIX: ' + m + '\n'); process.exit(4); };

const tw = (s, size, bold, ls = 0) => {
  let w = 0;
  for (const ch of s) { const c = ch.codePointAt(0); w += ((c >= 32 && c < 127) ? (bold ? BOLD : REG)[c - 32] : 0.8) * size + ls; }
  return w;
};
const approxChars = (w, size, bold, lines) => Math.max(4, Math.floor(w * lines * (lines > 1 ? 0.85 : 1) / (size * (bold ? 0.7 : 0.6))));
function wrap(s, size, bold, maxW, maxLines) {
  const lines = []; let cur = '';
  for (const word of s.split(' ')) {
    const next = cur ? cur + ' ' + word : word;
    if (tw(next, size, bold) <= maxW) { cur = next; continue; }
    if (!cur || tw(word, size, bold) > maxW) return null;
    lines.push(cur); cur = word;
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}
const fit = (s, what, size, bold, maxW, maxLines) => wrap(s, size, bold, maxW, maxLines)
  || die(`${what} is too long: "${s}" -> shorten to about ${approxChars(maxW, size, bold, maxLines)} characters`);
const text = (v, what) => {
  if (typeof v !== 'string' || !v.trim()) die(`${what} must be a non-empty string`);
  return v.replace(/\s+/g, ' ').trim();
};

// Frame geometry (1920x1080). Nothing here is chosen by the content author.
const X0 = 120, AW = 1680, TOP = 272, CH_BOTTOM = 1040, LANE = 52;
const DX = 80, DW = 1760, MARGIN = 40, MIN_GAP = 110, TRACK = 18, EXIT = 24, PILL_H = 38, PILL_PAD = 12, PORT = 28;
const F = {kicker: 24, title: 60, sub: 30, edge: 26, introTitle: 84, introSub: 36, note: 46, legend: 24};
const LEGEND = 'dashed = closes a cycle';
const COLORS = ['#0D9488', '#2563EB', '#7C3AED', '#C2410C'];
const FLOW = '#334155', LOOP = '#B45309';
const FPS = 30, XF = 12, INTRO = 84, SCENE = 156, OUTRO = 120;
const GENERIC = new Set(['input', 'output', 'process', 'processing', 'step', 'system', 'data', 'start', 'end', 'result', 'module', 'component', 'stage', 'node', 'part', 'thing', 'item', 'logic']);
// Verbs that only state sequence; an arrow must say what its source does to its target.
const ORDER_ONLY = new Set(['then', 'next', 'after', 'before', 'leads to', 'goes to', 'feeds back', 'loops back', 'continues', 'flows', 'flows to', 'hands', 'hands off', 'precedes', 'follows', 'repeats']);
const pillW = (v) => Math.ceil(tw(v, F.edge, true)) + 2 * PILL_PAD;

let c;
try { c = JSON.parse(fs.readFileSync(inPath, 'utf8')); } catch (e) { die(`content.json is not valid JSON (${e.message.split('\n')[0]}): fix quotes/commas`); }
if (!c || typeof c !== 'object' || Array.isArray(c)) die('content.json must be one JSON object');
const TOP_KEYS = ['title', 'subtitle', 'scenes', 'closing_note'];
for (const k of Object.keys(c)) if (!TOP_KEYS.includes(k)) die(`unknown key "${k}": use only ${TOP_KEYS.join(', ')}`);
const title = text(c.title, 'title'), subtitle = text(c.subtitle, 'subtitle'), note = text(c.closing_note, 'closing_note');
if (!Array.isArray(c.scenes) || c.scenes.length < 3 || c.scenes.length > 8) die('scenes must list one scene per requested subsystem (2-7) plus one last system-map scene');

const intersects = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
const segs = (pts) => pts.slice(1).map((p, i) => [pts[i], p]);
const segBox = ([[x1, y1], [x2, y2]]) => ({x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1)});
// Points where a horizontal segment of one wire passes through the interior of a vertical segment of another.
function crossings(a, b) {
  const out = [];
  for (const sa of segs(a.points)) for (const sb of segs(b.points)) {
    const A = segBox(sa), B = segBox(sb);
    const [H, V] = A.h === 0 && B.w === 0 ? [A, B] : A.w === 0 && B.h === 0 ? [B, A] : [null, null];
    if (H && V.x > H.x && V.x < H.x + H.w && H.y > V.y && H.y < V.y + V.h) out.push([V.x, H.y]);
  }
  return out;
}
const graphs = [];

function layoutScene(s, si) {
  const S = `scene ${si + 1}`;
  const SK = ['title', 'subtitle', 'nodes', 'links'];
  if (!s || typeof s !== 'object' || Array.isArray(s)) die(`${S} must be an object with keys ${SK.join(', ')}`);
  for (const k of Object.keys(s)) if (!SK.includes(k)) die(`${S} has unknown key "${k}": use only ${SK.join(', ')}`);
  const sTitle = text(s.title, `${S} title`), sSub = text(s.subtitle, `${S} subtitle`);
  fit(sTitle, `${S} title`, F.title, true, AW, 1);
  fit(sSub, `${S} subtitle`, F.sub, false, AW, 1);

  if (!Array.isArray(s.nodes) || s.nodes.length < 4 || s.nodes.length > 8) die(`${S} nodes must list 4-8 named parts as ["Label","detail"]`);
  const nodes = s.nodes.map((n, i) => {
    if (!Array.isArray(n) || n.length !== 2) die(`${S} node ${i + 1} must be ["Label","detail"]`);
    return {i, label: text(n[0], `${S} node ${i + 1} label`), detail: text(n[1], `${S} node ${i + 1} detail`)};
  });
  const byName = new Map();
  for (const n of nodes) {
    const k = n.label.toLowerCase();
    if (GENERIC.has(k)) die(`${S} node "${n.label}" is a generic word: use the real name of the part, signal or structure`);
    if (k === sTitle.toLowerCase()) die(`${S} node "${n.label}" is the scene itself: show the parts inside it and what each acts on`);
    if (byName.has(k)) die(`${S} has two nodes named "${n.label}": give each part its own name`);
    byName.set(k, n.i);
  }
  const names = nodes.map((n) => n.label).join(', ');
  if (!Array.isArray(s.links) || s.links.length < nodes.length - 1 || s.links.length > 10) die(`${S} links must list ${nodes.length - 1}-10 relations as ["From label","To label","verb"]`);
  const pairs = new Set();
  const edges = s.links.map((l, j) => {
    if (!Array.isArray(l) || l.length !== 3) die(`${S} link ${j + 1} must be ["From label","To label","verb"]`);
    const [a, b] = [0, 1].map((k) => {
      const v = byName.get(text(l[k], `${S} link ${j + 1}`).toLowerCase());
      if (v === undefined) die(`${S} link ${j + 1}: "${l[k]}" is not a node label; use one of: ${names}`);
      return v;
    });
    if (a === b) die(`${S} link ${j + 1} links "${nodes[a].label}" to itself: remove it`);
    if (pairs.has(a + '>' + b)) die(`${S} links "${nodes[a].label}" -> "${nodes[b].label}" twice: keep one`);
    pairs.add(a + '>' + b);
    const verb = text(l[2], `${S} link ${j + 1} verb`);
    if (ORDER_ONLY.has(verb.toLowerCase())) die(`${S} link "${nodes[a].label}" -> "${nodes[b].label}" verb "${verb}" only states order: use a verb for what "${nodes[a].label}" does to "${nodes[b].label}", or remove the link`);
    if (tw(verb, F.edge, true) > 210) die(`${S} link verb "${verb}" is too long: use 1-2 words, about 12 characters (e.g. "sends", "reads", "updates")`);
    return {j, s: a, t: b, verb};
  });
  for (const n of nodes) if (!edges.some((e) => e.s === n.i || e.t === n.i)) die(`${S} node "${n.label}" has no link: add its real relation or remove it`);
  for (const n of nodes) {
    if (edges.filter((e) => e.s === n.i).length > 4) die(`${S} node "${n.label}" has more than 4 outgoing links: keep the 4 most important`);
    if (edges.filter((e) => e.t === n.i).length > 4) die(`${S} node "${n.label}" has more than 4 incoming links: keep the 4 most important`);
  }
  graphs.push({title: sTitle, labels: nodes.map((n) => n.label.toLowerCase()), links: edges.map((e) => [nodes[e.s].label.toLowerCase(), nodes[e.t].label.toLowerCase()])});

  // Dashed return links are only links that close a real directed cycle (DFS back edges). List order is
  // irrelevant: a link to an earlier-listed part is ordinary flow. Each part is tried as the first DFS root;
  // the cut giving the shallowest layout (then fewest dashed links) wins.
  const outs = nodes.map(() => []);
  for (const e of edges) outs[e.s].push(e);
  const layer = (first) => {
    const back = new Set(), state = nodes.map(() => 0);
    const visit = (u) => { state[u] = 1; for (const e of outs[u]) { if (state[e.t] === 1) back.add(e); else if (!state[e.t]) visit(e.t); } state[u] = 2; };
    for (const n of [nodes[first], ...nodes]) if (!state[n.i]) visit(n.i);
    // Columns = longest path along the acyclic links, so trees and branches spread out instead of chaining.
    const rank = nodes.map(() => 0), prev = nodes.map(() => -1);
    for (let pass = 0; pass < nodes.length; pass++) for (const e of edges) if (!back.has(e) && rank[e.s] + 1 > rank[e.t]) { rank[e.t] = rank[e.s] + 1; prev[e.t] = e.s; }
    const C = Math.max(...rank) + 1, widest = Math.max(...Array.from({length: C}, (_, k) => rank.filter((r) => r === k).length));
    return {back, rank, prev, C, widest, score: Math.max(C, 4) * 100 + back.size * 10 + Math.max(widest, 4)};
  };
  const L0 = nodes.map((n) => layer(n.i)).reduce((a, b) => (b.score < a.score ? b : a));
  const {rank, prev, C} = L0;
  if (C > 4) {
    const chain = []; for (let k = rank.indexOf(C - 1); k >= 0; k = prev[k]) chain.unshift(nodes[k].label);
    die(`${S} chain "${chain.join(' -> ')}" is ${C} steps deep (max 4): link parallel parts from one shared source, or move a step to another scene`);
  }
  for (const e of edges) { const d = rank[e.t] - rank[e.s]; e.kind = L0.back.has(e) ? 'loop' : d === 1 ? 'flow' : 'skip'; }
  const cols = Array.from({length: C}, () => []);
  for (const n of nodes) cols[rank[n.i]].push(n.i);
  const pos = nodes.map(() => 0);
  cols.forEach((col, k) => {
    if (col.length > 4) die(`${S} has ${col.length} parts at the same depth (${col.map((i) => nodes[i].label).join(', ')}); max 4: move one to another scene or drop one`);
    if (k > 0) {
      const bary = (i) => { const p = edges.filter((e) => e.t === i && e.kind !== 'loop').map((e) => pos[e.s]); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0.5; };
      col.sort((a, b) => bary(a) - bary(b) || a - b);
    }
    col.forEach((i, r) => { pos[i] = (r + 0.5) / col.length; });
  });

  // Horizontal sizes: each gap fits its widest verb pill (right side) plus wire tracks (left side).
  const need = Array(C + 1).fill(0), pillMax = Array(C + 1).fill(0);
  for (const e of edges) {
    if (e.kind === 'flow') { need[rank[e.t]]++; pillMax[rank[e.t]] = Math.max(pillMax[rank[e.t]], pillW(e.verb)); }
    else { need[rank[e.s] + 1]++; need[rank[e.t]]++; }
  }
  const gapW = need.map((n, g) => (g === 0 || g === C)
    ? Math.max(MARGIN, EXIT + 16 + n * TRACK)
    : Math.max(MIN_GAP, EXIT + TRACK + 8 + pillMax[g] + 24, EXIT + n * TRACK + 16));
  const gapSum = gapW.reduce((a, b) => a + b, 0);
  const cardW = Math.min(540, Math.floor((DW - gapSum) / C));
  if (cardW < 230) {
    const wide = [...new Set(edges.map((e) => e.verb))].sort((a, b) => tw(b, F.edge, true) - tw(a, F.edge, true)).slice(0, 3);
    die(`${S} link verbs are too wide for ${C} columns: shorten the longest verbs (${wide.map((v) => `"${v}"`).join(', ')}) to one short word`);
  }
  const left = DX + Math.round((DW - gapSum - C * cardW) / 2);
  const colX = [], gapX = [left];
  let x = left + gapW[0];
  for (let k = 0; k < C; k++) { colX.push(x); x += cardW; gapX.push(x); x += gapW[k + 1]; }
  const trackX = (g, k) => gapX[g] + EXIT + k * TRACK;

  // Cycle/skip links run in horizontal lanes under the cards; narrow spans nearest the cards.
  const chan = edges.filter((e) => e.kind !== 'flow').map((e) => {
    const a = trackX(rank[e.s] + 1, 0), b = trackX(rank[e.t], 0);
    return {e, lo: Math.min(a, b) - TRACK * 2, hi: Math.max(a, b) + TRACK * 2};
  }).sort((p, q) => (p.hi - p.lo) - (q.hi - q.lo));
  const lanes = [];
  for (const ch of chan) {
    let k = lanes.findIndex((lane) => lane.every((o) => ch.hi <= o.lo || ch.lo >= o.hi));
    if (k < 0) { lanes.push([]); k = lanes.length - 1; }
    lanes[k].push(ch); ch.e.lane = k;
  }
  const T = lanes.length;
  if (T > 3) die(`${S} has too many overlapping cycle/skip links (${chan.length}): keep the 3 most important`);
  const maxR = Math.max(...cols.map((col) => col.length));
  const RG_MIN = 40, laneH = T ? 14 + T * LANE : 0, avail = CH_BOTTOM - TOP;

  // Card text: the largest size whose text fits card width AND frame height (labels <= 2 lines, details <= 3),
  // so sparse scenes get big type. The smallest size is the phone-legibility floor; below it, ask for less text.
  const textW = cardW - 28 - 16;
  const sizes = [{label: 46, lh: 54, detail: 36, dh: 43}, {label: 40, lh: 47, detail: 32, dh: 39}, {label: 35, lh: 42, detail: 29, dh: 35}, {label: 31, lh: 37, detail: 26, dh: 32}];
  const cardH = (z, L, D) => 20 + L * z.lh + 10 + D * z.dh + 16;
  const fits = (z) => {
    const w = nodes.map((n) => [wrap(n.label, z.label, true, textW, 2), wrap(n.detail, z.detail, false, textW, 3)]);
    if (w.some(([a, b]) => !a || !b)) return false;
    return maxR * cardH(z, Math.max(...w.map(([a]) => a.length)), Math.max(...w.map(([, b]) => b.length))) + (maxR - 1) * RG_MIN + laneH <= avail;
  };
  const font = {...(sizes.find(fits) || sizes[sizes.length - 1])};
  for (const n of nodes) {
    n.lines = wrap(n.label, font.label, true, textW, 2) || die(`${S} node label "${n.label}" does not fit its card (${C} columns): shorten to about ${approxChars(textW, font.label, true, 2)} characters or use fewer steps in a row`);
    n.details = wrap(n.detail, font.detail, false, textW, 3) || die(`${S} node "${n.label}" detail "${n.detail}" does not fit its card (${C} columns): shorten to about ${approxChars(textW, font.detail, false, 3)} characters`);
  }
  font.lab0 = 20 + Math.round(font.label * 0.94);
  font.det0 = 30 + Math.round(font.detail * 0.92);
  const H = cardH(font, Math.max(...nodes.map((n) => n.lines.length)), Math.max(...nodes.map((n) => n.details.length)));
  if (maxR * H + (maxR - 1) * RG_MIN + laneH > avail) die(`${S} has too much card text for ${maxR} stacked parts${T ? ` plus ${T} cycle lanes` : ''}: shorten details to one short line`);
  // Rows spread into the free height (up to 96 px apart) instead of huddling in the middle.
  const RG = maxR > 1 ? Math.min(96, Math.floor((avail - laneH - maxR * H) / (maxR - 1))) : 0;
  const bandH = maxR * H + (maxR - 1) * RG;

  // Cards band and cycle lanes form one block, centred under the subtitle.
  const bandTop = TOP + Math.round((avail - bandH - laneH) / 2);
  cols.forEach((col, k) => {
    const y0 = bandTop + Math.round((bandH - (col.length * H + (col.length - 1) * RG)) / 2);
    col.forEach((i, r) => { const n = nodes[i]; n.box = {x: colX[k], y: y0 + r * (H + RG), w: cardW, h: H}; n.cy = n.box.y + H / 2; n.col = k; });
  });

  // Route all wires for one assignment of cycle lanes to rows; returns crossings left, or a failure message.
  const nearBend = (p, e) => e.points.slice(1, -1).some(([bx, by]) => Math.abs(bx - p[0]) + Math.abs(by - p[1]) < 24);
  const route = (perm) => {
    for (const e of edges) { e.row = e.lane === undefined ? null : perm[e.lane]; e.laneY = e.row === null ? null : bandTop + bandH + 14 + LANE / 2 + e.row * LANE; }
    const nudge = new Map();
    // Incoming ports carry verb pills, so they spread up to a pill height apart when the card is tall enough.
    const portY = (n, list, e) => {
      const k = list.indexOf(e), step = list === n.ins && list.length > 1 ? Math.max(PORT, Math.min(PILL_H + 8, (H - 24) / (list.length - 1))) : PORT;
      return n.cy + (k - (list.length - 1) / 2) * step + (nudge.get(e) || 0);
    };
    // Cycle wires: outer lanes take the upper ports, so nested return paths do not cross each other.
    const endKey = (e, other) => (e.kind === 'flow' ? nodes[other].cy : 1e4 - e.row);
    for (let attempt = 0; ; attempt++) {
      for (const n of nodes) {
        n.outs = edges.filter((e) => e.s === n.i).sort((a, b) => endKey(a, a.t) - endKey(b, b.t) || a.j - b.j);
        n.ins = edges.filter((e) => e.t === n.i).sort((a, b) => endKey(a, a.s) - endKey(b, b.s) || a.j - b.j);
      }
      const verts = new Map();
      const wantV = (g, e, part, y1, y2) => { if (!verts.has(g)) verts.set(g, []); verts.get(g).push({e, part, lo: Math.min(y1, y2), hi: Math.max(y1, y2)}); };
      for (const e of edges) {
        const S0 = nodes[e.s], T0 = nodes[e.t];
        e.ys = portY(S0, S0.outs, e); e.yt = portY(T0, T0.ins, e);
        e.vx = {};
        if (e.kind === 'flow') { if (Math.abs(e.ys - e.yt) > 0.5) wantV(rank[e.t], e, 'a', e.ys, e.yt); }
        else { wantV(rank[e.s] + 1, e, 'a', e.ys, e.laneY); wantV(rank[e.t], e, 'b', e.laneY, e.yt); }
      }
      for (const [g, list] of verts) {
        list.sort((p, q) => p.lo - q.lo || p.hi - q.hi);
        const tracks = [];
        for (const v of list) {
          let k = tracks.findIndex((end) => v.lo > end + 16);
          if (k < 0) { tracks.push(0); k = tracks.length - 1; }
          tracks[k] = v.hi; v.k = k;
        }
        if (EXIT + tracks.length * TRACK > gapW[g] - 12) return `${S} has too many links crossing between the same two columns: drop or merge a link`;
      }
      const build = () => {
        for (const [g, list] of verts) for (const v of list) v.e.vx[v.part] = trackX(g, v.k);
        for (const e of edges) {
          const sx = nodes[e.s].box.x + cardW, tx = nodes[e.t].box.x;
          if (e.kind === 'flow') e.points = e.vx.a === undefined ? [[sx, e.ys], [tx - 12, e.yt]] : [[sx, e.ys], [e.vx.a, e.ys], [e.vx.a, e.yt], [tx - 12, e.yt]];
          else e.points = [[sx, e.ys], [e.vx.a, e.ys], [e.vx.a, e.laneY], [e.vx.b, e.laneY], [e.vx.b, e.yt], [tx - 12, e.yt]];
          e.tip = [tx, e.yt];
          e.arrowBox = {x: tx - 18, y: e.yt - 11, w: 18, h: 22};
        }
        let cost = 0;
        for (const a of edges) for (const b of edges) if (a.j < b.j) for (const p of crossings(a, b)) cost += nearBend(p, a) || nearBend(p, b) ? 10 : 1;
        return cost;
      };
      // Re-place vertical tracks inside each gap (move one wire to another free track, or swap two) while that
      // removes crossings.
      const legal = (list) => list.every((v) => list.every((w) => v === w || v.k !== w.k || v.lo > w.hi + 16 || w.lo > v.hi + 16));
      const room = (g) => need[g];
      let cost = build();
      const tryMove = (list, apply, undo) => {
        apply();
        const c2 = legal(list) ? build() : Infinity;
        if (c2 < cost) { cost = c2; return true; }
        undo(); return false;
      };
      for (let improved = true; improved && cost > 0;) {
        improved = false;
        for (const [g, list] of verts) for (const v of list) {
          for (let k = 0; k < room(g); k++) {
            const k0 = v.k;
            if (k !== k0 && tryMove(list, () => { v.k = k; }, () => { v.k = k0; })) improved = true;
          }
          for (const w of list) if (v.k !== w.k && tryMove(list, () => { [v.k, w.k] = [w.k, v.k]; }, () => { [v.k, w.k] = [w.k, v.k]; })) improved = true;
        }
        build();
      }
      // Wires that run on top of each other, or cross right next to a bend, read as one wire or a junction:
      // nudge a port, else fail.
      let clash = null;
      outer: for (const a of edges) for (const b of edges) {
        if (a.j >= b.j) continue;
        for (const sa of segs(a.points)) for (const sb of segs(b.points)) {
          const A = segBox(sa), B = segBox(sb);
          const bothH = A.h === 0 && B.h === 0 && Math.abs(A.y - B.y) < 10 && Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > 2;
          const bothV = A.w === 0 && B.w === 0 && Math.abs(A.x - B.x) < 8 && Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 2;
          if (bothH || bothV) { clash = [a, b]; break outer; }
        }
        if (crossings(a, b).some((p) => nearBend(p, a) || nearBend(p, b))) { clash = [a, b]; break outer; }
      }
      if (!clash) return cost;
      if (attempt >= 16) return `${S} links around "${nodes[clash[1].t].label}" overlap or cross at a bend: drop one link or connect it to a different part`;
      const e = clash[1], lim = H / 2 - 14;
      const next = (nudge.get(e) || 0) + (attempt % 2 ? -13 : 13) * (1 + (attempt >> 2));
      nudge.set(e, Math.max(-lim, Math.min(lim, next)));
    }
  };
  const perms = (xs) => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  let best = null, fail = null;
  for (const perm of perms([...Array(T).keys()])) {
    const r = route(perm);
    if (typeof r === 'string') fail = fail || r;
    else if (!best || r < best.cost) best = {perm, cost: r};
  }
  if (!best) die(fail);
  route(best.perm);
  // Clean crossings are drawn as bridges (the later wire cuts a gap in the earlier one); too many is a tangle.
  let nCross = 0;
  for (const a of edges) for (const b of edges) if (a.j < b.j) nCross += crossings(a, b).length;
  if (nCross > 4) die(`${S} links cross each other ${nCross} times (max 4): drop the least important link or move a part to another scene`);

  // Safety net: no wire may cross a card; everything stays on screen.
  for (const e of edges) for (const sg of segs(e.points)) for (const n of nodes) {
    const b = n.box;
    if (intersects(segBox(sg), {x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 6})) die(`${S} link "${e.verb}" would cross card "${n.label}": drop or redirect that link`);
  }

  // Verb pills: try spots near the link's own wire; never on another pill, card, arrow or parallel wire.
  const pills = [];
  const blocked = (p, self) => pills.some((q) => intersects(p, q, 6))
    || nodes.some((n) => intersects(p, n.box, 4))
    || edges.some((o) => (o !== self && intersects(p, o.arrowBox, 2)) || segs(o.points).some((sg) => {
      const B = segBox(sg);
      return (B.w === 0 || o !== self) && intersects(p, {x: B.x - 3, y: B.y - 3, w: B.w + 6, h: B.h + 6});
    }))
    || p.y + p.h > 1048;
  const order = [...edges].sort((a, b) => (a.kind === 'flow' ? 0 : 1) - (b.kind === 'flow' ? 0 : 1) || rank[a.s] - rank[b.s] || a.j - b.j);
  const off = PILL_H / 2 + 6;
  for (const e of order) {
    const w = pillW(e.verb);
    let spots;
    if (e.kind === 'flow') {
      // Right-aligned on the link's own last segment, next to the arrow it labels.
      const px = nodes[e.t].box.x - 24 - w / 2, own = e.vx.a === undefined ? -1e9 : e.vx.a;
      spots = (px - w / 2 >= own + 6 ? [[px, e.yt]] : []).concat(px - w * 1.5 - 12 >= own + 6 ? [[px - w - 12, e.yt]] : [], [[px, e.yt - off], [px, e.yt + off]]);
    } else {
      const [a, b] = [e.vx.a, e.vx.b].sort((p, q) => p - q);
      if (b - a < w + 24) die(`${S} cycle verb "${e.verb}" is too long for its lane: use 1-2 words`);
      spots = [0.5, 0.35, 0.65, 0.2, 0.8].map((f) => [Math.max(a + w / 2 + 12, Math.min(b - w / 2 - 12, a + (b - a) * f)), e.laneY]);
    }
    const free = spots.map(([px, py]) => ({x: Math.round(px - w / 2), y: Math.round(py - PILL_H / 2), w, h: PILL_H})).find((p) => !blocked(p, e));
    if (!free) die(`${S} verb labels near "${nodes[e.t].label}" collide: shorten verbs or drop a link into it`);
    e.pill = free; pills.push(free);
  }
  for (const e of edges) for (const [px, py] of e.points) if (px < 40 || px > 1880 || py < TOP - 10 || py > 1048) die(`${S} layout leaves the frame: drop a cycle link`);

  const len = (pts) => segs(pts).reduce((a, [[x1, y1], [x2, y2]]) => a + Math.abs(x2 - x1) + Math.abs(y2 - y1), 0);
  const cardDelay = (k) => 10 + k * 8;
  const edgeStart = cardDelay(C) + 4;
  const hasLoop = edges.some((e) => e.kind === 'loop');
  return {
    kind: 'scene', title: sTitle, subtitle: sSub, hasLoop, font,
    cards: nodes.map((n) => ({...n.box, color: COLORS[n.col], label: n.lines, detail: n.details, delay: cardDelay(n.col)})),
    edges: order.map((e, k) => ({
      kind: e.kind, color: e.kind === 'loop' ? LOOP : FLOW, points: e.points, len: len(e.points), tip: e.tip,
      verb: e.verb, pill: e.pill, delay: edgeStart + k * 6,
    })),
  };
}

const scenes = c.scenes.map(layoutScene);
const N = scenes.length, M = N - 1;

// The last scene is the system map: it must join parts from different subsystem scenes.
const home = new Map();
graphs.slice(0, M).forEach((g, i) => g.labels.forEach((l) => { if (!home.has(l)) home.set(l, i); }));
const mapG = graphs[M], needScenes = Math.min(3, M);
const reused = mapG.labels.filter((l) => home.has(l)), fromScenes = new Set(reused.map((l) => home.get(l)));
if (reused.length < 4 || fromScenes.size < needScenes) die(`last scene "${mapG.title}" is the system map: reuse at least 4 exact part labels from at least ${needScenes} earlier scenes (now ${reused.length} labels from ${fromScenes.size} scenes)`);
const crossLinks = mapG.links.filter(([a, b]) => home.has(a) && home.has(b) && home.get(a) !== home.get(b)).length;
if (crossLinks < 3) die(`system map "${mapG.title}" has ${crossLinks} links between parts of different earlier scenes (need 3): link how one subsystem's part drives another's`);

const kickerW = (s) => tw(s, F.kicker, true, 3);
const legendW = tw(LEGEND, F.legend, false) + 70;
const pad2 = (k) => String(k).padStart(2, '0');
scenes.forEach((s, i) => {
  s.kicker = `${title.toUpperCase()}  ·  ${i === M ? 'SYSTEM MAP' : `${pad2(i + 1)} / ${pad2(M)}`}`;
  if (kickerW(s.kicker) > AW - (s.hasLoop ? legendW + 40 : 0)) die(`title is too long for the scene header: shorten to about ${approxChars(AW - legendW - 200, F.kicker + 3, true, 1)} characters`);
});

const introTitle = fit(title, 'title', F.introTitle, true, AW, 2);
const introSub = fit(subtitle, 'subtitle', F.introSub, false, AW, 2);
const noteLines = fit(note, 'closing_note', F.note, true, AW, 3);
const agenda = scenes.map((s) => s.title);
// Title and closing slides: one block, vertically centred.
const centre = (h) => Math.round((1080 - h) / 2);
const subRel = (introTitle.length - 1) * 96 + 76, agRel = subRel + (introSub.length - 1) * 46 + 112;
const titleY = centre(70 + agRel + (N - 1) * 72 + 12) + 70;
const intro = {kind: 'intro', title: introTitle, subtitle: introSub, titleY, subY: titleY + subRel, agendaY: titleY + agRel, agenda};
const noteRel = 112, recapRel = noteRel + (noteLines.length - 1) * 60 + 112;
const kickY = centre(24 + recapRel + (N - 1) * 58 + 10) + 24;
const outro = {kind: 'outro', kicker: title.toUpperCase(), note: noteLines, kickY, noteY: kickY + noteRel, agendaY: kickY + recapRel, agenda};
if (kickerW(outro.kicker) > AW) die(`title is too long: shorten to about ${approxChars(AW, F.kicker + 3, true, 1)} characters`);

const segments = [];
let t = 0;
for (const [seg, dur] of [[intro, INTRO], ...scenes.map((s) => [s, SCENE]), [outro, OUTRO]]) { segments.push({...seg, start: t, dur}); t += dur - XF; }
const total = t + XF;
const sec = (f) => (f / FPS).toFixed(2);
const out = {
  fps: FPS, xf: XF, total, colors: COLORS, legend: LEGEND, legendX: Math.round(1800 - tw(LEGEND, F.legend, false) - 70), pillFont: F.edge, segments,
  posterSec: sec(segments[N].start + SCENE - XF - 8),
  sheetSec: segments.map((s) => sec(s.start + s.dur - XF - 6)),
};
fs.writeFileSync(outPath, JSON.stringify(out));
console.error(`layout ok: ${N} scenes, ${scenes.reduce((a, s) => a + s.cards.length, 0)} parts, ${scenes.reduce((a, s) => a + s.edges.length, 0)} links, ${(total / FPS).toFixed(1)} s`);
