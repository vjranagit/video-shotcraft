// Fixed renderer: draws src/layout.json (computed by scripts/layout.cjs). Do not edit per topic.
import React from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, useCurrentFrame} from 'remotion';
import data from './layout.json';

type Pt = number[];
type Box = {x: number; y: number; w: number; h: number};
type CardT = Box & {color: string; label: string[]; detail: string[]; delay: number};
type EdgeT = {kind: 'flow' | 'skip' | 'loop'; color: string; points: Pt[]; len: number; tip: Pt; verb: string; pill: Box; delay: number};
type Timed = {start: number; dur: number};
type IntroT = Timed & {kind: 'intro'; title: string[]; subtitle: string[]; titleY: number; subY: number; agendaY: number; agenda: string[]};
type OutroT = Timed & {kind: 'outro'; kicker: string; note: string[]; kickY: number; noteY: number; agendaY: number; agenda: string[]};
type FontT = {label: number; lh: number; detail: number; dh: number; lab0: number; det0: number};
type SceneT = Timed & {kind: 'scene'; kicker: string; title: string; subtitle: string; hasLoop: boolean; font: FontT; cards: CardT[]; edges: EdgeT[]};
type Layout = {fps: number; xf: number; total: number; colors: string[]; legend: string; legendX: number; pillFont: number; segments: (IntroT | SceneT | OutroT)[]};
// layout.json is written and validated by scripts/layout.cjs, so its shape is known here.
const L = data as unknown as Layout;
const ink = '#0F172A';
const slate = '#475569';
const paper = '#F8FAFC';
const rule = '#CBD5E1';
const loopColor = '#B45309';
const ramp = (f: number, start: number, dur: number) =>
  interpolate(f, [start, start + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});

// Orthogonal polyline with rounded bends, so a bend never reads as a junction or a crossing.
function roundPath(pts: Pt[], r = 14) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const k = Math.min(r, (Math.abs(x - px) + Math.abs(y - py)) / 2, (Math.abs(nx - x) + Math.abs(ny - y)) / 2);
    const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    d += ` L${x - ux * k} ${y - uy * k} Q${x} ${y} ${x + vx * k} ${y + vy * k}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L${lx} ${ly}`;
}

function Agenda({items, y, f, size, step, done}: {items: string[]; y: number; f: number; size: number; step: number; done?: boolean}) {
  return <g>{items.map((item, i) => {
    const a = ramp(f, 18 + i * 6, 12);
    return <g key={i} opacity={a} transform={`translate(${(1 - a) * 30} 0)`}>
      <text x={120} y={y + i * step} fill={L.colors[i % L.colors.length]} fontSize={size} fontWeight={700}>{done ? '✓' : String(i + 1).padStart(2, '0')}</text>
      <text x={120 + size * 2.3} y={y + i * step} fill={ink} fontSize={size}>{item}</text>
    </g>;
  })}</g>;
}

function Intro({s, f}: {s: IntroT; f: number}) {
  const a = ramp(f, 0, 16);
  return <g>
    <g opacity={a} transform={`translate(0 ${(1 - a) * 24})`}>
      {s.title.map((t, i) => <text key={i} x={120} y={s.titleY + i * 96} fill={ink} fontSize={84} fontWeight={700}>{t}</text>)}
      {s.subtitle.map((t, i) => <text key={i} x={120} y={s.subY + i * 46} fill={slate} fontSize={36}>{t}</text>)}
    </g>
    <Agenda items={s.agenda} y={s.agendaY} f={f} size={40} step={72}/>
  </g>;
}

function Outro({s, f}: {s: OutroT; f: number}) {
  const a = ramp(f, 0, 16);
  return <g>
    <text x={120} y={s.kickY} fill={slate} fontSize={24} fontWeight={700} letterSpacing={3} opacity={a}>{s.kicker}</text>
    <g opacity={a} transform={`translate(0 ${(1 - a) * 24})`}>
      {s.note.map((t, i) => <text key={i} x={120} y={s.noteY + i * 60} fill={ink} fontSize={46} fontWeight={700}>{t}</text>)}
    </g>
    <Agenda items={s.agenda} y={s.agendaY} f={f} size={32} step={58} done/>
  </g>;
}

function Edge({e, f}: {e: EdgeT; f: number}) {
  const p = ramp(f, e.delay, 16);
  if (p <= 0) return null;
  const d = roundPath(e.points);
  const loop = e.kind === 'loop';
  const head = ramp(f, e.delay + 12, 6);
  const live = f - e.delay - 16;
  const [tx, ty] = e.tip;
  const draw = {strokeDasharray: e.len, strokeDashoffset: e.len * (1 - p)};
  return <g>
    {/* Paper-coloured halo: a later wire cuts a gap in earlier ones, so crossings read as bridges. */}
    <path d={d} fill="none" stroke={paper} strokeWidth={14} {...draw}/>
    {loop
      ? <path d={d} fill="none" stroke={e.color} strokeWidth={4} strokeDasharray="14 10" strokeDashoffset={-f * 0.9} opacity={p}/>
      : <path d={d} fill="none" stroke={e.color} strokeWidth={4} {...draw}/>}
    <polygon points={`${tx - 18},${ty - 10} ${tx},${ty} ${tx - 18},${ty + 10}`} fill={e.color} opacity={head}/>
    {/* Travelling glow along the wire shows direction without a dot that could look like a junction. */}
    {live > 0 && <path d={d} fill="none" stroke={e.color} strokeWidth={10} strokeLinecap="round" strokeOpacity={0.3}
      strokeDasharray={`48 ${e.len + 48}`} strokeDashoffset={48 - ((live * 5) % (e.len + 48))}/>}
  </g>;
}

