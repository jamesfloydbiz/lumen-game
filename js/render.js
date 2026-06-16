/* ============================================================
   MONKEY BREACH — render.js  (Three.js r128)
   Bright, chunky, iso-ish zoo defense. Reuses the steep operator
   camera + dashed build-pad pattern; new cast of props.
   ============================================================ */
'use strict';

const ACCENT = { net:0x49b7e8, gold:0xffce5e, mud:0x9a6a38, wood:0xc08a3a };

class Renderer{
  constructor(canvas, game){
    this.game=game; const C=CONFIG;
    const r=this.renderer=new THREE.WebGLRenderer({canvas, antialias:true});
    r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    r.shadowMap.enabled=true; r.shadowMap.type=THREE.PCFSoftShadowMap;
    r.outputEncoding=THREE.sRGBEncoding; r.toneMapping=THREE.NoToneMapping;
    const scene=this.scene=new THREE.Scene(); scene.background=new THREE.Color(0x7cc3e6); scene.fog=new THREE.Fog(0x9fd8b0,170,300);
    this.camera=new THREE.PerspectiveCamera(42,1,1,1000); this.camera.position.set(0,80,60); this.camera.lookAt(0,0,1);
    scene.add(new THREE.HemisphereLight(0xbfe2ff,0x6aa83e,0.55));
    const sun=new THREE.DirectionalLight(0xfff4da,1.0); sun.position.set(28,70,36); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
    const sc=sun.shadow.camera; sc.near=20; sc.far=200; sc.left=-50; sc.right=50; sc.top=70; sc.bottom=-70; sun.shadow.bias=-0.0004; scene.add(sun);

    // ground + lane
    const grass=new THREE.Mesh(new THREE.CircleGeometry(160,48), this.mat(0x55a336,{r:1})); grass.rotation.x=-Math.PI/2; grass.receiveShadow=true; scene.add(grass);
    const lane=new THREE.Mesh(new THREE.PlaneGeometry(16, C.worldH-6), this.mat(0xcDB07a?0xcdb07a:0xcdb07a,{r:1})); lane.rotation.x=-Math.PI/2; lane.position.set(0,0.02,-2); scene.add(lane);
    const dirt=new THREE.Mesh(new THREE.CircleGeometry(13,32), this.mat(0xd8bd86,{r:1})); dirt.rotation.x=-Math.PI/2; dirt.position.set(C.pile.x,0.03,C.pile.y); scene.add(dirt);

    this.staticGroup=new THREE.Group(); scene.add(this.staticGroup);   // fence
    this.monkeyGroup=new THREE.Group(); this.netGroup=new THREE.Group(); this.towerGroup=new THREE.Group();
    this.padGroup=new THREE.Group(); this.fxGroup=new THREE.Group();
    scene.add(this.monkeyGroup,this.netGroup,this.towerGroup,this.padGroup,this.fxGroup);
    this.fx=[];

    this.glowTex=this.makeGlow(); this.squareTex=this.makeSquare();
    this.iconTex={}; for(const k in CONFIG.pads) this.iconTex[k]=this.makeIcon(k);

    // banana pile (core)
    this.pileGroup=new THREE.Group(); this.pileGroup.position.set(C.pile.x,0,C.pile.y); scene.add(this.pileGroup); this.pileMeshes=[]; this.buildPile(C.bananas);
    // hero
    this.hero=this.makeHero(); scene.add(this.hero);
    // truck (hidden until wave end)
    this.truck=this.makeTruck(); this.truck.visible=false; scene.add(this.truck);

    this.buildFence(1); this.buildPads(PAD_LAYOUT);
    this.padLabelWrap=document.getElementById('padlabels');
    this.resize();
  }
  mat(hex,o={}){ return new THREE.MeshStandardMaterial({color:hex,roughness:o.r??0.7,metalness:o.m||0,emissive:o.e?hex:0,emissiveIntensity:o.e||0}); }
  makeGlow(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,230,150,0.6)'); g.addColorStop(1,'rgba(255,210,90,0)'); x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); }
  makeSquare(){ const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'); x.strokeStyle='#fff'; x.lineWidth=9; x.setLineDash([16,12]); x.lineCap='round'; const m=14,s=100; x.strokeRect(m,m,s,s); x.setLineDash([]); x.fillStyle='rgba(255,255,255,0.07)'; x.fillRect(m,m,s,s); return new THREE.CanvasTexture(c); }
  makeIcon(type){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); x.strokeStyle='#fff'; x.fillStyle='#fff'; x.lineWidth=4; x.lineCap='round'; x.lineJoin='round';
    if(type==='net'){ for(let i=0;i<=4;i++){ x.beginPath(); x.moveTo(12+i*10,14); x.lineTo(12+i*10,50); x.stroke(); } for(let j=0;j<=4;j++){ x.beginPath(); x.moveTo(12,14+j*9); x.lineTo(52,14+j*9); x.stroke(); } }
    else if(type==='decoy'){ x.beginPath(); x.ellipse(32,40,16,9,0,0,Math.PI*2); x.fill(); x.beginPath(); x.moveTo(22,34); x.quadraticCurveTo(32,16,42,34); x.lineWidth=6; x.stroke(); }
    else if(type==='cage'){ x.strokeRect(16,16,32,32); for(const px of [26,38]){ x.beginPath(); x.moveTo(px,16); x.lineTo(px,48); x.stroke(); } x.beginPath(); x.moveTo(16,32); x.lineTo(48,32); x.stroke(); }
    else if(type==='mud'){ x.beginPath(); x.ellipse(32,36,18,11,0,0,Math.PI*2); x.fill(); }
    else { x.lineWidth=6; for(const px of [20,32,44]){ x.beginPath(); x.moveTo(px,14); x.lineTo(px,50); x.stroke(); } x.beginPath(); x.moveTo(14,26); x.lineTo(50,26); x.stroke(); x.beginPath(); x.moveTo(14,40); x.lineTo(50,40); x.stroke(); }
    return new THREE.CanvasTexture(c); }

