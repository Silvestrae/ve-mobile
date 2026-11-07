import { P,R,E,C,T,G,N,line,placed } from "./environment.mjs";
import { candle,cavernRock,crest,sparks } from "./props.mjs";
import { ashlar,clipped,material,mix,strokes,undergrowth } from "./location-surfaces.mjs";
import { between } from "./vector.mjs";
import { objects } from "./location-objects.mjs";

const shade="#202432", wood="#8e674e", brass="#d9ae72", bone="#e9d4ad";

// Tracks compress the ground under the same path they follow. Their shape and direction vary together.
function trailPrints(p,variant) {
  const paths=[
    "M-189 94Q-60 15 21-11T151-147l29-6Q111-25 51 18Q-61 80-116 101Z",
    "M-142 90Q14 34 28-51Q34-108-24-156l40-11Q101-109 86-47Q64 50-73 111Z",
    "M-124 95Q27 29-35-29Q-86-73-158-131l28-14Q-35-92 10-49Q86 26-41 108Z",
  ];
  const points=[
    [[-120,66],[-66,39],[-21,12],[32,-12],[76,-48],[105,-84],[137,-115]],
    [[-84,73],[-40,47],[1,15],[22,-17],[45,-58],[34,-97],[11,-131]],
    [[-77,74],[-24,42],[-17,10],[-47,-20],[-67,-49],[-100,-81],[-128,-114]],
  ][variant];
  const print=[
    P("M-19-4Q-16-14-6-13Q2-11 0 1Q-2 14-10 13Q-20 8-19-4Zm21 0Q2-13 13-13Q24-10 20 1Q15 14 7 13Q1 11 2-4Z",shade,wood,'stroke-width="1.5"'),
    E(0,4,14,9,shade,`stroke="${wood}" stroke-width="1.9"`)+
      N(4,i=>E(-14+i*9,-7-Math.sin(i*Math.PI/3)*6,3.7,5,shade,`stroke="${wood}" stroke-width="1.4"`)),
    P("M-22 7Q-10-2-9-15l4 13 5-18 6 17 10-15-1 15q8 1 7 9Q8 21-22 7Z",shade,wood,'stroke-width="1.6"'),
  ][variant];
  const random=p.stream("tracks in ground");
  const tracks=P(paths[variant],mix(p.mid,"#b49d75",.32),p.trim,'stroke-width="1.1" opacity=".73"')+
    material(p,"trackDust",paths[variant],[-190,-170,380,286],"stone",.74)+
    points.map(([x,y],index)=>placed(x+(index%2?11:-9),y,1.16-index*.094,print,between(-12,14,random))).join("");
  return G(tracks,'transform="translate(0 60) scale(1 .28)"')+
    cavernRock(p,154,-12,.75,12)+cavernRock(p,-143,19,.59,-9)+
    undergrowth(p,"trackVerges",-160,24,129,{shade:"#7f8f68"})+
    undergrowth(p,"trackFarGrass",74,-39,107,{shade:"#768a69"});
}

// Rock layers frame a sheltered den. The opening changes in shape, not just in colour.
function rockDen(p,variant) {
  const entrances=[
    "M-97 6L-88-80-54-133 29-146 87-109 115 8Z",
    "M-98 9L-68-112-21-155 63-120 110-83 119 13Z",
    "M-118 7L-102-65-32-109 68-110 114-65 126 11Z",
  ];
  const lip="M-177 6l33-143 65-24 44-50 76 12 69 53 46 33 30 125Z";
  const entrance=entrances[variant];
  return E(0,20,207,32,"url(#shadow)")+
    P(lip,"url(#stone)",shade,'stroke-width="5.5"')+
    material(p,"denFace",lip,[-181,-216,370,241],"stone",1)+
    clipped("denStrata",lip,line(strokes(13,i=>`M-176 ${-178+i*15}Q13 ${-162+i*15} 179 ${-215+i*17}`),p.trim,2,.29))+
    P(entrance,"url(#recess)",shade,'stroke-width="9"')+
    clipped("denInterior",entrance,E(30,1,97,83,"url(#accent)",'opacity=".28"')+
      P("M-119 14L-44-17 26-39 104-1 139 18Z",p.deep,p.trim,'stroke-width="1.4"'))+
    line("M-155-19l21-86 54-29 32-35m79-20 42 41 59 37m-24 45 25 22",p.trim,3.4,.76)+
    cavernRock(p,-127,9,.77,-11)+cavernRock(p,130,13,.81,14)+
    placed(39,14,.78,objects.antler[1](p),-11)+
    undergrowth(p,"denMoss",-138,4,104,{shade:"#708867"});
}

