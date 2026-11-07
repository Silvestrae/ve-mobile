import { P,R,E,C,G,T,N,line,placed,archD } from "./environment.mjs";
import { between, pick } from "./vector.mjs";

const woodEdge="#ad795e", brassEdge="#dec08e", ironEdge="#9aa6b5", shade="#1c1723";

// A lit bookcase has a framed back, shelf lips and individually bound volumes.
export function cabinet(p,x,y,w=188,h=290,style="books") {
  const random=p.stream("case"+style+x);
  const body=`M${-w/2} 1V${-h+29}Q0 ${-h-28} ${w/2} ${-h+29}V1Z`;
  return T(x,y,P(body,"url(#oak)",shade,'stroke-width="6"')+
    P(`M${-w*.43} -9V${-h+35}Q0 ${-h-12} ${w*.43} ${-h+35}V-9Z`,"#1d1720",woodEdge,'stroke-width="2"')+
    N(4,row=>{
      const y=-(3-row)*(h-37)/4-14;
      let spine=-w*.41;
      return N(Math.floor(w/15),i=>{
        const ww=between(8,15,random), hh=between(22,48,random);
        const item=style==="bottles"&&i%2===0
          ? placed(spine+4,y-1,.24,bottle(p,i%3===0?"round":"stoppered",p.bright))
          : R(spine,y-hh,ww,hh,pick(["#654345","#735445","#3d4a58","#4d5560","#46423a","#684e6e"],random),`stroke="#201921" rx="2"`)+
            line(`M${spine+2} ${y-hh+3}v${hh-5}m1-${hh-11}h${ww-5}m-${ww-5} 5h${ww-5}`,brassEdge,1,.55)+
            R(spine+3,y-hh+13,Math.max(3,ww-5),6,brassEdge,'opacity=".42"');
        spine+=ww+3;
        return spine>w*.52 ? "" : item;
      })+R(-w*.46,y,w*.92,8,"url(#wood)",`stroke="${shade}" stroke-width="2"`)+line(`M${-w*.44} ${y+1}h${w*.88}`,woodEdge,1,.75);
    })+line(body,woodEdge,2,.75));
}

// Loose pages have curled corners, multiple leaves, and meaningful marks on the top sheet.
export function sheet(p,w=113,h=81,kind="notes") {
  const shape=`M${-w*.5} ${-h*.42}Q0 ${-h*.53} ${w*.49} ${-h*.5}L${w*.46} ${h*.23}l-15 13Q${-w*.1} ${h*.35} ${-w*.48} ${h*.43}Z`;
  return P(shape,"#211721","none",'transform="translate(3 7)" opacity=".65"')+
    P(shape,"url(#paper)","#8c5e55",'stroke-width="2"')+
    line(`M${-w*.44} ${-h*.36}l${w*.83} -4 -3 ${h*.51}-${w*.80} 6Z`,"#75544c",1,.64)+
    (kind==="notes" ? N(6,i=>line(`M${-w*.36} ${-h*.24+i*h*.085}q${w*.23} -6 ${w*(.47+i%3*.075)} -1`,"#64424b",1,.7)) :
      line(`M${-w*.34} ${h*.25}l${w*.18} -${h*.36} ${w*.19} ${h*.19} ${w*.21} -${h*.29} ${w*.14} ${h*.41}M${-w*.14} ${-h*.29}v${h*.49}m${w*.38} -${h*.54}v${h*.49}`,"#714950",1.7,.73));
}

// Light sources stay attached to a base or hook and cast a local warm pool.
export function candle(p,x,y,scale=1) {
  return placed(x,y,scale,E(0,-37,92,85,"url(#ember)")+
    E(0,8,20,5,"#211622",`stroke="${brassEdge}"`)+
    P("M-9 5l1-35q8-7 16 0l2 35q-8 6-19 0Z","#bd8f64","#efc595")+
    line("M-4-30v22m7-20v12","#f7ddab",2,.72)+line("M0-32v-8","#332127",2)+
    P("M-1-37Q-10-43 1-53Q7-63 4-69Q22-51 7-39Z","#ffa256")+P("M0-39Q-5-44 4-56Q9-44 3-39Z","#fff4c4"),0);
}
export function lantern(p,x,y,scale=1,hanging=false) {
  return placed(x,y,scale,E(0,-36,106,96,"url(#ember)")+
    (hanging?line("M0-80V-390",ironEdge,2,.62):E(0,6,28,7,"url(#shadow)"))+
    P("M-24-52L-13-67H13L24-52 19-3H-19Z","url(#brass)",shade,'stroke-width="3"')+
    P("M-17-49H17L13-11H-13Z","#efb16f",brassEdge,'stroke-width="1.8"')+
    P("M-13-40L13-49 7-13H-12Z","#ffe3a0","none",'opacity=".8"')+
    line("M-25-51H25M-18-24H18M0-49v38M-20-5h40M-8-67q-7-15 8-19 13 5 8 19",brassEdge,2,.81)+
    P("M-3-14q-7-12 2-23 8 11 4 23Z","#fff6b9"),0);
}

