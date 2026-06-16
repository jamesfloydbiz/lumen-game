/* ============================================================
   MONKEY BREACH — config.js
   Zoo-breach defense (Kingshot loop). Guard the banana pile from
   escaping monkeys: trap them with nets (never harm), and at the
   end of each wave a truck loads the trapped ones back to the zoo.
   Units: meters / seconds. Field centred at origin; breach at top
   (−y), banana pile at the bottom (+y).
   ============================================================ */
'use strict';

const CONFIG = {
  worldW: 48, worldH: 76,

  bananas: 24,                  // the core — lose when it hits 0
  pile: {x:0, y:26},
  breachY: -34,                 // fence line / spawn
  breachXs(b){ return b===1?[0] : b===2?[-11,11] : [-15,0,15]; },

  hero: { speed:13, netRange:17, netRate:1.6, netSpeed:34, radius:1.4, drainPerSec:7, padReach:3.4 },
  startCoins: 6,

  // monkey archetypes
  monkeys: {
    normal: { speed:6.0,  nets:1, bounty:3, grab:0.6, r:1.3, hex:0x8a5a2e, name:'Monkey' },
    fast:   { speed:9.5,  nets:1, bounty:3, grab:0.35,r:1.1, hex:0xb5793a, name:'Quick' },
    alpha:  { speed:4.6,  nets:2, bounty:8, grab:0.8, r:2.0, hex:0x5a3a1e, name:'Alpha' },
    bold:   { speed:7.0,  nets:1, bounty:5, grab:0.5, r:1.3, hex:0x9a4a2a, name:'Bold', decoyProof:true },
  },

  // wave schedule
  totalWaves: 12,
  waveSpec(n){
    const count = 5 + Math.round(n*2.6);
    const interval = Math.max(0.45, 1.5 - n*0.09);
    const pool=[['normal',1]];
    if(n>=3) pool.push(['fast',0.6]);
    if(n>=5) pool.push(['alpha',0.3]);
    if(n>=7) pool.push(['bold',0.5]);
    if(n>=9) pool.push(['fast',0.8]);
    return {count, interval, pool, breaches: n>=8?3 : n>=4?2 : 1};
  },

  // build pads (the "towers") — stand on one and pour coins in
  pads: {
    net:   { name:'Net Tower',   accent:'net',  max:3, cost:(lv)=>[5,12,22][lv-1],
             stat:(lv)=>({range:13+lv*2.5, rate:0.9+lv*0.45}), blurb:'Auto-fires nets down its lane.' },
    decoy: { name:'Banana Decoy', accent:'gold', max:2, cost:(lv)=>[10,20][lv-1],
             stat:(lv)=>({pull:16+lv*7}), blurb:'A fake pile — monkeys grab it and flee empty-handed.' },
    cage:  { name:'Cage Trap',   accent:'net',  max:3, cost:(lv)=>[15,28,45][lv-1],
             stat:(lv)=>({r:3.5+lv*0.8, cd:Math.max(1.4,3.8-lv*0.8)}), blurb:'Auto-catches monkeys that cross it.' },
    mud:   { name:'Mud Patch',   accent:'mud',  max:2, cost:(lv)=>[10,18][lv-1],
             stat:(lv)=>({slow:0.55-lv*0.13, r:6+lv*2}), blurb:'Slows monkeys crossing it — more net shots land.' },
    fence: { name:'Fence Patch', accent:'wood', max:2, cost:(lv)=>[20,35][lv-1],
             stat:(lv)=>({dur:5+lv*3, cd:13}), blurb:'Seals a breach for a few seconds. Not permanent.' },
  },
};

/* pad layout (meters). Breach at top, pile at bottom; lane is the middle. */
const PAD_LAYOUT = [
  {type:'net',   x:-9,  y:-6,  level:0, invested:0},
  {type:'net',   x:9,   y:-6,  level:0, invested:0},
  {type:'cage',  x:0,   y:-16, level:0, invested:0},
  {type:'decoy', x:-12, y:10,  level:0, invested:0},
  {type:'mud',   x:9,   y:4,   level:0, invested:0},
  {type:'fence', x:0,   y:-30, level:0, invested:0},
];
