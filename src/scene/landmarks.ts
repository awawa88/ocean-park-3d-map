import * as THREE from "three";
import { groundHeight } from "../terrain";
import type { Poi } from "../types";
import {
  C,
  bakeStatic,
  box,
  cone,
  cyl,
  dome,
  gableRoof,
  group,
  hipRoof,
  house,
  mat,
  shadows,
  signTexture,
  sphere,
  torus,
  tube,
} from "./kit";

/** Every attraction gets an original toy model sized for the map, not to scale. */

type Tick = (t: number) => void;
type Built = { obj: THREE.Object3D; tick?: Tick; yaw?: number };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- rides ---------------------------------------------------------------------

function ferrisWheel(): Built {
  const g = group();
  const hubY = 2.15;
  const R = 1.7;
  const wheel = group();
  wheel.position.y = hubY;
  const white = mat(C.white, { rough: 0.4, metal: 0.2 });
  for (const z of [-0.12, 0.12]) {
    wheel.add(torus(R, 0.045, white, [0, 0, z], undefined, Math.PI * 2, 64));
    wheel.add(torus(R * 0.55, 0.025, white, [0, 0, z], undefined, Math.PI * 2, 40));
  }
  const n = 16;
  const cabins: THREE.Object3D[] = [];
  const cabinCols = [C.red, C.yellow, C.cyan, C.pink, C.lime, C.orange, C.blue, C.purple];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spoke = cyl(0.014, 0.014, R, white, [Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0], 5, [0, 0, a - Math.PI / 2]);
    wheel.add(spoke);
    const pivot = group();
    pivot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const cab = group(
      cyl(0.012, 0.012, 0.14, mat(C.dark), [0, -0.07, 0], 4),
      box(0.2, 0.18, 0.2, mat(cabinCols[i % cabinCols.length], { rough: 0.45 }), [0, -0.23, 0]),
      box(0.22, 0.04, 0.22, mat(C.white), [0, -0.13, 0]),
    );
    pivot.add(cab);
    wheel.add(pivot);
    cabins.push(pivot);
  }
  wheel.add(cyl(0.12, 0.12, 0.34, mat(C.gold, { metal: 0.4, rough: 0.35 }), [0, 0, 0], 16, [Math.PI / 2, 0, 0]));
  g.add(wheel);
  const legMat = mat(C.white, { rough: 0.5 });
  for (const z of [-0.32, 0.32]) {
    for (const sx of [-1, 1]) {
      const leg = cyl(0.045, 0.06, hubY / Math.cos(0.38), legMat, [sx * Math.sin(0.38) * hubY * 0.5, hubY / 2, z], 8, [
        0,
        0,
        sx * 0.38,
      ]);
      g.add(leg);
    }
  }
  g.add(cyl(0.9, 1.0, 0.16, mat(C.pink), [0, 0.08, 0], 24));
  g.add(box(0.7, 0.3, 0.4, mat(C.white), [0, 0.3, 0.55]));
  return {
    obj: g,
    tick: (t) => {
      const a = t * 0.12;
      wheel.rotation.z = a;
      for (const c of cabins) c.rotation.z = -a;
    },
  };
}

function oceanParkTower(): Built {
  const g = group();
  const H = 4.6;
  g.add(cyl(0.55, 0.65, 0.3, mat(C.white), [0, 0.15, 0], 20));
  g.add(cyl(0.11, 0.15, H, mat(C.white, { rough: 0.35 }), [0, H / 2, 0], 16));
  g.add(cyl(0.2, 0.2, 0.22, mat(C.blue, { rough: 0.3 }), [0, H + 0.1, 0], 16));
  g.add(cone(0.12, 0.5, mat(C.red), [0, H + 0.45, 0], 12));
  const cabin = group(
    cyl(0.46, 0.46, 0.26, mat(C.glass, { rough: 0.15, metal: 0.2 }), [0, 0, 0], 28),
    cyl(0.5, 0.5, 0.06, mat(C.white), [0, 0.15, 0], 28),
    cyl(0.5, 0.5, 0.06, mat(C.white), [0, -0.15, 0], 28),
  );
  g.add(cabin);
  return {
    obj: g,
    tick: (t) => {
      const cycle = (Math.sin(t * 0.25) * 0.5 + 0.5) ** 1.5;
      cabin.position.y = 0.55 + cycle * (H - 1.1);
      cabin.rotation.y = t * 0.3;
    },
  };
}

function hairRaiser(): Built {
  const g = group();
  const pts = [
    V(-1.9, 0.3, 0.7),
    V(-1.0, 0.3, 0.95),
    V(-0.1, 1.2, 1.0),
    V(0.55, 2.45, 0.9),
    V(1.05, 2.2, 0.75),
    V(1.45, 0.9, 0.45),
    V(1.9, 0.45, 0.1),
    V(2.45, 1.0, -0.1),
    V(2.45, 1.95, -0.25),
    V(1.95, 2.3, -0.35),
    V(1.5, 1.8, -0.42),
    V(1.65, 0.9, -0.5),
    V(1.2, 0.5, -0.8),
    V(0.3, 1.2, -1.0),
    V(-0.5, 1.55, -0.9),
    V(-1.3, 0.8, -0.7),
    V(-2.2, 0.45, -0.15),
  ];
  const track = mat(C.orange, { rough: 0.4, metal: 0.2 });
  g.add(tube(pts, 0.05, track, true, 260, 6));
  const lower = pts.map((p) => V(p.x, p.y - 0.09, p.z));
  g.add(tube(lower, 0.025, mat(C.gold, { rough: 0.45 }), true, 260, 5));
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  const support = mat(C.white, { rough: 0.55 });
  for (let i = 0; i < 44; i++) {
    const p = curve.getPoint(i / 44);
    if (p.y < 0.5) continue;
    g.add(cyl(0.025, 0.035, p.y - 0.1, support, [p.x, (p.y - 0.1) / 2, p.z], 5));
  }
  g.add(house(0.9, 0.5, 0.35, C.yellow, C.red, "hip", 0.2).translateX(-1.5).translateZ(0.7));
  const train = group(box(0.38, 0.1, 0.12, mat(C.red, { rough: 0.35 })), box(0.1, 0.12, 0.13, mat(C.yellow), [0.15, 0.08, 0]));
  g.add(train);
  const tan = new THREE.Vector3();
  return {
    obj: g,
    tick: (t) => {
      const u = (t * 0.045) % 1;
      const p = curve.getPoint(u);
      curve.getTangent(u, tan);
      train.position.set(p.x, p.y + 0.09, p.z);
      train.lookAt(p.x + tan.x, p.y + 0.09 + tan.y, p.z + tan.z);
      train.rotateY(-Math.PI / 2);
    },
  };
}

function arcticBlast(): Built {
  const g = group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push(V(Math.cos(a) * 0.75, 0.3 + 0.35 * Math.max(0, Math.sin(a * 2)) + (i === 3 ? 0.4 : 0), Math.sin(a) * 0.45));
  }
  g.add(tube(pts, 0.04, mat(C.blue, { rough: 0.4 }), true, 140, 6));
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  for (let i = 0; i < 18; i++) {
    const p = curve.getPoint(i / 18);
    g.add(cyl(0.018, 0.018, p.y, mat(C.white), [p.x, p.y / 2, p.z], 4));
  }
  const car = box(0.2, 0.08, 0.1, mat(C.yellow, { rough: 0.35 }));
  g.add(car);
  g.add(dome(0.2, mat(C.ice), [0, 0, 0], 12));
  return {
    obj: g,
    tick: (t) => {
      const u = (t * 0.09) % 1;
      const p = curve.getPoint(u);
      const q = curve.getPoint((u + 0.01) % 1);
      car.position.set(p.x, p.y + 0.06, p.z);
      car.lookAt(q.x, q.y + 0.06, q.z);
      car.rotateY(-Math.PI / 2);
    },
  };
}

