import { P,E,C,G,T,N,line,placed,archD } from "./environment.mjs";
import { anvil,candle,cavernRock,chain,crest,luminous,pole,shield,sheet,sparks,sword } from "./props.mjs";
import { between } from "./vector.mjs";
import { ashlar,clipped,material,strokes } from "./location-surfaces.mjs";
import { objects } from "./location-objects.mjs";

const gold="#dec291", highlight="#f1dcc0", wood="#a27359", steel="#a5afba", dark="#241f30";

// A splayed reading stand carries the book above eye level in the crop. Pages curve from one sewn spine.
function lecternBook(p,v) {
  const left="M-131-127Q-75-147 0-114L0-45Q-61-80-145-64Z";
  const right="M0-114Q71-150 134-128L149-67Q70-82 0-45Z";
  const stand=P("M-42 8L-31-59 21-67 42-8 71 0 67 17H-68l-1-14Z","url(#oak)",wood,'stroke-width="3"')+
    P("M-151-59L141-77 168-57 156-44-148-41-167-48Z","url(#wood)",wood,'stroke-width="3"')+
    line("M-152-53l309-9m-177 12 8 51m43-55 12 51m-91 4 87-3",gold,1.7,.56);
  const gilding=v===0?"M0-17a17 16 0 1 0 0 32a17 16 0 1 0 0-32M-26 0h52m-26-24v48":
    v===1?"M0-27l25 25-25 29-25-29Z M-25-2H25M0-27v54":
      "M-22 15L0-24 24 15Z M-13-2h26m-13-17v34";
  return stand+
    P("M-153-126Q-63-153 1-120Q73-152 145-126l17 66Q76-61 0-39Q-67-69-158-56Z","url(#leather)",wood,'stroke-width="4"')+
    P("M-144-121Q-71-148 0-114Q73-147 135-128l15 65Q68-72 0-43Q-70-75-149-61Z","url(#paper)",gold,'stroke-width="3"')+
    P(left,"url(#paper)",gold,'stroke-width="2"')+P(right,"url(#paper)",gold,'stroke-width="2"')+
    line("M0-113v64M-137-66Q-68-83 0-52Q66-80 147-70M-140-61Q-68-76 0-47Q66-76 147-64",wood,1.7,.75)+
    N(13,i=>line(`M${-112-i*.58} ${-123+i*3.9}q43-6 88 13`,i%4===0?"#8d5148":"#79584d",i%4===0?1.65:1.12,.7)+
      line(`M16 ${-108+i*3.2}q18-10 37-13`,"#7b534d",1.1,.59))+
    T(94,-102,line(gilding,"#85565d",1.6,.92)+C(0,0,4,"url(#brass)"))+
    P("M-7-51Q8-27 35-13l-15 3-4 10Q0-14-12-35Z","#924953",gold,'stroke-width="1"');
}

// The engraved disk is held by an axle and pedestal, with individually turned brass rings.
function astrolabe(p,v) {
  const tilt=[-22,13,-7][v%3];
  const rings=G(
    C(0,0,92,"url(#brass)",`stroke="${gold}" stroke-width="3"`)+
    C(0,0,79,"url(#recess)",`stroke="${gold}" stroke-width="3"`)+
    N(72,i=>G(line("M0-80v-8",i%6===0?highlight:"#5d4148",i%6===0?1.9:.8,.84),`transform="rotate(${i*5})"`))+
    E(0,0,72,27,"none",`stroke="${gold}" stroke-width="4.3" transform="rotate(${v===1?40:56})"`)+
    E(0,0,69,34,"none",`stroke="${highlight}" stroke-width="2.7" transform="rotate(${v===1?-33:-49})"`)+
    line("M-70 0H69m-70 0 1-64M0 0l36 59",gold,2.3,.84)+
    C(0,0,23,"url(#brass)",`stroke="${gold}" stroke-width="2"`)+
    P("M-17 8Q-10-16 11-17Q5-4 18 12Q2 21-17 8Z",p.bright,"none",'opacity=".63"')+
    C(0,0,5,"url(#steel)"),
    `transform="rotate(${tilt}) scale(1 .86)"`);
  return P("M-86 9l30-20H55l30 20-12 11H-74Z","url(#oak)",wood,'stroke-width="3"')+
    P("M-38-10l16-32 8-98h25l7 98 20 32Z","url(#brass)",gold,'stroke-width="2.5"')+
    T(0,-119,rings)+
    line("M-47-12q-25-52-18-105m113 106q26-51 18-106",gold,5,.84)+
    N(7,i=>line(`M-34 ${i*2-9}h67`,highlight,.9,.39));
}

