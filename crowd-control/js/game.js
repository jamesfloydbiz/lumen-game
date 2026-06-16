/* ============================================================
   FLOW — game.js
   Kingshot-style crowd-safety tycoon: steer the Marshal, pour coins
   into build pads, earn coins for every person who safely gets out.
   ============================================================ */
'use strict';

class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.owned=new Set(); this.eventIndex=0; this.coins=CONFIG.startCoins;
    this.level=buildVenue(this.owned, EVENTS[0]);
    this.grid=new Grid(this.level); this.sim=new Sim(this.grid,this.level);
    this.render=new Renderer(this.canvas,this.grid,this.sim,this.level);
    this.hero={x:0,y:-6,vx:0,vy:0,aim:-Math.PI/2,moving:false};
    this.input={up:false,down:false,left:false,right:false}; this.joy={active:false,ox:0,oy:0,dx:0,dy:0,id:null};
    this.phase='menu'; this.time=0; this.last=performance.now();
    this.bindUI(); this.bindInput();
    window.addEventListener('resize',()=>this.render.resize());
    requestAnimationFrame(t=>this.loop(t));
  }

  /* ---- perks ---- */
  padCostMul(){ return this.owned.has('cheap')?0.8:1; }
  marshalSpeed(){ return CONFIG.marshal.speed * (this.owned.has('swift')?1.35:1); }
  padCost(p){ return Math.round(PAD_DEFS[p.type].cost(p.level+1)*this.padCostMul()); }

  beginRun(){ SFX.resume(); this.owned=new Set(); this.eventIndex=0; this.coins=CONFIG.startCoins; this.startEvent(); }
  startEvent(){
    const ev=EVENTS[this.eventIndex];
    this.level=buildVenue(this.owned,ev);
    this.grid=new Grid(this.level); this.sim=new Sim(this.grid,this.level);
    this.render.bind(this.grid,this.sim,this.level);
    this.hero={x:this.level.marshalStart.x,y:this.level.marshalStart.y,vx:0,vy:0,aim:-Math.PI/2,moving:false};
    this.time=0; this.spawns=this.level.spawns.map(s=>({...s,released:0}));
    this.toAdmit=0; this.admitAcc=0; this.queued=0; this.lastCleared=0; this.popAcc=0; this.flowEMA=0; this.surgeShown=false;
    this.meterRate=0;
    if(this.owned.has('coins')) this.coins+=25;
    // pre-built meter perk
    if(this.owned.has('premeter')){ const mp=this.level.pads.find(p=>p.type==='meter'); mp.level=1; this.applyPad(mp,true); }
    this.phase='play';
    ['start','end','shop','pause'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    document.getElementById('hud').classList.remove('hidden'); document.getElementById('readout').classList.add('show');
    this.banner('EVENT '+(this.eventIndex+1), ev.name); this.toast(ev.intro); SFX.wave();
  }

  applyPad(p,silent){
    if(p.type==='steward') this.rebuildStewards();
    else if(p.type==='widen'){ this.sim.widenPinch(0.9); this.render.setExitVisual(this.sim.pinches[0].hw*2); }
    this.recomputeMeter();
    if(!silent) this.render.onBuild(p);
  }
  recomputeMeter(){ const mp=this.level.pads.find(p=>p.type==='meter'), wp=this.level.pads.find(p=>p.type==='widen');
    this.meterRate = (mp&&mp.level>0) ? (METER_BASE_RATE + 1.2*(wp?wp.level:0)) : 0; }
  rebuildStewards(){ const list=[]; for(const p of this.level.pads){ if(p.type==='steward'&&p.level>0){ const s=PAD_DEFS.steward.stat(p.level); list.push({x:p.x,y:p.y,r:s.r,tol:s.tol}); } } this.grid.setStewards(list); }

  updateBuild(dt){ const h=this.hero;
    for(const p of this.level.pads){ const def=PAD_DEFS[p.type]; if(p.level>=def.max) continue;
      if(U.dist(h.x,h.y,p.x,p.y)<CONFIG.marshal.padReach && this.coins>0){
        const cost=this.padCost(p), rate=CONFIG.marshal.drainPerSec;
        const t=Math.min(rate*dt,this.coins,cost-p.invested); this.coins-=t; p.invested+=t;
        if(p.invested>=cost-1e-6){ p.invested-=cost; p.level++; this.applyPad(p); SFX.build(); }
      } }
  }

  /* ---- end / shop ---- */
  eventCleared(){ this.phase='shop'; this.render.hidePads(); const last=this.eventIndex>=EVENTS.length-1;
    document.getElementById('shopTitle').textContent=last?'The season is safe':'Event cleared';
    document.getElementById('shopSub').textContent=last?'Every crowd kept out of the red. Spend what you earned, or take a bow.':`You cleared ${this.sim.cleared} people without a crush. Reinvest, then the next crowd arrives.`;
    document.getElementById('nextBtn').textContent=last?'Finish':'Next event'; this.buildShop();
    document.getElementById('shop').classList.remove('hidden'); SFX.win(); }
  nextEvent(){ if(this.eventIndex>=EVENTS.length-1){ this.done(); return; } this.eventIndex++; this.startEvent(); }
  done(){ this.phase='done'; this.render.hidePads();
    document.getElementById('endTitle').textContent='A safe season';
    document.getElementById('endText').textContent='Every event, every crowd, kept out of the red — by routing, not forcing.';
    document.getElementById('eTime').textContent='—'; document.getElementById('eCleared').textContent=this.sim.cleared; document.getElementById('ePeak').textContent=this.grid.worstDens.toFixed(1)+' p/m²';
    document.getElementById('againBtn').textContent='New run'; document.getElementById('end').classList.remove('hidden'); }
  lose(){ if(this.phase==='over') return; this.phase='over'; this.render.hidePads(); SFX.lose();
    document.getElementById('endTitle').textContent='A crush formed';
    document.getElementById('endText').textContent='Density held past the crush threshold. Build the Entry Meter to hold the crowd outside — the fix is upstream, not at the jam.';
    document.getElementById('eTime').textContent=this.clockStr(); document.getElementById('eCleared').textContent=this.sim.cleared; document.getElementById('ePeak').textContent=this.grid.worstDens.toFixed(1)+' p/m²';
    document.getElementById('againBtn').textContent='Try again'; document.getElementById('end').classList.remove('hidden'); }
  togglePause(f){ if(this.phase!=='play'&&this.phase!=='pause') return; this.phase=(f===undefined?(this.phase==='play'):f)?'pause':'play'; const el=document.getElementById('pause');
    if(this.phase==='pause'){ document.getElementById('pTime').textContent=this.clockStr(); document.getElementById('pCleared').textContent=this.sim.cleared; document.getElementById('pSafety').textContent=Math.round(this.safety()*100)+'%'; el.classList.remove('hidden'); } else el.classList.add('hidden'); }

  buildShop(){ document.getElementById('shopCredits').textContent=Math.floor(this.coins);
    const list=document.getElementById('shopList'); list.innerHTML='';
    for(const u of UPGRADES){ const owned=this.owned.has(u.id), poor=!owned&&this.coins<u.cost;
      const el=document.createElement('div'); el.className='shop-item'+(owned?' bought':'')+(poor?' poor':'');
      el.innerHTML=`<div class="si-main"><div class="si-name">${u.name}</div><div class="si-desc">${u.desc}</div></div>`+(owned?`<div class="si-cost">OWNED</div>`:`<div class="si-cost"><span class="mote-dot"></span>${u.cost}</div>`);
      if(!owned&&!poor) el.onclick=()=>{ this.coins-=u.cost; this.owned.add(u.id); SFX.build(); this.buildShop(); };
      list.appendChild(el); } }

  bindUI(){ const $=i=>document.getElementById(i);
    $('playBtn').onclick=()=>this.beginRun(); $('againBtn').onclick=()=>{ if(this.phase==='done') this.beginRun(); else this.startEvent(); };
    $('nextBtn').onclick=()=>this.nextEvent(); $('pauseBtn').onclick=()=>this.togglePause(true); $('resumeBtn').onclick=()=>this.togglePause(false);
    $('restartBtn').onclick=()=>{ this.togglePause(false); this.beginRun(); };
    $('muteBtn').onclick=e=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); }; }

  bindInput(){
    const keymap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
    addEventListener('keydown',e=>{ if(e.code==='Escape'){this.togglePause();return;} if(keymap[e.code]){this.input[keymap[e.code]]=true;e.preventDefault();} });
    addEventListener('keyup',e=>{ if(keymap[e.code]) this.input[keymap[e.code]]=false; });
    const cv=this.canvas, stick=document.getElementById('stick'), nub=document.getElementById('stickNub');
    const down=(px,py,id)=>{ this.joy.active=true; this.joy.id=id; this.joy.ox=px; this.joy.oy=py; this.joy.dx=0; this.joy.dy=0; stick.style.left=px+'px'; stick.style.top=py+'px'; stick.classList.remove('hidden'); nub.style.transform='translate(-50%,-50%)'; };
    const move=(px,py)=>{ if(!this.joy.active) return; let dx=px-this.joy.ox,dy=py-this.joy.oy; const max=54,d=Math.hypot(dx,dy); if(d>max){dx=dx/d*max;dy=dy/d*max;} this.joy.dx=dx/max; this.joy.dy=dy/max; nub.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`; };
    const up=()=>{ this.joy.active=false; this.joy.dx=0; this.joy.dy=0; stick.classList.add('hidden'); };
    cv.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; down(t.clientX,t.clientY,t.identifier); e.preventDefault(); },{passive:false});
    cv.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) move(t.clientX,t.clientY); } e.preventDefault(); },{passive:false});
    cv.addEventListener('touchend',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) up(); } }); cv.addEventListener('touchcancel',up);
    cv.addEventListener('mousedown',e=>down(e.clientX,e.clientY,'m')); addEventListener('mousemove',e=>move(e.clientX,e.clientY)); addEventListener('mouseup',up);
  }

  moveHero(dt){ const h=this.hero,C=CONFIG;
    let mx=(this.input.right?1:0)-(this.input.left?1:0), my=(this.input.down?1:0)-(this.input.up?1:0);
    if(this.joy.active&&(this.joy.dx||this.joy.dy)){ mx=this.joy.dx; my=this.joy.dy; }
    const ml=Math.hypot(mx,my); if(ml>1){ mx/=ml; my/=ml; }
    h.moving=ml>0.1; if(h.moving) h.aim=Math.atan2(my,mx);
    const sp=this.marshalSpeed(); let nx=h.x+mx*sp*dt, ny=h.y+my*sp*dt;
    if(!this.grid.walkableAt(nx,ny)){ if(this.grid.walkableAt(nx,h.y)) ny=h.y; else if(this.grid.walkableAt(h.x,ny)) nx=h.x; else { nx=h.x; ny=h.y; } }
    nx=U.clamp(nx,-C.worldW/2+1.5,C.worldW/2-1.5); ny=U.clamp(ny,-C.worldH/2+1.5,C.worldH/2-1.5);
    h.x=nx; h.y=ny; }

  /* ---- arrivals -> outside queue -> metered admission ---- */
  releaseSpawns(){ for(const s of this.spawns){ if(this.time<s.t) continue;
    const elapsed=Math.min(this.time,s.t+s.over)-s.t, want=Math.floor(elapsed/s.over*s.count);
    if(want>s.released){ this.toAdmit+=(want-s.released); s.released=want; }
    if(s.count>200&&this.time>=s.t&&!this.surgeShown){ this.surgeShown=true; this.banner('THE SURGE','Hold them outside — build the Entry Meter'); SFX.boss(); } } }
  admit(dt){ const e=this.level.entry,g=this.grid; const rate=this.meterRate>0?this.meterRate:1e9;
    this.admitAcc+=Math.min(this.toAdmit,rate*dt);
    while(this.admitAcc>=1&&this.toAdmit>=1){ let x,y,t=0; do{ x=e.x+U.rand(-e.w/2,e.w/2); y=e.y+U.rand(0,2); t++; }while(!g.walkableAt(x,y)&&t<8); this.sim.add(x,y); this.admitAcc-=1; this.toAdmit-=1; }
    this.queued=Math.floor(this.toAdmit); }
  allCleared(){ return this.spawns.every(s=>s.released>=s.count)&&this.toAdmit<1&&this.sim.n===0; }

  update(dt){
    this.time+=dt; this.moveHero(dt); this.updateBuild(dt);
    this.releaseSpawns(); this.admit(dt); this.sim.step(dt); this.grid.updateDwell(dt);
    const d=this.sim.cleared-this.lastCleared; this.flowEMA=(this.flowEMA||0)*0.93+(d/dt)*0.07; this.lastCleared=this.sim.cleared;
    if(d>0){ this.coins+=d*CONFIG.earnPerClear; this.popAcc+=d; while(this.popAcc>=3){ this.popAcc-=3; this.render.coinPop(this.level.goal.x+U.rand(-1.5,1.5), this.level.goal.y); } }
    if(this.grid.worstDwell>=CONFIG.dwellFail){ this.lose(); return; }
    if(this.time>=this.level.duration||this.allCleared()){ this.eventCleared(); return; }
    this.syncHUD();
  }
  safety(){ return U.clamp(1-this.grid.worstDwell/CONFIG.dwellFail,0,1); }
  clockStr(){ const t=Math.floor(this.time); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); }
  syncHUD(){ const C=CONFIG;
    document.getElementById('clock').textContent=this.clockStr();
    document.getElementById('cleared').textContent=this.sim.cleared;
    document.getElementById('credits').textContent=Math.floor(this.coins);
    const s=this.safety(); const f=document.getElementById('safetyFill'); f.style.width=(s*100)+'%';
    f.style.background=s<0.34?'linear-gradient(90deg,#ff4d3a,#ff9a86)':'linear-gradient(90deg,var(--gold),var(--gold-soft))';
    document.getElementById('safetyTxt').textContent=Math.round(s*100)+'%';
    const peak=this.grid.curDens||0, warn=peak>=C.dDanger;
    const q=this.queued>0?` · <span style="color:var(--ink-dim)">queued outside ${this.queued}</span>`:'';
    document.getElementById('readout').innerHTML=`clearing <b>${(this.flowEMA||0).toFixed(1)}/s</b> · peak density <span class="${warn?'warn':''}" style="${warn?'':(peak>=C.dCrit?'color:#ffb86a':'')}">${peak.toFixed(1)} p/m²</span>${q}`;
  }
  banner(k,n){ const b=document.getElementById('banner'); b.innerHTML=`<span class="wb-k">${k}</span><span class="wb-n">${n}</span>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  toast(msg){ const t=document.getElementById('toast'); t.innerHTML=msg; t.classList.add('show'); clearTimeout(this._tt); this._tt=setTimeout(()=>t.classList.remove('show'),2800); }

  loop(now){ let dt=(now-this.last)/1000; this.last=now; if(dt>0.033) dt=0.033;
    if(this.phase==='play') this.update(dt);
    const t=this.time;
    this.render.syncHeat(); this.render.syncCrowd(); this.render.syncMarshal(this.hero,t);
    if(this.phase==='play') this.render.updatePads(this,t); this.render.updateFx(dt);
    this.render.draw();
    requestAnimationFrame(t2=>this.loop(t2));
  }
}

window.addEventListener('load',()=>{ window.game=new Game(); });