// Glass contours, translucent contents and specular marks follow the shape of each vessel.
export function bottle(p,style,liquid) {
  const shape=style==="round"?"M-12-80H12V-56Q13-50 28-38Q41-25 34-7Q29 7 0 8Q-31 8-36-12Q-41-31-22-44Q-13-51-12-56Z":
    style==="retort"?"M-22-76Q-11-98 17-91Q35-87 40-61Q50-51 82-51v12Q42-39 27-56Q34-43 37-29Q41-5 18 4H-17Q-42-3-39-27Q-38-43-22-55Z":
    "M-13-80H13V-51L28-33 31-4Q26 10 0 9Q-27 10-31-4L-27-33-13-51Z";
  return P(shape,"url(#glass)",ironEdge,'stroke-width="2"')+
    (style==="retort"?P("M-33-20Q-8-12 31-24Q35-5 15 2h-31q-15-5-17-22Z",liquid,"none",'opacity=".71"'):
      P("M-27-23Q-10-34 13-25Q23-21 27-26L30-4Q20 7 0 6Q-23 7-29-6Z",liquid,"none",'opacity=".69"'))+
    line(style==="retort"?"M-30-36q9-15 15-16m4-22q11-12 23-7M9-18q-3 7 3 8":"M-20-39Q-27-32-26-18M-20-11q6 8 13 8M-9-69v16m25 25 5 9", "#eef6ed",2,.69)+
    (style==="retort"?line("M77-52v13",brassEdge,3,.9):P("M-15-84H15v10H-15Z","url(#brass)",brassEdge,'stroke-width="1.4"'));
}

// Brass and silver edges sit above the upholstered frame and carved side bevel.
export function shield(p,kind,colour=p.bright) {
  const shape=kind==="round"?"M-65 0a65 65 0 1 1 130 0 65 65 0 1 1-130 0Z":kind==="tower"?"M-58-69H58V55L0 80-58 55Z":
    "M-63-62Q0-78 63-62V2Q53 50 0 77Q-54 50-63 2Z";
  return P(shape,shade,"none",'transform="translate(5 6)"')+P(shape,"url(#steel)",ironEdge,'stroke-width="3"')+
    G(P(shape,"url(#leather)",brassEdge,'stroke-width="2.5"'),'transform="scale(.85)"')+
    G(P(shape,"none",colour,'stroke-width="1" opacity=".56"'),'transform="scale(.72)"')+
    (kind==="round"?C(0,0,17,"url(#brass)",`stroke="${brassEdge}" stroke-width="2"`):
      P("M0-45L9-12 41 0 9 9 0 45-10 10-41 0-10-11Z","url(#brass)",colour,'stroke-width="1.4"'))+
    N(8,i=>C(Math.round(Math.cos(i*Math.PI/4)*48),Math.round(Math.sin(i*Math.PI/4)*48),2.3,brassEdge,'opacity=".82"'));
}

// Place instruments and weapons by their grip. Finish the blade, fuller and hilt separately.
export function sword(p,kind="long",colour=ironEdge) {
  const length=kind==="short"?99:147;
  return P(`M-8-13L-9 ${-length+24} 1 ${-length} 11 ${-length+26} 8-13Z`,"url(#steel)",colour,'stroke-width="1.4"')+
    line(`M1 ${-length+15}L1-15m-5-${length-33} 1 ${length-36}`,"#eff1f2",1.6,.64)+
    P("M-29-12Q-13-7 0-13Q18-7 28-16L26-3Q13 6 0 2Q-14 6-27-1Z","url(#brass)",brassEdge,'stroke-width="1.2"')+
    P("M-5 4H5L6 37-5 37Z","url(#leather)",shade)+
    N(7,i=>line(`M-5 ${7+i*4}l10 3`,brassEdge,1,.48))+
    E(0,40,8,6,"url(#brass)",`stroke="${brassEdge}"`);
}

export function pole(p,kind) {
  const head=kind==="axe"?"M0-154Q45-179 54-203L83-186 81-147Q40-124 0-130Z":"M-16-150L0-217 19-152 2-132Z";
  return P("M-5 69L-4-161H6L7 66Z","url(#oak)",woodEdge,'stroke-width="1.4"')+
    P(head,"url(#steel)",ironEdge,'stroke-width="2"')+
    line(kind==="axe"?"M56-193l20 10-3 31q-25 17-49 20":"M0-201L2-145", "#eef1ee",1.7,.78)+
    N(7,i=>line(`M-4 ${20+i*4}l10 3`,brassEdge,1,.51));
}