// The ward rises from the emitting object. It casts a real wash onto the desk and pages.
function runeBook(p,v) {
  const glyph=[
    "M0-87l68 36v78L0 67-68 27v-78Z M0-68l46 64-46 52-48-52Z M-68 27L68-51M68 27L-68-51",
    "M-76 0a76 73 0 1 1 152 0 76 73 0 1 1-152 0Z M0-61l54 88H-54Z M0 61l54-88H-54Z",
    "M-95 28Q-58-66-5-35Q35-12 82-77M-88 48Q-37-24 6 2Q43 27 90-48M-103-61Q-45-10-29 30Q-5 70 40 54Q81 37 106-6"
  ][v%3];
  const colour=["#d9b2ff","#99eee0","#a6caff"][v%3];
  const runes=N(13,i=>G(line(i%3===0?"M0-88l-6-9 6-8 6 8Z":"M-5-92l10-8m-5-7v17",colour,1.55,.88),
    `transform="rotate(${i*360/13})"`));
  return E(0,-155,151,159,"url(#magic)")+
    lecternBook(p,v)+
    T(0,-190,luminous(glyph,colour,2.65,.91)+runes)+
    luminous("M-12-105Q-47-149-9-152q27-6 40-31",colour,2.2,.78);
}

// The workpiece lies on the anvil; the rune is etched into that specific shape.
function runeAnvil(p,v) {
  const glyph=["M-108-85l28 15 11-8 13 10 15-8 15 11 13-7 17 11 24-3",
    "M0-130l37 35-37 37-36-37Z M-36-95h73M0-130v72",
    "M-78-130l21 15 16-18 14 13 21-14 22 13 21-16 24 13m-139 33 19 13 18-16 19 15 15-17 22 15 19-15 22 13"][v%3];
  const piece=v===0?placed(-12,-45,1.04,sword(p,"long"),56):
    v===1?placed(0,-97,1.06,shield(p,"round"),-5):
    P("M-100-149L78-153 96-130 99-58-86-54-110-76Z","url(#stone)",p.trim,'stroke-width="4"')+
      line("M-96-139l164-5 19 19 4 60-172 4-17-17Z",gold,1.8,.76);
  return P("M-103-34L94-40l27 23-16 19-212 9-19-19Z","url(#oak)",wood,'stroke-width="3"')+
    anvil(p,0,-19,1.28)+piece+
    E(3,-97,146,105,"url(#ember)",'opacity=".67"')+
    luminous(glyph,"#ffb978",2.65)+
    placed(83,-71,.84,objects.hammer[1](p),-35)+sparks(p,33,-79,35,"#ffbf87");
}

