import { P,R,E,T,N,line,archD } from "./environment.mjs";
import { banner,cavernRock,lantern } from "./props.mjs";
import { between,pick } from "./vector.mjs";
import { ashlar,clipped,material,mix,reflectedWater,ridges,sky,stonePaving,strokes,undergrowth,woodlandTree } from "./location-surfaces.mjs";
import { column } from "./location-interiors.mjs";

const wood="#966e58", dark="#1b1b29", brass="#cca475";

// Distant silhouettes are simplified to keep the leaf-by-leaf near trees legible.
function distantPines(p,start,y,count,tag) {
  const random=p.stream("pines:"+tag);
  return P(strokes(count,i=>{
    const x=start+i*29+between(-12,12,random);
    const h=between(57,156,random),w=h*.25;
    return `M${x-w} ${y}l${w*.53} -${h*.39}-${w*.43} 8 ${w*.59} -${h*.31}-${w*.4} 7 ${w*.71} -${h*.36} ${w*.73} ${h*.36}-${w*.31} -5 ${w*.51} ${h*.31}-${w*.33} -6 ${w*.4} ${h*.39}Z`;
  }),mix(p.deep,"#3f5a55",.4),"none",'opacity=".79"');
}

// Two foreground canopies and a softly lit clearing create room for a shrine, desk or crossing.
function grove(p) {
  const leaf=pick(["#68845c","#a7855b","#617f76","#788b65"],p.stream("grove foliage"));
  const groveFloor="M0 364Q830 301 1122 343Q1354 358 1600 302V640H0Z";
  return sky(p,{horizon:301})+ridges(p,{horizon:268,count:2})+
    distantPines(p,468,322,45,"grove")+E(p.wash,181,514,220,"url(#sun)",'opacity=".67"')+
    woodlandTree(p,"groveEast",1534,339,1.34,{tone:"#303b3d",lit:"#a29d74",leaf,bend:18})+
    woodlandTree(p,"groveWest",884,358,1.28,{tone:"#263539",lit:"#8c8e68",leaf,bend:-14})+
    P(groveFloor,mix(p.deep,"#455544",.64))+material(p,"groveEarth",groveFloor,[612,311,995,330],"stone",.76)+
    cavernRock(p,1492,358,.73,-11)+cavernRock(p,925,364,.55,7)+
    undergrowth(p,"groveWestMoss",756,356,320,{shade:leaf})+
    undergrowth(p,"groveEastMoss",1306,349,321,{shade:leaf})+
    P("M1310 18l76 8-31 333-393 97Z",p.time.colour,"none",'opacity=".085"');
}

// The river runs between visibly separate banks, with a long reflection and near reeds.
function riverbank(p) {
  const curve=between(1169,1391,p.stream("river route"));
  const water=`M${curve+76} 218Q${curve-134} 297 ${curve+32} 358Q${curve+148} 426 1372 640H613Q966 487 1003 421Q1048 377 1017 337Q1056 265 ${curve+31} 219Z`;
  const bank="M0 366Q778 279 1038 328Q1078 370 996 430Q881 542 600 640H0Z";
  return sky(p,{horizon:254})+ridges(p,{horizon:231,count:3})+
    distantPines(p,500,279,39,"river")+
    P("M0 321Q839 230 1599 295V640H0Z",mix(p.deep,"#5b6b57",.57))+
    reflectedWater(p,"riverRiffles",water,223,420,{lit:curve+21})+
    P(bank,"url(#flagstone)",p.trim,'stroke-width="2"')+
    material(p,"riverBank",bank,[644,301,454,339],"stone",.82)+
    woodlandTree(p,"riverAlder",1519,357,.99,{tone:"#303c43",lit:"#938b6c",leaf:"#657a62",bend:19})+
    cavernRock(p,1459,333,.86,9)+cavernRock(p,957,362,.69,-6)+
    undergrowth(p,"riverReeds",1346,369,281,{shade:"#61765c",wet:true});
}

