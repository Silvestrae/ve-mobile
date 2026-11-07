import { P,E,C,G,T,N,line,placed,archD } from "./environment.mjs";
import { candle,crest,lantern,luminous,pole,sheet } from "./props.mjs";
import { ashlar,clipped,material } from "./location-surfaces.mjs";
import { objects } from "./location-objects.mjs";

const brass="#dfb981", glint="#f3dcb0", wood="#a7785b", silver="#aab5c4", shade="#201b2c";

// A working invention uses pins, joins and a rail. Each insert has a different job and silhouette.
function enchantingRig(p,v) {
  const lens=(x,y,r,tilt)=>placed(x,y,1,
    E(0,0,r,r*1.36,"url(#brass)",`stroke="${brass}" stroke-width="3.4"`)+
    E(3,0,r*.83,r*1.19,"url(#glass)",`stroke="${p.bright}" stroke-width="2.5"`)+
    line(`M${-r*.41} ${-r*.92}q-11 12 -12 25m35 12q12-11 11-21`,"#def8e5",2,.78)+
    line(`M${-r*.44} ${r*1.17}l-9 41h40l-8-41`,brass,5.4,.88),tilt);
  const base=P("M-158 0L127-11 153 11 130 28-144 29-166 18Z","url(#oak)",wood,'stroke-width="3.2"')+
    line("M-152 9l282-9 17 13-280 12Z",brass,1.8,.64)+
    N(12,i=>C(-130+i*24,i%2?5:18,2.4,"url(#steel)"));
  const optic=line("M-121-49L104-116","url(#brass)",8,.85)+lens(-97,-54,25,-15)+lens(-13,-78,34,-17)+lens(80,-111,39,-14)+
    luminous("M-119-46L126-126","#a9f3dd",2.4,.76);
  const arm=P("M-138 9L-116-29-66-44-48-81-71-109-48-136-9-123 35-180 70-177 81-154 42-102 63-61 116-70 131-51 124-33 64-38 14-70-20-32-13 2Z","url(#brass)",brass,'stroke-width="3"')+
    line("M-119 1l16-19 45-14 29-53-29-30 13-12 39 13 48-58m-21 78 34 47 60-11",shade,4,.72)+
    N(6,i=>C([-98,-31,-54,57,64,116][i],[-20,-81,-116,-160,-51,-53][i],10,"url(#steel)",'stroke="#dfbb92" stroke-width="2.5"'))+
    P("M115-62l27-20 13 14-14 12 11 10-14 11-22-11Z","url(#steel)",silver,'stroke-width="2"');
  const cage=P("M-105 7L-93-130 0-187 96-129 104 3H75l-5-121L0-158-68-114-76 6Z","url(#brass)",brass,'stroke-width="3"')+
    E(2,-80,127,126,"url(#accent)")+
    P("M0-147L58-83 2-26-54-80Z",p.bright,"#d7ffec",'stroke-width="2.6" fill-opacity=".8"')+
    P("M0-147L-12-82 2-26-54-80Z","#9bcfc5","none",'opacity=".64"')+
    P("M0-147L58-83-12-82Z","#c0f3d3","none",'opacity=".7"')+
    luminous("M0-147l58 64-56 57-14-56Z M-54-80l112-3","#a5e9d8",2.5,.9)+
    line("M-91-101L75-3M93-97L-74-1",brass,4,.73);
  return base+[optic,arm,cage][v%3];
}

