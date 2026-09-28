import * as THREE from "three";
import { ISLANDS } from "./generated/coast";
import {
  chooseProjection,
  fitSide,
  metersPerUnit,
  pointInRing,
  projectGps,
  ringCentroid,
  zoneAt,
  type Affine,
} from "./geo";
import { nearestWalkPoint, routeToPoi, snapToPath, type RouteStep } from "./route";
import { MAJOR_PATHS } from "./generated/paths";
import { ZONE_SEEDS } from "./generated/zones";
import type { Poi, Side, WalkGraph } from "./types";
import { groundHeight, onLand } from "./terrain";
import { DIST_MAX, DIST_MIN, createWorld, pitchFor, type World } from "./world";
import { attachMapControls, PITCH_MAX, type MapCam } from "./controls";

/** Zone colours from the park legend. */
const ZONE_DOT: Record<string, string> = {
  "Whiskers Harbour": "#f08a24",
  "Amazing Asian Animals": "#e2432f",
  "Aqua City": "#e9c85a",
  "Polar Adventure": "#6fb6e4",
  "Thrill Mountain": "#f2c418",
  Rainforest: "#58a83a",
  "Marine World": "#e0368e",
  Waterfront: "#1d7fd0",
  Summit: "#3fa34d",
  "Cable Car": "#e2432f",
  "Ocean Express": "#1497a4",
};

type Cam = MapCam;


export type App = { start: () => void; checks: () => string[] };

