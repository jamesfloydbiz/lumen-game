/* ============================================================
   LUMEN — config.js
   All balance lives here. Pure data + scaling curves.
   Tuned so a competent player out-scales the Dusk by ~wave 80
   and can push a near-max base/army through wave 100.
   ============================================================ */
'use strict';

const CONFIG = {
  arenaR: 540,        // world radius of the playable light-island
  spawnR: 660,        // Dusk spawns just beyond the edge
  wallR: 372,         // radius of the Light Barrier ring
  totalWaves: 100,

  heart: {
    baseHp: 150,
    regenPerSec: 0.0,
    radius: 58,
  },

  keeper: {
    radius: 18,
    baseSpeed: 235,
    pickupRadius: 110,
    baseDamage: 9,
    baseFireRate: 2.8,
    baseRange: 245,
    projSpeed: 640,
  },

  mote: {
    radius: 9,
    life: 16,
    magnet: 560,
    value: 1,
  },

  /* ---------- Enemy archetypes (base stats; scaled per wave) ---------- */
  enemies: {
    duskling: { hp:14, speed:46, dmg:5,  bounty:4,  r:15, color:266, weight:1.0, name:'Duskling' },
    shade:    { hp:9,  speed:94, dmg:4,  bounty:4,  r:12, color:200, weight:0.9, name:'Shade' },
    hulk:     { hp:52, speed:30, dmg:14, bounty:13, r:26, color:286, weight:2.6, name:'Hollow' },
    wisplet:  { hp:22, speed:64, dmg:7,  bounty:7,  r:16, color:320, weight:1.4, name:'Gloam' },
    boss:     { hp:480, speed:30, dmg:34, bounty:220, r:46, color:340, weight:0, name:'Nightfall' },
  },

  /* ---------- Per-wave scaling ---------- */
  hpMul:(n)=> 1 + 0.13*n + 0.0062*n*n,        // w10≈2.9  w50≈23  w100≈76
  dmgMul:(n)=> 1 + 0.040*n,                    // w100≈5.0
  spdMul:(n)=> Math.min(1.75, 1 + 0.010*n),
  bountyMul:(n)=> 1 + 0.16*n,                  // economy keeps pace
  waveCount:(n)=> Math.round(5 + n*0.85),
  aliveCap: 60,

  wavePool:(n)=>{
    const pool=[['duskling',1]];
    if(n>=3)  pool.push(['shade', 0.8]);
    if(n>=6)  pool.push(['wisplet',0.7]);
    if(n>=9)  pool.push(['hulk', 0.45]);
    if(n>=20) pool[0][1]=0.6;
    if(n>=40){ pool.push(['hulk',0.6]); pool.push(['shade',0.7]); }
    return pool;
  },
  isBossWave:(n)=> n%10===0,
  bossHpMul:(n)=> 1 + 0.22*n + 0.0072*n*n,     // w10≈3.9  w50≈30  w100≈95

  /* ============================================================
     BUILD BLUEPRINTS
     ============================================================ */
  blueprints:{
    spire:{
      id:'spire', name:'Spire', kind:'tower', max:6, accent:'light',
      cost:(lv)=> Math.round(16 * Math.pow(1.7, lv-1)),
      stat:(lv)=>({
        damage: 9 + lv*7 + lv*lv*2.2,
        range:  165 + lv*16,
        rate:   1.5 + lv*0.26,
        proj:   580,
      }),
      desc:(lv)=> lv===0 ? 'Raise a light Spire' : `Spire → Lv ${lv+1}`,
      unlock:{},
    },
    wisp:{
      id:'wisp', name:'Wisp', kind:'wisp', max:10, accent:'gold',
      cost:(lv)=> Math.round(20 * Math.pow(1.46, lv)),
      desc:(lv)=> `Summon Wisp ${lv+1}/10`,
      unlock:{wave:2},
    },
    wisptier:{
      id:'wisptier', name:'Attune', kind:'upgrade', max:8, accent:'gold',
      cost:(lv)=> Math.round(34 * Math.pow(1.82, lv-1)),
      stat:(lv)=>({ damage: 5 + lv*5 + lv*lv*1.6, rate: 1.7 + lv*0.20, range:175+lv*12 }),
      desc:(lv)=> lv===0 ? 'Attune the Wisps' : `Wisp power → Lv ${lv+1}`,
      unlock:{requires:'wisp'},
    },
    barrier:{
      id:'barrier', name:'Barrier', kind:'wall', max:8, accent:'light',
      cost:(lv)=> Math.round(26 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ segHp: 60 + lv*85 + lv*lv*18, regen: 6+lv*3 }),
      desc:(lv)=> lv===0 ? 'Weave a Light Barrier' : `Barrier → Lv ${lv+1}`,
      unlock:{wave:2},
    },
    kdamage:{
      id:'kdamage', name:'Focus', kind:'upgrade', max:12, accent:'light',
      cost:(lv)=> Math.round(14 * Math.pow(1.55, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.6 }),
      desc:(lv)=> lv===0 ? 'Sharpen your light' : `Damage → +${Math.round(lv*60)}%`,
      unlock:{},
    },
    kfire:{
      id:'kfire', name:'Cadence', kind:'upgrade', max:10, accent:'light',
      cost:(lv)=> Math.round(18 * Math.pow(1.55, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.3 }),
      desc:(lv)=> lv===0 ? 'Quicken your cadence' : `Fire rate → +${Math.round(lv*30)}%`,
      unlock:{wave:3},
    },
    kspeed:{
      id:'kspeed', name:'Swiftness', kind:'upgrade', max:6, accent:'light',
      cost:(lv)=> Math.round(22 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.14 }),
      desc:(lv)=> lv===0 ? 'Move like light' : `Speed → +${Math.round(lv*14)}%`,
      unlock:{wave:5},
    },
    kmagnet:{
      id:'kmagnet', name:'Draw', kind:'upgrade', max:5, accent:'gold',
      cost:(lv)=> Math.round(16 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ add: lv*60 }),
      desc:(lv)=> lv===0 ? 'Pull motes from afar' : `Pickup range → Lv ${lv+1}`,
      unlock:{wave:4},
    },
    hheart:{
      id:'hheart', name:'Core', kind:'heart', max:12, accent:'light',
      cost:(lv)=> Math.round(28 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ maxHp: 150 + lv*150 + lv*lv*22 }),   // w/ max → ~5100 hp
      desc:(lv)=> lv===0 ? 'Deepen the Heartlight' : `Max HP → Lv ${lv+1}`,
      unlock:{wave:4},
    },
    hregen:{
      id:'hregen', name:'Mend', kind:'heart', max:8, accent:'light',
      cost:(lv)=> Math.round(34 * Math.pow(1.68, lv-1)),
      stat:(lv)=>({ regen: lv*2.4 }),
      desc:(lv)=> lv===0 ? 'Let the core mend' : `Regen → ${ (lv*2.4).toFixed(1) }/s`,
      unlock:{wave:8},
    },
    nova:{
      id:'nova', name:'Nova', kind:'upgrade', max:6, accent:'gold',
      cost:(lv)=> Math.round(58 * Math.pow(1.78, lv-1)),
      stat:(lv)=>({ damage: 45 + lv*60 + lv*lv*20, radius: 230+lv*45, cd: Math.max(3.5, 11-lv*1.2) }),
      desc:(lv)=> lv===0 ? 'Bind a Nova pulse' : `Nova → Lv ${lv+1}`,
      unlock:{wave:12},
    },
  },
};

/* ---------- Pad layout ---------- */
const PAD_LAYOUT = (()=>{
  const pads=[];
  const R=CONFIG.arenaR;
  for(let i=0;i<6;i++){
    const a = -Math.PI/2 + i*(TAU/6);
    pads.push({ bp:'spire', slot:i, x:Math.cos(a)*R*0.64, y:Math.sin(a)*R*0.64 });
  }
  // two inner rings keep labels from colliding near the Heartlight
  const inner=['wisp','barrier','kdamage','kfire','hheart','wisptier','kspeed','kmagnet','hregen','nova'];
  const ir = R*0.42;
  for(let i=0;i<inner.length;i++){
    const a = -Math.PI/2 + i*(TAU/inner.length);
    pads.push({ bp:inner[i], x:Math.cos(a)*ir, y:Math.sin(a)*ir });
  }
  return pads;
})();
