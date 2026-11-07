import { P,R,E,C,G,T,N,line,placed } from "./environment.mjs";
import { bottle,candle,chain,crest,luminous,shield,sparks,sword } from "./props.mjs";
import { clipped,material } from "./location-surfaces.mjs";
import { between } from "./vector.mjs";
import { objects } from "./location-objects.mjs";

const edge="#d8ae7f", cream="#f0d5ac", wood="#9f7058", iron="#a5b2bf", shade="#211c2b";

// Rawhide laps over a stave body. Cord tension follows the sides down to the lower hoop.
function warDrum(p,v) {
  const form=v%3;
  const w=[108,122,91][form], h=[121,83,142][form];
  const top=-h-39, lower=-27;
  const drum=`M${-w} ${top}Q0 ${top-31} ${w} ${top}Q${w+19} ${top*.63} ${w*.87} ${lower}Q0 12 ${-w*.87} ${lower}Q${-w-19} ${top*.63} ${-w} ${top}Z`;
  const lacing=N(13,i=>{
    const x=-w*.91+i*w*.152, y=top+12+Math.sin(i*Math.PI/12)*18;
    const bottomX=x*.86, bottomY=lower-6+Math.sin(i*Math.PI/12)*14;
    return line(`M${x} ${y}L${bottomX+w*.11} ${bottomY}l${w*.106} ${y-bottomY}`,"#bc8f6e",3.1,.84)+
      E(x,y,3.6,2.9,"url(#brass)",'stroke="#cca57d"');
  });
  return E(0,13,w*1.44,23,"url(#shadow)")+
    P("M-127 17l35-73 21 8-23 62-21 7Zm254 0-39-78-20 10 26 65 21 8Z","url(#oak)",wood,'stroke-width="4"')+
    P(drum,"url(#leather)","#603e48",'stroke-width="4"')+
    material(p,"warDrumSkin",drum,[-144,top-29,294,h+81],"timber",.71)+
    lacing+
    E(0,top,w,27,"url(#paper)",`stroke="${edge}" stroke-width="4"`)+
    E(0,top+1,w*.84,20,"#a5856a",'stroke="#6d4a49" stroke-width="2.2"')+
    G(crest(p,form===0?"wing":form===1?"sun":"tower",.61),`transform="translate(0 ${top+1}) scale(1 .41)"`)+
    line(`M${-w*.94} ${top+11}Q0 ${top+43} ${w*.94} ${top+10}M${-w*.85} -27Q0 8 ${w*.85} -27`,edge,3.8,.82)+
    placed(67,-54,.65,objects.horn[1](p),-18);
}

// A dulcimer's strings span two bridges. The lyre and paired skin drums use completely different construction.
function travellingMusic(p,v) {
  const frame=P("M-155 7l29-38 254-13 35 36-9 23-297 14Z","url(#oak)",wood,'stroke-width="3.7"')+
    P("M-129 24l-24 56 20-2 23-55m226-14 27 62 19-6-31-56Z","url(#oak)",wood,'stroke-width="3"');
  const dulcimer=P("M-116-52L86-80 147-32 126-18-132-4-144-23Z","url(#paper)",edge,'stroke-width="3.5"')+
    P("M-83-51l-7 33m141-42 12 34","none","url(#brass)",'stroke-width="7"')+
    N(17,i=>line(`M${-121+i*.73} ${-27-i*.95}L${118-i*1.74} ${-30-i*2.5}`,i%3?shade:cream,1.15,.69))+
    N(2,i=>E(-32+i*52,-39-i*6,12,7,"#704b4b",`stroke="${edge}" stroke-width="2"`))+
    line("M-91-92l88 63m22-80 42 63",wood,6,.9)+C(-92,-92,8,"url(#brass)")+C(20,-109,8,"url(#brass)");
  const lyre=P("M-90-25Q-125-68-106-134Q-90-180-61-177Q-56-177-67-159Q-89-120-73-70L-49-45Q0-35 49-45L73-69Q86-116 63-161Q54-179 63-178Q99-176 113-132Q136-66 89-25Q51 6 0 4Q-52 8-90-25Z",
    "url(#brass)",edge,'stroke-width="4"')+
    P("M-84-123L83-136l2 14-166 14Z","url(#oak)",wood,'stroke-width="3"')+
    N(12,i=>line(`M${-59+i*11} ${-121-i*.85}L${-42+i*7.5} -38`,cream,i%3===0?1.65:.9,.89))+
    P("M-56-31Q0-59 58-30L43-15H-43Z","url(#oak)",edge,'stroke-width="2.4"');
  const drums=N(2,i=>T(i===0?-62:72,i===0?-25:-16,
    P("M-54-68H54Q66-34 45 3Q0 20-45 3Q-66-35-54-68Z","url(#leather)",wood,'stroke-width="3"')+
    E(0,-67,54,17,"url(#paper)",`stroke="${edge}" stroke-width="3"`)+
    N(9,j=>line(`M${-48+j*12} -57l${(4-j)*1.5} 61`,edge,2.25,.82))+
    line("M-48-25Q0-8 48-25m-44-49 8-4",wood,2.8,.78)));
  return E(0,34,171,29,"url(#shadow)")+frame+[dulcimer,lyre,drums][v%3];
}