// Sunlight pours through a masonry opening. Steps and buttresses support the arch.
function sunGate(p,variant) {
  const openings=[
    "M-87-15v-113q0-47 87-101 87 54 87 101v113Z",
    "M-91-16v-103q0-90 91-90t91 90v103Z",
    "M-89-16v-121l51-65 38-24 39 22 50 67v121Z",
  ];
  const mouth=openings[variant];
  const shell="M-129-3v-136q0-65 130-126 130 63 129 126V-3Z";
  return E(3,11,209,32,"url(#shadow)")+
    ashlar(p,"sunGateStone",shell,[-132,-267,270,270],{cell:44,course:29})+
    P(shell,"none",p.trim,'stroke-width="4.5"')+
    P(mouth,"url(#night)",brass,'stroke-width="6"')+
    clipped("sunThroughGate",mouth,E(6,-148,121,162,"url(#sun)")+
      C(3,-135,26,p.time.colour,'opacity=".93"')+
      P("M-110-72Q-7-96 111-81v79H-110Z",mix(p.time.sky,p.mid,.35),"none",'opacity=".7"')+
      line("M-98-55q92-24 196-14m-173 29q56-18 140-13",bone,2,.53))+
    P("M-153-8l305-1 34 24-372 6Zm-33 29l370-6 6 22-381 7Z","url(#stone)",p.trim,'stroke-width="3.3"')+
    N(11,i=>C(-121+i*24,-18,2.8,"url(#brass)"))+
    T(0,-222,crest(p,"sun",.65))+
    line("M-111-138q0-59 111-111 112 56 112 111m-223 25v95m223-95v95",bone,2,.69);
}

// Coin drifts overlap a few large, recognisable treasures at the base of the lair.
function hoard(p,variant) {
  const treasurePaths=[
    "M-177 12l28-41 44-13 32-40 52-6 40 23 53-24 51 34 40 5 32 62Z",
    "M-172 12l48-25 14-40 52-30 40 20 57-19 31 21 42 20 40 34 37 21Z",
    "M-178 16l24-42 55-15 36 8 30-37 53 13 41-44 43 19 16 35 55 20 23 47Z",
  ];
  const heap=treasurePaths[variant];
  const random=p.stream("hoard layers");
  const pile=clipped("coinHeap",heap,N(117,i=>{
    const x=between(-181,183,random), y=between(-105,17,random);
    const size=between(3,11,random), tilt=between(-17,17,random);
    return placed(x,y,1,E(0,0,size,size*.4,"url(#brass)",`stroke="${i%3===0?bone:"#79534c"}" stroke-width="1.2"`),tilt);
  }));
  const chest=P("M-83-68q0-49 69-63 54-9 97 32l15 29-13 56-143 7-36-25Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-81-66l175-5-9 49-146 13-19-16Z","url(#wood)",wood,'stroke-width="3"')+
    line("M-82-62l176-7m-141-49 12 104m85-103 11 96",brass,4.6,.85)+
    R(-8,-70,31,24,"url(#brass)",'stroke="#673f41" stroke-width="2"')+
    C(8,-59,3,shade);
  const shield=placed(-39,-42,1.13,objects.shield[1](p),-18)+
    placed(63,-56,.94,objects.blade[1](p),-15);
  const idol=P("M-69-43l28-44 26 10 18-46 26 42 34-22 21 53-41 12-84 4Z","url(#brass)",brass,'stroke-width="4"')+
    line("M-52-58Q3-67 61-62m-55-47v41",bone,2.5,.8);
  return E(0,-61,224,116,"url(#ember)",'opacity=".63"')+
    cavernRock(p,-148,7,.81,-12)+cavernRock(p,141,3,.78,12)+
    P(heap,"url(#brass)",wood,'stroke-width="3.8"')+pile+
    [chest,shield,idol][variant]+
    placed(114,10,.78,objects.coins[1](p),-10)+placed(-129,-7,.7,objects.reliquary[1](p),12);
}

// The cuts are in a ledge, with lighter stone visible inside each broken edge.
function clawLedge(p,variant,frosted=false) {
  const rock=[
    "M-181 5l22-96 46-38 45-57 85 2 56 40 61 8 46 143Z",
    "M-183 10l59-143 53-33 105-13 30 32 57 12 61 149Z",
    "M-176 12l19-91 59-24 64-69 84-9 54 52 47 14 35 128Z",
  ][variant];
  const cuts=[
    "M-61-154q9 48 51 111l-21-19-43-84Zm50-13q12 48 49 110L18-75l-44-89Zm54 19q6 42 40 87L64-79l-36-67Z",
    "M-125-111q67-19 189-23L6-123l-113 27Zm14 37q82-25 216-35L39-94l-137 37Zm21 32q80-19 205-26l-83 14-113 24Z",
    "M-89-122l48 44 27 47-28-16-67-65Zm46-37l62 63 25 54-39-44-68-61Zm61-12l63 66 25 57-39-47-69-68Z",
  ][variant];
  const frost=frosted ? clipped("frostClawRim",rock,
    P("M-191-191l371-25 10 113-53-20-35 12-49-25-53 13-34-18-52 9-55 32-57-8Z","#b7c8ca","#dfddd3",'stroke-width="2.9" opacity=".83"')+
    line("M-89-158l38 24 48-18 40 18 46-13m-190 30 8 28m88-38 13 27m116-31 15 24","#e2d7c9",3,.78)) : "";
  return E(0,16,194,32,"url(#shadow)")+
    P(rock,frosted?"#60697c":"url(#stone)",shade,'stroke-width="5"')+
    material(p,"scratchedRock",rock,[-185,-191,373,213],"stone",.93)+frost+
    P(cuts,"url(#recess)",frosted?"#cbdadb":p.trim,'stroke-width="2.6"')+
    line("M-157-63l38-21m-25 53 55 21m174-95 35 17 28 63m-108-106 40 21",p.trim,2.5,.57)+
    cavernRock(p,-144,9,.58,-15)+cavernRock(p,141,13,.67,17)+
    placed(96,8,.78,objects.crystals[1](p),13);
}

