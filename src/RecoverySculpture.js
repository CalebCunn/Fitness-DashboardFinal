import {useEffect,useRef} from 'react';

// A small, dependency-free 3D renderer. The visible indigo arc represents recovery.
export default function RecoverySculpture({score=null}) {
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas.getContext('2d');
    if(!ctx)return;
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame=0,tiltX=.48,tiltY=-.18,targetX=.48,targetY=-.18,disposed=false;
    const draw=()=>{
      if(disposed)return;
      tiltX+=(targetX-tiltX)*.12;tiltY+=(targetY-tiltY)*.12;
      const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const scale=Math.min(w,h)*.34;
      const shadow=ctx.createRadialGradient(w*.51,h*.84,0,w*.51,h*.84,w*.33);
      shadow.addColorStop(0,'rgba(55,37,125,.22)');shadow.addColorStop(1,'rgba(55,37,125,0)');
      ctx.save();ctx.translate(0,h*.64);ctx.scale(1,.24);ctx.fillStyle=shadow;ctx.fillRect(0,0,w,h*2);ctx.restore();
      const rot=([x,y,z])=>{const yy=y*Math.cos(tiltX)-z*Math.sin(tiltX),zz=y*Math.sin(tiltX)+z*Math.cos(tiltX);return[x*Math.cos(tiltY)+zz*Math.sin(tiltY),yy,-x*Math.sin(tiltY)+zz*Math.cos(tiltY)];};
      const project=([x,y,z])=>{const p=4.8/(4.8-z);return[w/2+x*scale*p,h*.47+y*scale*p,z];};
      const N=160,M=48,vertices=[],normals=[];
      for(let i=0;i<=N;i++){vertices[i]=[];normals[i]=[];const a=i/N*Math.PI*2-Math.PI/2;for(let j=0;j<=M;j++){const b=j/M*Math.PI*2;vertices[i][j]=project(rot([(1+.23*Math.cos(b))*Math.cos(a),(1+.23*Math.cos(b))*Math.sin(a),.23*Math.sin(b)]));normals[i][j]=rot([Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)]);}}
      const faces=[];
      for(let i=0;i<N;i++)for(let j=0;j<M;j++){const pts=[vertices[i][j],vertices[i+1][j],vertices[i+1][j+1],vertices[i][j+1]],n=normals[i][j];const lit=Math.max(0,-n[0]*.35-n[1]*.55+n[2]*.76);const spec=Math.pow(Math.max(0,-n[0]*.15-n[1]*.35+n[2]*.91),28);const active=score!==null&&i/N<Math.max(0,Math.min(100,score))/100;const base=active?[90,70,195]:[217,211,238];const color=base.map(c=>Math.round(Math.min(255,c*(.53+.48*lit)+spec*95)));faces.push({pts,z:pts.reduce((s,p)=>s+p[2],0)/4,color:`rgb(${color.join(',')})`});}
      faces.sort((a,b)=>a.z-b.z).forEach(({pts,color})=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=.6;ctx.fill();ctx.stroke();});
      if(Math.abs(tiltX-targetX)+Math.abs(tiltY-targetY)>.001)frame=requestAnimationFrame(draw);
    };
    const move=e=>{if(reduce)return;const b=canvas.getBoundingClientRect();targetY=-.18+(e.clientX-b.left-b.width/2)/b.width*.55;targetX=.48+(e.clientY-b.top-b.height/2)/b.height*.35;cancelAnimationFrame(frame);draw();};
    const leave=()=>{targetX=.48;targetY=-.18;cancelAnimationFrame(frame);draw();};
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);draw();});observer.observe(canvas);
    canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);draw();
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);};
  },[score]);
  return <canvas className="recovery-sculpture" ref={ref} aria-hidden="true"/>;
}