// Stacked standing stones show different carved faces. The near stone casts shadow down the plinth.
function runeMonument(p,v) {
  const stone="M-115 11L-106-108-87-206-44-237 56-239 97-207 107-105 125 10Z";
  const arc=["M-68-117Q0-199 68-117Q24-79 0-82Q-43-86-68-117Z M0-180v97m-43-57h86",
    "M0-194l68 68-68 63-69-63Z M-51-127h104M0-194v131",
    "M-63-163l23 28 18-33 22 31 20-31 21 28 23-30M-64-99l21 23 22-25 20 26 21-27 24 25 22-26"][v%3];
  return E(0,20,166,28,"url(#shadow)")+
    P("M-141-12L123-26 149-3 125 22-125 28-153 10Z","url(#stone)",p.trim,'stroke-width="3"')+
    P(stone,"url(#stone)","#332b3a",'stroke-width="5"')+
    P("M-104-108L-87-206-44-237-57-206-71-94-78 13-115 11Z",p.mid,p.trim,'stroke-width="1.8" opacity=".73"')+
    material(p,"runeVeins",stone,[-117,-240,242,250],"stone")+
    line("M-89-193l37 23 22-7m110 23-18 11-14 36m-133 35 18 12 27-6m80 33 51-24",p.deep,2.7,.82)+
    E(4,-126,138,151,"url(#magic)",'opacity=".59"')+
    luminous(arc,p.bright,3.3,.91)+
    N(7,i=>line(`M${-72+i*23} -43l5-9 5 8-5 8Z`,p.bright,1.2,.72));
}

// Four leaves of lead, glass, and dark aperture create a real mechanical seal.
function hiddenEntry(p,v) {
  const outline=archD(247,232)+"Z";
  const depths=P(outline,"url(#recess)",dark,'stroke-width="17"')+
    T(31,-54,P(archD(106,151)+"Z","url(#night)",p.deep,'stroke-width="5"')+
      E(-5,-88,71,86,"url(#ember)",'opacity=".52"'))+
    N(8,i=>P(`M${-99+i*7} ${-12-i*17}l${202-i*13} -8-2 10-${195-i*13} 11Z`,
      "url(#stone)",p.trim,'stroke-width="1.25"'));
  const masonry="M-127 5V-136Q-108-182-75-207L25-174 36 4Z";
  const stone=ashlar(p,"hiddenSlab",masonry,[-128,-209,168,228],{cell:59,course:32})+
    P(masonry,"none",p.trim,'stroke-width="3"')+
    E(20,-76,6,9,"url(#brass)",`stroke="${gold}"`);
  const cabinetDoor=P("M-122 0V-188l15-17 141 33V0Z","url(#oak)",wood,'stroke-width="4"')+
    N(5,i=>T(-112,-168+i*35,line("M0 0l144 24",gold,4.8,.74)+
      N(4,j=>placed(16+j*30,-6+j*5,.35,objects.flask[1](p)))))+
    line("M-115-196L28-167M-109-171V-6",gold,2,.66);
  const ironDoor=P("M-120 4V-127Q-89-180-22-216L96-159V-8Z","url(#recess)",steel,'stroke-width="4" opacity=".71"')+
    N(11,i=>line(`M${-116+i*20} ${-128-Math.sin(i/11*Math.PI)*71}V${-4-i*.7}`,"url(#steel)",5.4,.93))+
    line("M-118-97L91-121M-117-44L91-65",steel,3,.83);
  return depths+[stone,cabinetDoor,ironDoor][v%3]+
    line(archD(279,254),"url(#stone)",20)+line(archD(296,262),p.trim,2,.67)+
    P("M-116-9L101-11l40 25-300 18Z",p.time.colour,"none",'opacity=".21"');
}