// Receding ledges on the far wall carry limestone strata and an exposed near cliff edge.
function cliff(p,snow=false) {
  const lip=snow?322:351;
  const foreground=`M0 ${lip-49}L785 ${lip-65} 934 ${lip-48} 1010 ${lip-61} 1161 ${lip-19} 1299 ${lip-30} 1400 ${lip-14} 1492 ${lip-35} 1600 ${lip-8}V640H0Z`;
  const strata=strokes(18,i=>`M671 ${lip+i*14}Q1140 ${lip+i*10-55} 1604 ${lip+i*18-1}`);
  return sky(p,{kind:snow?"storm":"open",horizon:272})+ridges(p,{profile:snow?"snow":"crag",horizon:242,count:4})+
    P(foreground,"url(#stone)",p.deep,'stroke-width="3"')+
    clipped("ledgeStrata",foreground,line(strata,snow?"#c4cbcd":p.trim,2,.4))+
    material(p,"ledgeScars",foreground,[723,lip-70,887,391],"stone")+
    P(`M860 ${lip-49}l85 9 64-14 116 36 54 4-90 18-119-24-116 8Z`,snow?"#afb8c2":p.mid,"none",'opacity=".59"')+
    cavernRock(p,1486,lip+9,1.11,16)+cavernRock(p,1009,lip+14,.68,-17)+
    (snow?"":undergrowth(p,"cliffScrub",1342,lip,221,{shade:"#6a6f52"}));
}

function mountainPass(p) { return cliff(p,true); }
function highCliff(p) { return cliff(p); }

// Colour changes between sunlit dust and violet erosion. The near strata track the rock contour.
function badlands(p) {
  const ledge="M0 332L735 308 924 337 1065 303 1210 313 1302 297 1466 314 1600 303V640H0Z";
  const butte="M1240 297L1289 178 1322 166 1332 120 1360 106 1369 44 1400 32 1464 44 1477 64 1488 152 1521 160 1559 239 1600 265V335Z";
  const band=strokes(24,i=>`M1220 ${52+i*10}q181 26 420 ${i%4*2-5}`);
  return sky(p,{horizon:251})+ridges(p,{profile:"dunes",horizon:241,count:4})+
    P(butte,mix(p.mid,"#ad664f",.48),p.trim,'stroke-width="2"')+
    P("M1373 51L1398 38 1402 135 1363 182 1343 298 1261 306 1291 184 1323 166 1335 119 1360 104Z","#a87b6e","none",'opacity=".6"')+
    clipped("butteBands",butte,line(band,p.time.colour,2,.35)+line(band,"#5a3b44",2.6,.4).replace("/>",' transform="translate(0 4)"/>'))+
    P(ledge,"url(#flagstone)",p.trim,'stroke-width="2"')+
    material(p,"scree",ledge,[658,290,945,350],"stone")+
    E(1143,322,330,92,"url(#sun)",'opacity=".59"')+
    cavernRock(p,943,354,.84,-9)+cavernRock(p,1510,357,1.07,11);
}

// Broken arches retain their supports and expose the landscape through the fractures.
function ruins(p) {
  const x=between(1242,1366,p.stream("ruin bay"));
  return sky(p,{horizon:283})+ridges(p,{horizon:252,count:3})+
    T(x,334,P("M-315 0v-174l41-27 44-54 53-8 26 23-38 32-30 47V0Zm301-10v-144l-35-57 10-41 47-35 53 5 58 67 57 76v141Z","url(#stone)",dark,'stroke-width="4"')+
      line("M-319-172l43-24 44-49 49-7M-17-152l-33-60 11-37 47-34 53 6 50 67 63 77",p.trim,2,.69)+
      line("M-309-124l84-11m-89 47 84-13m-82 52 81-15M15-90l157 27m-167-80 169 32m-158 40 152 32",p.deep,3,.77))+
    stonePaving(p,325,x)+
    column(p,1012,345,249,68,-9)+column(p,1490,346,345,72,7)+
    cavernRock(p,1435,373,.95,11)+cavernRock(p,964,383,1.03,-16)+
    undergrowth(p,"ruinMoss",1351,370,260,{shade:"#66705c"});
}

// Harbour roofs are far below the near quay. Hulls lie in water and sail rigging is visibly secured.
function harbour(p) {
  const h=between(228,258,p.stream("tidal height"));
  const waterShape=`M0 ${h}H1600V640H0Z`;
  const quay="M780 640L1011 365 1355 302 1600 327V640Z";
  return sky(p,{kind:"open",horizon:h+22})+ridges(p,{horizon:h-30,count:3})+
    reflectedWater(p,"harbourWave",waterShape,h,640-h)+
    T(930,h+39,N(9,i=>T(i*51,(i%3-1)*7,
      P("M-22 6v-45l26-15 26 16V6Z","url(#stone)",p.deep,'stroke-width="2"')+
      P("M-29-38l31-23 34 21-4 8L0-49-26-31Z",p.deep,p.trim,'stroke-width="1.3"')+
      R(-4,-25,5,13,p.time.colour,'opacity=".66"')))+
      P("M-45 3l488 3v10l-488 1Z","url(#stone)",p.trim,'stroke-width="2"'))+
    P(quay,"url(#oak)",wood,'stroke-width="4"')+
    clipped("planking",quay,line(strokes(21,i=>`M${902+i*37} ${362-i*2}l${-132+i*6} 294`),wood,1.7,.56)+
      line("M937 434l661-58M891 480l710-61M825 542l775-69",dark,2.7,.76))+
    material(p,"quayWear",quay,[785,310,815,330],"timber")+
    P("M1020 364Q1314 305 1600 333v18q-339-30-585 30Z","url(#oak)",wood,'stroke-width="2.5"')+
    N(6,i=>line(`M${1043+i*108} ${362-i*5}v72`,"url(#oak)",8,.93));
}

