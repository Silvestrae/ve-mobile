import { P,E,C,G,T,N,line,placed,archD } from "./environment.mjs";
import { basin,bottle,candle,cavernRock,chain,luminous,sparks,sword } from "./props.mjs";
import { clipped,linear,material,radial } from "./location-surfaces.mjs";
import { objects } from "./location-objects.mjs";

const brass="#d9b183", gold="#edcfac", wood="#ab7a61", steel="#a4b2c3", dark="#242130";
const pathShine=(d,c,width)=>luminous(d,c,width,.9);

// A reaction can crystallise, boil or vent. Glass and copper work as a single bench assembly.
function reaction(p,v) {
  const reagent=["#99d8ad","#d6a9ef","#f2c388"][v%3];
  const glow=E(-28,-89,182,129,"url(#accent)",'opacity=".58"');
  const rack=P("M-134-13l243-6 27 20-29 18-226 7-25-13Z","url(#brass)",brass,'stroke-width="3.2"')+
    line("M-122-12V-143Q-122-156-109-156H85v137",wood,7,.97)+
    line("M-122-12V-143Q-122-156-109-156H85v137",brass,2.2,.83)+
    N(9,i=>C(-110+i*26,1-i*.83,2.7,"url(#steel)"));
  const vapor=T(-32,-132,N(8,i=>{
    const offset=i*10-39;
    return line(`M${offset*.31} 13Q${offset-44} -19 ${offset-16} -49Q${offset+40} -71 ${offset+11} -94`,reagent,i%3?3.8:7,.25+(i%3)*.15);
  }));
  const crystal=T(-35,-111,N(7,i=>placed((i-3)*16,-13-(i%2)*11,.56+(i%3)*.12,
    P("M-14-1L-17-52 0-96 18-57 17-3Z","url(#glass)",reagent,'stroke-width="2.3"')+
    P("M0-96L0-55-14-1 8-27 18-57Z",reagent,"none",'opacity=".63"')+
    line("M0-94L0-55-12-4",gold,1.65,.78),(i-3)*16)));
  const bubbles=T(-21,-107,N(25,i=>{
    const x=Math.round(Math.sin(i*1.82)*(11+i*2.4)),y=-i*4.9-5,radius=5+(i%6)*2.1;
    return C(x,y,radius,"url(#glass)",`stroke="${reagent}" stroke-width="1.65" opacity="${.87-i*.014}"`)+
      line(`M${x-radius*.6} ${y-2}q1-4 5-5`,gold,1.25,.76);
  }));
  return rack+glow+
    P("M-94-1L-81-37 1-41 14-5-9 8-74 11Z","url(#oak)",wood,'stroke-width="2.4"')+
    P("M-57-9Q-81-34-45-63Q-36-50-43-41Q-23-52-23-70Q-3-29-33-8Z","#ed9b65",gold,'stroke-width="1.7"')+
    placed(-34,-46,1.27,bottle(p,"retort",reagent))+
    line("M63-114Q93-118 95-91v32",wood,6,.91)+line("M65-116Q93-118 95-92v28",brass,2.3,.75)+
    placed(94,-1,.92,bottle(p,"round",reagent))+
    [vapor,crystal,bubbles][v%3];
}

