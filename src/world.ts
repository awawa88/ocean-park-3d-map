import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildEscalators } from "./scene/escalators";
import { buildGround, setWaterFog } from "./scene/ground";
import { buildLandmarks } from "./scene/landmarks";
import { buildPaths, routeGeometry } from "./scene/paths";
import { buildTransport } from "./scene/transport";
import { buildFiller, buildVegetation, clearanceFor } from "./scene/vegetation";
import { groundHeight } from "./terrain";
import type { Poi } from "./types";

/** Camera pitch eases from a low three-quarter view up close to a steeper map view far out. */
const PITCH_NEAR = THREE.MathUtils.degToRad(42);
const PITCH_FAR = THREE.MathUtils.degToRad(56);
export const DIST_MIN = 7;
export const DIST_MAX = 150;
export function pitchFor(dist: number): number {
  const t = THREE.MathUtils.smoothstep(dist, 10, 90);
  return PITCH_NEAR + (PITCH_FAR - PITCH_NEAR) * t;
}

export type World = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  user: THREE.Group;
  accuracyRing: THREE.Mesh;
  route: THREE.Mesh;
  cableCurve: THREE.CatmullRomCurve3;
  oeCurve: THREE.CatmullRomCurve3;
  triCount: number;
  resize: () => void;
  render: () => void;
  /** Per-frame update: animation, shadow framing, fog. */
  frame: (target: { x: number; z: number }, dist: number, now: number) => void;
  setRoute: (pts: THREE.Vector3[] | null) => void;
  /** Ground point under normalised device coords for a given camera (terrain or sea). */
  pick: (ndcX: number, ndcY: number, cam: THREE.Camera) => THREE.Vector3 | null;
  /** Pulsing ring on the ground under the selected place. */
  setHighlight: (at: { x: number; z: number; color: string } | null) => void;
};

function countTris(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    if (!pos) return;
    const tris = geo.index ? geo.index.count / 3 : pos.count / 3;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    n += tris * Math.max(1, inst);
  });
  return Math.round(n);
}

/** Sky dome: a vertical gradient with a warm glow toward the sun. */
function sky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color("#5fb4ea") },
      uHorizon: { value: new THREE.Color("#d9f1fb") },
      uGlow: { value: new THREE.Color("#fff4dc") },
      uSun: { value: new THREE.Vector3(-0.45, 0.35, 0.8).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
        float s = max(0.0, dot(normalize(vDir), uSun));
        col = mix(col, uGlow, pow(s, 6.0) * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

function userMarker(): THREE.Group {
  const g = new THREE.Group();
  g.visible = false;
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 32),
    new THREE.MeshBasicMaterial({ color: "#1a73e8", transparent: true, opacity: 0.18, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.08;
  halo.name = "halo";
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 28), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }));
  ring.position.y = 0.12;
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 28), new THREE.MeshStandardMaterial({ color: "#1a73e8", roughness: 0.3 }));
  dot.position.y = 0.14;
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshStandardMaterial({ color: "#1a73e8", roughness: 0.25 }));
  pin.position.y = 0.75;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
  stem.position.y = 0.42;
  g.add(halo, ring, dot, stem, pin);
  for (const m of [ring, dot, pin, stem]) m.castShadow = true;
  return g;
}

