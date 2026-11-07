import { E,T,P,N,placed,line,composition,finish } from "./environment.mjs";
import { material } from "./location-surfaces.mjs";
import { interiorLocations } from "./location-interiors.mjs";
import { exteriorLocations } from "./location-exteriors.mjs";
import { physicalFeatures } from "./location-features.mjs";
import { craftFeatures } from "./location-craft.mjs";
import { magicFeatures } from "./location-magic.mjs";
import { specialtyFeatures } from "./location-specialties.mjs";
import { objects } from "./location-objects.mjs";
import { habitatFeatures } from "./habitat-features.mjs";
import { renderStudy } from "./wizard.mjs";
import { between,seedStream } from "./vector.mjs";

const supports=Object.freeze({
  desk:{floor:313,top:271,small:311,table:true,stone:false},
  stoneDesk:{floor:319,top:276,small:314,table:true,stone:true},
  ground:{floor:347,top:337,small:354},
  threshold:{floor:329,top:317,small:344},
  waterline:{floor:365,top:376,small:373,water:true},
  rooftop:{floor:367,top:242,small:382,ledge:true},
});
const subjects = {
  lecternBook:["circle manuscript","diamond manuscript","triad manuscript"],
  runeBook:["hexagonal seal","interlocking circles","ribbons of light"],
  astrolabe:["inclined celestial dial","crossed armillary rings","ecliptic dial"],
  runeAnvil:["inscribed blade","circular shield rune","stacked tablet runes"],
  runeMonument:["eye engraving","diamond engraving","staggered chevrons"],
  hiddenEntry:["pivoting ashlar slab","false bottle rack","hinged iron grille"],
  skiff:["skiff with crated cargo","skiff with a barrel","skiff with a satchel"],
  roofWalk:["bowed walkway","straight roof bridge","braced sloped walkway"],
  lockBench:["sliding bolt","bevelled latch","diagonal spring bolt"],
  livingArch:["interwoven roots","flowering root arch","bent fern canopy"],
  spring:["narrow cascade","split cascade","stepped cascade"],
  livingShrine:["herb offering","shell offering","incense shrine"],
  instrument:["harp","lute","viol and bow"],
  armorialRack:["crossed spears","longsword and buckler","axe and tower shield"],
  wardGate:["spiked portcullis","shield barricade","iron leaves"],
  oathAltar:["winged oath panel","sun altar","tower oath panel"],
  crossing:["fallen-log bridge","rope footbridge","stepping-stone ford"],
  enchantingRig:["aligned lenses","articulated tool arm","caged prism"],
  trophyStandard:["lashed antlers","horned skull","stone axe trophy"],
  gongStation:["bronze gong","hanging bell","prayer wheel"],
  votiveShrine:["sun reliquary","winged votive","raised-hand icon"],
  fieldMap:["river crossing","mountain choke point","coastal landing"],
  evidenceBoard:["traced route","threaded clues","torn-letter timeline"],
  firearm:["long rifle","flared barrel pistol","paired pistols"],
  machine:["piston rig","meshed gears","mechanical wing"],
  trailGear:["eastbound trail sign","split-trail marker","waypoint board"],
  sailRig:["square sail","lateen sail","torn pennant"],
  curioCase:["cracked silver mirror","iron lantern","bronze bell"],
  relicPlinth:["spearhead","hammered crown","bronze gauntlet"],
  reaction:["coiling vapour","crystal bloom","bubbling reaction"],
  spiritRite:["rising spirit trail","paired streams","ring of spirit lights"],
  sorcery:["branching bolt","column of flame","levitating fragments"],
  pactGate:["dark flame","jagged pact tear","suspended vortex"],
  summonGate:["ring of anchor stones","chained doorway","opposing crescents"],
  arcaneBlade:["helix spell","spectral edges","grounded lightning"],
  graveRite:["bone lattice","rising grave mist","branching grave light"],
  oracleBasin:["split sun","inverted mountain","ripple eye"],
  thoughtField:["bent ripples","mirror fracture","orbiting fragments"],
  witchHearth:["thorn wreath","knotted ribbons","bone-and-brass mobile"],
  warDrum:["corded clan drum","wide war drum","tower hide drum"],
  travellingMusic:["hammered dulcimer","lyre","paired hand drums"],
  streetOrgan:["stepped pipe organ","tall pipe organ","short pipe organ"],
  proofTarget:["round proof target","planked proof target","split proof target"],
  swivelGun:["low swivel gun","elevated swivel gun","depressed swivel gun"],
  practicePell:["leather pell","planked pell","shield pell"],
  signalBeacon:["westward signal smoke","eastward signal smoke","rising signal smoke"],
  distillery:["coiled copper still","upright copper still","wide-necked copper still"],
  gemBench:["brilliant prism","angled crystal cut","tapered cut"],
  rootPool:["split root pool","interlaced root pool","cavern root pool"],
  omenCards:["fanned omen cards","ascending omen cards","paired omen cards"],
  pactContract:["circular seal","diamond seal","triangular seal"],
  healingWell:["rayed votive well","water-drop well","petal relief well"],
  trailCache:["branching trail mark","westward trail mark","ridge trail mark"],
  shieldWall:["square pavise line","kite shield line","mixed shield line"],
  wardStones:["diamond wards","linked ward seals","staggered ward marks"],
  sluiceWheel:["compact flywheel","broad flywheel","high pump linkage"],
  archiveDossier:["parcel trace","circular seal trace","fractured impression"],
  wardedMirror:["vaulted mirror","clipped mirror","round mirror"],
  boundThreshold:["vaulted tether","flowing tether","gabled tether"],
};
const elementalSubjects={
  water:["breaking wave","rolled crest","water curtain"],
  fire:["banked fire","rising fire spiral","tall flame"],
  air:["rising air ribbon","breaking gust","crosswind"],
  earth:["rising stones","high fault wall","spread fault"],
  wood:["root arc","splintered bough","wood surge"],
  metal:["iron shear","silver fragments","curved blade front"],
};