// The object and its effect are one rite. Cloth, offerings and root shadow give it a physical location.
function spiritRite(p,v) {
  const tint=["#b4e7cc","#acdee9","#efd7ad"][v%3];
  const route=[
    "M-18-31Q-113-59-88-96Q-68-126 26-133Q112-141 75-190Q48-226-18-195",
    "M-80-36Q-124-83-35-130Q51-176 21-216m53 179Q113-94 16-134Q-69-158-32-203",
    "M-137-77Q-120-120-5-122Q105-125 132-83Q149-41 54-34Q-70-27-137-77Z",
  ][v%3];
  return E(0,7,168,37,"url(#shadow)")+
    P("M-146-13L-121-46-81-68 73-73 121-59 140-16 110 17-119 23Z","url(#stone)",p.trim,'stroke-width="3.4"')+
    P("M-122-44l41-22 156-7 46 16-31 16-154 12Z",p.mid,p.trim,'stroke-width="2"')+
    material(p,"spiritPlinth","M-146-13L-121-46-81-68 73-73 121-59 140-16 110 17-119 23Z",[-147,-77,294,106],"stone",.8)+
    placed(4,-58,.78,objects.offering[1](p))+
    candle(p,-93,-47,.64)+candle(p,99,-49,.63)+
    E(0,-119,176,147,"url(#accent)")+
    pathShine(route,tint,3.2)+
    N(17,i=>{
      const x=Math.round((i-8)*16+Math.sin(i*1.35)*31),y=Math.round(v%3===2?-80-Math.sin(i/16*Math.PI)*40:-42-i*8.6);
      return E(x,y,27,24,"url(#accent)")+
        P(`M${x} ${y-7}q-11 8-3 14 12-4 3-14Z`,tint,"none",'opacity=".78"');
    });
}