function carousel(canopy: string, trim: string, radius = 0.42): Built {
  const g = group();
  g.add(cyl(radius, radius + 0.04, 0.1, mat(C.white), [0, 0.05, 0], 24));
  const spin = group();
  spin.add(cyl(radius * 0.92, radius * 0.92, 0.04, mat(trim), [0, 0.12, 0], 24));
  spin.add(cyl(0.06, 0.06, 0.5, mat(C.gold, { metal: 0.4, rough: 0.3 }), [0, 0.35, 0], 8));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * radius * 0.7;
    const z = Math.sin(a) * radius * 0.7;
    spin.add(cyl(0.012, 0.012, 0.42, mat(C.gold, { metal: 0.5, rough: 0.3 }), [x, 0.33, z], 4));
    spin.add(box(0.1, 0.07, 0.04, mat(i % 2 ? C.white : C.sky), [x, 0.24 + (i % 2) * 0.05, z], [0, -a, 0]));
  }
  spin.add(cone(radius + 0.08, 0.28, mat(canopy), [0, 0.68, 0], 16));
  spin.add(cyl(radius + 0.08, radius + 0.08, 0.08, mat(trim), [0, 0.52, 0], 16));
  spin.add(sphere(0.05, mat(C.gold, { metal: 0.5 }), [0, 0.86, 0], 8));
  g.add(spin);
  return { obj: g, tick: (t) => (spin.rotation.y = t * 0.6) };
}

function balloons(): Built {
  const g = group();
  g.add(cyl(0.38, 0.42, 0.08, mat(C.cream), [0, 0.04, 0], 20));
  g.add(cyl(0.04, 0.06, 0.9, mat(C.gold, { metal: 0.3 }), [0, 0.45, 0], 8));
  const spin = group();
  spin.position.y = 0.88;
  const cols = [C.red, C.yellow, C.cyan, C.pink, C.lime, C.orange];
  cols.forEach((col, i) => {
    const a = (i / cols.length) * Math.PI * 2;
    const x = Math.cos(a) * 0.42;
    const z = Math.sin(a) * 0.42;
    spin.add(cyl(0.01, 0.01, 0.42, mat(C.gold), [x / 2, 0, z / 2], 4, [0, -a, Math.PI / 2]));
    spin.add(sphere(0.14, mat(col, { rough: 0.45 }), [x, -0.05, z], 12, [1, 1.15, 1]));
    spin.add(box(0.08, 0.06, 0.08, mat(C.wood), [x, -0.26, z]));
  });
  g.add(spin);
  return { obj: g, tick: (t) => (spin.rotation.y = t * 0.45) };
}

function swingRide(canopy: string, chairCol: string, height: number, radius: number): Built {
  const g = group();
  g.add(cyl(radius * 0.4, radius * 0.5, 0.1, mat(C.white), [0, 0.05, 0], 16));
  g.add(cyl(0.06, 0.08, height, mat(C.white, { rough: 0.4 }), [0, height / 2, 0], 10));
  const spin = group();
  spin.position.y = height;
  spin.add(cone(radius * 0.75, 0.3, mat(canopy), [0, 0.15, 0], 16));
  const chairs = group();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const arm = group();
    arm.rotation.y = a;
    const hang = group(
      cyl(0.006, 0.006, 0.5, mat(C.dark), [0, -0.25, 0], 3),
      box(0.07, 0.05, 0.07, mat(i % 2 ? chairCol : C.yellow), [0, -0.52, 0]),
    );
    hang.position.x = radius * 0.7;
    arm.add(hang);
    chairs.add(arm);
  }
  spin.add(chairs);
  g.add(spin);
  const hangs = chairs.children.map((c) => c.children[0]);
  return {
    obj: g,
    tick: (t) => {
      const speed = 0.9 + Math.sin(t * 0.2) * 0.3;
      spin.rotation.y = t * speed;
      const flare = 0.45 + Math.sin(t * 0.2) * 0.15;
      for (const h of hangs) h.rotation.z = flare;
    },
  };
}

function galleon(): Built {
  const g = group();
  const frame = mat(C.gold, { rough: 0.45, metal: 0.2 });
  for (const z of [-0.35, 0.35]) {
    g.add(cyl(0.035, 0.05, 1.45, frame, [-0.35, 0.68, z], 6, [0, 0, -0.25]));
    g.add(cyl(0.035, 0.05, 1.45, frame, [0.35, 0.68, z], 6, [0, 0, 0.25]));
  }
  g.add(cyl(0.04, 0.04, 0.8, frame, [0, 1.36, 0], 8, [Math.PI / 2, 0, 0]));
  const swing = group();
  swing.position.y = 1.36;
  const shape = new THREE.Shape();
  shape.moveTo(-0.7, 0.1);
  shape.quadraticCurveTo(-0.55, -0.22, 0, -0.24);
  shape.quadraticCurveTo(0.55, -0.22, 0.7, 0.1);
  shape.lineTo(-0.7, 0.1);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false });
  hullGeo.translate(0, 0, -0.18);
  const hull = new THREE.Mesh(hullGeo, mat(C.wood, { rough: 0.6 }));
  hull.position.y = -1.0;
  swing.add(hull);
  swing.add(box(1.3, 0.04, 0.34, mat(C.red), [0, -0.9, 0]));
  swing.add(cyl(0.02, 0.02, 1.0, frame, [0, -0.5, 0], 5));
  swing.add(box(0.03, 0.4, 0.32, mat(C.white), [0.05, -0.62, 0]));
  g.add(swing);
  return { obj: g, tick: (t) => (swing.rotation.z = Math.sin(t * 0.9) * 0.75) };
}

function spinner(armCol: string, carCol: string): Built {
  const g = group();
  g.add(cyl(0.45, 0.5, 0.08, mat(C.white), [0, 0.04, 0], 20));
  g.add(cyl(0.07, 0.09, 0.7, mat(C.dark), [0, 0.35, 0], 10));
  const spin = group();
  spin.position.y = 0.72;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = group(
      box(0.45, 0.05, 0.05, mat(armCol, { rough: 0.4 }), [0.22, 0, 0]),
      box(0.14, 0.1, 0.14, mat(carCol, { rough: 0.35 }), [0.45, -0.07, 0]),
    );
    arm.rotation.y = a;
    arm.rotation.z = -0.25;
    spin.add(arm);
  }
  g.add(spin);
  return { obj: g, tick: (t) => (spin.rotation.y = t * 1.4) };
}