// The remaining tower is one continuous masonry silhouette, with an opening into the burned interior.
function scorchedTower(p,variant) {
  const forms=[
    "M-101 15l17-209 16-25 18 14 11-46 33 17 20-13 24 29 15-11 37 49 14 192Z",
    "M-113 14l25-177 38-13 10-67 33-10 15 23 21-34 24 19 15 56 21 12 23 183Z",
    "M-103 13l10-215 29-29 34 10 28-23 20 30 28-13 21 9 26 51 16 187Z",
  ];
  const tower=forms[variant];
  const gate="M-46 7v-50q0-30 46-61 46 31 46 61V7Z";
  return E(0,16,194,33,"url(#shadow)")+
    E(23,-132,173,154,"url(#ember)",'opacity=".63"')+
    ashlar(p,"burntTower",tower,[-115,-270,233,291],{cell:46,course:32,light:mix(p.mid,"#63464b",.65)})+
    P(tower,"none",shade,'stroke-width="4"')+
    P(gate,"url(#recess)",p.trim,'stroke-width="4.5"')+
    clipped("burntArch",gate,E(5,-3,48,42,"url(#ember)",'opacity=".67"')+
      line("M-27-12l11-32 9 23 18-19 13 23","#dc825b",2.8,.73))+
    P("M-22-172h17v41h-17Zm52 12h14v35H30Z","url(#recess)",p.trim,'stroke-width="2"')+
    line("M-66-196l22 59-12 13 19 24m99-81-13 24 16 37",shade,4.6,.95)+
    line("M-81-154l18 55-16 32M70-146l13 71-14 35","#b56959",2,.69)+
    cavernRock(p,-110,5,.69,-14)+cavernRock(p,111,12,.74,14)+sparks(p,2,-51,18,"#ffb372");
}

// Cap ribs and spots follow the mushroom's silhouette and cluster in depth.
function fungalRing(p,variant) {
  const shapes=[
    [[-137,12,.72],[-105,-42,.62],[-71,-73,.53],[6,-77,.53],[79,-69,.62],[137,-25,.74],[113,27,.9],[38,43,1.05],[-59,43,.96]],
    [[-137,27,.94],[-91,7,.74],[-59,-17,.65],[-28,-27,.58],[24,-52,.55],[59,-70,.56],[93,-88,.55],[132,-96,.51]],
    [[-136,24,.94],[-94,15,.83],[-60,28,1.02],[-20,9,.78],[29,-1,.77],[69,-19,.65],[108,-29,.66],[135,-53,.61]],
  ][variant];
  const colours=[["#cb84bf","#f9bbd9"],["#77b2a8","#b9ead7"],["#c68667","#ffce9d"]];
  const [cap,glint]=colours[variant];
  const random=p.stream("fungal patches");
  const mushrooms=shapes.slice().sort((a,b)=>a[1]-b[1]).map(([x,y,size])=>{
    const height=between(35,83,random), width=between(25,42,random);
    const stalk=P(`M-8 1q3-${height*.61} 1-${height}h10Q-2-${height*.48} 10 2Z`,"url(#paper)",wood,'stroke-width="1.7"');
    const brim=E(1,-height+4,width,9,glint,'opacity=".82"');
    const top=P(`M${-width} ${-height+3}q8 -${width*.63} ${width} -${width*.71}q${width*.65} 1 ${width} ${width*.7}Q2 ${-height+14} ${-width} ${-height+3}Z`,
      cap,glint,'stroke-width="1.6"');
    const base=y*.48+55;
    return placed(x,base,size,E(0,3,width*.61,6,"url(#shadow)")+
      E(0,-height+5,width*1.7,width*1.55,"url(#accent)",'opacity=".77"')+stalk+brim+top+
      N(6,i=>E(-width*.69+i*width*.26,-height-5-Math.sin(i*Math.PI/5)*9,2.1+i%3,1.6,glint,'opacity=".73"'))+
      N(5,i=>line(`M3 ${-height+5}l${(i-2)*9} 4`,wood,1,.5)),between(-10,10,random));
  }).join("");
  return E(0,17,194,54,"url(#shadow)")+
    undergrowth(p,"fungalMoss",-152,34,307,{shade:"#8ba471"})+mushrooms+
    line("M-150 42q87 23 162 3m41 8 83-27",glint,1.5,.43);
}