// Weather, impact and a rippling surface read differently for each element. Effects originate at the terrain.
function elemental(p,v,element) {
  const choose=element ?? ["fire","water","air"][v%3];
  const tones={ fire:["#aa4d49","#ff935f","#ffe1a7"],water:["#234e6a","#5a9bb4","#c7f2ec"],
    air:["#53688f","#9fc7db","#e4f1e1"],earth:["#4a4055","#b6927f","#d7b49c"],
    wood:["#334c42","#799675","#c5d6ab"],metal:["#3c4a63","#869aaf","#e5e0d1"] };
  const [darkTone,mid,bright]=tones[choose];
  const defs=`<defs>${linear("elementWash",[16,100],[[0,darkTone,.22],[.36,mid,.64],[.78,mid,.92],[1,bright,.89]])}
    ${radial("elementGlow",bright,.61,darkTone)}</defs>`;
  const flameShapes=[
    "M-133-2Q-188-69-111-141Q-62-188-76-239Q-29-217-31-164Q30-188 50-256Q118-208 87-140Q142-128 159-79Q176-27 113-5Z",
    "M-130 2Q-190-52-115-130Q-59-181-24-195Q9-209 2-258Q88-209 64-150Q125-160 151-103Q183-46 122-4Z",
    "M-119 6Q-175-77-111-122Q-58-156-57-207Q-32-185-21-150Q23-189 14-244Q73-237 91-185Q109-146 69-105Q153-120 164-66Q166-25 120-2Z",
  ];
  const waveShapes=[
    "M-175 0Q-134-48-112-104Q-78-174-10-220Q62-266 141-237Q102-224 87-187Q79-161 109-126Q165-56 117-12Z",
    "M-171 6Q-101-35-95-103Q-84-175 2-219Q75-250 142-203Q104-207 89-176Q72-142 104-96Q150-40 130-3Z",
    "M-163 8Q-116-50-108-104Q-92-164-50-192Q22-245 106-233Q143-221 165-172Q102-224 73-165Q61-133 88-109Q156-51 123-6Z",
  ];
  let body;
  if(choose==="fire") {
    const rim=flameShapes[v%3];
    body=P(rim,"url(#elementWash)",mid,'stroke-width="2"')+
      P("M-100 2Q-139-47-76-91Q-3-133-20-173Q37-145 16-108Q61-136 76-179Q114-133 78-85Q130-70 99 0Z",
        "url(#elementWash)",bright,'stroke-width="1.7"')+
      P("M-54 2Q-80-42-26-61Q8-76 1-107Q34-87 19-61Q50-67 63-101Q94-52 52 1Z",bright,mid,'fill-opacity=".76"')+
      clipped("fireRibbons",rim,N(14,i=>line(`M${-139+i*19} 5q${-55+i*5} -${68+i*4} ${15+i*6} -${154+i*5}`,bright,i%3?2:4,.35)));
  } else if(choose==="water"){
    const wave=waveShapes[v%3];
    body=P(wave,"url(#elementWash)",mid,'stroke-width="3.1"')+
      clipped("waterFolds",wave,N(14,i=>line(`M${-171+i*23} 5Q${-121+i*17} -82 ${-92+i*13} -156Q${-29+i*9} -248 ${109+i*5} -226`,i%3?mid:bright,i%3?4:2.2,.55)))+
      pathShine("M-163-4Q-119-87-80-144Q-4-246 85-231Q120-226 136-212",bright,3.3);
  } else if(choose==="earth") {
    body=N(8,i=>cavernRock(p,-147+i*[41,38,46][v%3],-5-Math.max(0,3-Math.abs(i-[3,5,2][v%3]))*[29,39,22][v%3],.68+(i%4)*.21,(i-3)*11))+
      pathShine("M-151-3L-111-53-67-45-28-99 20-94 62-47 106-59 142-12",bright,2.3);
  } else if(choose==="metal") {
    const plate=(i)=>{
      const shape=["M-23 19L-15-53 13-98 19-38 34 1Z","M-37 7L-22-59 9-87 25-66 33-1Z","M-24 21L-31-42 11-84 34-40 17 12Z"][(v+i)%3];
      return P(shape,"url(#steel)",bright,'stroke-width="2.1"')+
        line("M-21 15l12-48 23-39m-22 35 33 14",bright,1.4,.76);
    };
    body=N(10,i=>placed(-145+i*31,-9-i*16,.69+(i%3)*.13,plate(i),i*24-81))+
      pathShine("M-163-14Q-78-128-9-94Q103-34 154-189",bright,2.7);
  } else if(choose==="wood") {
    const surge=["M-146 14Q-171-82-78-147Q-22-208 87-207l18 24q-105 0-151 59-61 63-64 129Z",
      "M-143 15Q-106-69-79-135Q-56-191 9-223L22-207-13-180 60-217 63-197 29-177 99-196 104-177Q15-133-23-88Q-48-60-70 5Z",
      "M-143 13Q-158-41-102-91Q-53-145-63-219L-28-218Q-18-152-35-111Q28-122 77-176l30 3Q72-85-29-53Q-78-33-67 12Z"][v%3];
    body=P(surge,"url(#bark)",mid,'stroke-width="3.8"')+
      N(9,i=>line(`M${-148+i*31} 12Q${-165+i*32} -76 ${-64+i*17} -145Q${i*15} -198 ${95+i*6} -206`,i%3?"url(#bark)":mid,9-i*.56,.77))+
      N(22,i=>P(`M${-85+i*7} ${-114-i*4}q18-19 32-11-9 19-32 11Z`,i%2?mid:bright,dark,'stroke-width="1.1" opacity=".78"'));
  } else {
    const sweep=[-103,-63,-138][v%3], exit=[-132,-171,-82][v%3];
    body=N(11,i=>pathShine(`M${-173+i*8} ${4-i*14}Q${-95+i*11} ${sweep-i*5} ${24+i*9} ${-85-i*13}Q${139+i*3} ${-35-i*16} ${155-i*4} ${exit-i*9}`,
      i%3?mid:bright,i%3?2.4:4.3))+
      N(12,i=>cavernRock(p,-149+i*24,-31-i*14,.15+(i%4)*.055,i*28));
  }
  return defs+E(0,-79,242,187,"url(#elementGlow)")+
    E(0,16,173,33,"url(#elementGlow)",'opacity=".72"')+body+
    pathShine("M-153 28l78-29 37 12 37-10 54 13 61-19 43 22m-152-4-25 21-48 18",bright,2.6)+sparks(p,0,-15,37,bright);
}