// The skiff has a curved hull, gunwales and ribs. Reflections fall below the prow.
function skiff(p,v) {
  const hull="M-159-45Q-99-63 21-61Q94-62 153-117Q153-70 117-38Q59 8-75 5Q-129 0-159-45Z";
  return E(2,8,173,22,"url(#shadow)")+
    P(hull,"url(#oak)",wood,'stroke-width="4"')+
    P("M-144-44Q-83-61 22-58Q100-62 139-100Q112-61 65-43Q-21-14-144-44Z","#3a2831",wood,'stroke-width="2"')+
    N(10,i=>line(`M${-116+i*22} ${-49-Math.max(0,i-6)*4}q${i-7} 15 13 27`,gold,2,.58))+
    line("M-155-42Q-82-8 45-28Q126-42 151-104M-144-23Q-61 11 39-10Q99-21 128-55",gold,2.1,.73)+
    material(p,"skiffPlanks",hull,[-160,-119,316,127],"timber",.75)+
    (v%3===0?placed(-51,-39,.71,objects.crate[1](p),3):v%3===1?placed(-48,-42,.7,objects.barrel[1](p),10):
      placed(-46,-41,.66,objects.satchel[1](p),4))+
    P("M-95-13L64-106 82-113 92-108 83-97 66-99-90-7Z","url(#oak)",gold,'stroke-width="2"')+
    line("M-74 7q78 16 167-9m-121 19 69-3m-98 15 97-3",p.time.colour,1.9,.42);
}

// The lock mechanism is visible from the doorway side, with springs, bolt slots and tool contact.
function lockBench(p,v) {
  const housing="M-111-125L79-131 104-111V-28L77-6H-108Z";
  const form=v%3===0?"M-80-98h107l13 12-10 16H-80Z":v%3===1?"M-75-91l95-5 20 16-16 13-99 4Z":"M-83-75l107-39 13 15-16 20-98 22Z";
  return P("M-130-5L118-16 137-1 112 16-132 18Z","url(#oak)",wood,'stroke-width="3"')+
    P(housing,"url(#brass)",gold,'stroke-width="4"')+
    P("M-97-110L70-116 89-104V-35L64-19H-96Z","#494153",gold,'stroke-width="2.2"')+
    P(form,"url(#steel)",steel,'stroke-width="2.6"')+
    N(5,i=>line(`M${-82+i*16} -55h9v-20`,gold,2,.9))+
    C(37,-54,22,"url(#brass)",`stroke="${gold}" stroke-width="2.5"`)+
    P("M30-61a8 7 0 1 1 14 0l-4 5 6 10H29l5-10Z",dark)+
    N(6,i=>C(-94+i*35,i%2?-23:-108,3,"url(#steel)"))+
    line("M-132 6l172-58 36 8",steel,3,.9)+
    placed(104,-5,.56,objects.keys[1](p),16);
}

// An old woodland arch consists of two roots and a moss-covered lintel, leaving the vista open.
function livingArch(p,v) {
  const curve=v%3===0?"M-153 4Q-183-61-111-137Q-66-190 0-180Q91-184 144-120Q175-81 152 5":
    v%3===1?"M-152 4Q-190-76-106-132Q-27-195 33-188Q124-185 154-122Q189-59 151 5":
      "M-162 5Q-197-101-133-147Q-72-200-26-186Q67-202 137-141Q179-102 157 6";
  const random=p.stream("bough detail");
  const buds=strokes(150,i=>{
    const a=Math.PI*(i/149+.03),radius=between(124,186,random);
    const x=Math.round(Math.cos(a)*radius),y=Math.round(-Math.sin(a)*radius*1.07)-12;
    const width=between(4,15,random);
    return `M${x} ${y}q${width*.34} -6 ${width} -4q-${width*.36} 7-${width} 4Z`;
  });
  const leaves=v%3===1?"#d2a1a4":v%3===2?"#9aba83":"#789266";
  return E(0,8,178,34,"url(#shadow)")+
    line(curve,dark,48,.92)+line(curve,"url(#bark)",36)+line(curve,"#a0906f",3,.66)+
    line("M-146 4Q-161-24-195-31m45 30-46 18m352-14q3-37 39-54m-44 45 57 17M-133-95q-34-27-65-26m331 15 51-16",
      "url(#bark)",15,.92)+
    P(buds,leaves,"none",'opacity=".8"')+
    P(buds,"#bfd2a1","none",'opacity=".21" transform="translate(-4 -6)"')+
    line("M-160-14q-29-13-35-31m41 20-31 19m327-23q31-14 38-34",gold,2,.45);
}

