import { P,R,E,C,G,T,N,line,placed,archD } from "./environment.mjs";
import { banner,bottle,candle,cavernRock,foldedBooks,lantern,pole,sheet,shield,sword } from "./props.mjs";
import { undergrowth } from "./location-surfaces.mjs";

const gold="#dbb681", ink="#3b2c3c", wood="#9e7056", steel="#aab7bf", page="#e6c897";
const steelShape=(d)=>P(d,"url(#steel)",steel,'stroke-width="1.7"');
const brassShape=(d)=>P(d,"url(#brass)",gold,'stroke-width="1.7"');

// Paper items have bevelled covers, stitching and markings that follow their page angle.
function closedBook(p,kind="folio") {
  const outer="M-64-11L-43-41 63-42 72-35 54-6-51 5Z";
  return P(outer,"url(#leather)",gold,'stroke-width="2"')+
    P("M-55-5L55-15 49-4-50 4Z","url(#paper)",wood,'stroke-width="1.2"')+
    line("M-50-4L48-12M-47-1l95-9M-55-16l24-21 83-1-12 22Z",gold,1,.66)+
    (kind==="ledger"?line("M-15-20l8-10 21-1-9 10Zm21-13 6-5M-42-16l17-21",gold,1.4,.86):line("M-4-18l8-13 10 7-9 8Z",gold,1.3,.9));
}

function letters(p) {
  return placed(-15,-13,.77,sheet(p,116,65),-11)+
    P("M-47-15L51-34 66-15 43 6-54 11Z","url(#paper)",wood,'stroke-width="1.8"')+
    line("M-45-13L2 3l47-31M-45 8l29-16m48-7 23 0",wood,1.3,.85)+
    E(1,-3,11,6,"#984c4d",'stroke="#bf7470" stroke-width="1.7"')+
    line("M-3-5l4 4 4-5",page,.8,.79);
}

function map(p,style="topography") {
  const rivers=style==="sea"?"M-67-15Q-20-25-7-38Q11-63 48-61L58-25Q36-22 23-6L-44 0Z":"M-54-39Q-18-36-9-28Q7-12 40-19Q54-25 68-20L65-12Q54-13 39-10Q9-4-9-22Q-24-32-59-31Z";
  return sheet(p,143,78,"plans")+
    P(rivers,"#657e8b","#486270",'stroke-width="1.3" opacity=".87"')+
    line("M-56-18Q-43-3-18-16T20-39Q28-34 48-39M-43-23l14-19 12 16m34 0 15-16 11 13",ink,1.6,.81)+
    line("M-38 3L-7-13 22-8 49-26m-10 1 10-1-2 10","#a3594d",2,.94);
}

function writingSet(p) {
  return E(-10,2,51,7,"url(#shadow)")+
    P("M-26-6v-28l10-7h21l11 11v25Q-2 5-26-6Z","url(#glass)",steel,'stroke-width="2"')+
    P("M-20-24q15 10 31 0v18q-15 9-31 0Z","#292440")+
    E(-5,-39,12,5,"url(#brass)",`stroke="${gold}"`)+
    P("M-6-35Q11-82 68-94Q57-78 45-64L27-57 36-58 16-42Z","url(#paper)",page,'stroke-width="1.5"')+
    line("M-6-35Q16-66 61-89M13-55l20-20",ink,1.5,.77);
}