export async function createApp(root: HTMLElement, pois: Poi[], walk: WalkGraph): Promise<App> {
  const affines: Record<Side, Affine> = {
    waterfront: fitSide("waterfront", pois),
    summit: fitSide("summit", pois),
  };
  const centers = {
    waterfront: ringCentroid(ISLANDS.waterfront),
    summit: ringCentroid(ISLANDS.summit),
  };

  root.innerHTML = `
    <canvas id="view"></canvas>
    <div id="labels"></div>
    <header id="topbar">
      <div class="brand">
        <span class="mark">${icon("wave")}</span>
        <span class="brand-text"><b>Ocean Park</b><small id="side-label">Whole park</small></span>
      </div>
      <div id="search-wrap">
        ${icon("search")}
        <input id="search" type="search" placeholder="Search rides, animals…" enterkeyhint="search" autocomplete="off" />
        <div id="results"></div>
      </div>
    </header>
    <div id="filters" role="tablist">
      <button type="button" data-cat="all" class="on">All</button>
      <button type="button" data-cat="attraction">Rides &amp; shows</button>
      <button type="button" data-cat="animal">Animals</button>
      <button type="button" data-cat="transport">Transport</button>
    </div>
    <div id="controls">
      <button id="compass" type="button" aria-label="Reset rotation"><span class="needle">${icon("compass")}</span></button>
      <div class="zoom">
        <button id="zoom-in" type="button" aria-label="Zoom in">${icon("plus")}</button>
        <button id="zoom-out" type="button" aria-label="Zoom out">${icon("minus")}</button>
      </div>
      <button id="dim-toggle" type="button" aria-label="Toggle 2D / 3D">2D</button>
      <button id="debug-toggle" type="button" aria-label="GPS debug">GPS</button>
    </div>
    <div id="here"></div>
    <nav id="dock">
      <button class="dock-btn active" data-go="whole" type="button">${icon("park")}<span>Whole park</span></button>
      <button class="dock-btn" data-go="waterfront" type="button">${icon("drop")}<span>Waterfront</span></button>
      <button class="dock-btn" data-go="summit" type="button">${icon("peak")}<span>Summit</span></button>
      <button class="dock-btn" data-go="locate" type="button">${icon("pin")}<span>Locate me</span></button>
    </nav>
    <section id="sheet" aria-live="polite">
      <div class="grab"></div>
      <div class="meta" id="sheet-meta"></div>
      <h2 id="sheet-title"></h2>
      <p id="sheet-body"></p>
      <div class="row">
        <button class="primary" id="sheet-go" type="button">Take me there</button>
        <button class="ghost" id="sheet-close" type="button">Close</button>
      </div>
    </section>
    <form id="debug">
      <h3>Project a coordinate</h3>
      <input id="debug-input" inputmode="decimal" placeholder="22.243171, 114.173586" />
      <div class="row">
        <button class="primary" type="submit">Project</button>
        <button class="ghost" id="debug-close" type="button">Close</button>
      </div>
      <div class="out" id="debug-out"></div>
    </form>
    <pre id="selftest"></pre>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("#view")!;
  // Size the canvas while it is already in the DOM so WebGL can initialize (Safari/Chrome).
  const cssW = Math.max(1, root.clientWidth || window.innerWidth);
  const cssH = Math.max(1, root.clientHeight || window.innerHeight);
  canvas.width = Math.floor(cssW * Math.min(window.devicePixelRatio || 1, 2));
  canvas.height = Math.floor(cssH * Math.min(window.devicePixelRatio || 1, 2));
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const world: World = await createWorld(canvas, pois);
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("perf")) {
    // Dev probe: time full frames with a GPU sync and publish the result on <body data-perf>.
    setTimeout(() => {
      const gl = world.renderer.getContext();
      const time = (f: () => void) => {
        f();
        gl.finish();
        const t0 = performance.now();
        for (let i = 0; i < 10; i++) {
          f();
          gl.finish();
        }
        return ((performance.now() - t0) / 10).toFixed(1);
      };
      const full = time(() => world.frame({ x: cam.x, z: cam.z }, cam.dist, performance.now()));
      world.renderer.shadowMap.enabled = false;
      const noShadow = time(() => world.frame({ x: cam.x, z: cam.z }, cam.dist, performance.now()));
      world.renderer.shadowMap.enabled = true;
      const info = world.renderer.info.render;
      document.body.dataset.perf = JSON.stringify({ full, noShadow, calls: info.calls, tris: info.triangles, w: canvas.width, h: canvas.height });
    }, 1500);
  }

  const labelsEl = root.querySelector<HTMLDivElement>("#labels")!;
  const sideEl = root.querySelector<HTMLDivElement>("#side-label")!;
  const searchEl = root.querySelector<HTMLInputElement>("#search")!;
  const resultsEl = root.querySelector<HTMLDivElement>("#results")!;
  const sheetEl = root.querySelector<HTMLElement>("#sheet")!;
  const hereEl = root.querySelector<HTMLDivElement>("#here")!;
  const debugEl = root.querySelector<HTMLFormElement>("#debug")!;
  const debugOut = root.querySelector<HTMLDivElement>("#debug-out")!;
  const debugInput = root.querySelector<HTMLInputElement>("#debug-input")!;

  // Park footprint: Whiskers Harbour to the Marine World tip, north shore to the main gate.
  const PARK = { x0: -16.8, x1: 15.8, z0: -13.0, z1: 10.6 };
  /** Distance that fits a plan-view box of half-extents (hx across, hz along the view) on screen. */
  const fitDist = (hx: number, hz: number, pitch: number) => {
    const aspect = (canvas.clientWidth || window.innerWidth) / Math.max(1, canvas.clientHeight || window.innerHeight);
    const vHalf = THREE.MathUtils.degToRad(world.camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    // Leave room for the top bar and dock: roughly 80% of the height is usable map.
    const byWidth = hx / Math.tan(hHalf);
    const byDepth = (hz * Math.sin(pitch) + 1.5) / (Math.tan(vHalf) * 0.8);
    return Math.max(byWidth, byDepth);
  };
  /**
   * On wide screens the overview matches the printed map (Waterfront left, Summit right).
   * On tall phone screens it turns a quarter so the park fills the height: Waterfront and the
   * main gate at the bottom, the Summit at the top, the bay on the left.
   */
  type Box = { x0: number; x1: number; z0: number; z1: number };
  /** Frame a plan-view box, turning a quarter when that fills a tall screen much better. */
  const frameBox = (b: Box, margin = 1.08, lean = 0): Cam => {
    const pitch = pitchFor(60);
    const hx = (b.x1 - b.x0) / 2;
    const hz = (b.z1 - b.z0) / 2;
    const flat = fitDist(hx, hz, pitch);
    const turned = fitDist(hz, hx, pitch);
    const turn = turned < flat * 0.8;
    const yaw = turn ? -Math.PI / 2 : 0;
    const dist = THREE.MathUtils.clamp((turn ? turned : flat) * margin, 12, DIST_MAX);
    return { x: (b.x0 + b.x1) / 2 + (turn ? lean : 0), z: (b.z0 + b.z1) / 2 + (turn ? 0 : -lean), yaw, dist, pitch: pitchFor(dist) };
  };
  const baseYaw = () => frameBox(PARK).yaw;
  const wholeView = (): Cam => frameBox(PARK, 1.1);
  const cam: Cam = { x: 0, z: 0, yaw: 0, dist: 80, pitch: pitchFor(80) };
  const WHOLE_AT = 30;
  let fly: { from: Cam; to: Cam; t0: number; dur: number } | null = null;
  let selected: string | null = null;
  let fix: { x: number; z: number; side: Side; accuracy: number; rough: boolean; zone: string | null } | null = null;
  let category: "all" | "attraction" | "animal" | "transport" = "all";
  const allows = (p: Poi) => {
    if (category === "all") return true;
    if (category === "attraction") return p.category === "ride" || p.category === "show" || p.category === "exhibit";
    if (category === "animal") return p.category === "animal";
    return p.category === "transport";
  };
  root.querySelectorAll<HTMLButtonElement>("#filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      category = btn.dataset.cat as typeof category;
      root.querySelectorAll("#filters button").forEach((b) => b.classList.toggle("on", b === btn));
    });
  });

  const focusY = () => groundHeight(cam.x, cam.z) * 0.7;
  const applyCam = () => {
    const pitch = cam.pitch;
    const fy = focusY();
    const horiz = Math.cos(pitch) * cam.dist;
    const px = cam.x + Math.sin(cam.yaw) * horiz;
    const pz = cam.z + Math.cos(cam.yaw) * horiz;
    // Never dip under a hillside when tilted low.
    const y = Math.max(Math.sin(pitch) * cam.dist + fy, groundHeight(px, pz) + 0.8);
    world.camera.position.set(px, y, pz);
    world.camera.lookAt(cam.x, fy, cam.z);
  };

  const flyTo = (x: number, z: number, dist: number, yaw = cam.yaw, pitch = pitchFor(dist), dur = 780) => {
    let dy = yaw - cam.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    controls?.stop();
    fly = {
      from: { ...cam },
      to: { x, z, dist, yaw: cam.yaw + dy, pitch },
      t0: performance.now(),
      dur,
    };
  };
  let controls: ReturnType<typeof attachMapControls> | null = null;

  const presets: Record<string, Cam> = {
    get whole() {
      return wholeView();
    },
    get waterfront() {
      return frameBox({ x0: -16.6, x1: -4.8, z0: -12.8, z1: 10.2 }, 1.04);
    },
    get summit() {
      return frameBox({ x0: -3.6, x1: 15.6, z0: -11.6, z1: 1.6 }, 1.04);
    },
  } as Record<string, Cam>;
  Object.assign(cam, wholeView());

  const setDock = (id: string) => {
    root.querySelectorAll<HTMLButtonElement>(".dock-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.go === id);
    });
  };

  const openSheet = (title: string, meta: string, body: string, go?: () => void, color = "#1497a4") => {
    sheetEl.style.setProperty("--zone", color);
    root.querySelector("#sheet-title")!.textContent = title;
    root.querySelector("#sheet-meta")!.textContent = meta;
    root.querySelector("#sheet-body")!.textContent = body;
    const goBtn = root.querySelector<HTMLButtonElement>("#sheet-go")!;
    goBtn.style.display = go ? "" : "none";
    goBtn.onclick = () => go?.();
    sheetEl.classList.add("open");
  };

  const drawRoute = (steps: RouteStep[] | null) => {
    if (!steps || steps.length === 0) {
      world.setRoute(null);
      return;
    }
    const pts: THREE.Vector3[] = [];
    const push = (x: number, y: number, z: number) => {
      const last = pts[pts.length - 1];
      if (last && last.distanceToSquared(new THREE.Vector3(x, y, z)) < 1e-4) return;
      pts.push(new THREE.Vector3(x, y, z));
    };
    for (const step of steps) {
      if (step.kind === "cable" || step.kind === "ocean-express") {
        const curve = step.kind === "cable" ? world.cableCurve : world.oeCurve;
        for (let i = 0; i <= 16; i++) pushVec(push, curve.getPoint(i / 16));
      } else {
        push(step.ax, groundHeight(step.ax, step.az) + 0.16, step.az);
        push(step.bx, groundHeight(step.bx, step.bz) + 0.16, step.bz);
      }
    }
    world.setRoute(pts);
  };

  const selectPoi = (id: string) => {
    const poi = pois.find((p) => p.id === id);
    if (!poi) return;
    selected = id;
    searchEl.value = "";
    resultsEl.classList.remove("open");
    resultsEl.innerHTML = "";
    const [x, z] = poi.position;
    world.setHighlight({ x, z, color: ZONE_DOT[poi.zone] ?? "#1497a4" });
    flyTo(x, z, 13);
    setDock(poi.side);
    let routeNote = "";
    if (fix) {
      const steps = routeToPoi(walk, [fix.x, fix.z], poi.id);
      drawRoute(steps);
      if (steps) {
        const hops = steps.filter((s) => s.kind !== "walk").map((s) => (s.kind === "cable" ? "Cable Car" : "Ocean Express"));
        routeNote = hops.length ? ` Route uses ${hops.join(" and ")}.` : " Walking route is on the path.";
      }
    } else {
      drawRoute(null);
    }
    openSheet(
      poi.name,
      `${poi.code ? `${poi.code} · ` : ""}${poi.zone} · ${poi.side === "waterfront" ? "The Waterfront" : "The Summit"} · ${poi.id.startsWith("escalator-") ? "Escalator" : (CATEGORY_NAME[poi.category] ?? poi.category)}`,
      poi.blurb + routeNote,
      () => flyTo(x, z, 12),
      ZONE_DOT[poi.zone],
    );
  };

  root.querySelector("#sheet-close")!.addEventListener("click", () => {
    sheetEl.classList.remove("open");
    selected = null;
    world.setHighlight(null);
    drawRoute(null);
  });

  root.querySelectorAll<HTMLButtonElement>(".dock-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go!;
      if (go === "locate") {
        locate();
        return;
      }
      const p = presets[go];
      flyTo(p.x, p.z, p.dist, p.yaw);
      setDock(go);
      sheetEl.classList.remove("open");
    });
  });

  const showResults = (q: string) => {
    const query = q.trim().toLowerCase();
    if (!query) {
      resultsEl.classList.remove("open");
      resultsEl.innerHTML = "";
      return;
    }
    const hits = pois
      .filter((p) => `${p.name} ${p.zone} ${p.category} ${p.code ?? ""} ${p.id.startsWith("escalator-") ? "escalator" : ""}`.toLowerCase().includes(query))
      .slice(0, 12);
    resultsEl.innerHTML = hits
      .map((p) => `<button class="result" data-id="${p.id}" type="button">${p.name}<small>${p.code ? `${p.code} · ` : ""}${p.zone}</small></button>`)
      .join("");
    resultsEl.classList.toggle("open", hits.length > 0);
    resultsEl.querySelectorAll<HTMLButtonElement>(".result").forEach((b) => {
      b.addEventListener("click", () => selectPoi(b.dataset.id!));
    });
  };
  searchEl.addEventListener("input", () => showResults(searchEl.value));
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const first = resultsEl.querySelector<HTMLButtonElement>(".result");
      if (first) selectPoi(first.dataset.id!);
    }
  });

  if (import.meta.env.DEV) {
    // Dev-only: highlight things on the 3D map or the official map and save them for review.
    void import("./devtools").then(({ mountDevTools }) =>
      mountDevTools(root, { world, pois, canvas, camState: () => ({ ...cam }) }),
    );
  }

  const compassEl = root.querySelector<HTMLElement>("#compass .needle")!;
  // True north in model space, from the GPS fit (the printed map is not north-up).
  const north = (() => {
    const a = projectGps(22.24, 114.1735);
    const b = projectGps(22.241, 114.1735);
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  })();
  root.querySelector("#compass")!.addEventListener("click", () => flyTo(cam.x, cam.z, cam.dist, baseYaw(), cam.pitch, 500));
  root.querySelector("#zoom-in")!.addEventListener("click", () =>
    flyTo(cam.x, cam.z, THREE.MathUtils.clamp(cam.dist / 1.7, DIST_MIN, DIST_MAX), cam.yaw, cam.pitch, 420),
  );
  root.querySelector("#zoom-out")!.addEventListener("click", () =>
    flyTo(cam.x, cam.z, THREE.MathUtils.clamp(cam.dist * 1.7, DIST_MIN, DIST_MAX), cam.yaw, cam.pitch, 420),
  );
  // 2D / 3D, like Maps: flat top-down plan, or back to the tilted view.
  const dimBtn = root.querySelector<HTMLButtonElement>("#dim-toggle")!;
  const isFlat = () => cam.pitch > PITCH_MAX - 0.05;
  dimBtn.addEventListener("click", () =>
    flyTo(cam.x, cam.z, cam.dist, cam.yaw, isFlat() ? pitchFor(cam.dist) : PITCH_MAX, 520),
  );

  // --- gestures: Apple Maps–style (see controls.ts) ---
  controls = attachMapControls({
    cam,
    camera: world.camera,
    canvas,
    distMin: DIST_MIN,
    distMax: DIST_MAX,
    bounds: { x0: -30, x1: 30, z0: -24, z1: 22 },
    focusY,
    apply: applyCam,
    interrupt: () => {
      fly = null;
    },
    flyTo: (to, ms = 420) =>
      flyTo(to.x ?? cam.x, to.z ?? cam.z, to.dist ?? cam.dist, to.yaw ?? cam.yaw, to.pitch ?? cam.pitch, ms),
  });

  // --- labels ---
  // Chips are HTML over the canvas. Specs arrive in priority order; each frame they are
  // placed greedily and any chip that would overlap one already placed is hidden.
  type ChipKind = "side" | "zone" | "transport" | "poi";
  type ChipSpec = { key: string; text: string; x: number; z: number; y?: number; zone: string; kind: ChipKind; icon?: string; onTap: () => void };
  const chipNodes = new Map<string, { el: HTMLButtonElement; w: number; h: number }>();
  const chipTaps = new Map<string, () => void>();
  labelsEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button.chip");
    const tap = btn?.dataset.key ? chipTaps.get(btn.dataset.key) : undefined;
    if (tap) {
      e.stopPropagation();
      tap();
    }
  });
  labelsEl.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button.chip")) e.stopPropagation();
  });

  const syncLabels = (specs: ChipSpec[]) => {
    const keep = new Set(specs.map((s) => s.key));
    for (const [k, node] of chipNodes) {
      if (!keep.has(k)) {
        node.el.remove();
        chipNodes.delete(k);
        chipTaps.delete(k);
      }
    }
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const top = 104;
    const bottom = h - 84;
    const v = new THREE.Vector3();
    const placed: [number, number, number, number][] = [];
    for (const spec of specs) {
      let node = chipNodes.get(spec.key);
      if (!node) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = `chip ${spec.kind}`;
        el.dataset.key = spec.key;
        const color = ZONE_DOT[spec.zone] ?? "#0e7c88";
        el.style.setProperty("--zone", color);
        el.innerHTML =
          spec.kind === "poi"
            ? `<span class="glyph">${spec.icon ?? ""}</span><span class="name"></span>`
            : `<span class="name"></span>`;
        el.querySelector(".name")!.textContent = spec.text;
        labelsEl.appendChild(el);
        node = { el, w: el.offsetWidth, h: el.offsetHeight };
        chipNodes.set(spec.key, node);
      }
      chipTaps.set(spec.key, spec.onTap);
      const el = node.el;
      el.classList.toggle("selected", spec.key === selected);
      const lift = spec.y ?? (spec.kind === "poi" ? 0.9 : 0.4);
      v.set(spec.x, groundHeight(spec.x, spec.z) + lift, spec.z).project(world.camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      // Anchor: POI chips sit above their pin; area banners are centred.
      const rx = sx - node.w / 2;
      const ry = spec.kind === "poi" ? sy - node.h - 6 : sy - node.h / 2;
      let visible = v.z < 1 && rx > 4 && rx + node.w < w - 4 && ry > top && ry + node.h < bottom;
      if (visible) {
        const pad = 3;
        for (const [ax, ay, aw, ah] of placed) {
          if (rx < ax + aw + pad && rx + node.w + pad > ax && ry < ay + ah + pad && ry + node.h + pad > ay) {
            visible = false;
            break;
          }
        }
      }
      if (visible) placed.push([rx, ry, node.w, node.h]);
      el.classList.toggle("hidden", !visible);
      el.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
    }
  };

  const zoneCenters = (() => {
    const acc = new Map<string, { x: number; z: number; n: number }>();
    for (const s of ZONE_SEEDS) {
      const a = acc.get(s.zone) ?? { x: 0, z: 0, n: 0 };
      a.x += s.x;
      a.z += s.z;
      a.n++;
      acc.set(s.zone, a);
    }
    const out = new Map<string, [number, number]>();
    for (const [zone, a] of acc) out.set(zone, [a.x / a.n, a.z / a.n]);
    // Nudge a few banners off their busiest pins, like the printed map does.
    const nudge: Record<string, [number, number]> = {
      "Whiskers Harbour": [-10.6, -12.9],
      "Amazing Asian Animals": [-11.2, -6.4],
      "Aqua City": [-11.4, 1.6],
      "Polar Adventure": [-2.4, -3.4],
      "Thrill Mountain": [0.9, -1.0],
      Rainforest: [3.6, -2.6],
      "Marine World": [10.4, -6.8],
    };
    for (const [z, p] of Object.entries(nudge)) out.set(z, p);
    return out;
  })();

  const flyToZone = (zone: string) => {
    const c = zoneCenters.get(zone);
    if (!c) return;
    flyTo(c[0], c[1], 17, cam.yaw);
  };

  const areaChips = (): ChipSpec[] => {
    const cableA = pois.find((p) => p.id === "cable-car-waterfront")!.position;
    const cableB = pois.find((p) => p.id === "cable-car-summit")!.position;
    const oeA = pois.find((p) => p.id === "ocean-express-waterfront")!.position;
    const oeB = pois.find((p) => p.id === "ocean-express-summit")!.position;
    const specs: ChipSpec[] = [
      {
        key: "area-wf",
        text: "The Waterfront",
        x: -14.6,
        z: -4.2,
        y: 2.2,
        zone: "Waterfront",
        kind: "side",
        onTap: () => {
          flyTo(presets.waterfront.x, presets.waterfront.z, presets.waterfront.dist, presets.waterfront.yaw);
          setDock("waterfront");
          openSheet("The Waterfront", "Whiskers Harbour · Amazing Asian Animals · Aqua City", "The lowland side of the park by the main gate: the Grand Aquarium and lagoon, the pandas, Old Hong Kong and the Whiskers Harbour rides.", () =>
            flyTo(presets.waterfront.x, presets.waterfront.z, presets.waterfront.dist, presets.waterfront.yaw),
          );
        },
      },
      {
        key: "area-sm",
        text: "The Summit",
        x: 13.2,
        z: -2.8,
        y: 3.4,
        zone: "Summit",
        kind: "side",
        onTap: () => {
          flyTo(presets.summit.x, presets.summit.z, presets.summit.dist, presets.summit.yaw);
          setDock("summit");
          openSheet("The Summit", "Polar Adventure · Thrill Mountain · Rainforest · Marine World", "The headland over the sea: the polar hub, Thrill Mountain's coasters, the Rainforest and Marine World with the Ferris Wheel and Ocean Park Tower.", () =>
            flyTo(presets.summit.x, presets.summit.z, presets.summit.dist, presets.summit.yaw),
          );
        },
      },
    ];
    for (const [zone, [x, z]] of zoneCenters) {
      specs.push({ key: `zone-${zone}`, text: zone, x, z, y: 0.6, zone, kind: "zone", onTap: () => flyToZone(zone) });
    }
    specs.push(
      {
        key: "area-cc",
        text: "Cable Car",
        x: (cableA[0] + cableB[0]) / 2 - 2,
        z: (cableA[1] + cableB[1]) / 2 - 5.2,
        y: 3.2,
        zone: "Cable Car",
        kind: "transport",
        onTap: () => {
          flyTo((cableA[0] + cableB[0]) / 2, (cableA[1] + cableB[1]) / 2 - 3, 30, cam.yaw);
          openSheet("Cable Car", "Waterfront ↔ Summit", "Gondolas ride from Aqua City up over the hillside and along the bay to Marine World. Allow about 12 minutes each way.", () =>
            selectPoi("cable-car-summit"),
          );
        },
      },
      {
        key: "area-oe",
        text: "Ocean Express",
        x: (oeA[0] + oeB[0]) / 2,
        z: (oeA[1] + oeB[1]) / 2,
        zone: "Ocean Express",
        kind: "transport",
        onTap: () => {
          openSheet("Ocean Express", "Aqua City ↔ Summit", "The funicular runs through the hill, from Aqua City up to the Rainforest by the Summit hub, in about 3 minutes.", () => selectPoi("ocean-express-waterfront"));
        },
      },
    );
    return specs;
  };

  const nearbyChips = (): ChipSpec[] => {
    const pool = pois.filter(allows);
    const max = cam.dist < 14 ? 14 : 10;
    const ranked = pool
      .map((p) => ({ p, d: Math.hypot(p.position[0] - cam.x, p.position[1] - cam.z) }))
      .filter((r) => r.d < cam.dist * 0.9)
      .sort((a, b) => a.d - b.d)
      .slice(0, max);
    const specs: ChipSpec[] = [];
    if (selected) {
      const p = pois.find((q) => q.id === selected);
      if (p) ranked.unshift({ p, d: -1 });
    }
    const seen = new Set<string>();
    for (const { p } of ranked) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      specs.push({
        key: p.id,
        text: p.name.replace(" — Waterfront", "").replace(" — Summit", ""),
        x: p.position[0],
        z: p.position[1],
        y: LABEL_LIFT[p.id],
        zone: p.zone,
        kind: "poi",
        icon: glyph(p.id.startsWith("escalator-") ? "escalator" : p.category),
        onTap: () => selectPoi(p.id),
      });
    }
    // Zone banners stay up at mid zoom, below the pins in priority.
    if (cam.dist > 15) {
      for (const [zone, [x, z]] of zoneCenters) {
        specs.push({ key: `zone-${zone}`, text: zone, x, z, y: 0.6, zone, kind: "zone", onTap: () => flyToZone(zone) });
      }
    }
    return specs;
  };

  // --- GPS ---
  const placeFix = (lat: number, lng: number, accuracy: number) => {
    const hit = chooseProjection(lat, lng, affines, ISLANDS);
    const rough = !Number.isFinite(accuracy) || accuracy > 35;
    const mpu = metersPerUnit(affines[hit.side], lat, lng);
    // Precise outdoor fixes sit on the nearest major walk. A rough fix keeps the zone label.
    const snapped = rough ? null : snapToPath(walk, hit.x, hit.z, hit.side, mpu);
    const x = snapped ? snapped.x : hit.x;
    const z = snapped ? snapped.z : hit.z;
    const zone = rough ? zoneAt(hit.x, hit.z, hit.side) : null;
    fix = { x, z, side: hit.side, accuracy: accuracy || 80, rough, zone };
    const landed = onLand(x, z);
    world.user.visible = true;
    const gy = landed ? groundHeight(x, z) : 0.05;
    world.user.position.set(x, gy, z);
    const radius = Math.max(0.6, (accuracy || 40) / mpu);
    world.accuracyRing.visible = rough;
    world.accuracyRing.position.set(x, gy + 0.08, z);
    world.accuracyRing.scale.set(radius, radius, 1);
    hereEl.style.display = "block";
    hereEl.textContent = rough ? `Near ${zone}` : "You are here";
    if (rough) hereEl.style.bottom = `calc(78px + env(safe-area-inset-bottom))`;
    return { ...hit, x, z, rough, zone, mpu, snapped: !!snapped };
  };

  const locate = () => {
    if (!navigator.geolocation) {
      debugEl.classList.add("open");
      debugOut.textContent = "This browser has no GPS. Paste a lat,lng instead.";
      return;
    }
    hereEl.style.display = "block";
    hereEl.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const hit = placeFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        flyTo(hit.x, hit.z, 18);
        setDock("locate");
      },
      () => {
        hereEl.textContent = "Location unavailable";
        debugEl.classList.add("open");
        debugOut.textContent = "GPS was blocked. Paste a lat,lng to try a point.";
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
    );
  };

  root.querySelector("#debug-toggle")!.addEventListener("click", () => debugEl.classList.toggle("open"));
  root.querySelector("#debug-close")!.addEventListener("click", () => debugEl.classList.remove("open"));
  debugEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const parts = debugInput.value.split(/[,\s]+/).filter(Boolean).map(Number);
    if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) {
      debugOut.textContent = "Use lat, lng — for example 22.243171, 114.173586";
      return;
    }
    const [lat, lng] = parts;
    const hit = placeFix(lat, lng, 8);
    flyTo(hit.x, hit.z, 18);
    debugOut.textContent = [
      `transform  ${hit.side}`,
      `x  ${hit.x.toFixed(2)}`,
      `z  ${hit.z.toFixed(2)}`,
      `on land  ${hit.inside ? "yes" : "no"}`,
      `on path  ${hit.snapped ? "yes" : "no"}`,
      `zone  ${zoneAt(hit.x, hit.z, hit.side)}`,
      `${(hit.mpu).toFixed(1)} m / unit`,
    ].join("\n");
  });

  const sideName = (): { id: string; label: string } => {
    if (cam.dist > WHOLE_AT) return { id: "whole", label: "Whole park" };
    const onWf = pointInRing(cam.x, cam.z, ISLANDS.waterfront);
    const onSm = pointInRing(cam.x, cam.z, ISLANDS.summit);
    if (onWf) return { id: "waterfront", label: "Waterfront" };
    if (onSm) return { id: "summit", label: "Summit" };
    const dw = Math.hypot(cam.x - centers.waterfront[0], cam.z - centers.waterfront[1]);
    const ds = Math.hypot(cam.x - centers.summit[0], cam.z - centers.summit[1]);
    return dw < ds ? { id: "waterfront", label: "Waterfront" } : { id: "summit", label: "Summit" };
  };

  let watchId = 0;
  const start = () => {
    world.resize();
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    if (view && presets[view]) Object.assign(cam, presets[view]);
    const poi = params.get("poi");
    if (poi) {
      const linked = pois.find((p) => p.id === poi);
      if (linked) {
        cam.x = linked.position[0];
        cam.z = linked.position[1];
        cam.dist = 16;
        cam.pitch = pitchFor(16);
      }
    }
    applyCam();
    if (params.get("selftest") === "1") {
      const el = root.querySelector<HTMLElement>("#selftest")!;
      el.classList.add("show");
      el.textContent = checks().join("\n");
    }
    if (poi) selectPoi(poi);
    world.render();
    const gps = params.get("gps");
    if (gps) {
      debugInput.value = gps;
      debugEl.requestSubmit();
    }
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => placeFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 },
      );
    }
    const loop = (now: number) => {
      if (fly) {
        const t = Math.min(1, (now - fly.t0) / fly.dur);
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        // A short bend so the move reads as a curve, not a slide.
        const bend = fly.dur >= 700 ? Math.sin(Math.PI * t) * 0.8 : 0;
        const dx = fly.to.x - fly.from.x;
        const dz = fly.to.z - fly.from.z;
        const len = Math.hypot(dx, dz) || 1;
        cam.x = fly.from.x + dx * e + (-dz / len) * bend * Math.min(1, len * 0.15);
        cam.z = fly.from.z + dz * e + (dx / len) * bend * Math.min(1, len * 0.15);
        cam.yaw = fly.from.yaw + (fly.to.yaw - fly.from.yaw) * e;
        cam.dist = fly.from.dist + (fly.to.dist - fly.from.dist) * e;
        cam.pitch = fly.from.pitch + (fly.to.pitch - fly.from.pitch) * e;
        if (t >= 1) fly = null;
      }
      controls?.update(now);
      applyCam();
      dimBtn.textContent = isFlat() ? "3D" : "2D";
      const side = sideName();
      sideEl.textContent = side.label;
      {
        const rx = Math.cos(cam.yaw);
        const rz = -Math.sin(cam.yaw);
        const ux = -Math.sin(cam.yaw);
        const uz = -Math.cos(cam.yaw);
        const ang = Math.atan2(north.x * rx + north.z * rz, north.x * ux + north.z * uz);
        compassEl.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      }
      if (!fly) setDock(side.id === "whole" ? "whole" : side.id);
      const whole = cam.dist > WHOLE_AT;
      syncLabels(whole ? areaChips() : nearbyChips());
      world.frame({ x: cam.x, z: cam.z }, cam.dist, now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.addEventListener("resize", world.resize);
  };


  const checks = (): string[] => {
    const lines: string[] = [];
    const ok = (name: string, cond: boolean) => lines.push(`${cond ? "PASS" : "FAIL"}  ${name}`);
    const aq = chooseProjection(22.243171, 114.173586, affines, ISLANDS);
    ok("aquarium transform is waterfront", aq.side === "waterfront");
    ok("aquarium point is inside waterfront", aq.inside && pointInRing(aq.x, aq.z, ISLANDS.waterfront));
    ok("aquarium point is not on the summit", !pointInRing(aq.x, aq.z, ISLANDS.summit));
    const near = chooseProjection(22.243171 + 0.00025, 114.173586 + 0.00015, affines, ISLANDS);
    ok("nearby aquarium fix stays on waterfront", near.side === "waterfront" && near.inside);
    const hairPin = pois.find((p) => p.id === "hair-raiser")!;
    const hair = chooseProjection(hairPin.lat, hairPin.lng, affines, ISLANDS);
    ok("hair raiser transform is summit", hair.side === "summit" && Math.hypot(hair.x - hairPin.position[0], hair.z - hairPin.position[1]) < 0.8);
    const ferrisPin = pois.find((p) => p.id === "ferris-wheel")!;
    const ferris = chooseProjection(ferrisPin.lat, ferrisPin.lng, affines, ISLANDS);
    ok("ferris transform is summit", ferris.side === "summit" && Math.hypot(ferris.x - ferrisPin.position[0], ferris.z - ferrisPin.position[1]) < 0.8);
    let zoneMiss = 0;
    for (const p of pois) {
      if (zoneAt(p.position[0], p.position[1], p.side) !== p.zone) zoneMiss++;
    }
    ok("every POI zone matches the paint", zoneMiss === 0);
    if (zoneMiss) {
      for (const p of pois) {
        const z = zoneAt(p.position[0], p.position[1], p.side);
        if (z !== p.zone) lines.push(`  zone ${p.id}: paint ${z} data ${p.zone}`);
      }
    }
    const steps = routeToPoi(walk, pois.find((p) => p.id === "grand-aquarium")!.position, "hair-raiser");
    ok("route aquarium → hair raiser exists", !!steps && steps.length > 0);
    ok(
      "that route uses cable or ocean express",
      !!steps && steps.some((s) => s.kind === "cable" || s.kind === "ocean-express"),
    );
    ok("major paths on both islands", ["waterfront", "summit"].every((side) => MAJOR_PATHS.some((p) => p.side === side && p.draw !== "road")));
    const nearPath = (id: string) => {
      const pin = pois.find((p) => p.id === id)!;
      const hit = chooseProjection(pin.lat, pin.lng, affines, ISLANDS);
      return nearestWalkPoint(walk, hit.x, hit.z, pin.side)?.dist ?? Infinity;
    };
    ok("aquarium GPS near a waterfront path", nearPath("grand-aquarium") < 0.8);
    ok("hair raiser GPS near a summit path", nearPath("hair-raiser") < 0.8);
    ok("ferris GPS near a summit path", nearPath("ferris-wheel") < 0.8);
    ok("triangle budget under 600k", world.triCount < 600000);
    lines.push(`tris ${world.triCount}`);
    const horiz = Math.hypot(world.camera.position.x - cam.x, world.camera.position.z - cam.z);
    const pitchDeg = THREE.MathUtils.radToDeg(Math.atan2(world.camera.position.y, horiz));
    const want = THREE.MathUtils.radToDeg(cam.pitch);
    ok("camera pitch matches the view", Math.abs(pitchDeg - want) < 2);
    lines.push(`pitch ${pitchDeg.toFixed(1)}`);
    return lines;
  };

  void watchId;
  return { start, checks };
}

function pushVec(push: (x: number, y: number, z: number) => void, v: THREE.Vector3) {
  push(v.x, v.y, v.z);
}

const CATEGORY_NAME: Record<string, string> = {
  ride: "Ride",
  animal: "Animal experience",
  show: "Show",
  exhibit: "Attraction",
  transport: "Transport",
};

/** Chip anchor height above ground for tall landmarks, so the pin sits at the top. */
const LABEL_LIFT: Record<string, number> = {
  "ferris-wheel": 4.1,
  "ocean-park-tower": 5.3,
  "hair-raiser": 2.7,
  "grand-aquarium": 1.5,
  "flying-swing": 1.8,
  "crazy-galleon": 1.7,
  "arctic-blast": 1.0,
  "balloons": 1.4,
  "giant-panda-adventure": 1.5,
  "the-flash": 1.4,
  "whirly-bird": 1.4,
};

function glyph(category: string): string {
  const a = `width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
  if (category === "animal")
    return `<svg ${a}><circle cx="7" cy="9" r="1.6" fill="currentColor"/><circle cx="12" cy="6.5" r="1.6" fill="currentColor"/><circle cx="17" cy="9" r="1.6" fill="currentColor"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 1.5-1.5 2-4 2s-4-.5-4-2z" fill="currentColor"/></svg>`;
  if (category === "escalator")
    return `<svg ${a}><path d="M3 19h4l9-11h5"/><path d="M8 13V9M13 8V5"/></svg>`;
  if (category === "transport")
    return `<svg ${a}><path d="M3 5l18-2"/><path d="M12 4v4"/><rect x="6" y="8" width="12" height="10" rx="2"/><path d="M6 13h12"/></svg>`;
  if (category === "exhibit" || category === "show")
    return `<svg ${a}><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg>`;
  return `<svg ${a}><path d="M3 18c3-9 6-12 9-12s4 5 4 8 2 4 5 4"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/></svg>`;
}

function icon(name: string): string {
  const common = `width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  if (name === "wave")
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 19.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M8 10a4 4 0 0 1 8 0"/><path d="M12 3v3"/></svg>`;
  if (name === "search") return `<svg class="search-ico" ${common}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>`;
  if (name === "plus") return `<svg ${common}><path d="M12 5v14M5 12h14"/></svg>`;
  if (name === "minus") return `<svg ${common}><path d="M5 12h14"/></svg>`;
  if (name === "compass")
    return `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2l4 10h-8z" fill="#e2432f"/><path d="M12 22l-4-10h8z" fill="#9aa7ad"/><circle cx="12" cy="12" r="1.6" fill="#fff"/></svg>`;
  if (name === "park") return `<svg ${common}><path d="M4 18c2-6 4-8 8-8s6 2 8 8"/><path d="M12 10V6"/><circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/></svg>`;
  if (name === "drop") return `<svg ${common}><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>`;
  if (name === "peak") return `<svg ${common}><path d="M3 18l6-10 4 6 3-4 5 8z"/></svg>`;
  return `<svg ${common}><circle cx="12" cy="10" r="3"/><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/></svg>`;
}