// A broken room charges along its damaged joints. The bolt, shard orbit and flame read distinctly.
function sorcery(p,v) {
  const tint=["#b9caff","#f1a67e","#d6bcff"][v%3];
  const bolt=pathShine("M48-237L-19-190 17-153-47-108-11-82-57-21-34 7M-26-178l-63-19-34 10m90 62 88-25 29-43m-122 98 81 7 44-31m-131 93 48 17 65-4",tint,4.4)+
    pathShine("M15-149l-54-23-11-27m11 115-44 17-23 39m107-46 46-12 33 11",tint,2.25);
  const shards=N(12,i=>{
    const x=Math.round(Math.cos(i*1.86)*(48+i*5)),y=-32-i*16.3;
    return cavernRock(p,x,y,.24+(i%4)*.094,i*37)+
      line(`M${x+2} ${y+5}l${i%3*9-16} 17`,tint,1.7,.62);
  })+pathShine("M-133-34Q6-8 126-78Q163-153-31-162Q-136-155-112-105Q-59-53 93-186",tint,3.3);
  if(v%3===1) return elemental(p,1,"fire");
  return E(0,-103,240,199,"url(#magic)")+
    cavernRock(p,-113,9,.83,7)+cavernRock(p,113,7,.7,-9)+
    (v%3===0?bolt:shards)+
    pathShine("M-154 39l77-27 43 2 34-15 59 16 46 34 53 2m-172-19-21 28-49 16",tint,2.7)+sparks(p,0,-6,33,tint);
}

// A pact seal is inlaid in the face of the threshold. Beyond it, a tear, flame or vortex has its own silhouette.
function pactGate(p,v) {
  const aperture=archD(226,272)+"Z";
  const colour=["#ec9eb0","#f5b8bb","#c3a9ee"][v%3];
  const ring=N(7,i=>E(0,-137,92-i*8,106-i*9,"none",`stroke="${i%2?colour:"#966495"}" stroke-width="${i%2?2.9:4.7}" opacity="${.68-i*.05}" transform="rotate(${i*5-17} 0 -137)"`))+
    pathShine("M-89-83Q-109-161-59-212l-5-18 27 2 32-20 52 16 25 39 19 45-5 42-25 31-17 24-28 13-25-14-29-2-17-16-25-13Z",colour,3.6);
  const tear=P("M-81-45L-38-104-65-147-19-172-22-208 61-250 38-204 71-201 36-153 89-122 38-91 29-58-19-32 4-78Z",
    "#4e344f",colour,'stroke-width="2.9"')+
    pathShine("M-61-53l52-47-22-43 47-37 3-24 25-26m-60 91 67 19-36 12-12 31",colour,4);
  const vortex=E(1,-140,104,110,"#352f58",`stroke="${colour}" stroke-width="2.9"`)+
    N(9,i=>G(line("M-91-138Q-58-226 21-221Q99-220 100-136Q97-62 20-57Q-57-52-63-118Q-63-170-16-178Q39-174 42-130Q41-89-3-103",
      i%3?colour:"#d6b9f4",i%3?2.9:5.2,.65),`transform="rotate(${i*29} 0 -137)"`));
  return E(0,-125,215,193,"url(#magic)")+
    P(aperture,"url(#recess)",dark,'stroke-width="16"')+
    clipped("pactBeyond",aperture,[ring,tear,vortex][v%3])+
    line(archD(257,293),"url(#stone)",24)+line(archD(279,307),p.trim,2.25,.7)+
    N(13,i=>T(-106+i*17,-254-Math.sin(i/12*Math.PI)*48,
      line("M-3-5l6 10m-6 0 6-10",colour,1.35,.79)))+
    chain(-127,-277,24,-8,.75)+chain(125,-278,25,9,.75)+
    P("M-130-3H130l37 28-321 8Z","url(#stone)",p.trim,'stroke-width="3.4"')+
    candle(p,-96,1,.68)+candle(p,106,2,.72);
}