export async function createWorld(canvas: HTMLCanvasElement, pois: Poi[]): Promise<World> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  } catch (err) {
    throw new Error(
      `WebGL failed to start (${err instanceof Error ? err.message : String(err)}). Try another browser or turn on hardware acceleration.`,
    );
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color("#d6eff9");
  scene.background = fogColor.clone();
  scene.fog = new THREE.Fog(fogColor, 80, 260);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 900);
  camera.position.set(0, 60, 50);
  camera.lookAt(0, 0, 0);

  scene.add(sky());
  const hemi = new THREE.HemisphereLight("#e4f3ff", "#6f8f55", 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d8", 2.5);
  const SUN_DIR = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const ground = await buildGround();
  scene.add(ground.terrain, ground.water, ground.lagoon);
  scene.add(buildPaths());
  const clear = clearanceFor(pois);
  scene.add(buildVegetation(ground.masks, pois, clear));
  scene.add(buildFiller(ground.masks, clear));
  const landmarks = buildLandmarks(pois);
  scene.add(landmarks.group);
  const transport = buildTransport(pois);
  scene.add(transport.group);
  const escalators = buildEscalators();
  scene.add(escalators.group);

  const user = userMarker();
  scene.add(user);

  const accuracyRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 48),
    new THREE.MeshBasicMaterial({ color: "#1a73e8", transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  accuracyRing.rotation.x = -Math.PI / 2;
  accuracyRing.visible = false;
  scene.add(accuracyRing);

  const routeMat = new THREE.MeshBasicMaterial({
    color: "#ff4d6d",
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8,
  });
  const route = new THREE.Mesh(new THREE.BufferGeometry(), routeMat);
  route.visible = false;
  route.frustumCulled = false;
  route.renderOrder = 2;
  scene.add(route);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };

  const highlight = new THREE.Group();
  highlight.visible = false;
  const hlMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const hlRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 48), hlMat);
  const hlPulse = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.78, 48),
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
  );
  for (const m of [hlRing, hlPulse]) {
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    highlight.add(m);
  }
  scene.add(highlight);

  const triCount = countTris(scene);
  const halo = user.getObjectByName("halo") as THREE.Mesh;

  // Adaptive resolution: if frames run long on a phone, trade pixel ratio for smoothness.
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  let dpr = maxDpr;
  let lastNow = 0;
  let slow = 0;
  let fast = 0;
  const adapt = (now: number) => {
    const dt = lastNow ? now - lastNow : 16;
    lastNow = now;
    if (dt > 250) return; // tab was hidden
    if (dt > 26) slow++;
    else slow = Math.max(0, slow - 1);
    if (dt < 17) fast++;
    else fast = 0;
    if (slow > 45 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      slow = 0;
      renderer.setPixelRatio(dpr);
      resize();
    } else if (fast > 240 && dpr < maxDpr) {
      dpr = Math.min(maxDpr, dpr + 0.25);
      fast = 0;
      renderer.setPixelRatio(dpr);
      resize();
    }
  };

  const frame = (target: { x: number; z: number }, dist: number, now: number) => {
    const t = now / 1000;
    adapt(now);
    // Shadow camera follows the view so close-ups keep crisp shadows.
    const ext = THREE.MathUtils.clamp(dist * 0.55, 7, 34);
    sun.position.set(target.x + SUN_DIR.x * 60, SUN_DIR.y * 60, target.z + SUN_DIR.z * 60);
    sun.target.position.set(target.x, 0, target.z);
    const sc = sun.shadow.camera;
    if (sc.right !== ext) {
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.near = 10;
      sc.far = 130;
      sc.updateProjectionMatrix();
    }
    const fog = scene.fog as THREE.Fog;
    fog.near = dist * 1.25;
    fog.far = dist * 3.6 + 40;
    setWaterFog(ground, fogColor, fog.near, fog.far);
    ground.tick(t);
    landmarks.tick(t);
    transport.tick(t);
    escalators.tick(t);
    if (highlight.visible) {
      const k = (t * 0.7) % 1;
      hlPulse.scale.setScalar(1 + k * 1.3);
      (hlPulse.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
    if (user.visible) {
      const s = 1 + ((t * 0.8) % 1) * 1.6;
      halo.scale.set(s, s, s);
      (halo.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - ((t * 0.8) % 1));
    }
    renderer.render(scene, camera);
  };

  return {
    scene,
    camera,
    renderer,
    user,
    accuracyRing,
    route,
    cableCurve: transport.cableCurve,
    oeCurve: transport.oeCurve,
    triCount,
    resize,
    render: () => renderer.render(scene, camera),
    frame,
    pick: (() => {
      const ray = new THREE.Raycaster();
      const targets = [ground.terrain, ground.water, ground.lagoon];
      return (ndcX: number, ndcY: number, cam: THREE.Camera) => {
        ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
        const hit = ray.intersectObjects(targets, false)[0];
        return hit ? hit.point.clone() : null;
      };
    })(),
    setHighlight: (at) => {
      if (!at) {
        highlight.visible = false;
        return;
      }
      highlight.visible = true;
      highlight.position.set(at.x, groundHeight(at.x, at.z) + 0.09, at.z);
      hlMat.color.set(at.color);
      (hlPulse.material as THREE.MeshBasicMaterial).color.set(at.color);
    },
    setRoute: (pts) => {
      route.geometry.dispose();
      if (!pts || pts.length < 2) {
        route.visible = false;
        route.geometry = new THREE.BufferGeometry();
        return;
      }
      route.geometry = routeGeometry(pts, 0.26);
      route.visible = true;
    },
  };
}
