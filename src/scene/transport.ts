import * as THREE from "three";
import { ORIGIN_X, ORIGIN_Y, SCALE } from "../layout";
import { groundHeight, onLand } from "../terrain";
import type { Poi } from "../types";
import { C, bakeStatic, box, cyl, mat, shadows } from "./kit";

const px = (x: number, y: number): [number, number] => [(x - ORIGIN_X) * SCALE, (y - ORIGIN_Y) * SCALE];

function poiPos(pois: Poi[], id: string): [number, number] {
  const p = pois.find((q) => q.id === id);
  if (!p) throw new Error(`missing poi ${id}`);
  return p.position;
}

export type Transport = {
  group: THREE.Group;
  cableCurve: THREE.CatmullRomCurve3;
  oeCurve: THREE.CatmullRomCurve3;
  tick: (t: number) => void;
};

/**
 * Cable car: from the Waterfront station up over the hillside and along the
 * bay to Marine World, on the long arc the park map draws. Two parallel ropes,
 * gondolas going up on one and down on the other.
 */
function cableCar(pois: Poi[]) {
  const a = poiPos(pois, "cable-car-waterfront");
  const b = poiPos(pois, "cable-car-summit");
  // Plan-view guide points traced from the park map's printed cable line.
  const plan: [number, number][] = [a, px(520, 880), px(800, 640), px(1120, 520), px(1480, 470), px(1720, 560), b];
  const flat = new THREE.CatmullRomCurve3(plan.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const N = 160;
  const samples: THREE.Vector3[] = [];
  const endA = groundHeight(a[0], a[1]) + 0.55;
  const endB = groundHeight(b[0], b[1]) + 0.55;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = flat.getPoint(t);
    const ground = onLand(p.x, p.z) ? groundHeight(p.x, p.z) : 0;
    const base = endA + (endB - endA) * t;
    const lift = Math.sin(Math.PI * t) * 2.2;
    const y = Math.max(ground + 1.35, base + lift);
    samples.push(new THREE.Vector3(p.x, y, p.z));
  }
  // Ease into the stations.
  samples[0].y = endA;
  samples[N].y = endB;
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 1; i < N; i++) {
      const g = onLand(samples[i].x, samples[i].z) ? groundHeight(samples[i].x, samples[i].z) : 0;
      const avg = (samples[i - 1].y + samples[i].y * 2 + samples[i + 1].y) / 4;
      samples[i].y = Math.max(avg, g + (i < 6 || i > N - 6 ? 0.5 : 1.25));
    }
  }
  const curve = new THREE.CatmullRomCurve3(samples, false, "centripetal");
  const g = new THREE.Group();
  g.name = "cable-car";
  const rope = mat("#44484d", { rough: 0.4, metal: 0.5 });
  const side = (off: number) => {
    const pts = samples.map((p, i) => {
      const q = samples[Math.min(N, i + 1)];
      const r = samples[Math.max(0, i - 1)];
      const dx = q.x - r.x;
      const dz = q.z - r.z;
      const l = Math.hypot(dx, dz) || 1;
      return new THREE.Vector3(p.x - (dz / l) * off, p.y + 0.18, p.z + (dx / l) * off);
    });
    return new THREE.CatmullRomCurve3(pts, false, "centripetal");
  };
  const up = side(0.13);
  const down = side(-0.13);
  for (const c of [up, down]) g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 240, 0.012, 4, false), rope));

  // Pylons on land, roughly every 12 % of the run.
  const legMat = mat("#dfe3e6", { rough: 0.5, metal: 0.3 });
  for (let t = 0.07; t < 0.97; t += 0.075) {
    const p = curve.getPoint(t);
    if (!onLand(p.x, p.z)) continue;
    // Keep clear of both station halls.
    if (Math.hypot(p.x - a[0], p.z - a[1]) < 1.4 || Math.hypot(p.x - b[0], p.z - b[1]) < 2.4) continue;
    const gy = groundHeight(p.x, p.z);
    const h = p.y + 0.18 - gy;
    if (h < 0.5) continue;
    const tan = curve.getTangent(t);
    const pylon = new THREE.Group();
    pylon.position.set(p.x, gy, p.z);
    pylon.rotation.y = Math.atan2(tan.x, tan.z);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = cyl(0.018, 0.028, h, legMat, [sx * 0.07, h / 2, sz * 0.07], 4);
        leg.rotation.set(sz * -0.04, 0, sx * 0.04);
        pylon.add(leg);
      }
    }
    for (let k = 1; k < 4; k++) pylon.add(box(0.16, 0.02, 0.16, legMat, [0, (h * k) / 4, 0]));
    pylon.add(box(0.42, 0.05, 0.06, mat(C.red), [0, h, 0]));
    g.add(pylon);
  }

  // Gondolas: instanced cabins plus hangers.
  const n = 22;
  const cabinGeo = new THREE.BoxGeometry(0.16, 0.14, 0.13);
  cabinGeo.translate(0, -0.2, 0);
  const roofGeo = new THREE.BoxGeometry(0.18, 0.03, 0.15);
  roofGeo.translate(0, -0.115, 0);
  const hangGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4);
  hangGeo.translate(0, -0.06, 0);
  const cabins = new THREE.InstancedMesh(cabinGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }), n * 2);
  const roofs = new THREE.InstancedMesh(roofGeo, mat(C.white), n * 2);
  const hangers = new THREE.InstancedMesh(hangGeo, mat(C.dark), n * 2);
  const colors = [C.red, C.yellow, C.blue, C.lime, C.orange, C.pink, C.cyan];
  const col = new THREE.Color();
  for (let i = 0; i < n * 2; i++) cabins.setColorAt(i, col.set(colors[i % colors.length]));
  for (const m of [cabins, roofs, hangers]) m.castShadow = true;
  g.add(cabins, roofs, hangers);
  const dummy = new THREE.Object3D();
  const tan = new THREE.Vector3();

  const tick = (t: number) => {
    let k = 0;
    for (const [c, dir] of [[up, 1], [down, -1]] as const) {
      for (let i = 0; i < n; i++) {
        let u = (i / n + dir * t * 0.006) % 1;
        if (u < 0) u += 1;
        const p = c.getPoint(u);
        c.getTangent(u, tan);
        dummy.position.copy(p);
        dummy.rotation.set(0, Math.atan2(tan.x, tan.z) + Math.PI / 2, Math.sin(t * 0.8 + i) * 0.04);
        dummy.updateMatrix();
        cabins.setMatrixAt(k, dummy.matrix);
        roofs.setMatrixAt(k, dummy.matrix);
        hangers.setMatrixAt(k, dummy.matrix);
        k++;
      }
    }
    cabins.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    hangers.instanceMatrix.needsUpdate = true;
  };
  tick(0);
  if (cabins.instanceColor) cabins.instanceColor.needsUpdate = true;
  return { group: g, curve, tick };
}