// Row-house roofs angle toward the right-hand street. Windows, gutters and balcony are attached to façades.
function oldStreet(p) {
  const vanish=between(1164,1264,p.stream("street bend"));
  const left=`M559-31L1030 25l22 224-54 28-453 82Z`;
  const right="M1332 35l268-63v370l-254-63Z";
  const lane=`M${vanish-54} 214l99 9 287 417H785Z`;
  const tiles=strokes(120,i=>{
    const x=577+(i%20)*23, y=-6+Math.floor(i/20)*8;
    return `M${x} ${y}l11 11 15 1`;
  });
  const distantRoof=N(7,i=>T(vanish-158+i*48,225-(i%3)*13,
    P("M-25 25v-87L-4-88 28-58v83Z",mix(p.time.sky,p.deep,.45),p.deep,'stroke-width="2"')+
    P("M-30-62l26-34 35 38-7 2-27-27-24 27Z",p.deep,p.trim,'stroke-width="1.3"')+
    R(-7,-51,8,14,p.time.colour,'opacity=".58"')));
  return sky(p,{kind:"storm",horizon:289})+distantRoof+
    P(lane,"url(#flagstone)")+
    line(`M${vanish-23} 246l-173 394M${vanish+10} 244l181 396`,p.trim,2,.33)+
    E(vanish,229,205,139,"url(#sun)",'opacity=".34"')+
    ashlar(p,"streetLeft",left,[559,-36,532,424],{cell:91,course:43})+
    ashlar(p,"streetRight",right,[1327,-35,286,384],{cell:81,course:43,light:mix(p.mid,"#4e465a",.19)})+
    P("M552-48L1068 16l-25 24-492-46Zm769 80 279-72V-9l-266 66Z","url(#oak)",wood,'stroke-width="3"')+
    line(tiles,p.trim,1.4,.35)+
    N(3,i=>T(734+i*121,167+i*4,P(archD(74,96)+"Z",i===1?"#a88069":"url(#recess)",dark,'stroke-width="7"')+
      line("M0-90V-3m-28-44h56",wood,3,.77)+P("M-45-4h89v12h-89Z","url(#stone)",p.trim,'stroke-width="2"')))+
    N(2,i=>T(1422+i*96,159-i*10,P(archD(67,99)+"Z","url(#glass)",p.trim,'stroke-width="6"')+
      line("M0-92v87m-29-41h58",wood,3.1,.76)))+
    P("M846 239l216-18 8 14-221 32Z M1330 152l270-44v23l-268 47Z","url(#oak)",wood,'stroke-width="3"')+
    lantern(p,1007,212,.62,true)+lantern(p,1476,164,.72,true)+
    P("M0 395L797 349l241 38 322-44 240 31V640H0Z","url(#stone)",dark,'stroke-width="3"')+
    material(p,"streetNear", "M654 375L802 353l239 38 323-44 237 29V640H654Z",[650,343,950,301],"stone");
}

// A low cave roof and mineral seams create a genuine below-ground silhouette.
function cavern(p) {
  const left="M0 0H825l86 75 73 35 39 136-55 102-128 126L706 640H0Z";
  const right="M1120 0H1600V640h-171l-21-101 81-122-22-81 59-94-41-91-142-55-94-45Z";
  const random=p.stream("cavern ribs");
  const hanging=N(16,i=>{
    const x=747+i*54, y=between(-28,41,random), len=between(31,145,random);
    return P(`M${x-32} ${y-16}l60 11-22 ${len}-9-21Z`,mix(p.mid,p.deep,.37),p.trim,'stroke-width="1.3"')+
      line(`M${x+23} ${y}l-21 ${len-22}`,p.trim,1.5,.52);
  });
  return R(0,0,1600,640,"url(#recess)")+
    E(1312,204,488,363,"url(#accent)",'opacity=".46"')+
    P(left,"url(#stone)",dark,'stroke-width="5"')+P(right,"url(#stone)",dark,'stroke-width="5"')+
    material(p,"caveWest",left,[601,0,453,459],"stone")+
    material(p,"caveEast",right,[1172,0,432,482],"stone")+
    hanging+
    P("M0 402Q1062 294 1600 333V640H0Z","url(#flagstone)")+
    cavernRock(p,1460,383,1.16,13)+cavernRock(p,1017,371,.94,-17)+
    E(1360,315,319,108,"url(#accent)",'opacity=".47"');
}