// Brass casings show pivots and mounting surfaces. The moving parts are drawn separately.
function clockGear(p) {
  return G(N(19,i=>G(R(-4,-38,8,15,"url(#steel)",`stroke="${gold}" stroke-width="1"`),`transform="rotate(${i*360/19})"`))+
    C(0,0,30,"url(#brass)",`stroke="${gold}" stroke-width="2"`)+
    C(0,0,22,"#49374c",`stroke="${gold}" stroke-width="1.5"`)+
    N(6,i=>G(R(-4,-22,8,15,"url(#steel)"),`transform="rotate(${i*60})"`))+
    C(0,0,8,"url(#steel)",`stroke="${gold}"`),'transform="translate(4 -24) rotate(9) scale(1 .75)"');
}
function compass(p) {
  return E(0,-6,37,12,"url(#brass)",`stroke="${gold}" stroke-width="1.8"`)+
    G(C(0,0,34,"url(#brass)",`stroke="${gold}" stroke-width="2"`)+
      C(0,0,27,"url(#paper)",'stroke="#916650" stroke-width="1.6"')+
      N(16,i=>G(line("M0-21v-5",ink,i%4===0?2:1,.82),`transform="rotate(${i*22.5})"`))+
      P("M-5 14L0-21 7-5 0 1Z","#a95e59",ink,'stroke-width="1.2"')+C(0,0,3,"url(#brass)"),
      'transform="translate(0 -17) rotate(-7) scale(1 .66)"');
}
function lens(p) {
  return T(0,-16,E(0,0,37,28,"url(#brass)",`stroke="${gold}" stroke-width="2"`)+
    E(0,0,29,22,"url(#glass)",`stroke="${steel}" stroke-width="1.9"`)+
    line("M-16-14Q-27-5-22 8M10 13q12-6 12-12","#e5f3e5",2,.76)+
    P("M28 13l47 13-6 11-47-18Z","url(#oak)",gold,'stroke-width="2"'));
}
function hourglass(p) {
  return P("M-31-83H31v10H-31ZM-28-70h6V-7h-6Zm50 0h6V-7h-6ZM-33-8H33v10H-33Z","url(#brass)",gold,'stroke-width="1.8"')+
    P("M-19-70H19Q24-47 5-37Q21-22 19-9H-19Q-21-22-5-37Q-24-47-19-70Z","url(#glass)",steel,'stroke-width="1.7"')+
    P("M-16-61H16Q10-51 0-40Q-10-49-16-61ZM-15-13Q0-36 15-13Z",page,"none",'opacity=".81"')+
    line("M-14-65q-4 16 8 22m-6 17-3 12M0-37v16",page,1.3,.73);
}
function scales(p) {
  return P("M-35-3L-27-11H29L39-3 34 3H-33ZM-4-12l1-78 7-2 3 80Z","url(#brass)",gold,'stroke-width="1.9"')+
    line("M-52-70Q-16-91 0-87Q24-85 52-66",gold,4,.91)+
    line("M-50-69l-20 34 37-1-17-33m101 3-20 36 38-2-18-34",gold,1.5,.89)+
    P("M-72-36H-31q-12 14-21 14-10 0-20-14ZM30-30H70q-10 15-20 15t-20-15Z","url(#brass)",gold,'stroke-width="2"')+
    C(1,-88,5,"url(#steel)");
}

// Laboratory vessels have a visible meniscus, separate glass reflections and mounted stands.
function vials(p) {
  return P("M-62-3L51-11 69 0-48 12Z","url(#oak)",wood,'stroke-width="2"')+
    N(5,i=>placed(-44+i*22,-12-(i%2)*3,.51+(i%2)*.06,bottle(p,i%2?"round":"stoppered",
      ["#96bcb3","#d3a078","#8a77ae","#8fa568","#c88e98"][i])))+
    P("M-61-16L57-23 69-12-48-6Z","url(#wood)",wood,'stroke-width="2"');
}
function retort(p) {
  return P("M-59-2H56l11 8-112 4Z","url(#brass)",gold,'stroke-width="2"')+
    line("M-47-2v-91h76v86",gold,3,.85)+
    placed(-16,-1,1.08,bottle(p,"retort","#8bb9a4"))+
    placed(69,4,.56,bottle(p,"round","#a992a8"));
}
function mortar(p) {
  return E(0,1,53,9,"url(#shadow)")+
    P("M-47-23Q-39 1-17 6H18Q43 1 47-23Z","url(#stone)",p.trim,'stroke-width="2.4"')+
    E(0,-23,47,13,"url(#stone)",`stroke="${p.trim}" stroke-width="2.2"`)+
    E(0,-22,35,9,"#655c51",`stroke="${wood}"`)+
    P("M-12-24L30-62Q38-65 43-58L40-49 2-18Z","url(#stone)",p.trim,'stroke-width="2"')+
    line("M-10-25L31-58M-35-12q33 14 68 0",gold,1.4,.53);
}

function cauldron(p) {
  return P("M-71-50H71Q65-9 41 1H-42Q-67-9-71-50Z","url(#steel)",steel,'stroke-width="2.5"')+
    E(0,-49,71,23,"url(#steel)",`stroke="${steel}" stroke-width="2.5"`)+
    E(0,-49,59,14,"url(#water)",`stroke="${p.bright}" stroke-width="1.6"`)+
    line("M-57-36Q0-15 58-34M-41 0l-8 13m89-13 8 13M-61-61q63-82 122 0",steel,2.3,.67);
}