// Leather lashes tie an antler, skull or axe to the same rough post. The post has an embedded foot.
function trophyStandard(p,v) {
  const shape=[
    "M-14-104L-57-131-101-159-119-202-103-209-87-174-57-151-69-196-54-206-42-160-13-135 10-133 35-164 47-202 63-211 69-174 95-206 111-197 102-158 70-135 34-104 19-81-17-81Z",
    "M-29-137Q-78-141-121-195L-112-211-95-184-64-165-40-163Q0-184 41-164L66-166 96-188 113-213 122-198Q84-141 35-136L39-102 15-72-18-72-40-105Z",
    "M-104-161L-74-206-18-198 4-175 45-200 96-177 117-129 85-108 29-129 16-91 9-42-17-44-18-110-49-136-98-129Z",
  ][v%3];
  return E(0,12,136,26,"url(#shadow)")+
    P("M-18 14L-15-221 9-227 17 17Z","url(#oak)",wood,'stroke-width="4"')+
    material(p,"trophyPole","M-18 14L-15-221 9-227 17 17Z",[-24,-230,43,249],"timber",.68)+
    P(shape,v%3===2?"url(#stone)":"url(#paper)","#745951",'stroke-width="3.6"')+
    line(v%3===1?"M-33-130l18-2 7 14-18 7Zm44-2 21 1-7 19-19-7Zm-14 20-6 13h17m-17 16h19":
      "M-101-199l20 34 30 17m119-2 33-45m-154 67 27 9 48-21",shade,3.2,.67)+
    N(8,i=>line(`M-29 ${-93+i*5}l62-8`,i%2?wood:brass,3.7,.86))+
    P("M-3-77q47 15 74-5l-10 47-34 22-32-17Z","url(#fabric)",wood,'stroke-width="2"')+
    line("M0-69q34 12 61-1m-55 32q19 16 40 7",brass,1.5,.54);
}

// Portable drums and bells have tension lines and a wooden rack with visibly fixed fastenings.
function gongStation(p,v) {
  const frame=P("M-150 23L-144-201-133-218 132-225 149-209 154 23h-18l-9-218-253 7-7 211Z","url(#oak)",wood,'stroke-width="4"')+
    material(p,"gongFrame","M-150 23L-144-201-133-218 132-225 149-209 154 23h-18l-9-218-253 7-7 211Z",[-153,-227,315,254],"timber",.66);
  const disk=T(1,-110,C(0,0,87,"url(#brass)",`stroke="${brass}" stroke-width="4.3"`)+
    N(17,i=>C(0,0,16+i*3.9,"none",`stroke="${i%3===0?glint:"#5a404b"}" opacity=".56" stroke-width="${i%4===0?1.7:.8}"`))+
    E(-4,-3,27,22,"url(#brass)",`stroke="${brass}" stroke-width="2.6"`)+
    line("M-37-78l-3-28m79 29 1-29",silver,4.2,.86));
  const bell=P("M-88-50Q-61-76-58-134Q-52-164-21-174L-12-196h24l12 20Q61-163 60-136Q62-77 88-50L81-25H-80Z",
    "url(#brass)",brass,'stroke-width="3.8"')+
    E(0,-43,88,18,"#4b3641",`stroke="${brass}" stroke-width="3.2"`)+E(0,-27,13,16,"url(#brass)")+
    N(12,i=>line(`M${-49+i*9} -158q${(i-5)*.9} 49 ${(i-6)*3.2} 102`,glint,1.45,.51))+
    line("M-71-57H74m-153 27h158m-80-167v-22",brass,2.7,.82);
  const wheel=T(0,-86,E(0,0,84,82,"url(#oak)",`stroke="${brass}" stroke-width="4"`)+
    N(8,i=>G(P("M-8-13l-6-63 9-9 12 1 7 9-6 62Z","url(#brass)",brass,'stroke-width="2"'),`transform="rotate(${i*45})"`))+
    C(0,0,25,"url(#brass)",`stroke="${brass}" stroke-width="3"`)+C(0,0,8,"url(#steel)"))+
    P("M-14-4h28v-39h-28Z","url(#oak)",wood,'stroke-width="3"')+
    line("M-70-149l-9-17m149 17 9-17",silver,5,.84);
  return E(0,17,174,29,"url(#shadow)")+frame+[disk,bell,wheel][v%3]+
    P("M-124-217q121-11 242-8l-4 15-240 14Z","url(#wood)",wood,'stroke-width="2"');
}