// Anchoring runes lead from the floor into a circle, chained doorway or opposing crescents.
function summonGate(p,v) {
  const tint=["#9ee7d8","#bfc7f6","#c1ead6"][v%3];
  const stoneRing=T(0,-139,N(13,i=>{
    const a=i*Math.PI*2/13;
    return placed(Math.round(Math.cos(a)*122),Math.round(Math.sin(a)*112),.43,cavernRock(p,0,0,1),i*29);
  })+E(0,0,105,98,"url(#glass)",`stroke="${tint}" stroke-width="3.2" opacity=".69"`)+
    pathShine("M-93-2Q-49-71 12-70Q79-72 92-4Q70 65 0 67Q-57 62-93-2Z",tint,3));
  const gate=P(archD(209,254)+"Z","url(#glass)",tint,'stroke-width="3.9"')+
    line(archD(247,279),"url(#stone)",17)+
    chain(-111,-218,16,-58,.89)+chain(111,-216,16,59,.89)+
    pathShine("M0-218L64-142 0-66-65-142Z M-65-142H65M0-218v152",tint,3.2);
  const moons=P("M-99-24Q-174-108-105-199Q-65-247-11-247Q-60-211-63-140Q-64-74-25-38Q-60-17-99-24ZM99-249Q173-165 104-75Q67-31 13-28Q58-72 63-143Q66-208 25-234Q63-255 99-249Z",
    "url(#stone)",tint,'stroke-width="3.4"')+
    pathShine("M-100-32Q-143-100-98-184Q-64-225-30-238M100-242Q144-172 95-88Q63-48 28-37M-60-129Q5-196 67-144M-59-126Q5-65 62-141",tint,3);
  return E(0,-130,232,191,"url(#accent)")+
    T(0,9,N(7,i=>E(0,0,42+i*20,9+i*4,"none",`stroke="${tint}" stroke-width="${i%3?1.5:2.5}" opacity="${.76-i*.079}"`)))+
    [stoneRing,gate,moons][v%3]+sparks(p,0,-15,31,tint);
}

// A blade's guard, tang and edge remain distinct behind the orbiting spell.
function arcaneBlade(p,v) {
  const tint=["#c1b1fa","#bfdcff","#a9bbea"][v%3];
  const helix=N(7,i=>pathShine(`M${-125+i*17} ${7-i*14}Q${-141+i*18} ${-57-i*11} ${-18+i*12} ${-76-i*14}T${97+i*5} ${-171-i*9}`,
    i%3?tint:"#f4ddfd",i%3?2.1:3.1));
  const blades=N(5,i=>placed(-89+i*43,-61-i%2*22,.57,sword(p,"short",tint),-35+i*17))+
    pathShine("M-139-8Q-36-58 27-14T145-37",tint,2.9);
  const lightning=pathShine("M-27-152l-37 52 14 28-33 23 15 30-78 20m181-142 24 39-17 25 38 22-19 35 69 19m-179-118-57-17-17-20",tint,4.1);
  return P("M-147 6L-106-21 114-19 152 8 114 22-117 26Z","url(#stone)",p.trim,'stroke-width="3.4"')+
    E(0,-119,221,178,"url(#accent)")+
    T(0,2,N(4,i=>E(0,0,44+i*24,8+i*4,"none",`stroke="${tint}" stroke-width="1.9" opacity="${.66-i*.12}"`)))+
    placed(13,-83,1.16,sword(p,"long"),19)+[helix,blades,lightning][v%3]+
    sparks(p,0,-16,26,tint);
}