// The barrels and shaped pipes have open ends, with the organ's crank held by its wood cabinet.
function streetOrgan(p,v) {
  const box="M-127-44L-109-133 82-151 130-103 139-27 112 13-126 16Z";
  const pipes=N(11,i=>{
    const x=-99+i*19, y=-153-i*[3.3,5.3,2.8][v%3], w=12+(i%3)*2.3;
    return P(`M${x} -37v${y+37}l${w} -3v${-y-32}Z`,"url(#brass)",edge,'stroke-width="1.6"')+
      E(x+w*.51,y-1,w*.49,4.9,"#3d303b",`stroke="${edge}" stroke-width="1.5"`)+
      line(`M${x+2} ${y+8}v${-y-69}`,cream,1.2,.58);
  });
  return E(0,21,165,32,"url(#shadow)")+
    P(box,"url(#oak)",wood,'stroke-width="4"')+
    material(p,"organPanels",box,[-132,-155,275,179],"timber",.72)+pipes+
    P("M-129-57L111-74l17 22-3 36-247 22Z","url(#wood)",wood,'stroke-width="3"')+
    P("M-103-48L106-62l5 24-207 19Z","url(#paper)",edge,'stroke-width="2.4"')+
    N(19,i=>line(`M${-98+i*11} ${-43-i*.74}l2 18`,shade,i%3?1.8:3,.7))+
    line("M125-36l37-14 3-19",iron,5.5,.88)+C(166,-70,7,"url(#brass)")+
    placed(-113,10,.51,objects.coins[1](p));
}

// A paper target fits over a braced board. The rifle rests on a forked stand off the firing line.
function proofTarget(p,v) {
  const form=v%3;
  const plate=form===0?"M-76-111a76 72 0 1 1 152 0 76 72 0 1 1-152 0Z":
    form===1?"M-78-181L68-177 87-49 66-30-81-38Z":"M-94-176L83-176l12 15-8 105-28 30-126-9-25-31Z";
  return E(0,18,161,32,"url(#shadow)")+
    P("M-116 17L-68-166-49-162-87 19Zm230 0L68-166 49-161 86 18Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-104-37l194-13 4 20-197 14Z","url(#oak)",wood,'stroke-width="3"')+
    P(plate,form===0?"url(#leather)":"url(#oak)",edge,'stroke-width="4"')+
    material(p,"targetHits",plate,[-99,-190,201,179],"timber",1)+
    N(4,i=>E(2,-109,60-i*14,56-i*13,"none",`stroke="${i%2?cream:"#a75c55"}" stroke-width="${i%2?2.2:3.5}" opacity=".84"`))+
    N(8,i=>{
      const x=-46+i*13,y=-107+Math.sin(i*2.1)*(14+5*(i%3));
      return C(x,y,3.2,shade)+line(`M${x-4} ${y+3}l8-7m-3 9 5-9`,cream,1.1,.54);
    })+
    (form===2?line("M-4-113l-13-19 2-17m-10 26-10-5m24 33 8 8",cream,1.6,.78):"")+
    P("M88 19l23-52 10 4-15 48Zm83-2 8-67 11-5-4 70Z","url(#oak)",wood,'stroke-width="2.4"')+
    P("M54-16l40-32 33-5 8 10-42 14-25 30Z","url(#oak)",wood,'stroke-width="2.4"')+
    P("M119-55l91-24 7 7-93 31Z","url(#steel)",iron,'stroke-width="2.5"')+
    line("M127-41q2 17-16 13m-1-17 14-5",edge,2.1,.84)+
    placed(126,17,.64,objects.powder[1](p),-12);
}