  buildFence(breaches){ const g=this.staticGroup; while(g.children.length) g.remove(g.children[0]); const C=CONFIG;
    const xs=C.breachXs(breaches), y=C.breachY, mat=this.mat(0x9c6b3b,{r:0.8}), postMat=this.mat(0x7a5128,{r:0.8});
    // build fence segments across the top, leaving gaps at breach xs
    const half=C.worldW/2, gapW=8; const cuts=xs.map(x=>[x-gapW/2,x+gapW/2]).sort((a,b)=>a[0]-b[0]);
    let cursor=-half; const segs=[]; for(const [a,b] of cuts){ if(a>cursor) segs.push([cursor,a]); cursor=b; } if(cursor<half) segs.push([cursor,half]);
    for(const [a,b] of segs){ const w=b-a; const rail=new THREE.Mesh(new THREE.BoxGeometry(w,3.2,1.0),mat); rail.position.set((a+b)/2,2.0,y); rail.castShadow=true; g.add(rail);
      for(let px=a+1; px<b; px+=4){ const p=new THREE.Mesh(new THREE.BoxGeometry(0.9,4.2,1.2),postMat); p.position.set(px,2.1,y); p.castShadow=true; g.add(p); } }
    // broken posts at the breach edges
    for(const x of xs){ for(const sx of [-1,1]){ const p=new THREE.Mesh(new THREE.BoxGeometry(0.9,3.0,1.2),postMat); p.position.set(x+sx*gapW/2,1.5,y); p.rotation.z=sx*0.3; g.add(p); } }
    this.breaches=breaches;
  }

  buildPile(n){ const g=this.pileGroup; while(g.children.length) g.remove(g.children[0]); this.pileMeshes=[];
    const show=Math.min(n,22); const bMat=this.mat(0xffcf33,{r:0.5}), tipMat=this.mat(0x6a4a1e);
    for(let i=0;i<show;i++){ const a=(i*2.39); const rr=1.2+ (i%4)*1.1; const bx=Math.cos(a)*rr*0.9, bz=Math.sin(a)*rr*0.9, by=0.6+Math.floor(i/7)*1.1;
      const ban=new THREE.Mesh(THREE.CapsuleGeometry?new THREE.CapsuleGeometry(0.35,1.3,4,6):new THREE.CylinderGeometry(0.3,0.34,1.7,7), bMat);
      ban.position.set(bx,by,bz); ban.rotation.set(Math.random?0:0, a, 1.1+ (i%3)*0.2); ban.castShadow=true; g.add(ban); this.pileMeshes.push(ban); }
    // a sign
  }
  updatePile(n){ if(n!==this._pileN){ this._pileN=n; this.buildPile(Math.max(0,n)); } }

