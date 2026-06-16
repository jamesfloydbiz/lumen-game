/* ============================================================
   MONKEY BREACH — game.js
   Move the zookeeper, auto-net the monkeys (trap, never harm),
   pour coins into build pads, and let the wave-end truck cart the
   trapped monkeys back to the zoo. Guard the banana pile.
   ============================================================ */
'use strict';

class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.render=new Renderer(this.canvas,this);
    this.hero={x:0,y:8,aim:-Math.PI/2,moving:false};
    this.input={up:false,down:false,left:false,right:false}; this.joy={active:false,ox:0,oy:0,dx:0,dy:0,id:null};
    this.phase='menu'; this.time=0; this.last=performance.now();
    this.bindUI(); this.bindInput();
    window.addEventListener('resize',()=>this.render.resize());
    requestAnimationFrame(t=>this.loop(t));
  }

  beginRun(){ SFX.resume(); this.coins=CONFIG.startCoins; this.bananas=CONFIG.bananas; this.wave=0;
    this.pads=PAD_LAYOUT.map(p=>({...p,level:0,invested:0})); this.render.buildPads(this.pads);
    this.monkeys=[]; this.nets=[]; this.netTowers=[]; this.decoys=[]; this.cages=[]; this.muds=[]; this.fences=[];
    this.render.updatePile(this.bananas);
    this.hero={x:0,y:8,aim:-Math.PI/2,moving:false};
    ['start','end'].forEach(id=>document.getElementById(id).classList.add('hidden'));
    document.getElementById('hud').classList.remove('hidden');
    this.nextWave();
  }
  nextWave(){ this.wave++; if(this.wave>CONFIG.totalWaves){ this.win(); return; }
    const w=CONFIG.waveSpec(this.wave); this.breaches=w.breaches; this.render.buildFence(w.breaches);
    this.breachXs=CONFIG.breachXs(w.breaches);
    this.spawnQueue=[]; const tw=w.pool.reduce((s,p)=>s+p[1],0);
    for(let i=0;i<w.count;i++){ let r=Math.random()*tw,pick=w.pool[0][0]; for(const [k,v] of w.pool){ if((r-=v)<=0){pick=k;break;} } this.spawnQueue.push(pick); }
    this.spawnInterval=w.interval; this.spawnTimer=1.0; this.phase='play';
    this.fenceSealed=false;
    this.banner('WAVE '+this.wave, this.wave===1?'Stand on a pad to build · guard the bananas':'');
    SFX.wave();
  }
  win(){ this.phase='over'; this.render.hidePads(); SFX.win();
    document.getElementById('endTitle').textContent='Zoo secured'; document.getElementById('endText').textContent='Every breach held, every monkey home, the bananas safe. The keeper rests.';
    document.getElementById('eWave').textContent=CONFIG.totalWaves; document.getElementById('eBananas').textContent=this.bananas; document.getElementById('eCoins').textContent=Math.floor(this.coins);
    document.getElementById('againBtn').textContent='New run'; document.getElementById('end').classList.remove('hidden'); }
  lose(){ if(this.phase==='over') return; this.phase='over'; this.render.hidePads(); SFX.lose();
    document.getElementById('endTitle').textContent='The bananas are gone'; document.getElementById('endText').textContent='The pile was carried off through the breach. Build nets and decoys sooner, and trap the carriers before they run.';
    document.getElementById('eWave').textContent=this.wave; document.getElementById('eBananas').textContent=0; document.getElementById('eCoins').textContent=Math.floor(this.coins);
    document.getElementById('againBtn').textContent='Try again'; document.getElementById('end').classList.remove('hidden'); }
  togglePause(f){ if(this.phase!=='play'&&this.phase!=='pause'&&this.phase!=='truck') return; const playing=this.phase==='pause'?false:true;
    if(f===undefined) f=this.phase!=='pause'; this._prePause=this._prePause||'play';
    if(f){ this._prePause=this.phase; this.phase='pause'; document.getElementById('pWave').textContent=this.wave; document.getElementById('pBananas').textContent=this.bananas; document.getElementById('pCoins').textContent=Math.floor(this.coins); document.getElementById('pause').classList.remove('hidden'); }
    else { this.phase=this._prePause||'play'; document.getElementById('pause').classList.add('hidden'); } }

  /* ---- input ---- */
  bindUI(){ const $=i=>document.getElementById(i);
    $('playBtn').onclick=()=>this.beginRun(); $('againBtn').onclick=()=>this.beginRun();
    $('pauseBtn').onclick=()=>this.togglePause(true); $('resumeBtn').onclick=()=>this.togglePause(false);
    $('restartBtn').onclick=()=>{ this.togglePause(false); this.beginRun(); };
    $('muteBtn').onclick=e=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); }; }
  bindInput(){ const keymap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
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
  moveHero(dt){ const h=this.hero,C=CONFIG; let mx=(this.input.right?1:0)-(this.input.left?1:0), my=(this.input.down?1:0)-(this.input.up?1:0);
    if(this.joy.active&&(this.joy.dx||this.joy.dy)){ mx=this.joy.dx; my=this.joy.dy; } const ml=Math.hypot(mx,my); if(ml>1){ mx/=ml; my/=ml; }
    h.moving=ml>0.1; h.x=U.clamp(h.x+mx*C.hero.speed*dt,-C.worldW/2+2,C.worldW/2-2); h.y=U.clamp(h.y+my*C.hero.speed*dt,C.breachY+3,C.worldH/2-2);
  }

  /* ---- build pads ---- */
  padCost(p){ return CONFIG.pads[p.type].cost(p.level+1); }
  updateBuild(dt){ const h=this.hero; for(const p of this.pads){ const def=CONFIG.pads[p.type]; if(p.level>=def.max) continue;
    if(U.dist(h.x,h.y,p.x,p.y)<CONFIG.hero.padReach && this.coins>0){ const cost=this.padCost(p), t=Math.min(CONFIG.hero.drainPerSec*dt,this.coins,cost-p.invested); this.coins-=t; p.invested+=t;
      if(p.invested>=cost-1e-6){ p.invested-=cost; p.level++; this.applyPad(p); SFX.build(); } } } }
  applyPad(p){ this.render.onBuild(p); this.rebuildTowers(); }
  rebuildTowers(){ this.netTowers=[]; this.decoys=[]; this.cages=[]; this.muds=[]; this.fences=[];
    for(const p of this.pads){ if(p.level<1) continue; const s=CONFIG.pads[p.type].stat(p.level);
      if(p.type==='net') this.netTowers.push({x:p.x,y:p.y,range:s.range,rate:s.rate,cd:0});
      else if(p.type==='decoy') this.decoys.push({x:p.x,y:p.y,pull:s.pull});
      else if(p.type==='cage') this.cages.push({x:p.x,y:p.y,r:s.r,cd:s.cd,timer:0});
      else if(p.type==='mud') this.muds.push({x:p.x,y:p.y,r:s.r,slow:s.slow});
      else if(p.type==='fence') this.fences.push({x:p.x,y:p.y,dur:s.dur,cd:s.cd,timer:0,on:false}); }
  }

  /* ---- monkeys ---- */
  spawn(type){ const def=CONFIG.monkeys[type]; const bx=U.choice(this.breachXs);
    this.monkeys.push({type,def,x:bx+U.rand(-3,3),y:CONFIG.breachY,state:'incoming',carrying:false,netHits:0,grabT:0,wob:U.rand(TAU),struggle:0,face:Math.PI/2,target:null,mesh:null}); }
  assignTarget(m){ if(this.decoys.length && !m.def.decoyProof){ let best=null,bd=1e9; for(const d of this.decoys){ const dd=U.dist2(m.x,m.y,d.x,d.y); if(dd<bd){bd=dd;best=d;} } m.target={x:best.x,y:best.y,kind:'decoy'}; }
    else m.target={x:CONFIG.pile.x,y:CONFIG.pile.y,kind:'pile'}; }
  nearestBreach(x){ let best=this.breachXs[0],bd=1e9; for(const bx of this.breachXs){ const d=Math.abs(bx-x); if(d<bd){bd=d;best=bx;} } return best; }
  mudFactor(x,y){ let f=1; for(const z of this.muds){ if(U.dist2(x,y,z.x,z.y)<z.r*z.r) f=Math.min(f,z.slow); } return f; }

  updateMonkeys(dt){ const list=this.monkeys;
    for(let i=list.length-1;i>=0;i--){ const m=list[i]; m.wob+=dt*9;
      if(m.state==='trapped'){ m.struggle+=dt*7; continue; }
      if(!m.target) this.assignTarget(m);
      const spd=m.def.speed*this.mudFactor(m.x,m.y);
      if(m.state==='incoming'){
        const tx=m.target.x,ty=m.target.y, d=U.dist(m.x,m.y,tx,ty); m.face=U.ang(m.x,m.y,tx,ty);
        if(d<2.4){ m.state='grab'; m.grabT=m.def.grab; }
        else { m.x+=Math.cos(m.face)*spd*dt; m.y+=Math.sin(m.face)*spd*dt; }
      } else if(m.state==='grab'){
        m.grabT-=dt; if(m.grabT<=0){ if(m.target.kind==='pile'){ if(this.bananas>0){ this.bananas--; this.render.updatePile(this.bananas); m.carrying=true; if(this.bananas<=0){ this.lose(); } } }
          m.state='fleeing'; const bx=this.nearestBreach(m.x); m.flee={x:bx,y:CONFIG.breachY}; }
      } else if(m.state==='fleeing'){
        const tx=m.flee.x,ty=m.flee.y; m.face=U.ang(m.x,m.y,tx,ty); m.x+=Math.cos(m.face)*spd*dt; m.y+=Math.sin(m.face)*spd*dt;
        if(m.y<=CONFIG.breachY+1){ // escaped — carried banana is lost for good
          this.render.removeMonkeyMesh(m); list.splice(i,1); }
      }
      // cage traps
      for(const c of this.cages){ if(c.timer<=0 && m.state!=='trapped' && U.dist2(m.x,m.y,c.x,c.y)<c.r*c.r){ this.trap(m); c.timer=c.cd; this.render.burst(c.x,c.y,ACCENT.net); } }
    }
    for(const c of this.cages) c.timer=Math.max(0,c.timer-dt);
  }
  trap(m){ m.state='trapped'; m.netHits=m.def.nets; }
  hitNet(m){ m.netHits++; if(m.netHits>=m.def.nets) this.trap(m); }

  activeMonkeys(){ let n=0; for(const m of this.monkeys) if(m.state!=='trapped') n++; return n; }
  nearestActive(x,y,range){ let best=null,bd=range*range; for(const m of this.monkeys){ if(m.state==='trapped') continue; const d=U.dist2(x,y,m.x,m.y); if(d<bd){bd=d;best=m;} } return best; }

  fireNet(x,y,target){ const a=U.ang(x,y,target.x,target.y); this.nets.push({x,y,vx:Math.cos(a)*CONFIG.hero.netSpeed,vy:Math.sin(a)*CONFIG.hero.netSpeed,target,life:1.2}); SFX.shoot(); }
  updateNets(dt){ for(let i=this.nets.length-1;i>=0;i--){ const n=this.nets[i]; n.x+=n.vx*dt; n.y+=n.vy*dt; n.life-=dt; const t=n.target;
    if(!t || t.state==='trapped' || U.dist(n.x,n.y,t.x,t.y)<1.8){ if(t && t.state!=='trapped' && U.dist(n.x,n.y,t.x,t.y)<2.6) this.hitNet(t); this.nets.splice(i,1); continue; }
    if(n.life<=0){ this.nets.splice(i,1); } } }
  updateTowers(dt){ for(const tw of this.netTowers){ tw.cd-=dt; if(tw.cd<=0){ const m=this.nearestActive(tw.x,tw.y,tw.range); if(m){ tw.cd=1/tw.rate; this.fireNet(tw.x,tw.y,m); } } } }

  /* ---- truck (wave end) ---- */
  startTruck(){ this.phase='truck'; this.truck={stage:'in',x:this.breachXs[0]||0,y:CONFIG.breachY,t:0,loadT:0,paid:0}; SFX.turret(); }
  updateTruck(dt){ const tr=this.truck;
    if(tr.stage==='in'){ tr.y=U.approach(tr.y,10,18,dt); this.render.setTruck(true,tr.x,tr.y,0); if(tr.y>=9.5) tr.stage='load';
    } else if(tr.stage==='load'){ this.render.setTruck(true,tr.x,tr.y,0); tr.loadT-=dt;
      if(tr.loadT<=0){ const m=this.monkeys.find(mm=>mm.state==='trapped'); if(m){ this.coins+=m.def.bounty; if(m.carrying){ this.bananas++; this.render.updatePile(this.bananas); } this.render.coinPop(tr.x,tr.y+3); this.render.removeMonkeyMesh(m); this.monkeys.splice(this.monkeys.indexOf(m),1); tr.loadT=0.22; SFX.pickup(); }
        else tr.stage='out'; }
    } else { tr.y=U.approach(tr.y,CONFIG.breachY-14,22,dt); this.render.setTruck(true,tr.x,tr.y,0); if(tr.y<=CONFIG.breachY-13){ this.render.setTruck(false); this.endTruck(); } }
  }
  endTruck(){ this.monkeys=this.monkeys.filter(m=>{ if(m.state!=='trapped'){ return true; } this.render.removeMonkeyMesh(m); return false; }); this.nextWave(); }

  /* ---- loop ---- */
  update(dt){ this.time+=dt; this.moveHero(dt); this.updateBuild(dt);
    if(this.phase==='truck'){ this.updateTruck(dt); return; }
    // spawn
    if(this.spawnQueue.length){ this.spawnTimer-=dt; if(this.spawnTimer<=0){ this.spawn(this.spawnQueue.shift()); this.spawnTimer=this.spawnInterval; } }
    this.updateMonkeys(dt); this.updateTowers(dt); this.updateNets(dt);
    // hero auto-net
    this.hero.cd=(this.hero.cd||0)-dt; const tgt=this.nearestActive(this.hero.x,this.hero.y,CONFIG.hero.netRange);
    if(tgt){ this.hero.aim=U.ang(this.hero.x,this.hero.y,tgt.x,tgt.y); if(this.hero.cd<=0){ this.hero.cd=1/CONFIG.hero.netRate; this.fireNet(this.hero.x,this.hero.y,tgt); } }
    if(this.bananas<=0){ this.lose(); return; }
    // wave end -> truck
    if(this.spawnQueue.length===0 && this.activeMonkeys()===0){ if(this.monkeys.length) this.startTruck(); else this.nextWave(); }
    this.syncHUD();
  }
  syncHUD(){ document.getElementById('waveNum').textContent=this.wave; document.getElementById('bananaNum').textContent=this.bananas; document.getElementById('coinNum').textContent=Math.floor(this.coins); }
  banner(k,n){ const b=document.getElementById('banner'); b.innerHTML=`<span class="wb-k">${k}</span>`+(n?`<span class="wb-s">${n}</span>`:''); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }

  loop(now){ let dt=(now-this.last)/1000; this.last=now; if(dt>0.033) dt=0.033;
    if(this.phase==='play'||this.phase==='truck') this.update(dt);
    const t=this.time;
    if(this.monkeys) this.render.syncMonkeys(this.monkeys);
    this.render.syncNets(this.nets||[]); this.render.syncHero(this.hero,t);
    if(this.pads && this.phase!=='over'&&this.phase!=='menu') this.render.updatePads(this,t); else this.render.hidePads();
    this.render.updateFx(dt); this.render.draw();
    requestAnimationFrame(t2=>this.loop(t2));
  }
}
window.addEventListener('load',()=>{ window.game=new Game(); });