// A swivel mount bears the barrel's weight. The breech, reinforcing bands, and rail joint are separate.
function swivelGun(p,v) {
  const raised=[-3,-16,7][v%3];
  const barrel=P("M-131-107Q-116-128-91-136l199-23 21 5 21 41-13 26-221 24Q-113-65-131-85Z",
    "url(#steel)",iron,'stroke-width="4"')+
    E(135,-118,22,33,"url(#brass)",`stroke="${edge}" stroke-width="3.6"`)+
    E(139,-118,14,22,"#342c39",`stroke="${iron}" stroke-width="2.1"`)+
    N(6,i=>P(`M${-104+i*40} ${-135-i*4.6}l10-4 9 66-10 3Z`,"url(#brass)",edge,'stroke-width="2"'))+
    line("M-119-97l224-32m-213 50 239-24",cream,2,.66)+
    C(-28,-96,12,"url(#steel)",`stroke="${edge}" stroke-width="2.8"`);
  return E(0,16,175,31,"url(#shadow)")+
    P("M-111 14l21-61h178l23 61Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-43-43l21-52h47l25 54Z","url(#brass)",edge,'stroke-width="3"')+
    G(barrel,`transform="rotate(${raised} 1 -97)"`)+
    line("M-92-31h184m-190 16h198",edge,2.4,.67)+
    placed(-95,-3,.72,objects.cartridges[1](p),11);
}

// The practice rack has a marked pell and fixed iron hoops, with a loose sword racked beside it.
function practicePell(p,v) {
  const form=v%3;
  const beam=P("M-11 17l-2-226 12-22 12 15 4 233Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-106-178L111-189l11 15-2 23-232 12-7-20Z","url(#oak)",wood,'stroke-width="3.6"');
  const shape=form===0?"M-83-172Q0-201 83-170v103Q0-38-83-69Z":
    form===1?"M-89-183L73-192l21 24-12 107-171 6Z":"M-82-171Q0-204 84-175l-13 110-69 44-72-42Z";
  return E(0,15,169,28,"url(#shadow)")+beam+
    P(shape,form===1?"url(#oak)":"url(#leather)",edge,'stroke-width="3.8"')+
    material(p,"pellStrikes",shape,[-92,-202,190,185],"timber",.89)+
    line("M-79-142Q0-122 82-142M-80-106Q0-90 80-109",edge,4,.72)+
    line("M-31-166l57 83m-75 8 101-77m-98 39 80-4",cream,2.1,.61)+
    placed(-92,-14,.75,sword(p,"long"),-9)+placed(101,-39,.71,shield(p,"round"),12)+
    P("M-103 5L90-1l33 16-237 14Z","url(#oak)",wood,'stroke-width="3"');
}

// Signal fire has its own pan, feet and draft. Its smoke rises from the brazier rather than the horizon.
function signalBeacon(p,v) {
  const smoke=[
    "M13-159Q-90-196-48-232Q-11-260 54-270",
    "M-7-149Q54-185 25-211Q1-236-98-257",
    "M15-151Q73-195 35-216Q-8-234 79-262",
  ][v%3];
  return E(0,-104,197,163,"url(#ember)",'opacity=".73"')+
    P("M-111-19l61-105h27L-75-17Zm229 2-68-108H23l58 110Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-120-126H117q-19 55-117 62-103-8-120-62Z","url(#steel)",iron,'stroke-width="3.4"')+
    E(-1,-125,118,24,"#834e4e",`stroke="${edge}" stroke-width="2.8"`)+
    N(9,i=>T(-87+i*21,-123-i%3*9,P("M-11 2Q-19-8-1-24Q12-7 13 1Z",i%2?"#ffc085":"#c57455",edge,'stroke-width="1"')))+
    P("M-87-124Q-121-164-57-186Q-35-216-49-234Q-8-215-9-181Q22-206 24-248Q79-201 48-169Q100-174 88-124Z",
      "#d7845e","#f1b681",'stroke-width="2.2" fill-opacity=".82"')+
    P("M-38-125Q-55-149-13-174Q13-153 15-183Q48-171 43-127Z","#ffd098",cream,'stroke-width="1.6"')+
    line(smoke,p.time.colour,13,.14)+line(smoke,p.time.colour,3.1,.42)+
    sparks(p,0,-113,41,"#ffc98d");
}