// Shallow pools divide a wetland clearing. Trunk reflections fade below the bank.
function marsh(p) {
  const wetland="M0 344Q799 266 1600 309V640H0Z";
  return sky(p,{kind:"storm",horizon:259})+ridges(p,{horizon:237,count:2})+
    distantPines(p,455,279,40,"marsh")+reflectedWater(p,"marshRipples",wetland,286,350)+
    woodlandTree(p,"marshWillow",1481,368,1.28,{tone:"#293639",lit:"#8f8b6d",leaf:"#57665b",bend:24})+
    P("M846 389Q1099 280 1287 327Q1451 367 1600 334V640H628Z","url(#flagstone)",p.trim,'stroke-width="1.8"')+
    undergrowth(p,"sedge",831,384,446,{shade:"#63765d",wet:true})+
    undergrowth(p,"reedPatch",1365,366,250,{shade:"#718173",wet:true})+
    E(p.wash,273,389,131,"url(#sun)",'opacity=".29"');
}

// Tent cords hold a canvas shelter against the horizon instead of placing a fabric panel in space.
function pavilion(p) {
  const tentX=between(1318,1424,p.stream("tent peak"));
  const tent=`M692-21H1600V372l-102-86-64-145-233-82-282 146-89 141-113-27Z`;
  return sky(p,{kind:"open",horizon:293})+ridges(p,{horizon:259,count:3})+
    P("M0 373Q918 290 1600 331V640H0Z","url(#flagstone)")+
    P(tent,"url(#fabric)",wood,'stroke-width="4"')+
    clipped("canvasFolds",tent,line(strokes(29,i=>`M${691+i*33} 0Q${940+i*14} 97 ${813+i*28} 348`),p.trim,1.3,.35)+
      line("M685 274Q843 214 949 96Q1157 29 1431 102q105 102 169 131",wood,2.4,.72))+
    line(`M${tentX} -21l15 439M963 113l-127 289m606-314 158 271`,"url(#oak)",8,.9)+
    line("M968 112L871 417m569-332 108 310",brass,2,.62)+
    banner(p,1494,126,62,117,"tower")+lantern(p,1031,204,.65,true)+
    E(1345,287,399,135,"url(#sun)",'opacity=".49"');
}

// Heat and reflected light follow a lava channel below the solid near ledge.
function magmaShelf(p) {
  const lava="M0 305Q579 266 940 309Q1065 326 1160 283L1600 267V640H0Z";
  const ground="M0 441L698 431 882 352 1018 325 1142 342 1328 315 1600 331V640H0Z";
  const crater="M0 267L614 204 759 118 846 104 921 152 986 146 1087 244 1168 255 1279 208 1376 185 1600 237V327H0Z";
  const random=p.stream("lava rifts");
  return sky(p,{kind:"storm",horizon:265})+
    ridges(p,{horizon:232,count:4})+
    E(1210,265,526,206,"url(#ember)",'opacity=".61"')+
    P(crater,mix(p.deep,"#6d4651",.53),dark,'stroke-width="4"')+
    material(p,"craterScars",crater,[594,100,1018,235],"stone",.85)+
    P(lava,"#aa5348","#db7850",'stroke-width="3"')+
    clipped("lavaCurrent",lava,N(34,i=>{
      const x=between(704,1520,random), y=between(265,420,random);
      return line(`M${x} ${y}q${between(31,68,random)} -${i%5*4} ${between(69,118,random)} ${i%5*6-12}`,i%3?"#ef9861":"#ffc180",i%3?1.7:4.3,.52);
    }))+
    P(ground,"url(#flagstone)",dark,'stroke-width="4.4"')+
    material(p,"basaltLedge",ground,[645,310,967,330],"stone",.92)+
    line("M690 429l192-77 136-27 124 17 186-27 272 16", "#d0825c",2.7,.7)+
    cavernRock(p,1495,358,1.08,15)+cavernRock(p,973,363,.74,-9);
}

