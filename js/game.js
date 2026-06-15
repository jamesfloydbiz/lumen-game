/* ============================================================
   PICNIC — game.js  (3D, Three.js r128)
   Deterministic sim (waves/economy/combat/build) + 3D renderer.
   World sim coords (x,y) -> ground plane (x, z); +Y is up.
   ============================================================ */
'use strict';

const NSEG = 28;
const PAD_R = 44;
const DRAIN_TIME = 0.85;

const ACCENT = { water:0x6cc5f0, glow:0xffd24a, cake:0xff6f91, tongue:0xff5a8a };

class Game{
  constructor(){
    this.canvas=document.getElementById('game');
    this.started=false; this.paused=false; this.ended=false;
    this.last=performance.now(); this.time=0; this.shake=0;
    this.input={up:false,down:false,left:false,right:false};
    this.joy={active:false,ox:0,oy:0,dx:0,dy:0,id:null};
    this.initThree(); this.buildWorld(); this.bindUI(); this.bindInput();
    this.resize(); window.addEventListener('resize',()=>this.resize());
    this.reset();
    requestAnimationFrame(t=>this.loop(t));
  }

  /* ---------------- three setup ---------------- */
  initThree(){
    const r=this.renderer=new THREE.WebGLRenderer({canvas:this.canvas, antialias:true});
    r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    r.shadowMap.enabled=true; r.shadowMap.type=THREE.PCFSoftShadowMap;
    r.outputEncoding=THREE.sRGBEncoding; r.toneMapping=THREE.ACESFilmicToneMapping; r.toneMappingExposure=0.92;

    const scene=this.scene=new THREE.Scene();
    scene.background=new THREE.Color(0x8fd0f2);
    scene.fog=new THREE.Fog(0xa9dcc0, 1500, 2750);

    this.camera=new THREE.PerspectiveCamera(36,1,1,5000);
    this.camBase=new THREE.Vector3(0,1060,900); this.camTarget=new THREE.Vector3(0,0,40);

    scene.add(new THREE.HemisphereLight(0xdcefff,0x6f9a4e,0.6));
    const sun=this.sun=new THREE.DirectionalLight(0xfff2d8,1.05);
    sun.position.set(340,860,300); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
    const sc=sun.shadow.camera; sc.near=200; sc.far=1900; sc.left=-700; sc.right=700; sc.top=700; sc.bottom=-700;
    sun.shadow.bias=-0.0004; scene.add(sun);
    const fill=new THREE.DirectionalLight(0xbfe0ff,0.18); fill.position.set(-300,420,-220); scene.add(fill);

    this.geo={ sph:new THREE.SphereGeometry(1,14,12), sphLo:new THREE.SphereGeometry(1,8,6),
      cyl:new THREE.CylinderGeometry(1,1,1,18), cylTap:new THREE.CylinderGeometry(0.6,1,1,18),
      box:new THREE.BoxGeometry(1,1,1), ico:new THREE.IcosahedronGeometry(1,0),
      circle:new THREE.CircleGeometry(1,40), ring:new THREE.RingGeometry(0.9,1,48) };
    this.blobMat=new THREE.MeshBasicMaterial({color:0x1f3a14,transparent:true,opacity:0.20,depthWrite:false});
    this.matCache={};

    // soft radial glow texture (for additive sprites)
    const gc=document.createElement('canvas'); gc.width=gc.height=128; const gx=gc.getContext('2d');
    const grd=gx.createRadialGradient(64,64,0,64,64,64); grd.addColorStop(0,'rgba(255,255,255,1)');
    grd.addColorStop(0.35,'rgba(255,255,255,0.55)'); grd.addColorStop(1,'rgba(255,255,255,0)');
    gx.fillStyle=grd; gx.fillRect(0,0,128,128); this.glowTex=new THREE.CanvasTexture(gc);

    this.enemyGroup=new THREE.Group(); this.shotGroup=new THREE.Group(); this.crumbGroup=new THREE.Group();
    this.wispGroup=new THREE.Group(); this.fxGroup=new THREE.Group();
    scene.add(this.enemyGroup,this.shotGroup,this.crumbGroup,this.wispGroup,this.fxGroup);
    this.fx=[];
  }
  mat(hex,opt={}){ const k=hex+'|'+(opt.e||0)+'|'+(opt.r??0.6)+'|'+(opt.m||0);
    return this.matCache[k]||(this.matCache[k]=new THREE.MeshStandardMaterial({color:hex,roughness:opt.r??0.6,metalness:opt.m||0,emissive:opt.e?hex:0,emissiveIntensity:opt.e||0})); }
  glow(hex,size,op){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:hex,blending:THREE.AdditiveBlending,transparent:true,opacity:op??0.5,depthWrite:false})); s.scale.setScalar(size); return s; }

  /* ---------------- static world ---------------- */
  buildWorld(){
    const C=CONFIG,S=this.scene;
    const grass=new THREE.Mesh(new THREE.CircleGeometry(2200,56),new THREE.MeshStandardMaterial({color:0x69b53c,roughness:1}));
    grass.rotation.x=-Math.PI/2; grass.receiveShadow=true; S.add(grass);
    // checkered blanket (clean, 6x6)
    const cv=document.createElement('canvas'); cv.width=cv.height=480; const cx=cv.getContext('2d');
    const t=80; for(let i=0;i<6;i++)for(let j=0;j<6;j++){ cx.fillStyle=((i+j)&1)?'#f4ead0':'#c23a2f'; cx.fillRect(i*t,j*t,t,t); }
    const tex=new THREE.CanvasTexture(cv); tex.anisotropy=8;
    const blanket=new THREE.Mesh(new THREE.CircleGeometry(C.arenaR*1.05,72),new THREE.MeshStandardMaterial({map:tex,roughness:0.92}));
    blanket.rotation.x=-Math.PI/2; blanket.position.y=0.6; blanket.receiveShadow=true; S.add(blanket);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(C.arenaR*1.05,5,10,90),new THREE.MeshStandardMaterial({color:0xf4ecd6,roughness:0.9}));
    rim.rotation.x=-Math.PI/2; rim.position.y=1.4; S.add(rim);

    this.cakeLevel=0; this.cakeMesh=this.makeCake(0); S.add(this.cakeMesh);

    // salt line
    this.saltGroup=new THREE.Group(); S.add(this.saltGroup); this.saltMeshes=[];
    const saltMat=new THREE.MeshStandardMaterial({color:0xfbfbff,roughness:0.45,emissive:0x9fd0ff,emissiveIntensity:0.06});
    for(let i=0;i<NSEG;i++){ const a=(i+0.5)/NSEG*TAU; const m=new THREE.Mesh(this.geo.box,saltMat);
      const w=(TAU*C.wallR/NSEG)*0.92; m.scale.set(w,16,12); m.position.set(Math.cos(a)*C.wallR,8,Math.sin(a)*C.wallR);
      m.rotation.y=-a+Math.PI/2; m.castShadow=true; m.visible=false; this.saltGroup.add(m); this.saltMeshes.push(m); }

    this.padLabelWrap=document.getElementById('padlabels');
    this.padMeshes=PAD_LAYOUT.map((p,i)=>this.makePad(p,i));

    this.heroMesh=this.makeFrog(); this.heroMesh.scale.setScalar(1.3); S.add(this.heroMesh);
    this.heroBlob=new THREE.Mesh(this.geo.circle,this.blobMat); this.heroBlob.rotation.x=-Math.PI/2; this.heroBlob.scale.setScalar(30); this.heroBlob.position.y=1.0; S.add(this.heroBlob);
    // forage aura ring (shown when Forage built)
    this.forageRing=new THREE.Mesh(this.geo.ring,new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:0.16,side:THREE.DoubleSide}));
    this.forageRing.rotation.x=-Math.PI/2; this.forageRing.position.y=1.3; this.forageRing.visible=false; S.add(this.forageRing);
  }

  makeCake(level){
    // solid 2-tier frustum cake — reads clearly as a cake, grows with level
    const g=new THREE.Group();
    const sponge=this.mat(0xd1924a,{r:0.72}), frost=this.mat(0xfff0e0,{r:0.4}), seam=this.mat(0xff9fb5,{r:0.4}), berry=this.mat(0xf03150,{r:0.3});
    const bot=new THREE.Mesh(this.geo.cylTap,sponge); bot.scale.set(62,36,62); bot.position.y=18; bot.castShadow=true; bot.receiveShadow=true; g.add(bot);
    const botFrost=new THREE.Mesh(this.geo.cyl,seam); botFrost.scale.set(40,5,40); botFrost.position.y=36; g.add(botFrost);
    const top=new THREE.Mesh(this.geo.cylTap,sponge); top.scale.set(34,26,34); top.position.y=49; top.castShadow=true; g.add(top);
    const dome=new THREE.Mesh(this.geo.sph,frost); dome.scale.set(23,15,23); dome.position.y=62; dome.castShadow=true; g.add(dome);
    for(let i=0;i<9;i++){ const a=i*TAU/9; const d=new THREE.Mesh(this.geo.sphLo,frost); d.scale.set(4.5,7,4.5); d.position.set(Math.cos(a)*20,60,Math.sin(a)*20); g.add(d); }
    const cherry=new THREE.Mesh(this.geo.sph,berry); cherry.scale.setScalar(10); cherry.position.y=74; cherry.castShadow=true; g.add(cherry);
    const nc=Math.min(6,2+Math.floor(level/3));
    for(let i=0;i<nc;i++){ const a=i*TAU/nc+0.4; const c=new THREE.Mesh(this.geo.cyl,this.mat(0xfff0a0,{r:0.4})); c.scale.set(2.4,18,2.4); c.position.set(Math.cos(a)*14,71,Math.sin(a)*14); g.add(c);
      const fl=new THREE.Mesh(this.geo.sphLo,this.mat(0xffb432,{e:1})); fl.scale.setScalar(3); fl.position.set(Math.cos(a)*14,82,Math.sin(a)*14); g.add(fl);
      const fg=this.glow(0xffc46a,11,0.6); fg.position.copy(fl.position); g.add(fg); }
    g.scale.setScalar(1+level*0.035);
    return g;
  }

  makeFrog(){
    const g=new THREE.Group();
    const skin=this.mat(0x66c94e,{r:0.5}), dark=this.mat(0x3f8f33,{r:0.5}), belly=this.mat(0xeaf6c8,{r:0.55});
    const body=new THREE.Mesh(this.geo.sph,skin); body.scale.set(22,15,20); body.position.y=14; body.castShadow=true; g.add(body);
    const bel=new THREE.Mesh(this.geo.sph,belly); bel.scale.set(16,9,15); bel.position.set(0,8,6); g.add(bel);
    // back legs
    for(const sx of [-1,1]){ const th=new THREE.Mesh(this.geo.sph,skin); th.scale.set(8,7,12); th.position.set(sx*18,7,-6); th.castShadow=true; g.add(th);
      const foot=new THREE.Mesh(this.geo.sph,dark); foot.scale.set(7,3,10); foot.position.set(sx*22,2,-14); g.add(foot); }
    // front feet
    for(const sx of [-1,1]){ const f=new THREE.Mesh(this.geo.sph,dark); f.scale.set(5,2.5,8); f.position.set(sx*12,2,18); g.add(f); }
    // eyes on top
    const eyes=new THREE.Group(); eyes.position.set(0,26,8);
    for(const sx of [-1,1]){ const e=new THREE.Mesh(this.geo.sph,skin); e.scale.setScalar(7); e.position.set(sx*9,0,0); e.castShadow=true; eyes.add(e);
      const w=new THREE.Mesh(this.geo.sph,this.mat(0xffffff,{r:0.3})); w.scale.setScalar(4.5); w.position.set(sx*9,2,4); eyes.add(w);
      const pu=new THREE.Mesh(this.geo.sphLo,this.mat(0x111111)); pu.scale.setScalar(2.4); pu.position.set(sx*9,2.5,7); eyes.add(pu); }
    g.add(eyes);
    // mouth (opens on fire)
    const mouth=new THREE.Mesh(this.geo.box,this.mat(0x8a2d3a)); mouth.scale.set(18,2,3); mouth.position.set(0,11,19); g.add(mouth);
    g.userData={body, mouth, eyes};
    return g;
  }

  makePad(p,idx){
    const accent=CONFIG.blueprints[p.bp].accent, col=ACCENT[accent];
    const grp=new THREE.Group(); grp.position.set(p.x,0,p.y); grp.visible=false; this.scene.add(grp);
    const ringM=new THREE.Mesh(new THREE.RingGeometry(PAD_R-3,PAD_R,48),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.55,side:THREE.DoubleSide}));
    ringM.rotation.x=-Math.PI/2; ringM.position.y=0.9; grp.add(ringM);
    const fillM=new THREE.Mesh(this.geo.circle,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.06,side:THREE.DoubleSide}));
    fillM.rotation.x=-Math.PI/2; fillM.position.y=0.85; fillM.scale.setScalar(PAD_R-3); grp.add(fillM);
    const prog=new THREE.Mesh(new THREE.RingGeometry(PAD_R-7,PAD_R-3.5,48,1,Math.PI/2,0.0001),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,side:THREE.DoubleSide}));
    prog.rotation.x=-Math.PI/2; prog.position.y=1.0; grp.add(prog);
    let marker=null, mglow=null;
    if(p.bp!=='spire'){ marker=new THREE.Mesh(this.geo.ico,this.mat(col,{e:0.55})); marker.scale.setScalar(11); marker.position.y=30; grp.add(marker);
      mglow=this.glow(col,22,0.45); mglow.position.y=30; grp.add(mglow); }
    const el=document.createElement('div'); el.className='padlabel';
    el.innerHTML=`<span class="pl-name"></span><span class="pl-cost"><span class="pl-coin"></span><span class="pl-num"></span></span><span class="pl-max">MAX</span>`;
    this.padLabelWrap.appendChild(el);
    return {grp,ringM,fillM,prog,marker,mglow,tower:null,col,accent,
      el,elName:el.querySelector('.pl-name'),elCost:el.querySelector('.pl-cost'),elNum:el.querySelector('.pl-num'),elMax:el.querySelector('.pl-max')};
  }

  makeSprinkler(level){
    const g=new THREE.Group();
    const base=new THREE.Mesh(this.geo.cyl,this.mat(0x9aa0a8,{r:0.55,m:0.2})); base.scale.set(15,6,15); base.position.y=3; base.castShadow=true; g.add(base);
    const h=26+level*4; const post=new THREE.Mesh(this.geo.cyl,this.mat(0xc4c9d0,{r:0.4,m:0.3})); post.scale.set(4,h,4); post.position.y=6+h/2; post.castShadow=true; g.add(post);
    const head=new THREE.Mesh(this.geo.sph,this.mat(0x6cc5f0,{e:0.45,r:0.3})); head.scale.setScalar(9+level); head.position.y=6+h+4; head.castShadow=true; g.add(head);
    const hg=this.glow(0x9fe0ff,16+level*2,0.45); hg.position.y=6+h+4; g.add(hg);
    const arms=new THREE.Group(); arms.position.y=6+h+4;
    for(let i=0;i<3;i++){ const a2=new THREE.Group(); a2.rotation.y=i*TAU/3; const arm=new THREE.Mesh(this.geo.box,this.mat(0xbfeaff)); arm.scale.set(20,2,3); arm.position.x=11; a2.add(arm); arms.add(a2); }
    g.add(arms); g.userData.arms=arms;
    return g;
  }

  makeEnemyMesh(type){
    const def=CONFIG.enemies[type], g=new THREE.Group(), bodyMat=this.mat(def.hex,{r:0.5,m:type==='beetle'?0.3:0.05}), r=def.r;
    if(type==='beetle'){
      const sh=new THREE.Mesh(this.geo.sph,bodyMat); sh.scale.set(r,r*0.8,r*1.1); sh.position.y=r*0.7; sh.castShadow=true; g.add(sh);
      const seam=new THREE.Mesh(this.geo.box,this.mat(0x05040a)); seam.scale.set(1.6,2,r*2); seam.position.y=r*1.45; g.add(seam);
      const head=new THREE.Mesh(this.geo.sph,this.mat(0x14121f)); head.scale.set(r*0.55,r*0.5,r*0.5); head.position.set(0,r*0.55,r*1.05); g.add(head);
      const horn=new THREE.Mesh(this.geo.cylTap,this.mat(0x14121f)); horn.scale.set(3,r*0.7,3); horn.position.set(0,r*0.8,r*1.3); horn.rotation.x=0.8; g.add(horn);
      for(const sx of [-1,1]) for(const k of [-1,0,1]){ const leg=new THREE.Mesh(this.geo.cyl,this.mat(0x100e16)); leg.scale.set(1.4,r*0.8,1.4); leg.position.set(sx*r*0.85,r*0.35,k*r*0.5); leg.rotation.z=sx*1.0; g.add(leg); }
    } else if(type==='wasp'||type==='boss'){
      const ab=new THREE.Mesh(this.geo.sph,bodyMat); ab.scale.set(r*0.8,r*0.7,r*1.2); ab.position.set(0,0,-r*0.4); ab.castShadow=true; g.add(ab);
      const th=new THREE.Mesh(this.geo.sph,this.mat(0x2a2620)); th.scale.setScalar(r*0.6); th.position.set(0,0,r*0.5); g.add(th);
      for(let i=0;i<2;i++){ const st=new THREE.Mesh(this.geo.box,this.mat(0x1c160c)); st.scale.set(r*1.5,r*1.25,3); st.position.set(0,0,-r*0.4+(i*r*0.5-r*0.25)); g.add(st); }
      const wingMat=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.42,roughness:0.3,emissive:0x99ccff,emissiveIntensity:0.1});
      const wings=new THREE.Group(); for(const sx of [-1,1]){ const w=new THREE.Mesh(this.geo.sphLo,wingMat); w.scale.set(r*0.9,2,r*0.55); w.position.set(sx*r*0.7,r*0.5,0); wings.add(w); }
      g.add(wings); g.userData.wings=wings;
    } else {
      const seg=[[0.6,r*0.9],[0.7,0],[0.92,-r*1.0]]; seg.forEach(([s,z])=>{ const m=new THREE.Mesh(this.geo.sph,bodyMat); m.scale.setScalar(r*s); m.position.set(0,r*0.7,z); m.castShadow=true; g.add(m); });
      for(const sx of [-1,1]) for(const k of [-1,0,1]){ const leg=new THREE.Mesh(this.geo.cyl,this.mat(0x110f0c)); leg.scale.set(1.2,r*0.9,1.2); leg.position.set(sx*r*0.7,r*0.4,k*r*0.5); leg.rotation.z=sx*0.9; g.add(leg); }
    }
    return g;
  }

  /* ---------------- lifecycle ---------------- */
  reset(){
    const C=CONFIG;
    this.gold=0; this.kills=0; this.totalGold=0;
    this.wave=0; this.waveState='idle'; this.prepTimer=0;
    this.spawnQueue=[]; this.spawnTimer=0; this.spawnInterval=1; this.bossAlive=false;
    this.keeper={x:0,y:170,vx:0,vy:0,aim:-Math.PI/2,fireCd:0,trail:0,mouth:0};
    this.heart={hp:C.cake.baseHp,maxHp:C.cake.baseHp,regen:0,hitFlash:0};
    [this.enemyGroup,this.shotGroup,this.crumbGroup,this.wispGroup,this.fxGroup].forEach(g=>{ while(g.children.length) g.remove(g.children[0]); });
    this.enemies=[]; this.shots=[]; this.motes=[]; this.wisps=[]; this.fx=[];
    this.novaTimer=0; this.novaStats=null; this.sparkleT=0;
    this.wall={active:false}; this.seg=[]; for(let i=0;i<NSEG;i++){ this.seg.push({hp:0,maxHp:0,lastHit:99}); this.saltMeshes[i].visible=false; }
    // rebuild cake to base
    if(this.cakeMesh){ this.scene.remove(this.cakeMesh); } this.cakeLevel=0; this.cakeMesh=this.makeCake(0); this.scene.add(this.cakeMesh);
    this.forageRing.visible=false;
    this.pads=PAD_LAYOUT.map((p,i)=>({bp:p.bp,slot:p.slot,x:p.x,y:p.y,revealAt:p.revealAt||0,minWave:p.minWave||0,
      def:CONFIG.blueprints[p.bp],level:0,invested:0,unlocked:false,pop:0,m:this.padMeshes[i]}));
    this.pads.forEach(p=>{ if(p.m.tower){ p.m.grp.remove(p.m.tower); p.m.tower=null; } if(p.m.marker) p.m.marker.visible=true; p.m.grp.visible=false; });
    this.builtLevels=0; this.evalReveals(true);
  }
  start(){ SFX.resume(); this.reset(); this.started=true; this.ended=false; this.paused=false;
    document.getElementById('start').classList.add('hidden'); document.getElementById('end').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden'); this.nextWave(); }
  end(win){ if(this.ended) return; this.ended=true; this.bossAlive=false; win?SFX.win():SFX.lose(); this.addShake(win?10:18);
    document.getElementById('endTitle').textContent=win?'The Picnic is Saved':'The Ants Win';
    document.getElementById('endText').textContent=win?'One hundred waves of bugs and not a crumb surrendered. Glorious.':'The cake is gone. The ants march home full and happy. Rematch?';
    document.getElementById('eWave').textContent=this.wave; document.getElementById('eKills').textContent=U.fmt(this.kills); document.getElementById('eGold').textContent=U.fmt(this.totalGold);
    document.getElementById('end').classList.remove('hidden'); }
  togglePause(force){ if(!this.started||this.ended) return; this.paused=force!==undefined?force:!this.paused;
    const el=document.getElementById('pause');
    if(this.paused){ document.getElementById('pWave').textContent=this.wave; document.getElementById('pGold').textContent=U.fmt(this.gold); document.getElementById('pHeart').textContent=Math.ceil(100*this.heart.hp/this.heart.maxHp)+'%'; el.classList.remove('hidden'); }
    else el.classList.add('hidden'); }

  /* ---------------- waves ---------------- */
  nextWave(){
    this.wave++; if(this.wave>CONFIG.totalWaves){ this.end(true); return; }
    const n=this.wave, boss=CONFIG.isBossWave(n); let count=CONFIG.waveCount(n); if(boss) count=Math.round(count*0.7);
    const pool=CONFIG.wavePool(n), tw=pool.reduce((s,p)=>s+p[1],0); this.spawnQueue=[];
    for(let i=0;i<count;i++){ let r=Math.random()*tw,pick=pool[0][0]; for(const [k,w] of pool){ if((r-=w)<=0){pick=k;break;} } this.spawnQueue.push(pick); }
    if(boss){ const j=U.randInt(Math.floor(count*0.4),count); this.spawnQueue.splice(j,0,'boss'); }
    this.spawnInterval=U.clamp(0.7-n*0.0072,0.08,0.7); this.spawnTimer=0.4; this.waveState='active'; this.evalReveals();
    this.showBanner(n,boss?'Something big is coming':null); boss?SFX.boss():SFX.wave();
  }
  spawn(typeKey){
    const C=CONFIG,n=this.wave,base=C.enemies[typeKey],isBoss=typeKey==='boss';
    const a=U.rand(TAU),R=C.spawnR,hpm=isBoss?C.bossHpMul(n):C.hpMul(n),hp=base.hp*hpm;
    const e={type:typeKey,boss:isBoss,x:Math.cos(a)*R,y:Math.sin(a)*R,hp,maxHp:hp,
      speed:base.speed*C.spdMul(n)*(isBoss?0.85:1),dmg:base.dmg*C.dmgMul(n),r:base.r,
      bounty:Math.ceil(base.bounty*C.bountyMul(n)),fly:base.fly,hitFlash:0,wob:U.rand(TAU)};
    e.mesh=this.makeEnemyMesh(typeKey); this.enemyGroup.add(e.mesh);
    e.blob=new THREE.Mesh(this.geo.circle,this.blobMat.clone()); e.blob.rotation.x=-Math.PI/2; e.blob.scale.setScalar(e.r*1.1); e.blob.position.y=1.0; this.enemyGroup.add(e.blob);
    if(isBoss){ this.bossAlive=true; this.addShake(8); }
    this.enemies.push(e);
  }

  /* ---------------- build / reveal / economy ---------------- */
  getPad(id){ return this.pads.find(p=>p.bp===id); }
  getLevel(id){ const p=this.getPad(id); return p?p.level:0; }
  costArg(pad){ return pad.bp==='wisp'?pad.level:pad.level+1; }
  nextCost(pad){ return pad.def.cost(this.costArg(pad)); }
  maxed(pad){ return pad.level>=pad.def.max; }

  evalReveals(silent){
    for(const p of this.pads){ if(p.unlocked) continue;
      const reqOk=!p.def.unlock.requires || this.getLevel(p.def.unlock.requires)>0;
      if(this.builtLevels>=p.revealAt && this.wave>=p.minWave && reqOk){
        p.unlocked=true; p.pop=1; p.m.grp.visible=true;
        if(!silent){ this.toast(`<span class="t-em">New</span> ${p.def.name}`); SFX.unlock(); this.ringFx(p.x,p.y,p.m.col,PAD_R*1.5); }
      }
    }
  }

  applyLevel(pad){
    const bp=pad.def, lv=pad.level; pad.pop=1; this.builtLevels++;
    this.popFx(pad.x,pad.y,pad.m.col,1.3); this.ringFx(pad.x,pad.y,pad.m.col,PAD_R*1.7); SFX.build();
    switch(bp.kind){
      case 'tower':{ if(pad.m.tower) pad.m.grp.remove(pad.m.tower); pad.m.tower=this.makeSprinkler(lv); pad.m.grp.add(pad.m.tower); break; }
      case 'wisp': this.addWisp(); break;
      case 'wall':{ const s=bp.stat(lv); this.wall.active=true; for(let i=0;i<NSEG;i++){ this.seg[i].maxHp=s.segHp; this.seg[i].hp=s.segHp; this.saltMeshes[i].visible=true; } this.wall.regen=s.regen; break; }
      case 'cake':{
        if(bp.id==='hheart'){ const s=bp.stat(lv); const d=s.maxHp-this.heart.maxHp; this.heart.maxHp=s.maxHp; this.heart.hp+=Math.max(0,d);
          this.cakeLevel=lv; this.scene.remove(this.cakeMesh); this.cakeMesh=this.makeCake(lv); this.scene.add(this.cakeMesh);
          this.popFx(0,0,0xff8aa3,2.0); }
        if(bp.id==='hregen'){ this.heart.regen=bp.stat(lv).regen; }
        break; }
      case 'upgrade':
        if(bp.id==='nova'){ this.novaStats=bp.stat(lv); if(this.novaTimer<=0) this.novaTimer=this.novaStats.cd; }
        if(bp.id==='kmagnet'){ this.forageRing.visible=true; }
        break;
    }
    this.evalReveals();
  }
  addWisp(){ const w={a:U.rand(TAU),fireCd:U.rand(0.5),x:this.keeper.x,y:this.keeper.y};
    w.core=new THREE.Mesh(this.geo.sph,this.mat(0xffe27a,{e:0.9,r:0.3})); w.core.scale.setScalar(7);
    w.glow=this.glow(0xffd24a,16,0.5); w.mesh=new THREE.Group(); w.mesh.add(w.core,w.glow); this.wispGroup.add(w.mesh); this.wisps.push(w); }

  updateBuild(dt){
    const k=this.keeper;
    for(const p of this.pads){ if(!p.unlocked||this.maxed(p)) continue;
      if(U.dist(k.x,k.y,p.x,p.y)<PAD_R+CONFIG.hero.radius && this.gold>0){
        const cost=this.nextCost(p), rate=Math.max(30,cost/DRAIN_TIME);
        let t=Math.min(rate*dt,this.gold,cost-p.invested); this.gold-=t; p.invested+=t;
        if(p.invested>=cost-1e-6){ p.invested-=cost; p.level++; this.applyLevel(p); if(this.maxed(p)) p.invested=0; }
      }
    }
  }

  /* ---------------- input / ui ---------------- */
  bindInput(){
    const keymap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
    addEventListener('keydown',e=>{ if(e.code==='Escape'){this.togglePause();return;} if(keymap[e.code]){this.input[keymap[e.code]]=true;e.preventDefault();} });
    addEventListener('keyup',e=>{ if(keymap[e.code]) this.input[keymap[e.code]]=false; });
    const cv=this.canvas,stick=document.getElementById('stick'),nub=document.getElementById('stickNub');
    const down=(px,py,id)=>{ this.joy.active=true; this.joy.id=id; this.joy.ox=px; this.joy.oy=py; this.joy.dx=0; this.joy.dy=0; stick.style.left=px+'px'; stick.style.top=py+'px'; stick.classList.remove('hidden'); nub.style.transform='translate(-50%,-50%)'; };
    const move=(px,py)=>{ if(!this.joy.active) return; let dx=px-this.joy.ox,dy=py-this.joy.oy; const max=52,d=Math.hypot(dx,dy); if(d>max){dx=dx/d*max;dy=dy/d*max;} this.joy.dx=dx/max; this.joy.dy=dy/max; nub.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`; };
    const up=()=>{ this.joy.active=false; this.joy.dx=0; this.joy.dy=0; stick.classList.add('hidden'); };
    cv.addEventListener('touchstart',e=>{ const t=e.changedTouches[0]; down(t.clientX,t.clientY,t.identifier); e.preventDefault(); },{passive:false});
    cv.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) move(t.clientX,t.clientY); } e.preventDefault(); },{passive:false});
    cv.addEventListener('touchend',e=>{ for(const t of e.changedTouches){ if(t.identifier===this.joy.id) up(); } });
    cv.addEventListener('touchcancel',up);
    cv.addEventListener('mousedown',e=>down(e.clientX,e.clientY,'m')); addEventListener('mousemove',e=>move(e.clientX,e.clientY)); addEventListener('mouseup',up);
  }
  bindUI(){ const $=id=>document.getElementById(id);
    $('playBtn').onclick=()=>this.start(); $('againBtn').onclick=()=>this.start();
    $('pauseBtn').onclick=()=>this.togglePause(true); $('resumeBtn').onclick=()=>this.togglePause(false);
    $('restartBtn').onclick=()=>{ this.togglePause(false); this.start(); };
    $('muteBtn').onclick=e=>{ const m=!SFX.isMuted(); SFX.setMuted(m); e.target.textContent='Sound: '+(m?'Off':'On'); }; }

  /* ---------------- update ---------------- */
  update(dt){
    this.time+=dt; this.shake=Math.max(0,this.shake-dt*40);
    const k=this.keeper,C=CONFIG;
    let mx=(this.input.right?1:0)-(this.input.left?1:0), my=(this.input.down?1:0)-(this.input.up?1:0);
    if(this.joy.active&&(this.joy.dx||this.joy.dy)){ mx=this.joy.dx; my=this.joy.dy; }
    const ml=Math.hypot(mx,my); if(ml>1){ mx/=ml; my/=ml; }
    const spdLv=this.getLevel('kspeed'), spd=C.hero.baseSpeed*C.blueprints.kspeed.stat(spdLv).mul;
    k.x+=mx*spd*dt; k.y+=my*spd*dt;
    const kd=Math.hypot(k.x,k.y),lim=C.arenaR-C.hero.radius; if(kd>lim){ k.x=k.x/kd*lim; k.y=k.y/kd*lim; }
    k.moving=ml>0.1; k.mouth=Math.max(0,k.mouth-dt*5);
    // hop dust trail (scales with Hop)
    if(k.moving){ k.trail-=dt; if(k.trail<=0){ k.trail=0.12-spdLv*0.012; this.dust(k.x,k.y,spdLv); } }

    this.updateBuild(dt);

    if(this.waveState==='active'){
      this.spawnTimer-=dt;
      if(this.spawnTimer<=0 && this.spawnQueue.length && this.enemies.length<C.aliveCap){ this.spawn(this.spawnQueue.shift()); this.spawnTimer=this.spawnInterval; }
      if(this.spawnQueue.length===0 && this.enemies.length===0) this.clearWave();
    } else if(this.waveState==='prep'){ this.prepTimer-=dt; if(this.prepTimer<=0) this.nextWave(); }

    // hero auto-fire (tongue)
    const kdmgLv=this.getLevel('kdamage'), kdmg=C.hero.baseDamage*C.blueprints.kdamage.stat(kdmgLv).mul;
    const krate=C.hero.baseFireRate*C.blueprints.kfire.stat(this.getLevel('kfire')).mul;
    k.fireCd-=dt; const tgt=this.nearestEnemy(k.x,k.y,C.hero.baseRange);
    if(tgt) k.aim=U.ang(k.x,k.y,tgt.x,tgt.y);
    if(tgt && k.fireCd<=0){ k.fireCd=1/krate; this.fireShot(k.x,k.y,tgt,kdmg,C.hero.projSpeed,'keeper',kdmgLv); k.mouth=1;
      this.muzzle(k.x,k.y,k.aim,this.getLevel('kfire')); SFX.shoot(); }

    this.updateTowers(dt); this.updateWisps(dt); this.updateEnemies(dt);
    this.updateShots(dt); this.updateMotes(dt); this.updateNova(dt); this.updateWall(dt);

    if(this.heart.regen>0&&this.heart.hp<this.heart.maxHp) this.heart.hp=Math.min(this.heart.maxHp,this.heart.hp+this.heart.regen*dt);
    this.heart.hitFlash=Math.max(0,this.heart.hitFlash-dt*3);
    if(this.heart.hp<=0){ this.heart.hp=0; this.end(false); }

    for(const p of this.pads) p.pop=Math.max(0,p.pop-dt*2.2);
    // fx
    for(let i=this.fx.length-1;i>=0;i--){ const f=this.fx[i]; f.life-=dt; const a=U.clamp(f.life/f.max,0,1);
      if(f.type==='ring'){ const s=U.lerp(f.r0,f.r1,1-a); f.mesh.scale.set(s,s,s); f.mesh.material.opacity=a*0.85; }
      else if(f.type==='glow'){ f.mesh.scale.setScalar(f.s*(0.5+(1-a)*0.9)); f.mesh.material.opacity=a*0.85; f.mesh.position.y+=dt*26; }
      if(f.life<=0){ this.fxGroup.remove(f.mesh); this.fx.splice(i,1); } }
  }

  clearWave(){
    // uncollected crumbs become the round bonus (they don't despawn)
    let leftover=0; for(const m of this.motes) leftover+=m.val;
    const flat=Math.ceil(4+this.wave*1.5), bonus=Math.ceil(leftover)+flat;
    this.gold+=bonus; this.totalGold+=Math.ceil(leftover); // flat already not in totalGold history; keep simple
    this.totalGold+=flat;
    for(const m of this.motes){ m.sweep=true; m.swt=0; }
    this.toast(`Wave ${this.wave} cleared · <span class="t-em">+${U.fmt(bonus)}</span> crumbs`);
    this.waveState='prep'; this.prepTimer=2.4;
  }

  nearestEnemy(x,y,range){ let best=null,bd=range*range; for(const e of this.enemies){ const d=U.dist2(x,y,e.x,e.y); if(d<bd){bd=d;best=e;} } return best; }

  fireShot(x,y,tgt,dmg,speed,owner,lv){
    const a=U.ang(x,y,tgt.x,tgt.y);
    const s={x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,dmg,life:1.6,owner,r:owner==='keeper'?7:6,h:tgt.fly?40:20};
    const grp=new THREE.Group(); grp.rotation.y=Math.atan2(s.vx,s.vy); // local +Z aligns with travel
    if(owner==='keeper'){
      const sz=1+(lv||0)*0.06, col=(lv||0)>=7?0xff9ec4:0xff5a8a;
      const core=new THREE.Mesh(this.geo.sph,this.mat(col,{e:0.95,r:0.25})); core.scale.set(7*sz,7*sz,26*sz); grp.add(core);
      const tail=new THREE.Mesh(this.geo.sph,this.mat(0xff5a8a,{e:0.5,r:0.3})); tail.scale.set(4*sz,4*sz,40*sz); tail.position.z=-22*sz; tail.material.transparent=true; tail.material.opacity=0.35; grp.add(tail);
      grp.add(this.glow(0xff7aa8,22*sz,0.8)); s.r=8*sz;
    } else if(owner==='spire'){
      const core=new THREE.Mesh(this.geo.sph,this.mat(0x8fd6ff,{e:0.85,r:0.2})); core.scale.set(7,7,13); grp.add(core); grp.add(this.glow(0xbfeaff,16,0.65));
    } else { // firefly
      const core=new THREE.Mesh(this.geo.sph,this.mat(0xffe27a,{e:0.95,r:0.2})); core.scale.setScalar(6.5); grp.add(core); grp.add(this.glow(0xffd24a,14,0.65));
    }
    s.mesh=grp; this.shotGroup.add(grp); this.shots.push(s);
  }

  updateTowers(dt){ const C=CONFIG;
    for(const p of this.pads){ if(p.bp!=='spire'||p.level<1) continue;
      if(p.m.tower) p.m.tower.userData.arms.rotation.y+=dt*6;
      p.fireCd=(p.fireCd||0)-dt; const s=C.blueprints.spire.stat(p.level);
      if(p.fireCd<=0){ const t=this.nearestEnemy(p.x,p.y,s.range); if(t){ p.fireCd=1/s.rate; this.fireShot(p.x,p.y,t,s.damage,s.proj,'spire'); SFX.turret(); } } }
  }
  updateWisps(dt){ const C=CONFIG,k=this.keeper,n=this.wisps.length; if(!n) return;
    const lv=this.getLevel('wisptier'), s=C.blueprints.wisptier.stat(lv); this.wRot=(this.wRot||0)+dt*1.1;
    for(let i=0;i<n;i++){ const w=this.wisps[i],a=this.wRot+i*(TAU/n),rad=58+(n>6?16:0);
      w.x=U.lerp(w.x,k.x+Math.cos(a)*rad,Math.min(1,dt*8)); w.y=U.lerp(w.y,k.y+Math.sin(a)*rad,Math.min(1,dt*8));
      const sc=1+lv*0.08; w.core.scale.setScalar(7*sc); w.glow.scale.setScalar((16+lv*2)*(0.9+Math.sin(this.time*8+i)*0.1));
      w.fireCd-=dt; if(w.fireCd<=0){ const t=this.nearestEnemy(w.x,w.y,s.range); if(t){ w.fireCd=1/s.rate; this.fireShot(w.x,w.y,t,s.damage,540,'wisp'); } } }
  }
  updateEnemies(dt){ const C=CONFIG,list=this.enemies;
    for(let i=list.length-1;i>=0;i--){ const e=list[i]; e.hitFlash=Math.max(0,e.hitFlash-dt*4); e.wob+=dt*8;
      const dist=Math.hypot(e.x,e.y)||0.001; let ux=-e.x/dist,uy=-e.y/dist,sx=0,sy=0;
      for(let j=0;j<list.length;j++){ if(j===i) continue; const o=list[j]; const dx=e.x-o.x,dy=e.y-o.y,dd=dx*dx+dy*dy,rr=e.r+o.r; if(dd>0.01&&dd<rr*rr){ const d=Math.sqrt(dd); sx+=dx/d; sy+=dy/d; } }
      let nx=e.x+(ux*e.speed+sx*22)*dt, ny=e.y+(uy*e.speed+sy*22)*dt, nd=Math.hypot(nx,ny), ang=Math.atan2(ny,nx);
      if(this.wall.active&&!e.fly&&nd>C.wallR&&nd<C.wallR+e.r+6){ const idx=((Math.floor(((ang+TAU)%TAU)/TAU*NSEG))%NSEG+NSEG)%NSEG, sg=this.seg[idx];
        if(sg.hp>0){ nd=C.wallR+e.r; nx=Math.cos(ang)*nd; ny=Math.sin(ang)*nd; sg.hp-=e.dmg*dt; sg.lastHit=0; if(sg.hp<=0) this.popFx(nx,ny,0xffffff,0.9); } }
      const hr=C.cake.radius+e.r; if(nd<hr){ nd=hr; nx=Math.cos(ang)*hr; ny=Math.sin(ang)*hr; this.heart.hp-=e.dmg*dt; this.heart.hitFlash=1; }
      e.x=nx; e.y=ny; e.facing=ang; if(e.hp<=0) this.killEnemy(e,i);
    }
  }
  killEnemy(e,i){ this.enemies.splice(i,1); this.kills++; this.enemyGroup.remove(e.mesh); this.enemyGroup.remove(e.blob);
    if(e.boss){ this.bossAlive=false; this.addShake(14); SFX.boss(); this.ringFx(e.x,e.y,0xff8a4a,e.r*4); }
    SFX.kill(); this.popFx(e.x,e.y,e.boss?0xffd24a:CONFIG.enemies[e.type].hex,e.boss?2.6:1.0);
    const n=e.boss?8:U.clamp(1+Math.floor(e.bounty/6),1,4), per=e.bounty/n;
    for(let m=0;m<n;m++){ const a=U.rand(TAU),s=U.rand(30,110);
      const mo={x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,val:per,spin:U.rand(TAU),sweep:false};
      mo.mesh=new THREE.Mesh(this.geo.ico,this.mat(0xffc23a,{e:0.45,r:0.35})); mo.mesh.scale.setScalar(CONFIG.crumb.radius); this.crumbGroup.add(mo.mesh); this.motes.push(mo); }
  }
  updateShots(dt){ const list=this.shots;
    for(let i=list.length-1;i>=0;i--){ const s=list[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=dt; let hit=false;
      for(const e of this.enemies){ if(U.dist2(s.x,s.y,e.x,e.y)<(e.r+s.r)*(e.r+s.r)){ e.hp-=s.dmg; e.hitFlash=1; hit=true;
        this.popFx(s.x,s.y, s.owner==='keeper'?0xff7aa8:0xbfeaff,0.5); SFX.hit(); break; } }
      if(hit||s.life<=0||Math.hypot(s.x,s.y)>CONFIG.spawnR+80){ this.shotGroup.remove(s.mesh); list.splice(i,1); } }
  }
  updateMotes(dt){ const C=CONFIG,k=this.keeper,list=this.motes;
    const pr=C.hero.pickupRadius+C.blueprints.kmagnet.stat(this.getLevel('kmagnet')).add;
    for(let i=list.length-1;i>=0;i--){ const m=list[i]; m.spin+=dt*4;
      if(m.sweep){ m.swt+=dt; m.mesh.position.y=12+m.swt*120; m.mesh.material.transparent=true; m.mesh.material.opacity=Math.max(0,1-m.swt*1.4); if(m.swt>0.8){ this.crumbGroup.remove(m.mesh); list.splice(i,1); } continue; }
      m.vx*=0.9; m.vy*=0.9; const d=U.dist(k.x,k.y,m.x,m.y);
      if(d<pr){ const a=U.ang(m.x,m.y,k.x,k.y),pull=C.crumb.magnet*(0.4+0.6*(1-d/pr)); m.vx=U.lerp(m.vx,Math.cos(a)*pull,0.4); m.vy=U.lerp(m.vy,Math.sin(a)*pull,0.4); }
      m.x+=m.vx*dt; m.y+=m.vy*dt;
      if(d<C.hero.radius+10){ this.gold+=m.val; this.totalGold+=m.val; SFX.pickup(); this.crumbGroup.remove(m.mesh); list.splice(i,1); }
    }
  }
  updateNova(dt){ if(this.getLevel('nova')<1||!this.novaStats) return; this.novaTimer-=dt;
    if(this.novaTimer<=0){ const s=this.novaStats; this.novaTimer=s.cd; this.ringFx(0,0,0xffd24a,s.radius); this.addShake(6); SFX.build();
      for(const e of this.enemies){ if(Math.hypot(e.x,e.y)<s.radius+e.r){ e.hp-=s.damage; e.hitFlash=1; const a=Math.atan2(e.y,e.x); e.x+=Math.cos(a)*24; e.y+=Math.sin(a)*24; } } }
  }
  updateWall(dt){ if(!this.wall.active) return; const rg=this.wall.regen||0; for(const sg of this.seg){ sg.lastHit+=dt; if(sg.lastHit>2&&sg.hp<sg.maxHp) sg.hp=Math.min(sg.maxHp,sg.hp+rg*dt); } }

  /* ---------------- fx ---------------- */
  addShake(m){ this.shake=Math.min(26,this.shake+m); }
  popFx(x,y,hex,scale){ const g=this.glow(hex,1,0.8); g.position.set(x,18,y); this.fxGroup.add(g); this.fx.push({mesh:g,type:'glow',life:0.38,max:0.38,s:22*scale}); }
  dust(x,y,lv){ const g=this.glow(0xdcedb0,1,0.5); g.position.set(x,5,y); this.fxGroup.add(g); this.fx.push({mesh:g,type:'glow',life:0.4,max:0.4,s:12+lv*2}); }
  muzzle(x,y,a,lv){ const g=this.glow(0xffd0e0,1,0.7); g.position.set(x+Math.cos(a)*24,18,y+Math.sin(a)*24); this.fxGroup.add(g); this.fx.push({mesh:g,type:'glow',life:0.16,max:0.16,s:14+lv*2}); }
  ringFx(x,y,hex,radius){ const m=new THREE.Mesh(this.geo.ring,new THREE.MeshBasicMaterial({color:hex,transparent:true,opacity:0.85,side:THREE.DoubleSide})); m.rotation.x=-Math.PI/2; m.position.set(x,3,y); this.fxGroup.add(m); this.fx.push({mesh:m,type:'ring',life:0.55,max:0.55,r0:10,r1:radius}); }

  /* ---------------- HUD ---------------- */
  toast(html){ const t=document.getElementById('toast'); t.innerHTML=html; t.classList.add('show'); clearTimeout(this._tt); this._tt=setTimeout(()=>t.classList.remove('show'),2200); }
  showBanner(n,sub){ const b=document.getElementById('waveBanner'),boss=CONFIG.isBossWave(n);
    b.innerHTML=`<span class="wb-k">${boss?'BOSS WAVE':'WAVE'}</span><span class="wb-n">${n}</span>`+(sub?`<span class="wb-s">${sub}</span>`:''); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  syncHUD(){ document.getElementById('waveNum').textContent=this.wave; document.getElementById('goldNum').textContent=U.fmt(this.gold);
    const pct=U.clamp(this.heart.hp/this.heart.maxHp,0,1); const f=document.getElementById('heartFill'); f.style.width=(pct*100)+'%';
    f.style.background=pct<0.3?'linear-gradient(90deg,#ff4d4d,#ff9a9a)':'linear-gradient(90deg,var(--berry),#ff8aa3)';
    document.getElementById('heartTxt').textContent=Math.ceil(pct*100)+'%'; }

  /* ---------------- scene sync ---------------- */
  syncScene(){
    const k=this.keeper, ud=this.heroMesh.userData;
    this.heroMesh.position.set(k.x,k.moving?Math.abs(Math.sin(this.time*12))*4:0,k.y);
    this.heroMesh.rotation.y=-k.aim+Math.PI/2;
    if(ud.mouth) ud.mouth.scale.y=1+k.mouth*4; if(ud.body) ud.body.scale.y=15*(1-k.mouth*0.06);
    this.heroBlob.position.set(k.x,1.0,k.y);
    // forage aura
    if(this.forageRing.visible){ const pr=CONFIG.hero.pickupRadius+CONFIG.blueprints.kmagnet.stat(this.getLevel('kmagnet')).add; this.forageRing.scale.setScalar(pr); this.forageRing.position.set(k.x,1.3,k.y); this.forageRing.material.opacity=0.10+Math.sin(this.time*3)*0.04; }
    for(const w of this.wisps) w.mesh.position.set(w.x,38+Math.sin(this.time*6+w.a*7)*6,w.y);
    for(const e of this.enemies){ const baseY=e.fly?40+Math.sin(this.time*10+e.wob)*5:Math.abs(Math.sin(e.wob))*3;
      e.mesh.position.set(e.x,baseY,e.y); e.mesh.rotation.y=-(e.facing||0)+Math.PI/2; e.mesh.scale.setScalar(e.hitFlash>0?1.12:1);
      if(e.mesh.userData.wings) e.mesh.userData.wings.rotation.z=Math.sin(this.time*40)*0.4;
      e.blob.position.set(e.x,1.0,e.y); e.blob.material.opacity=e.fly?0.10:0.20; }
    for(const m of this.motes){ if(m.sweep) continue; m.mesh.position.set(m.x,12+Math.sin(this.time*4+m.spin)*3,m.y); m.mesh.rotation.set(m.spin*0.7,m.spin,0); }
    if(this.wall.active){ for(let i=0;i<NSEG;i++){ const sg=this.seg[i],r=sg.maxHp>0?U.clamp(sg.hp/sg.maxHp,0,1):0,m=this.saltMeshes[i]; m.visible=r>0.02; const w=(TAU*CONFIG.wallR/NSEG)*0.92; m.scale.set(w,6+r*16,8+r*6); m.position.y=(6+r*16)/2; } }
    this.cakeMesh.rotation.y=Math.sin(this.time*0.25)*0.05;
    // frosting sparkle when regen active
    if(this.heart.regen>0){ this.sparkleT-=1/60; if(this.sparkleT<=0){ this.sparkleT=0.18; const a=U.rand(TAU),r=U.rand(20,55); this.popFx(Math.cos(a)*r,Math.sin(a)*r,0xffffff,0.3); } }
    for(const p of this.pads){ const m=p.m; if(!p.unlocked){ m.grp.visible=false; m.el.style.opacity=0; continue; }
      m.grp.visible=true; const maxed=this.maxed(p), near=U.dist(k.x,k.y,p.x,p.y)<PAD_R+CONFIG.hero.radius;
      m.ringM.material.opacity=maxed?0.25:(near?0.95:0.5); const pop=1+p.pop*0.25; m.ringM.scale.setScalar(pop);
      if(m.marker){ m.marker.visible=!maxed; m.marker.rotation.y=this.time*1.5; m.marker.position.y=30+Math.sin(this.time*2.5+p.x)*3; if(m.mglow){ m.mglow.position.y=m.marker.position.y; m.mglow.visible=!maxed; } }
      const cost=maxed?1:this.nextCost(p), prog=maxed?0:U.clamp(p.invested/cost,0,1);
      m.prog.geometry.dispose(); m.prog.geometry=new THREE.RingGeometry(PAD_R-7,PAD_R-3.5,48,1,Math.PI/2,-prog*TAU); m.prog.material.opacity=prog>0?0.95:0;
    }
    this.updatePadLabels();
  }
  updatePadLabels(){ const W=this.W,H=this.H,v=new THREE.Vector3();
    for(const p of this.pads){ const m=p.m; if(!p.unlocked){ m.el.style.display='none'; continue; }
      v.set(p.x,52,p.y); v.project(this.camera); if(v.z>1){ m.el.style.display='none'; continue; }
      const sx=(v.x*0.5+0.5)*W, sy=(-v.y*0.5+0.5)*H, near=U.dist(this.keeper.x,this.keeper.y,p.x,p.y)<150;
      m.el.style.display=''; m.el.style.transform=`translate(-50%,-50%) translate(${sx}px,${sy}px)`+(near?' scale(1.08)':''); m.el.style.opacity=near?1:0.5; m.el.style.zIndex=near?2:1;
      const lvTxt=p.bp==='wisp'?` ${p.level}/${p.def.max}`:(p.level>0?` Lv${p.level}`:''); m.elName.textContent=p.def.name+lvTxt;
      const maxed=this.maxed(p);
      if(maxed){ m.elCost.style.display='none'; m.elMax.style.display='block'; }
      else { m.elCost.style.display='flex'; m.elMax.style.display='none'; const remain=Math.max(0,Math.ceil(this.nextCost(p)-p.invested)); m.elNum.textContent=U.fmt(remain); m.elCost.classList.toggle('poor',this.gold<this.nextCost(p)-p.invested); }
    }
  }

  resize(){ const w=window.innerWidth,h=window.innerHeight; this.W=w; this.H=h; this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  loop(now){ let dt=(now-this.last)/1000; this.last=now; if(dt>0.05) dt=0.05;
    if(this.started&&!this.paused&&!this.ended){ this.update(dt); this.syncHUD(); }
    this.syncScene();
    const k=this.keeper, fx=this.shake>0?U.rand(-this.shake,this.shake):0, fz=this.shake>0?U.rand(-this.shake,this.shake):0;
    this.camera.position.set(this.camBase.x+k.x*0.08+fx,this.camBase.y,this.camBase.z+k.y*0.08+fz);
    this.camera.lookAt(this.camTarget.x+k.x*0.08,0,this.camTarget.z+k.y*0.08);
    this.renderer.render(this.scene,this.camera);
    requestAnimationFrame(t=>this.loop(t));
  }
}

window.addEventListener('load',()=>{ window.game=new Game(); });
