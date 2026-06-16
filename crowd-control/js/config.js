/* ============================================================
   FLOW — config.js
   Crowd-safety TYCOON, Kingshot-style: you steer a Marshal around
   the venue and pour coins into build pads. Coins are earned for
   every person who safely gets out. Units: METERS, SECONDS;
   density = persons/m².
   ============================================================ */
'use strict';

const CONFIG = {
  worldW: 36, worldH: 52, cell: 1,

  dSafe:2.0, dCrit:4.0, dDanger:5.0, dJam:7.0, dwellFail:4.0,

  v0:1.34, tau:0.5, rNeighbor:0.7, kRep:1.4, kWall:2.2, agentR:0.22,
  Js:1.3,
  fdGate(d){ const C=CONFIG; if(d<=C.dCrit) return d/C.dCrit; return Math.max(0.16, 1-0.55*(d-C.dCrit)/(C.dJam-C.dCrit)); },
  speedFactor(d){ return Math.max(0, 1-d/CONFIG.dJam); },
  clogK:0.85, widthMin:0.6,
  urgencyCalm:0.7, urgencyHurry:1.5, urgencyBase:1.0,

  // the Marshal (the character you move)
  marshal:{ speed:10.5, radius:1.1, drainPerSec:26, padReach:3.2 },

  // economy — ONE currency (coins). Earn per person safely cleared.
  startCoins:36,
  earnPerClear:0.7,

  heat:[
    {d:0.0,h:42,s:65,l:3},{d:1.5,h:44,s:88,l:26},{d:3.0,h:40,s:92,l:42},
    {d:4.0,h:30,s:96,l:50},{d:5.0,h:12,s:99,l:50},{d:7.0,h:0,s:98,l:52},
  ],
};

/* ---- build pads: the "towers" you fund by standing on them ----
   Each pad has tiers; cost(lv) is the coins for the NEXT level.   */
const PAD_DEFS = {
  meter:  { id:'meter',  name:'Entry Meter', accent:'water', max:1,
            cost:(lv)=>[34][lv-1],
            stat:(lv)=>({}),
            blurb:'Hold the crowd outside and let them in at a safe rate.' },
  steward:{ id:'steward', name:'Steward Post', accent:'gold', max:3,
            cost:(lv)=>[22,38,58][lv-1],
            stat:(lv)=>({ r:9+lv*3, tol:lv*0.9 }),           // organised crowds stay safe at higher density
            blurb:'Stewards organise the crowd — it can pack denser here without a crush.' },
  widen:  { id:'widen',  name:'Widen Exit', accent:'water', max:3,
            cost:(lv)=>[40,65,95][lv-1],
            stat:(lv)=>({ add:0.9, rate:1.2 }),             // +width AND +safe admission per level
            blurb:'A wider exit passes more — and lets you admit faster.' },
};
const METER_BASE_RATE = 3.0;   // safe admission once the meter is built (+widen bonus)

/* ---- the run: escalating events (starts SMALL) ---- */
const EVENTS = [
  {name:'Doors · a small show', intro:'A few guests trickle out. Steer the Marshal onto a pad and pour coins in to build it.', trickle:35, surge:40, surgeOver:13, duration:46},
  {name:'Friday night',         intro:'Bigger crowd. Build the Entry Meter to hold them outside before they mass.',           trickle:90, surge:240, surgeOver:13, duration:62},
  {name:'Sold out',             intro:'A real surge. Posts calm the queue; a wider exit clears it faster.',                   trickle:130, surge:520, surgeOver:14, duration:72},
  {name:'The headliner',        intro:'Everyone leaves at once. This is the whole job.',                                      trickle:160, surge:780, surgeOver:15, duration:78},
];

/* ---- permanent perks (bought between events with coins) ---- */
const UPGRADES = [
  {id:'coins',    name:'City Grant',     cost:40,  desc:'+25 starting coins each event.'},
  {id:'swift',    name:'Radio & Bike',   cost:45,  desc:'The Marshal moves faster.'},
  {id:'cheap',    name:'Volunteer Corps', cost:55, desc:'Every build pad costs 20% less.'},
  {id:'premeter', name:'Standing Orders', cost:75, desc:'Start each event with the Entry Meter already built.'},
];

/* ---- venue builder + its build pads (positions in meters) ---- */
function buildVenue(owned, ev){
  const exitW = 3.4;     // base; widened live via the Widen pad
  const walls=[
    {x:0,y:-25,w:33,h:1.6},{x:0,y:25,w:33,h:1.6},
    {x:-15.8,y:0,w:1.6,h:52},{x:15.8,y:0,w:1.6,h:52},
    {x:-9.05,y:8,w:12.5,h:1.6},{x:9.05,y:8,w:12.5,h:1.6},   // divider, 3.4m gap at x=0
  ];
  return {
    id:'concert', name:ev.name, intro:ev.intro, walls,
    pinches:[{x:0,y:8,w:exitW}],
    goal:{x:0,y:18}, goalR:3.0,
    entry:{x:0,y:-23,w:26}, entryMeterY:-16,
    marshalStart:{x:0,y:-6},
    pads:[
      {type:'meter',   x:0,   y:-19, level:0, invested:0},
      {type:'steward', x:0,   y:2.5, level:0, invested:0},   // relieves the convergence above the exit
      {type:'steward', x:-9,  y:-4,  level:0, invested:0},   // calms the concourse
      {type:'widen',   x:7,   y:3,   level:0, invested:0},
    ],
    spawns:[ {t:0,count:ev.trickle,over:9}, {t:9,count:ev.surge,over:ev.surgeOver||13} ],
    duration: ev.duration||70,
  };
}
