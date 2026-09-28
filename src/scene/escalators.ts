import * as THREE from "three";
import { ESCALATORS, type EscalatorRun } from "../generated/escalators";
import { groundHeight } from "../terrain";
import { bakeStatic, mat } from "./kit";

/**
 * Covered outdoor escalators, drawn the way the park sheet shows them: a striped
 * canopy tube over a moving step deck, climbing from the lower end to a landing.
 */

const WIDTH = 0.34;
const CANOPY_R = 0.24;

/** Canopy stripe colours: red/white on the Summit, blue/white by the gates. */
const CANOPY: Record<string, [string, string]> = {
  "escalator-thrill-mountain": ["#e2432f", "#ffffff"],
  "escalator-water-world": ["#e0368e", "#ffffff"],
  "escalator-grand-aquarium": ["#d8453a", "#fff4e0"],
  "escalator-bus-interchange": ["#2f86d8", "#ffffff"],
  "escalator-hotel": ["#2f86d8", "#ffffff"],
};

function stripeTexture(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 8;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 32, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function stepTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8d949b";
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = "#5c636a";
  ctx.fillRect(0, 0, 6, 32);
  ctx.fillStyle = "#f2c418";
  ctx.fillRect(0, 0, 32, 3);
  ctx.fillRect(0, 29, 32, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

type Frame = { p: THREE.Vector3; side: THREE.Vector3; t: number };

/** Sample the run: the deck inclines between the ground at its two ends. */
function frames(run: EscalatorRun, n: number): Frame[] {
  const flat = new THREE.CatmullRomCurve3(run.points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const out: Frame[] = [];
  const g0 = groundHeight(run.points[0][0], run.points[0][1]);
  const last = run.points[run.points.length - 1];
  const g1 = groundHeight(last[0], last[1]);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = flat.getPoint(t);
    const tan = flat.getTangent(t);
    const e = t * t * (3 - 2 * t);
    // Straight incline between the two landings, never below the ground under it.
    const y = Math.max(g0 + (g1 - g0) * e, groundHeight(p.x, p.z) + 0.04) + 0.05;
    out.push({ p: new THREE.Vector3(p.x, y, p.z), side: new THREE.Vector3(-tan.z, 0, tan.x).normalize(), t });
  }
  return out;
}

function lengthOf(fr: Frame[]): number {
  let l = 0;
  for (let i = 1; i < fr.length; i++) l += fr[i].p.distanceTo(fr[i - 1].p);
  return l;
}

/** A strip between two offsets from the centre line, with u running along the run. */
function strip(fr: Frame[], off0: THREE.Vector3Tuple, off1: THREE.Vector3Tuple, uScale: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let u = 0;
  for (let i = 0; i < fr.length; i++) {
    if (i) u += fr[i].p.distanceTo(fr[i - 1].p) * uScale;
    const { p, side } = fr[i];
    for (const [k, off] of [off0, off1].entries()) {
      pos.push(p.x + side.x * off[0], p.y + off[1], p.z + side.z * off[0]);
      uv.push(u, k);
    }
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Half-tube canopy arching over the deck. */
function canopy(fr: Frame[], uScale: number): THREE.BufferGeometry {
  const seg = 10;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let u = 0;
  for (let i = 0; i < fr.length; i++) {
    if (i) u += fr[i].p.distanceTo(fr[i - 1].p) * uScale;
    const { p, side } = fr[i];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI;
      const sx = Math.cos(a) * CANOPY_R;
      const sy = Math.sin(a) * CANOPY_R * 0.9 + 0.2;
      pos.push(p.x + side.x * sx, p.y + sy, p.z + side.z * sx);
      uv.push(u, k / seg);
    }
    if (i) {
      const a0 = (i - 1) * (seg + 1);
      const a1 = i * (seg + 1);
      for (let k = 0; k < seg; k++) idx.push(a0 + k, a0 + k + 1, a1 + k, a0 + k + 1, a1 + k + 1, a1 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export type Escalators = { group: THREE.Group; tick: (t: number) => void };

export function buildEscalators(): Escalators {
  const group = new THREE.Group();
  group.name = "escalators";
  const steps = stepTexture();
  const stepMat = new THREE.MeshStandardMaterial({ map: steps, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: "#bfe7f5", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const rail = mat("#2a2f35", { rough: 0.4 });
  const frameMat = mat("#dfe3e6", { rough: 0.5, metal: 0.3 });
  const panelMat = new THREE.MeshStandardMaterial({ color: "#dfe3e6", roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
  const statics = new THREE.Group();

  for (const run of ESCALATORS) {
    const fr = frames(run, 36);
    const len = lengthOf(fr);
    const [cA, cB] = CANOPY[run.id] ?? ["#e2432f", "#ffffff"];
    const stripes = stripeTexture(cA, cB);
    stripes.repeat.set(1, 1);

    const deck = new THREE.Mesh(strip(fr, [WIDTH / 2, 0, 0], [-WIDTH / 2, 0, 0], 1 / 0.09), stepMat);
    const skirt = new THREE.Mesh(strip(fr, [WIDTH / 2 + 0.02, -0.12, 0], [WIDTH / 2 + 0.02, 0.02, 0], 1), panelMat);
    const skirt2 = new THREE.Mesh(strip(fr, [-WIDTH / 2 - 0.02, -0.12, 0], [-WIDTH / 2 - 0.02, 0.02, 0], 1), panelMat);
    const under = new THREE.Mesh(strip(fr, [WIDTH / 2 + 0.02, -0.12, 0], [-WIDTH / 2 - 0.02, -0.12, 0], 1), panelMat);
    const glassL = new THREE.Mesh(strip(fr, [WIDTH / 2, 0.02, 0], [WIDTH / 2, 0.16, 0], 1), glass);
    const glassR = new THREE.Mesh(strip(fr, [-WIDTH / 2, 0.02, 0], [-WIDTH / 2, 0.16, 0], 1), glass);
    const hood = new THREE.Mesh(canopy(fr, 1 / 0.28), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.55, side: THREE.DoubleSide }));
    statics.add(skirt, skirt2, under, glassL, glassR, hood);
    for (const sgn of [1, -1]) {
      const pts = fr.map((f) => f.p.clone().addScaledVector(f.side, (sgn * WIDTH) / 2).add(new THREE.Vector3(0, 0.17, 0)));
      statics.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.014, 5), rail));
    }
    // Pillars wherever the deck stands clear of the ground.
    for (let d = 0.3; d < len; d += 0.55) {
      const i = Math.min(fr.length - 1, Math.round((d / len) * (fr.length - 1)));
      const { p } = fr[i];
      const g = groundHeight(p.x, p.z);
      const h = p.y - 0.12 - g;
      if (h < 0.12) continue;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 8), frameMat);
      pillar.position.set(p.x, g + h / 2, p.z);
      statics.add(pillar);
    }
    // Landings at both ends.
    for (const f of [fr[0], fr[fr.length - 1]]) {
      const g = groundHeight(f.p.x, f.p.z);
      const h = Math.min(0.25, Math.max(0.08, f.p.y - g));
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.62, h, 0.62), frameMat);
      pad.position.set(f.p.x, g + h / 2 - 0.01, f.p.z);
      pad.rotation.y = Math.atan2(f.side.x, f.side.z);
      statics.add(pad);
    }
    deck.name = run.id;
    group.add(deck);
  }
  statics.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = m.material !== glass;
      m.receiveShadow = true;
    }
  });
  group.add(statics);
  bakeStatic(statics);
  for (const d of group.children) {
    const m = d as THREE.Mesh;
    if (m.isMesh) m.receiveShadow = true;
  }
  return {
    group,
    // Steps crawl upward.
    tick: (t) => {
      steps.offset.x = -t * 0.6;
    },
  };
}