// Distilled liquid runs down a copper neck into a vessel. The coil sits on its stand above the collector.
function distillery(p,v) {
  const liquid=["#98bfaa","#c295a4","#e2bc85"][v%3], height=[0,10,-5][v%3];
  return P("M-143-4l257-12 31 22-31 16-231 7-37-19Z","url(#oak)",wood,'stroke-width="3.7"')+
    E(-57,-112,164,128,"url(#ember)",'opacity=".53"')+
    P("M-125-25L-116-78-83-100H-23l31 26 4 46Q-49 9-125-25Z","url(#brass)",edge,'stroke-width="3.7"')+
    E(-57,-77,57,23,"url(#brass)",`stroke="${edge}" stroke-width="2.9"`)+
    P("M-85-96L-68-146H-46l22 48Z","url(#brass)",edge,'stroke-width="3.4"')+
    line(`M-54-143Q-36 ${-205-height} 26-172Q78-152 77-129`,wood,16,.95)+
    line(`M-58-145Q-35 ${-205-height} 26-174Q78-156 76-129`,edge,3.7,.86)+
    P("M33-34v-103h85v103Z","url(#glass)",iron,'stroke-width="2.9" opacity=".78"')+
    N(7,i=>E(75,-130+i*13,34,8,"none",`stroke="${i%3?wood:edge}" stroke-width="3.2" opacity=".9"`))+
    placed(79,1,.74,bottle(p,v%3===1?"round":"stoppered",liquid))+
    line("M-119-53Q-63-21 4-48m-111-21 4 23",cream,2.2,.71)+
    C(76,-63,4.9,liquid)+C(76,-50,3.1,liquid);
}

// A jeweller's clamp holds a gem above cooling tools. Strokes remain attached to the crystal facets.
function gemBench(p,v) {
  const cut=[
    "M-68-127L-39-177 37-182 73-122 0-56Z",
    "M-76-118L-48-166 36-169 75-135 63-85-8-50Z",
    "M-62-116L-31-180 51-164 72-103 1-51Z",
  ][v%3];
  const colour=["#9ec6be","#cfb2de","#e6bc83"][v%3];
  const interior=clipped("gemFacet",cut,
    P("M-71-129L0-146 75-135 17-88 0-59Z",colour,"none",'opacity=".58"')+
    P("M-37-178L0-146 17-88-69-124Z","#e9ead4","none",'opacity=".39"')+
    line("M-37-179L0-146 34-175M-75-124L0-146 72-135M0-146l17 58-17 32",cream,2.6,.82));
  return P("M-139 0l282-10 18 22-22 17-281 5Z","url(#oak)",wood,'stroke-width="3.5"')+
    P("M-41 4l21-45h40l32 38Z","url(#steel)",iron,'stroke-width="3"')+
    P("M-106-42L-94-122-69-140-53-117-71-102-80-40Zm209 1L91-124 69-139 52-115 72-102 79-41Z",
      "url(#brass)",edge,'stroke-width="3.4"')+
    E(0,-115,158,114,"url(#accent)",'opacity=".66"')+
    P(cut,"url(#glass)",colour,'stroke-width="3.3"')+interior+
    line("M-103-54l211-7",iron,6.8,.81)+
    placed(-111,2,.61,objects.chisels[1](p),-8)+placed(111,-8,.61,objects.lens[1](p),12);
}

// The grotto's roots join the cave face and gather around an actual shallow pool.
function rootPool(p,v) {
  const rootSpread=[
    "M-167-195Q-62-154-82-81Q-90-41-125 9M-96-223Q3-174-38-97Q-62-65-47 9M116-218Q88-141 53-103Q19-62 77 7",
    "M-168-195Q-99-166-113-104Q-127-45-96 5M-83-224Q-47-176-58-137Q-75-61 3 6M101-214Q34-143 67-93Q119-57 114 5",
    "M-164-206Q-95-175-100-98Q-102-33-133 6M-77-238Q-42-185-11-166Q14-151-18-88Q-60-27-17 5M110-220Q68-172 79-117Q97-78 69-39Q54-19 79 9",
  ][v%3];
  const random=p.stream("root pool tendrils");
  return E(0,-76,207,154,"url(#accent)",'opacity=".45"')+
    line(rootSpread,shade,42,.95)+line(rootSpread,"url(#bark)",32,.97)+line(rootSpread,"#a39870",2.8,.65)+
    N(14,i=>line(`M${-138+i*21} ${-212+i%4*9}q${(i-6)*4} 46 ${between(-34,37,random)} ${between(58,129,random)}`,
      i%3?"#637c61":"#85926d",2.2,.68))+
    E(0,3,151,35,"url(#water)",'stroke="#84a895" stroke-width="2.6"')+
    N(7,i=>E(0,4,19+i*17,5+i*3,"none",`stroke="${p.bright}" opacity="${.64-i*.06}"`))+
    placed(-94,-5,.68,objects.crystals[1](p))+
    placed(92,-4,.64,objects.offering[1](p));
}

