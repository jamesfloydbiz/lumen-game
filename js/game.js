/* ============================================================
   LUMEN — game.js
   Entities, economy, waves, rendering, input, UI.
   ============================================================ */
'use strict';

const NSEG = 28;            // wall ring segments
const PAD_R = 46;           // build-pad interaction radius (world)
const DRAIN_TIME = 0.85;    // seconds to fully fund a pad you can afford

class Game{
  constructor(){
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1;
    this._cx=0; this._cy=0; this._s=1; this._shx=0; this._shy=0;
    this.shake=0; this.flashWall=0;

    this.started=false; this.paused=false; this.ended=false;
    this.last=performance.now(); this.time=0; this.rot=0;

    this.input={up:false,down:false,left:false,right:false};
    this.joy={active:false,ox:0,oy:0,x:0,y:0,dx:0,dy:0,id:null};

    this.bindUI();
    this.bindInput();
    this.resize();
    window.addEventListener('resize',()=>this.resize());
    this.reset();
    requestAnimationFrame(t=>this.loop(t));
  }

  /* ---------------- lifecycle ---------------- */
  reset(){
    const C=CONFIG;
    this.gold=0; this.kills=0; this.totalGold=0;
    this.wave=0; this.waveState='idle'; this.prepTimer=0;
    this.spawnQueue=[]; this.spawnTimer=0; this.spawnInterval=1;
    this.bossAlive=false;

    this.keeper={ x:0, y:140, vx:0, vy:0, aim:-Math.PI/2, fireCd:0, trail:0 };
    this.heart={ hp:C.heart.baseHp, maxHp:C.heart.baseHp, regen:0, hitFlash:0 };

    this.enemies=[]; this.shots=[]; this.motes=[]; this.particles=[]; this.floats=[]; this.wisps=[];
    this.novaTimer=0; this.novaStats=null;

    // wall ring
    this.wall={active:false};
    this.seg=[]; for(let i=0;i<NSEG;i++) this.seg.push({hp:0,maxHp:0,lastHit:99});

    // build pads
    this.pads = PAD_LAYOUT.map(p=>({
      bp:p.bp, slot:p.slot, x:p.x, y:p.y,
      def:CONFIG.blueprints[p.bp],
      level:0, invested:0, unlocked:false, pop:0,
    }));
    this.evalUnlocks(true);
  }

  start(){
    SFX.resume();
    this.reset();
    this.started=true; this.ended=false; this.paused=false;
    document.getElementById('start').classList.add('hidden');
    document.getElementById('end').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.nextWave();
  }

  end(win){
    if(this.ended) return;
    this.ended=true;
    this.bossAlive=false;
    win?SFX.win():SFX.lose();
    this.addShake(win?10:18);
    document.getElementById('endTitle').textContent = win?'The Light Holds':'The Dusk Falls';
    document.getElementById('endText').textContent = win
      ? 'You carried the Heartlight through all one hundred waves. Dawn is yours.'
      : 'The Heartlight was overrun — but the Dusk will not have it easily next time.';
    document.getElementById('eWave').textContent = this.wave;
    document.getElementById('eKills').textContent = U.fmt(this.kills);
    document.getElementById('eGold').textContent = U.fmt(this.totalGold);
    document.getElementById('end').classList.remove('hidden');
  }

  togglePause(force){
    if(!this.started||this.ended) return;
    this.paused = force!==undefined?force:!this.paused;
    const el=document.getElementById('pause');
    if(this.paused){
      document.getElementById('pWave').textContent=this.wave;
      document.getElementById('pGold').textContent=U.fmt(this.gold);
      document.getElementById('pHeart').textContent=Math.ceil(100*this.heart.hp/this.heart.maxHp)+'%';
      el.classList.remove('hidden');
    } else el.classList.add('hidden');
  }

  /* ---------------- waves ---------------- */
  nextWave(){
    this.wave++;
    if(this.wave>CONFIG.totalWaves){ this.end(true); return; }
    const n=this.wave;
    const boss=CONFIG.isBossWave(n);
    let count=CONFIG.waveCount(n);
    if(boss) count=Math.round(count*0.7);

    // weighted pool -> queue
    const pool=CONFIG.wavePool(n);
    const totalW=pool.reduce((s,p)=>s+p[1],0);
    this.spawnQueue=[];
    for(let i=0;i<count;i++){
      let r=Math.random()*totalW, pick=pool[0][0];
      for(const [k,w] of pool){ if((r-=w)<=0){pick=k;break;} }
      this.spawnQueue.push(pick);
    }
    if(boss) this.spawnQueue.push('boss');
    // shuffle a little so the boss isn't always last
    if(boss){ const bi=this.spawnQueue.length-1, j=U.randInt(Math.floor(count*0.4),count); [this.spawnQueue[bi],this.spawnQueue[j]]=[this.spawnQueue[j],this.spawnQueue[bi]]; }

    this.spawnInterval = U.clamp(0.7 - n*0.0072, 0.08, 0.7);
    this.spawnTimer = 0.4;
    this.waveState='active';
    this.evalUnlocks();
    this.showBanner(n, boss?'A presence approaches':null);
    boss?SFX.boss():SFX.wave();
  }

  spawn(typeKey){
    const C=CONFIG, n=this.wave;
    const base=C.enemies[typeKey];
    const isBoss = typeKey==='boss';
    const a=U.rand(TAU), R=C.spawnR;
    const hpm = isBoss ? C.bossHpMul(n) : C.hpMul(n);
    const hp = base.hp*hpm;
    const e={
      type:typeKey, boss:isBoss,
      x:Math.cos(a)*R, y:Math.sin(a)*R,
      hp:hp, maxHp:hp,
      speed: base.speed * C.spdMul(n) * (isBoss?0.85:1),
      dmg: base.dmg * C.dmgMul(n),
      r: base.r, color: base.color,
      bounty: Math.ceil(base.bounty * C.bountyMul(n)),
      hitFlash:0, spin:U.rand(TAU), wob:U.rand(TAU),
    };
    if(isBoss){ this.bossAlive=true; this.addShake(8); }
    this.enemies.push(e);
  }