// Hang a heraldic cloth on a bar. Stitching and irregular folds remain subordinate to its symbol.
export function banner(p,x,y,w=95,h=157,emblem="sun") {
  return T(x,y,line(`M${-w*.56} 2h${w*1.12}`,brassEdge,4,.86)+
    C(-w*.56,2,5,"url(#brass)")+C(w*.56,2,5,"url(#brass)")+
    P(`M${-w/2} 4Q0 14 ${w/2} 4L${w*.46} ${h-15} 0 ${h+3} ${-w*.46} ${h-15}Z`,"url(#fabric)",p.trim,'stroke-width="2"')+
    N(7,i=>line(`M${-w*.42+i*w*.14} 12q${i%2?8:-9} ${h*.46} ${i%2?3:-4} ${h*.83}`,p.time.colour,1,.26))+
    T(0,h*.51,crest(p,emblem,.51)));
}
export function crest(p,kind,scale=1) {
  const shapes={
    sun:"M0-45L9-23 33-32 25-10 48 0 24 10 33 32 9 23 0 45-9 23-33 32-25 10-48 0-24-10-33-32-9-23Z",
    wing:"M-57-19Q-28-15-16 0L0-20 17 0Q33-17 57-19L47 9 19 23 0 37-19 23-47 9Z",
    crown:"M-52-24L-27-11-18-36 0-13 20-36 28-10 53-25 45 19-44 19Z",
    tower:"M-32 29V-29H-20v-15h14v15H6v-15h14v15h12v58ZM-10 29V1H10v28Z",
    hand:"M-23 36L-34 8-39-7-30-14-17-3-21-33-12-39-4-12-4-43 7-45 10-13 16-37 27-34 25-7 33-21 43-15 38 13 24 39Z",
  };
  return G(P(shapes[kind],"url(#brass)",brassEdge,'stroke-width="1.8" fill-rule="evenodd"')+
    (kind==="sun"?C(0,0,13,"url(#brass)",`stroke="${brassEdge}"`):line("M-20 9L0 19 20 9",p.time.colour,1.6,.51)),
    `transform="scale(${scale})"`);
}

// Form glass panes inside the lead ribs. Each variant is an entire architectural window.
export function stainedWindow(p,x,y,kind) {
  const outer=kind===1?"M-94-6a94 92 0 1 1 188 0 94 92 0 1 1-188 0Z":archD(kind===2?230:194,224)+"Z";
  const panes = kind===1 ? N(12,i=>G(P("M0-8Q-25-46 0-84Q28-48 0-8Z",i%3===0?"#ac7590":i%2?"#c89970":"#536d8f","#353141",'stroke-width="3"'),`transform="rotate(${i*30})"`)):
    kind===2?N(3,i=>T(-67+i*67,-6,P(archD(49,i===1?193:148)+"Z",i===1?"#c49b64":"#6c8db4","#272635",'stroke-width="3"')+
      line("M0-142V-4m-20-53 40-1",brassEdge,2,.78))):
      T(0,-104,N(12,i=>G(P("M0 2L-16-38 0-69 17-37Z",i%3===0?"#ad726e":i%2?"#7693ac":"#deb378","#363241",'stroke-width="2.3"'),`transform="rotate(${i*30})"`)));
  const centerY=kind===1?0:-103;
  return T(x,y,E(0,centerY,182,171,"url(#sun)")+
    P(outer,"url(#recess)",shade,'stroke-width="18"')+
    P(outer,"url(#glass)",brassEdge,'stroke-width="5"')+panes+
    (kind===2?"":C(0,centerY,19,"url(#brass)",`stroke="${brassEdge}" stroke-width="2"`))+
    (kind!==0?"":N(7,i=>T(-66+i*22,-34,P("M0-23L10-2 0 19-10-2Z",i%2?"#af887d":"#667c9d","#514051",'stroke-width="1.8" opacity=".83"')))+
      line("M0-211v28M-80-72V-14m160-58v58M-86-11H86",brassEdge,1.9,.69))+
    P(outer,"none",p.trim,'stroke-width="2"'));
}

// Trails of light are tied to an emitter. An outer bloom sits behind the sharp inner stroke.
export function luminous(d,colour,width=3,opacity=1) {
  return line(d,colour,width*3,.45*opacity).replace("/>",' filter="url(#mist)"/>')+
    line(d,colour,width,opacity)+line(d,"#fff1df",Math.max(1,width*.29),opacity*.83);
}

export function sparks(p,x,y,count=24,colour="#ffd491") {
  const random=p.stream("sparks"+x+y);
  return N(count,()=>{
    const dx=between(-94,122,random), dy=between(-166,15,random);
    return C(x+dx,y+dy,between(4,18,random)/10,colour,`opacity="${between(19,85,random)/100}"`);
  });
}