// Select a recipe without drawing it so callers can explore the same seed in a catalogue.
export function selectLocation(sceneId,name,choices) {
  if (!choices?.length) return null;
  return choices[between(0,choices.length-1,seedStream(name,sceneId,"location:2026-11"))];
}

// Worktops have real thickness and support. The surrounding architecture constrains the
// eligible construction, so a travelling bench or an altar can never turn into a cabinet.
function workSurface(p,recipe,x) {
  const outdoor = Object.hasOwn(exteriorLocations,recipe.setting);
  const stone = recipe.support==="stoneDesk";
  const trestle=outdoor||recipe.setting==="forgeHall"||p.stream("table joinery")()<.36;
  const slab=stone?"url(#stone)":"url(#oak)";
  const top=stone?"M-258 6L247-7 304 104 257 125-267 127-307 108Z":
    trestle?"M-251 1L242-10 315 110Q18 152-318 118Z":"M-246 0L249-7 317 113Q76 140-310 118Z";
  const apron=stone?"M-306 108l39 19 524-2 47-21-6 29-42 20-524 2-37-19Z":
    "M-314 117Q51 146 316 110l-6 24Q37 172-311 145Z";
  const support=stone?
    P("M-214 142L-194 152-208 277h-65l15-122ZM195 151l56-10 16 120-66 16Z","url(#stone)",p.trim,'stroke-width="4"'):
    trestle?P("M-243 141L-219 147-114 280l-26 8-100-112-44 118-29-2 62-154Zm471 0 28-7 54 138-28 8-39-112-96 125-24-10Z","url(#oak)","#4a3342",'stroke-width="4"')+
      P("M-221 186L229 177v16l-446 16Z","url(#wood)","#6d4d47",'stroke-width="2.5"'):
      P("M-249 142l42 8-19 142-39-4Zm456 8 42-10 20 140-40 8Z","url(#oak)","#4c3242",'stroke-width="4"')+
      P("M-110 142l207-5 3 45-217 8Z","url(#wood)","#6d4d47",'stroke-width="2.8"')+
      E(1,163,13,5,"url(#brass)",'stroke="#d7af81"');
  const edge=stone?p.trim:"#a9785c";
  const seams=stone?line("M-242 40l62 31 92-12 30 17m111-34 72 27 112 12m-348 1-24 27m296-39 33 31",p.trim,1.8,.47):
    N(10,i=>line(`M${-258-i*4} ${8+i*11}Q3 ${19+i*12} ${240+i*7} ${i*11-5}`,edge,i%3===0?1.7:1.05,.35));
  return T(x,235,E(0,228,345,85,"url(#shadow)")+
    support+P(top,slab,"#332433",'stroke-width="4"')+
    material(p,"worktopSurface",top,[-320,-14,641,170],stone?"stone":"timber",.93)+seams+
    P(apron,stone?"url(#stone)":"url(#wood)","#352635",'stroke-width="4"')+
    line(stone?"M-297 133l30 12 524-2 37-16":"M-303 128Q35 155 305 122",edge,2.25,.61));
}

