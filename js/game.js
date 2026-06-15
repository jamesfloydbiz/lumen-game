/* ============================================================
   FLOW — game.js
   Orchestrator: builds the level, runs spawns, places tools,
   drives the HUD, and watches the lose/win conditions.
   ============================================================ */
'use strict';

const TOOLBTNS=[
  {id:'barrier', name:'Barrier',  cost:CONFIG.tools.barrier.cost},
  {id:'gate',    name:'Gate',     cost:CONFIG.tools.gate.cost},
  {id:'paCalm',  name:'PA: Calm', cost:CONFIG.tools.pa.cost},
  {id:'paHurry', name:'PA: Hurry',cost:CONFIG.tools.pa.cost},
];

class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.level=LEVELS.concert;
    this.grid=new Grid(this.level);
    this.sim=new Sim(this.grid, this.level);
    this.render=new Renderer(this.canvas, this.grid, this.sim, this.level);
    this.phase='menu'; this.time=0; this.last=performance.now();
    this.credits=CONFIG.startCredits; this.tool=null;
    this.dragStart=null;
    this.buildDock(); this.bindUI(); this.bindInput();
    window.addEventListener('resize',()=>this.render.resize());
    requestAnimationFrame(t=>this.loop(t));
  }

  resetRun(){
    this.grid=new Grid(this.level);
    this.sim=new Sim(this.grid, this.level);
    this.render.grid=this.grid; this.render.sim=this.sim;
    this.render.tex=new THREE.DataTexture(this.grid.img,this.grid.cols,this.grid.rows,THREE.RGBAFormat);
    this.render.tex.magFilter=THREE.LinearFilter; this.render.tex.minFilter=THREE.LinearFilter;
    this.render.floor.material.map=this.render.tex; this.render.floor.material.needsUpdate=true;
    this.render.refreshTools();
    this.time=0; this.credits=CONFIG.startCredits; this.tool=null;
    this.spawns=this.level.spawns.map(s=>({...s,released:0}));
    this.toAdmit=0; this.admitAcc=0; this.queued=0; this.surgeShown=false;
    this.syncDock();
  }
  start(){ SFX.resume(); this.resetRun(); this.phase='play';
    document.getElementById('start').classList.add('hidden');
    document.getElementById('end').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('readout').classList.add('show');
    this.banner('CONCERT LETTING OUT','Keep every cell out of the red'); SFX.wave(); }
  over(win){ if(this.phase==='over') return; this.phase='over'; win?SFX.win():SFX.lose();
    document.getElementById('endTitle').textContent = win?'The crowd is safe':'A crush formed';
    document.getElementById('endText').textContent = win
      ? 'Everyone got out without a single cell holding in the red. That is the whole job — and you did it by routing, not forcing.'
      : 'Density held past the crush threshold. The fix is never at the red — it is upstream, where there is still space to act.';
    document.getElementById('eTime').textContent=this.clockStr();
    document.getElementById('eCleared').textContent=this.sim.cleared;
    document.getElementById('ePeak').textContent=this.grid.worstDens.toFixed(1)+' p/m²';
    document.getElementById('end').classList.remove('hidden'); }
  togglePause(f){ if(this.phase!=='play'&&this.phase!=='pause') return; this.phase=(f===undefined?(this.phase==='play'):f)?'pause':'play';
    const el=document.getElementById('pause');
    if(this.phase==='pause'){ document.getElementById('pTime').textContent=this.clockStr(); document.getElementById('pCleared').textContent=this.sim.cleared;
      document.getElementById('pSafety').textContent=Math.round(this.safety()*100)+'%'; el.classList.remove('hidden'); } else el.classList.add('hidden'); }

  /* ---- dock / ui ---- */
  buildDock(){ const dock=document.getElementById('dock'); dock.innerHTML='';
    this.btnEls={}; for(const b of TOOLBTNS){ const el=document.createElement('div'); el.className='tool';
      el.innerHTML=`<span class="t-name">${b.name}</span><span class="t-cost"><span class="t-coin"></span>${b.cost}</span>`;
      el.onclick=()=>this.selectTool(b.id); dock.appendChild(el); this.btnEls[b.id]={el, cost:b.cost, costEl:el.querySelector('.t-cost')}; } }
  selectTool(id){ this.tool=(this.tool===id?null:id); this.syncDock(); if(!this.tool) this.render.setGhost(null); }
  syncDock(){ for(const id in this.btnEls){ const b=this.btnEls[id]; b.el.classList.toggle('sel', this.tool===id);
    b.costEl.classList.toggle('poor', this.credits<b.cost); } }
  bindUI(){ const $=i=>document.getElementById(i);
    $('playBtn').onclick=()=>this.start(); $('againBtn').onclick=()=>this.start();
    $('pauseBtn').onclick=()=>this.togglePause(true); $('resumeBtn').onclick=()=>this.togglePause(false);
    $('restartBtn').onclick=()=>{ this.togglePause(false); this.start(); };
    $('muteBtn').onclick=e=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); }; }

  bindInput(){
    const cv=this.canvas;
    const w=e=>this.render.screenToWorld(e.clientX,e.clientY);
    cv.addEventListener('pointermove',e=>{ if(this.phase!=='play'||!this.tool){ this.render.setGhost(null); return; }
      const p=w(e); this.render.setGhost(this.ghostKind(), p.x, p.y, this.canPlace(p.x,p.y).ok); });
    cv.addEventListener('pointerdown',e=>{ if(this.phase!=='play'||!this.tool) return; const p=w(e);
      if(this.tool==='barrier'){ this.dragStart=p; } });
    cv.addEventListener('pointerup',e=>{ if(this.phase!=='play'||!this.tool) return; const p=w(e);
      if(this.tool==='barrier'&&this.dragStart){ this.placeBarrier(this.dragStart,p); this.dragStart=null; }
      else this.placeAt(p.x,p.y); });
    addEventListener('keydown',e=>{ if(e.code==='Escape') this.togglePause();
      const m={Digit1:'barrier',Digit2:'gate',Digit3:'paCalm',Digit4:'paHurry'}; if(m[e.code]) this.selectTool(m[e.code]); });
  }
  ghostKind(){ return this.tool==='barrier'?'barrier':(this.tool==='gate'?'gate':'pa'); }

  canPlace(x,y){ const C=CONFIG;
    if(x<-C.worldW/2+1||x>C.worldW/2-1||y<-C.worldH/2+1||y>C.worldH/2-1) return {ok:false,msg:'Out of bounds'};
    if(this.grid.densAt(x,y)>=C.dDanger) return {ok:false,msg:'Never touch the crush — act upstream'};
    const cost=this.tool==='barrier'?C.tools.barrier.cost:(this.tool==='gate'?C.tools.gate.cost:C.tools.pa.cost);
    if(this.credits<cost) return {ok:false,msg:'Not enough credits'};
    if(this.tool!=='barrier'&&!this.grid.walkableAt(x,y)&&this.tool==='gate') return {ok:false,msg:'Place on open ground'};
    return {ok:true,cost};
  }
  placeAt(x,y){ const c=this.canPlace(x,y); if(!c.ok){ this.toast(c.msg); return; }
    if(this.tool==='gate'){
      // click near existing gate removes it (so you can re-place / A-B)
      const ng=this.sim.gates.find(g=>U.dist(g.x,g.y,x,y)<4); if(ng){ this.sim.gates.splice(this.sim.gates.indexOf(ng),1); this.credits+=Math.floor(c.cost/2); this.render.refreshTools(); this.syncDock(); return; }
      this.sim.addGate(x,y,CONFIG.tools.gate.width); this.credits-=c.cost; SFX.build();
    } else { // PA
      const exist=this.sim.paZones.find(z=>U.dist(z.x,z.y,x,y)<z.r*0.6); if(exist){ this.sim.paZones.splice(this.sim.paZones.indexOf(exist),1); this.credits+=Math.floor(c.cost/2); this.render.refreshTools(); this.syncDock(); return; }
      this.sim.paZones.push({x,y,r:CONFIG.tools.pa.radius, factor:this.tool==='paCalm'?CONFIG.urgencyCalm:CONFIG.urgencyHurry}); this.credits-=c.cost; SFX.build();
    }
    this.render.refreshTools(); this.syncDock();
  }
  placeBarrier(a,b){ const c=this.canPlace(a.x,a.y); if(!c.ok){ this.toast(c.msg); return; }
    let bx=b.x,by=b.y; const len=U.dist(a.x,a.y,bx,by); if(len<1.5){ const [dx,dy]=this.grid.dirAt(a.x,a.y); const tx=-dy,ty=dx; bx=a.x+tx*3.5; by=a.y+ty*3.5; a={x:a.x-tx*3.5,y:a.y-ty*3.5}; }
    this.grid.stampSeg(a.x,a.y,bx,by); this.grid.reflood(); this.credits-=c.cost; SFX.build(); this.render.refreshTools(); this.syncDock();
  }

  /* ---- arrivals: schedule -> outside queue -> metered admission ---- */
  releaseSpawns(){
    for(const s of this.spawns){ if(this.time<s.t) continue;
      const elapsed=Math.min(this.time, s.t+s.over)-s.t; const want=Math.floor(elapsed/s.over*s.count);
      if(want>s.released){ this.toAdmit+=(want-s.released); s.released=want; }
      if(s.count>400 && this.time>=s.t && !this.surgeShown){ this.surgeShown=true; this.banner('THE SURGE','Hold them outside — meter the entry'); SFX.boss(); }
    }
  }
  admit(dt){ const e=this.level.entry, g=this.grid;
    const eg=this.sim.gates.find(z=>z.y<=this.level.entryMeterY);   // a gate in the entry zone meters admission
    const rate= eg ? eg.rate : 1e9;
    this.admitAcc+=Math.min(this.toAdmit, rate*dt);
    while(this.admitAcc>=1 && this.toAdmit>=1){ let x,y,t=0; do{ x=e.x+U.rand(-e.w/2,e.w/2); y=e.y+U.rand(0,2); t++; }while(!g.walkableAt(x,y)&&t<8); this.sim.add(x,y); this.admitAcc-=1; this.toAdmit-=1; }
    this.queued=Math.floor(this.toAdmit);
  }
  allReleased(){ return this.spawns.every(s=>s.released>=s.count) && this.toAdmit<1; }

  /* ---- loop ---- */
  update(dt){
    this.time+=dt; this.releaseSpawns(); this.admit(dt);
    this.sim.step(dt);
    this.grid.updateDwell(dt);
    if(this.grid.worstDwell>=CONFIG.dwellFail){ this.over(false); return; }
    if(this.time>=this.level.duration || (this.allReleased() && this.sim.n===0)){ this.over(true); return; }
    this.syncHUD();
  }
  safety(){ return U.clamp(1 - this.grid.worstDwell/CONFIG.dwellFail, 0, 1); }
  clockStr(){ const t=Math.floor(this.time); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); }
  syncHUD(){ const C=CONFIG;
    document.getElementById('clock').textContent=this.clockStr();
    document.getElementById('cleared').textContent=this.sim.cleared;
    document.getElementById('credits').textContent=this.credits;
    const s=this.safety(); const f=document.getElementById('safetyFill'); f.style.width=(s*100)+'%';
    f.style.background = s<0.34?'linear-gradient(90deg,#ff4d3a,#ff9a86)':'linear-gradient(90deg,var(--gold),var(--gold-soft))';
    document.getElementById('safetyTxt').textContent=Math.round(s*100)+'%';
    // readout: pinch throughput + upstream density
    const ex=this.sim.pinch; const dUp=this.grid.densAt(ex.x-ex.nx*1.2, ex.y-ex.ny*1.2);
    const peak=this.grid.curDens||0, warn=peak>=C.dDanger;
    const q=this.queued>0?` · <span style="color:var(--ink-dim)">queued outside ${this.queued}</span>`:'';
    document.getElementById('readout').innerHTML=`pinch flow <b>${ex.passing.toFixed(1)}/s</b> · peak density <span class="${warn?'warn':''}" style="${warn?'':(peak>=C.dCrit?'color:#ffb86a':'')}">${peak.toFixed(1)} p/m²</span>${q}`;
    this.syncDock();
  }
  banner(k,n){ const b=document.getElementById('banner'); b.innerHTML=`<span class="wb-k">${k}</span><span class="wb-n">${n}</span>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  toast(msg){ const t=document.getElementById('toast'); t.innerHTML=msg; t.classList.add('show'); clearTimeout(this._tt); this._tt=setTimeout(()=>t.classList.remove('show'),2000); }

  loop(now){ let dt=(now-this.last)/1000; this.last=now; if(dt>0.033) dt=0.033;
    if(this.phase==='play') this.update(dt);
    // keep sim visuals fresh even when paused/menu (density may be empty)
    this.render.syncHeat(); this.render.syncCrowd();
    this.render.draw();
    requestAnimationFrame(t=>this.loop(t));
  }
}

window.addEventListener('load',()=>{ window.game=new Game(); });