// A bolted hoist holds a worked block at different heights, with its rope returning to the winch.
function liftWinch(p,variant) {
  const height=[-38,-89,-121][variant];
  const block=[-40,12,47][variant];
  const crane="M-132 12l44-224 32-31 28 21-34 232Zm14-215 229-24 13 22-236 39Z";
  return E(0,15,179,29,"url(#shadow)")+
    P("M-152 7l270-14 41 23-46 20-261 2Z","url(#stone)",p.trim,'stroke-width="3.3"')+
    P(crane,"url(#oak)",wood,'stroke-width="5"')+material(p,"hoistGrain",crane,[-139,-247,274,270],"timber",1)+
    P("M-115-18l-32-8 93-134 24 7Zm48-123 130-69 12 7-139 93Z","url(#wood)",wood,'stroke-width="3.2"')+
    C(102,-211,21,"url(#brass)",`stroke="${wood}" stroke-width="3"`)+
    C(-86,-62,39,"url(#oak)",`stroke="${brass}" stroke-width="4"`)+
    N(6,i=>line(`M-86-62l${Math.cos(i*Math.PI/3)*33} ${Math.sin(i*Math.PI/3)*33}`,brass,2.4,.78))+
    line(`M-92-99l-1-99 193-22q31 9 7 26L${block} ${height-10}`,bone,3.2,.87)+
    T(block,height,P("M-43-8l43-10 42 16-3 45-70 9-15-18Z","url(#stone)",p.trim,'stroke-width="3.8"')+
      line("M-41-6L-2 9 40-2M-2 10v40m-23-58 13-27 13 18",bone,2.1,.68))+
    placed(124,16,.82,objects.rope[1](p),12)+placed(33,22,.69,objects.chisels[1](p),-5);
}

// The bridge has a continuous load-bearing deck and deep arch faces on separate piers.
function giantBridge(p,variant) {
  const deck=["M-219-63Q-49-136 221-91l14 28-454 69Z","M-228-57L193-147l36 28L-217-19Z","M-232-85Q-22-130 221-78l11 27Q-14-92-222-28Z"][variant];
  const crown=[-91,-118,-86][variant];
  const span="M-224 20v-94q221-93 456-29V20h-51v-48q-26-68-80-19-38 21-46 67H10q-14-92-82-69-46 12-57 69Z";
  return E(0,20,250,33,"url(#shadow)")+
    ashlar(p,"bridgeMasonry",span,[-235,-156,472,192],{cell:57,course:29})+
    P(span,"none",shade,'stroke-width="4.8"')+
    P(deck,"url(#stone)",p.trim,'stroke-width="4"')+
    line("M-217-32q213-85 448-47m-451 69q210-88 451-48",bone,2.2,.62)+
    N(6,i=>T(-199+i*78,crown+Math.abs(i-4)*7,P("M-9 4v-25l18-5 3 26Z","url(#stone)",p.trim,'stroke-width="2"')))+
    cavernRock(p,-195,15,.92,-8)+cavernRock(p,203,16,.96,11);
}

// Small serving pieces establish the scale of the Jarl's cut-stone table.
function giantSeat(p,variant) {
  const top=["M-195-85l312-38 95 44-78 51-316 18-41-30Z","M-196-68l87-44 225-13 86 49-73 45-279 14Z","M-212-84l64-29 307-17 49 34-23 54-372 31-34-38Z"][variant];
  return E(0,16,240,47,"url(#shadow)")+
    P("M-179 21l17-83 59-4 5 81-37 23Zm239-13 19-71 59-5 18 79-41 19Z","url(#stone)",p.trim,'stroke-width="5"')+
    P(top,"url(#stone)",p.trim,'stroke-width="4.8"')+
    material(p,"jarlTable",top,[-227,-135,444,125],"stone",.88)+
    P("M-196-48l27 17 317-24 59-32-9 26-54 28-311 24-30-18Z","url(#recess)",p.trim,'stroke-width="3.2"')+
    E(46,-74,75,24,"url(#brass)",'stroke="#e4b478" stroke-width="4"')+
    E(46,-75,58,16,"url(#recess)",'stroke="#b38865" stroke-width="2.6"')+
    placed(-62,-56,1.46,objects.urn[1](p),-6)+placed(103,-48,1.26,objects.horn[1](p),8)+
    placed(-136,-41,.73,objects.flask[1](p),-12)+T(42,-77,crest(p,["sun","tower","wing"][variant],.5));
}

