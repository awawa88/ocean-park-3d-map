import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Dev-only endpoints for the in-app feedback tool (never part of the production build):
 *
 *   GET  /__dev/official/config       interactive-map sheet size + current tile version
 *   GET  /__dev/official/tile/:z/:r/:c  proxied tile from map.oceanpark.com.hk (same-origin, so the
 *                                       browser can stitch it on a canvas)
 *   GET  /__dev/official/map.png      the stitched sheet saved in refs/ (404 until downloaded)
 *   POST /__dev/official/map.png      save a freshly stitched sheet to refs/op_sheet_2678.png
 *   POST /__dev/feedback              save a highlight: feedback/<stamp>.png + .json, and a line in feedback/FEEDBACK.md
 *
 * The official sheet stays in refs/ as a layout reference and is never shipped.
 */

const ORIGIN = "https://map.oceanpark.com.hk";

function body(req: IncomingMessage, limit = 60 * 1024 * 1024): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        fail(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

function send(res: ServerResponse, status: number, type: string, data: string | Buffer) {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.end(data);
}

const json = (res: ServerResponse, status: number, value: unknown) => send(res, status, "application/json", JSON.stringify(value));

function dataUrlBytes(url: string): Buffer {
  const comma = url.indexOf(",");
  if (!url.startsWith("data:image/png;base64,") || comma < 0) throw new Error("expected a PNG data URL");
  return Buffer.from(url.slice(comma + 1), "base64");
}

export function devTools(root: string): Plugin {
  const sheetPath = resolve(root, "refs/op_sheet_2678.png");
  const feedbackDir = resolve(root, "feedback");
  let version: string | null = null;

  const currentVersion = async () => {
    if (version) return version;
    const r = await fetch(`${ORIGIN}/version.json?t=${Date.now()}`);
    if (!r.ok) throw new Error(`version.json ${r.status}`);
    version = ((await r.json()) as { version: string }).version;
    return version;
  };

  return {
    name: "ocean-park-dev-tools",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/__dev/")) return next();
        try {
          if (url.startsWith("/__dev/official/config")) {
            const v = await currentVersion();
            const cfg = await (await fetch(`${ORIGIN}/assets/data/map_config.json?_v=${v}`)).json();
            return json(res, 200, { ...cfg, version: v, tile: 256, level: 1, saved: existsSync(sheetPath) });
          }
          const tile = url.match(/^\/__dev\/official\/tile\/(\d+)\/(\d+)\/(\d+)/);
          if (tile) {
            const v = await currentVersion();
            const r = await fetch(`${ORIGIN}/tiles/${tile[1]}/${tile[2]}/${tile[3]}.webp?_v=${v}`);
            if (!r.ok) return send(res, r.status, "text/plain", `tile ${r.status}`);
            return send(res, 200, "image/webp", Buffer.from(await r.arrayBuffer()));
          }
          if (url.startsWith("/__dev/official/map.png")) {
            if (req.method === "POST") {
              const { png } = JSON.parse((await body(req)).toString("utf8")) as { png: string };
              writeFileSync(sheetPath, dataUrlBytes(png));
              return json(res, 200, { saved: "refs/op_sheet_2678.png" });
            }
            if (!existsSync(sheetPath)) return send(res, 404, "text/plain", "not downloaded yet");
            return send(res, 200, "image/png", readFileSync(sheetPath));
          }
          if (url.startsWith("/__dev/feedback") && req.method === "POST") {
            const fb = JSON.parse((await body(req)).toString("utf8")) as { image: string; note: string; [k: string]: unknown };
            mkdirSync(feedbackDir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
            const { image, ...rest } = fb;
            writeFileSync(resolve(feedbackDir, `${stamp}.png`), dataUrlBytes(image));
            writeFileSync(resolve(feedbackDir, `${stamp}.json`), JSON.stringify({ saved: stamp, ...rest }, null, 2) + "\n");
            const md = resolve(feedbackDir, "FEEDBACK.md");
            if (!existsSync(md)) writeFileSync(md, "# Map feedback\n\nSaved from the in-app Dev tool. Each entry has a PNG and a JSON with map coordinates.\n\n");
            const where = (rest.marks as { nearest?: string[] }[] | undefined)?.flatMap((m) => m.nearest ?? []).slice(0, 4).join(", ");
            appendFileSync(md, `- **${stamp}** (${rest.view}) — ${fb.note || "(no note)"}${where ? ` · near ${where}` : ""} · [png](${stamp}.png) · [json](${stamp}.json)\n`);
            return json(res, 200, { saved: `feedback/${stamp}.png` });
          }
          return send(res, 404, "text/plain", "unknown dev endpoint");
        } catch (err) {
          return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