// Cards and a raised stone seal give the Oracle a place to read an omen without repeating the basin.
function omenCards(p,v) {
  const colour=["#e9b4c6","#b8d2e2","#e9bd91"][v%3];
  const points=v%3===0?[[-88,-89],[-36,-139],[30,-160],[93,-109]]:
    v%3===1?[[-108,-59],[-47,-97],[9,-128],[61,-176]]:
      [[-100,-143],[-37,-101],[29,-108],[89,-145]];
  return E(0,-104,174,131,"url(#accent)")+
    P("M-140 2l36-42 221-10 32 39-13 22-250 13Z","url(#stone)",p.trim,'stroke-width="4"')+
    P("M-105-30L96-38l36 25-19 16-211 7-25-21Z","url(#fabric)",edge,'stroke-width="2.5"')+
    points.map(([x,y],i)=>placed(x,y,1.06,
      P("M-26-31H25v61H-26Z","url(#paper)",edge,'stroke-width="3"')+
      R(-20,-25,40,49,"none",'stroke="#7f5565" stroke-width="1.4"')+
      P(i%2?"M-15 0Q0-23 16 0Q0 15-15 0Z":"M0-18l14 17-14 18-14-18Z",colour,"#805465",'stroke-width="1.9"')+
      C(0,0,5,"#835e73"),(i-1.5)*14)).join("")+
    luminous("M-85-67Q-34-26 10-49Q42-66 83-60Q116-52 120-26",colour,2.45,.81)+
    candle(p,-112,0,.61)+candle(p,111,-4,.64);
}

// The contract is pinned to a slab by iron clasps. The seal sends an ember trail through the folds.
function pactContract(p,v) {
  const flame=["#efadb7","#c7a0ef","#efbd9b"][v%3];
  const vellum="M-126-159L103-169 132-145 142-41 117-12-126 0-143-27Z";
  return P("M-155 11l8-166 27-32 235-8 35 30 4 153-24 24-268 17Z","url(#stone)",p.trim,'stroke-width="4"')+
    P(vellum,"url(#paper)",wood,'stroke-width="3.4"')+
    material(p,"contractGrain",vellum,[-145,-170,289,176],"timber",.71)+
    N(12,i=>line(`M${-115+i*.4} ${-141+i*9}q54-4 ${128+i%3*18} -11`,"#604450",i%3?1.45:2.1,.79))+
    T(73,-71,E(0,0,34,26,"#994d59",'stroke="#d1847a" stroke-width="3.8"')+
      P(v%3===1?"M0-19l16 19-16 18-16-18Z":v%3===2?"M-17 11L0-17 18 11Z":"M-16 0a16 14 0 1 0 32 0a16 14 0 1 0-32 0Z",
        "url(#leather)",flame,'stroke-width="2.6"'))+
    E(73,-72,97,101,"url(#accent)")+
    luminous("M73-89q-42-42-6-69t-7-62",flame,3.1,.85)+
    chain(-105,-169,14,-49,.76)+chain(128,-151,14,53,.76);
}