// A roadside reliquary or votive niche is carved from separate stone courses.
function votiveShrine(p,v) {
  const variants=["sun","wing","hand"], kind=variants[v%3];
  const silhouette="M-113-11V-126Q-106-178 0-215Q107-179 114-126V-11Z";
  return P("M-147-5L132-22l28 27-14 17-277 6-29-16Z","url(#stone)",p.trim,'stroke-width="3.5"')+
    ashlar(p,"wayshrine",silhouette,[-117,-215,234,209],{cell:68,course:36})+
    P(archD(158,176)+"Z","url(#recess)",p.trim,'stroke-width="7" transform="translate(0 -24)"')+
    E(4,-98,122,129,"url(#ember)",'opacity=".63"')+
    T(0,-115,crest(p,kind,1.3))+
    P("M-97-40l193-13 16 18-204 17-22-9Z","url(#stone)",p.trim,'stroke-width="2.4"')+
    candle(p,-69,-39,.67)+candle(p,65,-40,.71)+
    placed(4,-37,.57,objects.reliquary[1](p));
}

// A board or table carries the whole tactical picture, with terrain and route pins in the same plane.
function fieldMap(p,v) {
  const paper="M-140-142L112-164 143-141 145-28 119-8-129 10-147-11Z";
  const terrain=[
    P("M5-155Q-44-125-27-100Q2-75-27-53Q-56-27-46 2l27-3q-6-17 19-42Q35-71 6-98Q-20-122 47-158Z","#6b98a7","#536c7a",'stroke-width="2"')+
      P("M-93-83L-73-103 46-54 27-31Z","url(#oak)",wood,'stroke-width="2"'),
    P("M-120-57l32-46 31 35 30-62 32 50 28-62 42 74 28-37 29 54-14 21-203 13Z","#a59087","#7d6771",'stroke-width="2"')+
      line("M-90-102l12 20 15 1m39-47 13 27 18 6m32-41 16 34 13 2","#e7cfb1",2,.76),
    P("M-29-145Q-36-119 10-112Q58-103 27-68Q2-40 49-23L145-29 142-139 112-162Z","#7c9ca8","#56707d",'stroke-width="2"')+
      N(12,i=>line(`M${39+i%3*26} ${-138+i*8}q14-3 26 0`,"#dfc9a5",1,.72)),
  ][v%3];
  return P("M-166-155L119-178 160-151 166-18 141 4-149 20-170-7Z","url(#oak)",wood,'stroke-width="4"')+
    P(paper,"url(#paper)",wood,'stroke-width="2.8"')+terrain+
    line("M-127-130l240-22 18 19 1 93-16 17-237 21-11-17Z","#886456",1.5,.8)+
    line("M-110-38Q-59-76-15-64Q29-52 86-114m-15 3 15-3-4 16","#ae554d",4,.92)+
    N(12,i=>C(-122+i*22,-20-(i%4)*23,3.5,i%2?"#b26458":"#42626e",`stroke="${glint}"`))+
    N(6,i=>line(`M${-104+i*38} ${-113+i%2*14}l14-5`,shade,1.1,.72));
}

// Distinct case clues are fixed to a pinboard, with ragged paper, brass tacks and red thread.
function evidenceBoard(p,v) {
  const tacks=[[-103,-133],[-34,-146],[47,-128],[110,-78],[-79,-49],[34,-49]];
  const content=v%3===0?T(-1,-88,objects.map[1](p)+
    line("M-109-20L-78-41-25-33 3-62 71-52 112-71","#b0574f",3.4,.9)):
    tacks.map(([x,y],i)=>placed(x,y,.45+(i%3)*.09,sheet(p,119,i%2?113:72,v%3===1&&i%2?"plans":"notes"),i%2?8:-7)).join("");
  return P("M-160-169L142-181 162-149 164-24 137 5-161 16-173-10Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-147-155L134-166 148-142 149-34 132-13-148-4Z","#67525a",wood,'stroke-width="2.7"')+
    material(p,"caseCork","M-147-155L134-166 148-142 149-34 132-13-148-4Z",[-148,-169,299,165],"timber",.67)+
    content+
    (v%3===1?line("M-103-133L-34-146 110-78 34-49-79-49-103-133m69-13 68 97 13-79-150-5","#c16560",2.7,.91):
      v%3===2?line("M-118-45L121-33m-206-10 16-41m65 45 8-49m65 54 13-34","#a95550",2.9,.84):"")+
    tacks.map(([x,y])=>C(x,y,3.6,"url(#brass)",`stroke="${brass}"`)).join("");
}