function bowl(p,kind="herbs") {
  const tint=kind==="shells"?"#cca595":kind==="incense"?"#d6a479":"#88a586";
  return P("M-54-15H54Q38 7 0 9Q-36 8-54-15Z","url(#brass)",gold,'stroke-width="2"')+
    E(0,-15,54,15,"url(#oak)",`stroke="${gold}" stroke-width="1.7"`)+
    N(13,i=>T(-44+i*7,-14+Math.sin(i*1.6)*6,
      P(kind==="shells"?"M-6 4l-1-7 7-8 6 6-1 8Z":"M-6 2Q-2-10 7-7Q4 0-6 2Z",tint,wood,'stroke-width="1"')))+
    (kind==="incense"?line("M-9-18q-29-29 3-41t13-36M9-19q21-18 10-34",p.bright,2,.58):"");
}
function herbs(p,vertical=false) {
  const stems=N(15,i=>{
    const x=(i-7)*5.3,y=-39-(i%4)*11;
    const side=i%2?-1:1;
    return line(`M0 4Q${x*.7} -26 ${x} ${y}`,"#a99770",1.6,.86)+
      P(`M${x} ${y+18}q${9*side} -14 ${13*side} -12q${-5*side} 10 ${-13*side} 12Z`,
        ["#7f976e","#a28c68","#729187"][i%3],wood,'stroke-width=".75"')+C(x,y,2.7,i%3===0?"#d7b393":"#aab685");
  });
  return G(stems+line("M-8-9l14-2m-12 7 14-2m-10-1 10 10",gold,2,.86),
    vertical?'transform="rotate(175) translate(0 -5)"':'transform="rotate(65) scale(.91)"');
}

// Leather straps and slots distinguish packed, carried, and laid-out tools.
function toolRoll(p) {
  return P("M-73-8L-48-45 68-53 77-11 51 4-64 9Z","url(#leather)",wood,'stroke-width="2.1"')+
    line("M-67-6l22-34 111-8 8 31-24 15-108 7",gold,1.15,.62)+
    N(6,i=>T(-48+i*18,-23-(i%2)*5,G(line("M0 15L4-20 12-28",steel,2.3,.9)+
      line("M-6 3l13 1",gold,3,.73),`transform="rotate(${(i-3)*3})"`)));
}
function padlock(p) {
  return E(1,1,40,8,"url(#shadow)")+
    line("M-22-30v-19q0-25 21-25t23 23v14",steel,8,.89)+
    P("M-33-33H33L30 1H-32Z","url(#brass)",gold,'stroke-width="2"')+
    line("M-25-27H26m-2 23h-50",gold,1.7,.76)+
    P("M-7-18a7 6 0 1 1 14 0l-4 5 4 8H-6l4-8Z","#382b3f");
}
function keys(p) {
  return E(-30,-18,18,14,"none",`stroke="${gold}" stroke-width="3"`)+
    N(3,i=>placed(-13,-16+i*3,.82,
      E(0,0,10,7,"none",`stroke="${gold}" stroke-width="3"`)+
      brassShape("M8-2h49v6h-7v8h-7V4h-6v7h-7V4H8Z"),i*14-19));
}
function rope(p) {
  return N(7,i=>E(i*2-3,-3-i*2,55-i*5,13-i*.85,"none",`stroke="${i%3?wood:gold}" stroke-width="3.7" opacity=".91"`))+
    line("M28-12q43-20 60-3 18 17-24 30",gold,3.6,.91);
}
function satchel(p) {
  return line("M-39-38q30-50 69-6",wood,6,.8)+
    P("M-59-52L54-51 64-12 50 7H-53L-65-11Z","url(#leather)",wood,'stroke-width="2.4"')+
    P("M-55-50H53L50-24 2-18-48-25Z","url(#leather)",gold,'stroke-width="1.8"')+
    P("M-8-42H9v41H-8Z","url(#oak)",wood,'stroke-width="1.6"')+
    R(-13,-25,26,18,"none",`stroke="${gold}" stroke-width="2.6" rx="3"`);
}
function coins(p) {
  return N(5,i=>T((i-2)*19,(i%2)*7,N(3+i%3,j=>E(0,-j*3,11,5,"url(#brass)",`stroke="${gold}" stroke-width="1"`))))+
    E(39,6,8,3,"url(#brass)",`stroke="${gold}"`);
}
function dice(p) {
  return N(3,i=>placed((i-1)*24,-3,.81,
    P("M-13-8L-4-19 13-14 16 1 5 9-13 3Z","url(#paper)",wood,'stroke-width="2"')+
    line("M-13-8l17 5 9-11M4-3l1 12",wood,1.3,.89)+
    C(-4,-4,1.8,ink)+C(9,-9,1.8,ink)+C(-3,0,1.7,ink),i*21-24));
}

