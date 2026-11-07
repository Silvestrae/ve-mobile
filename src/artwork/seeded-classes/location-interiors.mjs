import { P,R,E,T,N,line,placed,archD } from "./environment.mjs";
import { cabinet,candle,forge,lantern,stainedWindow } from "./props.mjs";
import { ashlar,clipped,material,mix,reflectedWater,sky,stonePaving,strokes } from "./location-surfaces.mjs";
import { between } from "./vector.mjs";

const brass="#d6ad79", timber="#a87960", mortar="#211e2b";
const panel="M599-26H1600V340L1200 302 692 386Z";

// Recess the window behind its jambs. Panes and lead follow the exact opening.
function windowOpening(p,id,x,y,width,height,form="arch",day=true) {
  const x0=-width/2, x1=width/2;
  const aperture=form==="arch"?archD(width,height)+"Z":`M${x0} -${height}H${x1}V0H${x0}Z`;
  const lattice=strokes(8,i=>{
    const py=-height+22+i*(height/7);
    return `M${x0-4} ${py}l${width+9} -${height*.34}m-${width} -${height*.27}l${width+4} ${height*.38}`;
  });
  return T(x,y,P(aperture,"url(#stone)",mortar,'stroke-width="25"')+
    P(aperture,day?"url(#night)":"url(#recess)",p.trim,'stroke-width="12"')+
    clipped(id,aperture,E(14,-height*.51,width*.71,height*.65,"url(#sun)",'opacity=".74"')+
      P(`M${x0} -${height*.42}q${width*.36} -${height*.11} ${width} 4v63H${x0}Z`,p.deep,"none",'opacity=".54"')+
      line(lattice,"#202231",3,.84)+line(lattice,p.trim,.85,.59).replace("/>",' transform="translate(2 0)"/>')+
      line(`M0 -${height}V0M${x0} -${height*.37}H${x1}`,p.deep,6,.9))+
    P(`M${x0-21} -7H${x1+19}l18 11-4 12H${x0-32}l-3-10Z`,"url(#stone)",p.trim,'stroke-width="2"'));
}

// Engaged column with masonry, fluting, and its own capitals in a single volume.
export function column(p,x,y,height,width=62,angle=0) {
  return placed(x,y,1,T(0,0,E(4,14,width*.96,22,"url(#shadow)")+
    P(`M${-width*.41} -8L${-width*.34} -${height}H${width*.34}L${width*.43} -8Z`,"url(#stone)",mortar,'stroke-width="3"')+
    N(9,i=>line(`M${-width*.31+i*width*.078} -${height-8}L${-width*.35+i*width*.089} -22`,
      i%2?p.trim:"#181725",i%2?1.2:2.9,.64))+
    P(`M${-width*.56} -21H${width*.56}l7 13 13 5v16H${-width*.56-19}V-3l12-5ZM${-width*.54} -${height+11}H${width*.54}v14l-8 8H${-width*.54+8}l-8-7Z`,"url(#stone)",p.trim,'stroke-width="2"')+
    line(`M${-width*.59} -${height+4}H${width*.59}M${-width*.62} 2H${width*.63}`,p.time.colour,1.4,.48)),angle);
}

// An oak beam has a lit bevel, surface grain and pegs at its joints.
function beam(p,id,path,box) {
  return P(path,"url(#oak)","#302330",'stroke-width="4"')+
    material(p,id,path,box,"timber")+
    P(path,"none",timber,'stroke-width="1.5" opacity=".48"');
}

// The near furniture is built in the scene layer, leaving the illustration's centre for a bench or display.
function workroom(p) {
  const windowX=between(937,1107,p.stream("workshop window"));
  const caseX=between(1408,1518,p.stream("workshop cabinet"));
  const silhouette="M642-9H1600V327L1000 308 672 360Z";
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"workWall",silhouette,[644,-18,1002,387],{cell:107,course:41})+
    windowOpening(p,"workLead",windowX,212,193,212,"rect")+
    P(`M${windowX-84} 129h135l378 287q-155 75-409-17Z`,p.time.colour,"none",'opacity=".13"')+
    column(p,1556,345,375,73)+
    cabinet(p,caseX,317,179,301,"bottles")+
    beam(p,"shopSkirt","M671 298L1540 278 1600 296V330L684 351Z",[677,276,925,81])+
    stonePaving(p,321,windowX)+
    E(windowX+214,299,325,154,"url(#sun)",'opacity=".42"');
}