function pendulum(armCol: string): Built {
  const g = group();
  for (const z of [-0.18, 0.18]) g.add(box(0.1, 1.1, 0.1, mat(C.white), [0, 0.55, z]));
  const arm = group(box(0.07, 0.9, 0.07, mat(armCol, { rough: 0.4 }), [0, -0.45, 0]));
  const ring = group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ring.add(box(0.07, 0.06, 0.07, mat(i % 2 ? C.yellow : C.red), [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2]));
  }
  ring.position.y = -0.92;
  arm.add(ring);
  arm.position.y = 1.08;
  g.add(arm);
  return {
    obj: g,
    tick: (t) => {
      arm.rotation.z = Math.sin(t * 0.7) * 1.9;
      ring.rotation.y = t * 1.5;
    },
  };
}

function bumperHall(): Built {
  const g = group();
  g.add(box(1.1, 0.06, 0.8, mat(C.dark), [0, 0.03, 0]));
  for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]] as const) {
    g.add(cyl(0.025, 0.025, 0.5, mat(C.white), [x, 0.25, z], 5));
  }
  g.add(hipRoof(1.1, 0.8, 0.28, mat(C.red), 0.5));
  g.add(box(1.18, 0.07, 0.88, mat(C.yellow), [0, 0.52, 0]));
  const cars = [C.cyan, C.pink, C.lime, C.orange];
  cars.forEach((c, i) => g.add(box(0.12, 0.06, 0.09, mat(c), [(i - 1.5) * 0.22, 0.09, (i % 2) * 0.2 - 0.1])));
  return { obj: g };
}

function rapids(): Built {
  const g = group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 0.8 + 0.22 * Math.sin(a * 3);
    pts.push(V(Math.cos(a) * r, 0.1, Math.sin(a) * r * 0.75));
  }
  const channel = tube(pts, 0.14, mat("#3fc2df", { rough: 0.2, metal: 0.1 }), true, 160, 8);
  channel.scale.y = 0.35;
  g.add(channel);
  const rim = tube(pts.map((p) => V(p.x, 0.04, p.z)), 0.21, mat(C.stone), true, 160, 6);
  rim.scale.y = 0.3;
  g.add(rim);
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  const rafts = [0, 0.33, 0.66].map((o, i) => {
    const r = torus(0.09, 0.035, mat([C.yellow, C.orange, C.red][i], { rough: 0.5 }), [0, 0, 0], [Math.PI / 2, 0, 0], Math.PI * 2, 16);
    g.add(r);
    return { r, o };
  });
  g.add(house(0.5, 0.35, 0.28, C.wood, C.roofGreen, "hip", 0.22).translateX(-0.3).translateZ(0.1));
  return {
    obj: g,
    tick: (t) => {
      for (const { r, o } of rafts) {
        const p = curve.getPoint((t * 0.04 + o) % 1);
        r.position.set(p.x, 0.16, p.z);
        r.rotation.z = t * 1.2 + o * 10;
      }
    },
  };
}

// --- buildings -------------------------------------------------------------------

function grandAquarium(): Built {
  const g = group();
  // Podium and glass hall.
  g.add(box(3.2, 0.26, 2.2, mat(C.cream), [0, 0.13, 0]));
  g.add(box(2.6, 0.5, 1.5, mat("#bfe7f5", { rough: 0.12, metal: 0.25 }), [0, 0.5, 0.1]));
  g.add(box(2.64, 0.05, 1.54, mat(C.white), [0, 0.76, 0.1]));
  // The wave roof: three curved shells sweeping over the hall, blue, white and teal.
  const shells: [string, number, number, number][] = [
    ["#1f6fc4", 1.25, 0.0, -0.35],
    [C.white, 1.05, 0.3, 0.05],
    ["#27b5c9", 0.85, 0.6, 0.42],
  ];
  for (const [col, r, lift, z] of shells) {
    const geo = new THREE.CylinderGeometry(r, r, 2.9 - lift * 0.8, 40, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
    const shell = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide }));
    shell.rotation.z = Math.PI / 2;
    shell.scale.set(0.55, 1, 1);
    shell.position.set(-lift * 0.25, 0.7 + lift * 0.35 - r * 0.55 + 0.3, z);
    g.add(shell);
  }
  // A crest of blue glass along the top, like a breaking wave.
  const crest = torus(0.9, 0.08, mat("#5fd0e6", { rough: 0.15, metal: 0.2 }), [0.1, 0.95, 0.25], [0, 0, 0], Math.PI, 32);
  crest.scale.set(1.5, 0.6, 1);
  g.add(crest);
  // Entrance canopy and sign.
  g.add(box(1.1, 0.05, 0.6, mat(C.white), [0.2, 0.62, 1.3]));
  for (const x of [-0.25, 0.65]) g.add(cyl(0.03, 0.03, 0.36, mat(C.white), [x, 0.44, 1.55], 6));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.3),
    new THREE.MeshStandardMaterial({ map: signTexture("GRAND AQUARIUM", "#1f5fae", "#ffffff"), roughness: 0.6 }),
  );
  sign.position.set(0.2, 0.34, 1.62);
  g.add(sign);
  return { obj: g };
}

function pandaPavilion(): Built {
  const g = group();
  g.add(box(1.5, 0.12, 1.05, mat(C.stone), [0, 0.06, 0]));
  g.add(box(1.2, 0.5, 0.8, mat("#f4ead6"), [0, 0.37, 0]));
  for (const x of [-0.55, -0.2, 0.2, 0.55]) g.add(cyl(0.035, 0.035, 0.5, mat(C.red), [x, 0.37, 0.42], 8));
  g.add(hipRoof(1.3, 0.95, 0.26, mat(C.roofGreen, { rough: 0.5 }), 0.62));
  g.add(box(0.8, 0.22, 0.55, mat(C.red), [0, 0.99, 0]));
  g.add(hipRoof(0.85, 0.6, 0.22, mat(C.roofGreen, { rough: 0.5 }), 1.1));
  // Panda at the door.
  const panda = group(
    sphere(0.15, mat(C.white), [0, 0.15, 0], 14, [1, 0.95, 0.9]),
    sphere(0.1, mat(C.white), [0, 0.35, 0.02], 14),
    sphere(0.035, mat(C.black), [-0.075, 0.43, 0], 8),
    sphere(0.035, mat(C.black), [0.075, 0.43, 0], 8),
    sphere(0.025, mat(C.black), [-0.035, 0.36, 0.085], 6),
    sphere(0.025, mat(C.black), [0.035, 0.36, 0.085], 6),
    sphere(0.05, mat(C.black), [-0.12, 0.16, 0.08], 8),
    sphere(0.05, mat(C.black), [0.12, 0.16, 0.08], 8),
  );
  panda.position.set(0.55, 0.12, 0.72);
  panda.scale.setScalar(1.3);
  g.add(panda);
  for (const [x, z] of [[-0.85, 0.3], [-0.9, -0.2], [0.85, -0.3]] as const) {
    for (let i = 0; i < 4; i++) {
      g.add(cyl(0.015, 0.02, 0.6 + i * 0.08, mat(C.lime), [x + (i % 2) * 0.06, 0.3 + i * 0.04, z + i * 0.04], 5));
    }
  }
  return { obj: g };
}

