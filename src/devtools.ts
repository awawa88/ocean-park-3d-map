import * as THREE from "three";
import { MAP_H, MAP_W, toModel, toPixel } from "./layout";
import type { Poi } from "./types";
import type { World } from "./world";

/**
 * Dev feedback tool. Freeze the 3D view or open the official interactive map,
 * draw highlights or drop numbered pins, add a note, and save. The dev server
 * writes feedback/<stamp>.png + .json (with model x,z, sheet pixels and the
 * nearest attractions for every mark) so the fix can be found from the file.
 */

type Tab = "3d" | "official";
type Mark = { kind: "stroke" | "pin"; color: string; pts: [number, number][] };
type Base = {
  image: CanvasImageSource;
  w: number;
  h: number;
  /** Base pixel → model x,z (null if it misses the ground). */
  toModel: (px: number, py: number) => [number, number] | null;
  marks: Mark[];
  view: { s: number; tx: number; ty: number };
  meta: Record<string, unknown>;
};

export type DevHooks = {
  world: World;
  pois: Poi[];
  canvas: HTMLCanvasElement;
  camState: () => Record<string, number>;
};

const COLORS = ["#ff2d55", "#ffcc00", "#0a84ff"];

export function mountDevTools(root: HTMLElement, hooks: DevHooks) {
  const btn = document.createElement("button");
  btn.id = "dev-toggle";
  btn.type = "button";
  btn.textContent = "DEV";
  btn.title = "Highlight something to fix";
  root.querySelector("#controls")?.appendChild(btn);

  const panel = document.createElement("section");
  panel.id = "devtool";
  panel.innerHTML = `
    <header>
      <div class="tabs">
        <button data-tab="3d" class="on" type="button">3D map</button>
        <button data-tab="official" type="button">Official map</button>
      </div>
      <div class="tools">
        <button data-tool="draw" class="on" type="button" title="Draw">✏️</button>
        <button data-tool="pin" type="button" title="Drop a numbered pin">📍</button>
        <button data-tool="pan" type="button" title="Pan / zoom">✋</button>
        <span class="swatches">${COLORS.map((c, i) => `<button class="sw${i ? "" : " on"}" data-color="${c}" style="--c:${c}" type="button"></button>`).join("")}</span>
        <button data-act="undo" type="button" title="Undo">↶</button>
        <button data-act="clear" type="button" title="Clear">Clear</button>
        <label class="only-official"><input type="checkbox" id="dev-pins" checked /> 3D pins</label>
        <button data-act="download" class="only-official" type="button" title="Download the latest official map">⬇︎ Update map</button>
        <button data-act="close" class="close" type="button" title="Close">✕</button>
      </div>
    </header>
    <div class="stage"><canvas></canvas><div class="status"></div></div>
    <footer>
      <textarea id="dev-note" rows="2" placeholder="What should change? Refer to pins by number, e.g. “1: Old Hong Kong should be here”."></textarea>
      <button data-act="save" class="save" type="button">Save for Claude</button>
    </footer>
  `;
  root.appendChild(panel);

  const stage = panel.querySelector<HTMLDivElement>(".stage")!;
  const view = stage.querySelector("canvas")!;
  const ctx = view.getContext("2d")!;
  const status = stage.querySelector<HTMLDivElement>(".status")!;
  const note = panel.querySelector<HTMLTextAreaElement>("#dev-note")!;
  const pinsBox = panel.querySelector<HTMLInputElement>("#dev-pins")!;

  let tab: Tab = "3d";
  let tool: "draw" | "pin" | "pan" = "draw";
  let color = COLORS[0];
  const bases: Partial<Record<Tab, Base>> = {};

  const say = (msg: string, sticky = false) => {
    status.textContent = msg;
    status.classList.add("show");
    if (!sticky) setTimeout(() => status.classList.remove("show"), 3200);
  };

  // ---- bases ----------------------------------------------------------------

  const snapshot3d = (): Base => {
    const { world, canvas } = hooks;
    world.render();
    const img = new Image();
    img.src = canvas.toDataURL("image/png");
    const cam = world.camera.clone();
    const w = canvas.width;
    const h = canvas.height;
    return {
      image: img,
      w,
      h,
      toModel: (px, py) => {
        const hit = world.pick((px / w) * 2 - 1, -(py / h) * 2 + 1, cam);
        return hit ? [hit.x, hit.z] : null;
      },
      marks: [],
      view: { s: 1, tx: 0, ty: 0 },
      meta: { camera: hooks.camState(), url: location.href },
    };
  };

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => fail(new Error(`could not load ${src}`));
      img.src = src;
    });

  /** Stitch the live tiles from the official site (proxied by the dev server) and save them to refs/. */
  const downloadOfficial = async (): Promise<HTMLImageElement> => {
    const cfg = (await (await fetch("/__dev/official/config")).json()) as { width: number; height: number; tile: number; level: number; version: string; error?: string };
    if (cfg.error) throw new Error(cfg.error);
    const cols = Math.ceil(cfg.width / cfg.tile);
    const rows = Math.ceil(cfg.height / cfg.tile);
    const c = document.createElement("canvas");
    c.width = cfg.width;
    c.height = cfg.height;
    const g = c.getContext("2d")!;
    let done = 0;
    const jobs: Promise<void>[] = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        jobs.push(
          loadImage(`/__dev/official/tile/${cfg.level}/${r}/${col}`).then((img) => {
            g.drawImage(img, col * cfg.tile, r * cfg.tile);
            done++;
            say(`Downloading official map… ${done}/${rows * cols} tiles`, true);
          }),
        );
      }
    }
    await Promise.all(jobs);
    const png = c.toDataURL("image/png");
    await fetch("/__dev/official/map.png", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ png }) });
    say(`Official map ${cfg.version} saved to refs/op_sheet_2678.png`);
    return loadImage(`/__dev/official/map.png?t=${Date.now()}`);
  };

  const officialBase = async (fresh = false): Promise<Base> => {
    let img: HTMLImageElement;
    try {
      if (fresh) throw new Error("fresh");
      img = await loadImage(`/__dev/official/map.png?t=${Date.now()}`);
    } catch {
      img = await downloadOfficial();
    }
    return {
      image: img,
      w: MAP_W,
      h: MAP_H,
      toModel: (px, py) => toModel(px, py),
      marks: bases.official?.marks ?? [],
      view: { s: 1, tx: 0, ty: 0 },
      meta: { sheet: "refs/op_sheet_2678.png" },
    };
  };

  // ---- view ------------------------------------------------------------------

  const fit = (b: Base) => {
    const cw = view.width;
    const ch = view.height;
    const s = Math.min(cw / b.w, ch / b.h);
    b.view = { s, tx: (cw - b.w * s) / 2, ty: (ch - b.h * s) / 2 };
  };

  const resize = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.max(1, Math.round(r.width * dpr));
    view.height = Math.max(1, Math.round(r.height * dpr));
    for (const b of Object.values(bases)) if (b) fit(b);
    draw();
  };

  const drawMarks = (g: CanvasRenderingContext2D, b: Base, scale: number) => {
    b.marks.forEach((m, i) => {
      g.strokeStyle = m.color;
      g.fillStyle = m.color;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.lineWidth = 5 / scale;
      if (m.kind === "stroke" && m.pts.length > 1) {
        g.beginPath();
        g.moveTo(m.pts[0][0], m.pts[0][1]);
        for (const p of m.pts.slice(1)) g.lineTo(p[0], p[1]);
        g.stroke();
      }
      const [x, y] = m.pts[0];
      const r = 13 / scale;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 2.5 / scale;
      g.strokeStyle = "#fff";
      g.stroke();
      g.fillStyle = "#fff";
      g.font = `800 ${15 / scale}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(i + 1), x, y + 0.5 / scale);
    });
  };

  const drawPins = (g: CanvasRenderingContext2D, scale: number) => {
    g.font = `700 ${11 / scale}px system-ui, sans-serif`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    for (const p of hooks.pois) {
      const [px, py] = toPixel(p.position[0], p.position[1]);
      g.beginPath();
      g.arc(px, py, 5 / scale, 0, Math.PI * 2);
      g.fillStyle = p.id.startsWith("escalator-") ? "#0a84ff" : "#111";
      g.fill();
      g.lineWidth = 2 / scale;
      g.strokeStyle = "#fff";
      g.stroke();
      const label = p.code ?? p.name.slice(0, 14);
      g.lineWidth = 3 / scale;
      g.strokeText(label, px + 7 / scale, py);
      g.fillStyle = "#111";
      g.fillText(label, px + 7 / scale, py);
    }
  };

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1c2328";
    ctx.fillRect(0, 0, view.width, view.height);
    const b = bases[tab];
    if (!b) return;
    const { s, tx, ty } = b.view;
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(b.image, 0, 0, b.w, b.h);
    if (tab === "official" && pinsBox.checked) drawPins(ctx, s);
    drawMarks(ctx, b, s);
  }

  // ---- input -----------------------------------------------------------------

  const toBase = (e: PointerEvent | WheelEvent, b: Base): [number, number] => {
    const r = view.getBoundingClientRect();
    const dpr = view.width / r.width;
    const x = (e.clientX - r.left) * dpr;
    const y = (e.clientY - r.top) * dpr;
    return [(x - b.view.tx) / b.view.s, (y - b.view.ty) / b.view.s];
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let active: Mark | null = null;
  let pinch = 0;

  view.addEventListener("pointerdown", (e) => {
    const b = bases[tab];
    if (!b) return;
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers cannot be captured */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size > 1) {
      active = null;
      const [a, c] = [...pointers.values()];
      pinch = Math.hypot(a.x - c.x, a.y - c.y);
      return;
    }
    if (tool === "draw") {
      active = { kind: "stroke", color, pts: [toBase(e, b)] };
      b.marks.push(active);
    } else if (tool === "pin") {
      b.marks.push({ kind: "pin", color, pts: [toBase(e, b)] });
      draw();
    }
  });
  view.addEventListener("pointermove", (e) => {
    const b = bases[tab];
    const prev = pointers.get(e.pointerId);
    if (!b || !prev) return;
    const dpr = view.width / view.getBoundingClientRect().width;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, c] = [...pointers.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (pinch) zoomAt((a.x + c.x) / 2, (a.y + c.y) / 2, d / pinch, b);
      pinch = d;
      b.view.tx += ((e.clientX - prev.x) * dpr) / 2;
      b.view.ty += ((e.clientY - prev.y) * dpr) / 2;
      draw();
      return;
    }
    if (active) {
      active.pts.push(toBase(e, b));
      draw();
    } else if (tool === "pan") {
      b.view.tx += (e.clientX - prev.x) * dpr;
      b.view.ty += (e.clientY - prev.y) * dpr;
      draw();
    }
  });
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    const b = bases[tab];
    if (active && b && active.pts.length < 3) {
      // A tap with the pen is a pin.
      active.kind = "pin";
    }
    active = null;
    draw();
  };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);

  const zoomAt = (clientX: number, clientY: number, k: number, b: Base) => {
    const r = view.getBoundingClientRect();
    const dpr = view.width / r.width;
    const x = (clientX - r.left) * dpr;
    const y = (clientY - r.top) * dpr;
    const s = THREE.MathUtils.clamp(b.view.s * k, 0.05, 8);
    const kk = s / b.view.s;
    b.view.tx = x - (x - b.view.tx) * kk;
    b.view.ty = y - (y - b.view.ty) * kk;
    b.view.s = s;
  };
  view.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const b = bases[tab];
      if (!b) return;
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015), b);
      draw();
    },
    { passive: false },
  );

  // ---- save ------------------------------------------------------------------

  const describe = (b: Base) =>
    b.marks.map((m, i) => {
      const step = Math.max(1, Math.floor(m.pts.length / 24));
      const pts = m.pts.filter((_, k) => k % step === 0 || k === m.pts.length - 1);
      const model = pts.map(([x, y]) => b.toModel(x, y)).filter((p): p is [number, number] => !!p);
      const cx = model.length ? model.reduce((s, p) => s + p[0], 0) / model.length : null;
      const cz = model.length ? model.reduce((s, p) => s + p[1], 0) / model.length : null;
      const nearest =
        cx === null || cz === null
          ? []
          : hooks.pois
              .map((p) => ({ p, d: Math.hypot(p.position[0] - cx, p.position[1] - cz) }))
              .sort((a, c) => a.d - c.d)
              .slice(0, 3)
              .map(({ p, d }) => `${p.code ? `${p.code} ` : ""}${p.name} (${d.toFixed(1)})`);
      const round = (v: number) => Math.round(v * 1000) / 1000;
      return {
        n: i + 1,
        kind: m.kind,
        color: m.color,
        model_center: cx === null || cz === null ? null : [round(cx), round(cz)],
        sheet_px_center: cx === null || cz === null ? null : toPixel(cx, cz).map(Math.round),
        model_path: model.map(([x, z]) => [round(x), round(z)]),
        nearest,
      };
    });

  /** The saved image: the base with marks, cropped around the marks on the big official sheet. */
  const compose = (b: Base): string => {
    let x0 = 0;
    let y0 = 0;
    let w = b.w;
    let h = b.h;
    if (tab === "official" && b.marks.length) {
      const all = b.marks.flatMap((m) => m.pts);
      const pad = 260;
      x0 = Math.max(0, Math.min(...all.map((p) => p[0])) - pad);
      y0 = Math.max(0, Math.min(...all.map((p) => p[1])) - pad);
      w = Math.min(b.w, Math.max(...all.map((p) => p[0])) + pad) - x0;
      h = Math.min(b.h, Math.max(...all.map((p) => p[1])) + pad) - y0;
    }
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    const g = c.getContext("2d")!;
    g.translate(-x0, -y0);
    g.drawImage(b.image, 0, 0, b.w, b.h);
    if (tab === "official" && pinsBox.checked) drawPins(g, 1);
    drawMarks(g, b, 1);
    return c.toDataURL("image/png");
  };

  const save = async () => {
    const b = bases[tab];
    if (!b) return;
    if (!b.marks.length && !note.value.trim()) {
      say("Draw a highlight or write a note first.");
      return;
    }
    say("Saving…", true);
    const payload = {
      view: tab === "3d" ? "3D map" : "Official map",
      note: note.value.trim(),
      marks: describe(b),
      ...b.meta,
      image: compose(b),
    };
    const r = await fetch("/__dev/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const out = (await r.json()) as { saved?: string; error?: string };
    if (!r.ok || !out.saved) {
      say(`Save failed: ${out.error ?? r.status}`);
      return;
    }
    say(`Saved ${out.saved}. Tell Claude “check the map feedback”.`);
    b.marks = [];
    note.value = "";
    draw();
  };

  // ---- wiring ----------------------------------------------------------------

  const setTab = async (next: Tab, fresh = false) => {
    tab = next;
    panel.dataset.tab = next;
    panel.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === next));
    if (next === "official" && (!bases.official || fresh)) {
      say("Loading official map…", true);
      try {
        bases.official = await officialBase(fresh);
        fit(bases.official);
        say("Official map loaded. Draw on it, or pinch / scroll to zoom.");
      } catch (err) {
        say(`Could not load the official map: ${err instanceof Error ? err.message : err}`);
      }
    }
    draw();
  };

  const open = () => {
    panel.classList.add("open");
    bases["3d"] = snapshot3d();
    resize();
    const img = bases["3d"].image as HTMLImageElement;
    img.onload = () => {
      fit(bases["3d"]!);
      draw();
    };
    void setTab(tab);
  };

  btn.addEventListener("click", open);
  panel.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((x) =>
    x.addEventListener("click", () => void setTab(x.dataset.tab as Tab)),
  );
  panel.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((x) =>
    x.addEventListener("click", () => {
      tool = x.dataset.tool as typeof tool;
      panel.querySelectorAll("[data-tool]").forEach((y) => y.classList.toggle("on", y === x));
    }),
  );
  panel.querySelectorAll<HTMLButtonElement>(".sw").forEach((x) =>
    x.addEventListener("click", () => {
      color = x.dataset.color!;
      panel.querySelectorAll(".sw").forEach((y) => y.classList.toggle("on", y === x));
    }),
  );
  pinsBox.addEventListener("change", draw);
  panel.querySelector('[data-act="undo"]')!.addEventListener("click", () => {
    bases[tab]?.marks.pop();
    draw();
  });
  panel.querySelector('[data-act="clear"]')!.addEventListener("click", () => {
    const b = bases[tab];
    if (b) b.marks = [];
    draw();
  });
  panel.querySelector('[data-act="download"]')!.addEventListener("click", () => void setTab("official", true));
  panel.querySelector('[data-act="close"]')!.addEventListener("click", () => panel.classList.remove("open"));
  panel.querySelector('[data-act="save"]')!.addEventListener("click", () => void save());
  new ResizeObserver(() => {
    if (panel.classList.contains("open")) resize();
  }).observe(stage);
  // Keep map gestures from leaking to the 3D canvas underneath.
  panel.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
}
