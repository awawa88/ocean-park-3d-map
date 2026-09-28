import * as THREE from "three";
import { SDF_GRID } from "../generated/ground-grid";
import { zoneAt } from "../geo";
import { MAP_H, MAP_W, ORIGIN_X, ORIGIN_Y, SCALE, SIDE_SPLIT } from "../layout";
import { LAGOON, sampleTerrain, terrainHeight } from "../terrain";

/** Plaza ground tint per zone: the pale version of each zone's legend colour. */
export const ZONE_GROUND: Record<string, string> = {
  "Whiskers Harbour": "#f8d3a2",
  "Amazing Asian Animals": "#f4bba5",
  "Aqua City": "#f6ebc4",
  "Polar Adventure": "#e4f0f7",
  "Thrill Mountain": "#f8e07c",
  Rainforest: "#c4dd8a",
  "Marine World": "#f6d3e3",
};

/** World xz → 0..1 across the reference sheet. Same mapping in JS and GLSL. */
const U_SCALE = 1 / (SCALE * MAP_W);
const U_OFF = ORIGIN_X / MAP_W;
const V_SCALE = 1 / (SCALE * MAP_H);
const V_OFF = ORIGIN_Y / MAP_H;

export type GroundMasks = { width: number; height: number; a: Uint8ClampedArray; b: Uint8ClampedArray };

/** Sample the decoded masks on the CPU (for tree and prop placement). Channels 0..1. */
export function maskAt(masks: GroundMasks, x: number, z: number) {
  const u = x * U_SCALE + U_OFF;
  const v = z * V_SCALE + V_OFF;
  const px = Math.max(0, Math.min(masks.width - 1, Math.round(u * masks.width)));
  const py = Math.max(0, Math.min(masks.height - 1, Math.round(v * masks.height)));
  const i = (py * masks.width + px) * 4;
  return {
    land: masks.a[i] / 255,
    plaza: masks.a[i + 1] / 255,
    forest: masks.a[i + 2] / 255,
    road: masks.b[i] / 255,
    water: masks.b[i + 1] / 255,
  };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return img;
}

function pixels(img: HTMLImageElement): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

