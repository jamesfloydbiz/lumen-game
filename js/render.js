/* ============================================================
   FLOW — render.js  (Three.js r128)
   Steep operator's-eye 3D view. Heatmap on the floor, crowd as
   gold figures, a Marshal you steer, and Kingshot-style build pads.
   ============================================================ */
'use strict';

const ACCENT = { water:0x6cc5f0, gold:0xffce5e };

class Renderer{
  constructor(canvas, grid, sim, level){
    this.grid=grid; this.sim=sim; this.level=level;
    const r=this.renderer=new THREE.WebGLRenderer({canvas, antialias:true});
    r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    r.outputEncoding=THREE.sRGBEncoding; r.toneMapping=THREE.ACESFilmicToneMapping; r.toneMappingExposure=1.0;
    const scene=this.scene=new THREE.Scene();
    scene.background=new THREE.Color(0x07060a); scene.fog=new THREE.Fog(0x07060a,120,230);
    this.camera=new THREE.PerspectiveCamera(46,1,1,1000); this.camera.position.set(0,58,30); this.camera.lookAt(0,-1,1);
    scene.add(new THREE.HemisphereLight(0x33304a,0x05040a,0.5));
    const key=new THREE.DirectionalLight(0xfff0c8,0.5); key.position.set(20,60,30); scene.add(key);

    // floor heatmap
    this.tex=new THREE.DataTexture(grid.img, grid.cols, grid.rows, THREE.RGBAFormat); this.tex.magFilter=THREE.LinearFilter; this.tex.minFilter=THREE.LinearFilter; this.tex.needsUpdate=true;
    this.floor=new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldW,CONFIG.worldH), new THREE.MeshBasicMaterial({map:this.tex})); this.floor.rotation.x=-Math.PI/2; scene.add(this.floor);
    const base=new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldW,CONFIG.worldH), new THREE.MeshBasicMaterial({color:0x0d0b12})); base.rotation.x=-Math.PI/2; base.position.y=-0.05; scene.add(base);

    this.staticGroup=new THREE.Group(); this.dividerGroup=new THREE.Group(); this.padGroup=new THREE.Group(); this.fxGroup=new THREE.Group();
    scene.add(this.staticGroup,this.dividerGroup,this.padGroup,this.fxGroup);
    this.fx=[];

    // textures
    this.personTex=this.makePerson(); this.glowTex=this.makeGlow(); this.squareTex=this.makeSquare();
    this.iconTex={ meter:this.makeIcon('meter'), steward:this.makeIcon('steward'), widen:this.makeIcon('widen') };

    // crowd
    this.pos=new Float32Array(MAXA*3);
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(this.pos,3)); geo.setDrawRange(0,0);
    const glowGeo=new THREE.BufferGeometry(); glowGeo.setAttribute('position',new THREE.BufferAttribute(this.pos,3)); glowGeo.setDrawRange(0,0);
    this.glowLayer=new THREE.Points(glowGeo,new THREE.PointsMaterial({size:3.6,map:this.glowTex,color:0xffcf72,transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));
    this.points=new THREE.Points(geo,new THREE.PointsMaterial({size:3.0,map:this.personTex,color:0xffe6b0,transparent:true,alphaTest:0.4,depthWrite:false,sizeAttenuation:true}));
    scene.add(this.glowLayer,this.points);

    this.marshal=this.makeMarshal(); scene.add(this.marshal);
    this.padLabelWrap=document.getElementById('padlabels');

    this.buildStatic(level); this.buildDivider(level.pinches[0].x, level.pinches[0].w); this.buildPads(level);
    this.resize();
  }

  /* ---- textures ---- */
  makeGlow(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.4,'rgba(255,225,150,0.6)'); g.addColorStop(1,'rgba(255,200,90,0)'); x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); }
  makePerson(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); x.fillStyle='#fff'; x.beginPath(); x.arc(32,18,10,0,Math.PI*2); x.fill(); x.beginPath(); x.moveTo(19,42); x.quadraticCurveTo(32,30,45,42); x.lineTo(45,57); x.quadraticCurveTo(32,62,19,57); x.closePath(); x.fill(); return new THREE.CanvasTexture(c); }
  makeSquare(){ const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'); x.strokeStyle='#fff'; x.lineWidth=8; x.setLineDash([16,12]); x.lineCap='round';
    const r=18,m=12,s=128-2*m; x.beginPath(); x.moveTo(m+r,m); x.arcTo(m+s,m,m+s,m+s,r); x.arcTo(m+s,m+s,m,m+s,r); x.arcTo(m,m+s,m,m,r); x.arcTo(m,m,m+s,m,r); x.closePath(); x.stroke();
    x.setLineDash([]); x.fillStyle='rgba(255,255,255,0.06)'; x.fill(); return new THREE.CanvasTexture(c); }
  makeIcon(type){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); x.strokeStyle='#fff'; x.fillStyle='#fff'; x.lineWidth=5; x.lineCap='round'; x.lineJoin='round';
    if(type==='meter'){ x.beginPath(); x.moveTo(14,20); x.lineTo(50,20); x.stroke(); for(const px of [18,32,46]){ x.beginPath(); x.moveTo(px,20); x.lineTo(px,46); x.stroke(); } }
    else if(type==='steward'){ x.beginPath(); x.arc(32,20,9,0,Math.PI*2); x.fill(); x.beginPath(); x.moveTo(20,52); x.quadraticCurveTo(32,34,44,52); x.stroke(); }
    else { x.beginPath(); x.moveTo(30,16); x.lineTo(14,32); x.lineTo(30,48); x.stroke(); x.beginPath(); x.moveTo(34,16); x.lineTo(50,32); x.lineTo(34,48); x.stroke(); }
    return new THREE.CanvasTexture(c); }

  makeMarshal(){ const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.3,2.6,12), new THREE.MeshStandardMaterial({color:0x7fe7ff,emissive:0x2a7fa0,emissiveIntensity:0.6,roughness:0.4})); body.position.y=1.6; body.castShadow=true; g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.95,14,12), new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x88e0ff,emissiveIntensity:0.5,roughness:0.3})); head.position.y=3.4; g.add(head);
    const ringTex=this.glowTex; const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,color:0x9fe7ff,blending:THREE.AdditiveBlending,transparent:true,opacity:0.6,depthWrite:false})); halo.scale.set(7,7,1); halo.position.y=2; g.add(halo);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.6,2.1,28), new THREE.MeshBasicMaterial({color:0x9fe7ff,transparent:true,opacity:0.7,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=0.15; g.add(ring);
    g.userData.body=body; return g; }

  buildStatic(level){ const grp=this.staticGroup; while(grp.children.length) grp.remove(grp.children[0]);
    const wallMat=new THREE.MeshStandardMaterial({color:0x17141f,roughness:0.9});
    for(const w of level.walls){ if(Math.abs(w.y-8)<0.5) continue; const m=new THREE.Mesh(new THREE.BoxGeometry(w.w,2.2,w.h),wallMat); m.position.set(w.x,1.0,w.y); grp.add(m); }
    const goal=new THREE.Mesh(new THREE.RingGeometry(2.2,3.0,32), new THREE.MeshBasicMaterial({color:0x8fe0c0,transparent:true,opacity:0.4,side:THREE.DoubleSide})); goal.rotation.x=-Math.PI/2; goal.position.set(level.goal.x,0.12,level.goal.y); grp.add(goal); }
  buildDivider(cx,w){ const grp=this.dividerGroup; while(grp.children.length) grp.remove(grp.children[0]);
    const mat=new THREE.MeshStandardMaterial({color:0x17141f,roughness:0.9});
    const segs=[[-15,cx-w/2],[cx+w/2,15]];
    for(const [a,b] of segs){ if(b<=a) continue; const m=new THREE.Mesh(new THREE.BoxGeometry(b-a,2.2,1.6),mat); m.position.set((a+b)/2,1.0,8); grp.add(m); } }
  setExitVisual(w){ this.buildDivider(this.level.pinches[0].x, w); }

  buildPads(level){ const grp=this.padGroup; while(grp.children.length) grp.remove(grp.children[0]);
    if(this.padEls) this.padEls.forEach(e=>e.remove()); this.padEls=[];
    for(const p of level.pads){ const col=ACCENT[PAD_DEFS[p.type].accent];
      const g=new THREE.Group(); g.position.set(p.x,0,p.y); grp.add(g);
      const sq=new THREE.Mesh(new THREE.PlaneGeometry(6.4,6.4), new THREE.MeshBasicMaterial({map:this.squareTex,color:col,transparent:true,opacity:0.85,depthWrite:false})); sq.rotation.x=-Math.PI/2; sq.position.y=0.08; g.add(sq);
      const icon=new THREE.Sprite(new THREE.SpriteMaterial({map:this.iconTex[p.type],color:col,transparent:true,depthWrite:false})); icon.scale.set(2.6,2.6,1); icon.position.y=3.2; g.add(icon);
      const ring=new THREE.Mesh(new THREE.RingGeometry(2.6,3.0,40,1,Math.PI/2,0.0001), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=0.12; g.add(ring);
      const el=document.createElement('div'); el.className='padlabel'; el.innerHTML=`<span class="pl-name"></span><span class="pl-cost"><span class="pl-coin"></span><span class="pl-num"></span></span><span class="pl-max">MAX</span>`;
      this.padLabelWrap.appendChild(el); this.padEls.push(el);
      p.m={g,sq,icon,ring,structure:null,col,el,elName:el.querySelector('.pl-name'),elCost:el.querySelector('.pl-cost'),elNum:el.querySelector('.pl-num'),elMax:el.querySelector('.pl-max')};
    }
  }
  makeStructure(type,lv,col){ const g=new THREE.Group();
    if(type==='meter'){ const bar=new THREE.Mesh(new THREE.BoxGeometry(7,1.6,0.6), new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.4,roughness:0.4})); bar.position.y=1.4; g.add(bar);
      for(const sx of [-3.2,3.2]){ const post=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,2.4,8), new THREE.MeshStandardMaterial({color:0xbfc4cc,roughness:0.5})); post.position.set(sx,1.2,0); g.add(post); } }
    else if(type==='steward'){ const post=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,3.2+lv*0.5,10), new THREE.MeshStandardMaterial({color:0xcfa64a,roughness:0.5})); post.position.y=(3.2+lv*0.5)/2; post.castShadow=true; g.add(post);
      for(let i=0;i<lv;i++){ const flag=new THREE.Mesh(new THREE.BoxGeometry(2.0,1.1,0.2), new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.5,roughness:0.4})); flag.position.set(1.1,3.0-i*1.2,0); g.add(flag); } }
    else { const sign=new THREE.Mesh(new THREE.BoxGeometry(0.4,2.2,0.4), new THREE.MeshStandardMaterial({color:0xbfc4cc})); sign.position.y=1.1; g.add(sign);
      const arr=new THREE.Mesh(new THREE.ConeGeometry(1.1,1.6,4), new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.5})); arr.rotation.z=-Math.PI/2; arr.position.set(0,2.4,0); g.add(arr); }
    return g; }
  onBuild(pad){ const col=pad.m.col; if(pad.m.structure) pad.m.g.remove(pad.m.structure); pad.m.structure=this.makeStructure(pad.type,pad.level,col); pad.m.g.add(pad.m.structure);
    this.coinBurst(pad.x,pad.y,col); }

  bind(grid,sim,level){ this.grid=grid; this.sim=sim; this.level=level;
    this.tex=new THREE.DataTexture(grid.img,grid.cols,grid.rows,THREE.RGBAFormat); this.tex.magFilter=THREE.LinearFilter; this.tex.minFilter=THREE.LinearFilter; this.tex.needsUpdate=true; this.floor.material.map=this.tex; this.floor.material.needsUpdate=true;
    while(this.fxGroup.children.length) this.fxGroup.remove(this.fxGroup.children[0]); this.fx=[];
    this.buildStatic(level); this.buildDivider(level.pinches[0].x, level.pinches[0].w); this.buildPads(level); }

  /* ---- per-frame sync ---- */
  syncCrowd(){ const s=this.sim,p=this.pos; for(let i=0;i<s.n;i++){ p[i*3]=s.px[i]; p[i*3+1]=1.1; p[i*3+2]=s.py[i]; }
    this.points.geometry.setDrawRange(0,s.n); this.points.geometry.attributes.position.needsUpdate=true;
    this.glowLayer.geometry.setDrawRange(0,s.n); this.glowLayer.geometry.attributes.position.needsUpdate=true; }
  syncHeat(){ this.grid.colorize(); this.tex.needsUpdate=true; }
  syncMarshal(h,t){ this.marshal.position.set(h.x, h.moving?Math.abs(Math.sin(t*10))*0.4:0, h.y); if(h.aim!=null) this.marshal.rotation.y=-h.aim+Math.PI/2; }

  updatePads(game,t){ const W=this.W,H=this.H,v=new THREE.Vector3();
    for(const p of this.level.pads){ const m=p.m; if(!m) continue; const def=PAD_DEFS[p.type], maxed=p.level>=def.max;
      const near=U.dist(game.hero.x,game.hero.y,p.x,p.y)<CONFIG.marshal.padReach;
      m.sq.material.opacity = maxed?0.25:(near?1.0:0.7);
      m.icon.position.y=3.2+Math.sin(t*2.5+p.x)*0.25; m.icon.material.opacity=maxed?0.4:1;
      const cost=maxed?1:def.cost(p.level+1), prog=maxed?0:U.clamp(p.invested/cost,0,1);
      m.ring.geometry.dispose(); m.ring.geometry=new THREE.RingGeometry(2.6,3.0,40,1,Math.PI/2,-prog*TAU); m.ring.material.opacity=prog>0?0.95:0;
      // label
      v.set(p.x,4.6,p.y); v.project(this.camera); if(v.z>1){ m.el.style.display='none'; continue; } m.el.style.display='';
      const sx=(v.x*0.5+0.5)*W, sy=(-v.y*0.5+0.5)*H; m.el.style.transform=`translate(-50%,-50%) translate(${sx}px,${sy}px)`+(near?' scale(1.08)':''); m.el.style.opacity=near?1:0.62;
      m.elName.textContent=def.name+(p.level>0?` Lv${p.level}`:'');
      if(maxed){ m.elCost.style.display='none'; m.elMax.style.display='block'; }
      else { m.elCost.style.display='flex'; m.elMax.style.display='none'; m.elNum.textContent=Math.max(0,Math.ceil(cost-p.invested)); m.elCost.classList.toggle('poor', game.coins<cost-p.invested); }
    }
  }
  hidePads(){ if(this.level&&this.level.pads) for(const p of this.level.pads){ if(p.m) p.m.el.style.display='none'; } }

  coinBurst(x,y,col){ for(let i=0;i<8;i++){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:col||0xffce5e,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})); sp.position.set(x,2,y); sp.scale.set(2,2,1); this.fxGroup.add(sp); this.fx.push({s:sp,vx:U.rand(-6,6),vy:U.rand(6,12),vz:U.rand(-6,6),life:0.5,max:0.5}); } }
  coinPop(x,y){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:0xffce5e,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})); sp.position.set(x,2,y); sp.scale.set(2.4,2.4,1); this.fxGroup.add(sp); this.fx.push({s:sp,vx:0,vy:14,vz:0,life:0.45,max:0.45}); }
  updateFx(dt){ for(let i=this.fx.length-1;i>=0;i--){ const f=this.fx[i]; f.life-=dt; const a=U.clamp(f.life/f.max,0,1); f.s.position.x+=f.vx*dt; f.s.position.y+=f.vy*dt; f.s.position.z+=f.vz*dt; f.s.material.opacity=a; f.s.scale.setScalar(2.4*(0.6+a*0.6)); if(f.life<=0){ this.fxGroup.remove(f.s); this.fx.splice(i,1); } } }

  screenToWorld(sx,sy){ const ndc=new THREE.Vector2((sx/this.W)*2-1,-(sy/this.H)*2+1); const ray=new THREE.Raycaster(); ray.setFromCamera(ndc,this.camera); const t=-ray.ray.origin.y/ray.ray.direction.y; return {x:ray.ray.origin.x+ray.ray.direction.x*t, y:ray.ray.origin.z+ray.ray.direction.z*t}; }
  resize(){ const w=window.innerWidth,h=window.innerHeight; this.W=w; this.H=h; this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  draw(){ this.renderer.render(this.scene,this.camera); }
}