// A spring is edged in masonry and reflected light. The fall bends over its source ledge.
function spring(p,v) {
  const source=[
    "M-53-136Q-66-109-55-82Q-47-51-82-21Q-52 8 29 5Q83-4 69-34Q39-52 56-91Q69-119 54-146Z",
    "M-71-115Q-85-87-57-72Q-39-49-76-27Q-62-10 31-6Q87-10 75-32Q50-52 68-76Q94-105 64-124Z",
    "M-41-149Q-61-110-29-84Q-9-64-43-42Q-83-17-72-5Q-18 12 61-9Q81-19 69-38Q48-59 61-89Q78-123 45-151Z",
  ][v%3];
  const cliff="M-179 11L-165-36-141-67-133-109-110-140-71-146-40-170 29-172 75-154 122-142 153-107 162-61 179-17 155 11Z";
  const water="#a7dce2", foam="#d4efea";
  const random=p.stream("spring spray");
  const seams=strokes(80,()=>{
    const x=between(-170,173,random),y=between(-167,5,random);
    return `M${x} ${y}l${between(7,29,random)} -${between(1,9,random)}`;
  });
  const falls=clipped("springCurrents",source,N(17,i=>{
    const x=-89+i*12,y=-163+(i%4)*12;
    return line(`M${x} ${y}Q${x+32} -95 ${x+10} -67Q${x-28} -38 ${x-9} 2`,i%3?water:foam,i%3?1.8:5.3,.27+(i%3)*.18);
  }));
  return P(cliff,"url(#stone)",dark,'stroke-width="4"')+
    P("M-155-35l18-64 31-35 35-8 38-26-38 52-22 23-10 48-22 38Z",p.mid,p.trim,'stroke-width="2"')+
    P("M57-160l57 23 29 38 16 38-45-13-26-47-52-35Z","#6e7971",p.trim,'stroke-width="1.5" opacity=".65"')+
    clipped("springStone",cliff,line(seams,p.trim,1.5,.48)+line(seams,"#132e37",1.3,.39).replace("/>",' transform="translate(0 2)"/>'))+
    P(source,"url(#water)",water,'stroke-width="1.7" fill-opacity=".94"')+falls+
    E(6,-9,144,29,"url(#water)",'stroke="#70a5ad" stroke-width="1.8"')+
    N(9,i=>line(`M${-49-i*11} ${-5+i*3}Q8 ${-29+i*3} ${56+i*10} ${-8+i*3}`,water,i%3?1.2:2.3,.48-i*.029))+
    P(strokes(68,()=>{
      const x=between(-73,78,random),y=between(-29,7,random),r=between(2,11,random);
      return `M${x} ${y}q${r*.34} -3 ${r} -1l-${r*.72} 2Z`;
    }),foam,"none",'opacity=".57"')+
    cavernStones(p);
}

function cavernStones(p) {
  return P("M-169 12l15-21 45-9 25 14-15 15Zm277-3 12-18 41 2 16 20-35 5Z","url(#stone)",p.trim,'stroke-width="2"');
}

// Living branches form a canopy over a small offering niche. A different offering anchors each seed.
function livingShrine(p,v) {
  const branch="M-161 19Q-130-18-133-62Q-131-128-92-170Q-72-194-42-217Q-15-224 12-206Q47-181 89-177Q127-169 167-135l-7 14q-62-31-103-39Q5-172-31-195Q-90-158-103-83Q-113-45-94 16Z";
  const random=p.stream("shrine leaves");
  const willow=N(24,i=>{
    const x=-110+i*12, y=-163+Math.abs(i-10)*2.7, reach=between(27,86,random);
    const droop=`M${x} ${y}q${i-14} 22 ${i-12} ${reach}`;
    return line(droop,"#829574",1.6,.63)+
      P(strokes(9,j=>`M${x+(i-12)*j/9} ${y+reach*j/9}q${j%2?14:-14} 0 ${j%2?8:-8} 7Z`),"#91a47d","none",'opacity=".68"');
  });
  const tribute=[objects.offering,objects.shells,objects.incense][v%3];
  return willow+P(branch,"url(#bark)",dark,'stroke-width="3"')+
    material(p,"shrineWood",branch,[-162,-229,337,256],"timber",.71)+
    line("M-144 10q29-54 21-88q3-77 79-126m1 17q47 27 95 29q49 5 95 25",gold,1.9,.54)+
    P("M-75-16L46-34 88-11 74 14H-68l-25-13Z","url(#stone)",p.trim,'stroke-width="3"')+
    placed(-3,-19,1.23,tribute[1](p))+
    candle(p,-67,-15,.49)+candle(p,56,-16,.51);
}