function oldHongKong(): Built {
  const g = group();
  const fronts = ["#e8b34a", "#d9644b", "#6fb3a8", "#e9d7b0", "#c4546a"];
  fronts.forEach((c, i) => {
    const h = 0.5 + (i % 3) * 0.12;
    const b = group(
      box(0.3, h, 0.36, mat(c)),
      box(0.32, 0.03, 0.1, mat(C.white), [0, h * 0.55, 0.2]),
      box(0.32, 0.03, 0.1, mat(C.white), [0, h * 0.8, 0.2]),
      box(0.34, 0.05, 0.4, mat(C.dark), [0, h + 0.025, 0]),
      box(0.16, 0.12, 0.02, mat(i % 2 ? C.red : C.yellow, { emissive: i % 2 ? C.red : C.yellow }), [0.1, h * 0.7, 0.2]),
    );
    b.position.x = (i - 2) * 0.31;
    g.add(b);
  });
  // A green double-deck tram outside.
  const tram = group(
    box(0.56, 0.3, 0.18, mat("#2e8b57", { rough: 0.45 }), [0, 0.2, 0]),
    box(0.56, 0.07, 0.19, mat(C.cream), [0, 0.2, 0]),
    box(0.58, 0.03, 0.2, mat(C.white), [0, 0.36, 0]),
  );
  tram.position.set(0.1, 0, 0.5);
  g.add(tram);
  return { obj: g };
}

function castle(): Built {
  const g = group();
  const wall = mat("#f1d8b8");
  g.add(box(0.8, 0.45, 0.55, wall));
  for (const [x, z, h] of [[-0.4, -0.27, 0.8], [0.4, -0.27, 0.8], [-0.4, 0.27, 0.65], [0.4, 0.27, 0.65], [0, 0, 1.05]] as const) {
    g.add(cyl(0.12, 0.13, h, wall, [x, h / 2, z], 12));
    g.add(cone(0.16, 0.32, mat(C.red), [x, h + 0.16, z], 12));
  }
  g.add(box(0.2, 0.25, 0.02, mat(C.wood), [0, 0.13, 0.28]));
  g.add(box(0.02, 0.12, 0.08, mat(C.yellow), [0, 1.35, 0]));
  return { obj: g };
}

function loco(): Built {
  const g = group();
  g.add(torus(0.42, 0.025, mat(C.wood), [0, 0.04, 0], [Math.PI / 2, 0, 0], Math.PI * 2, 40));
  const train = group();
  const cars = [C.red, C.blue, C.yellow, C.lime];
  cars.forEach((c, i) => {
    const a = i * 0.42;
    const car = group(box(0.16, 0.1, 0.1, mat(c, { rough: 0.4 }), [0, 0.1, 0]));
    if (i === 0) car.add(cyl(0.025, 0.025, 0.08, mat(C.dark), [0.04, 0.19, 0], 6));
    car.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    car.rotation.y = -a - Math.PI / 2;
    train.add(car);
  });
  g.add(train);
  g.add(cone(0.1, 0.35, mat(C.green), [0, 0.2, 0], 7));
  return { obj: g, tick: (t) => (train.rotation.y = -t * 0.5) };
}

function giantPlants(): Built {
  const g = group();
  const caps = [C.red, C.orange, C.pink];
  [[0, 0, 0.7], [0.3, 0.2, 0.5], [-0.28, 0.15, 0.55]].forEach(([x, z, h], i) => {
    g.add(cyl(0.05, 0.07, h, mat(C.cream), [x, h / 2, z], 8));
    g.add(dome(0.2, mat(caps[i]), [x, h - 0.02, z], 14, [1, 0.6, 1]));
  });
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    g.add(cone(0.08, 0.5, mat(C.green), [Math.cos(a) * 0.4, 0.25, Math.sin(a) * 0.35], 6, [0.3 * Math.sin(a), 0, 0.3 * Math.cos(a)]));
  }
  return { obj: g };
}

function enclosure(ground: string, rockCol: string, animal: string): Built {
  const g = group();
  g.add(cyl(0.45, 0.48, 0.06, mat(ground), [0, 0.03, 0], 18));
  g.add(torus(0.46, 0.02, mat(C.wood), [0, 0.12, 0], [Math.PI / 2, 0, 0], Math.PI * 2, 24));
  g.add(sphere(0.16, mat(rockCol, { rough: 0.9 }), [-0.15, 0.06, -0.1], 7, [1.2, 0.7, 1]));
  g.add(sphere(0.12, mat(rockCol, { rough: 0.9 }), [0.18, 0.04, -0.05], 7, [1, 0.8, 1.2]));
  for (let i = 0; i < 3; i++) g.add(sphere(0.035, mat(animal), [-0.05 + i * 0.1, 0.1, 0.15], 8, [0.7, 1.3, 0.7]));
  return { obj: g };
}

function glasshouse(frameCol: string, w = 0.6, d = 0.45): Built {
  const g = group();
  g.add(box(w, 0.28, d, mat(C.glass, { rough: 0.1, metal: 0.2, opacity: 0.75 })));
  g.add(gableRoof(w, d, 0.22, mat(C.glass, { rough: 0.1, metal: 0.2, opacity: 0.7 }), 0.28));
  g.add(box(w + 0.02, 0.03, d + 0.02, mat(frameCol), [0, 0.28, 0]));
  g.add(sphere(0.14, mat(C.green), [0, 0.2, 0], 8));
  return { obj: g };
}

function chineseHall(wall: string, roof: string, w = 0.9, d = 0.6): Built {
  const g = group();
  g.add(box(w + 0.1, 0.08, d + 0.1, mat(C.stone), [0, 0.04, 0]));
  g.add(box(w, 0.36, d, mat(wall), [0, 0.26, 0]));
  g.add(hipRoof(w, d, 0.2, mat(roof, { rough: 0.5 }), 0.44));
  g.add(box(w * 0.6, 0.14, d * 0.6, mat(wall), [0, 0.7, 0]));
  g.add(hipRoof(w * 0.6, d * 0.6, 0.16, mat(roof, { rough: 0.5 }), 0.77));
  return { obj: g };
}

function iceberg(): Built {
  const g = group();
  const geo = new THREE.IcosahedronGeometry(0.7, 1);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const n = Math.sin(pos.getX(i) * 7.1 + pos.getZ(i) * 5.3) * 0.08;
    pos.setXYZ(i, pos.getX(i) * (1.3 + n), Math.max(0, y) * 0.9 + n, pos.getZ(i) * (1 + n));
  }
  geo.computeVertexNormals();
  const berg = new THREE.Mesh(geo, mat("#f2fbff", { rough: 0.35 }));
  g.add(berg);
  g.add(box(0.8, 0.28, 0.12, mat("#7fc9ea", { rough: 0.2, metal: 0.2 }), [0, 0.14, 0.72]));
  for (const [x, z] of [[0.75, 0.45], [-0.8, 0.35]] as const) {
    g.add(group(sphere(0.07, mat(C.black), [0, 0.07, 0], 8, [1, 1.4, 1]), sphere(0.045, mat(C.white), [0, 0.07, 0.03], 8, [1, 1.3, 0.8])).translateX(x).translateZ(z));
  }
  return { obj: g };
}

function snowLodge(): Built {
  const g = group();
  g.add(house(0.8, 0.55, 0.36, "#9cc9e4", C.white, "gable", 0.3));
  g.add(dome(0.22, mat(C.white), [0.55, 0, 0.2], 14));
  g.add(box(0.12, 0.12, 0.12, mat("#bfe6f7", { rough: 0.2 }), [-0.55, 0.06, 0.25]));
  g.add(box(0.1, 0.1, 0.1, mat("#bfe6f7", { rough: 0.2 }), [-0.62, 0.05, 0.1]));
  return { obj: g };
}