function maskTexture(img: HTMLImageElement): THREE.Texture {
  const t = new THREE.Texture(img);
  // Row 0 is the north edge of the sheet, same as the SDF grid: no flip.
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Low-res zone tint, one colour per nearest zone pin. Bilinear filtering softens the seams. */
function zoneTexture(): THREE.CanvasTexture {
  const w = 336;
  const h = 274;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const cache = new Map<string, THREE.Color>();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ((i + 0.5) / w - U_OFF) / U_SCALE;
      const z = ((j + 0.5) / h - V_OFF) / V_SCALE;
      const zone = zoneAt(x, z, x < SIDE_SPLIT ? "waterfront" : "summit");
      let col = cache.get(zone);
      if (!col) {
        col = new THREE.Color(ZONE_GROUND[zone] ?? "#f4ead0");
        cache.set(zone, col);
      }
      const k = (j * w + i) * 4;
      img.data[k] = col.r * 255;
      img.data[k + 1] = col.g * 255;
      img.data[k + 2] = col.b * 255;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function sdfTexture(): THREE.DataTexture {
  const bin = atob(SDF_GRID.data);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const t = new THREE.DataTexture(data, SDF_GRID.cols, SDF_GRID.rows, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const NOISE_GLSL = /* glsl */ `
  float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.13 + 7.1) * 0.3 + gNoise(p * 4.7 - 3.3) * 0.15; }
`;

const SHEET_GLSL = /* glsl */ `
  vec2 sheetUv(vec2 xz) { return vec2(xz.x * ${U_SCALE.toFixed(8)} + ${U_OFF.toFixed(8)}, xz.y * ${V_SCALE.toFixed(8)} + ${V_OFF.toFixed(8)}); }
`;

export type Ground = {
  terrain: THREE.Mesh;
  water: THREE.Mesh;
  lagoon: THREE.Mesh;
  masks: GroundMasks;
  tick: (t: number) => void;
};

/** Grid axis: fine over the park, coarse out to the horizon. */
function axis(inner0: number, inner1: number, fine: number, outer0: number, outer1: number, coarse: number): number[] {
  const v: number[] = [];
  for (let x = outer0; x < inner0; x += coarse) v.push(x);
  for (let x = inner0; x < inner1; x += fine) v.push(x);
  for (let x = inner1; x <= outer1 + 1e-6; x += coarse) v.push(x);
  return v;
}

function buildTerrainGeometry(): THREE.BufferGeometry {
  const xs = axis(-24, 24, 0.2, -70, 70, 2.5);
  const zs = axis(-19.5, 19.5, 0.2, -60, 60, 2.5);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  let k = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i];
      const z = zs[j];
      const inner = Math.abs(x) < 24 && Math.abs(z) < 19.5;
      pos[k++] = x;
      pos[k++] = inner ? sampleTerrain(x, z) : terrainHeight(x, z);
      pos[k++] = z;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  k = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // Split along the shorter diagonal for smoother shading.
      const hA = pos[a * 3 + 1];
      const hD = pos[d * 3 + 1];
      const hB = pos[b * 3 + 1];
      const hC = pos[c * 3 + 1];
      if (Math.abs(hA - hD) < Math.abs(hB - hC)) {
        idx[k++] = a; idx[k++] = c; idx[k++] = d;
        idx[k++] = a; idx[k++] = d; idx[k++] = b;
      } else {
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function terrainMaterial(groundA: THREE.Texture, groundB: THREE.Texture, zone: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0 });
  const uniforms = {
    uGroundA: { value: groundA },
    uGroundB: { value: groundB },
    uZone: { value: zone },
    uGrass: { value: new THREE.Color("#8fc85a") },
    uGrass2: { value: new THREE.Color("#b3d873") },
    uForest: { value: new THREE.Color("#3f7f39") },
    uForest2: { value: new THREE.Color("#58953f") },
    uRock: { value: new THREE.Color("#cdbb95") },
    uRock2: { value: new THREE.Color("#a7926e") },
    uSand: { value: new THREE.Color("#efe0b4") },
    uRoad: { value: new THREE.Color("#a9a8a2") },
    uSeabed: { value: new THREE.Color("#7fd3cf") },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNrm;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWorldNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorldPos;
        varying vec3 vWorldNrm;
        uniform sampler2D uGroundA; uniform sampler2D uGroundB; uniform sampler2D uZone;
        uniform vec3 uGrass; uniform vec3 uGrass2; uniform vec3 uForest; uniform vec3 uForest2;
        uniform vec3 uRock; uniform vec3 uRock2; uniform vec3 uSand; uniform vec3 uRoad; uniform vec3 uSeabed;
        ${NOISE_GLSL}
        ${SHEET_GLSL}`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec2 suv = sheetUv(vWorldPos.xz);
        vec3 ga = texture2D(uGroundA, suv).rgb;
        vec3 gb = texture2D(uGroundB, suv).rgb;
        float n = gFbm(vWorldPos.xz * 0.9);
        float n2 = gNoise(vWorldPos.xz * 6.0);
        float aa = 0.06;
        vec3 col = mix(uGrass, uGrass2, smoothstep(0.35, 0.75, n));
        // Mowing stripes on open lawns, like the park's landscaped slopes.
        col *= 0.97 + 0.03 * sin(vWorldPos.x * 3.0 + vWorldPos.z * 1.2);
        vec3 forest = mix(uForest, uForest2, smoothstep(0.3, 0.8, n)) * (0.9 + 0.1 * n2);
        col = mix(col, forest, smoothstep(0.5 - aa, 0.5 + aa, ga.b));
        float plaza = smoothstep(0.5 - aa, 0.5 + aa, ga.g);
        vec3 zc = texture2D(uZone, suv).rgb * (0.95 + 0.05 * n2);
        col = mix(col, zc, plaza);
        col = mix(col, uRoad * (0.96 + 0.04 * n2), smoothstep(0.5 - aa, 0.5 + aa, gb.r));
        // Cliffs and retaining walls: pale stone that reads as the diorama's edge.
        float slope = 1.0 - clamp(vWorldNrm.y, 0.0, 1.0);
        vec3 rock = mix(uRock, uRock2, smoothstep(0.3, 0.8, gNoise(vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y * 5.0))));
        col = mix(col, rock, smoothstep(0.42, 0.62, slope));
        // Beach and seabed.
        col = mix(col, uSand, 1.0 - smoothstep(0.13, 0.26, vWorldPos.y));
        col = mix(col, uSeabed, 1.0 - smoothstep(-0.05, 0.08, vWorldPos.y));
        vec4 diffuseColor = vec4(col, opacity);`,
      );
  };
  return mat;
}

function waterMaterial(sdf: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSdf: { value: sdf },
      uDeep: { value: new THREE.Color("#1d8fcf") },
      uMid: { value: new THREE.Color("#35b7dc") },
      uShallow: { value: new THREE.Color("#8fe6e4") },
      uFoam: { value: new THREE.Color("#ffffff") },
      uFogColor: { value: new THREE.Color("#cfeefb") },
      uFogNear: { value: 60 },
      uFogFar: { value: 240 },
      uSunDir: { value: new THREE.Vector3(-0.4, 0.8, 0.3).normalize() },
      uSdfGrid: { value: new THREE.Vector4(SDF_GRID.x0, SDF_GRID.z0, SDF_GRID.step * SDF_GRID.cols, SDF_GRID.step * SDF_GRID.rows) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uSdf;
      uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform vec3 uFoam;
      uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      uniform vec3 uSunDir;
      uniform vec4 uSdfGrid;
      varying vec3 vWorld;
      varying float vDepth;
      ${NOISE_GLSL}
      void main() {
        vec2 guv = (vWorld.xz - uSdfGrid.xy) / uSdfGrid.zw;
        float sdf = texture2D(uSdf, clamp(guv, 0.0, 1.0)).r * 8.0 - 4.0; // < 0 at sea
        float d = clamp(-sdf, 0.0, 4.0);
        vec3 col = mix(uShallow, uMid, smoothstep(0.0, 1.1, d));
        col = mix(col, uDeep, smoothstep(1.2, 4.0, d));
        // Gentle swell: two drifting noise layers.
        vec2 p = vWorld.xz;
        float w1 = gNoise(p * 0.7 + vec2(uTime * 0.05, uTime * 0.03));
        float w2 = gNoise(p * 1.9 - vec2(uTime * 0.07, -uTime * 0.04));
        float swell = w1 * 0.6 + w2 * 0.4;
        col *= 0.95 + 0.1 * swell;
        // Sun glints.
        float glint = smoothstep(0.9, 0.98, gNoise(p * 2.4 + uTime * 0.12) * swell * 1.45);
        col += glint * 0.1;
        // Foam: a lapping line hugging the shore.
        float band = sin(d * 16.0 - uTime * 1.6 + w1 * 3.0) * 0.5 + 0.5;
        float foam = (1.0 - smoothstep(0.0, 0.22, d)) * 0.85 + band * (1.0 - smoothstep(0.08, 0.5, d)) * 0.35;
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0));
        float fog = smoothstep(uFogNear, uFogFar, vDepth);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function lagoonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2(LAGOON.x, LAGOON.z) },
      uR: { value: LAGOON.r },
      uEdge: { value: new THREE.Color("#b8f1f0") },
      uCore: { value: new THREE.Color("#2fb3d6") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec2 uCenter; uniform float uR; uniform vec3 uEdge; uniform vec3 uCore;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        float r = length(vWorld.xz - uCenter) / uR;
        vec3 col = mix(uCore, uEdge, smoothstep(0.35, 1.0, r));
        float ripple = sin(r * 26.0 - uTime * 1.3) * 0.5 + 0.5;
        col += ripple * 0.04;
        col += smoothstep(0.8, 0.95, gNoise(vWorld.xz * 4.0 + uTime * 0.2)) * 0.12;
        col = mix(col, vec3(1.0), smoothstep(0.93, 1.0, r) * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export async function buildGround(): Promise<Ground> {
  const [imgA, imgB] = await Promise.all([loadImage("/ground-a.png"), loadImage("/ground-b.png")]);
  const masks: GroundMasks = { width: imgA.naturalWidth, height: imgA.naturalHeight, a: pixels(imgA), b: pixels(imgB) };
  const geo = buildTerrainGeometry();
  const zone = zoneTexture();

  const terrain = new THREE.Mesh(geo, terrainMaterial(maskTexture(imgA), maskTexture(imgB), zone));
  terrain.name = "terrain";
  terrain.receiveShadow = true;
  terrain.castShadow = true;

  const waterMat = waterMaterial(sdfTexture());
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.name = "sea";

  const lagoonMat = lagoonMaterial();
  const lagoon = new THREE.Mesh(new THREE.CircleGeometry(LAGOON.r + 0.14, 48), lagoonMat);
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(LAGOON.x, sampleTerrain(LAGOON.x + LAGOON.r + 0.6, LAGOON.z) - 0.12, LAGOON.z);
  lagoon.name = "lagoon";

  return {
    terrain,
    water,
    lagoon,
    masks,
    tick: (t) => {
      waterMat.uniforms.uTime.value = t;
      lagoonMat.uniforms.uTime.value = t;
    },
  };
}

export function setWaterFog(ground: Ground, color: THREE.Color, near: number, far: number) {
  const u = (ground.water.material as THREE.ShaderMaterial).uniforms;
  u.uFogColor.value.copy(color);
  u.uFogNear.value = near;
  u.uFogFar.value = far;
}