// Layered desks, a raised aisle and multiple library walls establish the length of the scriptorium.
function scriptorium(p) {
  const windowX=between(1281,1391,p.stream("library bays"));
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"libraryWall",panel,[600,-29,1003,400],{cell:114,course:49})+
    P("M677 0Q1177 43 1554-29L1591 17Q1123 98 696 59Z","url(#oak)",timber,'stroke-width="3"')+
    N(3,i=>windowOpening(p,"libPane"+i,windowX-372+i*186,252,117,249,"arch"))+
    stonePaving(p,319,windowX)+
    N(3,i=>column(p,873+i*250,338,370,53+i*5))+
    cabinet(p,1509,335,181,336)+cabinet(p,817,316,156,295)+
    P(`M${windowX-45} 111l92 4 200 280-353-30Z`,p.time.colour,"none",'opacity=".12"')+
    E(windowX,269,311,177,"url(#sun)",'opacity=".42"')+
    lantern(p,989,192,.59,true);
}

// A circular rotating dome looks outward. The ring carries both a brass rail and stone ribs.
function observatory(p) {
  const x=between(1196,1382,p.stream("dome rotation"));
  const archShape=`M${x-324} 325V127Q${x-273} -66 ${x} -80Q${x+274} -54 ${x+325} 124V325Z`;
  const outside=sky(p,{kind:"stellar",horizon:320});
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"domeShell",panel,[600,-20,1000,411],{cell:91,course:51})+
    P(archShape,"url(#recess)","#221f31",'stroke-width="45"')+
    clipped("domeOpening",archShape,outside+
      P("M817 285l90-25 58 19 71-39 53 12 89-31 67 15 95-54 146 76 118-18v130H812Z",p.deep,"none",'opacity=".85"')+
      N(7,i=>line(`M${x-311+i*95} 281q${(3-i)*24} -185 ${(3-i)*32} -329`,p.trim,4,.75)))+
    P(archShape,"none","url(#stone)",'stroke-width="26"')+
    P(archShape,"none",brass,'stroke-width="4" opacity=".7"')+
    line(`M${x-319} 143Q${x} 35 ${x+321} 150M${x-324} 182Q${x} 90 ${x+324} 190`,brass,2,.61)+
    stonePaving(p,307,x)+
    P(`M${x-320} 275Q${x} 239 ${x+322} 278v18Q${x} 260 ${x-320} 299Z`,"url(#brass)",brass,'stroke-width="2"')+
    N(17,i=>line(`M${x-318+i*39} ${270+(i-8)**2*.36}v49`,brass,3,.69));
}

// High stained glass and repeated vault ribs give the sanctuary a tall, bright nave.
function sanctuary(p) {
  const x=between(1160,1287,p.stream("nave"));
  const kind=between(0,2,p.stream("window tracery"));
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"naveWall",panel,[599,-30,1001,420],{cell:112,course:53})+
    N(3,i=>{const cx=x+(i-1)*261;
      const silhouette=archD(250,354);
      return T(cx,333,P(silhouette+"Z","url(#recess)",p.deep,'stroke-width="3"')+
        line(silhouette,"url(#stone)",28)+line(archD(277,375),p.trim,2,.58));})+
    stonePaving(p,326,x)+
    stainedWindow(p,x,kind===1?133:253,kind)+
    windowOpening(p,"naveLeft",x-252,267,101,220)+
    windowOpening(p,"naveRight",x+253,270,98,231)+
    column(p,x-139,345,372,55)+column(p,x+144,345,372,55)+
    P(`M${x-77} 91l123 2 244 322q-122 64-423 12Z`,p.bright,"none",'opacity=".15"')+
    E(x+55,301,269,171,"url(#accent)",'opacity=".31"');
}

