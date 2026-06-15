/* ============================================================
   FLOW — config.js
   Crowd-safety sim. All tuning lives here. Units are METERS and
   SECONDS; density is persons/m². Cells are 1m so dens ≈ p/m².
   ============================================================ */
'use strict';

const CONFIG = {
  // ---- world / grid ----
  worldW: 36,            // meters
  worldH: 52,
  cell: 1,               // meters per cell  → dens reads as persons/m²

  // ---- density thresholds (real crowd-safety figures) ----
  dSafe:   2.0,          // gold up to here
  dCrit:   4.0,          // throughput peaks here; risk onset
  dDanger: 5.0,          // crush threshold — dwell timer runs above this
  dJam:    7.0,          // people barely move
  dwellFail: 4.0,        // seconds a cell may stay >= dDanger before you lose

  // ---- agent / pedestrian model ----
  v0: 1.34,              // free walking speed m/s
  tau: 0.5,              // relaxation time
  rNeighbor: 0.7,        // repulsion radius (m)
  kRep: 1.4,             // neighbour repulsion strength
  kWall: 2.2,            // wall repulsion strength
  agentR: 0.22,          // visual radius

  // ---- fundamental diagram at gates/openings ----
  Js: 1.3,               // specific flow ceiling (persons / m / s)
  // inverted-U: rises to dCrit then falls
  fdGate(d){
    const C=CONFIG;
    if(d<=C.dCrit) return d/C.dCrit;                 // 0..1 rising
    return Math.max(0.16, 1 - 0.55*(d-C.dCrit)/(C.dJam-C.dCrit)); // falling
  },
  // density-scaled free speed (Greenshields)
  speedFactor(d){ return Math.max(0, 1 - d/CONFIG.dJam); },

  // ---- faster-is-slower (arch/clog) ----
  clogK: 0.85,           // faster-is-slower strength (fractional width loss)
  widthMin: 0.6,

  // ---- urgency from PA ----
  urgencyCalm: 0.7,
  urgencyHurry: 1.5,
  urgencyBase: 1.0,

  // ---- economy (per-event) ----
  startCredits: 90,

  // ---- tools ----
  tools: {
    barrier: { id:'barrier', name:'Barrier', cost:10, drag:true,
      desc:'Draw a rail. Shapes flow, splits lanes.' },
    gate:    { id:'gate', name:'Metering Gate', cost:40, drag:false, rate:3.5, width:28,
      desc:'A release line across the concourse. Place it above the pinch.' },
    pa:      { id:'pa', name:'PA Zone', cost:15, drag:false, radius:14,
      desc:'Calm or hurry a zone. Hurrying a jam makes it worse.' },
  },

  // colour ramp stops for the heatmap (hue, sat, light) by density band
  heat:[
    {d:0.0, h:42, s:65, l:3},    // near-black floor
    {d:1.5, h:44, s:88, l:26},   // faint gold
    {d:3.0, h:40, s:92, l:42},   // safe gold
    {d:4.0, h:30, s:96, l:50},   // amber (critical)
    {d:5.0, h:12, s:99, l:50},   // orange (danger onset)
    {d:7.0, h:0,  s:98, l:52},   // vivid red (crush)
  ],
};

/* ---- THE LEVEL: "Concert Letting Out" ----
   Geometry is authored in meters in a worldW×worldH space, origin at
   centre. Walls are rectangles (non-walkable). Spawns release agents
   over time toward a goal. The pinch is the single narrow exit. */
const LEVELS = {
  concert: {
    id:'concert', name:'Concert Letting Out',
    intro:'The show just ended. ~1000 people, one exit. Keep every cell out of the red.',
    // rectangles of NON-walkable wall, [cx,cy,w,h] in meters (centre origin).
    // World is x∈[-42,42], y∈[-26,26]. Crowd spawns upper, flows DOWN to the exit.
    // Topology: a WIDE SPAWN HALL (top) funnels into a bounded ~14m
    // CONCOURSE CORRIDOR (centre), which ends at a 3m PINCH, then the
    // PLAZA + goal. The corridor is narrow enough that ONE gate spans it,
    // so metering near the top lets the queue back up into the wide hall.
    // One bounded CONCOURSE (x −15..15, y −24..8, ~960 m²) — broad enough
    // to hold the crowd safely if you meter. Its only exit is a 3.4m PINCH
    // at the bottom; past it, the PLAZA + goal. A gate spans the full width.
    walls:[
      {x:0,     y:-25,  w:33,   h:1.6},   // top
      {x:0,     y:25,   w:33,   h:1.6},   // bottom (plaza back)
      {x:-15.8, y:0,    w:1.6,  h:52},    // left
      {x:15.8,  y:0,    w:1.6,  h:52},    // right
      {x:-8.4,  y:8,    w:13.2, h:1.6},   // pinch wall left  (covers −15..−1.8)
      {x:8.4,   y:8,    w:13.2, h:1.6},   // pinch wall right (covers 1.8..15)
    ],
    pinch:{x:0, y:8, w:3.4},             // the throughput-limited exit
    goal:{x:0, y:18}, goalR:3.0,         // plaza past the pinch
    // people arrive at the ENTRY (top) on this schedule. A metering gate
    // placed in the entry zone (y <= entryMeterY) caps how fast they're let
    // in — holding the rest safely OUTSIDE. That is the upstream lever.
    entry:{x:0, y:-23, w:26},
    entryMeterY:-16,
    spawns:[
      {t:0,  count:140, over:10},   // trickle — learn the heatmap
      {t:10, count:760, over:14},   // THE SURGE
    ],
    duration:75, tools:['barrier','gate','pa'], creditsPerSec:0,
  },
};