function jellyDome(): Built {
  const g = group();
  g.add(box(1.0, 0.36, 0.7, mat("#f7e6f1"), [0, 0.18, 0]));
  g.add(dome(0.34, mat("#b98ae6", { rough: 0.2, metal: 0.1, opacity: 0.92 }), [0, 0.36, 0], 20));
  const jelly = group();
  for (let i = 0; i < 5; i++) {
    jelly.add(cyl(0.006, 0.006, 0.18, mat(C.pink), [(i - 2) * 0.03, -0.09, 0], 3));
  }
  jelly.add(dome(0.09, mat(C.pink, { emissive: C.pink }), [0, 0, 0], 12));
  jelly.position.set(0.38, 0.62, 0.3);
  g.add(jelly);
  return { obj: g, tick: (t) => (jelly.position.y = 0.62 + Math.sin(t * 1.3) * 0.06) };
}

function sharkHall(): Built {
  const g = group();
  g.add(box(1.2, 0.4, 0.75, mat("#244f86"), [0, 0.2, 0]));
  g.add(box(1.24, 0.06, 0.79, mat(C.cyan), [0, 0.42, 0]));
  const fin = new THREE.Shape();
  fin.moveTo(-0.22, 0);
  fin.quadraticCurveTo(0.0, 0.2, 0.08, 0.5);
  fin.quadraticCurveTo(0.12, 0.2, 0.25, 0);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false });
  const f = new THREE.Mesh(finGeo, mat("#6d7f94", { rough: 0.4 }));
  f.position.set(0, 0.44, -0.02);
  g.add(f);
  return { obj: g };
}

function station(roof: string, label?: string): Built {
  const g = group();
  g.add(box(0.9, 0.42, 0.6, mat(C.white), [0, 0.21, 0]));
  g.add(box(0.92, 0.1, 0.62, mat(C.glass, { rough: 0.15, metal: 0.2 }), [0, 0.3, 0]));
  const r = torus(0.5, 0.06, mat(roof, { rough: 0.45 }), [0, 0.42, 0], [0, 0, 0], Math.PI, 20);
  r.scale.set(1, 0.4, 3.2);
  g.add(r);
  g.add(box(1.0, 0.05, 0.66, mat(roof), [0, 0.44, 0]));
  if (label) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.2),
      new THREE.MeshStandardMaterial({ map: signTexture(label, roof, "#ffffff"), roughness: 0.6 }),
    );
    sign.position.set(0, 0.6, 0.34);
    g.add(sign);
  }
  return { obj: g };
}

function trailHut(): Built {
  const g = group();
  g.add(box(0.5, 0.06, 0.4, mat(C.wood), [0, 0.2, 0]));
  for (const [x, z] of [[-0.22, -0.17], [0.22, -0.17], [-0.22, 0.17], [0.22, 0.17]] as const) {
    g.add(cyl(0.02, 0.02, 0.5, mat(C.wood), [x, 0.25, z], 5));
  }
  g.add(cone(0.42, 0.3, mat("#c9a25a", { rough: 0.95 }), [0, 0.62, 0], 8));
  return { obj: g };
}

function templeRuin(): Built {
  const g = group();
  const stone = mat("#b9ad8a", { rough: 0.95 });
  g.add(box(0.8, 0.12, 0.6, stone, [0, 0.06, 0]));
  g.add(box(0.6, 0.12, 0.45, stone, [0, 0.18, 0]));
  g.add(box(0.4, 0.3, 0.3, stone, [0, 0.39, 0]));
  g.add(box(0.14, 0.18, 0.02, mat(C.dark), [0, 0.33, 0.16]));
  g.add(sphere(0.1, mat(C.green), [0.3, 0.2, 0.2], 7));
  return { obj: g };
}

function hall(wall: string, roof: string, w = 0.8, d = 0.55, h = 0.38, kind: "hip" | "gable" | "flat" = "hip"): Built {
  return { obj: house(w, d, h, wall, roof, kind) };
}


// --- legend attractions -------------------------------------------------------

function talkingTree(): Built {
  const g = group();
  const bark = mat("#8a6242", { rough: 0.9 });
  g.add(cyl(0.16, 0.24, 0.7, bark, [0, 0.35, 0], 10));
  for (const [x, y, z, r, c] of [[0, 0.95, 0, 0.42, "#3f9a45"], [-0.3, 0.8, 0.1, 0.3, "#4fae4a"], [0.32, 0.82, -0.05, 0.3, "#3a8f40"], [0.05, 1.22, 0.05, 0.28, "#5bb84f"]] as const) {
    g.add(sphere(r, mat(c, { rough: 0.85 }), [x, y, z], 12));
  }
  for (const x of [-0.07, 0.07]) {
    g.add(sphere(0.05, mat(C.white), [x, 0.5, 0.17], 8));
    g.add(sphere(0.025, mat(C.black), [x, 0.5, 0.21], 6));
  }
  g.add(torus(0.06, 0.015, mat("#5a3a22"), [0, 0.38, 0.19], [0, 0, Math.PI], Math.PI, 10));
  return { obj: g };
}

function theatre(): Built {
  const g = group();
  g.add(box(0.9, 0.5, 0.65, mat("#e2553a")));
  g.add(box(0.94, 0.08, 0.69, mat(C.gold), [0, 0.54, 0]));
  g.add(dome(0.3, mat("#2f78d0", { rough: 0.4 }), [0, 0.58, 0], 16, [1.3, 0.8, 1]));
  g.add(box(0.36, 0.3, 0.04, mat("#1b2a3a"), [0, 0.15, 0.33]));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.2),
    new THREE.MeshStandardMaterial({ map: signTexture("WHISKERS THEATRE", "#f08a24", "#ffffff"), roughness: 0.6 }),
  );
  sign.position.set(0, 0.4, 0.34);
  g.add(sign);
  return { obj: g };
}

function villageStation(): Built {
  const g = group();
  g.add(house(0.55, 0.36, 0.3, "#a8733f", "#c8403a", "gable", 0.2));
  g.add(box(0.8, 0.04, 0.2, mat(C.stone), [0, 0.02, 0.3]));
  g.add(cyl(0.02, 0.02, 0.45, mat(C.dark), [0.32, 0.22, 0.3], 5));
  g.add(cyl(0.06, 0.06, 0.02, mat(C.white), [0.32, 0.45, 0.31], 12, [Math.PI / 2, 0, 0]));
  return { obj: g };
}

function activityCentre(): Built {
  const g = group();
  g.add(house(0.6, 0.45, 0.32, "#fbe8c8", "#3f8fd0", "hip", 0.22));
  g.add(box(0.2, 0.2, 0.02, mat(C.orange), [0, 0.12, 0.23]));
  for (const [x, c] of [[-0.4, C.red], [0.4, C.yellow]] as const) g.add(sphere(0.07, mat(c), [x, 0.07, 0.25], 10));
  return { obj: g };
}

function bambooGrove(): Built {
  const g = group();
  g.add(cyl(0.4, 0.42, 0.04, mat("#d9c89a"), [0, 0.02, 0], 16));
  g.add(hipRoof(0.4, 0.3, 0.16, mat(C.roofGreen), 0.36));
  for (const [x, z] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]] as const) g.add(cyl(0.015, 0.015, 0.36, mat(C.red), [x, 0.18, z], 5));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.36 + (i % 2) * 0.06;
    g.add(cyl(0.012, 0.018, 0.55 + (i % 3) * 0.12, mat(C.lime), [Math.cos(a) * r, 0.3, Math.sin(a) * r], 5));
  }
  return { obj: g };
}