// Structural containers sit on the floor and are visibly assembled from individual staves or boards.
function crate(p) {
  return P("M-62-49L20-66 63-45-20-27ZM-62-49l42 22v49l-42-23ZM-20-27l83-18v45l-83 22Z","url(#oak)",wood,'stroke-width="2.3"')+
    line("M-50-43v44m14-35v44m24-30 69-15m-68 29 68-14m-70 28 71-16M-18 20L59-41m-80 60-36-61",gold,1.5,.63)+
    N(6,i=>C(-14+i*13,-23-i*2.8,1.8,"#332733"));
}
function barrel(p) {
  return P("M-44-67Q0-81 44-67Q61-35 44-5Q0 11-44-5Q-58-36-44-67Z","url(#oak)",wood,'stroke-width="2.5"')+
    E(0,-68,44,13,"url(#wood)",`stroke="${wood}" stroke-width="2"`)+
    line("M-42-69Q0-54 42-69M-49-51Q1-36 49-51M-50-19Q0-4 48-19",steel,4.8,.68)+
    N(9,i=>line(`M${-35+i*8} -66q${(i-4)*2.4} 23 ${(i-4)*2} 57`,gold,1.1,.51));
}
function basket(p) {
  return line("M-39-45Q-8-103 32-50",gold,4,.78)+
    P("M-52-46Q0-57 52-46L39-3Q0 11-39-3Z","url(#oak)",gold,'stroke-width="2"')+
    N(13,i=>line(`M${-48+i*8} -46l${(6-i)*1.8} 47`,gold,1.4,.61))+
    N(7,i=>line(`M${-49+i} ${-44+i*6}q49 12 ${98-i*2} 0`,gold,1.6,.78));
}
function urn(p) {
  return P("M-25-71H25v12Q60-37 44-8Q31 6 0 7Q-31 6-44-8Q-60-37-25-59Z","url(#brass)",wood,'stroke-width="2"')+
    E(0,-71,26,8,"url(#oak)",`stroke="${gold}" stroke-width="2"`)+
    line("M-44-35Q0-18 44-35M-47-22Q0-7 47-22M-35-52Q0-40 36-53",gold,1.5,.75)+
    N(7,i=>P(`M${-33+i*11} -28l4-6 4 7-4 5Z`,"#684753",gold,'stroke-width="1"'));
}

// Distinct forging and firearms accessories use their real outline and connection points.
function hammer(p) {
  return G(P("M-6-63H6v72H-6Z","url(#oak)",wood,'stroke-width="2"')+
    steelShape("M-37-74L18-77 31-63 25-47H-36Z")+
    line("M-33-69l50-4 10 10m-30 11v56",gold,1.7,.67),'transform="rotate(35)"');
}
function chisels(p) {
  return N(4,i=>placed((i-2)*15,-7+i*2,.85,
    steelShape("M-4-65H5L4-10l-5 9-5-9Z")+P("M-8-77H8v16H-8Z","url(#oak)",wood,'stroke-width="1.3"'),i*12-28));
}
function tongs(p) {
  return placed(0,-6,.94,steelShape("M-72 11L-19-14 10-41 32-59 48-56 23-36 1-7-18 5-64 26ZM-68-7L-18-27 10-28 34-40 45-36 17-18-17-11-57 8Z")+
    C(-4,-15,6,"url(#brass)",`stroke="${gold}"`)+line("M-69 16l52-22 27-30m-70 33 42-17 28-4",gold,1.5,.68),-8);
}
function metalStock(p,kind="billet") {
  return N(4,i=>T(-49+i*25,(i%2)*4,steelShape(kind==="rivets"?"M-6 0v-14l6-5 7 5V0Z":
    "M-15-7L11-20 26-10 19 1-12 12Z")+
    line(kind==="rivets"?"M-3-11v8":"M-10-4l26-10",gold,1.4,.74)));
}
function powderHorn(p) {
  return P("M-54-10Q-72-36-45-50Q-3-70 61-74L71-61 51-47Q16-51-14-17Q-18-7-8 1Z","url(#paper)",wood,'stroke-width="2.5"')+
    line("M-52-46Q-59-22-40-11M52-69l11 13m-73-3 14 6",gold,2,.86)+
    line("M-36-12q53 44 97-46",wood,2,.74);
}
function cartridges(p) {
  return P("M-62-9L49-22 70-13 59 2-51 14Z","url(#leather)",wood,'stroke-width="1.9"')+
    N(10,i=>T(-50+i*11,-9-i*1.16,brassShape("M-3 3v-19l3-7 4 7V3Z")+line("M-1-13v10","#f5dba0",1.1,.77)));
}