// Uprights carry the canopy and goods sit on a planked counter.
function marketStall(p,variant) {
  const canopies=[
    "M-163-180l40-64 247-7 41 62-28 29-276 5Z",
    "M-167-187q28-65 149-65 141 0 187 60l-34 23-273 15Z",
    "M-172-184L-37-252l156 22 56 46-22 21-306 2Z",
  ];
  const cloth=canopies[variant];
  const goods=[
    placed(-77,-47,1.27,objects.urn[1](p),-7)+placed(44,-44,1.07,objects.vials[1](p))+placed(105,-41,.78,objects.flask[1](p),9),
    placed(-75,-41,1.28,objects.basket[1](p),-7)+placed(37,-43,1.13,objects.herbs[1](p),7)+placed(111,-44,.89,objects.mortar[1](p)),
    placed(-85,-44,1.19,objects.books[1](p),4)+placed(31,-45,.94,objects.scales[1](p))+placed(111,-42,1.09,objects.folio[1](p),-13),
  ][variant];
  return E(0,19,198,41,"url(#shadow)")+
    P("M-144 19v-220h16l3 224Zm270-3v-223h15l9 220Z","url(#oak)",wood,'stroke-width="4"')+
    P(cloth,"url(#fabric)",brass,'stroke-width="3.2"')+
    clipped("stallCanopy",cloth,N(11,i=>line(`M${-160+i*32} -254q22 55 -18 105`,i%2?"#e0a97d":p.bright,i%2?2:10,.47)))+
    P("M-165-178Q-1-155 164-191l-11 37-28 10-28-8-35 16-36-14-30 13-30-10-33 9-23-11-32 8-28-12Z",mix(p.mid,"#8e584f",.45),wood,'stroke-width="3.2"')+
    P("M-149-55l292-12 27 24-30 15-287 11-25-17Z","url(#oak)",wood,'stroke-width="4"')+goods+
    P("M-149-19l289-11-5 47-276 14Z","url(#wood)",wood,'stroke-width="3.8"')+
    line("M-143-8l277-11m-274 25 271-9m-269 18 268-9",brass,1.5,.57)+
    placed(139,-87,.7,objects.lantern[1](p));
}

// A ring of rough stones contains a layered fire. A different tripod or set of cookware changes the campsite.
function campfire(p,variant) {
  const flames=[
    "M-58-7Q-96-45-43-67Q-14-87-22-135Q25-100 19-73Q43-88 41-107Q85-68 57-23L32-1Z",
    "M-58-8Q-82-49-48-59Q-31-72-43-103Q-12-98-7-81Q20-123 9-150Q64-106 37-70Q77-72 67-33L42 5Z",
    "M-68-4Q-99-46-55-58Q-39-80-42-91Q-14-94-5-63Q9-103 39-117Q28-83 49-65Q86-68 67-27l-38 30Z",
  ][variant];
  const cooking=variant===1 ?
    line("M-97 4L-1-154 101 6M-1-153l-28 120",brass,5,.87)+placed(-29,-36,.86,objects.cauldron[1](p)) :
    placed(111,8,1.04,objects.flask[1](p),-10)+placed(-118,8,.93,objects.lantern[1](p),8);
  return E(0,-25,228,112,"url(#ember)",'opacity=".87"')+
    N(12,i=>{const theta=i*Math.PI/6; return cavernRock(p,Math.cos(theta)*97,Math.sin(theta)*30+6,.35+i%3*.045,i*9-35);})+
    P("M-68 0l141-30 6 16-139 29Zm131 3-131-28 7-15 138 25Z","url(#bark)",wood,'stroke-width="3.4"')+
    P(flames,"#d87c5d","#ffc17f",'stroke-width="2.9"')+
    P("M-30-4Q-52-37-11-50Q3-58 7-90Q36-59 26-37Q48-48 44-27L25-1Z","#ffd88d",bone,'stroke-width="1.6"')+
    cooking+sparks(p,-2,-61,29,"#ffcf84");
}

// An empty trap has bent slats and a sprung latch. Damage stays part of the object.
function snappedSnare(p,variant) {
  const bends=[41,-9,19];
  const angle=bends[variant];
  const bars=N(9,i=>{
    const x=-121+i*30, y=-144+Math.abs(i-4)*8;
    return line(`M${x} ${y}q${i%2?angle:-angle} 56 ${i%3*8-9} 112`,"url(#steel)",5.2,.92);
  });
  return E(0,18,196,40,"url(#shadow)")+
    P("M-146 3l32-37 234-8 53 34-22 21-281 14Z","url(#oak)",wood,'stroke-width="4.3"')+
    P("M-128-21v-122l22-22 223-10 28 18-10 123Z","url(#recess)",p.trim,'stroke-width="5" opacity=".79"')+
    bars+
    line("M-131-137l268-17m-263 95 255-17m-258-69-5 124m269-135-12 116",brass,4,.84)+
    P("M-21-166l56 29 36-17-20 40-59 8-33-18Z","url(#oak)",wood,'stroke-width="3.3"')+
    P("M-22 8l62-19 46 13-37 15-63 10Z","url(#steel)",p.trim,'stroke-width="3"')+
    placed(105,20,.86,objects.rope[1](p),-12)+placed(-135,14,.84,objects.shield[1](p),19);
}