function Pill({e, f}: {e: EdgeT; f: number}) {
  const a = ramp(f, e.delay + 10, 8);
  const p = e.pill;
  return <g opacity={a}>
    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.h / 2} fill="white" stroke={e.color} strokeWidth={2}/>
    <text x={p.x + p.w / 2} y={p.y + p.h / 2 + L.pillFont * 0.36} textAnchor="middle" fill={e.color} fontSize={L.pillFont} fontWeight={700}>{e.verb}</text>
  </g>;
}

function Card({c, z, f}: {c: CardT; z: FontT; f: number}) {
  const a = ramp(f, c.delay, 12);
  return <g opacity={a} transform={`translate(0 ${(1 - a) * 24})`}>
    <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={18} fill="white" stroke={rule} strokeWidth={2}/>
    <rect x={c.x} y={c.y} width={10} height={c.h} rx={5} fill={c.color}/>
    {c.label.map((t, i) => <text key={'l' + i} x={c.x + 28} y={c.y + z.lab0 + i * z.lh} fill={ink} fontSize={z.label} fontWeight={700}>{t}</text>)}
    {c.detail.map((t, i) => <text key={'d' + i} x={c.x + 28} y={c.y + z.det0 + c.label.length * z.lh + i * z.dh} fill={slate} fontSize={z.detail}>{t}</text>)}
  </g>;
}

function Scene({s, f}: {s: SceneT; f: number}) {
  const a = ramp(f, 0, 14);
  return <g>
    <g opacity={a} transform={`translate(${(1 - a) * -40} 0)`}>
      <text x={120} y={96} fill={slate} fontSize={24} fontWeight={700} letterSpacing={3}>{s.kicker}</text>
      {s.hasLoop && <g>
        <line x1={L.legendX} y1={88} x2={L.legendX + 50} y2={88} stroke={loopColor} strokeWidth={4} strokeDasharray="12 8"/>
        <text x={1800} y={96} textAnchor="end" fill={loopColor} fontSize={24}>{L.legend}</text>
      </g>}
      <text x={120} y={172} fill={ink} fontSize={60} fontWeight={700}>{s.title}</text>
      <text x={120} y={226} fill={slate} fontSize={30}>{s.subtitle}</text>
    </g>
    {s.edges.map((e, i) => <Edge key={i} e={e} f={f}/>)}
    {s.cards.map((c, i) => <Card key={i} c={c} z={s.font} f={f}/>)}
    {s.edges.map((e, i) => <Pill key={i} e={e} f={f}/>)}
  </g>;
}

function Progress({frame}: {frame: number}) {
  const scenes = L.segments.filter((s) => s.kind === 'scene');
  const w = (1680 - 12 * (scenes.length - 1)) / scenes.length;
  return <g>{scenes.map((s, i) => {
    const p = Math.max(0, Math.min(1, (frame - s.start) / (s.dur - L.xf)));
    return <g key={i}>
      <rect x={120 + i * (w + 12)} y={1058} width={w} height={6} rx={3} fill={rule}/>
      <rect x={120 + i * (w + 12)} y={1058} width={w * p} height={6} rx={3} fill={L.colors[0]}/>
    </g>;
  })}</g>;
}

function Frame() {
  const frame = useCurrentFrame();
  const last = L.segments.length - 1;
  return <AbsoluteFill style={{background: paper}}>
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" fontFamily="DejaVu Sans">
      {L.segments.map((seg, i) => {
        if (frame < seg.start || frame >= seg.start + seg.dur) return null;
        const f = frame - seg.start;
        // Dip transition: outgoing fades in the first half of the overlap, incoming slides in during the second.
        const fin = i === 0 ? 1 : ramp(f, L.xf / 2, L.xf / 2);
        const fout = i === last ? 1 : 1 - ramp(f, seg.dur - L.xf, L.xf / 2);
        return <g key={i} opacity={Math.min(fin, fout)} transform={`translate(${(1 - fin) * 60} 0)`}>
          {seg.kind === 'intro' ? <Intro s={seg} f={f}/> : seg.kind === 'outro' ? <Outro s={seg} f={f}/> : <Scene s={seg} f={f}/>}
        </g>;
      })}
      <Progress frame={frame}/>
    </svg>
  </AbsoluteFill>;
}

export function Root() {
  return <Composition id="Explainer" component={Frame} durationInFrames={L.total} fps={L.fps} width={1920} height={1080}/>;
}