function mine(): Built {
  const g = group();
  g.add(sphere(0.38, mat("#a58a64", { rough: 0.95 }), [0, 0.05, -0.05], 9, [1.2, 0.8, 1]));
  const wood = mat(C.wood);
  g.add(box(0.05, 0.3, 0.05, wood, [-0.14, 0.15, 0.3]));
  g.add(box(0.05, 0.3, 0.05, wood, [0.14, 0.15, 0.3]));
  g.add(box(0.36, 0.05, 0.06, wood, [0, 0.31, 0.3]));
  g.add(box(0.22, 0.24, 0.02, mat(C.black), [0, 0.12, 0.29]));
  g.add(box(0.14, 0.08, 0.1, mat(C.grey, { metal: 0.4 }), [0.28, 0.07, 0.45]));
  return { obj: g };
}

function fountainPlaza(tint: string): Built {
  const g = group();
  g.add(cyl(0.5, 0.52, 0.05, mat("#efe6cf"), [0, 0.025, 0], 28));
  g.add(cyl(0.3, 0.32, 0.1, mat(C.stone), [0, 0.07, 0], 24));
  g.add(cyl(0.27, 0.27, 0.02, mat("#5fd0e6", { rough: 0.1, metal: 0.2 }), [0, 0.12, 0], 24));
  g.add(cyl(0.05, 0.07, 0.2, mat(C.white), [0, 0.2, 0], 10));
  const jet = cone(0.06, 0.3, mat("#dff7ff", { rough: 0.1, opacity: 0.8 }), [0, 0.45, 0], 10);
  g.add(jet);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    g.add(cyl(0.01, 0.01, 0.5, mat(C.white), [Math.cos(a) * 0.45, 0.25, Math.sin(a) * 0.45], 4));
    g.add(box(0.12, 0.08, 0.005, mat(i % 2 ? tint : C.yellow), [Math.cos(a) * 0.45 + 0.06, 0.45, Math.sin(a) * 0.45]));
  }
  return { obj: g, tick: (t) => (jet.scale.y = 0.85 + Math.sin(t * 3) * 0.15) };
}

function kiosk(roof: string): Built {
  const g = group();
  g.add(cyl(0.16, 0.16, 0.26, mat(C.white), [0, 0.13, 0], 12));
  g.add(cone(0.24, 0.16, mat(roof), [0, 0.34, 0], 12));
  g.add(sphere(0.04, mat(C.gold), [0, 0.44, 0], 8));
  return { obj: g };
}

function lagoonStage(): Built {
  const g = group();
  g.add(box(0.7, 0.08, 0.4, mat(C.stone), [0, 0.04, 0]));
  g.add(box(0.72, 0.03, 0.42, mat("#2f6fc0"), [0, 0.09, 0]));
  for (const x of [-0.3, 0.3]) g.add(cyl(0.02, 0.02, 0.45, mat(C.dark), [x, 0.3, -0.15], 6));
  g.add(box(0.66, 0.04, 0.04, mat(C.dark), [0, 0.52, -0.15]));
  for (let i = 0; i < 4; i++) g.add(sphere(0.025, mat(C.yellow, { emissive: C.yellow }), [-0.24 + i * 0.16, 0.49, -0.15], 6));
  return { obj: g };
}

function pavilion(): Built {
  const g = group();
  g.add(box(0.95, 0.08, 0.7, mat(C.stone), [0, 0.04, 0]));
  g.add(box(0.8, 0.34, 0.55, mat("#eef5ea"), [0, 0.25, 0]));
  const roof = torus(0.5, 0.05, mat(C.roofGreen, { rough: 0.5 }), [0, 0.42, 0], [0, 0, 0], Math.PI, 24);
  roof.scale.set(1, 0.45, 7);
  g.add(roof);
  g.add(box(1.0, 0.04, 0.66, mat(C.roofGreen), [0, 0.43, 0]));
  return { obj: g };
}

function strandingCentre(): Built {
  const g = group();
  g.add(house(0.8, 0.55, 0.34, C.white, C.teal, "flat"));
  const whale = sphere(0.14, mat("#5c7fa3", { rough: 0.5 }), [0, 0.52, 0], 12, [2.2, 0.8, 0.9]);
  g.add(whale);
  g.add(cone(0.08, 0.14, mat("#5c7fa3"), [0.32, 0.56, 0], 6, [0, 0, -Math.PI / 2]));
  return { obj: g };
}

function summitPlaza(): Built {
  const g = group();
  for (let i = 0; i < 4; i++) {
    g.add(torus(0.18 + i * 0.12, 0.012, mat(i % 2 ? C.white : C.lime), [0, 0.03, 0], [Math.PI / 2, 0, 0], Math.PI * 2, 40));
  }
  g.add(cyl(0.06, 0.08, 0.25, mat(C.stone), [0, 0.12, 0], 10));
  g.add(sphere(0.08, mat(C.green), [0, 0.3, 0], 10));
  return { obj: g };
}

function whyZone(): Built {
  const g = group();
  g.add(house(0.55, 0.4, 0.3, "#d8c69a", "#3d7f45", "hip", 0.24));
  g.add(cyl(0.05, 0.06, 0.6, mat("#b3452e"), [0.38, 0.3, 0.2], 8));
  for (let i = 0; i < 3; i++) g.add(box(0.13, 0.08, 0.13, mat([C.yellow, C.lime, C.orange][i]), [0.38, 0.12 + i * 0.18, 0.2]));
  return { obj: g };
}

function vetCentre(): Built {
  const g = group();
  g.add(house(0.7, 0.5, 0.36, C.white, "#8fd4f2", "flat"));
  g.add(box(0.2, 0.06, 0.02, mat(C.teal), [0, 0.28, 0.26]));
  g.add(box(0.06, 0.2, 0.02, mat(C.teal), [0, 0.28, 0.26]));
  return { obj: g };
}

function explorerRide(): Built {
  const b = spinner(C.orange, C.cyan);
  return b;
}


// --- Marine World south: Dolphin Explorations, Pacific Pier, the Summit cable car terminal ---

/** Annulus sector in the ground plane, extruded up. Angles in plan (0 = +x, π/2 = +z). */
function sector(r0: number, r1: number, a0: number, a1: number, h: number, m: THREE.Material, y = 0) {
  const shape = new THREE.Shape();
  const seg = 24;
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const px = Math.cos(a) * r1;
    const py = -Math.sin(a) * r1;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / seg;
    shape.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = y;
  return mesh;
}