  makeHero(){ const g=new THREE.Group();
    const legs=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.8,1.6,8),this.mat(0x5a4a32)); legs.position.y=0.8; legs.castShadow=true; g.add(legs);
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.05,2.4,12),this.mat(0xc2a36a)); torso.position.y=2.4; torso.castShadow=true; g.add(torso);
    const vest=new THREE.Mesh(new THREE.CylinderGeometry(1.32,1.18,1.1,12),this.mat(0xe8743a,{e:0.12})); vest.position.y=2.95; g.add(vest);   // hi-vis vest pops vs grass
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.95,14,12),this.mat(0xe8c79a)); head.position.y=4.15; head.castShadow=true; g.add(head);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.96,14,8,0,Math.PI*2,0,Math.PI*0.55),this.mat(0x4a6a2e)); cap.position.y=4.5; g.add(cap);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,0.14,16),this.mat(0x4a6a2e)); brim.position.set(0,4.45,0.25); g.add(brim);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.45,2.4),this.mat(0x39424a)); gun.position.set(0.95,2.7,1.0); g.add(gun);
    const halo=new THREE.Mesh(new THREE.RingGeometry(1.9,2.4,28),new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,opacity:0.55,side:THREE.DoubleSide})); halo.rotation.x=-Math.PI/2; halo.position.y=0.13; g.add(halo);
    g.userData.body=torso; return g; }

  makeMonkey(type){ const def=CONFIG.monkeys[type], g=new THREE.Group(), r=def.r, m=this.mat(def.hex,{r:0.6}), dk=this.mat(0x3a2412);
    const body=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),m); body.scale.set(1,1.05,0.9); body.position.y=r; body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(r*0.7,12,10),m); head.position.set(0,r*2.1,r*0.2); head.castShadow=true; g.add(head);
    const face=new THREE.Mesh(new THREE.SphereGeometry(r*0.4,10,8),this.mat(0xe6c79a)); face.position.set(0,r*1.95,r*0.55); g.add(face);
    for(const sx of [-1,1]){ const ear=new THREE.Mesh(new THREE.SphereGeometry(r*0.3,8,6),m); ear.position.set(sx*r*0.7,r*2.3,r*0.1); g.add(ear); }
    const tail=new THREE.Mesh(new THREE.TorusGeometry(r*0.7,r*0.12,6,10,Math.PI*1.4),dk); tail.position.set(0,r*0.9,-r); tail.rotation.x=1.4; g.add(tail);
    g.userData.body=body; g.userData.r=r;
    // net overlay (shown when trapped)
    const net=new THREE.Mesh(new THREE.SphereGeometry(r*1.5,10,8),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:0.8})); net.position.y=r*1.1; net.visible=false; g.add(net); g.userData.net=net;
    // carried banana
    const ban=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,1.1,6),this.mat(0xffcf33)); ban.position.set(r*0.8,r*1.6,r*0.4); ban.rotation.z=0.8; ban.visible=false; g.add(ban); g.userData.ban=ban;
    return g; }

  makeTower(type,lv){ const g=new THREE.Group(), col=ACCENT[CONFIG.pads[type].accent];
    if(type==='net'){ const post=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.6,4+lv*0.6,8),this.mat(0xb8bdc4,{m:0.2})); post.position.y=(4+lv*0.6)/2; post.castShadow=true; g.add(post);
      const head=new THREE.Mesh(new THREE.BoxGeometry(3+lv*0.4,2,3+lv*0.4),this.mat(col,{e:0.35})); head.position.y=4.6+lv*0.6; head.castShadow=true; g.add(head); g.userData.head=head; }
    else if(type==='decoy'){ const dirt=new THREE.Mesh(new THREE.CircleGeometry(4,20),this.mat(0xd8bd86)); dirt.rotation.x=-Math.PI/2; dirt.position.y=0.05; g.add(dirt);
      for(let i=0;i<7+lv*3;i++){ const a=i*2.39; const b=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,1.2,6),this.mat(0xf2c233)); b.position.set(Math.cos(a)*1.4,0.7+(i%3)*0.6,Math.sin(a)*1.4); b.rotation.z=1.0; b.castShadow=true; g.add(b); } }
    else if(type==='cage'){ const base=new THREE.Mesh(new THREE.BoxGeometry(5,0.5,5),this.mat(0x8a8f96)); base.position.y=0.25; g.add(base);
      const cage=new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshBasicMaterial({color:col,wireframe:true,transparent:true,opacity:0.7})); cage.position.y=2.2; g.add(cage); }
    else if(type==='mud'){ const patch=new THREE.Mesh(new THREE.CircleGeometry(CONFIG.pads.mud.stat(lv).r,24),this.mat(0x6e4a24,{r:1})); patch.rotation.x=-Math.PI/2; patch.position.y=0.06; g.add(patch); }
    else { const gate=new THREE.Mesh(new THREE.BoxGeometry(8,3.4,1.2),this.mat(col,{e:0.3})); gate.position.y=1.8; gate.castShadow=true; g.add(gate); }
    return g; }

  makeTruck(){ const g=new THREE.Group();
    const bed=new THREE.Mesh(new THREE.BoxGeometry(6,3.4,10),this.mat(0x3a7a45,{e:0.05})); bed.position.set(0,3.0,-1); bed.castShadow=true; g.add(bed);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(5.6,3.2,4),this.mat(0x2f6238)); cab.position.set(0,2.9,5); cab.castShadow=true; g.add(cab);
    const bars=new THREE.Mesh(new THREE.BoxGeometry(6.2,3.6,10.2),new THREE.MeshBasicMaterial({color:0xddeecc,wireframe:true})); bars.position.copy(bed.position); g.add(bars);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const w=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,1.0,12),this.mat(0x222222)); w.rotation.z=Math.PI/2; w.position.set(sx*3.2,1.4,sz*4); g.add(w); }
    return g; }

  buildPads(layout){ const grp=this.padGroup; while(grp.children.length) grp.remove(grp.children[0]);
    if(this.padEls) this.padEls.forEach(e=>e.remove()); this.padEls=[];
    for(const p of layout){ const col=ACCENT[CONFIG.pads[p.type].accent]; const g=new THREE.Group(); g.position.set(p.x,0,p.y); grp.add(g);
      const sq=new THREE.Mesh(new THREE.PlaneGeometry(6.4,6.4),new THREE.MeshBasicMaterial({map:this.squareTex,color:col,transparent:true,opacity:0.85,depthWrite:false})); sq.rotation.x=-Math.PI/2; sq.position.y=0.09; g.add(sq);
      const icon=new THREE.Sprite(new THREE.SpriteMaterial({map:this.iconTex[p.type],color:col,transparent:true,depthWrite:false})); icon.scale.set(2.6,2.6,1); icon.position.y=3.4; g.add(icon);
      const ring=new THREE.Mesh(new THREE.RingGeometry(2.6,3.0,40,1,Math.PI/2,0.0001),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=0.13; g.add(ring);
      const el=document.createElement('div'); el.className='padlabel'; el.innerHTML=`<span class="pl-name"></span><span class="pl-cost"><span class="pl-coin"></span><span class="pl-num"></span></span><span class="pl-max">MAX</span>`;
      document.getElementById('padlabels').appendChild(el); this.padEls.push(el);
      p.m={g,sq,icon,ring,structure:null,col,el,elName:el.querySelector('.pl-name'),elCost:el.querySelector('.pl-cost'),elNum:el.querySelector('.pl-num'),elMax:el.querySelector('.pl-max')};
    }
  }
  onBuild(p){ if(p.m.structure) p.m.g.remove(p.m.structure); p.m.structure=this.makeTower(p.type,p.level); p.m.g.add(p.m.structure); this.burst(p.x,p.y,p.m.col); }

  /* ---- per-frame ---- */
  syncHero(h,t){ this.hero.position.set(h.x, h.moving?Math.abs(Math.sin(t*11))*0.5:0, h.y); if(h.aim!=null) this.hero.rotation.y=-h.aim+Math.PI/2; }
  syncMonkeys(list){ // create/remove meshes
    for(const m of list){ if(!m.mesh){ m.mesh=this.makeMonkey(m.type); this.monkeyGroup.add(m.mesh); }
      const bob = m.state==='trapped'?0 : Math.abs(Math.sin((m.wob||0)))*0.5;
      m.mesh.position.set(m.x, bob, m.y); m.mesh.rotation.y=-(m.face||0)+Math.PI/2;
      m.mesh.userData.net.visible = m.state==='trapped'; m.mesh.userData.ban.visible = !!m.carrying;
      if(m.state==='trapped') m.mesh.rotation.z=Math.sin((m.struggle||0))*0.15;
    }
  }
  removeMonkeyMesh(m){ if(m.mesh){ this.monkeyGroup.remove(m.mesh); m.mesh=null; } }
  syncNets(list){ while(this.netGroup.children.length<list.length){ const n=new THREE.Mesh(new THREE.TorusGeometry(0.8,0.18,6,10),new THREE.MeshBasicMaterial({color:0xffffff})); this.netGroup.add(n); }
    for(let i=0;i<this.netGroup.children.length;i++){ const c=this.netGroup.children[i]; if(i<list.length){ c.visible=true; c.position.set(list[i].x,2.2,list[i].y); c.rotation.x=Math.PI/2; c.rotation.z=(list[i].spin=(list[i].spin||0)+0.3); } else c.visible=false; } }
  setTruck(v,x,y,ang){ this.truck.visible=v; if(v){ this.truck.position.set(x,0,y); this.truck.rotation.y=ang||0; } }

  updatePads(game,t){ const W=this.W,H=this.H,v=new THREE.Vector3();
    for(const p of game.pads){ const m=p.m; if(!m) continue; const def=CONFIG.pads[p.type], maxed=p.level>=def.max;
      const near=U.dist(game.hero.x,game.hero.y,p.x,p.y)<CONFIG.hero.padReach;
      m.sq.material.opacity=maxed?0.25:(near?1.0:0.7); m.icon.position.y=3.4+Math.sin(t*2.5+p.x)*0.25; m.icon.material.opacity=maxed?0.4:1;
      const cost=maxed?1:def.cost(p.level+1), prog=maxed?0:U.clamp(p.invested/cost,0,1);
      m.ring.geometry.dispose(); m.ring.geometry=new THREE.RingGeometry(2.6,3.0,40,1,Math.PI/2,-prog*TAU); m.ring.material.opacity=prog>0?0.95:0;
      v.set(p.x,4.8,p.y); v.project(this.camera); if(v.z>1){ m.el.style.display='none'; continue; } m.el.style.display='';
      const sx=(v.x*0.5+0.5)*W, sy=(-v.y*0.5+0.5)*H; m.el.style.transform=`translate(-50%,-50%) translate(${sx}px,${sy}px)`+(near?' scale(1.08)':''); m.el.style.opacity=near?1:0.62;
      m.elName.textContent=def.name+(p.level>0?` Lv${p.level}`:'');
      if(maxed){ m.elCost.style.display='none'; m.elMax.style.display='block'; } else { m.elCost.style.display='flex'; m.elMax.style.display='none'; m.elNum.textContent=Math.max(0,Math.ceil(cost-p.invested)); m.elCost.classList.toggle('poor',game.coins<cost-p.invested); }
    }
  }
  hidePads(){ if(this.padEls) this.padEls.forEach(e=>e.style.display='none'); }

  burst(x,y,col){ for(let i=0;i<8;i++){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:col||0xffce5e,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})); sp.position.set(x,2,y); sp.scale.set(2,2,1); this.fxGroup.add(sp); this.fx.push({s:sp,vx:U.rand(-7,7),vy:U.rand(7,13),vz:U.rand(-7,7),life:0.5,max:0.5}); } }
  coinPop(x,y){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:0xffce5e,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})); sp.position.set(x,2,y); sp.scale.set(2.6,2.6,1); this.fxGroup.add(sp); this.fx.push({s:sp,vx:0,vy:15,vz:0,life:0.5,max:0.5}); }
  updateFx(dt){ for(let i=this.fx.length-1;i>=0;i--){ const f=this.fx[i]; f.life-=dt; const a=U.clamp(f.life/f.max,0,1); f.s.position.x+=f.vx*dt; f.s.position.y+=f.vy*dt; f.s.position.z+=f.vz*dt; f.s.material.opacity=a; if(f.life<=0){ this.fxGroup.remove(f.s); this.fx.splice(i,1); } } }

  screenToWorld(sx,sy){ const ndc=new THREE.Vector2((sx/this.W)*2-1,-(sy/this.H)*2+1); const ray=new THREE.Raycaster(); ray.setFromCamera(ndc,this.camera); const t=-ray.ray.origin.y/ray.ray.direction.y; return {x:ray.ray.origin.x+ray.ray.direction.x*t, y:ray.ray.origin.z+ray.ray.direction.z*t}; }
  resize(){ const w=window.innerWidth,h=window.innerHeight; this.W=w; this.H=h; this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  draw(){ this.renderer.render(this.scene,this.camera); }
}