// Low rib vaults are laid in angled courses with tomb niches along the far wall.
function undercroft(p) {
  const openingX=between(1380,1510,p.stream("undercroft turn"));
  const low="M561-9H1600V390L1048 335 624 401Z";
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"underWall",low,[560,-22,1070,431],{cell:91,course:43,light:mix(p.mid,"#56404b",.26)})+
    P("M568-27H1600V78Q1388 124 1147 69Q860 81 670 157Z","url(#recess)","#201a28",'stroke-width="4"')+
    N(4,i=>line(`M${681+i*192} 150Q${863+i*102} 8 ${1250+i*98} -41`,"url(#stone)",15,.63))+
    T(openingX,325,P(archD(213,267)+"Z","url(#recess)",p.trim,'stroke-width="14"'))+
    T(openingX-344,316,P(archD(141,180)+"Z","url(#recess)",p.deep,'stroke-width="13"')+
      E(5,-67,62,73,"url(#ember)",'opacity=".38"')+P("M-54-26h105l14 13-2 9H-65v-12Z","url(#stone)",p.trim,'stroke-width="2"'))+
    stonePaving(p,332,openingX)+
    column(p,1498,360,318,69)+
    lantern(p,1006,165,.67,true);
}

// Warm work light comes from an actual furnace, with a broad chimney and a stack of refractory stone.
function forgeHall(p) {
  const fireX=between(1427,1503,p.stream("forge bay"));
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"forgeWall",panel,[598,-22,1006,409],{cell:116,course:47,light:mix(p.mid,"#764653",.22)})+
    P(`M${fireX-114} 160L${fireX-61} -18h141l88 177v152h-278Z`,"url(#stone)",p.deep,'stroke-width="8"')+
    line(`M${fireX-96} 162l51-145h102l63 150`,timber,3,.56)+
    stonePaving(p,335,fireX)+forge(p,fireX,313,218,260)+
    E(fireX-30,242,275,201,"url(#ember)",'opacity=".69"')+
    P("M804 8L1028 10l-25 41-224 17Z","url(#oak)",timber,'stroke-width="3"')+
    lantern(p,900,191,.58,true);
}

// Plaster and vertical timber define the domestic setting, separate from the heavy stone halls.
function timberLodge(p) {
  const opening=between(1266,1402,p.stream("cottage window"));
  const wall="M516-18H1600V379L653 323Z";
  return R(0,0,1600,640,"url(#room)")+
    P(wall,mix(p.mid,"#8a7060",.32),"#241c27",'stroke-width="3"')+
    material(p,"plaster",wall,[611,0,990,370],"stone",.66)+
    beam(p,"lodgeLintel","M584-14H1600V27L1142 47 633 101Z",[594,-11,1015,111])+
    N(4,i=>beam(p,"lodgePost"+i,`M${721+i*272} 28h23l-14 303-21 6Z`,[700+i*272,29,79,316]))+
    beam(p,"lodgeBrace","M670 91L875 299l-22 19-209-211Zm723 220 171-253 28 8-167 258Z",[638,57,962,269])+
    windowOpening(p,"lodgeWindow",opening,194,184,171,"rect")+
    stonePaving(p,327,opening)+
    E(opening,158,291,226,"url(#sun)",'opacity=".38"')+
    cabinet(p,1497,316,155,268,"bottles")+
    lantern(p,1013,195,.69,true);
}

// Visible roof trusses and gallery rails establish the larger floor of the great hall.
function greatHall(p) {
  const x=between(1289,1421,p.stream("hall end"));
  const back="M780 0H1600V353L1045 307 774 348Z";
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"hallWall",back,[771,-24,831,403],{cell:123,course:53})+
    windowOpening(p,"hallEnd",x,235,234,246)+
    stonePaving(p,321,x)+
    N(4,i=>beam(p,"truss"+i,`M${605+i*264} -30L${842+i*180} 40 1608 -28 1610 -10 ${842+i*180} 62 ${598+i*264} -4Z`,
      [593+i*156,-34,1002-i*152,119]))+
    beam(p,"hallRail","M699 228L1063 168v15l-368 74Zm668-46 234 79v29l-234-92Z",[692,164,925,128])+
    N(11,i=>line(`M${714+i*79} ${i<5?222-i*12:180+(i-5)*14}v63`,"url(#oak)",7,.77))+
    column(p,1504,354,372,78)+column(p,929,331,349,71)+
    lantern(p,1134,165,.72,true)+E(x-75,291,357,179,"url(#sun)",'opacity=".55"');
}