// Brass strings run over the bridge and through the body of the instrument.
function instrument(p,v) {
  const harp=P("M-112 5l13-24 24-11v-111q-10-43-35-34 10-43 52-22 44 32 99 2l47-18 21 16-30 42-76 125 70 7 26 28Z",
    "url(#brass)",gold,'stroke-width="4"')+
    P("M-66-34v-120q44 22 112-14l24-10-14 31-78 113Z","url(#recess)",wood,'stroke-width="3"')+
    N(14,i=>line(`M${-64+i*9} ${-34-i*9}v${-109+i*6}`,highlight,i%4?1:1.65,.88))+
    line("M-99-1h168M-102-176q28-16 52 15m78-6 50-29",gold,2.8,.8);
  const lute=P("M-99-24Q-119-58-83-89Q-60-109-32-94L67-191 87-174-9-75Q4-37-37-10Q-70 10-99-24Z",
    "url(#oak)",gold,'stroke-width="3.6"')+
    P("M-93-26Q-107-56-83-78Q-55-102-33-86Q-4-67-25-36Q-47-7-73-12Z","url(#paper)",wood,'stroke-width="2.5"')+
    C(-57,-55,18,"url(#oak)",`stroke="${gold}" stroke-width="2.8"`)+
    N(7,i=>line(`M${-75+i*2.7} ${-24-i*.8}L${68+i*2.1} ${-187+i*1.6}`,highlight,.95,.86))+
    N(6,i=>line(`M${-6+i*12} ${-86-i*11}l-11-10`,wood,2,.85));
  const viol=P("M-86-16Q-115-46-78-64Q-50-75-60-100Q-50-124-27-114L-2-97 53-177 70-165 18-82Q31-65 6-49Q-20-44-31-19Q-53 7-86-16Z",
    "url(#wood)",gold,'stroke-width="3.3"')+
    P("M-84-19Q-100-43-74-55Q-43-70-51-97Q-41-115-24-104L2-88Q20-73 11-66Q-21-58-36-24Q-55-3-84-19Z",
      "#986356",gold,'stroke-width="2"')+
    N(5,i=>line(`M${-69+i*3} ${-24-i*1.2}L${55+i*3} ${-172+i*2}`,highlight,.92,.86))+
    line("M-49-68q15-10 13 4m-6 13q-12 5-15-5M45-7L116-165",gold,2.5,.9);
  return E(0,5,146,20,"url(#shadow)")+
    P("M-125 7L-86-18H83l49 27-12 9-235 3Z","url(#oak)",wood,'stroke-width="3"')+
    [harp,lute,viol][v%3]+
    placed(91,-22,.51,sheet(p,104,75),-11);
}

