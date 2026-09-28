import * as THREE from "three";

/**
 * Apple Maps–style camera controls.
 *
 * Touch
 *   one finger drag ............ pan (the spot under your finger stays under it), with momentum
 *   two fingers pinch .......... zoom around the fingers
 *   two fingers twist .......... rotate around the fingers
 *   two fingers slide up/down .. tilt (up = more 3D, down = flatter)
 *   double tap ................. zoom in there
 *   two-finger tap ............. zoom out
 *   double tap, hold and drag .. one-handed zoom
 * Mouse / trackpad
 *   drag ....................... pan
 *   right-drag, or ⌥/⌃/⌘-drag .. rotate (sideways) and tilt (up/down)
 *   wheel / pinch .............. zoom at the cursor
 *   trackpad two-finger scroll . pan (Safari pinch-rotate gestures also rotate)
 *   double-click ............... zoom in, ⇧ double-click zooms out
 * Keyboard
 *   arrows pan, + / − zoom, ⇧← ⇧→ rotate, ⇧↑ ⇧↓ tilt
 */

export type MapCam = { x: number; z: number; yaw: number; dist: number; pitch: number };

export const PITCH_MIN = THREE.MathUtils.degToRad(18);
export const PITCH_MAX = THREE.MathUtils.degToRad(89.5);

export type ControlsApi = {
  cam: MapCam;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  distMin: number;
  distMax: number;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Height of the plane that drags and zooms anchor to (ground under the target). */
  focusY: () => number;
  /** Place the camera from cam. */
  apply: () => void;
  /** Stop any fly-to animation: the user took over. */
  interrupt: () => void;
  /** Animated move, for double-tap zoom. */
  flyTo: (to: Partial<MapCam>, ms?: number) => void;
};

type Pt = { x: number; y: number };