// Threads tie to visible rock edges. The centre and gaps shift among different web structures.
function webbedPassage(p,variant) {
  const anchors=[[-145,-22],[-112,-157],[-46,-203],[48,-223],[129,-151],[160,-33],[86,8],[-45,12]];
  const centres=[[-38,-87],[34,-116],[25,-56]];
  const [cx,cy]=centres[variant];
  const arch="M-179 14l9-129 54-54 59-36 103-32 65 24 50 70 25 137-54 19-13-127-33-50-37-12-90 24-65 30-29 48-4 85Z";
  const random=p.stream("web tears");
  const ribs=anchors.map(([x,y],i)=>line(`M${cx} ${cy}Q${(x+cx)*.5+between(-9,9,random)} ${(y+cy)*.5+11} ${x} ${y}`,i%3?p.trim:bone,i%3?1.5:2.5,.81)).join("");
  const rings=N(7,j=>strokes(anchors.length,i=>{
    if((i+j*2+variant)%13===0) return "";
    const [x1,y1]=anchors[i], [x2,y2]=anchors[(i+1)%anchors.length];
    const s=.23+j*.108;
    const x=cx+(x1-cx)*s, y=cy+(y1-cy)*s, endX=cx+(x2-cx)*s, endY=cy+(y2-cy)*s;
    return `M${x} ${y}Q${(x+endX)/2} ${(y+endY)/2+8+j} ${endX} ${endY}`;
  }));
  return E(0,5,190,36,"url(#shadow)")+
    P("M-147 10l7-130 105-72 92-16 75 53 27 151Z","url(#recess)",shade,'stroke-width="6"')+
    P(arch,"url(#stone)",p.trim,'stroke-width="4.2"')+
    material(p,"webbedRock",arch,[-180,-243,372,263],"stone",.86)+
    ribs+line(rings,bone,1.4,.66)+
    cavernRock(p,-128,14,.69,-12)+cavernRock(p,143,10,.73,15)+
    undergrowth(p,"webRoots",-142,7,280,{shade:"#687969"});
}

// Water chemistry is shown by a scoured mineral rim, reflections and local bubbling.
function acidPool(p,variant) {
  const shapes=[
    "M-184 10Q-151-73-62-79Q41-89 166-52L185-1Q127 41 23 48Q-97 49-184 10Z",
    "M-176 16Q-128-40-45-53Q33-119 162-65Q177-40 146-6Q56 38-33 48Z",
    "M-180-2Q-131-73-21-63Q38-92 127-63Q157-49 172 5Q154 56 24 46Q-126 52-180-2Z",
  ];
  const pool=shapes[variant];
  const tints=["#a6c76f","#78c3a9","#d6ce7e"];
  const colour=tints[variant], random=p.stream("seeping minerals");
  const water=clipped("acidSurface",pool,P(pool,"url(#water)")+
    E(17,-22,172,77,"url(#accent)",'opacity=".69"')+
    N(12,i=>line(`M${-170+i*19} ${-66+i*9}q54 -${3+i%4*2} ${57+i%4*19} 1`,colour,1.75,.38))+
    N(21,i=>E(between(-174,165,random),between(-75,36,random),i%6+3,i%4+1.5,"none",`stroke="${colour}" stroke-width="1.35" opacity=".62"`)));
  return E(0,21,212,54,"url(#shadow)")+
    P(pool,"url(#stone)",p.trim,'stroke-width="16"')+water+P(pool,"none",colour,'stroke-width="2.7"')+
    cavernRock(p,-146,0,.66,-13)+cavernRock(p,147,8,.76,12)+
    placed(82,-62,.8,objects.crystals[1](p),-14)+placed(-108,-28,.76,objects.stones[1](p));
}

// The split follows the side of a real tank. Liquid travels down the broken seam into the floor puddle.
function brokenVat(p,variant) {
  const barrels=[
    "M-98-140q11-44 92-46 77 1 93 36L81-12q-90 33-173 1Z",
    "M-105-155l35-29 134-6 38 37-17 146-169 3Z",
    "M-113-147q50-57 114-24 66-30 112 24L99-12Q11 22-101-7Z",
  ];
  const tank=barrels[variant], spill=["M13-106q-18 34 5 53t-4 49q63-3 126 25-113 27-209 4 17-18 49-26-22-56 33-105Z","M-12-126q31 31 17 56t17 58q102 7 137 42-79 16-176 7-112-4-120-29 49-15 88-5-5-69 37-129Z","M36-120q-37 49-16 81L8-8q97 4 164 31-110 38-258 8 24-29 66-36 11-62 56-115Z"][variant];
  return E(0,15,197,32,"url(#shadow)")+
    P(tank,"url(#brass)",wood,'stroke-width="4.4"')+
    material(p,"crackedVatMetal",tank,[-115,-201,232,222],"stone",.8)+
    E(-4,-152,99,24,"url(#recess)",'stroke="#bb9872" stroke-width="3.6"')+
    line("M-99-127Q-17-97 94-130M-96-39Q-13-9 85-43m-155-104 8 123m123-126-8 119",brass,3.7,.78)+
    P(spill,"url(#water)",p.bright,'stroke-width="2.9"')+
    clipped("vatFlow",spill,E(32,7,139,71,"url(#accent)")+
      line("M-56 20q89-17 191 3M4-91q-8 32 3 59",p.bright,2.8,.73))+
    placed(104,-4,.72,objects.vials[1](p),23)+placed(-123,3,.76,objects.flask[1](p),-42);
}

