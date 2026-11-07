import { P,R,E,C,G,T,N,line } from "./environment.mjs";
import { between, pick } from "./vector.mjs";

export const quantize = n => Math.round(n*10)/10;

// A small palette mixer keeps highlights and reflected light in the same material family.
export function mix(a,b,amount) {
  const first = parseInt(a.slice(1),16), second = parseInt(b.slice(1),16);
  const channel = shift => Math.round(((first>>shift)&255)*(1-amount)+((second>>shift)&255)*amount);
  return "#"+((channel(16)<<16)|(channel(8)<<8)|channel(0)).toString(16).padStart(6,"0");
}

// Emit compact surface strokes. Each stroke is clipped by the actual silhouette, including shadows.
export function clipped(id, silhouette, drawing) {
  return `<defs><clipPath id="${id}">${P(silhouette,"#fff")}</clipPath></defs>`+
    G(drawing,`clip-path="url(#${id})"`);
}
export function linear(id, end, stops) {
  const points=stops.map(([offset,color,opacity=1])=>`<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join("");
  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="${end[0]}%" y2="${end[1]}%">${points}</linearGradient>`;
}
export function radial(id, colour, strength=.8, edge=colour) {
  return `<radialGradient id="${id}"><stop stop-color="${colour}" stop-opacity="${strength}"/><stop offset=".47" stop-color="${colour}" stop-opacity="${strength*.42}"/><stop offset="1" stop-color="${edge}" stop-opacity="0"/></radialGradient>`;
}

// Aggregate small marks into a few paths so the extra detail remains inexpensive on phones.
export function strokes(count, draw) {
  let commands="";
  for (let i=0;i<count;i++) commands+=draw(i);
  return commands;
}
export function material(p,id,shape,bounds,kind,opacity=1) {
  const [left,top,width,height]=bounds;
  const random=p.stream("material:"+id);
  const lines=strokes(kind==="timber"?103:145,i=>{
    const x=between(left,left+width,random),y=between(top,top+height,random);
    const length=between(5,kind==="timber"?117:39,random);
    return kind==="timber"?`M${x} ${y}q${length*.36} ${i%3-1} ${length} ${i%5-2}`:
      `M${x} ${y}l${length*.34} ${i%5-3} ${length*.58} ${i%7-4}`;
  });
  const chips=strokes(108,i=>{
    const x=between(left,left+width,random),y=between(top,top+height,random);
    return `M${x} ${y}l${i%4+1} ${i%3-1}m${i%9+3} -${i%5+1}h1`;
  });
  const colour=kind==="timber"?"#d7a778":p.trim;
  return clipped(id,shape,line(lines,colour,1,.22*opacity)+
    line(lines,"#080e18",1,.27*opacity).replace("/>",' transform="translate(0 2)"/>')+
    line(chips,p.time.colour,.95,.22*opacity));
}

// A chamber wall is drawn as real masonry with a few replaced stones and irregular lime seams.
export function ashlar(p,id,shape,bounds,{cell=103,course=46,light=p.mid}={}) {
  const [x,y,w,h]=bounds;
  const random=p.stream("wall:"+id);
  const base=P(shape,mix(light,"#11121b",.47));
  const rows=Math.ceil(h/course)+1, cols=Math.ceil(w/cell)+3;
  const bricks=N(rows,row=>N(cols,col=>{
    const left=x-cell+col*cell-(row%2)*cell*.44+between(-9,7,random);
    const top=y+row*course+between(-3,3,random);
    const span=cell-between(4,11,random), depth=course-between(5,9,random);
    const rock=`M${left+3} ${top}h${span-10}l6 5-1 ${depth-11}-7 4-${span-12} -2-5-7 1-${depth-11}Z`;
    const materialTone=pick([p.deep,p.deep,p.trim,p.time.sky,"#111523"],random);
    const fill=mix(light,materialTone,between(14,31,random)/100);
    return P(rock,fill,"#171926",'stroke-width="1.2"')+
      line(`M${left+9} ${top+depth-1}l${span-19} -3m-${span*.61} -1-12-6-13 3`,p.trim,1.15,.26)+
      line(`M${left+span-8} ${top+10}l-13 5-7 13`,p.deep,1,.38);
  }));
  return base+clipped(id+"Courses",shape,bricks)+material(p,id+"Wear",shape,bounds,"stone",.8);
}

// Flagstones narrow towards the vanishing point. Surface scratches stay within the floor plane.
export function stonePaving(p,horizon=319,vanish=1160,{id="paving",colour=p.mid}={}) {
  const shape=`M0 ${horizon+7}L${vanish} ${horizon-13} 1600 ${horizon-2}V640H0Z`;
  const random=p.stream("floor:"+id);
  const receding=strokes(12,i=>{
    const offset=(i-6)*51;
    return `M${vanish+offset} ${horizon-8}L${vanish+offset*5} 658`;
  });
  const joints=strokes(9,i=>{
    const y=horizon+5+i*i*4.6;
    return `M0 ${y+12}Q${vanish} ${y-12} 1600 ${y}`;
  });
  const stains=N(8,()=>E(between(677,1540,random),between(horizon+23,595,random),
    between(45,141,random),between(8,34,random),"url(#shadow)",'opacity=".34"'));
  return P(shape,"url(#flagstone)")+
    clipped(id+"Tile",shape,line(receding+joints,"#171522",2,.69)+
      line(joints,colour,1.15,.71).replace("/>",' transform="translate(0 3)"/>')+stains)+
    material(p,id+"Scrape",shape,[700,horizon,899,640-horizon],"stone");
}

// Loose clouds carry their own depth. Heavy clouds are more frequent in the weathered settings.
export function sky(p,{kind="open",horizon=290}={}) {
  const random=p.stream("sky:"+kind);
  const night=p.time.name==="Moonlight" || kind==="stellar";
  const disc=between(1080,1466,random), altitude=between(53,121,random);
  const discColor=night?"#f0e5cf":p.time.colour;
  const shade=mix(p.time.sky,"#141c32",kind==="stellar"?.66:.29);
  const cloudColor=mix(p.time.colour,p.time.sky,night?.73:.46);
  const defs=`<defs>${linear("skyPaint",[14,100],[[0,mix(shade,"#080e20",.56)],[.37,shade],[.72,p.time.sky],[1,p.time.colour]])}
    ${radial("discHalo",discColor,night?.45:.76,p.time.sky)}</defs>`;
  const stars=night?P(strokes(kind==="stellar"?115:66,()=>{
    const x=between(646,1600,random), y=between(2,horizon-34,random);
    const r=between(5,13,random)/10;
    return `M${x} ${y-r}l${r} ${r}-${r} ${r}-${r}-${r}Z`;
  }),"#f1e8d3","none",'opacity=".58"'):"";
  const moon=night?clipped("moonFace",`M${disc-25} ${altitude}a25 25 0 1 1 50 0a25 25 0 1 1 -50 0Z`,
    N(17,i=>E(disc+between(-26,24,random),altitude+between(-23,24,random),between(2,11,random),between(2,8,random),
      i%3===0?"#a7a3af":"#c6b9a5",'opacity=".3"'))):"";
  const clouds=N(kind==="storm"?15:9,i=>{
    const x=between(470,1540,random),y=between(37,horizon-32,random),w=between(93,269,random);
    const h=between(12,kind==="storm"?51:28,random);
    const cloud=`M${x-w*.55} ${y}q${w*.17} -${h*.28} ${w*.26} -${h*.12}q${w*.18} -${h*.6} ${w*.33} -${h*.41}q${w*.14} -${h*.41} ${w*.26} ${h*.21}q${w*.23} -${h*.15} ${w*.36} ${h*.31}q-${w*.61} ${h*.64} -${w*1.21} ${h*.01}Z`;
    return P(cloud,i%3?cloudColor:shade,"none",`opacity="${kind==="storm"?.23:.16}"`)+
      line(`M${x-w*.35} ${y+3}q${w*.48} ${h*.39} ${w*.93} -4`,p.time.colour,1.4,.18);
  });
  return defs+R(0,0,1600,640,"url(#skyPaint)")+stars+
    E(disc,altitude,night?113:233,night?109:174,"url(#discHalo)")+
    C(disc,altitude,night?25:33,discColor,`opacity="${night?.86:.67}"`)+moon+clouds;
}

// Fractured ridges use smaller contour steps towards the horizon. Down-slope flecks are clipped to rock.
export function ridges(p,{profile="crag",horizon=266,count=4}={}) {
  const random=p.stream("hills:"+profile);
  const mineral=profile==="dunes"?"#ae775d":profile==="snow"?"#c7cbd1":p.trim;
  let result="";
  for(let layer=0;layer<count;layer++){
    const y=horizon+layer*43;
    const size=(profile==="dunes"?38:97)+layer*16;
    const cols=profile==="dunes"?19:40;
    const phase=between(10,70,random);
    const points=Array.from({length:cols},(_,i)=>{
      const x=Math.round(i*1760/(cols-1))-80;
      const wave=profile==="dunes" ? .41+Math.sin(i*.72+phase)*.33 : .46+Math.sin(i*.34+phase)*.22+Math.cos(i*.59+phase)*.19;
      return [x,Math.round(y-size*wave-between(0,profile==="dunes"?16:40,random))];
    });
    const ridge=`M${points.map(pair=>pair.join(" ")).join("L")}L1680 640H-80Z`;
    const rock=mix(p.time.sky,profile==="dunes"?"#624156":p.deep,.29+layer*.17);
    const ridgelines=N(points.length-2,i=>{
      const [x,high]=points[i+1];
      if (points[i][1]<high || points[i+2][1]<high) return "";
      const fall=between(35,91,random), drift=between(21,51,random);
      const fault=`M${x} ${high}l${drift*.21} ${fall*.34} ${drift*.32} ${fall*.14} ${drift*.38} ${fall*.52} -${drift*.8+41} ${fall*.38} 6-${fall*.77}Z`;
      return P(fault,mineral,"none",`opacity="${profile==="snow"?.35:profile==="dunes"?.22:.16}"`)+
        line(`M${x} ${high}l${drift*.21} ${fall*.34} ${drift*.32} ${fall*.14} ${drift*.38} ${fall*.52}`,mineral,1.5,.36);
    });
    const strata=strokes(127,i=>{
      const x=between(494,1640,random), yy=between(y-size,y+116,random);
      const dx=between(7,42,random),dy=profile==="dunes"?between(-5,5,random):between(3,20,random);
      return `M${x} ${yy}l${dx} ${dy} ${i%11} ${i%6-2}`;
    });
    result+=P(ridge,rock)+clipped("ridge"+layer,ridge,ridgelines+line(strata,mineral,1.25,.21)+
      line(strata,"#1b202f",1.1,.24).replace("/>",' transform="translate(-2 3)"/>'));
    if(layer<count-1) result+=E(1226,y+34,746,47,"url(#air)",'opacity=".52"');
  }
  return result;
}

// Ripples get longer in the near water. A reflection stays below the visible sky or lamp.
export function reflectedWater(p,id,shape,level,depth=310,{lit=p.wash,colour=p.time.colour}={}) {
  const random=p.stream("water:"+id);
  const lines=strokes(255,i=>{
    const yy=level+Math.round(random()**1.6*depth), x=between(656,1620,random);
    const reach=between(7,39,random)+Math.round((yy-level)*.17);
    const curve=between(1,5,random);
    return `M${x} ${yy}q${reach*.43} -${curve} ${reach} ${i%3-1}`;
  });
  const shimmer=strokes(72,()=>{
    const distance=between(3,depth,random), xx=lit+between(-1,1,random)*distance*.31+between(-65,65,random);
    return `M${xx} ${level+distance}h${between(3,37,random)}`;
  });
  return P(shape,"url(#water)")+
    clipped(id,shape,E(lit,level+48,218,126,"url(#sun)",'opacity=".64"')+
      line(lines,colour,1.4,.26)+line(lines,"#18242c",1.1,.44).replace("/>",' transform="translate(0 3)"/>')+
      line(shimmer,colour,1.45,.41));
}

// Branches are tapered curves. Foliage marks are placed along twigs so each crown grows as a tree.
export function woodlandTree(p,id,x,y,scale,{kind="oak",tone=p.deep,lit=p.trim,leaf="#5b725f",bend=0}={}) {
  const random=p.stream("crown:"+id);
  const trunk=`M-38 13Q-17-23-16-76Q-19-135 ${bend-14} -191Q${bend-4} -228 ${bend-16} -294L${bend+3} -306Q${bend+27} -235 ${bend+8} -189Q10-114 19-69Q23-20 43 12L19 14 3-5-16 16Z`;
  const root=P(trunk,"url(#bark)",tone,'stroke-width="2.4"')+
    line(`M-19 3Q-2-66-6-119Q${bend-11} -178 ${bend+4} -242m-7 31q-23 26-17 65M19-7Q6-66 3-97`,lit,2,.56);
  const bark=strokes(67,i=>{
    const y=between(-270,-12,random),x=between(-14,13,random)+bend*Math.max(0,(-y-50)/280);
    return `M${x} ${y}q${i%5-2} -${between(3,13,random)} ${i%7-3} -${between(10,25,random)}`;
  });
  if(kind==="pine") {
    const tiers=N(9,i=>{
      const y=-284+i*25,r=15+i*12+between(-9,15,random);
      const tier=`M${bend-2} ${y-46}q-${r*.31} 49-${r} 63l${r*.35} -4-${r*.27} 15q${r*.45} -3 ${r*.88} -12q${r*.68} 15 ${r*1.01} 14l-${r*.26} -16 ${r*.35} 4q-${r*.73} -15-${r*1.07} -64Z`;
      const needle=strokes(39,j=>{
        const xx=bend+between(-r*.8,r*.8,random),yy=y+between(2,27,random)-Math.abs(xx-bend)*.12;
        return `M${xx} ${yy}l${xx<bend?-6:6} ${j%5+2}`;
      });
      return P(tier,mix(tone,leaf,.23+(i%3)*.1),"none",'opacity=".94"')+
        line(needle,lit,1.05,.43);
    });
    return T(x,y,G(root+tiers,`transform="scale(${scale})"`));
  }
  const boughs=N(11,i=>{
    const side=i%2?1:-1, from=-86-i*15, spread=between(39,147,random)*(1-i*.049);
    const tx=side*spread+bend*.5, ty=from-between(36,78,random), elbow=tx*.59;
    const curve=`M${bend*.27} ${from}Q${elbow} ${from-24} ${tx} ${ty}`;
    const twigs=strokes(13,j=>{
      const x=tx+(j%5-2)*12, y=ty+between(-35,13,random);
      return `M${elbow+j*.54} ${from-27-j*1.1}Q${x*.84} ${y+10} ${x} ${y}`;
    });
    const pigment=strokes(33,j=>{
      const xx=tx+between(-42,43,random), yy=ty+between(-37,21,random);
      const w=between(3,13,random),h=between(2,6,random);
      return `M${xx} ${yy}q${w*.48} -${h} ${w} -${h*.45}q-${w*.32} ${h*1.8}-${w} ${h*.45}Z`;
    });
    return line(curve,tone,Math.max(3,14-i),.98)+line(curve,lit,Math.max(1,4-i*.22),.46)+
      line(twigs,tone,1.8,.88)+P(pigment,mix(tone,leaf,.42+(i%3)*.12),"none",'opacity=".91"')+
      P(pigment,lit,"none",'opacity=".19" transform="translate(-3 -4)"');
  });
  return T(x,y,G(boughs+root+clipped("bark"+id,trunk,line(bark,lit,1.4,.38)),`transform="scale(${scale})"`));
}

// Moss and stalks are local ground cover. Their scale grows towards the foreground.
export function undergrowth(p,id,x,y,w,{shade="#596953",wet=false}={}) {
  const random=p.stream("ground:"+id);
  const bed=E(x+w*.48,y+19,w*.62,47,"url(#shadow)",'opacity=".7"');
  const clumps=Array.from({length:15},()=>[x+between(5,w,random),y+between(-4,26,random)]);
  const leaves=strokes(185,i=>{
    const [rootX,rootY]=clumps[i%clumps.length];
    const px=rootX+between(-13,14,random), py=rootY+between(-4,4,random);
    const length=between(5,24,random)*(py>y?1.15:.67), lean=(i%9-4)*length*.11;
    return `M${px} ${py}Q${quantize(px+lean*.4)} ${quantize(py-length*.65)} ${quantize(px+lean)} ${quantize(py-length)}Q${quantize(px+lean*.8)} ${quantize(py-length*.39)} ${px+2} ${py+2}Z`;
  });
  return bed+P(leaves,shade,"none",'opacity=".72"')+
    P(leaves,mix(shade,p.time.colour,.34),"none",'opacity=".23" transform="translate(-3 3)"')+
    (wet?N(14,()=>E(x+between(0,w,random),y+between(-8,19,random),between(6,22,random),2,"url(#water)",'opacity=".74"')):"");
}