// A casket's lid has fittings and engraving. The form of grave light is tied to its open cavity.
function graveRite(p,v) {
  const tint=["#c9d7b9","#b9e4cf","#93e6ba"][v%3];
  const cage=N(9,i=>{
    const y=-33-i*16,w=36+Math.sin(i/8*Math.PI)*76;
    return line(`M${-w} ${y+12}Q${-w*.62} ${y-20} 0 ${y}Q${w*.66} ${y-17} ${w} ${y+13}`,tint,4.1,.63)+
      E(-w,y+12,4.5,3.4,tint)+E(w,y+13,4.5,3.4,tint);
  })+pathShine("M-5-25Q27-73 2-108Q-18-163 18-196",tint,3.6);
  const fog=N(7,i=>{
    const x=-50+i*17;
    return P(`M${x} -34Q${x-63} -60 ${x-28} -95Q${x+23} -130 ${x-5} -177Q${x+24} -156 ${x+33} -125Q${x+46} -82 ${x+11} -66L${x+25} -32Z`,
      tint,"none",`opacity="${.08+i*.029}"`)+
      line(`M${x} -34Q${x-63} -60 ${x-28} -95Q${x+23} -130 ${x-5} -177`,tint,2.1,.31);
  });
  const branch=pathShine("M-9-28L14-63-8-110 14-148-4-199M-5-107l-59-35-31-37-31-6m60 38-28 10-27-18M11-63l51-39 42-49 25-13m-62 59 37-11 30 8M11-148l30-34-9-24",tint,3.7);
  return E(0,-114,222,159,"url(#accent)")+
    P("M-142 4L-130-55 113-62 144-36 137 22-130 25Z","url(#stone)",p.trim,'stroke-width="4"')+
    P("M-128-54L111-58 126-36-138-20Z","#302c36",p.trim,'stroke-width="2.2"')+
    P("M-122-61L-96-133 83-136 107-98 96-65Z","url(#stone)",p.trim,'stroke-width="3.4"')+
    line("M-111-67l25-58 160-4 20 30-12 26ZM-48-103l47-17 42 14-41 18Z",p.trim,2,.7)+
    N(6,i=>C(-109+i*44,-54-i*.47,4,"url(#brass)"))+
    [cage,fog,branch][v%3]+sparks(p,0,-39,28,tint);
}

// The basin's reflected glow supports a vision of light, reflection, or displaced terrain.
function oracleBasin(p,v) {
  const tint=["#f6c1ad","#d9d5f0","#edb4e8"][v%3];
  const sun=P("M-17-95Q-92-82-87-11Q-82 61-36 85L-10 34-26-5-8-32ZM21-94Q92-74 95-8Q95 69 5 86l15-54-15-36 25-31-18-23Z",
    "#aa7675",tint,'stroke-width="2.7" fill-opacity=".72"')+
    pathShine("M-65-52Q-90 1-57 52M55-57Q92-10 58 48M2-91L-13-33 13 2-11 63",tint,2.8);
  const mountain=P("M-135-57L-99-79-62-55-29-87 10-58 57-88 109-63 139-50 74-3 46 2 0 87-40 36-78 6Z",
    "url(#glass)",tint,'stroke-width="2.8"')+
    pathShine("M-128-54l69 25 28-13 39 17 44-20 71 1M-76 5l47-42 29 124 14-111 51 20",tint,2.4);
  const eye=N(7,i=>P(`M${-136+i*16} 0Q0 ${-156+i*23} ${136-i*16} 0Q0 ${156-i*23} ${-136+i*16} 0Z`,"none",tint,
    `stroke-width="${i%3?1.7:3}" opacity="${.86-i*.09}"`))+
    C(0,0,30,"url(#glass)",`stroke="${tint}" stroke-width="2.9"`)+C(0,0,9,tint);
  return basin(p,0,-10,1.25)+E(0,-133,208,181,"url(#accent)")+
    T(0,-148,[sun,mountain,eye][v%3])+
    pathShine("M-24-42q-47-38-13-69m60 67q53-42 24-67",tint,2.5)+sparks(p,0,-46,27,tint);
}