// A pilgrim can draw water from the spring or use the wash bowl. Masonry curves around the opening.
function healingWell(p,v) {
  const body="M-118-82Q-15-117 116-85L108-26Q78 15-1 15Q-87 11-111-24Z";
  const waterColour=["#9ed9cd","#b1c8e6","#b2cea5"][v];
  const ornament=[
    "M-30-112h60m-30 0v-22m0 22v27m-35-15Q0-54 34-100",
    "M0-137C-4-122-25-110-25-96a25 20 0 0 0 50 0Q23-110 0-137Z",
    "M-24-94Q-18-125 0-134Q27-121 24-94M-32-95Q0-74 32-95M0-126v47",
  ][v];
  const basin=P(body,"url(#stone)",p.deep,'stroke-width="4"')+
    material(p,"wellWall",body,[-120,-112,238,130],"stone",1)+
    E(0,-83,118,35,"url(#stone)",`stroke="${p.trim}" stroke-width="4"`)+
    E(0,-84,96,24,"url(#water)",`stroke="${waterColour}" stroke-width="2.7"`)+
    N(5,i=>E(4,-85,21+i*13,5+i*3,"none",`stroke="${waterColour}" opacity="${.63-i*.078}"`))+
    N(9,i=>line(`M${-104+i*25} ${-69+Math.sin(i/8*Math.PI)*19}l${(4-i)*1.35} 22`,p.deep,2.5,.82))+
    line("M-101-28Q-3 22 99-27M-106-63Q-6-12 106-64",p.trim,2.1,.54);
  const stand=P("M-71-77l15-106 112-9 21 110-16-1-19-94-85 6-11 96Z","url(#stone)",p.trim,'stroke-width="3"')+
    P("M-53-179L0-212l58 22-8 18-50-19-45 29Z","url(#stone)",p.trim,'stroke-width="3.5"')+
    line("M0-180v39",edge,2.7,.8)+
    P("M-37-142h74l9 15-9 46-71 3-12-48Z","url(#brass)",edge,'stroke-width="2.8"')+
    line(ornament,cream,2.9,.91);
  return E(0,4,158,27,"url(#shadow)")+stand+basin+
    placed(-101,0,.8,objects.tincture[1](p))+placed(116,-6,.73,objects.flowers[1](p),-14)+
    candle(p,-124,-13,.62)+candle(p,130,2,.51);
}

// The cache tucks a weatherproof case into the exposed roots. Direction marks belong to the trail.
function trailCache(p,v) {
  const hollow="M-149-22L-128-103Q-70-133 14-107L137-76l36 29-31 51-87 11-39-15-107 5Z";
  const marker=[
    "M-56-89l34-21 33 15m-34-15v28m-21-2 25 14 24-17",
    "M-47-91l53-5m-35-12-18 17 18 12m11-36 11 6",
    "M-47-92l24-19 29 17m-49 17 22-16 19 12",
  ][v];
  return E(7,2,187,27,"url(#shadow)")+
    P(hollow,"url(#bark)",shade,'stroke-width="4"')+
    material(p,"trailCacheBark",hollow,[-151,-131,330,151],"timber",1)+
    P("M-133-29Q-88-61-50-27L-55 0-124 3Z","url(#recess)",shade,'stroke-width="3"')+
    P("M-102-31l44-10 19 12-2 21-52 8-13-13Z","url(#leather)",edge,'stroke-width="2.7"')+
    line("M-91-27l40-7m-13-4 5 29",cream,2,.65)+
    line("M-134-82Q-55-129 23-100m-116 25q91-21 190 17m-39-19 38 11m-10 45 42-13",wood,2.8,.8)+
    P("M-76-113Q-41-127 20-109l10 38-71 18-38-20Z","url(#oak)",wood,'stroke-width="2.9"')+
    line(marker,cream,3.8,.85)+
    placed(117,-7,.69,objects.compass[1](p),12)+placed(54,-21,.78,objects.map[1](p),-8)+
    placed(-128,8,.72,objects.moss[1](p));
}

// Pavises lean back into joined braces. The overlap closes the gap between the three shields.
function shieldWall(p,v) {
  const forms=[["tower","tower","tower"],["kite","tower","kite"],["round","kite","round"]][v];
  const colours=["#9cb9cc","#c0a58b","#8fb5ad"];
  return E(3,14,189,34,"url(#shadow)")+
    P("M-180 14l56-97 25 7-40 99Zm117-5 54-103 27 10-48 104Zm119 7 49-100 24 9-42 105Z",
      "url(#oak)",wood,'stroke-width="4"')+
    P("M-173-20l305-34 34 17-322 35Z","url(#oak)",wood,'stroke-width="3.5"')+
    forms.map((form,i)=>placed(-113+i*107,-85+Math.abs(i-1)*11,i===1?1.43:1.23,
      shield(p,form,colours[v]),(i-1)*9)).join("")+
    line("M-175 18l320-18m-292 22 15-17m95 10 14-17m110 9 11-16",edge,2.3,.73)+
    placed(-145,-2,.66,objects.rivets[1](p));
}