// Armour and the weapon's points of support are readable as a display, including the rack below.
function armorialRack(p,v) {
  const rack=P("M-138 17L-131-190-116-207-104-200-116 17ZM118 17L107-194 121-205 135-196 144 17Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-127-155L128-169 130-149-128-135ZM-123-66l256-11 1 21-260 12Z","url(#wood)",wood,'stroke-width="3"')+
    N(12,i=>C(-113+i*21,-149-i*1.13,3,"url(#brass)"));
  const weapons=v%3===0?placed(-35,-73,.76,pole(p,"spear"),-27)+placed(33,-73,.76,pole(p,"spear"),27):
    v%3===1?placed(-50,-59,.96,sword(p,"long"),-13)+placed(59,-107,1.02,shield(p,"round"),7):
      placed(-43,-68,.78,pole(p,"axe"),-13)+placed(57,-100,.96,shield(p,"tower"),9);
  return E(0,18,156,27,"url(#shadow)")+rack+weapons+
    line("M-117-187l-8 197m258-7-11-192M-119-145l237-13",gold,1.7,.56);
}

// An iron gate either hangs from a windlass or bears its weight on angled hinges.
function wardGate(p,v) {
  const outline=archD(257,233)+"Z";
  const opening=P(outline,"url(#night)",dark,'stroke-width="12"');
  const grille=N(12,i=>{
    const x=-123+i*22, top=-119-Math.sin(i/11*Math.PI)*90;
    return P(`M${x} ${top}h8V-9l-4 17-4-17Z`,"url(#steel)",steel,'stroke-width="1.4"');
  })+line("M-125-116h252m-250 47h249m-249 43h249",steel,5.5,.78);
  const braces=N(3,i=>placed(-83+i*83,-79-i%2*34,.73,shield(p,i%2?"tower":"kite"),i%2?7:-8))+
    P("M-127-36h255v22h-255Z","url(#oak)",wood,'stroke-width="3"');
  const doors=N(2,i=>T(-65+i*130,0,
    P("M-61-7V-172l121-41V-6Z","url(#steel)",steel,'stroke-width="3"')+
    N(8,j=>line(`M${-54+j*15} ${-171-j*5}V-11`,"#504454",2.6,.91))+
    line("M-52-147l101-32m-98 150 105-30M-53-140L49-26",steel,4,.71)));
  return opening+[grille,braces,doors][v%3]+
    line(archD(274,248),"url(#stone)",24)+line(archD(297,262),p.trim,2.1,.68)+
    chain(-116,-258,14,1,.87)+chain(116,-261,14,-2,.87);
}

// Shields, horns and candles are installed on the monument rather than floating above its ground.
function oathAltar(p,v) {
  const crestType=["wing","sun","tower"][v%3];
  return E(0,15,166,32,"url(#shadow)")+
    P("M-154-66L136-77 161-47 142-29H-140l-28-14Z","url(#stone)",p.trim,'stroke-width="4"')+
    P("M-123-28H124L117 10H-119Z","url(#stone)",p.trim,'stroke-width="3"')+
    P("M-61-49L61-54 62 11 2 4-61 18Z","url(#fabric)",gold,'stroke-width="2.5"')+
    T(0,-17,crest(p,crestType,.65))+
    T(9,-113,E(0,0,142,136,"url(#sun)",'opacity=".53"')+
      P("M-87-54L0-87 87-54V39L0 75-87 39Z","url(#stone)",p.trim,'stroke-width="4"')+
      P("M-72-47L0-71 72-47V28L0 59-72 28Z","url(#oak)",gold,'stroke-width="2.6"')+
      crest(p,crestType,1.17))+
    placed(66,-46,.77,sword(p,"long"),58)+candle(p,-113,-48,.63)+candle(p,113,-52,.72);
}