  /* ---------------- build / economy ---------------- */
  getPad(id){ return this.pads.find(p=>p.bp===id); }
  getLevel(id){ const p=this.getPad(id); return p?p.level:0; }
  costArg(pad){ return pad.bp==='wisp' ? pad.level : pad.level+1; }
  nextCost(pad){ return pad.def.cost(this.costArg(pad)); }
  maxed(pad){ return pad.level >= pad.def.max; }

  evalUnlocks(silent){
    for(const p of this.pads){
      if(p.unlocked) continue;
      const u=p.def.unlock||{};
      const waveOk = !u.wave || this.wave>=u.wave;
      const reqOk = !u.requires || this.getLevel(u.requires)>0;
      if(waveOk && reqOk){
        p.unlocked=true;
        if(!silent){ this.toast(`<span class="t-em">Unlocked</span> ${p.def.name}`); SFX.unlock(); p.pop=1; }
      }
    }
  }

  applyLevel(pad){
    const bp=pad.def, lv=pad.level;
    pad.pop=1;
    this.burst(pad.x,pad.y,16,bp.accent==='gold'?42:190,{spread:90,glow:true});
    this.ring(pad.x,pad.y,bp.accent==='gold'?'rgba(255,214,107,':'rgba(127,231,255,',58,'expand');
    this.float(pad.x,pad.y-18, bp.name+' Lv '+lv, bp.accent==='gold'?'var(--gold)':'var(--light)');
    SFX.build();

    switch(bp.kind){
      case 'wisp': this.addWisp(); break;
      case 'wall':{
        const s=bp.stat(lv); this.wall.active=true;
        for(const sg of this.seg){ sg.maxHp=s.segHp; sg.hp=s.segHp; }
        this.wall.regen=s.regen; this.flashWall=1;
        break;
      }
      case 'heart':{
        if(bp.id==='hheart'){ const s=bp.stat(lv); const d=s.maxHp-this.heart.maxHp; this.heart.maxHp=s.maxHp; this.heart.hp+=Math.max(0,d); }
        if(bp.id==='hregen'){ this.heart.regen=bp.stat(lv).regen; }
        break;
      }
      case 'upgrade':
        if(bp.id==='nova'){ this.novaStats=bp.stat(lv); if(this.novaTimer<=0) this.novaTimer=this.novaStats.cd; }
        break;
      // tower & keeper upgrades are read live via getLevel()
    }
    this.evalUnlocks();
  }

  addWisp(){
    this.wisps.push({ a:U.rand(TAU), fireCd:U.rand(0.5), x:this.keeper.x, y:this.keeper.y });
  }

  updateBuild(dt){
    const k=this.keeper;
    for(const p of this.pads){
      if(!p.unlocked || this.maxed(p)) continue;
      const near = U.dist(k.x,k.y,p.x,p.y) < PAD_R + CONFIG.keeper.radius;
      if(near && this.gold>0){
        const cost=this.nextCost(p);
        const rate=Math.max(30, cost/DRAIN_TIME);
        let t=Math.min(rate*dt, this.gold, cost-p.invested);
        this.gold-=t; p.invested+=t;
        if(Math.random()<dt*22) this.spark(k.x,k.y,p.x,p.y,p.def.accent);
        if(p.invested >= cost-1e-6){
          p.invested-=cost; p.level++;
          this.applyLevel(p);
          if(this.maxed(p)) p.invested=0;
        }
      }
    }
  }

