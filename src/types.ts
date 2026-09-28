export type Side = "waterfront" | "summit";

export type Poi = {
  id: string;
  name: string;
  side: Side;
  zone: string;
  category: "ride" | "animal" | "show" | "exhibit" | "transport" | string;
  lat: number;
  lng: number;
  blurb: string;
  position: [number, number];
  /** Directory code on the park sheet, e.g. "A1". */
  code?: string;
  /** Key in the interactive map's attractions.json or transportations.json. */
  sourceKey?: string;
};

export type WalkNode = {
  id: string;
  side: Side;
  position: [number, number];
  poi?: string;
};

export type EdgeKind = "walk" | "cable" | "ocean-express";

export type WalkEdge = {
  a: string;
  b: string;
  kind: EdgeKind;
  /** Multiplier on walk length. Service roads are slower so the yellow spines stay the through-route. */
  pace?: number;
};

export type WalkGraph = { nodes: WalkNode[]; edges: WalkEdge[] };

export type Ring = [number, number][];