/** Ocean Express: a funicular that runs inside the hill. Portals, a short cut, and a train that ducks in and out. */
function oceanExpress(pois: Poi[]) {
  const a = poiPos(pois, "ocean-express-waterfront");
  const b = poiPos(pois, "ocean-express-summit");
  const ya = groundHeight(a[0], a[1]) + 0.12;
  const yb = groundHeight(b[0], b[1]) + 0.12;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t + Math.sin(Math.PI * t) * 0.6;
    pts.push(new THREE.Vector3(x, ya + (yb - ya) * t, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.Group();
  g.name = "ocean-express";
  const portalMat = mat("#2c3a44");
  const trimMat = mat(C.teal);
  const portals: THREE.Object3D[] = [];
  for (const [u, dir] of [[0.06, 1], [0.94, -1]] as const) {
    const p = curve.getPoint(u);
    const tanv = curve.getTangent(u);
    const portal = new THREE.Group();
    portal.position.copy(p);
    portal.rotation.y = Math.atan2(tanv.x * dir, tanv.z * dir);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 16, Math.PI), trimMat);
    portal.add(ring);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.19, 16, 0, Math.PI), portalMat);
    hole.position.z = 0.01;
    portal.add(hole);
    shadows(portal);
    g.add(portal);
    portals.push(portal);
  }
  const train = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 10), mat(C.teal, { rough: 0.35 }));
  body.rotation.z = Math.PI / 2;
  train.add(body);
  const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.102, 0.5, 4, 10), mat(C.white));
  stripe.rotation.z = Math.PI / 2;
  stripe.scale.set(1, 1, 0.35);
  stripe.position.y = 0.02;
  train.add(stripe);
  shadows(train);
  g.add(train);
  const tan = new THREE.Vector3();
  const tick = (t: number) => {
    // Out of the portal, pause at the platform, back in.
    const cycle = (t * 0.08) % 2;
    const leg = cycle < 1 ? cycle : 2 - cycle;
    const ease = leg < 0.15 ? 0 : leg > 0.85 ? 1 : (leg - 0.15) / 0.7;
    const u = ease;
    const p = curve.getPoint(u);
    curve.getTangent(u, tan);
    train.position.set(p.x, p.y + 0.1, p.z);
    train.rotation.set(0, Math.atan2(tan.x, tan.z) - Math.PI / 2, 0);
    train.visible = u < 0.1 || u > 0.9;
  };
  tick(0);
  return { group: g, curve, tick };
}

export function buildTransport(pois: Poi[]): Transport {
  const cc = cableCar(pois);
  const oe = oceanExpress(pois);
  const group = new THREE.Group();
  group.add(cc.group, oe.group);
  shadows(cc.group, true, false);
  bakeStatic(group, (t) => {
    cc.tick(t);
    oe.tick(t);
  });
  return {
    group,
    cableCurve: cc.curve,
    oeCurve: oe.curve,
    tick: (t) => {
      cc.tick(t);
      oe.tick(t);
    },
  };
}
