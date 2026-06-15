/* ============================================================
   PICNIC — config.js
   Defend the cake from the ants. All balance lives here.
   (Same tuned 100-wave curve as before — only the theme changed.)
   ============================================================ */
'use strict';

const CONFIG = {
  arenaR: 540,        // world radius of the picnic blanket
  spawnR: 660,        // bugs crawl in from beyond the blanket
  wallR: 372,         // radius of the Salt Line ring
  totalWaves: 100,

  cake: {             // the base
    baseHp: 150,
    regenPerSec: 0.0,
    radius: 58,
  },

  hero: {             // the ladybug
    radius: 18,
    baseSpeed: 235,
    pickupRadius: 110,
    baseDamage: 9,
    baseFireRate: 2.8,
    baseRange: 245,
    projSpeed: 640,
  },

  crumb: {            // currency pickups
    radius: 9,
    life: 16,
    magnet: 560,
    value: 1,
  },

  /* ---------- Pest archetypes (base stats; scaled per wave) ----------
     hex = body colour, fly = hovers above the blanket            */
  enemies: {
    ant:    { hp:14, speed:46, dmg:5,  bounty:4,  r:15, hex:0x2a1c14, fly:false, name:'Ant' },
    scout:  { hp:9,  speed:94, dmg:4,  bounty:4,  r:12, hex:0x7a2f1c, fly:false, name:'Scout' },
    beetle: { hp:52, speed:30, dmg:14, bounty:13, r:26, hex:0x2b2540, fly:false, name:'Beetle' },
    wasp:   { hp:22, speed:64, dmg:7,  bounty:7,  r:16, hex:0xd9a520, fly:true,  name:'Wasp' },
    boss:   { hp:480, speed:30, dmg:34, bounty:220, r:46, hex:0xc24a16, fly:true, name:'Hornet' },
  },

  /* ---------- Per-wave scaling ---------- */
  hpMul:(n)=> 1 + 0.13*n + 0.0062*n*n,
  dmgMul:(n)=> 1 + 0.040*n,
  spdMul:(n)=> Math.min(1.75, 1 + 0.010*n),
  bountyMul:(n)=> 1 + 0.16*n,
  waveCount:(n)=> Math.round(5 + n*0.85),
  aliveCap: 60,

  wavePool:(n)=>{
    const pool=[['ant',1]];
    if(n>=3)  pool.push(['scout', 0.8]);
    if(n>=6)  pool.push(['wasp',0.7]);
    if(n>=9)  pool.push(['beetle', 0.45]);
    if(n>=20) pool[0][1]=0.6;
    if(n>=40){ pool.push(['beetle',0.6]); pool.push(['scout',0.7]); }
    return pool;
  },
  isBossWave:(n)=> n%10===0,
  bossHpMul:(n)=> 1 + 0.22*n + 0.0072*n*n,

  /* ============================================================
     BUILD BLUEPRINTS  (picnic-themed, numbers unchanged)
     ============================================================ */
  blueprints:{
    spire:{
      id:'spire', name:'Sprinkler', kind:'tower', max:6, accent:'water',
      cost:(lv)=> Math.round(16 * Math.pow(1.7, lv-1)),
      stat:(lv)=>({ damage: 9 + lv*7 + lv*lv*2.2, range:165 + lv*16, rate:1.5 + lv*0.26, proj:580 }),
      desc:(lv)=> lv===0 ? 'Set up a Sprinkler' : `Sprinkler → Lv ${lv+1}`,
      unlock:{},
    },
    wisp:{
      id:'wisp', name:'Firefly', kind:'wisp', max:10, accent:'glow',
      cost:(lv)=> Math.round(20 * Math.pow(1.46, lv)),
      desc:(lv)=> `Call a Firefly ${lv+1}/10`,
      unlock:{wave:2},
    },
    wisptier:{
      id:'wisptier', name:'Glow', kind:'upgrade', max:8, accent:'glow',
      cost:(lv)=> Math.round(34 * Math.pow(1.82, lv-1)),
      stat:(lv)=>({ damage: 5 + lv*5 + lv*lv*1.6, rate: 1.7 + lv*0.20, range:175+lv*12 }),
      desc:(lv)=> lv===0 ? 'Brighten the Fireflies' : `Firefly power → Lv ${lv+1}`,
      unlock:{requires:'wisp'},
    },
    barrier:{
      id:'barrier', name:'Salt Line', kind:'wall', max:8, accent:'water',
      cost:(lv)=> Math.round(26 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ segHp: 60 + lv*85 + lv*lv*18, regen: 6+lv*3 }),
      desc:(lv)=> lv===0 ? 'Pour a Salt Line' : `Salt Line → Lv ${lv+1}`,
      unlock:{wave:2},
    },
    kdamage:{
      id:'kdamage', name:'Sting', kind:'upgrade', max:12, accent:'water',
      cost:(lv)=> Math.round(14 * Math.pow(1.55, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.6 }),
      desc:(lv)=> lv===0 ? 'Sharpen your sting' : `Damage → +${Math.round(lv*60)}%`,
      unlock:{},
    },
    kfire:{
      id:'kfire', name:'Buzz', kind:'upgrade', max:10, accent:'water',
      cost:(lv)=> Math.round(18 * Math.pow(1.55, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.3 }),
      desc:(lv)=> lv===0 ? 'Buzz faster' : `Fire rate → +${Math.round(lv*30)}%`,
      unlock:{wave:3},
    },
    kspeed:{
      id:'kspeed', name:'Wings', kind:'upgrade', max:6, accent:'water',
      cost:(lv)=> Math.round(22 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.14 }),
      desc:(lv)=> lv===0 ? 'Lighter wings' : `Speed → +${Math.round(lv*14)}%`,
      unlock:{wave:5},
    },
    kmagnet:{
      id:'kmagnet', name:'Forage', kind:'upgrade', max:5, accent:'glow',
      cost:(lv)=> Math.round(16 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ add: lv*60 }),
      desc:(lv)=> lv===0 ? 'Gather from afar' : `Pickup range → Lv ${lv+1}`,
      unlock:{wave:4},
    },
    hheart:{
      id:'hheart', name:'Tier', kind:'cake', max:12, accent:'cake',
      cost:(lv)=> Math.round(28 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ maxHp: 150 + lv*150 + lv*lv*22 }),
      desc:(lv)=> lv===0 ? 'Add a cake tier' : `Cake HP → Lv ${lv+1}`,
      unlock:{wave:4},
    },
    hregen:{
      id:'hregen', name:'Frosting', kind:'cake', max:8, accent:'cake',
      cost:(lv)=> Math.round(34 * Math.pow(1.68, lv-1)),
      stat:(lv)=>({ regen: lv*2.4 }),
      desc:(lv)=> lv===0 ? 'Re-frost the cake' : `Regen → ${ (lv*2.4).toFixed(1) }/s`,
      unlock:{wave:8},
    },
    nova:{
      id:'nova', name:'Bug Spray', kind:'upgrade', max:6, accent:'glow',
      cost:(lv)=> Math.round(58 * Math.pow(1.78, lv-1)),
      stat:(lv)=>({ damage: 45 + lv*60 + lv*lv*20, radius: 230+lv*45, cd: Math.max(3.5, 11-lv*1.2) }),
      desc:(lv)=> lv===0 ? 'Keep a Bug Spray' : `Bug Spray → Lv ${lv+1}`,
      unlock:{wave:12},
    },
  },
};

/* ---------- Pad layout — generous walking lanes between pads ----------
   6 Sprinkler slots on a wide outer ring; upgrade pads split across two
   interleaved inner rings so you can weave between everything.        */
const PAD_LAYOUT = (()=>{
  const pads=[];
  const R=CONFIG.arenaR;
  for(let i=0;i<6;i++){
    const a = -Math.PI/2 + i*(TAU/6);
    pads.push({ bp:'spire', slot:i, x:Math.cos(a)*R*0.66, y:Math.sin(a)*R*0.66 });
  }
  // inner upgrade pads on two interleaved rings (5 + 5)
  const ringA=['wisp','kdamage','hheart','wisptier','nova'];
  const ringB=['barrier','kfire','hregen','kspeed','kmagnet'];
  ringA.forEach((bp,i)=>{ const a=-Math.PI/2 + i*(TAU/5); pads.push({bp,x:Math.cos(a)*R*0.34,y:Math.sin(a)*R*0.34}); });
  ringB.forEach((bp,i)=>{ const a=-Math.PI/2 + Math.PI/5 + i*(TAU/5); pads.push({bp,x:Math.cos(a)*R*0.51,y:Math.sin(a)*R*0.51}); });
  return pads;
})();