// The firearm's barrel, lock, trigger and stock form a single outline resting on an armorer’s cradle.
function firearm(p,v) {
  const rifle=P("M-162 8L-122-34-76-49-53-66 138-109 153-99 150-82-53-39-67-18-103-11-142 31Z","url(#oak)",wood,'stroke-width="3.3"')+
    P("M-57-69l198-45 15 5 3 17-12 11-202 40Z","url(#steel)",silver,'stroke-width="2.6"')+
    E(149,-99,8,10,"#362b3a",`stroke="${brass}" stroke-width="2"`)+
    P("M-67-45l19-5 3-24 16-1 2 9-7 22-22 10Z","url(#brass)",brass,'stroke-width="2.2"')+
    line("M-57-35q15 16 1 27-16 9-23-1m25-50 4 10M-143 12l35-35 35-11M-53-64L141-108",brass,2.7,.89)+
    N(5,i=>line(`M${-2+i*29} ${-72-i*6.8}l3 12`,brass,2.8,.74));
  const pistol=P("M-111 18L-90-30-63-40-55-79 18-88 89-116 118-110 129-89 121-71 44-49-30-43-42-16-68-3-83 27Z","url(#oak)",wood,'stroke-width="3.1"')+
    P("M-57-83L27-97 93-121 117-116 133-95 128-76 45-52-56-51Z","url(#steel)",silver,'stroke-width="3.1"')+
    E(120,-95,11,17,"#342c3d",`stroke="${brass}" stroke-width="2.8"`)+
    line("M-50-78l78-16 72-24m-202 132 26-40 29-11m13-11 14 5-5 16-22 6",brass,2.8,.88);
  const support=N(2,i=>T(-82+i*166,-3-i*23,P(`M-25 ${21+i*23}l16-50-15-17 9-12L0-49l14-17 12 7-14 28 13 ${52+i*23}Z`,"url(#oak)",wood,'stroke-width="3.1"')));
  return support+(v%3===0?placed(0,-40,1,rifle,-3):v%3===1?placed(1,-53,1.1,pistol,-5):
    placed(-50,-68,.78,pistol,5)+placed(59,-23,.76,pistol,-8))+
    placed(117,2,.61,objects.cartridges[1](p),9);
}

// Gears and a piston rod meet inside their frame. The wing variant retains visible hinges and ribs.
function machine(p,v) {
  const base=P("M-145-2L130-12 157 12-132 28Z","url(#oak)",wood,'stroke-width="3.4"');
  const hinge=(x,y)=>C(x,y,9,"url(#steel)",`stroke="${brass}" stroke-width="2.6"`)+C(x,y,3,shade);
  const piston=P("M-132 9V-155l27-34h211l26 38V9h-30v-145l-12-20h-187l-9 20V9Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-83-121h126v76H-83Z","url(#brass)",brass,'stroke-width="3.4"')+
    P("M-16-94h134v18H-16Z","url(#steel)",silver,'stroke-width="3"')+
    line("M-74-111H33m-106 14H31m-34-13v70M-119-170h229",brass,2.6,.75)+
    hinge(-62,-81)+hinge(102,-85)+line("M-49-42v46m105-46v42",silver,7,.78);
  const gearHousing=P("M-110 7l-32-85 36-86 83-48 96 31 62 78-27 110Z","url(#brass)",brass,'stroke-width="4"')+
    P("M-88-14l-27-63 28-76 64-36 78 26 52 66-25 83Z","url(#recess)",shade,'stroke-width="3.2"')+
    placed(-20,-99,1.65,objects.gear[1](p),-7)+placed(61,-68,.92,objects.gear[1](p),12)+
    line("M-128-111L129-89M-133-77L115-58",brass,3.8,.69);
  const wing=P("M-127 10l9-91 39-65 203-76-4 29-20 22-11 31-30 3-23 42-24-4-21 41-24-3-24 40Z","url(#brass)",brass,'stroke-width="3.8"')+
    P("M-107-6l13-72 30-53 166-69-36 58-23 25-20 20-29 22-23 16-32 45Z","url(#fabric)",wood,'stroke-width="2.2"')+
    N(13,i=>line(`M${-107+i*16} ${-10-i*14}L${-65+i*13} ${-135-i*5}`,brass,2.1,.84))+
    hinge(-77,-49)+hinge(-19,-93)+hinge(36,-136)+line("M-100-7L111-205",silver,2.8,.88);
  return base+[piston,gearHousing,wing][v%3]+
    N(8,i=>C(-126+i*34,12,2.7,"url(#steel)"));
}

