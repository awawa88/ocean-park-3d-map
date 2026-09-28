// Escalators from the park sheet (src/data/legend.json), in model x,z.
export type EscalatorRun = { id: string; name: string; points: [number, number][] };
export const ESCALATORS: EscalatorRun[] = [
  { id: "escalator-thrill-mountain", name: "Thrill Mountain Escalator", points: [[2.352,0.272],[1.712,-0.432],[1.072,-1.168]] },
  { id: "escalator-grand-aquarium", name: "Grand Aquarium Escalator", points: [[-6.944,4.368],[-6.288,3.888],[-5.648,3.376]] },
  { id: "escalator-water-world", name: "Escalator to Water World", points: [[13.216,2.896],[12.256,2.032],[11.296,1.232]] },
  { id: "escalator-bus-interchange", name: "Escalator to Bus Interchange", points: [[-10.992,9.168],[-10.272,9.04],[-9.968,8.592]] },
  { id: "escalator-hotel", name: "Escalator to Hotel and Car Park", points: [[-14.096,8.56],[-13.712,8.304],[-13.328,8.048]] },
];
