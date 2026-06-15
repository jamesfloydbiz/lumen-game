/* ============================================================
   LUMEN — util.js
   Math, color, easing, RNG, lightweight audio. No dependencies.
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;

const U = {
  clamp:(v,a,b)=> v<a?a:(v>b?b:v),
  lerp:(a,b,t)=> a+(b-a)*t,
  dist2:(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;},
  dist:(ax,ay,bx,by)=> Math.hypot(ax-bx,ay-by),
  ang:(ax,ay,bx,by)=> Math.atan2(by-ay,bx-ax),
  rand:(a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a),
  randInt:(a,b)=> Math.floor(a+Math.random()*(b-a+1)),
  chance:(p)=> Math.random()<p,
  choice:(arr)=> arr[(Math.random()*arr.length)|0],
  // easings
  easeOutCubic:(t)=> 1-Math.pow(1-t,3),
  easeOutBack:(t)=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);},
  easeInOut:(t)=> t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2,
  // approach a target value at a rate (per second), framerate independent
  approach:(cur,target,rate,dt)=>{
    const d=target-cur, step=rate*dt;
    if(Math.abs(d)<=step) return target;
    return cur+Math.sign(d)*step;
  },
  // format big numbers: 1234 -> 1.2K
  fmt:(n)=>{
    n=Math.floor(n);
    if(n<1000) return ''+n;
    if(n<1e6) return (n/1000).toFixed(n<1e4?1:0).replace(/\.0$/,'')+'K';
    return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
  }
};

/* ---------- Color helpers (hsl strings, cheap) ---------- */
function hsla(h,s,l,a){ return `hsla(${h},${s}%,${l}%,${a})`; }

/* ---------- Tiny WebAudio FX ---------- */
const SFX = (()=>{
  let ctx=null, master=null, muted=false, last={};
  function ensure(){
    if(ctx) return;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }catch(e){ ctx=null; }
  }
  // throttle identical sounds so a swarm doesn't blow the mix
  function throttled(name, ms){
    const t = performance.now();
    if(last[name] && t-last[name] < ms) return false;
    last[name]=t; return true;
  }
  function tone(freq, dur, type, vol, slideTo){
    if(muted||!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type||'sine';
    o.frequency.setValueAtTime(freq, t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo), t+dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t+dur+0.02);
  }
  return {
    resume(){ ensure(); if(ctx && ctx.state==='suspended') ctx.resume(); },
    setMuted(m){ muted=m; },
    isMuted(){ return muted; },
    shoot(){ if(throttled('shoot',55)) tone(660,0.07,'triangle',0.05,420); },
    turret(){ if(throttled('turret',60)) tone(880,0.06,'square',0.035,560); },
    hit(){ if(throttled('hit',24)) tone(200,0.05,'square',0.04,120); },
    pickup(){ if(throttled('pick',30)) tone(1180,0.06,'sine',0.05,1500); },
    kill(){ if(throttled('kill',28)) tone(320,0.12,'triangle',0.06,140); },
    build(){ tone(523,0.10,'sine',0.09,784); setTimeout(()=>tone(784,0.16,'sine',0.09,1046),90); },
    unlock(){ tone(660,0.1,'sine',0.08,990); setTimeout(()=>tone(990,0.2,'sine',0.08,1320),100); },
    wave(){ tone(440,0.18,'sine',0.07,330); },
    boss(){ tone(110,0.5,'sawtooth',0.10,70); setTimeout(()=>tone(90,0.6,'sawtooth',0.09,55),120); },
    hurt(){ tone(150,0.18,'sawtooth',0.09,70); },
    lose(){ tone(220,0.6,'sawtooth',0.12,70); setTimeout(()=>tone(160,0.8,'sawtooth',0.1,50),180); },
    win(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,0.32,'sine',0.1,f*1.5),i*150)); }
  };
})();