// The inherited ward has three broken pillars. The glyph runs across the masonry and gaps.
function wardStones(p,v) {
  const marks=[
    "M-115-107l26-41 25 35-28 45Zm85-4 30-54 32 56-28 32Zm93-6 24-37 27 42-30 38Z",
    "M-121-116l26-13 30 22-28 23-27-11m90-32L0-146l34 28-30 30-33-16m83-8 33-28 32 17-26 32",
    "M-119-114l25-29 29 30-27 27-24-25m87-27L1-112l29-31m-46 61 17-30 18 27m52-43 14 37 29-29",
  ][v];
  const rocks=[
    [-94,-1,"M-43 3L-48-131-33-158 10-151 39-174 46-156 44 2Z"],
    [0,-5,"M-45 3l-7-173 22-22 27 12 16-6 36 21 2 169Z"],
    [88,4,"M-42 2l-4-148 14-31 30 19 24-12 20 15 7 152Z"],
  ];
  return E(0,4,198,35,"url(#shadow)")+
    P("M-178 8l49-30 249-6 57 28-31 20-291 15Z","url(#stone)",p.trim,'stroke-width="3"')+
    rocks.map(([x,y,d],i)=>T(x,y,
      P(d,"url(#stone)",shade,'stroke-width="4.8"')+
      material(p,"wardStone"+i,d,[-55,-198,109,211],"stone")+
      line("M-38-63l17-29-4-28m15 99 17-42 26-16",p.deep,2.7,.83)+
      line("M-31-158l15 14 27-7 19-17",p.trim,2,.65))).join("")+
    E(0,-113,179,109,"url(#accent)",'opacity=".51"')+
    luminous(marks,p.bright,3.7,.93)+
    line("M-123-69Q-3-54 121-77",p.bright,1.3,.56)+
    placed(-143,10,.63,objects.stones[1](p))+placed(132,-2,.68,objects.stones[1](p));
}

// The flywheel drives the pump rod through a visible crank. Wet floor stones sit below the trough.
function sluiceWheel(p,v) {
  const radius=[69,81,74][v], angle=[-24,13,45][v];
  const wheel=E(0,0,radius,radius*.98,"url(#oak)",`stroke="${edge}" stroke-width="6"`)+
    E(0,0,radius-15,radius-15,"url(#recess)",'stroke="#896654" stroke-width="3"')+
    N(9,i=>G(P(`M-4 0L-7 -${radius-7}l14 0 3 ${radius-7}Z`,"url(#brass)",wood,'stroke-width="1.7"')+
      P(`M-8 -${radius+4}h16v15h-16Z`,"url(#steel)",iron,'stroke-width="1.4"'),`transform="rotate(${i*40})"`))+
    C(0,0,18,"url(#steel)",`stroke="${edge}" stroke-width="2.9"`)+C(0,0,6,"url(#brass)");
  return E(0,18,180,31,"url(#shadow)")+
    P("M-150 4l16-179 242-13 17 172-21 12-18-162-201 11-15 161Z","url(#oak)",wood,'stroke-width="4"')+
    P("M-148-7L94-16l62 22-25 25-250 8-40-20Z","url(#stone)",p.trim,'stroke-width="3"')+
    P("M-119 8l215-9 44 14-15 9-239 7-23-9Z","url(#water)",p.trim,'stroke-width="2.1"')+
    line("M-125 20q78 4 225-13m-94 16 104-5",p.bright,1.8,.54)+
    placed(-30,-104,1,wheel,angle)+
    line(`M-29-103l57 ${v===0?12:v===1?-12:-33} 59 19v89`,iron,8,.95)+
    P("M73-39l28-1 6 51-34 1Z","url(#brass)",edge,'stroke-width="3"')+
    C(85,-70,7,"url(#brass)");
}