// Canal masonry and a towpath share the same receding perspective. The dark passage has its own lit exit.
function canal(p) {
  const x=between(1207,1378,p.stream("canal bend"));
  const tunnel=archD(422,318)+"Z";
  const canalShape=`M${x-154} 307Q${x+51} 292 ${x+164} 324L1578 640H642Z`;
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"canalWall",panel,[590,-32,1012,421],{cell:103,course:39})+
    T(x,319,P(tunnel,"url(#recess)",p.deep,'stroke-width="42"')+
      P(tunnel,"url(#recess)","url(#stone)",'stroke-width="25"')+
      line(archD(467,345),p.trim,2.3,.65)+
      P("M-72-29V-154Q-69-206 19-225Q96-203 105-155V-23Z","url(#night)",p.deep,'stroke-width="9"')+
      E(17,-129,160,145,"url(#sun)",'opacity=".5"'))+
    stonePaving(p,328,x)+reflectedWater(p,"canalWater",canalShape,299,342,{lit:x+15})+
    P(`M692 561L${x-169} 313l59-5-280 320H675Z`,"url(#stone)",p.trim,'stroke-width="2"')+
    P(`M${x+169} 318L1599 548v78L${x+123} 328Z`,"url(#stone)",p.trim,'stroke-width="2"')+
    lantern(p,1028,199,.78,true)+lantern(p,1508,190,.62,true);
}

// The proscenium carries a lined velvet curtain and a lit timber stage.
function theatre(p) {
  const x=between(1220,1310,p.stream("curtain tie"));
  const curtain=`M${x-396} -14H1604V325q-78-23-103-91-17-48-36-129Q${x+89} 62 ${x-134} 73L${x-302} 309Z`;
  const stage=`M${x-396} 298q341-50 765-9l41 107q-421 83-867 35Z`;
  return R(0,0,1600,640,"url(#room)")+
    ashlar(p,"playhouseWall",panel,[587,-30,1005,413],{cell:112,course:50})+
    T(x,311,P(archD(580,364)+"Z","url(#recess)","#2a2332",'stroke-width="34"')+
      line(archD(605,380),"url(#brass)",15)+line(archD(622,398),p.trim,2,.7))+
    P(curtain,"url(#fabric)",timber,'stroke-width="3.5"')+
    clipped("velvetLines",curtain,line(strokes(43,i=>{
      const xx=x-398+i*22;
      return `M${xx} 0q${(i%4-1)*13} 109 ${(i%7-3)*19} 311`;
    }),p.trim,1.4,.42)+
      line("M846 122Q1113 42 1519 119m-662 9q268-63 658-1",brass,2,.76))+
    stonePaving(p,352,x)+
    P(stage,"url(#wood)",timber,'stroke-width="4"')+
    material(p,"stageFloor",stage,[x-430,270,899,204],"timber")+
    clipped("stageBoards",stage,line(strokes(19,i=>`M${x-345+i*36} 270l${(i-7)*18} 159`),mortar,1.7,.58))+
    P(`M${x-115} 28h109l186 276q-103 73-402 20Z`,p.time.colour,"none",'opacity=".12"')+
    E(x+49,313,239,90,"url(#ember)",'opacity=".54"')+
    candle(p,1043,326,.58)+candle(p,1402,315,.58);
}

// Bottle niches and curved racks make the hidden cellar readable before the secret door is noticed.
function wineCellar(p) {
  const stack=(x,y,scale)=>placed(x,y,scale,
    P("M-102 2V-187Q-96-227 0-247Q95-228 103-186V3Z","url(#oak)",timber,'stroke-width="5"')+
    P("M-88-8V-183Q-82-215 0-228Q81-216 88-182V-8Z","url(#recess)",p.trim,'stroke-width="3"')+
    N(6,row=>T(0,-29-row*30,N(8,col=>{
      const px=-76+col*22, yy=-3-(col%3)*1.7;
      return E(px,yy,8,10,col%2?"#514a4e":"#62534f",'stroke="#866d63" stroke-width="1.2"')+
        E(px,yy,3,4,"#806453");
    })+line("M-87 7h174",timber,4.4,.83))));
  return undercroft(p)+stack(1001,316,.91)+stack(1492,326,.92)+
    E(1481,233,205,165,"url(#ember)",'opacity=".47"')+
    lantern(p,1470,201,.62,true);
}

export const interiorLocations = Object.freeze({
  workroom,scriptorium,observatory,sanctuary,undercroft,forgeHall,timberLodge,greatHall,canal,theatre,wineCellar,
});