// Green seepage drains through visible holes and spreads around the intact lower grate.
function seepage(p,variant) {
  const arch="M-120 8v-104q0-58 120-103 122 45 120 102V8Z";
  const gaps=["M-74-29l26-24-6-43 25-21-4 61-19 29Z","M-28-88l19-32 22 20 30-13-16 38-33 20Z","M36-116l27 15-13 30 19 26-21 32-21-40Z"][variant];
  const spill="M-53-12q34-22 108 2l67 37Q39 68-91 37l-41-17Z";
  return E(0,14,191,28,"url(#shadow)")+
    ashlar(p,"drainStone",arch,[-123,-204,250,215],{cell:42,course:29})+
    P("M-91 4v-91q0-46 91-83 91 37 91 83V4Z","url(#recess)",p.trim,'stroke-width="4"')+
    N(8,i=>{
      const x=-82+i*23, y=-95-Math.sin(i*Math.PI/7)*48;
      return line(`M${x} ${y}L${x-1} -8`,"#7d9189",5.3,.93)+
        line(`M${x+2} ${y+4}v${-y-19}`,"#b1be9f",1.1,.76);
    })+
    line("M-84-54H81M-91-14H90",brass,3.3,.71)+
    P(gaps,"url(#recess)","#91ad73",'stroke-width="2.2"')+
    line(`M${[-49,-7,51][variant]} -63q-13 18 1 29v23`,p.bright,2.6,.65)+
    P(spill,"url(#water)",p.bright,'stroke-width="2.2"')+
    clipped("drainStreaks",spill,N(9,i=>line(`M${-77+i*17} ${-14+i%4*7}q${(i-3)*2} 18 ${i%2?12:-8} 38`,p.bright,1.55,.56)))+
    E(8,6,111,50,"url(#accent)",'opacity=".61"')+
    placed(-111,7,.75,objects.chain[1](p),-9)+placed(128,11,.68,objects.stones[1](p),14);
}

// Pads float inside the basin and stems rise from its muddy edges.
function lilyBed(p,variant) {
  const shore=[
    "M-167 1Q-116-63-23-67Q90-76 172-15Q138 30 70 38-86 57-167 1Z",
    "M-168 14Q-136-48-57-55Q-8-68 53-53Q128-48 166-4Q130 54-6 46-123 56-168 14Z",
    "M-171 9Q-102-22-61-65Q18-74 127-58l42 45Q149 31 64 45-75 58-171 9Z",
  ][variant];
  const green=["#92a966","#80b389","#a8b877"][variant], bloom=["#d4a4ce","#eacda4","#d79a9b"][variant];
  const random=p.stream("floating leaves");
  const leaves=N(22,i=>{
    const x=between(-147,149,random), y=between(-56,37,random), scale=.49+(y+57)/150;
    return placed(x,y,scale,P("M2-2l23-12q-3-11-28-8-35 3-35 14 1 17 33 22 27 3 31-13Z",green,p.deep,'stroke-width="1.9"')+
      line("M0-1l-30-5m30 5-17 12m17-12 7 10",p.bright,1.1,.65)+
      (i%5===0?N(6,j=>G(E(0,-13,4,10,bloom,'stroke-width="1"'),`transform="rotate(${j*60} 0 -6)"`))+C(0,-6,3.5,brass):""),between(-22,22,random));
  });
  return E(1,11,194,49,"url(#shadow)")+
    P(shore,"url(#water)",p.trim,'stroke-width="4.3"')+
    clipped("lilySurface",shore,N(9,i=>line(`M${-164+i*14} ${-52+i*12}q87 3 195 1`,p.bright,1.2,.49))+leaves)+
    undergrowth(p,"lilyReeds",-151,-14,117,{shade:green,wet:true})+
    undergrowth(p,"lilyEdge",83,3,102,{shade:green,wet:true});
}