/** Smooth closed blob through plan points, extruded up. */
function blob(pts: [number, number][], h: number, m: THREE.Material, y = 0, grow = 0) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => {
      const d = Math.hypot(x - cx, z - cz) || 1;
      return new THREE.Vector3(x + ((x - cx) / d) * grow, -(z + ((z - cz) / d) * grow), 0);
    }),
    true,
    "centripetal",
  );
  const shape = new THREE.Shape(curve.getPoints(64).map((v) => new THREE.Vector2(v.x, v.y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = y;
  return mesh;
}

function dolphinExplorations(): Built {
  const g = group();
  const water = mat("#39bfe0", { rough: 0.12, metal: 0.15 });
  const stone = mat("#e9e2d0");
  // Stadium: stepped curved rows facing east onto the lagoon (centre of curvature in the pool).
  const c = { x: 1.25, z: 0.2 };
  const stand = group();
  stand.position.set(c.x, 0, c.z);
  for (let i = 0; i < 6; i++) {
    const r = 1.0 + i * 0.17;
    stand.add(sector(r, r + 0.17, Math.PI - 0.95, Math.PI + 0.95, 0.1 + i * 0.09, mat(i % 2 ? C.white : "#3a7fd0", { rough: 0.6 })));
  }
  stand.add(sector(2.02, 2.1, Math.PI - 0.95, Math.PI + 0.95, 0.72, stone));
  // White sail canopy over the upper rows.
  const sail = sector(1.45, 2.12, Math.PI - 0.9, Math.PI + 0.9, 0.04, mat(C.white, { rough: 0.4 }), 0.95);
  stand.add(sail);
  for (const a of [Math.PI - 0.8, Math.PI, Math.PI + 0.8]) {
    stand.add(cyl(0.025, 0.025, 0.28, mat(C.white), [Math.cos(a) * 2.06, 0.84, -Math.sin(a) * 2.06], 6));
  }
  g.add(stand);
  // The lagoon: kidney-shaped pool with a sandy beach, in a stone rim.
  const pool: [number, number][] = [[0.75, -0.9], [1.5, -1.05], [2.1, -0.6], [2.2, 0.3], [1.9, 1.15], [1.2, 1.35], [0.8, 0.8], [1.0, 0.1]];
  g.add(blob(pool, 0.1, stone, 0, 0.12));
  g.add(blob(pool, 0.04, water, 0.08));
  g.add(blob([[1.6, 0.3], [2.05, 0.2], [2.0, 0.9], [1.6, 1.0]], 0.05, mat("#f2dd9a", { rough: 0.95 }), 0.1));
  // Show building to the north and the grey dome to the south-east.
  g.add(house(0.55, 0.4, 0.34, C.white, C.cyan, "flat").translateX(1.4).translateZ(-1.35));
  g.add(dome(0.28, mat("#8a949c", { rough: 0.5 }), [2.1, 0.05, 1.5], 16));
  g.add(box(0.5, 0.1, 0.5, stone, [2.1, 0.05, 1.5]));
  // Dolphins leaping.
  const dolphins = [0, 1, 2].map(() => {
    const d = group(
      sphere(0.07, mat("#7f9bb3", { rough: 0.35 }), [0, 0, 0], 10, [2.4, 0.8, 0.9]),
      cone(0.05, 0.08, mat("#7f9bb3"), [0.02, 0.07, 0], 4),
    );
    g.add(d);
    return d;
  });
  return {
    obj: g,
    tick: (t) => {
      dolphins.forEach((d, i) => {
        const ph = t * 0.8 + i * 2.1;
        const k = (ph % 3) / 3;
        const jump = Math.max(0, Math.sin(k * Math.PI * 2.2));
        d.position.set(1.45 + Math.cos(ph * 0.5) * 0.4, 0.1 + jump * 0.45, 0.1 + Math.sin(ph * 0.5) * 0.7);
        d.rotation.set(0, -ph * 0.5, Math.cos(k * Math.PI * 2.2) * 0.9);
      });
    },
  };
}

function pacificPier(): Built {
  const g = group();
  const pier = group();
  pier.position.set(0.03, 0, 0.26);
  pier.rotation.y = -0.21;
  const stone = mat("#ece6d6");
  const water = mat("#3bbadb", { rough: 0.12, metal: 0.15 });
  const rock = mat("#9b7a58", { rough: 0.95 });
  const deck: [number, number][] = [[-1.85, -0.2], [-1.3, -0.55], [0, -0.62], [1.3, -0.6], [1.85, -0.25], [1.85, 0.35], [1.2, 0.62], [0, 0.6], [-1.4, 0.55], [-1.85, 0.25]];
  pier.add(blob(deck, 0.16, stone));
  pier.add(blob(deck, 0.05, mat(C.white), 0.16, -0.02));
  // Two pools either side of a rocky ridge.
  pier.add(blob([[-1.2, -0.42], [0.9, -0.46], [1.35, -0.3], [0.9, -0.1], [-1.2, -0.12]], 0.03, water, 0.2));
  pier.add(blob([[-0.9, 0.12], [1.0, 0.1], [1.4, 0.3], [1.0, 0.45], [-0.9, 0.42]], 0.03, water, 0.2));
  for (let i = 0; i < 11; i++) {
    const x = -1.25 + i * 0.24;
    const h = 0.14 + ((i * 37) % 7) * 0.025;
    pier.add(sphere(0.13, rock, [x, 0.2 + h * 0.3, -0.02 + ((i * 13) % 5) * 0.012], 7, [1.1, h / 0.13, 0.8]));
  }
  // Seals and sea lions on the rocks.
  const seals = [-0.9, -0.3, 0.35, 0.8].map((x, i) => {
    const s0 = group(
      sphere(0.05, mat(i % 2 ? "#5b4a3c" : "#6d6f73"), [0, 0.05, 0], 8, [1.8, 0.8, 0.9]),
      sphere(0.03, mat(i % 2 ? "#5b4a3c" : "#6d6f73"), [0.08, 0.1, 0], 8),
    );
    s0.position.set(x, 0.3, -0.02);
    s0.rotation.y = i * 1.3;
    pier.add(s0);
    return s0;
  });
  // Lighthouse at the east end.
  const lh = group(
    cyl(0.1, 0.13, 0.2, mat(C.white), [0, 0.1, 0], 12),
    cyl(0.1, 0.11, 0.18, mat(C.red), [0, 0.29, 0], 12),
    cyl(0.09, 0.1, 0.16, mat(C.white), [0, 0.46, 0], 12),
    cyl(0.07, 0.07, 0.1, mat("#fff3b0", { emissive: "#ffe27a" }), [0, 0.59, 0], 10),
    cone(0.1, 0.12, mat(C.red), [0, 0.7, 0], 10),
  );
  lh.position.set(1.5, 0.16, 0.05);
  pier.add(lh);
  // Entrance building with sign at the west end, service huts on the south side.
  pier.add(house(0.45, 0.35, 0.3, C.white, "#2f78d0", "gable", 0.16).translateX(-1.45).translateY(0.16).translateZ(0.1));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.15),
    new THREE.MeshStandardMaterial({ map: signTexture("PACIFIC PIER", "#1f5fae", "#ffffff"), roughness: 0.6 }),
  );
  sign.position.set(-1.45, 0.6, 0.29);
  pier.add(sign);
  for (const x of [-0.7, -0.25]) pier.add(box(0.3, 0.18, 0.2, mat("#d9dde0"), [x, 0.25, 0.72]));
  g.add(pier);
  return {
    obj: g,
    tick: (t) => {
      seals.forEach((s0, i) => (s0.rotation.z = Math.sin(t * 1.5 + i) * 0.12));
    },
  };
}