// Organic pieces and ritual objects retain recognisable proportions.
function antler(p) {
  return line("M-57 3Q-13-34 16-41Q49-49 68-72m-92 50-16-27 2-23m25 42 6-30 16-18m9 33 9-29 15-11m8 28 21-7 11-10",
    "#d9c3a2",5.5,.9)+line("M-56 3Q-16-33 16-40Q48-49 68-71","#9a7a6d",1.4,.67);
}
function horn(p) {
  return P("M-65-21Q-43-34-33-28Q-25 2 16-19Q36-27 48-61L66-56Q59-15 21 2Q-32 27-65-21Z","url(#brass)",gold,'stroke-width="2"')+
    E(58,-56,12,6,"#5c4145",`stroke="${gold}" stroke-width="2"`)+
    line("M-59-19q49 36 90 9M-45-26l5 11m88-34 14 4",gold,1.9,.78);
}
function bones(p) {
  return N(4,i=>placed((i-1)*22,-1,.78,
    P("M-28 8Q-42 12-38 2Q-40-4-32-5l47-22q4-10 13-7 8-2 9 6 6 6-3 10l-57 24Z","url(#paper)",wood,'stroke-width="1.5"'),i*14-15));
}
function wax(p) {
  return placed(-21,0,.72,letters(p),-8)+
    P("M18 3L21-34H29l4 37Z","#895050","#bf7864",'stroke-width="1.7"')+
    E(26,3,18,6,"#965458",'stroke="#ce7972" stroke-width="1.4"')+
    brassShape("M-1-43H17v33H-1Z");
}
function crystals(p) {
  return N(6,i=>T((i-2.5)*17,-5-(i%2)*10,G(
    P("M-13 0L-16-29 0-69 14-34 11 1Z","url(#glass)",p.bright,'stroke-width="1.5"')+
    P("M0-69L-3-29-13 0 4-17 14-34Z",p.bright,"none",'opacity=".42"')+
    line("M0-66l-3 38-10 27M2-30l10-4",page,1.2,.79),
    `transform="rotate(${(i-3)*11}) scale(${.55+(i%3)*.23})"`)));
}
function relic(p) {
  return P("M-48-20l19-28h60l20 26-13 19-74 3Z","url(#brass)",gold,'stroke-width="2"')+
    P("M-22-41H22l17 17-10 14h-59l-8-12Z","url(#leather)",gold,'stroke-width="1.7"')+
    brassShape("M0-41L6-29 19-27 10-20 12-9 0-16-12-9-10-20-19-27-6-29Z");
}
function icon(p) {
  return P("M-37 6v-42Q-36-61 0-73Q36-60 37-36V6Z","url(#oak)",gold,'stroke-width="2"')+
    P(archD(55,60)+"Z","url(#brass)",gold,'stroke-width="1.6"')+
    P("M0-49l7 14 12 3-11 7 2 16-10-8-10 8 2-16-11-7 12-3Z",p.bright,ink,'stroke-width="1.6"');
}
function feathers(p) {
  return N(4,i=>placed(-32+i*16,-1,.76,
    P("M0 0Q-14-31 11-60L27-78Q31-44 8-17Z",i%2?"#9e8782":"#b9ad91",wood,'stroke-width="1.1"')+
    line("M1 0l23-73m-17 51 12-15m-6-3-2-10",page,1,.72),i*17-24));
}
function cards(p) {
  return N(4,i=>placed(-37+i*25,-4,.84,P("M-24 5v-49h48V5Z","url(#paper)",wood,'stroke-width="1.6"')+
    R(-19,-38,38,36,"none",`stroke="${ink}" stroke-width="1.1"`)+
    P(i%2?"M-13-19q13-24 26 0-13 15-26 0Z":"M0-34l12 14-12 14-12-14Z","#986477",ink,'stroke-width="1.2"'),i*13-17));
}
function bell(p) {
  return P("M-29-10Q-19-21-18-43Q-18-55 0-62Q18-55 18-43Q19-21 29-10Z","url(#brass)",gold,'stroke-width="2"')+
    E(0,-10,30,9,"#49384b",`stroke="${gold}" stroke-width="2"`)+
    C(0,-5,5,"url(#brass)")+line("M-3-62v-20q5-4 8 0v20m-26 48h42",gold,2.1,.8);
}
function flowerBunch(p) {
  return N(9,i=>T((i-4)*7,-10-(i%3)*6,
    line(`M${(4-i)*7} 18q${i-4} -23 0 -32`,"#8c9c71",1.6,.81)+
    N(5,j=>G(E(0,-33,4,6,i%2?"#c88d8e":"#e5c38c"),`transform="rotate(${j*72} 0 -32)"`))+C(0,-32,2.4,"#c1a675")));
}