export function attachMapControls(api: ControlsApi) {
  const { cam, camera, canvas } = api;
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitV = new THREE.Vector3();

  /** Ground point under a client position, on the plane through the focus height. */
  const groundAt = (p: Pt): THREE.Vector3 | null => {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    plane.constant = -api.focusY();
    const hit = ray.ray.intersectPlane(plane, hitV);
    if (!hit) return null;
    // Near the horizon a tiny finger move is a huge ground move: cap how far away we anchor.
    if (hit.distanceTo(camera.position) > cam.dist * 6) return null;
    return hit.clone();
  };

  const clampCam = () => {
    cam.dist = THREE.MathUtils.clamp(cam.dist, api.distMin, api.distMax);
    cam.pitch = THREE.MathUtils.clamp(cam.pitch, PITCH_MIN, PITCH_MAX);
    cam.x = THREE.MathUtils.clamp(cam.x, api.bounds.x0, api.bounds.x1);
    cam.z = THREE.MathUtils.clamp(cam.z, api.bounds.z0, api.bounds.z1);
  };

  /** Change the camera but keep the ground point under `p` fixed on screen. */
  const anchored = (p: Pt, change: () => void) => {
    const before = groundAt(p);
    change();
    clampCam();
    api.apply();
    if (!before) return;
    const after = groundAt(p);
    if (!after) return;
    cam.x += before.x - after.x;
    cam.z += before.z - after.z;
    clampCam();
    api.apply();
  };

  // ---- momentum ----------------------------------------------------------------
  const vel = { x: 0, z: 0, yaw: 0 };
  const trail: { t: number; x: number; z: number; yaw: number }[] = [];
  const record = () => {
    const t = performance.now();
    trail.push({ t, x: cam.x, z: cam.z, yaw: cam.yaw });
    while (trail.length > 2 && t - trail[0].t > 100) trail.shift();
  };
  const release = () => {
    vel.x = vel.z = vel.yaw = 0;
    if (trail.length < 2) return;
    const a = trail[0];
    const b = trail[trail.length - 1];
    const dt = b.t - a.t;
    if (dt < 8 || performance.now() - b.t > 60) return;
    vel.x = (b.x - a.x) / dt;
    vel.z = (b.z - a.z) / dt;
    vel.yaw = (b.yaw - a.yaw) / dt;
    // Keep a flick to a sensible glide for the current zoom.
    const max = cam.dist * 0.0022;
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > max) {
      vel.x *= max / sp;
      vel.z *= max / sp;
    }
    vel.yaw = THREE.MathUtils.clamp(vel.yaw, -0.004, 0.004);
    trail.length = 0;
  };
  const stopMomentum = () => {
    vel.x = vel.z = vel.yaw = 0;
    trail.length = 0;
  };

  // ---- pointers ----------------------------------------------------------------
  const pts = new Map<number, Pt & { x0: number; y0: number; t0: number; type: string }>();
  let mode: "none" | "pan" | "orbit" | "two" | "tilt" | "quickzoom" = "none";
  let panAnchor: THREE.Vector3 | null = null;
  let two = { dist: 0, angle: 0, mid: { x: 0, y: 0 }, rot: 0, decided: false, moved: 0 };
  let lastTap = { t: 0, x: 0, y: 0 };
  let twoTap: { t: number; moved: boolean } | null = null;
  let quick: { y: number; p: Pt } | null = null;

  const list = () => [...pts.values()];
  const midOf = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const beginTwo = () => {
    const [a, b] = list();
    two = { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), mid: midOf(a, b), rot: 0, decided: false, moved: 0 };
    mode = "two";
    twoTap = { t: performance.now(), moved: false };
  };

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointerdown", (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    api.interrupt();
    stopMomentum();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), type: e.pointerType });
    if (pts.size === 2) {
      beginTwo();
      return;
    }
    if (pts.size > 2) return;
    const p = { x: e.clientX, y: e.clientY };
    const mouseOrbit = e.pointerType === "mouse" && (e.button === 2 || e.button === 1 || e.altKey || e.ctrlKey || e.metaKey);
    if (mouseOrbit) {
      mode = "orbit";
      return;
    }
    // Second tap of a double tap: hold and drag to zoom (touch).
    const now = performance.now();
    if (e.pointerType !== "mouse" && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 36) {
      mode = "quickzoom";
      quick = { y: p.y, p };
      return;
    }
    mode = "pan";
    panAnchor = groundAt(p);
    trail.length = 0;
    record();
  });

  canvas.addEventListener("pointermove", (e) => {
    const cur = pts.get(e.pointerId);
    if (!cur) return;
    const prev = { x: cur.x, y: cur.y };
    cur.x = e.clientX;
    cur.y = e.clientY;
    const p = { x: e.clientX, y: e.clientY };

    if (mode === "pan" && pts.size === 1) {
      if (!panAnchor) {
        panAnchor = groundAt(p);
        return;
      }
      const now = groundAt(p);
      if (now) {
        cam.x += panAnchor.x - now.x;
        cam.z += panAnchor.z - now.z;
        clampCam();
        api.apply();
      }
      record();
    } else if (mode === "orbit") {
      cam.yaw -= (p.x - prev.x) * 0.006;
      cam.pitch += (p.y - prev.y) * 0.005;
      clampCam();
      api.apply();
      record();
    } else if (mode === "quickzoom" && quick) {
      const dy = p.y - quick.y;
      quick.y = p.y;
      anchored(quick.p, () => (cam.dist *= Math.exp(-dy * 0.01)));
    } else if ((mode === "two" || mode === "tilt") && pts.size === 2) {
      const [a, b] = list();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = midOf(a, b);
      const dMidX = mid.x - two.mid.x;
      const dMidY = mid.y - two.mid.y;
      two.moved += Math.hypot(dMidX, dMidY) + Math.abs(dist - two.dist);
      if (two.moved > 6 && twoTap) twoTap.moved = true;
      if (!two.decided && two.moved > 10) {
        // Both fingers sliding the same way vertically, side by side, without pinching: tilt.
        const va = { x: a.x - a.x0, y: a.y - a.y0 };
        const vb = { x: b.x - b.x0, y: b.y - b.y0 };
        const vertical = Math.sign(va.y) === Math.sign(vb.y) && Math.abs(va.y) > Math.abs(va.x) * 1.4 && Math.abs(vb.y) > Math.abs(vb.x) * 1.4;
        const sideBySide = Math.abs(a.y - b.y) < Math.abs(a.x - b.x) * 0.9;
        const pinching = Math.abs(dist - Math.hypot(a.x0 - b.x0, a.y0 - b.y0)) > 14;
        mode = vertical && sideBySide && !pinching ? "tilt" : "two";
        two.decided = true;
      }
      if (mode === "tilt") {
        cam.pitch += dMidY * 0.006;
        clampCam();
        api.apply();
      } else {
        let dAng = angle - two.angle;
        if (dAng > Math.PI) dAng -= Math.PI * 2;
        if (dAng < -Math.PI) dAng += Math.PI * 2;
        two.rot += dAng;
        // Rotation needs a small deliberate twist before it engages, like Maps.
        const applyRot = Math.abs(two.rot) > 0.14 ? dAng : 0;
        const k = two.dist > 0 ? dist / two.dist : 1;
        // Pan with the midpoint, then zoom and rotate around it.
        const before = groundAt(two.mid);
        const after = groundAt(mid);
        if (before && after) {
          cam.x += before.x - after.x;
          cam.z += before.z - after.z;
        }
        anchored(mid, () => {
          cam.dist /= k;
          cam.yaw += applyRot;
        });
        record();
      }
      two.dist = dist;
      two.angle = angle;
      two.mid = mid;
    }
  });

  const end = (e: PointerEvent) => {
    const cur = pts.get(e.pointerId);
    if (!cur) return;
    const now = performance.now();
    const moved = Math.hypot(cur.x - cur.x0, cur.y - cur.y0);
    pts.delete(e.pointerId);

    if (pts.size === 1 && (mode === "two" || mode === "tilt")) {
      // Lifting one finger: continue as a one-finger pan from here without a jump.
      if (twoTap && !twoTap.moved && now - twoTap.t < 280) {
        const [rest] = list();
        const at = midOf(rest, cur);
        zoomBy(at, 2);
        twoTap = null;
      }
      mode = "pan";
      const [rest] = list();
      panAnchor = groundAt(rest);
      trail.length = 0;
      return;
    }
    if (pts.size > 0) return;

    if (mode === "pan" || mode === "orbit" || mode === "two") release();
    const tapped = mode === "pan" && moved < 8 && now - cur.t0 < 260;
    if (mode === "quickzoom") {
      if (quick && Math.abs(cur.y - cur.y0) < 8) zoomBy({ x: cur.x, y: cur.y }, 0.5);
      lastTap = { t: 0, x: 0, y: 0 };
    } else if (tapped && cur.type !== "mouse") {
      lastTap = { t: now, x: cur.x, y: cur.y };
    }
    mode = "none";
    panAnchor = null;
    quick = null;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  /** Animated zoom by factor k (0.5 = in 2×) keeping the tapped spot under the finger. */
  const zoomBy = (p: Pt, k: number) => {
    const g = groundAt(p);
    const dist = THREE.MathUtils.clamp(cam.dist * k, api.distMin, api.distMax);
    const kk = dist / cam.dist;
    if (!g) {
      api.flyTo({ dist }, 360);
      return;
    }
    api.flyTo({ x: g.x + (cam.x - g.x) * kk, z: g.z + (cam.z - g.z) * kk, dist }, 360);
  };

  canvas.addEventListener("dblclick", (e) => {
    e.preventDefault();
    zoomBy({ x: e.clientX, y: e.clientY }, e.shiftKey ? 2 : 0.5);
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      api.interrupt();
      stopMomentum();
      const p = { x: e.clientX, y: e.clientY };
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * px;
      const dy = e.deltaY * px;
      if (e.ctrlKey) {
        // Trackpad pinch.
        anchored(p, () => (cam.dist *= Math.exp(dy * 0.012)));
        return;
      }
      const trackpadScroll = e.deltaMode === 0 && (Math.abs(dx) > 0.5 || (Math.abs(dy) < 40 && !Number.isInteger(dy)));
      if (trackpadScroll) {
        const r = canvas.getBoundingClientRect();
        const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const a = groundAt(c);
        const b = groundAt({ x: c.x + dx, y: c.y + dy });
        if (a && b) {
          cam.x += b.x - a.x;
          cam.z += b.z - a.z;
          clampCam();
          api.apply();
        }
        return;
      }
      anchored(p, () => (cam.dist *= Math.exp(dy * 0.0016)));
    },
    { passive: false },
  );

  // Safari trackpad pinch + rotate.
  type GestureEv = Event & { scale: number; rotation: number; clientX: number; clientY: number };
  let gesture = { scale: 1, rotation: 0 };
  canvas.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    api.interrupt();
    gesture = { scale: 1, rotation: 0 };
  });
  canvas.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    const g = e as GestureEv;
    const p = { x: g.clientX, y: g.clientY };
    const k = g.scale / gesture.scale;
    const rot = THREE.MathUtils.degToRad(g.rotation - gesture.rotation);
    gesture = { scale: g.scale, rotation: g.rotation };
    anchored(p, () => {
      cam.dist /= k;
      cam.yaw += rot;
    });
  });
  canvas.addEventListener("gestureend", (e) => e.preventDefault());

  // Keyboard.
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const r = canvas.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const step = 80;
    let handled = true;
    if (e.shiftKey && e.key === "ArrowLeft") cam.yaw += 0.12;
    else if (e.shiftKey && e.key === "ArrowRight") cam.yaw -= 0.12;
    else if (e.shiftKey && e.key === "ArrowUp") cam.pitch -= 0.08;
    else if (e.shiftKey && e.key === "ArrowDown") cam.pitch += 0.08;
    else if (e.key.startsWith("Arrow")) {
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!;
      const a = groundAt(c);
      const b = groundAt({ x: c.x + d[0], y: c.y + d[1] });
      if (a && b) api.flyTo({ x: cam.x + b.x - a.x, z: cam.z + b.z - a.z }, 220);
      return;
    } else if (e.key === "+" || e.key === "=") zoomBy(c, 0.6);
    else if (e.key === "-" || e.key === "_") zoomBy(c, 1.6);
    else handled = false;
    if (handled) {
      e.preventDefault();
      api.interrupt();
      clampCam();
      api.apply();
    }
  });

  let lastT = performance.now();
  return {
    /** Momentum, called every frame. */
    update(now: number) {
      const dt = Math.min(48, now - lastT);
      lastT = now;
      if (mode !== "none") return;
      if (Math.abs(vel.x) + Math.abs(vel.z) > 1e-5 || Math.abs(vel.yaw) > 1e-6) {
        cam.x += vel.x * dt;
        cam.z += vel.z * dt;
        cam.yaw += vel.yaw * dt;
        const decay = Math.exp(-dt / 260);
        vel.x *= decay;
        vel.z *= decay;
        vel.yaw *= decay;
        clampCam();
      }
    },
    stop: stopMomentum,
    clamp: clampCam,
  };
}
