/* ============================================================
   PICNIC — config.js
   A frog defends the cake from the ants. Balance lives here.
   Build pads are REVEALED progressively (revealAt = total build
   levels completed) so the base unfolds a few options at a time.
   ============================================================ */
'use strict';

const CONFIG = {
  arenaR: 540,
  spawnR: 660,
  wallR: 372,
  totalWaves: 100,

  cake: { baseHp:150, regenPerSec:0.0, radius:58 },
  hero: { radius:20, baseSpeed:235, pickupRadius:115, baseDamage:9, baseFireRate:2.8, baseRange:250, projSpeed:660 },
  crumb:{ radius:9, magnet:600, value:1 },

  enemies: {
    ant:    { hp:14, speed:46, dmg:5,  bounty:4,  r:15, hex:0x3a261a, fly:false, name:'Ant' },
    scout:  { hp:9,  speed:94, dmg:4,  bounty:4,  r:12, hex:0x8a3320, fly:false, name:'Scout' },
    beetle: { hp:52, speed:30, dmg:14, bounty:13, r:26, hex:0x33305a, fly:false, name:'Beetle' },
    wasp:   { hp:22, speed:64, dmg:7,  bounty:7,  r:16, hex:0xe2b021, fly:true,  name:'Wasp' },
    boss:   { hp:480, speed:30, dmg:34, bounty:220, r:46, hex:0xd24f16, fly:true, name:'Hornet' },
  },

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

  blueprints:{
    spire:{ id:'spire', name:'Sprinkler', kind:'tower', max:6, accent:'water',
      cost:(lv)=> Math.round(16 * Math.pow(1.7, lv-1)),
      stat:(lv)=>({ damage: 9 + lv*7 + lv*lv*2.2, range:165 + lv*16, rate:1.5 + lv*0.26, proj:560 }),
      desc:(lv)=> lv===0 ? 'Set up a Sprinkler' : `Sprinkler → Lv ${lv+1}`, unlock:{} },
    wisp:{ id:'wisp', name:'Firefly', kind:'wisp', max:10, accent:'glow',
      cost:(lv)=> Math.round(20 * Math.pow(1.46, lv)),
      desc:(lv)=> `Call a Firefly ${lv+1}/10`, unlock:{} },
    wisptier:{ id:'wisptier', name:'Glow', kind:'upgrade', max:8, accent:'glow',
      cost:(lv)=> Math.round(34 * Math.pow(1.82, lv-1)),
      stat:(lv)=>({ damage: 5 + lv*5 + lv*lv*1.6, rate: 1.7 + lv*0.20, range:175+lv*12 }),
      desc:(lv)=> lv===0 ? 'Brighten the Fireflies' : `Firefly power → Lv ${lv+1}`, unlock:{requires:'wisp'} },
    barrier:{ id:'barrier', name:'Salt Line', kind:'wall', max:8, accent:'water',
      cost:(lv)=> Math.round(26 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ segHp: 60 + lv*85 + lv*lv*18, regen: 6+lv*3 }),
      desc:(lv)=> lv===0 ? 'Pour a Salt Line' : `Salt Line → Lv ${lv+1}`, unlock:{} },
    kdamage:{ id:'kdamage', name:'Tongue', kind:'upgrade', max:12, accent:'tongue',
      cost:(lv)=> Math.round(14 * Math.pow(1.55, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.6 }),
      desc:(lv)=> lv===0 ? 'Sharpen your tongue' : `Tongue power → +${Math.round(lv*60)}%`, unlock:{} },
    kfire:{ id:'kfire', name:'Snap', kind:'upgrade', max:10, accent:'tongue',
      cost:(lv)=> Math.round(18 * Math.pow(1.55, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.3 }),
      desc:(lv)=> lv===0 ? 'Snap quicker' : `Snap rate → +${Math.round(lv*30)}%`, unlock:{} },
    kspeed:{ id:'kspeed', name:'Hop', kind:'upgrade', max:6, accent:'tongue',
      cost:(lv)=> Math.round(22 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ mul: 1 + lv*0.15 }),
      desc:(lv)=> lv===0 ? 'Hop faster' : `Speed → +${Math.round(lv*15)}%`, unlock:{} },
    kmagnet:{ id:'kmagnet', name:'Forage', kind:'upgrade', max:5, accent:'glow',
      cost:(lv)=> Math.round(16 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ add: lv*70 }),
      desc:(lv)=> lv===0 ? 'Gather from afar' : `Pickup range → Lv ${lv+1}`, unlock:{} },
    hheart:{ id:'hheart', name:'Tier', kind:'cake', max:12, accent:'cake',
      cost:(lv)=> Math.round(28 * Math.pow(1.6, lv-1)),
      stat:(lv)=>({ maxHp: 150 + lv*150 + lv*lv*22 }),
      desc:(lv)=> lv===0 ? 'Add a cake tier' : `Cake HP → Lv ${lv+1}`, unlock:{} },
    hregen:{ id:'hregen', name:'Frosting', kind:'cake', max:8, accent:'cake',
      cost:(lv)=> Math.round(34 * Math.pow(1.68, lv-1)),
      stat:(lv)=>({ regen: lv*2.4 }),
      desc:(lv)=> lv===0 ? 'Re-frost the cake' : `Regen → ${ (lv*2.4).toFixed(1) }/s`, unlock:{} },
    nova:{ id:'nova', name:'Bug Spray', kind:'upgrade', max:6, accent:'glow',
      cost:(lv)=> Math.round(58 * Math.pow(1.78, lv-1)),
      stat:(lv)=>({ damage: 45 + lv*60 + lv*lv*20, radius: 230+lv*45, cd: Math.max(3.5, 11-lv*1.2) }),
      desc:(lv)=> lv===0 ? 'Keep a Bug Spray' : `Bug Spray → Lv ${lv+1}`, unlock:{} },
  },
};

/* ---------- Pad layout + progressive reveal ----------
   revealAt = total build-levels the player must have completed
   before this pad appears. So the base unfolds as it grows.   */
const PAD_LAYOUT = (()=>{
  const R=CONFIG.arenaR, pads=[];
  const spireReveal=[0,7,18,30,40,46];
  for(let i=0;i<6;i++){ const a=-Math.PI/2 + i*(TAU/6);
    pads.push({ bp:'spire', slot:i, x:Math.cos(a)*R*0.66, y:Math.sin(a)*R*0.66, revealAt:spireReveal[i] }); }
  const ringA=[['kdamage',0,0],['wisp',2,0],['hheart',9,3],['kfire',5,0],['hregen',22,6]];
  const ringB=[['barrier',3,0],['wisptier',12,0],['kspeed',15,0],['nova',26,8],['kmagnet',35,0]];
  ringA.forEach(([bp,rv,mw],i)=>{ const a=-Math.PI/2 + i*(TAU/5); pads.push({bp,x:Math.cos(a)*R*0.34,y:Math.sin(a)*R*0.34,revealAt:rv,minWave:mw}); });
  ringB.forEach(([bp,rv,mw],i)=>{ const a=-Math.PI/2 + Math.PI/5 + i*(TAU/5); pads.push({bp,x:Math.cos(a)*R*0.51,y:Math.sin(a)*R*0.51,revealAt:rv,minWave:mw}); });
  return pads;
})();