function cableTerminal(): Built {
  const g = group();
  // Long boarding hall running north from the pin, where the ropes come in.
  g.add(box(0.8, 0.12, 1.9, mat(C.stone), [0, 0.06, -0.8]));
  g.add(box(0.7, 0.42, 1.7, mat(C.white), [0, 0.33, -0.8]));
  g.add(box(0.72, 0.14, 1.72, mat(C.glass, { rough: 0.12, metal: 0.25 }), [0, 0.42, -0.8]));
  const roof = torus(0.42, 0.05, mat(C.red, { rough: 0.45 }), [0, 0.55, -0.8], [0, Math.PI / 2, 0], Math.PI, 20);
  roof.scale.set(1, 0.45, 18);
  g.add(roof);
  g.add(box(0.86, 0.04, 1.84, mat(C.red), [0, 0.56, -0.8]));
  // Bullwheel housing at the north end.
  g.add(box(0.9, 0.3, 0.4, mat("#dfe3e6"), [0, 0.3, -1.8]));
  g.add(torus(0.34, 0.03, mat(C.dark, { metal: 0.5, rough: 0.4 }), [0, 0.5, -1.8], [Math.PI / 2, 0, 0], Math.PI * 2, 28));
  // Parked gondolas inside.
  [C.red, C.yellow, C.blue, C.lime].forEach((col, i) => g.add(box(0.14, 0.13, 0.12, mat(col, { rough: 0.4 }), [0.15, 0.22, -0.2 - i * 0.35])));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.16),
    new THREE.MeshStandardMaterial({ map: signTexture("CABLE CAR", C.red, "#ffffff"), roughness: 0.6 }),
  );
  sign.position.set(0, 0.64, 0.12);
  g.add(sign);
  return { obj: g };
}

const BUILDERS: Record<string, () => Built> = {
  "ferris-wheel": ferrisWheel,
  "ocean-park-tower": oceanParkTower,
  "hair-raiser": hairRaiser,
  "arctic-blast": arcticBlast,
  "sea-life-carousel": () => carousel(C.cyan, C.white, 0.34),
  "merry-go-round": () => carousel(C.red, C.gold, 0.4),
  balloons,
  "flying-swing": () => swingRide(C.magenta, C.cyan, 1.3, 0.8),
  "whirly-bird": () => swingRide(C.orange, C.blue, 0.9, 0.6),
  "crazy-galleon": galleon,
  "wild-twister": () => spinner(C.purple, C.lime),
  "rev-booster": () => spinner(C.red, C.yellow),
  "the-flash": () => pendulum(C.blue),
  "bumper-blaster": bumperHall,
  "the-rapids": rapids,
  "grand-aquarium": grandAquarium,
  "giant-panda-adventure": pandaPavilion,
  "old-hong-kong": oldHongKong,
  "castle-of-redd": castle,
  "toto-the-loco": loco,
  "jungle-of-giants": giantPlants,
  "little-meerkat": () => enclosure("#e7cf98", "#c7a577", "#b38457"),
  "croco-land": () => enclosure("#6db3a0", "#8f8a6a", "#3f6d34"),
  "sloth-and-friends": () => glasshouse(C.green, 0.45, 0.35),
  "whiskers-herbal-valley": () => glasshouse(C.orange),
  "dive-into-local-diversity": () => hall("#e8f4f2", C.teal, 0.6, 0.45, 0.32, "gable"),
  "eco-herbal-trail": trailHut,
  "sichuan-treasures": () => chineseHall("#f3e7cf", C.red),
  "south-pole-spectacular": iceberg,
  "north-pole-encounter": snowLodge,
  "sea-jelly-spectacular": jellyDome,
  "shark-mystique": sharkHall,
  "dolphin-explorations": dolphinExplorations,
  "pacific-pier": pacificPier,
  "marine-mammal-centre": () => hall(C.white, C.cyan, 0.8, 0.55, 0.35, "flat"),
  "expedition-trail": trailHut,
  "reptile-territory": templeRuin,
  "ocean-express-waterfront": () => station(C.teal, "OCEAN EXPRESS"),
  "ocean-express-summit": () => station(C.teal, "OCEAN EXPRESS"),
  "cable-car-waterfront": () => station(C.red, "CABLE CAR"),
  "cable-car-summit": cableTerminal,
  "talking-tree": talkingTree,
  "whiskers-theatre": theatre,
  "village-station": villageStation,
  "whiskers-village": activityCentre,
  "explorer-r": explorerRide,
  "bamboo-zone": bambooGrove,
  "gator-marsh": () => enclosure("#7fb58f", "#8f8a6a", "#3f5d2c"),
  "panda-village": () => enclosure("#b8d98a", "#a58a64", "#b5542e"),
  "marks-mine": mine,
  "ocean-square": () => fountainPlaza(C.blue),
  "conservation-kiosk": () => kiosk(C.green),
  "aqua-city-lagoon": lagoonStage,
  "applause-pavilion": pavilion,
  "waterfront-plaza": () => fountainPlaza(C.cyan),
  "marine-life-stranding": strandingCentre,
  "summit-plaza": summitPlaza,
  "rainforest-why-zone": whyZone,
  "veterinary-centre": vetCentre,
};

/** Yaw per model, so fronts face the default camera (south, +z) or open space. */
const YAW: Record<string, number> = {
  "hair-raiser": 0.25,
  "ferris-wheel": 0.35,
  "crazy-galleon": 0.5,
  "cable-car-waterfront": -0.3,
  "grand-aquarium": -0.15,
};

export type Landmarks = { group: THREE.Group; tick: Tick };

export function buildLandmarks(pois: Poi[]): Landmarks {
  const root = new THREE.Group();
  root.name = "landmarks";
  const ticks: Tick[] = [];
  for (const p of pois) {
    if (p.id.startsWith("escalator-")) continue; // drawn by scene/escalators.ts
    const make = BUILDERS[p.id];
    const built = make ? make() : hall(C.cream, C.red);
    const [x, z] = p.position;
    built.obj.name = p.id;
    built.obj.position.set(x, groundHeight(x, z), z);
    built.obj.rotation.y = YAW[p.id] ?? 0;
    shadows(built.obj);
    root.add(built.obj);
    if (built.tick) ticks.push(built.tick);
  }
  root.add(shadows(entrance()));
  const tick: Tick = (t) => {
    for (const f of ticks) f(t);
  };
  bakeStatic(root, tick);
  return { group: root, tick };
}

/** Main gate by the MTR station, at the bottom of the Waterfront. */
function entrance(): THREE.Object3D {
  const g = group();
  const x = -11.6;
  const z = 9.9;
  g.position.set(x, groundHeight(x, z), z);
  g.rotation.y = 0.2;
  for (const px of [-0.9, 0.9]) {
    g.add(cyl(0.12, 0.14, 0.9, mat(C.white), [px, 0.45, 0], 12));
    g.add(sphere(0.14, mat(C.cyan), [px, 0.98, 0], 12));
  }
  const arch = torus(0.9, 0.07, mat(C.blue, { rough: 0.4 }), [0, 0.75, 0], [0, 0, 0], Math.PI, 32);
  g.add(arch);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.36),
    new THREE.MeshStandardMaterial({ map: signTexture("OCEAN PARK", "#1f6fc4", "#ffffff"), roughness: 0.6, side: THREE.DoubleSide }),
  );
  sign.position.set(0, 1.25, 0.02);
  g.add(sign);
  for (let i = 0; i < 5; i++) g.add(box(0.12, 0.35, 0.3, mat(C.white), [-0.6 + i * 0.3, 0.17, 0.4]));
  return g;
}