// Weathered grave markers and candles share a low stone footing.
function graveLamps(p,variant) {
  const markers=[
    "M-68 4v-127q0-60 68-76 68 16 68 76V4Z",
    "M-70 5v-138l49-52 43 1 47 54V5Z",
    "M-57 3l-9-151 31-39 82 5 23 42L56 6Z",
  ];
  const grave=markers[variant];
  const inscriptions=["M0-145v75m-22-48h44m-39 61h35","M-20-127q20-41 43-4-21 22-43 4Zm2 27q19 7 36 0","M-21-124l20-28 23 25-22 29-21-26m0 37h42"];
  return E(3,17,173,42,"url(#shadow)")+
    P("M-123 2l251-13 22 19-19 16-248 11-27-16Z","url(#stone)",p.trim,'stroke-width="4"')+
    P(grave,"url(#stone)",p.trim,'stroke-width="4.1"')+material(p,"graveMarker",grave,[-73,-208,147,220],"stone",.87)+
    line(inscriptions[variant],p.bright,2.4,.63)+line("M-65-67l15-12 4-38m100 15-17 13 10 29",shade,3.6,.82)+
    N(4,i=>line(`M${-26-i*3} ${-48+i*7}l${50+i*5} -1`,p.trim,1.5,.51))+
    candle(p,-112,-7,.9)+candle(p,108,-1,.87)+candle(p,-93,8,.68)+
    placed(91,7,.72,objects.flowers[1](p),17);
}

// Ice fills the edges of the claw marks on the exposed eyrie ledge.
function iceClawLedge(p,variant) {
  return clawLedge(p,variant,true);
}

// The gate is carved for offerings. Its relief and fallen stone change with the seed.
function tributeGate(p,variant) {
  const gate="M-142 12v-127l42-67 48-40 62-15 59 21 54 68 16 169-67-9-5-142-31-52-37-19-51 19-35 52v143Z";
  const relief=[
    "M-37-199q28-17 67-7l-45 16Zm13 13q28-14 62-10l-41 16Z",
    "M-32-200l19-17 18 20 16-20 21 16-12 19h-47Z",
    "M-47-197q49-33 92 1-51-7-92-1Zm31 1 18-18 18 18-18 13Z",
  ][variant];
  return E(0,17,206,44,"url(#shadow)")+
    ashlar(p,"tributeGateStone",gate,[-146,-242,298,275],{cell:53,course:32})+
    P(gate,"none",p.trim,'stroke-width="4.5"')+
    E(7,-108,171,130,"url(#ember)",'opacity=".58"')+
    P(relief,"url(#brass)",brass,'stroke-width="2.8"')+
    P("M-104-39l185-13 31 30-23 18-181 7-42-17Z","url(#stone)",p.trim,'stroke-width="3.3"')+
    line("M-112-8l215-8m-205 19 196-8",bone,2.2,.61)+
    placed(-31,-22,1.15,objects.coins[1](p),-14)+placed(45,-19,.84,objects.reliquary[1](p),17)+
    cavernRock(p,-145,11,.7,-12)+cavernRock(p,131,17,.71,14);
}

// Labels describe the actual changes in the focal drawing for the review gallery.
export const habitatFeatures = Object.freeze({
  trailPrints:[trailPrints,["split hoofprints","padded tracks","three-toed prints"]],
  rockDen:[rockDen,["high scree den","angled den","low rock shelter"]],
  sunGate:[sunGate,["pointed sun gate","round sun gate","faceted sun gate"]],
  hoard:[hoard,["locked treasure chest","shield and blade","golden idol"]],
  clawLedge:[clawLedge,["vertical claw cuts","swept claw cuts","diagonal claw cuts"]],
  iceClawLedge:[iceClawLedge,["frosted vertical cuts","swept ice cuts","diagonal ice cuts"]],
  tributeGate:[tributeGate,["claw relief","bronze crown relief","eye relief"]],
  scorchedTower:[scorchedTower,["broken west crown","split tower crown","burned east wall"]],
  fungalRing:[fungalRing,["fairy ring","ascending fungal trail","terraced mushroom bed"]],
  liftWinch:[liftWinch,["lowered stone block","raised stone block","high pulley load"]],
  giantBridge:[giantBridge,["bowed bridge deck","inclined bridge deck","crowned bridge deck"]],
  giantSeat:[giantSeat,["long stone feast table","wide serving slab","chamfered feast table"]],
  marketStall:[marketStall,["pottery stall","herb stall","books and scales stall"]],
  campfire:[campfire,["banked campfire","tripod and cookpot","open travelling fire"]],
  snappedSnare:[snappedSnare,["bowed cage bars","sprung inner latch","twisted cage front"]],
  webbedPassage:[webbedPassage,["westward web hub","high web hub","low web hub"]],
  acidPool:[acidPool,["broad mineral pool","narrow bubbling seep","round acid basin"]],
  brokenVat:[brokenVat,["split copper vat","faceted alchemy tank","double-lobed vat"]],
  seepage:[seepage,["left grate breach","central grate breach","right grate breach"]],
  lilyBed:[lilyBed,["wide lily basin","split reed bank","curved lily pool"]],
  graveLamps:[graveLamps,["rounded grave marker","angular grave marker","weathered headstone"]],
});