// Structural ironwork remains legible when controls overlap the artwork.
export function chain(x,y,length,angle=0,scale=1) {
  return placed(x,y,scale,N(length,i=>E(i%2?1:0,i*10,i%2?3.2:5.4,7,"none",'stroke="#a2999f" stroke-width="2.5" opacity=".76"')),angle);
}

// A furnace lights the arch from below, with a distinct coal bed and tongue of flame.
export function forge(p,x,y,w=213,h=269) {
  return T(x,y,P(archD(w+80,h+56)+"Z","url(#stone)",shade,'stroke-width="6"')+
    P(archD(w,h)+"Z","#2d1b29","#6d4748",'stroke-width="13"')+
    P(archD(w+30,h+21),"none","#a9735e",'stroke-width="3" opacity=".62"')+
    E(0,-57,w*.85,h*.72,"url(#ember)")+
    P(`M${-w*.47} -4Q-78-38-32-64Q-9-92-27-126Q22-114 20-73Q44-90 54-143Q91-93 66-55Q96-47 ${w*.48} -3Z`,"#be6750","#f29361",'stroke-width="2.2" opacity=".9"')+
    P("M-58-4Q-84-32-40-46Q-19-53-4-83Q16-61 3-38Q36-47 46-85Q81-50 64-8Z","#f2a068","#ffc380",'opacity=".87"')+
    P("M-42-2Q-26-31-11-29Q9-24 31-56Q42-36 43-2Z","#ffd097")+
    P(`M${-w*.58} -8H${w*.58}l25 24H${-w*.65}Z`,"url(#stone)",woodEdge,'stroke-width="2"')+
    N(12,i=>line(`M${-w/2+i*w/11} -3l-8 15`,p.trim,1,.52)));
}

export function anvil(p,x,y,scale=1) {
  return placed(x,y,scale,E(0,28,115,21,"url(#shadow)")+
    P("M-54 12H43l14 12H-63Zm26-17H21L39 15H-45Z","url(#steel)",shade,'stroke-width="3"')+
    P("M-106-51L-68-61 82-64 97-54 68-36 28-31 18-3H-28L-34-31-64-37Z","url(#steel)",shade,'stroke-width="3"')+
    P("M-106-51L-68-61 82-64 97-54 62-48-57-44Z","#a3a3ad",ironEdge,'stroke-width="1.8"')+
    line("M-64-42L65-47 87-56M-45-39q19 24 42 24m38-23-10 17M-48 19H46",ironEdge,2,.67));
}

// A bowl and cast reflection form one object, including the lip and shadow under its feet.
export function basin(p,x,y,scale=1) {
  return placed(x,y,scale,E(0,40,133,26,"url(#shadow)")+
    P("M-79-23H79Q63 15 33 19L24 35H-24L-31 19Q-68 12-79-23Z","url(#stone)",p.trim,'stroke-width="2"')+
    E(0,-22,79,25,"url(#steel)",`stroke="${p.trim}" stroke-width="3"`)+
    E(0,-22,65,17,"url(#water)",`stroke="${p.bright}" stroke-width="1.4"`)+
    N(5,i=>E(3,-22,14+i*10,3+i*2,"none",`stroke="${p.bright}" opacity="${.49-i*.065}"`))+
    line("M-56 0q59 19 112 1m-73 27h35",p.trim,1.5,.75));
}

export function cavernRock(p,x,y,scale,angle=0) {
  return placed(x,y,scale,P("M-95 9L-78-39-27-57 22-96 64-81 103-14 80 18Z","url(#stone)","#21202b",'stroke-width="3"')+
    P("M-78-39L-24-39 22-96 21-31-7 4-95 9Z",p.mid,"none",'opacity=".76"')+
    line("M-78-39L-27-57 22-96 64-81m-54 9-9 24-22 15-13 26M32-71l19 8 25 37-8 19",p.trim,1.8,.6),angle);
}

export function foldedBooks(p,x,y,scale=1) {
  return placed(x,y,scale,N(4,i=>{
    const yy=12-i*15, shift=[0,-7,8,1][i], w=130-i*13;
    return T(shift,yy,P(`M${-w*.5} 0l${w*.72} -11 ${w*.31} 6-4 15-18 10-${w*.86} 1Z`,["#65454f","#585467","#795443","#434e64"][i],"#dec08e",'stroke-width="1.4"')+
      P(`M${-w*.4} 6L${w*.49} -1l-3 9-${w*.82} 9Z`,"url(#paper)","#755456",'stroke-width="1.2"')+
      line(`M${-w*.37} 11L${w*.45} 4M${-w*.31} 14L${w*.40} 7`,"#755456",1,.7));
  }));
}
