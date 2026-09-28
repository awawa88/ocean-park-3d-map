import "./style.css";
import { createApp } from "./interact";
import type { Poi, WalkGraph } from "./types";

async function main() {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing #app");

  const [pois, walk] = await Promise.all([
    fetch("/pois.json").then((r) => r.json() as Promise<Poi[]>),
    fetch("/walk.json").then((r) => r.json() as Promise<WalkGraph>),
  ]);

  const app = await createApp(root, pois, walk);
  document.body.classList.add("ready");
  app.start();
}

main().catch((err) => {
  console.error(err);
  const root = document.querySelector("#app");
  if (root) {
    root.textContent = `Failed to start the map: ${err instanceof Error ? err.message : String(err)}`;
  }
});