// A raised marble court looks across cloud banks, with stairs descending to the foreground.
function cloudCourt(p) {
  const court="M0 373L761 350 1090 273 1424 296 1600 279V640H0Z";
  const clouds=N(7,i=>{
    const y=219+i*19, x=713+i%3*93;
    return P(`M${x} ${y+18}q56-32 118-17 56-29 128 3 72-28 149-7 58-10 168 6 63 13 129 17H${x}Z`,
      mix(p.time.colour,i%2?p.time.sky:p.trim,.54),"none",`opacity="${.18+i%3*.1}"`);
  });
  return sky(p,{horizon:244})+ridges(p,{profile:"snow",horizon:196,count:2})+
    clouds+E(1312,120,326,195,"url(#sun)",'opacity=".81"')+
    P(court,"url(#flagstone)",p.trim,'stroke-width="4"')+
    clipped("courtJoints",court,line(strokes(19,i=>`M${779+i*47} 646L${1180+i*2} 284`),p.trim,1.8,.48)+
      line(strokes(17,i=>`M671 ${293+i*i*1.15}Q1262 ${271+i*i*1.13} 1605 ${298+i*i*1.17}`),brass,1.7,.5))+
    P("M938 329l176-44 445 13 22 17-467-5-189 40Z","url(#stone)",p.trim,'stroke-width="3.8"')+
    N(7,i=>T(961+i*95,335-i%3*11,P("M-8 0v-53l14-4 7 55Z","url(#stone)",brass,'stroke-width="2.2"')))+
    line("M952 278l229-27 419 7",brass,5.2,.92)+
    column(p,1499,340,300,70)+column(p,1009,351,258,61,-3);
}

// Staggered headstones recede through low mist. Roots and moss stay below the stone bases.
function graveyard(p) {
  const ground="M0 355Q772 269 1114 316Q1403 305 1600 288V640H0Z";
  const random=p.stream("graveyard lanes");
  const stones=N(23,i=>{
    const row=Math.floor(i/8), x=791+(i%8)*109+(row%2?51:0)+between(-17,17,random);
    const y=285+row*34+between(-7,8,random), scale=.41+row*.16;
    const stone=i%3===0?"M-32 1v-60l32-34 32 33V1Z":i%3===1?"M-33 1v-63q0-30 33-37 33 7 33 37V1Z":"M-30 3l2-92 49 11 10 79Z";
    return T(x,y,`<g transform="scale(${scale}) rotate(${between(-11,10,random)})">`+
      P(stone,"url(#stone)",p.trim,'stroke-width="3.4"')+
      line("M-18-42h35m-24 14h24",p.deep,2.3,.8)+"</g>");
  });
  return sky(p,{kind:"storm",horizon:251})+ridges(p,{horizon:230,count:2})+
    distantPines(p,620,290,35,"cemetery")+
    P(ground,"url(#flagstone)",p.deep,'stroke-width="2.5"')+
    material(p,"cemeterySoil",ground,[673,285,929,355],"stone",.76)+
    E(1204,300,470,71,"url(#accent)",'opacity=".25"')+stones+
    woodlandTree(p,"graveyardYew",1549,373,1.18,{tone:"#29383b",lit:"#82917c",leaf:"#526d64",bend:29})+
    undergrowth(p,"graveyardMoss",1006,361,602,{shade:"#697b66"});
}

// Thin trunks frame a shallow meadow and warm flecks follow the grass, not an arbitrary overlay.
function twilightMeadow(p) {
  const meadow="M0 384Q707 269 1052 330Q1389 379 1600 303V640H0Z";
  const colour=pick(["#789474","#977d94","#7f967a"],p.stream("meadow plants"));
  return sky(p,{kind:"open",horizon:268})+ridges(p,{horizon:240,count:3})+
    distantPines(p,445,311,43,"meadow")+
    E(p.wash,215,425,176,"url(#accent)",'opacity=".55"')+
    woodlandTree(p,"meadowEast",1501,359,1.22,{tone:"#2c3b3e",lit:"#a0927e",leaf:colour,bend:27})+
    woodlandTree(p,"meadowWest",950,337,.8,{tone:"#344740",lit:"#8f9c76",leaf:colour,bend:-24})+
    P(meadow,mix(p.deep,"#465848",.67),p.trim,'stroke-width="1.6"')+
    material(p,"meadowEarth",meadow,[698,310,905,330],"stone",.69)+
    undergrowth(p,"meadowGrassWest",868,369,281,{shade:colour})+
    undergrowth(p,"meadowGrassEast",1319,355,290,{shade:colour})+
    cavernRock(p,1481,378,.66,9)+cavernRock(p,978,362,.57,-12);
}

export const exteriorLocations = Object.freeze({
  grove,riverbank,highCliff,mountainPass,badlands,ruins,harbour,oldStreet,cavern,marsh,pavilion,
  magmaShelf,cloudCourt,graveyard,twilightMeadow,
});