// A marker has a field sign, route board or set of fletched arrows in the same campsite.
function trailGear(p,v) {
  const post=P("M-12 14V-207H6L11 14Z","url(#oak)",wood,'stroke-width="3.5"');
  const arrow=v%3===0?"M-117-174L98-184l37 17-36 25-214 6Z":v%3===1?
    "M-129-152l40-32 212-8 3 32-216 23Z":"M-115-168L111-181l15 19-18 34-219 1Z";
  return post+
    P(arrow,"url(#oak)",wood,'stroke-width="3.6"')+
    line("M-89-161l23-3 11 4 47-5m13 0 46-3 18 3m17 3 15-8",glint,2.2,.64)+
    P("M-58-118L56-139 73-72-43-61Z","url(#oak)",wood,'stroke-width="2.3"')+
    placed(3,-100,.87,objects.map[1](p),-7)+
    P("M-116 3Q-82-149 105-46L100-36Q-82-123-107 8Z","url(#oak)",wood,'stroke-width="2.7"')+
    line("M-107 5L102-40",glint,1.5,.85)+
    N(4,i=>line(`M${73+i*11} 5l9-103`,wood,3,.84))+
    N(4,i=>P(`M${79+i*11} -90l-8-24 10-19 6 17-5 25Z`,"url(#paper)",wood,'stroke-width="1.4"'));
}

// The vessel sits beyond the quay. The foot of the mast is stepped through the deck and the
// sheets go back to a cleat, so the sail reads as part of a rigged boat from the header crop.
function sailRig(p,v) {
  const sail=[
    "M-125-208Q-28-225 105-200Q91-145 103-105L96-68Q-11-101-115-69Q-128-145-125-208Z",
    "M-135-61L93-225l19 7Q81-146 119-83Q-31-72-135-61Z",
    "M-127-209Q-33-225 48-183Q90-173 131-195l-24 38 15 13-32 14 21 20-44 4 11 19q-96 19-203-12Z",
  ][v];
  const hull="M-191-44Q-121-8 4-9Q122-13 205-64Q168 1 113 22Q-29 52-145 5Z";
  const ropes="M-159-27L-111-209 8-17M116-218L169-32 8-17M-6-239L180-42";
  return E(3,18,207,28,"url(#shadow)",'opacity=".74"')+
    P(hull,"url(#oak)",wood,'stroke-width="4.4"')+
    material(p,"sloopHull",hull,[-195,-64,404,120],"timber",.78)+
    line("M-183-41Q8 31 197-59M-153-4Q-27 65 149 1",brass,2.9,.78)+
    line("M-9-254L4-13M-138-210L126-224",wood,10,.95)+
    P(sail,v===2?"url(#fabric)":"url(#paper)",wood,'stroke-width="3.1"')+
    material(p,"sailCloth",sail,[-146,-232,284,186],"timber",.56)+
    clipped("sailSeams",sail,N(13,i=>line(`M${-133+i*20} -222q${i%2?14:-11} 101 ${i-5} 171`,wood,1.5,.61)))+
    line(ropes,wood,2.45,.91)+
    N(7,i=>E(-113+i*33,-11-i*.95,6,4,"none",`stroke="${brass}" stroke-width="1.6"`))+
    line("M-145-1Q-160 30-97 55l28 17",brass,3.3,.83)+
    line("M-151 25q55 14 125 13m29 5q75-5 139-25",p.trim,2.2,.71);
}