// Keys are curated in the scene catalogue. Placement code chooses only objects offered at that station.
export const objects = Object.freeze({
  books:["bound books",(p)=>foldedBooks(p,0,1,.71)], ledger:["gilt ledger",p=>closedBook(p,"ledger")],
  folio:["travel folio",closedBook], letters:["sealed correspondence",letters],
  map:["terrain chart",p=>map(p)], seaMap:["sea chart",p=>map(p,"sea")],
  ink:["quill and ink",writingSet], wax:["sealing wax",wax],
  gear:["brass gear",clockGear], compass:["compass",compass], lens:["inspection lens",lens],
  hourglass:["sand timer",hourglass], scales:["balance scales",scales],
  vials:["rack of vials",vials], retort:["glass retort",retort],
  tincture:["stoppered tincture",p=>bottle(p,"stoppered","#a1809b")], flask:["round flask",p=>bottle(p,"round","#89ad98")],
  mortar:["mortar and pestle",mortar], cauldron:["small cauldron",cauldron],
  herbs:["bound herbs",p=>herbs(p)], hangingHerbs:["hanging herbs",p=>herbs(p,true)],
  shells:["shell offering",p=>bowl(p,"shells")], incense:["burning incense",p=>bowl(p,"incense")],
  offering:["herb offering",p=>bowl(p)], flowers:["cut wildflowers",flowerBunch],
  candles:["votive candles",p=>candle(p,-14,-4,.63)+candle(p,15,4,.48)],
  lantern:["oil lantern",p=>lantern(p,0,-4,.83)],
  picks:["rolled tools",toolRoll], lock:["iron lock",padlock], keys:["keyring",keys], rope:["rope coil",rope],
  satchel:["leather satchel",satchel], coins:["stacked coins",coins], dice:["bone dice",dice],
  crate:["planked crate",crate], barrel:["banded barrel",barrel], basket:["woven basket",basket], urn:["engraved urn",urn],
  hammer:["smith’s hammer",hammer], chisels:["engraving chisels",chisels], tongs:["forge tongs",tongs],
  billets:["metal stock",p=>metalStock(p)], rivets:["loose rivets",p=>metalStock(p,"rivets")],
  powder:["powder horn",powderHorn], cartridges:["cartridge roll",cartridges],
  antler:["shed antlers",antler], horn:["signal horn",horn], bones:["loose bones",bones],
  crystals:["mineral cluster",crystals], reliquary:["small reliquary",relic], icon:["gilded votive icon",icon],
  feathers:["bundled feathers",feathers], cards:["divination cards",cards], bell:["bronze handbell",bell],
  chain:["coiled iron chain",()=>N(17,i=>{
    const angle=i*Math.PI*.24,x=Math.cos(angle)*(38-i*.82),y=Math.sin(angle)*11-2;
    return E(x,y,7,4,"none",`stroke="${steel}" stroke-width="2.5" transform="rotate(${i*27} ${x} ${y})"`);
  })],
  shield:["spare buckler",p=>placed(0,-43,.67,shield(p,"round"),9)],
  blade:["spare blade",p=>placed(-12,-8,.77,sword(p,"short"),66)],
  axe:["wood axe",p=>placed(-12,-8,.51,pole(p,"axe"),60)],
  towerBanner:["watch standard",p=>P("M-5 12v-153H5v153Z","url(#oak)",wood,'stroke-width="2"')+
    banner(p,0,-124,68,110,"tower")],
  cairn:["small cairn",p=>N(4,i=>cavernRock(p,0,-i*12,.4-i*.067,i%2?-9:7))],
  stones:["fallen stones",p=>cavernRock(p,-26,0,.44,-12)+cavernRock(p,28,3,.39,15)],
  moss:["moss and shoots",p=>undergrowth(p,"propMoss",-44,-13,92,{shade:"#6c8463"})],
  reeds:["reeds at the waterline",p=>undergrowth(p,"propReeds",-44,-14,94,{shade:"#74896c",wet:true})],
});