// Distortion carries its own bent material traces instead of a free-standing diagram.
function thoughtField(p,v) {
  const tint=["#cbb9f2","#aebfe9","#dcb8f3"][v%3];
  const ripples=N(10,i=>E(0,0,37+i*12,23+i*9,"none",
    `stroke="${tint}" stroke-width="${i%3===0?3.3:1.75}" opacity="${.85-i*.071}" transform="rotate(${i*1.8-12})"`))+
    pathShine("M-149 14Q-96-65 1-22Q98 25 149-36",tint,2.8);
  const fracture=P("M-149-58L-51-86 0-75-38-30-13-11-53 68-105 90-84 13ZM149-58L51-86 0-75 38-30 13-11 53 68 105 90 84 13Z",
    "url(#glass)",tint,'stroke-width="3.1"')+
    pathShine("M0-82L-38-30-13-11-53 68M0-82L38-30 13-11 53 68",tint,4.2)+
    line("M-138-53l61 12 23-37m-53 154 26-52 60-35m160-42-61 12-23-37m53 154-26-52-60-35",tint,2,.8);
  const orbit=N(14,i=>{
    const angle=i*1.17,radius=27+i*9.2,x=Math.round(Math.cos(angle)*radius),y=Math.round(Math.sin(angle)*radius*.71);
    return cavernRock(p,x,y,.18+(i%4)*.078,i*34);
  })+pathShine("M-141 18Q-144-80-12-96Q102-104 140-38Q167 32 44 66Q-47 76-60 8Q-65-33-9-38",tint,2.7);
  return E(0,-113,223,184,"url(#magic)")+
    T(0,-134,[ripples,fracture,orbit][v%3])+
    T(0,0,N(8,i=>E(0,1,41+i*18,5+i*4,"none",`stroke="${tint}" stroke-width="1.6" opacity="${.6-i*.058}"`)))+
    cavernRock(p,-121,8,.55,-12)+cavernRock(p,119,4,.5,18);
}

// Hearth and suspended charm share a hanger, cauldron, and directional warm light.
function witchHearth(p,v) {
  const charm=v%3===0?N(17,i=>G(
    line("M0-89q26-5 47 10l-8-20m7 21 20 1","url(#bark)",6.7,.98)+line("M0-90q26-4 46 10",p.trim,1.65,.78),
    `transform="rotate(${i*360/17})"`)):
    v%3===1?N(9,i=>{
      const x=-85+i*21;
      return P(`M${x} -95q${i%2?29:-22} 36 ${i%2?3:-9} 79q${i%2?-26:25} 43 17 85l-13 15q-48-52-20-103q${i%2?22:-26} -34 5-73Z`,
        ["#ad7a90","#8c7596","#d0a47f"][i%3],gold,'stroke-width="1.6" opacity=".82"');
    })+line("M-105-88Q0-126 106-95",brass,4,.85):
    line("M-108-85L0-132 109-85M-105-78L0-113 108-78",wood,5.5,.9)+
    N(8,i=>T(-93+i*27,-14+(i%3)*19,line("M0-77v69",gold,1.8,.82)+
      P(i%2?"M-13 0L0-15 13 0 0 18Z":"M-15-7l28 5 7 21-23 10-16-18Z",i%2?"url(#brass)":"url(#paper)",brass,'stroke-width="1.8"')));
  return E(0,-25,201,135,"url(#ember)",'opacity=".72"')+
    P("M-142-247L145-256 153-229-147-219Z","url(#oak)",wood,'stroke-width="4"')+
    line("M-7-224l7 37m-2-31 6 34",gold,2.2,.81)+
    T(0,-145,charm)+placed(0,0,1.34,objects.cauldron[1](p))+
    N(7,i=>line(`M${-53+i*18} -70q${i%2?23:-18} -23 ${i%3-3} -46`,p.bright,2.3,.39))+
    candle(p,-98,-4,.59)+candle(p,93,-4,.61);
}

export const magicFeatures=Object.freeze({
  reaction,spiritRite,elemental,sorcery,pactGate,summonGate,arcaneBlade,graveRite,oracleBasin,thoughtField,witchHearth,
});