// Stones, logs and rope all cross between raised banks. Rocks below the deck join each abutment to the shore.
function crossing(p,v) {
  const banks=placed(-157,18,.86,cavernRock(p,0,0,1),-7)+placed(178,-55,.69,cavernRock(p,0,0,1),8);
  if(v===2) {
    const stones=N(7,i=>{
      const x=-136+i*48, y=1-i*9, scale=1-i*.064;
      const top=i%2?"M-34 5l9-20 32-9 25 10 8 17-25 9Z":"M-33 0l16-17 31-4 24 17-3 15-45 7Z";
      return T(x,y,E(0,12,44*scale,8*scale,"url(#shadow)")+
        E(3,12,43*scale,7*scale,"none",`stroke="${p.trim}" stroke-width="1.1" opacity=".48"`)+
        placed(0,0,scale,P("M-33 0l14 12 48-7 8-7-4 18-23 9-32-3-13-11Z","url(#recess)",p.deep,'stroke-width="2"')+
          P(top,"url(#stone)",p.trim,'stroke-width="1.9"')+line("M-23-4l13-6 19 3 11-3",gold,1.4,.55)));
    });
    return banks+stones;
  }
  const edgeAt=i=>v===0 ? 5-i*4.55-Math.sin(i/16*Math.PI)*5 : 6-i*4.6+Math.sin(i/16*Math.PI)*11;
  const span=v===0?"M-181 5Q-85-27 5-34Q102-46 180-73L189-54Q112-26 18-9Q-84 14-172 34Z":
    "M-181 5Q-71-8 11-22Q90-39 179-73L188-52Q105-19 22 1Q-78 17-169 35Z";
  const decking=N(17,i=>{
    const x=-172+i*22, y=edgeAt(i);
    return line(`M${x} ${y}l10 23`,i%3?wood:gold,1.7,.68)+C(x+7,y+15,2.1,"url(#brass)");
  });
  const railing=v===1 ?
    line("M-176 24v-48m346-38v-33M-176-24Q-45-15 170-95M-174-5Q-58 6 168-75",wood,4.2,.94)+
    line("M-174-25Q-47-16 168-96",gold,1.45,.82) : "";
  return banks+P(span,"url(#oak)",dark,'stroke-width="4"')+
    material(p,"crossingGrain",span,[-190,-77,383,116],"timber")+
    clipped("crossingPlanks",span,decking)+line("M-171 32Q16-4 184-53",gold,1.55,.61)+railing;
}

// The deck runs from the gutter on the near house into the opposite landing. Different bracing
// and planking change the crossing while the two endpoints stay attached to the masonry.
function roofWalk(p,v) {
  const base=v===0?"M-169-6Q-39-23 14-38Q87-53 165-79L174-57Q84-30 17-12Q-59 12-166 23Z":
    v===1?"M-168-6L166-79 175-55-165 23Z":
      "M-169-6Q-52-21 19-51l146-28 11 24Q60-23 28-21q-83 29-194 46Z";
  const planks=N(18,i=>line(`M${-166+i*20} ${-9-i*4.25}l${i%3-1} 28`,i%3?wood:gold,2,.78));
  const railPosts=N(5,i=>T(-156+i*77,15-i*17.5,
    P("M-5 4v-43l8-3 4 43Z","url(#oak)",wood,'stroke-width="2"')));
  const lowerEdge=v===1?"M-164 24L173-56":"M-164 22Q22-2 172-56";
  const joint=P("M-174-8l33-5 4 10-31 9Zm311-67 31-10 4 10-31 10Z","url(#steel)",gold,'stroke-width="1.9"');
  return P("M-169 16l58 44 43-53-12 3-31 36-35-35Zm258-35 27 20 45-68-11 3-33 49-17-9Z","url(#oak)",wood,'stroke-width="2.4"')+
    P(base,"url(#oak)",dark,'stroke-width="3.7"')+
    material(p,"roofWalk",base,[-172,-86,351,116],"timber",.8)+
    clipped("walkwayPlanks",base,planks)+joint+railPosts+
    line("M-156-24Q0-46 152-96M-156-11Q0-32 152-84",wood,3.6,.92)+line(lowerEdge,gold,1.6,.63);
}

export const physicalFeatures=Object.freeze({
  roofWalk,livingShrine,
  lecternBook,astrolabe,runeBook,runeAnvil,runeMonument,hiddenEntry,skiff,lockBench,livingArch,spring,
  instrument,armorialRack,wardGate,oathAltar,crossing,
});