// The displayed implement is backed by padded velvet and separate metal retainers.
function curioCase(p,v) {
  const mirror=E(0,-119,64,76,"url(#brass)",`stroke="${brass}" stroke-width="4.2"`)+
    E(0,-121,53,63,"url(#glass)",`stroke="${silver}" stroke-width="2.8"`)+
    P("M-51-111L47-172l8 18-108 65Z","#dce2d6","none",'opacity=".38"')+
    line("M2-180L-12-145 11-123-14-94 0-62m-12-81-27 9-10 22m58-14 33 10M-3-62v29",glint,2.1,.84);
  const lamp=lantern(p,0,-32,2.25);
  const bell=placed(0,-48,1.85,objects.bell[1](p));
  return P("M-133 9V-197L-116-213 115-208 140-184V4l-20 18-239 6Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-119-4v-183l17-13 211 7 17 16V-5Z","url(#fabric)",brass,'stroke-width="3"')+
    E(0,-109,132,119,"url(#ember)",'opacity=".64"')+
    [mirror,lamp,bell][v%3]+
    P("M-131-4l254-10 22 16-4 16-274 13-16-17Z","url(#wood)",wood,'stroke-width="3.2"')+
    line("M-120 10L134-2M-119 19L132 8",brass,1.9,.68);
}

// A sacred weapon or crown rests on a weathered plinth. The supporting piece remains visible.
function relicPlinth(p,v) {
  const plinth=P("M-128-49l237-12 39 20-18 17-260 8-21-15Z","url(#stone)",p.trim,'stroke-width="3.6"')+
    P("M-115-15H118L107 30H-101Z","url(#stone)",p.trim,'stroke-width="3.1"')+
    T(3,8,crest(p,"sun",.52));
  const crown=P("M-104-129L-71-107-53-151-26-120 0-173 26-123 53-151 71-106 104-127 84-69Q0-37-86-70Z",
    "url(#brass)",brass,'stroke-width="4"')+
    E(0,-74,86,17,"url(#oak)",`stroke="${brass}" stroke-width="2.8"`)+
    N(7,i=>P(`M${-64+i*21} -93l7-10 8 11-7 9Z`,i%2?"#8b677f":"#7599a7",brass,'stroke-width="1.4"'));
  const hand=P("M-58-51L-69-83-95-111-86-135-66-132-46-112-54-162-39-183-24-180-14-144-8-197 8-209 22-198 23-149 36-192 52-191 60-174 52-134 72-165 88-155 77-121 59-92 48-51Z",
    "url(#brass)",brass,'stroke-width="4"')+
    line("M-59-84Q-5-103 60-87M-58-66Q-5-85 50-70M-47-104q42-38 82-12m-78-54 15 5m27-25 19 4m16 16 18 5",brass,3,.78);
  const spear=placed(-22,-61,.89,pole(p,"spear"),48)+
    P("M-108-59l26-49 17 18-14 34Z","url(#stone)",p.trim,'stroke-width="3"');
  return plinth+E(0,-103,159,137,"url(#sun)",'opacity=".66"')+[spear,crown,hand][v%3]+
    line("M-132-29l257-10M-108-8h225",brass,2,.57);
}

export const craftFeatures=Object.freeze({
  enchantingRig,trophyStandard,gongStation,votiveShrine,fieldMap,evidenceBoard,firearm,machine,
  trailGear,sailRig,curioCase,relicPlinth,
});
