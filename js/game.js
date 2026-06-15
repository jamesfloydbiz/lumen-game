/* ============================================================
   PICNIC — game.js  (3D, Three.js r128)
   The deterministic simulation (waves, economy, combat, build)
   is reused; rendering is a real 3D scene.
   World sim coords (x,y) map to ground plane (x, z); +Y is up.
   ============================================================ */
'use strict';

const NSEG = 28;
const PAD_R = 44;
const DRAIN_TIME = 0.85;

// accent -> colour
const ACCENT = { water:0x49b7e8, glow:0xffce3d, cake:0xe8506b };
const ACCENT_CSS = { water:'#49b7e8', glow:'#ffce3d', cake:'#e8506b' };

class Game{
  constructor(){
    this.canvas = document.getElementById('game');
    this.started=false; this.paused=false; this.ended=false;
    this.last=performance.now(); this.time=0; this.shake=0;

    this.input={up:false,down:false,left:false,right:false};
    this.joy={active:false,ox:0,oy:0,dx:0,dy:0,id:null};

    this.initThree();
    this.buildWorld();
    this.bindUI();
    this.bindInput();
    this.resize();
    window.addEventListener('resize',()=>this.resize());
    this.reset();
    requestAnimationFrame(t=>this.loop(t));
  }

  /* ---------------- three setup ---------------- */
  initThree(){
    const r = this.renderer = new THREE.WebGLRenderer({canvas:this.canvas, antialias:true});
    r.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    r.shadowMap.enabled=true; r.shadowMap.type=THREE.PCFSoftShadowMap;
    r.outputEncoding=THREE.sRGBEncoding; r.toneMapping=THREE.ACESFilmicToneMapping; r.toneMappingExposure=0.86;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x86c8ef);
    scene.fog = new THREE.Fog(0x9fd0a0, 1700, 2900);

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 5000);
    this.camBase = new THREE.Vector3(0, 1020, 880);
    this.camTarget = new THREE.Vector3(0, 0, 60);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a8a3a, 0.42); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0cf, 1.15);
    sun.position.set(360, 820, 280); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);
    const sc=sun.shadow.camera; sc.near=200; sc.far=1800; sc.left=-720; sc.right=720; sc.top=720; sc.bottom=-720;
    sun.shadow.bias=-0.0004; scene.add(sun);
    const fill=new THREE.DirectionalLight(0xbfe0ff, 0.12); fill.position.set(-300,400,-200); scene.add(fill);

    // shared geometry/material caches
    this.geo = {
      sph: new THREE.SphereGeometry(1, 12, 10),
      sphLo: new THREE.SphereGeometry(1, 8, 6),
      cyl: new THREE.CylinderGeometry(1,1,1,16),
      box: new THREE.BoxGeometry(1,1,1),
      ico: new THREE.IcosahedronGeometry(1,0),
      blob: new THREE.CircleGeometry(1,16),
      ring: new THREE.RingGeometry(0.82,1,40),
    };
    this.blobMat = new THREE.MeshBasicMaterial({color:0x224012, transparent:true, opacity:0.22, depthWrite:false});
    this.matCache={};
    this.enemyGroup=new THREE.Group(); this.shotGroup=new THREE.Group();
    this.crumbGroup=new THREE.Group(); this.wispGroup=new THREE.Group(); this.fxGroup=new THREE.Group();
    scene.add(this.enemyGroup,this.shotGroup,this.crumbGroup,this.wispGroup,this.fxGroup);
    this.fx=[];
  }
  mat(hex,opt={}){ const k=hex+'|'+(opt.e||0); if(this.matCache[k]) return this.matCache[k];
    return this.matCache[k]=new THREE.MeshStandardMaterial({color:hex, roughness:opt.r??0.62, metalness:opt.m??0.0,
      emissive:opt.e?hex:0x000000, emissiveIntensity:opt.e||0}); }

  /* ---------------- static world ---------------- */
  buildWorld(){
    const C=CONFIG, S=this.scene;
    // grass
    const grass=new THREE.Mesh(new THREE.CircleGeometry(2000,48), new THREE.MeshStandardMaterial({color:0x5fa838, roughness:1}));
    grass.rotation.x=-Math.PI/2; grass.position.y=0; grass.receiveShadow=true; S.add(grass);
    // checkered blanket
    const cv=document.createElement('canvas'); cv.width=cv.height=512; const cx=cv.getContext('2d');
    const t=64; for(let i=0;i<8;i++)for(let j=0;j<8;j++){ cx.fillStyle=((i+j)&1)?'#efe6cf':'#cf4438'; cx.fillRect(i*t,j*t,t,t);}
    const tex=new THREE.CanvasTexture(cv); tex.anisotropy=4;
    const blanket=new THREE.Mesh(new THREE.CircleGeometry(C.arenaR*1.04,64), new THREE.MeshStandardMaterial({map:tex, roughness:0.95}));
    blanket.rotation.x=-Math.PI/2; blanket.position.y=0.6; blanket.receiveShadow=true; S.add(blanket);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(C.arenaR*1.04,4,8,80), new THREE.MeshStandardMaterial({color:0xece7d6,roughness:0.9}));
    rim.rotation.x=-Math.PI/2; rim.position.y=1.2; S.add(rim);

    // cake (base) — a tiered group we can flash/scale
    this.cakeMesh=this.makeCake(); this.cakeMesh.position.set(0,0,0); S.add(this.cakeMesh);

    // salt line ring segments
    this.saltGroup=new THREE.Group(); S.add(this.saltGroup); this.saltMeshes=[];
    const saltMat=new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.5, emissive:0x335577, emissiveIntensity:0.08});
    for(let i=0;i<NSEG;i++){
      const a=(i+0.5)/NSEG*TAU;
      const m=new THREE.Mesh(this.geo.box, saltMat);
      const segW = (TAU*C.wallR/NSEG)*0.92;
      m.scale.set(segW, 16, 12); m.position.set(Math.cos(a)*C.wallR, 8, Math.sin(a)*C.wallR);
      m.rotation.y=-a+Math.PI/2; m.castShadow=true; m.visible=false;
      this.saltGroup.add(m); this.saltMeshes.push(m);
    }

    // pads
    this.padLabelWrap=document.getElementById('padlabels');
    this.padMeshes = PAD_LAYOUT.map((p,idx)=>this.makePad(p,idx));

    // hero (ladybug)
    this.heroMesh=this.makeLadybug(); S.add(this.heroMesh);
    this.heroBlob=this.makeBlob(26); S.add(this.heroBlob);
  }

  makeCake(){
    const g=new THREE.Group();
    const sponge=this.mat(0xc98a4a,{r:0.8}), cream=this.mat(0xfff3df,{r:0.7}), berry=this.mat(0xe8506b,{r:0.5});
    const tiers=[[60,34],[46,30],[30,28]]; let y=0;
    tiers.forEach(([rad,h],i)=>{
      const sp=new THREE.Mesh(this.geo.cyl, sponge); sp.scale.set(rad,h,rad); sp.position.y=y+h/2; sp.castShadow=true; sp.receiveShadow=true; g.add(sp);
      const cm=new THREE.Mesh(this.geo.cyl, cream); cm.scale.set(rad+2,7,rad+2); cm.position.y=y+h+3; cm.castShadow=true; g.add(cm);
      y+=h+7;
    });
    const cherry=new THREE.Mesh(this.geo.sph, berry); cherry.scale.setScalar(10); cherry.position.y=y+8; cherry.castShadow=true; g.add(cherry);
    // a couple of candles
    for(let i=0;i<3;i++){ const a=i*TAU/3; const c=new THREE.Mesh(this.geo.cyl,this.mat(0xff8aa3,{r:0.5})); c.scale.set(2.4,22,2.4); c.position.set(Math.cos(a)*16,y+11,Math.sin(a)*16); g.add(c);
      const fl=new THREE.Mesh(this.geo.sphLo,this.mat(0xffd24a,{e:1.0})); fl.scale.setScalar(3.2); fl.position.set(Math.cos(a)*16,y+24,Math.sin(a)*16); g.add(fl); }
    g.userData.flash=0;
    return g;
  }

  makeLadybug(){
    const g=new THREE.Group();
    const body=new THREE.Mesh(this.geo.sph, this.mat(0xe8506b,{r:0.45})); body.scale.set(20,13,24); body.position.y=12; body.castShadow=true; g.add(body);
    const seam=new THREE.Mesh(this.geo.box,this.mat(0x1c1410)); seam.scale.set(1.4,2,46); seam.position.y=24; g.add(seam);
    const head=new THREE.Mesh(this.geo.sph,this.mat(0x1c1410)); head.scale.set(13,10,10); head.position.set(0,12,22); head.castShadow=true; g.add(head);
    for(const sx of [-1,1]) for(const sz of [0.2,0.55,0.9]){ const sp=new THREE.Mesh(this.geo.sphLo,this.mat(0x1c1410)); sp.scale.setScalar(3.2); sp.position.set(sx*9, 22-(sz*4), -10+sz*22); g.add(sp); }
    // antennae
    for(const sx of [-1,1]){ const an=new THREE.Mesh(this.geo.cyl,this.mat(0x1c1410)); an.scale.set(1,10,1); an.position.set(sx*5,22,30); an.rotation.x=0.5; g.add(an); }
    g.userData.body=body;
    return g;
  }
  makeBlob(r){ const m=new THREE.Mesh(this.geo.blob,this.blobMat); m.rotation.x=-Math.PI/2; m.scale.setScalar(r); m.position.y=1.0; return m; }

  makePad(p,idx){
    const accent=CONFIG.blueprints[p.bp].accent, col=ACCENT[accent];
    const grp=new THREE.Group(); grp.position.set(p.x,0,p.y); this.scene.add(grp);
    const disc=new THREE.Mesh(new THREE.CircleGeometry(PAD_R,40), new THREE.MeshStandardMaterial({color:col, emissive:col, emissiveIntensity:0.35, roughness:0.6, transparent:true, opacity:0.5}));
    disc.rotation.x=-Math.PI/2; disc.position.y=0.9; grp.add(disc);
    const ringM=new THREE.Mesh(new THREE.RingGeometry(PAD_R-5,PAD_R-1,40,1,0,0.0001), new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.95, side:THREE.DoubleSide}));
    ringM.rotation.x=-Math.PI/2; ringM.position.y=1.1; grp.add(ringM);
    // floating marker (icon-ish gem) for upgrade pads; towers replace it
    let marker=null;
    if(p.bp!=='spire'){ marker=new THREE.Mesh(this.geo.ico, this.mat(col,{e:0.5})); marker.scale.setScalar(11); marker.position.y=34; grp.add(marker); }
    // label DOM
    const el=document.createElement('div'); el.className='padlabel';
    el.innerHTML=`<span class="pl-name"></span><span class="pl-cost"><span class="pl-coin"></span><span class="pl-num"></span></span><span class="pl-max">MAX</span>`;
    this.padLabelWrap.appendChild(el);
    return {grp,disc,ringM,marker,tower:null,col,accent,
      el, elName:el.querySelector('.pl-name'), elCost:el.querySelector('.pl-cost'), elNum:el.querySelector('.pl-num'), elMax:el.querySelector('.pl-max')};
  }

  makeSprinkler(level){
    const g=new THREE.Group();
    const base=new THREE.Mesh(this.geo.cyl,this.mat(0x8a8f96,{r:0.6,m:0.2})); base.scale.set(14,6,14); base.position.y=3; base.castShadow=true; g.add(base);
    const post=new THREE.Mesh(this.geo.cyl,this.mat(0xb8bdc4,{r:0.4,m:0.3})); const h=26+level*4; post.scale.set(4,h,4); post.position.y=6+h/2; post.castShadow=true; g.add(post);
    const head=new THREE.Mesh(this.geo.sph,this.mat(0x49b7e8,{e:0.4,r:0.3})); head.scale.setScalar(9+level); head.position.y=6+h+4; head.castShadow=true; g.add(head);
    const arms=new THREE.Group(); arms.position.y=6+h+4;
    for(let i=0;i<3;i++){ const arm=new THREE.Mesh(this.geo.box,this.mat(0x9fd8f0)); arm.scale.set(20,2,3); arm.position.x=10; arm.rotation.y=i*TAU/3; const a2=new THREE.Group(); a2.rotation.y=i*TAU/3; a2.add(arm); arms.add(a2);}
    g.add(arms); g.userData.arms=arms;
    return g;
  }

  makeEnemyMesh(type){
    const def=CONFIG.enemies[type], g=new THREE.Group();
    const bodyMat=this.mat(def.hex,{r:0.5,m:type==='beetle'?0.3:0.05});
    const r=def.r;
    if(type==='beetle'){
      const sh=new THREE.Mesh(this.geo.sph,bodyMat); sh.scale.set(r,r*0.8,r*1.1); sh.position.y=r*0.7; sh.castShadow=true; g.add(sh);
      const seam=new THREE.Mesh(this.geo.box,this.mat(0x000000)); seam.scale.set(1.5,2,r*2); seam.position.y=r*1.45; g.add(seam);
      const horn=new THREE.Mesh(this.geo.cyl,bodyMat); horn.scale.set(2,r*0.7,2); horn.position.set(0,r*0.9,r); horn.rotation.x=0.7; g.add(horn);
    } else if(type==='wasp'||type==='boss'){
      const ab=new THREE.Mesh(this.geo.sph,bodyMat); ab.scale.set(r*0.8,r*0.7,r*1.2); ab.position.set(0,0,-r*0.4); ab.castShadow=true; g.add(ab);
      const th=new THREE.Mesh(this.geo.sph,this.mat(0x222018)); th.scale.set(r*0.6,r*0.6,r*0.6); th.position.set(0,0,r*0.5); g.add(th);
      // stripes
      for(let i=0;i<2;i++){ const st=new THREE.Mesh(this.geo.box,this.mat(0x1c160c)); st.scale.set(r*1.4,r*1.2,3); st.position.set(0,0,-r*0.4 + (i*r*0.5-r*0.25)); g.add(st);}
      const wingMat=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.4,roughness:0.3});
      for(const sx of [-1,1]){ const w=new THREE.Mesh(this.geo.sphLo,wingMat); w.scale.set(r*0.8,2,r*0.5); w.position.set(sx*r*0.7,r*0.5,0); g.add(w);}
      g.userData.wings=true;
    } else { // ant / scout — three beads
      const seg=[[0.6,r*0.9],[0.7,0],[0.9,-r*1.0]];
      seg.forEach(([s,z])=>{ const m=new THREE.Mesh(this.geo.sph,bodyMat); m.scale.setScalar(r*s); m.position.set(0,r*0.7,z); m.castShadow=true; g.add(m);});
      for(const sx of [-1,1]) for(const k of [-1,0,1]){ const leg=new THREE.Mesh(this.geo.cyl,this.mat(0x161310)); leg.scale.set(1.2,r*0.9,1.2); leg.position.set(sx*r*0.7,r*0.4,k*r*0.5); leg.rotation.z=sx*0.9; g.add(leg);}
    }
    return g;
  }

  /* ---------------- lifecycle ---------------- */
  reset(){
    const C=CONFIG;
    this.gold=0; this.kills=0; this.totalGold=0;
    this.wave=0; this.waveState='idle'; this.prepTimer=0;
    this.spawnQueue=[]; this.spawnTimer=0; this.spawnInterval=1; this.bossAlive=false;

    this.keeper={ x:0, y:170, vx:0, vy:0, aim:-Math.PI/2, fireCd:0, trail:0 };
    this.heart={ hp:C.cake.baseHp, maxHp:C.cake.baseHp, regen:0, hitFlash:0 };

    // clear dynamic
    [this.enemyGroup,this.shotGroup,this.crumbGroup,this.wispGroup,this.fxGroup].forEach(g=>{ while(g.children.length) g.remove(g.children[0]); });
    this.enemies=[]; this.shots=[]; this.motes=[]; this.wisps=[]; this.fx=[];
    this.novaTimer=0; this.novaStats=null;

    this.wall={active:false}; this.seg=[]; for(let i=0;i<NSEG;i++){ this.seg.push({hp:0,maxHp:0,lastHit:99}); this.saltMeshes[i].visible=false; }

    this.pads = PAD_LAYOUT.map((p,i)=>({ bp:p.bp, slot:p.slot, x:p.x, y:p.y, def:CONFIG.blueprints[p.bp],
      level:0, invested:0, unlocked:false, pop:0, m:this.padMeshes[i] }));
    // reset pad visuals
    this.pads.forEach(p=>{ if(p.m.tower){ p.m.grp.remove(p.m.tower); p.m.tower=null; } if(p.m.marker) p.m.marker.visible=true; });
    this.evalUnlocks(true);
  }

  start(){
    SFX.resume(); this.reset();
    this.started=true; this.ended=false; this.paused=false;
    document.getElementById('start').classList.add('hidden');
    document.getElementById('end').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.nextWave();
  }

  end(win){
    if(this.ended) return; this.ended=true; this.bossAlive=false;
    win?SFX.win():SFX.lose(); this.addShake(win?10:18);
    document.getElementById('endTitle').textContent = win?'The Picnic is Saved':'The Ants Win';
    document.getElementById('endText').textContent = win
      ? 'One hundred waves of bugs and not a crumb of cake surrendered. Glorious.'
      : 'The cake is gone. The ants march home full and happy. Rematch?';
    document.getElementById('eWave').textContent=this.wave;
    document.getElementById('eKills').textContent=U.fmt(this.kills);
    document.getElementById('eGold').textContent=U.fmt(this.totalGold);
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
    const n=this.wave, boss=CONFIG.isBossWave(n);
    let count=CONFIG.waveCount(n); if(boss) count=Math.round(count*0.7);
    const pool=CONFIG.wavePool(n), totalW=pool.reduce((s,p)=>s+p[1],0);
    this.spawnQueue=[];
    for(let i=0;i<count;i++){ let r=Math.random()*totalW, pick=pool[0][0]; for(const [k,w] of pool){ if((r-=w)<=0){pick=k;break;} } this.spawnQueue.push(pick); }
    if(boss){ const j=U.randInt(Math.floor(count*0.4),count); this.spawnQueue.splice(j,0,'boss'); }
    this.spawnInterval = U.clamp(0.7 - n*0.0072, 0.08, 0.7);
    this.spawnTimer=0.4; this.waveState='active'; this.evalUnlocks();
    this.showBanner(n, boss?'Something big is coming':null);
    boss?SFX.boss():SFX.wave();
  }

  spawn(typeKey){
    const C=CONFIG, n=this.wave, base=C.enemies[typeKey], isBoss=typeKey==='boss';
    const a=U.rand(TAU), R=C.spawnR, hpm=isBoss?C.bossHpMul(n):C.hpMul(n), hp=base.hp*hpm;
    const e={ type:typeKey, boss:isBoss, x:Math.cos(a)*R, y:Math.sin(a)*R, hp, maxHp:hp,
      speed: base.speed*C.spdMul(n)*(isBoss?0.85:1), dmg: base.dmg*C.dmgMul(n), r:base.r,
      bounty: Math.ceil(base.bounty*C.bountyMul(n)), fly:base.fly, hitFlash:0, wob:U.rand(TAU) };
    e.mesh=this.makeEnemyMesh(typeKey);
    if(isBoss) e.mesh.scale.setScalar(1.0);
    this.enemyGroup.add(e.mesh);
    e.blob=this.makeBlob(e.r*1.1); this.enemyGroup.add(e.blob);
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
    for(const p of this.pads){ if(p.unlocked) continue;
      const u=p.def.unlock||{};
      if((!u.wave||this.wave>=u.wave) && (!u.requires||this.getLevel(u.requires)>0)){
        p.unlocked=true; if(!silent){ this.toast(`<span class="t-em">Unlocked</span> ${p.def.name}`); SFX.unlock(); p.pop=1; }
      }
    }
  }

  applyLevel(pad){
    const bp=pad.def, lv=pad.level; pad.pop=1;
    this.popFx(pad.x,pad.y, ACCENT[bp.accent], 1.2);
    this.ringFx(pad.x,pad.y, ACCENT[bp.accent], PAD_R*1.6);
    SFX.build();
    switch(bp.kind){
      case 'tower':{ if(pad.m.tower) pad.m.grp.remove(pad.m.tower); pad.m.tower=this.makeSprinkler(lv); pad.m.grp.add(pad.m.tower); break; }
      case 'wisp': this.addWisp(); break;
      case 'wall':{ const s=bp.stat(lv); this.wall.active=true; for(let i=0;i<NSEG;i++){ this.seg[i].maxHp=s.segHp; this.seg[i].hp=s.segHp; this.saltMeshes[i].visible=true; } this.wall.regen=s.regen; break; }
      case 'cake':{ if(bp.id==='hheart'){ const s=bp.stat(lv); const d=s.maxHp-this.heart.maxHp; this.heart.maxHp=s.maxHp; this.heart.hp+=Math.max(0,d); this.cakeMesh.scale.setScalar(1+Math.min(0.5,lv*0.04)); this.cakeMesh.userData.flash=1; } if(bp.id==='hregen'){ this.heart.regen=bp.stat(lv).regen; } break; }
      case 'upgrade': if(bp.id==='nova'){ this.novaStats=bp.stat(lv); if(this.novaTimer<=0) this.novaTimer=this.novaStats.cd; } break;
    }
    this.evalUnlocks();
  }

  addWisp(){ const w={ a:U.rand(TAU), fireCd:U.rand(0.5), x:this.keeper.x, y:this.keeper.y };
    w.mesh=new THREE.Mesh(this.geo.sph,this.mat(0xffce3d,{e:0.9,r:0.3})); w.mesh.scale.setScalar(7); this.wispGroup.add(w.mesh);
    this.wisps.push(w); }

  updateBuild(dt){
    const k=this.keeper;
    for(const p of this.pads){
      if(!p.unlocked||this.maxed(p)) continue;
      if(U.dist(k.x,k.y,p.x,p.y) < PAD_R+CONFIG.hero.radius && this.gold>0){
        const cost=this.nextCost(p), rate=Math.max(30,cost/DRAIN_TIME);
        let t=Math.min(rate*dt,this.gold,cost-p.invested); this.gold-=t; p.invested+=t;
        if(Math.random()<dt*16) this.popFx(k.x,k.y,p.m.col,0.4);
        if(p.invested>=cost-1e-6){ p.invested-=cost; p.level++; this.applyLevel(p); if(this.maxed(p)) p.invested=0; }
      }
    }
  }

  /* ---------------- input ---------------- */
  bindInput(){
    const keymap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
    addEventListener('keydown',e=>{ if(e.code==='Escape'){this.togglePause();return;} if(keymap[e.code]){this.input[keymap[e.code]]=true; e.preventDefault();} });
    addEventListener('keyup',e=>{ if(keymap[e.code]) this.input[keymap[e.code]]=false; });
    const cv=this.canvas, stick=document.getElementById('stick'), nub=document.getElementById('stickNub');
    const down=(px,py,id)=>{ this.joy.active=true; this.joy.id=id; this.joy.ox=px; this.joy.oy=py; this.joy.dx=0; this.joy.dy=0;
      stick.style.left=px+'px'; stick.style.top=py+'px'; stick.classList.remove('hidden'); nub.style.transform='translate(-50%,-50%)'; };
    const move=(px,py)=>{ if(!this.joy.active) return; let dx=px-this.joy.ox,dy=py-this.joy.oy; const max=52,d=Math.hypot(dx,dy);
      if(d>max){dx=dx/d*max;dy=dy/d*max;} this.joy.dx=dx/max; this.joy.dy=dy/max;
      nub.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`; };
    const up=()=>{ this.joy.active=false; this.joy.dx=0; this.joy.dy=0; stick.classList.add('hidden'); };
    cv.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; down(t.clientX,t.clientY,t.identifier); e.preventDefault(); },{passive:false});
    cv.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) move(t.clientX,t.clientY); } e.preventDefault(); },{passive:false});
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
    $('muteBtn').onclick=e=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); };
  }

  /* ---------------- update ---------------- */
  update(dt){
    this.time+=dt; this.shake=Math.max(0,this.shake-dt*40);
    const k=this.keeper, C=CONFIG;
    let mx=(this.input.right?1:0)-(this.input.left?1:0), my=(this.input.down?1:0)-(this.input.up?1:0);
    if(this.joy.active&&(this.joy.dx||this.joy.dy)){ mx=this.joy.dx; my=this.joy.dy; }
    const ml=Math.hypot(mx,my); if(ml>1){ mx/=ml; my/=ml; }
    const spd=C.hero.baseSpeed*C.blueprints.kspeed.stat(this.getLevel('kspeed')).mul;
    k.x+=mx*spd*dt; k.y+=my*spd*dt;
    const kd=Math.hypot(k.x,k.y), lim=C.arenaR-C.hero.radius; if(kd>lim){ k.x=k.x/kd*lim; k.y=k.y/kd*lim; }
    k.moving = ml>0.1;

    this.updateBuild(dt);

    if(this.waveState==='active'){
      this.spawnTimer-=dt;
      if(this.spawnTimer<=0 && this.spawnQueue.length && this.enemies.length<C.aliveCap){ this.spawn(this.spawnQueue.shift()); this.spawnTimer=this.spawnInterval; }
      if(this.spawnQueue.length===0 && this.enemies.length===0){ this.waveState='prep'; this.prepTimer=2.2;
        const bonus=Math.ceil(8+this.wave*2.5); this.gold+=bonus; this.totalGold+=bonus;
        this.toast(`Wave ${this.wave} cleared · <span class="t-em">+${bonus}</span> crumbs`); }
    } else if(this.waveState==='prep'){ this.prepTimer-=dt; if(this.prepTimer<=0) this.nextWave(); }

    // hero auto-fire
    const kdmg=C.hero.baseDamage*C.blueprints.kdamage.stat(this.getLevel('kdamage')).mul;
    const krate=C.hero.baseFireRate*C.blueprints.kfire.stat(this.getLevel('kfire')).mul;
    k.fireCd-=dt; const tgt=this.nearestEnemy(k.x,k.y,C.hero.baseRange);
    if(tgt) k.aim=U.ang(k.x,k.y,tgt.x,tgt.y);
    if(tgt && k.fireCd<=0){ k.fireCd=1/krate; this.fireShot(k.x,k.y,tgt,kdmg,C.hero.projSpeed,'keeper'); SFX.shoot(); }

    this.updateTowers(dt); this.updateWisps(dt); this.updateEnemies(dt);
    this.updateShots(dt); this.updateMotes(dt); this.updateNova(dt); this.updateWall(dt);

    if(this.heart.regen>0 && this.heart.hp<this.heart.maxHp) this.heart.hp=Math.min(this.heart.maxHp,this.heart.hp+this.heart.regen*dt);
    this.heart.hitFlash=Math.max(0,this.heart.hitFlash-dt*3);
    if(this.heart.hp<=0){ this.heart.hp=0; this.end(false); }

    for(const p of this.pads) p.pop=Math.max(0,p.pop-dt*2.2);
    // fx
    for(let i=this.fx.length-1;i>=0;i--){ const f=this.fx[i]; f.life-=dt; const a=U.clamp(f.life/f.max,0,1);
      if(f.type==='ring'){ const s=U.lerp(f.r0,f.r1,1-a); f.mesh.scale.set(s,s,s); f.mesh.material.opacity=a*0.8; }
      else { f.mesh.scale.setScalar(f.s*(1.4-a*0.4)); f.mesh.material.opacity=a; f.mesh.position.y+=dt*30; }
      if(f.life<=0){ this.fxGroup.remove(f.mesh); this.fx.splice(i,1); } }
  }

  nearestEnemy(x,y,range){ let best=null,bd=range*range; for(const e of this.enemies){ const d=U.dist2(x,y,e.x,e.y); if(d<bd){bd=d;best=e;} } return best; }
  fireShot(x,y,tgt,dmg,speed,owner){ const a=U.ang(x,y,tgt.x,tgt.y);
    const s={x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,dmg,life:1.6,owner,r:owner==='keeper'?5:4, h: tgt.fly?40:18};
    const col = owner==='wisp'?0xffce3d:0x49b7e8;
    s.mesh=new THREE.Mesh(this.geo.sphLo,this.mat(col,{e:0.8,r:0.3})); s.mesh.scale.setScalar(s.r); this.shotGroup.add(s.mesh);
    this.shots.push(s); }

  updateTowers(dt){ const C=CONFIG;
    for(const p of this.pads){ if(p.bp!=='spire'||p.level<1) continue;
      if(p.m.tower) p.m.tower.userData.arms.rotation.y+=dt*6;
      p.fireCd=(p.fireCd||0)-dt; const s=C.blueprints.spire.stat(p.level);
      if(p.fireCd<=0){ const t=this.nearestEnemy(p.x,p.y,s.range); if(t){ p.fireCd=1/s.rate; this.fireShot(p.x,p.y,t,s.damage,s.proj,'spire'); SFX.turret(); } } }
  }
  updateWisps(dt){ const C=CONFIG,k=this.keeper,n=this.wisps.length; if(!n) return;
    const s=C.blueprints.wisptier.stat(this.getLevel('wisptier')); this.wRot=(this.wRot||0)+dt*1.1;
    for(let i=0;i<n;i++){ const w=this.wisps[i], a=this.wRot+i*(TAU/n), rad=58+(n>6?16:0);
      w.x=U.lerp(w.x,k.x+Math.cos(a)*rad,Math.min(1,dt*8)); w.y=U.lerp(w.y,k.y+Math.sin(a)*rad,Math.min(1,dt*8));
      w.fireCd-=dt; if(w.fireCd<=0){ const t=this.nearestEnemy(w.x,w.y,s.range); if(t){ w.fireCd=1/s.rate; this.fireShot(w.x,w.y,t,s.damage,520,'wisp'); } } }
  }
  updateEnemies(dt){ const C=CONFIG,list=this.enemies;
    for(let i=list.length-1;i>=0;i--){ const e=list[i]; e.hitFlash=Math.max(0,e.hitFlash-dt*4); e.wob+=dt*8;
      const dist=Math.hypot(e.x,e.y)||0.001; let ux=-e.x/dist,uy=-e.y/dist, sx=0,sy=0;
      for(let j=0;j<list.length;j++){ if(j===i) continue; const o=list[j]; const dx=e.x-o.x,dy=e.y-o.y,dd=dx*dx+dy*dy,rr=e.r+o.r;
        if(dd>0.01&&dd<rr*rr){ const d=Math.sqrt(dd); sx+=dx/d; sy+=dy/d; } }
      let nx=e.x+(ux*e.speed+sx*22)*dt, ny=e.y+(uy*e.speed+sy*22)*dt, nd=Math.hypot(nx,ny), ang=Math.atan2(ny,nx);
      if(this.wall.active && !e.fly && nd>C.wallR && nd<C.wallR+e.r+6){
        const idx=((Math.floor(((ang+TAU)%TAU)/TAU*NSEG))%NSEG+NSEG)%NSEG, sg=this.seg[idx];
        if(sg.hp>0){ nd=C.wallR+e.r; nx=Math.cos(ang)*nd; ny=Math.sin(ang)*nd; sg.hp-=e.dmg*dt; sg.lastHit=0;
          if(sg.hp<=0){ this.popFx(nx,ny,0xffffff,0.8); } } }
      const hr=C.cake.radius+e.r; if(nd<hr){ nd=hr; nx=Math.cos(ang)*hr; ny=Math.sin(ang)*hr; this.heart.hp-=e.dmg*dt; this.heart.hitFlash=1; this.cakeMesh.userData.flash=1; }
      e.x=nx; e.y=ny; e.facing=ang;
      if(e.hp<=0) this.killEnemy(e,i);
    }
  }
  killEnemy(e,i){ this.enemies.splice(i,1); this.kills++;
    this.enemyGroup.remove(e.mesh); this.enemyGroup.remove(e.blob);
    if(e.boss){ this.bossAlive=false; this.addShake(14); SFX.boss(); this.ringFx(e.x,e.y,0xc24a16,e.r*4); }
    SFX.kill(); this.popFx(e.x,e.y, e.boss?0xffce3d:CONFIG.enemies[e.type].hex, e.boss?2.4:0.9);
    const n=e.boss?14:Math.min(8,1+Math.floor(e.bounty/3)), per=e.bounty/n;
    for(let m=0;m<n;m++){ const a=U.rand(TAU),s=U.rand(20,90);
      const mo={x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,val:per,life:CONFIG.crumb.life,spin:U.rand(TAU)};
      mo.mesh=new THREE.Mesh(this.geo.ico,this.mat(0xf3b73f,{e:0.5,r:0.4})); mo.mesh.scale.setScalar(CONFIG.crumb.radius); this.crumbGroup.add(mo.mesh);
      this.motes.push(mo); }
  }
  updateShots(dt){ const list=this.shots;
    for(let i=list.length-1;i>=0;i--){ const s=list[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=dt; let hit=false;
      for(const e of this.enemies){ if(U.dist2(s.x,s.y,e.x,e.y)<(e.r+s.r)*(e.r+s.r)){ e.hp-=s.dmg; e.hitFlash=1; hit=true; this.popFx(s.x,s.y,0x9fd8f0,0.4); SFX.hit(); break; } }
      if(hit||s.life<=0||Math.hypot(s.x,s.y)>CONFIG.spawnR+80){ this.shotGroup.remove(s.mesh); list.splice(i,1); } }
  }
  updateMotes(dt){ const C=CONFIG,k=this.keeper,list=this.motes;
    const pr=C.hero.pickupRadius+C.blueprints.kmagnet.stat(this.getLevel('kmagnet')).add;
    for(let i=list.length-1;i>=0;i--){ const m=list[i]; m.life-=dt; m.spin+=dt*4; m.vx*=0.9; m.vy*=0.9;
      const d=U.dist(k.x,k.y,m.x,m.y);
      if(d<pr){ const a=U.ang(m.x,m.y,k.x,k.y),pull=C.crumb.magnet*(0.4+0.6*(1-d/pr)); m.vx=U.lerp(m.vx,Math.cos(a)*pull,0.4); m.vy=U.lerp(m.vy,Math.sin(a)*pull,0.4); }
      m.x+=m.vx*dt; m.y+=m.vy*dt;
      if(d<C.hero.radius+10){ this.gold+=m.val; this.totalGold+=m.val; SFX.pickup(); this.crumbGroup.remove(m.mesh); list.splice(i,1); continue; }
      if(m.life<=0){ this.crumbGroup.remove(m.mesh); list.splice(i,1); } }
  }
  updateNova(dt){ if(this.getLevel('nova')<1||!this.novaStats) return; this.novaTimer-=dt;
    if(this.novaTimer<=0){ const s=this.novaStats; this.novaTimer=s.cd; this.ringFx(0,0,0xffce3d,s.radius); this.addShake(6); SFX.build();
      for(const e of this.enemies){ if(Math.hypot(e.x,e.y)<s.radius+e.r){ e.hp-=s.damage; e.hitFlash=1; const a=Math.atan2(e.y,e.x); e.x+=Math.cos(a)*24; e.y+=Math.sin(a)*24; } } }
  }
  updateWall(dt){ if(!this.wall.active) return; const rg=this.wall.regen||0;
    for(const sg of this.seg){ sg.lastHit+=dt; if(sg.lastHit>2&&sg.hp<sg.maxHp) sg.hp=Math.min(sg.maxHp,sg.hp+rg*dt); }
  }

  /* ---------------- fx ---------------- */
  addShake(m){ this.shake=Math.min(26,this.shake+m); }
  popFx(x,y,hex,scale){ const m=new THREE.Mesh(this.geo.sphLo,new THREE.MeshStandardMaterial({color:hex,emissive:hex,emissiveIntensity:0.8,transparent:true,opacity:1}));
    m.position.set(x,18,y); this.fxGroup.add(m); this.fx.push({mesh:m,type:'pop',life:0.4,max:0.4,s:14*scale}); }
  ringFx(x,y,hex,radius){ const m=new THREE.Mesh(this.geo.ring,new THREE.MeshBasicMaterial({color:hex,transparent:true,opacity:0.8,side:THREE.DoubleSide}));
    m.rotation.x=-Math.PI/2; m.position.set(x,3,y); this.fxGroup.add(m); this.fx.push({mesh:m,type:'ring',life:0.5,max:0.5,r0:10,r1:radius}); }

  /* ---------------- HUD ---------------- */
  toast(html){ const t=document.getElementById('toast'); t.innerHTML=html; t.classList.add('show'); clearTimeout(this._tt); this._tt=setTimeout(()=>t.classList.remove('show'),2200); }
  showBanner(n,sub){ const b=document.getElementById('waveBanner'), boss=CONFIG.isBossWave(n);
    b.innerHTML=`<span class="wb-k">${boss?'BOSS WAVE':'WAVE'}</span><span class="wb-n">${n}</span>`+(sub?`<span class="wb-s">${sub}</span>`:''); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  syncHUD(){ document.getElementById('waveNum').textContent=this.wave; document.getElementById('goldNum').textContent=U.fmt(this.gold);
    const pct=U.clamp(this.heart.hp/this.heart.maxHp,0,1);
    const f=document.getElementById('heartFill'); f.style.width=(pct*100)+'%';
    f.style.background = pct<0.3 ? 'linear-gradient(90deg,#ff4d4d,#ff9a9a)' : 'linear-gradient(90deg,var(--berry),#ff8aa3)';
    document.getElementById('heartTxt').textContent=Math.ceil(pct*100)+'%'; }

  /* ---------------- scene sync ---------------- */
  syncScene(){
    const k=this.keeper;
    // hero
    this.heroMesh.position.set(k.x, k.moving?Math.sin(this.time*14)*1.5+1:0, k.y);
    this.heroMesh.rotation.y = -k.aim + Math.PI/2;
    this.heroBlob.position.set(k.x,1.0,k.y);
    // wisps
    for(const w of this.wisps) w.mesh.position.set(w.x, 36+Math.sin(this.time*6+w.a*7)*6, w.y);
    // enemies
    for(const e of this.enemies){
      const baseY = e.fly ? 38+Math.sin(this.time*10+e.wob)*5 : Math.abs(Math.sin(e.wob))*3;
      e.mesh.position.set(e.x, baseY, e.y);
      e.mesh.rotation.y = -(e.facing||0) + Math.PI/2;
      const fl = e.hitFlash>0;
      e.mesh.scale.setScalar((e.boss?1:1) * (fl?1.12:1));
      e.blob.position.set(e.x,1.0,e.y); e.blob.material.opacity = e.fly?0.12:0.22;
      if(e.boss){ e.mesh.children.forEach(c=>{}); }
    }
    // crumbs
    for(const m of this.motes){ m.mesh.position.set(m.x, 12+Math.sin(this.time*4+m.spin)*3, m.y); m.mesh.rotation.y=m.spin; m.mesh.rotation.x=m.spin*0.7;
      m.mesh.material.opacity = m.life<2?m.life/2:1; m.mesh.material.transparent=m.life<2; }
    // salt segments
    if(this.wall.active){ for(let i=0;i<NSEG;i++){ const sg=this.seg[i], r=sg.maxHp>0?U.clamp(sg.hp/sg.maxHp,0,1):0; const m=this.saltMeshes[i];
      m.visible = r>0.02; const segW=(TAU*CONFIG.wallR/NSEG)*0.92; m.scale.set(segW, 6+r*14, 8+r*6); m.position.y=(6+r*14)/2; } }
    // cake flash + bob
    const cf=this.cakeMesh.userData.flash||0; if(cf>0) this.cakeMesh.userData.flash=Math.max(0,cf-0.05);
    this.cakeMesh.children.forEach(c=>{ if(c.material&&c.material.emissive&&c.material.userData!=='flame'){} });
    this.cakeMesh.rotation.y = Math.sin(this.time*0.3)*0.04;
    // pads
    for(const p of this.pads){ const m=p.m, on=p.unlocked;
      m.grp.visible=on; if(!on){ m.el.style.opacity=0; continue; }
      const maxed=this.maxed(p), near=U.dist(k.x,k.y,p.x,p.y)<PAD_R+CONFIG.hero.radius;
      m.disc.material.opacity = maxed?0.22:(near?0.85:0.5);
      const pop=1+p.pop*0.3; m.disc.scale.setScalar(pop);
      if(m.marker){ m.marker.visible=!maxed; m.marker.rotation.y=this.time*1.5; m.marker.position.y=34+Math.sin(this.time*2.5+p.x)*3; }
      // progress ring
      const cost=maxed?1:this.nextCost(p), prog=maxed?0:U.clamp(p.invested/cost,0,1);
      m.ringM.geometry.dispose(); m.ringM.geometry=new THREE.RingGeometry(PAD_R-6,PAD_R-1,40,1,Math.PI/2,-prog*TAU); m.ringM.material.opacity=prog>0?0.95:0;
    }
    this.updatePadLabels();
  }

  updatePadLabels(){
    const W=this.W,H=this.H, v=new THREE.Vector3();
    for(const p of this.pads){ const m=p.m;
      if(!p.unlocked){ m.el.style.opacity=0; continue; }
      v.set(p.x, 58, p.y); v.project(this.camera);
      if(v.z>1){ m.el.style.opacity=0; continue; }
      const sx=(v.x*0.5+0.5)*W, sy=(-v.y*0.5+0.5)*H;
      const near=U.dist(this.keeper.x,this.keeper.y,p.x,p.y) < 150;
      m.el.style.transform=`translate(-50%,-50%) translate(${sx}px,${sy}px)`+(near?' scale(1.08)':'');
      m.el.style.opacity = near?1:0.55; m.el.style.zIndex = near?2:1;
      const lvTxt = p.bp==='wisp'?` ${p.level}/${p.def.max}`:(p.level>0?` Lv${p.level}`:'');
      m.elName.textContent = p.def.name+lvTxt;
      const maxed=this.maxed(p);
      if(maxed){ m.elCost.style.display='none'; m.elMax.style.display='block'; }
      else { m.elCost.style.display='flex'; m.elMax.style.display='none';
        const remain=Math.max(0,Math.ceil(this.nextCost(p)-p.invested));
        m.elNum.textContent=U.fmt(remain);
        m.elCost.classList.toggle('poor', this.gold < this.nextCost(p)-p.invested);
      }
    }
  }

  /* ---------------- loop ---------------- */
  resize(){
    const w=window.innerWidth,h=window.innerHeight; this.W=w; this.H=h;
    this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
  }
  loop(now){ let dt=(now-this.last)/1000; this.last=now; if(dt>0.05) dt=0.05;
    if(this.started&&!this.paused&&!this.ended){ this.update(dt); this.syncHUD(); }
    this.syncScene();
    // camera (slight follow + shake)
    const k=this.keeper, fx=this.shake>0?U.rand(-this.shake,this.shake):0, fz=this.shake>0?U.rand(-this.shake,this.shake):0;
    this.camera.position.set(this.camBase.x+k.x*0.10+fx, this.camBase.y, this.camBase.z+k.y*0.10+fz);
    this.camera.lookAt(this.camTarget.x+k.x*0.10, 0, this.camTarget.z+k.y*0.10);
    this.renderer.render(this.scene,this.camera);
    requestAnimationFrame(t=>this.loop(t));
  }
}

window.addEventListener('load',()=>{ window.game=new Game(); });