  /* ---------------- input ---------------- */
  bindInput(){
    const keymap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
    addEventListener('keydown',e=>{
      if(e.code==='Escape'){ this.togglePause(); return; }
      if(keymap[e.code]){ this.input[keymap[e.code]]=true; e.preventDefault(); }
    });
    addEventListener('keyup',e=>{ if(keymap[e.code]) this.input[keymap[e.code]]=false; });

    const cv=this.canvas;
    const stick=document.getElementById('stick'), nub=document.getElementById('stickNub');
    const down=(px,py,id)=>{
      this.joy.active=true; this.joy.id=id; this.joy.ox=px; this.joy.oy=py; this.joy.dx=0; this.joy.dy=0;
      stick.style.left=px+'px'; stick.style.top=py+'px'; stick.classList.remove('hidden');
      nub.style.transform='translate(-50%,-50%)';
    };
    const move=(px,py)=>{
      if(!this.joy.active) return;
      let dx=px-this.joy.ox, dy=py-this.joy.oy;
      const max=52, d=Math.hypot(dx,dy);
      if(d>max){ dx=dx/d*max; dy=dy/d*max; }
      this.joy.dx=dx/max; this.joy.dy=dy/max;
      nub.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
    };
    const up=()=>{ this.joy.active=false; this.joy.dx=0; this.joy.dy=0; stick.classList.add('hidden'); };

    cv.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; down(t.clientX,t.clientY,t.identifier); e.preventDefault(); },{passive:false});
    cv.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id){ move(t.clientX,t.clientY); } } e.preventDefault(); },{passive:false});
    cv.addEventListener('touchend',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) up(); } });
    cv.addEventListener('touchcancel',up);

    cv.addEventListener('mousedown',e=>down(e.clientX,e.clientY,'m'));
    addEventListener('mousemove',e=>move(e.clientX,e.clientY));
    addEventListener('mouseup',up);
  }

  bindUI(){
    const $=id=>document.getElementById(id);
    $('playBtn').onclick=()=>this.start();
    $('againBtn').onclick=()=>this.start();
    $('pauseBtn').onclick=()=>this.togglePause(true);
    $('resumeBtn').onclick=()=>this.togglePause(false);
    $('restartBtn').onclick=()=>{ this.togglePause(false); this.start(); };
    $('muteBtn').onclick=(e)=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); };
  }

  /* ---------------- main update ---------------- */
  update(dt){
    this.time+=dt; this.rot+=dt*0.4;
    this.shake=Math.max(0,this.shake-dt*40);
    this.flashWall=Math.max(0,this.flashWall-dt*2);
    const k=this.keeper, C=CONFIG;

    // movement: keyboard or joystick
    let mx=(this.input.right?1:0)-(this.input.left?1:0);
    let my=(this.input.down?1:0)-(this.input.up?1:0);
    if(this.joy.active && (this.joy.dx||this.joy.dy)){ mx=this.joy.dx; my=this.joy.dy; }
    const ml=Math.hypot(mx,my);
    if(ml>1){ mx/=ml; my/=ml; }
    const spd=C.keeper.baseSpeed * C.blueprints.kspeed.stat(this.getLevel('kspeed')).mul;
    k.x+=mx*spd*dt; k.y+=my*spd*dt;
    // keep inside island
    const kd=Math.hypot(k.x,k.y), lim=C.arenaR-C.keeper.radius;
    if(kd>lim){ k.x=k.x/kd*lim; k.y=k.y/kd*lim; }
    if(ml>0.1){ k.trail-=dt; if(k.trail<=0){ k.trail=0.03; this.particles.push({x:k.x,y:k.y,vx:0,vy:0,life:0.4,max:0.4,r:6,h:200,glow:true,kind:'spark'}); } }

    this.updateBuild(dt);

    // spawning
    if(this.waveState==='active'){
      this.spawnTimer-=dt;
      if(this.spawnTimer<=0 && this.spawnQueue.length && this.enemies.length<C.aliveCap){
        this.spawn(this.spawnQueue.shift());
        this.spawnTimer=this.spawnInterval;
      }
      if(this.spawnQueue.length===0 && this.enemies.length===0){
        this.waveState='prep'; this.prepTimer=2.2;
        const bonus=Math.ceil(8+this.wave*2.5);
        this.gold+=bonus; this.totalGold+=bonus;
        this.toast(`Wave ${this.wave} cleared · <span class="t-em">+${bonus}</span> motes`);
      }
    } else if(this.waveState==='prep'){
      this.prepTimer-=dt;
      if(this.prepTimer<=0) this.nextWave();
    }

    // keeper auto-fire
    const kdmg=C.keeper.baseDamage*C.blueprints.kdamage.stat(this.getLevel('kdamage')).mul;
    const krate=C.keeper.baseFireRate*C.blueprints.kfire.stat(this.getLevel('kfire')).mul;
    k.fireCd-=dt;
    const tgt=this.nearestEnemy(k.x,k.y,C.keeper.baseRange);
    if(tgt){ k.aim=U.ang(k.x,k.y,tgt.x,tgt.y); }
    if(tgt && k.fireCd<=0){
      k.fireCd=1/krate;
      this.fireShot(k.x,k.y,tgt,kdmg,C.keeper.projSpeed,200,'keeper');
      SFX.shoot();
    }

    this.updateTowers(dt);
    this.updateWisps(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateMotes(dt);
    this.updateNova(dt);
    this.updateWall(dt);

    // heart regen
    if(this.heart.regen>0 && this.heart.hp<this.heart.maxHp){
      this.heart.hp=Math.min(this.heart.maxHp,this.heart.hp+this.heart.regen*dt);
    }
    this.heart.hitFlash=Math.max(0,this.heart.hitFlash-dt*3);
    if(this.heart.hp<=0){ this.heart.hp=0; this.end(false); }

    // particles & floats
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i]; p.life-=dt;
      if(p.kind==='ring'){ p.r+=p.vr*dt; }
      else { p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.94; p.vy*=0.94; }
      if(p.life<=0) this.particles.splice(i,1);
    }
    for(let i=this.floats.length-1;i>=0;i--){
      const f=this.floats[i]; f.life-=dt; f.y-=24*dt; if(f.life<=0) this.floats.splice(i,1);
    }

    for(const p of this.pads) p.pop=Math.max(0,p.pop-dt*2.2);
  }

  nearestEnemy(x,y,range){
    let best=null,bd=range*range;
    for(const e of this.enemies){ const d=U.dist2(x,y,e.x,e.y); if(d<bd){bd=d;best=e;} }
    return best;
  }

  fireShot(x,y,tgt,dmg,speed,life,owner){
    const a=U.ang(x,y,tgt.x,tgt.y);
    this.shots.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,dmg,life:life/speed*1.2+0.2,owner,r:owner==='keeper'?5:4});
  }

  updateTowers(dt){
    const C=CONFIG;
    for(const p of this.pads){
      if(p.bp!=='spire'||p.level<1) continue;
      p.fireCd=(p.fireCd||0)-dt;
      const s=C.blueprints.spire.stat(p.level);
      if(p.fireCd<=0){
        const t=this.nearestEnemy(p.x,p.y,s.range);
        if(t){ p.fireCd=1/s.rate; this.fireShot(p.x,p.y-14,t,s.damage,s.proj,s.range,'spire'); SFX.turret(); }
      }
    }
  }

  updateWisps(dt){
    const C=CONFIG, k=this.keeper, n=this.wisps.length;
    if(!n) return;
    const s=C.blueprints.wisptier.stat(this.getLevel('wisptier'));
    this.wRot=(this.wRot||0)+dt*1.1;
    for(let i=0;i<n;i++){
      const w=this.wisps[i];
      const a=this.wRot + i*(TAU/n);
      const rad=52+ (n>6?14:0);
      w.x=U.lerp(w.x, k.x+Math.cos(a)*rad, Math.min(1,dt*8));
      w.y=U.lerp(w.y, k.y+Math.sin(a)*rad, Math.min(1,dt*8));
      w.fireCd-=dt;
      if(w.fireCd<=0){
        const t=this.nearestEnemy(w.x,w.y,s.range);
        if(t){ w.fireCd=1/s.rate; this.fireShot(w.x,w.y,t,s.damage,520,s.range,'wisp'); }
      }
    }
  }

  updateEnemies(dt){
    const C=CONFIG, list=this.enemies;
    for(let i=list.length-1;i>=0;i--){
      const e=list[i];
      e.hitFlash=Math.max(0,e.hitFlash-dt*4);
      e.wob+=dt*6;
      const dist=Math.hypot(e.x,e.y)||0.001;
      let ux=-e.x/dist, uy=-e.y/dist;
      // light separation
      let sx=0,sy=0;
      for(let j=0;j<list.length;j++){ if(j===i) continue; const o=list[j];
        const dx=e.x-o.x, dy=e.y-o.y, dd=dx*dx+dy*dy, rr=(e.r+o.r);
        if(dd>0.01 && dd<rr*rr){ const d=Math.sqrt(dd); sx+=dx/d; sy+=dy/d; }
      }
      let nx=e.x+(ux*e.speed + sx*22)*dt;
      let ny=e.y+(uy*e.speed + sy*22)*dt;
      let nd=Math.hypot(nx,ny), ang=Math.atan2(ny,nx);

      // wall collision
      if(this.wall.active && nd>C.wallR && nd<C.wallR+e.r+6){
        const idx=((Math.floor(((ang+TAU)%TAU)/TAU*NSEG))%NSEG+NSEG)%NSEG;
        const sg=this.seg[idx];
        if(sg.hp>0){
          nd=C.wallR+e.r; nx=Math.cos(ang)*nd; ny=Math.sin(ang)*nd;
          sg.hp-=e.dmg*dt; sg.lastHit=0;
          if(Math.random()<dt*10) this.burst((nx+Math.cos(ang)*8),(ny+Math.sin(ang)*8),2,190,{spread:30,glow:true,life:0.3});
          if(sg.hp<=0){ this.burst(nx,ny,10,190,{spread:60,glow:true}); this.flashWall=1; }
        }
      }
      // heart contact
      const hr=C.heart.radius+e.r;
      if(nd<hr){
        nd=hr; nx=Math.cos(ang)*hr; ny=Math.sin(ang)*hr;
        this.heart.hp-=e.dmg*dt; this.heart.hitFlash=1;
        if(Math.random()<dt*6) this.burst(nx,ny,2,0,{spread:30,glow:true,life:0.3,red:true});
      }
      e.x=nx; e.y=ny;

      if(e.hp<=0){ this.killEnemy(e,i); }
    }
  }

  killEnemy(e,i){
    this.enemies.splice(i,1);
    this.kills++;
    if(e.boss){ this.bossAlive=false; this.addShake(14); SFX.boss(); this.ring(e.x,e.y,'rgba(255,107,139,',e.r*2,'expand'); }
    SFX.kill();
    this.burst(e.x,e.y, e.boss?40:12, e.color, {spread:e.boss?180:80,glow:true,shard:true});
    // drop motes
    const n = e.boss?14:Math.min(8,1+Math.floor(e.bounty/3));
    const per = e.bounty/n;
    for(let m=0;m<n;m++){
      const a=U.rand(TAU), s=U.rand(20,90);
      this.motes.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,val:per,life:CONFIG.mote.life,born:0});
    }
  }

  updateShots(dt){
    const list=this.shots;
    for(let i=list.length-1;i>=0;i--){
      const s=list[i];
      s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=dt;
      let hit=false;
      for(const e of this.enemies){
        if(U.dist2(s.x,s.y,e.x,e.y) < (e.r+s.r)*(e.r+s.r)){
          e.hp-=s.dmg; e.hitFlash=1; hit=true;
          this.burst(s.x,s.y,3,e.color,{spread:40,glow:true,life:0.25});
          SFX.hit();
          break;
        }
      }
      if(hit||s.life<=0||Math.hypot(s.x,s.y)>CONFIG.spawnR+60) list.splice(i,1);
    }
  }

  updateMotes(dt){
    const C=CONFIG, k=this.keeper, list=this.motes;
    const pr=C.keeper.pickupRadius + C.blueprints.kmagnet.stat(this.getLevel('kmagnet')).add;
    for(let i=list.length-1;i>=0;i--){
      const m=list[i]; m.born+=dt; m.life-=dt;
      m.vx*=0.9; m.vy*=0.9;
      const d=U.dist(k.x,k.y,m.x,m.y);
      if(d<pr){
        const a=U.ang(m.x,m.y,k.x,k.y), pull=C.mote.magnet*(0.4+0.6*(1-d/pr));
        m.vx=U.lerp(m.vx,Math.cos(a)*pull,0.4); m.vy=U.lerp(m.vy,Math.sin(a)*pull,0.4);
      }
      m.x+=m.vx*dt; m.y+=m.vy*dt;
      if(d<C.keeper.radius+8){
        this.gold+=m.val; this.totalGold+=m.val;
        this.burst(k.x,k.y,1,46,{spread:20,glow:true,life:0.3});
        SFX.pickup(); list.splice(i,1); continue;
      }
      if(m.life<=0) list.splice(i,1);
    }
  }

  updateNova(dt){
    if(this.getLevel('nova')<1 || !this.novaStats) return;
    this.novaTimer-=dt;
    if(this.novaTimer<=0){
      const s=this.novaStats; this.novaTimer=s.cd;
      this.ring(0,0,'rgba(255,214,107,',s.radius,'nova');
      this.addShake(6); SFX.build();
      for(const e of this.enemies){
        if(Math.hypot(e.x,e.y) < s.radius+e.r){
          e.hp-=s.damage; e.hitFlash=1;
          const a=Math.atan2(e.y,e.x); e.x+=Math.cos(a)*24; e.y+=Math.sin(a)*24;
        }
      }
    }
  }

  updateWall(dt){
    if(!this.wall.active) return;
    const rg=this.wall.regen||0;
    for(const sg of this.seg){
      sg.lastHit+=dt;
      if(sg.lastHit>2 && sg.hp<sg.maxHp){ sg.hp=Math.min(sg.maxHp,sg.hp+rg*dt); }
    }
  }

  /* ---------------- particles helpers ---------------- */
  addShake(m){ this.shake=Math.min(26,this.shake+m); }
  burst(x,y,n,h,o={}){
    const spread=o.spread||60, life=o.life||0.5;
    for(let i=0;i<n;i++){
      const a=U.rand(TAU), sp=U.rand(spread*0.3,spread);
      this.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
        life:life*U.rand(0.6,1.1),max:life,r:U.rand(2,o.shard?5:4),
        h:o.red?0:h, sat:o.red?90:80, light:o.red?64:70, glow:o.glow,
        kind:o.shard&&U.chance(0.5)?'shard':'spark',rot:U.rand(TAU)});
    }
  }
  ring(x,y,colorPrefix,r,kind){
    this.particles.push({x,y,kind:'ring',r:8,vr:(r-8)/(kind==='nova'?0.45:0.5),
      life:kind==='nova'?0.45:0.5,max:0.5,cp:colorPrefix,lw:kind==='nova'?6:3});
  }
  spark(fx,fy,tx,ty,accent){
    const a=U.ang(fx,fy,tx,ty)+U.rand(-0.4,0.4), sp=U.rand(120,240);
    this.particles.push({x:fx,y:fy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.4,max:0.4,r:3,
      h:accent==='gold'?46:200,sat:90,light:70,glow:true,kind:'spark'});
  }
  float(x,y,text,color){ this.floats.push({x,y,text,color,life:1.4}); }

  /* ---------------- HUD / banners ---------------- */
  toast(html){
    const t=document.getElementById('toast');
    t.innerHTML=html; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT=setTimeout(()=>t.classList.remove('show'),2200);
  }
  showBanner(n,sub){
    const b=document.getElementById('waveBanner');
    const boss=CONFIG.isBossWave(n);
    b.innerHTML=`<span class="wb-k">${boss?'BOSS WAVE':'WAVE'}</span><span class="wb-n">${n}</span>`+(sub?`<span class="wb-s">${sub}</span>`:'');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  syncHUD(){
    document.getElementById('waveNum').textContent=this.wave;
    document.getElementById('goldNum').textContent=U.fmt(this.gold);
    const pct=U.clamp(this.heart.hp/this.heart.maxHp,0,1);
    document.getElementById('heartFill').style.width=(pct*100)+'%';
    document.getElementById('heartTxt').textContent=Math.ceil(pct*100)+'%';
    document.getElementById('heartFill').style.background = pct<0.3
      ? 'linear-gradient(90deg,#ff6b8b,#ffb3c4)'
      : 'linear-gradient(90deg,var(--light),var(--light-soft))';
  }

  /* ---------------- rendering ---------------- */
  resize(){
    const dpr=Math.min(2,window.devicePixelRatio||1); this.dpr=dpr;
    const w=window.innerWidth, h=window.innerHeight;
    this.canvas.width=w*dpr; this.canvas.height=h*dpr;
    this.canvas.style.width=w+'px'; this.canvas.style.height=h+'px';
    this.W=w; this.H=h;
    this._cx=w/2; this._cy=h/2;
    this._s=Math.min(w,h)/(2*CONFIG.arenaR)*0.96;
  }
  sx(x){ return this._cx + x*this._s + this._shx; }
  sy(y){ return this._cy + y*this._s + this._shy; }

  draw(){
    const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    if(this.shake>0){ this._shx=U.rand(-this.shake,this.shake); this._shy=U.rand(-this.shake,this.shake);} else {this._shx=0;this._shy=0;}
    const s=this._s;

    // background
    const g=ctx.createRadialGradient(this._cx,this._cy*0.7,0,this._cx,this._cy,Math.max(this.W,this.H)*0.8);
    g.addColorStop(0,'#11132a'); g.addColorStop(0.5,'#0b0c1c'); g.addColorStop(1,'#050510');
    ctx.fillStyle=g; ctx.fillRect(0,0,this.W,this.H);

    this.drawArena(ctx,s);
    this.drawWall(ctx,s);
    this.drawPads(ctx,s);
    this.drawMotes(ctx,s);
    this.drawHeart(ctx,s);
    // shadows
    ctx.globalAlpha=0.4;
    for(const e of this.enemies) this.shadow(ctx,e.x,e.y,e.r*0.9,s);
    this.shadow(ctx,this.keeper.x,this.keeper.y,14,s);
    ctx.globalAlpha=1;

    this.drawEnemies(ctx,s);
    this.drawTowers(ctx,s);
    this.drawWisps(ctx,s);
    this.drawKeeper(ctx,s);
    this.drawShots(ctx,s);
    this.drawParticles(ctx,s);
    this.drawFloats(ctx,s);
    this.drawVignette(ctx);
  }

  shadow(ctx,x,y,r,s){
    ctx.fillStyle='rgba(0,0,10,0.5)';
    ctx.beginPath(); ctx.ellipse(this.sx(x),this.sy(y)+r*s*0.7,r*s,r*s*0.4,0,0,TAU); ctx.fill();
  }

  drawArena(ctx,s){
    const R=CONFIG.arenaR*s, cx=this.sx(0), cy=this.sy(0);
    // island disc
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,R);
    g.addColorStop(0,'rgba(40,46,92,0.55)'); g.addColorStop(0.7,'rgba(24,27,58,0.5)'); g.addColorStop(1,'rgba(14,16,38,0.15)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fill();
    // concentric rings
    ctx.lineWidth=1;
    for(let i=1;i<=4;i++){
      ctx.strokeStyle=`rgba(127,231,255,${0.05+ (i===2?0.03:0)})`;
      ctx.beginPath(); ctx.arc(cx,cy,R*(i/4.2),0,TAU); ctx.stroke();
    }
    // edge glow
    ctx.strokeStyle='rgba(127,231,255,0.18)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.stroke();
  }

  drawWall(ctx,s){
    if(!this.wall.active) return;
    const R=CONFIG.wallR*s, cx=this.sx(0), cy=this.sy(0);
    ctx.lineWidth=Math.max(3,7*s+2); ctx.lineCap='butt';
    for(let i=0;i<NSEG;i++){
      const sg=this.seg[i];
      const a0=i/NSEG*TAU - 0.012, a1=(i+1)/NSEG*TAU + 0.012;
      const ratio=sg.maxHp>0?U.clamp(sg.hp/sg.maxHp,0,1):0;
      if(ratio<=0.02){ ctx.strokeStyle='rgba(127,231,255,0.06)'; }
      else{
        const fl=this.flashWall*0.5;
        ctx.strokeStyle=`hsla(190,90%,${55+fl*20}%,${0.25+ratio*0.6})`;
      }
      ctx.beginPath(); ctx.arc(cx,cy,R,a0,a1); ctx.stroke();
    }
  }

  drawPads(ctx,s){
    for(const p of this.pads){
      if(!p.unlocked) continue;
      const cx=this.sx(p.x), cy=this.sy(p.y), r=PAD_R*s;
      const accent = p.def.accent==='gold';
      const col = accent?'255,214,107':'127,231,255';
      const maxed=this.maxed(p);
      const cost=maxed?0:this.nextCost(p);
      const near=U.dist(this.keeper.x,this.keeper.y,p.x,p.y)<PAD_R+CONFIG.keeper.radius;
      const pop=1+p.pop*0.25;

      // dashed pad
      ctx.save();
      ctx.translate(cx,cy);
      ctx.scale(pop,pop);
      ctx.setLineDash([6,7]);
      ctx.lineWidth=2;
      ctx.strokeStyle=`rgba(${col},${maxed?0.25:(near?0.95:0.55)})`;
      ctx.beginPath();
      const rr=r*0.78;
      ctx.moveTo(-rr,-rr*0.62); // rounded-ish square
      this.roundRect(ctx,-rr,-rr*0.7,rr*2,rr*1.4,8);
      ctx.stroke();
      ctx.setLineDash([]);

      // icon
      this.drawPadIcon(ctx,p,col,rr,maxed);

      ctx.restore();

      // progress ring while funding
      if(!maxed && p.invested>0){
        const prog=U.clamp(p.invested/cost,0,1);
        ctx.lineWidth=3; ctx.strokeStyle=`rgba(${col},0.9)`;
        ctx.beginPath(); ctx.arc(cx,cy,r*0.95,-Math.PI/2,-Math.PI/2+prog*TAU); ctx.stroke();
      }

      // label + cost
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const lvTxt = p.bp==='wisp'?`${p.level}/${p.def.max}`:(p.level>0?`Lv ${p.level}`:'');
      ctx.font=`600 ${Math.max(9,11*s)}px -apple-system,sans-serif`;
      ctx.fillStyle=`rgba(${col},0.95)`;
      ctx.fillText(p.def.name+(lvTxt?'  '+lvTxt:''), cx, cy - r*0.9 - 8*s);
      if(maxed){
        ctx.fillStyle=`rgba(${col},0.6)`;
        ctx.fillText('MAX', cx, cy + r*0.9 + 9*s);
      } else {
        ctx.font=`600 ${Math.max(10,13*s)}px -apple-system,sans-serif`;
        const enough=this.gold>=cost-p.invested;
        ctx.fillStyle = enough?'#ffe6a8':'rgba(255,230,168,0.45)';
        // little coin
        const ty=cy + r*0.9 + 10*s;
        const tw=ctx.measureText(U.fmt(Math.max(0,Math.ceil(cost-p.invested)))).width;
        ctx.beginPath(); ctx.fillStyle=enough?'#ffd66b':'rgba(255,214,107,0.4)';
        ctx.arc(cx - tw/2 - 7*s, ty, 4*s, 0, TAU); ctx.fill();
        ctx.fillStyle = enough?'#ffe6a8':'rgba(255,230,168,0.45)';
        ctx.fillText(U.fmt(Math.max(0,Math.ceil(cost-p.invested))), cx + 4*s, ty);
      }
    }
  }

  drawPadIcon(ctx,p,col,rr,maxed){
    ctx.strokeStyle=`rgba(${col},${maxed?0.4:0.95})`;
    ctx.fillStyle=`rgba(${col},${maxed?0.3:0.85})`;
    ctx.lineWidth=2.2; ctx.lineJoin='round';
    const k=rr*0.5;
    ctx.beginPath();
    switch(p.bp){
      case 'spire': // tower triangle
        ctx.moveTo(0,-k); ctx.lineTo(k*0.7,k*0.6); ctx.lineTo(-k*0.7,k*0.6); ctx.closePath(); ctx.fill(); break;
      case 'wisp': // orbiting dot
        ctx.arc(0,0,k*0.4,0,TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0,0,k*0.9,0,TAU); ctx.stroke(); break;
      case 'wisptier': // sparkle
        for(let i=0;i<4;i++){const a=i*Math.PI/2; ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*k,Math.sin(a)*k);} ctx.stroke(); break;
      case 'barrier': // shield
        ctx.moveTo(0,-k); ctx.lineTo(k*0.8,-k*0.4); ctx.lineTo(k*0.8,k*0.3); ctx.lineTo(0,k); ctx.lineTo(-k*0.8,k*0.3); ctx.lineTo(-k*0.8,-k*0.4); ctx.closePath(); ctx.stroke(); break;
      case 'kdamage': // crosshair/arrow
        ctx.moveTo(-k,0); ctx.lineTo(k,0); ctx.moveTo(k,0); ctx.lineTo(k*0.4,-k*0.4); ctx.moveTo(k,0); ctx.lineTo(k*0.4,k*0.4); ctx.stroke(); break;
      case 'kfire': // bolt
        ctx.moveTo(k*0.2,-k); ctx.lineTo(-k*0.4,k*0.1); ctx.lineTo(k*0.1,k*0.1); ctx.lineTo(-k*0.2,k); ctx.stroke(); break;
      case 'kspeed': // chevrons
        for(let i=-1;i<=1;i++){ctx.moveTo(-k*0.5,i*k*0.5-k*0.2); ctx.lineTo(0,i*k*0.5+k*0.1); ctx.lineTo(k*0.5,i*k*0.5-k*0.2);} ctx.stroke(); break;
      case 'kmagnet': // ring magnet
        ctx.arc(0,0,k*0.7,0.6,TAU-0.6); ctx.stroke(); break;
      case 'hheart': // diamond core
        ctx.moveTo(0,-k); ctx.lineTo(k*0.7,0); ctx.lineTo(0,k); ctx.lineTo(-k*0.7,0); ctx.closePath(); ctx.fill(); break;
      case 'hregen': // plus
        ctx.moveTo(0,-k); ctx.lineTo(0,k); ctx.moveTo(-k,0); ctx.lineTo(k,0); ctx.stroke(); break;
      case 'nova': // burst
        for(let i=0;i<8;i++){const a=i*Math.PI/4; ctx.moveTo(Math.cos(a)*k*0.3,Math.sin(a)*k*0.3); ctx.lineTo(Math.cos(a)*k,Math.sin(a)*k);} ctx.stroke(); break;
      default: ctx.arc(0,0,k*0.5,0,TAU); ctx.fill();
    }
  }

  drawMotes(ctx,s){
    ctx.save();
    for(const m of this.motes){
      const x=this.sx(m.x), y=this.sy(m.y);
      const a=m.life<2?m.life/2:1;
      const r=CONFIG.mote.radius*s;
      ctx.globalAlpha=a;
      ctx.shadowColor='#ffd66b'; ctx.shadowBlur=12;
      const g=ctx.createRadialGradient(x-r*0.3,y-r*0.3,0,x,y,r);
      g.addColorStop(0,'#fff'); g.addColorStop(0.5,'#ffd66b'); g.addColorStop(1,'#a8791f');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawHeart(ctx,s){
    const cx=this.sx(0), cy=this.sy(0), R=CONFIG.heart.radius*s;
    const pulse=1+Math.sin(this.time*2)*0.04 + this.heart.hitFlash*0.1;
    const danger=this.heart.hp/this.heart.maxHp<0.3;
    const hue=danger?348:190;
    ctx.save();
    // outer glow
    ctx.shadowColor=hsla(hue,90,60,1); ctx.shadowBlur=40+this.heart.hitFlash*30;
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,R*pulse);
    g.addColorStop(0,'#ffffff'); g.addColorStop(0.4,hsla(hue,90,75,1)); g.addColorStop(1,hsla(hue,80,40,0.2));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,R*pulse*0.7,0,TAU); ctx.fill();
    ctx.shadowBlur=0;
    // rotating shards
    ctx.strokeStyle=hsla(hue,90,80,0.9); ctx.lineWidth=2;
    for(let i=0;i<3;i++){
      const a=this.rot*(i%2?-1:1)+i*TAU/3;
      ctx.beginPath();
      for(let k=0;k<3;k++){ const ang=a+k*TAU/3; const rr=R*(0.9+ (k===0?0.25:0)); const fx=cx+Math.cos(ang)*rr, fy=cy+Math.sin(ang)*rr; k?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy);}
      ctx.closePath(); ctx.globalAlpha=0.5; ctx.stroke();
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }

  drawEnemies(ctx,s){
    for(const e of this.enemies){
      const x=this.sx(e.x), y=this.sy(e.y), r=e.r*s*(1+Math.sin(e.wob)*0.04);
      const flash=e.hitFlash;
      // body
      const g=ctx.createRadialGradient(x-r*0.3,y-r*0.4,0,x,y,r);
      g.addColorStop(0,hsla(e.color,60,flash>0?80:34,0.96));
      g.addColorStop(1,hsla(e.color,70,flash>0?60:12,0.92));
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
      // rim
      ctx.lineWidth=2; ctx.strokeStyle=hsla(e.color,90,flash>0?92:62,0.9);
      ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.stroke();
      // eye
      ctx.fillStyle=hsla(e.color,100,90,0.95);
      const ea=Math.atan2(-e.y,-e.x);
      ctx.beginPath(); ctx.arc(x+Math.cos(ea)*r*0.3,y+Math.sin(ea)*r*0.3,r*0.16,0,TAU); ctx.fill();
      if(e.boss){
        // boss HP ring
        ctx.lineWidth=3; ctx.strokeStyle='rgba(255,107,139,0.9)';
        ctx.beginPath(); ctx.arc(x,y,r+8,-Math.PI/2,-Math.PI/2+TAU*(e.hp/e.maxHp)); ctx.stroke();
        ctx.strokeStyle='rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.arc(x,y,r+8,0,TAU); ctx.stroke();
      }
    }
  }

  drawTowers(ctx,s){
    for(const p of this.pads){
      if(p.bp!=='spire'||p.level<1) continue;
      const x=this.sx(p.x), y=this.sy(p.y), h=(18+p.level*3)*s;
      // crystalline spire
      ctx.save();
      ctx.shadowColor='#7fe7ff'; ctx.shadowBlur=16;
      const g=ctx.createLinearGradient(x,y,x,y-h);
      g.addColorStop(0,'rgba(60,90,140,0.95)'); g.addColorStop(1,'rgba(191,244,255,0.98)');
      ctx.fillStyle=g;
      const w=9*s+p.level*0.8*s;
      ctx.beginPath();
      ctx.moveTo(x-w,y); ctx.lineTo(x-w*0.5,y-h); ctx.lineTo(x+w*0.5,y-h); ctx.lineTo(x+w,y); ctx.closePath(); ctx.fill();
      // tip light
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y-h,3*s+s,0,TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawWisps(ctx,s){
    for(const w of this.wisps){
      const x=this.sx(w.x), y=this.sy(w.y), r=6*s+1;
      ctx.save();
      ctx.shadowColor='#ffd66b'; ctx.shadowBlur=12;
      const g=ctx.createRadialGradient(x-r*0.3,y-r*0.3,0,x,y,r);
      g.addColorStop(0,'#fff'); g.addColorStop(0.5,'#ffe6a8'); g.addColorStop(1,'rgba(255,214,107,0.2)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawKeeper(ctx,s){
    const k=this.keeper, x=this.sx(k.x), y=this.sy(k.y), r=CONFIG.keeper.radius*s;
    ctx.save();
    ctx.shadowColor='#bff4ff'; ctx.shadowBlur=26;
    // halo
    ctx.globalAlpha=0.5; ctx.fillStyle='rgba(127,231,255,0.4)';
    ctx.beginPath(); ctx.arc(x,y,r*1.7,0,TAU); ctx.fill();
    ctx.globalAlpha=1;
    // core
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.3,0,x,y,r);
    g.addColorStop(0,'#ffffff'); g.addColorStop(0.5,'#bff4ff'); g.addColorStop(1,'#3aa6c9');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
    // aim shard
    ctx.shadowBlur=0; ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(k.aim)*r*1.4,y+Math.sin(k.aim)*r*1.4); ctx.stroke();
    ctx.restore();
  }

  drawShots(ctx,s){
    ctx.save(); ctx.shadowBlur=10;
    for(const sh of this.shots){
      const x=this.sx(sh.x), y=this.sy(sh.y);
      const col = sh.owner==='wisp' ? '#ffe6a8' : '#bff4ff';
      ctx.shadowColor=col; ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(x,y,sh.r*s*0.7+1,0,TAU); ctx.fill();
      // little tail
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.globalAlpha=0.4;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-sh.vx*0.012*s*60/60,y-sh.vy*0.012); ctx.stroke();
      ctx.globalAlpha=1;
    }
    ctx.restore();
  }

  drawParticles(ctx,s){
    for(const p of this.particles){
      const x=this.sx(p.x), y=this.sy(p.y), a=U.clamp(p.life/p.max,0,1);
      if(p.kind==='ring'){
        ctx.globalAlpha=a*0.8; ctx.lineWidth=(p.lw||3)*s; ctx.strokeStyle=p.cp+a+')';
        ctx.beginPath(); ctx.arc(x,y,p.r*s,0,TAU); ctx.stroke(); ctx.globalAlpha=1; continue;
      }
      ctx.globalAlpha=a;
      if(p.glow){ ctx.shadowColor=hsla(p.h,p.sat||80,p.light||70,1); ctx.shadowBlur=8; }
      ctx.fillStyle=hsla(p.h,p.sat||80,p.light||70,1);
      if(p.kind==='shard'){
        ctx.save(); ctx.translate(x,y); ctx.rotate(p.rot||0);
        ctx.fillRect(-p.r*s*0.5,-p.r*s*0.5,p.r*s,p.r*s); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x,y,p.r*s*a+0.4,0,TAU); ctx.fill();
      }
      ctx.shadowBlur=0;
    }
    ctx.globalAlpha=1;
  }

  drawFloats(ctx,s){
    ctx.textAlign='center'; ctx.textBaseline='middle';
    for(const f of this.floats){
      ctx.globalAlpha=U.clamp(f.life/1.4,0,1);
      ctx.font=`600 ${13*s+2}px -apple-system,sans-serif`;
      ctx.fillStyle = f.color.startsWith('var')? (f.color.includes('gold')?'#ffe6a8':'#bff4ff') : f.color;
      ctx.fillText(f.text,this.sx(f.x),this.sy(f.y));
    }
    ctx.globalAlpha=1;
  }

  drawVignette(ctx){
    const g=ctx.createRadialGradient(this._cx,this._cy,Math.min(this.W,this.H)*0.3,this._cx,this._cy,Math.max(this.W,this.H)*0.75);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,8,0.55)');
    ctx.fillStyle=g; ctx.fillRect(0,0,this.W,this.H);
    if(this.heart.hp/this.heart.maxHp<0.3 && !this.ended){
      ctx.fillStyle=`rgba(255,40,80,${0.12+0.06*Math.sin(this.time*6)})`;
      ctx.fillRect(0,0,this.W,this.H);
    }
  }

  roundRect(ctx,x,y,w,h,r){
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r);
  }

  /* ---------------- loop ---------------- */
  loop(now){
    let dt=(now-this.last)/1000; this.last=now;
    if(dt>0.05) dt=0.05;
    if(this.started && !this.paused && !this.ended){ this.update(dt); this.syncHUD(); }
    this.draw();
    requestAnimationFrame(t=>this.loop(t));
  }
}

window.addEventListener('load',()=>{ window.game=new Game(); });