// A loose prop appears at most once in the inventory. Each position must be on the worktop or solid ground.
function drawInventories(p,recipe,x,support) {
  const [foreground,floor]=recipe.inventory;
  const random=p.stream("furnishing");
  const used=new Set();
  const slots = [
    {pool:floor,x:x+302,y:support.floor+42,scale:.87,required:true},
    {pool:floor,x:x-318,y:support.floor+58,scale:.82,required:false},
    {pool:foreground,x:x-176,y:support.small,scale:.75,required:true},
    {pool:foreground,x:x+172,y:support.small+11,scale:.79,required:true},
    {pool:foreground,x:x+132,y:support.small+47,scale:.55,required:false},
    {pool:foreground,x:x-126,y:support.small+43,scale:.58,required:false},
  ];
  if (support.water || (recipe.setting==="canal" && recipe.feature==="seepage")) {
    // Keep supplies on the dry towpath when the main subject is in the channel.
    for (const [i, slot] of slots.entries()) {
      slot.x=914+(i%3)*49;
      slot.y=338+Math.floor(i/3)*38;
      slot.scale*=.68;
    }
  }
  if (recipe.setting==="riverbank") {
    // Leave the river bend clear. Four places are on the near bank and two are across the ford.
    const banks=[[1493,397],[888,420],[941,363],[986,395],[1472,415],[906,452]];
    for (const [i,slot] of slots.entries()) {
      [slot.x,slot.y]=banks[i];
      slot.scale*=.81;
    }
  }
  if (recipe.setting==="marsh") {
    // All items go on the raised reed bank, beyond the near edge of the water.
    const bank=[[1452,400],[1058,419],[1107,384],[1419,377],[1306,436],[1126,446]];
    for (const [i,slot] of slots.entries()) {
      [slot.x,slot.y]=bank[i];
      slot.scale*=.83;
    }
  }
  if (recipe.setting==="harbour") {
    // Put the far floor item at the mooring post. The near item must clear the sloping dock edge.
    Object.assign(slots[0],{x:1512,y:389});
    Object.assign(slots[1],{x:1039,y:419});
    if (!support.table) {
      slots[2].x=Math.max(1081,slots[2].x);
      slots[2].y=380;
    }
  }
  if (support.ledge) {
    // Keep the parapet props low while the walkway spans the upper opening.
    for (const slot of slots) slot.scale*=.81;
  }
  const layout=slots.map((slot,i)=>{
    const available=slot.pool.filter(id=>!used.has(id));
    if (!available.length || (!slot.required&&random()<.32)) return null;
    const id=available[between(0,available.length-1,random)];
    used.add(id);
    const [label,draw]=objects[id];
    return { label,draw,x:slot.x+between(-12,12,random),y:slot.y+between(-8,6,random),
      scale:slot.scale*between(89,112,random)/100,near:i>1 || !support.table };
  }).filter(Boolean);
  const paint = near => layout.filter(item=>item.near===near).sort((a,b)=>a.y-b.y).map(({draw,x,y,scale})=>
    E(x+7,y+4,scale*64,scale*11,"url(#shadow)",'opacity=".58"')+placed(x,y,scale,draw(p))).join("");
  return { behind:paint(false), front:paint(true), labels:layout.map(item=>item.label) };
}

// Paint the selected location from the back wall or horizon towards the equipment nearest the viewer.
export function renderLocation(scene,name,recipe) {
  if (!recipe) return null;
  if (recipe.setting==="classicStudy") return { ...renderStudy(name), location:recipe.title, locationKey:recipe.key };
  const variant=between(0,2,seedStream(name,scene.id,recipe.key+":feature"));
  const p=composition(scene,name,variant);
  const environment=interiorLocations[recipe.setting]??exteriorLocations[recipe.setting];
  const support=supports[recipe.support];
  const [shiftX,shiftY,scale]=recipe.frame;
  // Walkways join fixed banks or ledges. Move the free-standing equipment with the seed.
  const focusX=support.water ? between(1207,1378,p.stream("canal bend"))+14 :
    support.ledge ? 1198 : recipe.feature==="crossing" ? 1202 : p.x+shiftX;
  const focusY=support.top+shiftY;
  const inventory=drawInventories(p,recipe,focusX,support);
  const room=environment(p);
  const table=support.table?workSurface(p,recipe,focusX+10):"";
  const habitatFeature=habitatFeatures[recipe.feature];
  const draw=habitatFeature?.[0]??physicalFeatures[recipe.feature]??craftFeatures[recipe.feature]??
    magicFeatures[recipe.feature]??specialtyFeatures[recipe.feature];
  const focal=draw(p,variant,recipe.element);
  const shadow=support.water?"":E(focusX+13,focusY+8,159,26,"url(#shadow)",'opacity=".68"');
  const art=room+inventory.behind+table+shadow+placed(focusX,focusY,support.water?scale*.84:scale,focal)+inventory.front;
  // Subpixel arithmetic is rounded only after authoring. At this scale, hundredths of a pixel
  // don't affect the drawing, but the shorter values keep the generated URI compact.
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="640" viewBox="0 0 1600 640"><title>${recipe.title}</title>${p.defs}${art}${finish()}</svg>`
    .replace(/\d+\.\d{3,}/g,value=>String(Math.round(Number(value)*100)/100));
  const labels=recipe.element ? elementalSubjects[recipe.element] : habitatFeature?.[1]??subjects[recipe.feature];
  return { location:recipe.title,locationKey:recipe.key,variant:labels[variant],
    lighting:p.time.name,extras:inventory.labels,svg };
}