// The archivist's folio links recovered entries to an annotated document on the stand.
function archiveDossier(p,v) {
  const page="M-119-147L-8-159 8-156 117-153l13 128-119 9-18-2-126 14Z";
  const pages=P("M-132-146l121-21 15 5 119-2 18 146-134 13-16-3-128 17Z","url(#leather)",wood,'stroke-width="4"')+
    P(page,"url(#paper)",edge,'stroke-width="3"')+
    material(p,"dossierFolio",page,[-134,-160,266,160],"timber",.74)+
    line("M-12-154Q-18-76-6-17",wood,4,.65);
  const trace=[
    "M29-97l27-25 31 18-7 23-26 14-29-18Z",
    "M27-87Q46-117 78-111Q109-98 97-75Q72-56 42-66Z",
    "M23-87l16-32 27 6 17 22 21 5-18 20-36-2Z",
  ][v];
  return P("M-152 6l300-18 14 23-296 30-30-12Z","url(#oak)",wood,'stroke-width="4"')+
    pages+
    N(11,i=>line(`M${-109-i*.47} ${-128+i*9.7}q34-1 ${64+(i%4)*6} -7`,shade,i%3===0?1.95:1.2,.67))+
    N(4,i=>P(`M${14+i*25} -154l16-1 1 19-8-4-7 6Z`,["#9d6d6e","#708285","#b09466","#847695"][(i+v)%4],wood,'stroke-width="1.5"'))+
    P(trace,"#a5a28b","#675262",'stroke-width="2.7"')+
    line("M34-125l29 53 37-36m-74 54 64-6m-66 20 79-10","#a76f64",2.2,.85)+
    N(4,i=>C(32+i*21,-113+i%2*24,3.2,"url(#brass)"))+
    placed(117,-7,.74,objects.lens[1](p),-22)+placed(-94,13,.55,objects.letters[1](p),13);
}

// The implement's mirror sits in a latched metal cage. The cut glass follows the arch of the vault.
function wardedMirror(p,v) {
  const aperture=v===0?"M-75-52V-127Q-75-171 0-207Q75-171 75-127V-52Z":
    v===1?"M-80-48v-98l23-45 114-3 25 45v101Z":"M-76-132a76 72 0 1 1 152 0 76 72 0 1 1-152 0Z";
  const reflection=clipped("implementReflection",aperture,
    P("M-110-61L110-199l17 28-240 130Z","#bfdbd5","none",'opacity=".31"')+
    line("M-93-87l168-104m-78 158v-81q0-26 30-41 34 13 34 39v61",cream,2.65,.59)+
    line("M-39-197l21 54-8 31 16 58m-8-89 36 13 30-24",p.bright,2.1,.89));
  return E(0,-111,174,128,"url(#accent)",'opacity=".69"')+
    P("M-144 13l41-61 218-1 35 52-23 18-246 6Z","url(#stone)",p.trim,'stroke-width="3.9"')+
    P("M-105 5L-87-122l31-25 10 14-20 22-15 112Zm210 0L87-122l-31-25-10 14 20 22L81 1Z","url(#steel)",iron,'stroke-width="3.4"')+
    P(aperture,"url(#glass)",edge,'stroke-width="6"')+reflection+
    chain(-65,-68,109,35,.76)+chain(66,-68,109,-36,.76)+
    placed(-103,-9,.65,objects.letters[1](p))+placed(120,-3,.72,objects.reliquary[1](p));
}

// An unoccupied threshold is drawn from the setting's floor, with three physical tethers.
function boundThreshold(p,v) {
  const door=[
    "M-90-37V-151Q-88-199 0-222Q89-196 90-151V-37",
    "M-93-40Q-140-95-81-155Q-24-215 52-197Q109-178 98-127l-4 90",
    "M-91-35v-98l90-85 90 85v98",
  ][v];
  return E(0,2,192,37,"url(#shadow)")+
    P("M-151-4l43-28 216-3 52 32-23 22-277 14Z","url(#stone)",p.trim,'stroke-width="3"')+
    E(0,-12,117,25,"url(#water)",`stroke="${p.bright}" stroke-width="2.5"`)+
    E(0,-114,156,120,"url(#accent)",'opacity=".55"')+
    P(door+"Z","url(#glass)",p.trim,'stroke-width="4" fill-opacity=".43"')+
    luminous(door,p.bright,4,.93)+
    N(5,i=>E(0,-10,33+i*18,5+i*4,"none",`stroke="${p.bright}" stroke-width="1.2" opacity="${.59-i*.066}"`))+
    line("M-112-26l52-36m128 3 53 33M-28-14l26-42 29 41",p.bright,2.1,.63)+
    placed(-133,3,.83,objects.cairn[1](p))+placed(123,2,.89,objects.cairn[1](p))+
    placed(-2,14,.65,objects.stones[1](p))+sparks(p,3,-77,32,p.bright);
}

export const specialtyFeatures=Object.freeze({
  archiveDossier,wardedMirror,boundThreshold,
  healingWell,trailCache,shieldWall,wardStones,sluiceWheel,
  warDrum,travellingMusic,streetOrgan,proofTarget,swivelGun,practicePell,signalBeacon,distillery,gemBench,rootPool,omenCards,pactContract,
});
