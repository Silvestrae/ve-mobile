import {seedStream, between} from "./vector.mjs";

// Browser-safe Wizard art. Draw in a shared coordinate space; put the action above the header's stat rows.
const W = 1600, H = 640;
const path = (d, fill = "none", stroke = "none", extra = "") => `<path d="${d}" fill="${fill}" stroke="${stroke}" ${extra}/>`;
const rect = (x,y,w,h,fill,extra="") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const dot = (x,y,r,fill,extra="") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const oval = (x,y,rx,ry,fill,extra="") => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const g = (html, extra="") => `<g ${extra}>${html}</g>`;
const at = (x,y,html,extra="") => g(html,`transform="translate(${x} ${y})" ${extra}`);
const many = (n, fn) => Array.from({length:n}, (_,i) => fn(i)).join("");
const pt = (radius, angle) => [Math.round(radius*Math.cos(angle)), Math.round(radius*Math.sin(angle))];
const poly = (points, fill, line, extra="") => path("M"+points.map(p=>p.join(" ")).join("L")+"Z",fill,line,extra);

// A seeded stream drives both the broad composition and finer marks. Only numeric and authored values reach the SVG.
function seeded(name) {
  let s = 2166136261;
  for (const ch of String(name ?? "").normalize("NFC").trim() || "Orna") s = Math.imul(s ^ ch.codePointAt(0),16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spells = [
  { name:"The Binding Circle", color:"#b38aff", bright:"#efdaff", shadow:"#7757c9", x:1190, y:161 },
  { name:"The Emerald Gate", color:"#7ee4bb", bright:"#d7ffe3", shadow:"#3ba788", x:1152, y:185 },
  { name:"The Three Seals", color:"#f7ae6c", bright:"#ffe7b4", shadow:"#e5703d", x:1239, y:152 },
  { name:"The Indigo Weave", color:"#80baff", bright:"#dbf2ff", shadow:"#426dc3", x:1163, y:145 },
];
const bindings = [
  "M-7 7L0-9 7 7M-5 2H5M0-9V9", "M-7-7L0 0-7 7M0-9V9M7-7L0 0 7 7",
  "M-7 0L0-9 7 0 0 9ZM-7 0H7", "M-7 9V-8L7 4V-8M-7 2L7 9",
  "M-7-6L0-9 7-6 0 0 7 6 0 9-7 6 0 0Z", "M-6-9V9M-6-3L7-8 2 1 7 8-6 5",
  "M-8-5H8M-5-9L0-5V9M5-9L0-5M-4 5L0 9 4 5", "M-6 7L-3-8 5-8 7 1 0 6-3 0M-7 8H7",
];
const leather = [
  ["#56302d","#b07b61"], ["#343150","#9d89b0"], ["#283b40","#789d8e"],
  ["#533d31","#b8996a"], ["#292e49","#6f83a9"], ["#402b3a","#a8768b"],
];

// Keep the palette consistent within each spell and use local gradients to cast its light onto the room.
function definitions(spell) {
  return `<defs>
  <linearGradient id="walls" x2=".92" y2=".74"><stop stop-color="#0c1019"/><stop offset=".67" stop-color="#302a39"/><stop offset="1" stop-color="#1b1723"/></linearGradient>
  <linearGradient id="alcove" x2=".78" y2="1"><stop stop-color="#110e19"/><stop offset=".52" stop-color="#24202e"/><stop offset="1" stop-color="#191522"/></linearGradient>
  <linearGradient id="stone" x2="1" y2=".62"><stop stop-color="#211c29"/><stop offset=".54" stop-color="#4a3a45"/><stop offset=".82" stop-color="#292232"/><stop offset="1" stop-color="#17121d"/></linearGradient>
  <linearGradient id="wood" x2=".19" y2="1"><stop stop-color="#5c3d3c"/><stop offset=".44" stop-color="#3b282c"/><stop offset="1" stop-color="#20181e"/></linearGradient>
  <linearGradient id="panel" x2="0" y2="1"><stop stop-color="#4d353b"/><stop offset=".2" stop-color="#2e2029"/><stop offset="1" stop-color="#18131a"/></linearGradient>
  <linearGradient id="pageLeft" x2="1" y2=".24"><stop stop-color="#b38d62"/><stop offset=".18" stop-color="#ead5a0"/><stop offset=".72" stop-color="#c7ac7e"/><stop offset="1" stop-color="#79627a"/></linearGradient>
  <linearGradient id="pageRight" x2="1" y2=".24"><stop stop-color="#785c73"/><stop offset=".27" stop-color="#cfb388"/><stop offset=".65" stop-color="#eddbaf"/><stop offset="1" stop-color="#c29967"/></linearGradient>
  <linearGradient id="leaf" x2=".7" y2="1"><stop stop-color="#e3c797"/><stop offset="1" stop-color="#977351"/></linearGradient>
  <linearGradient id="wax" x2="1" y2=".11"><stop stop-color="#64413a"/><stop offset=".5" stop-color="#e4b883"/><stop offset="1" stop-color="#8a5444"/></linearGradient>
  <linearGradient id="shadow"><stop stop-color="#090d16" stop-opacity=".74"/><stop offset=".54" stop-color="#100c17" stop-opacity=".18"/><stop offset=".86" stop-color="#130b18" stop-opacity="0"/></linearGradient>
  <radialGradient id="magic"><stop stop-color="${spell.color}" stop-opacity=".69"/><stop offset=".4" stop-color="${spell.shadow}" stop-opacity=".22"/><stop offset="1" stop-color="${spell.shadow}" stop-opacity="0"/></radialGradient>
  <radialGradient id="inkGlow"><stop stop-color="${spell.bright}" stop-opacity=".85"/><stop offset=".46" stop-color="${spell.color}" stop-opacity=".36"/><stop offset="1" stop-color="${spell.shadow}" stop-opacity="0"/></radialGradient>
  <radialGradient id="candle"><stop stop-color="#ffb974" stop-opacity=".43"/><stop offset=".45" stop-color="#ff9656" stop-opacity=".2"/><stop offset="1" stop-color="#e6764a" stop-opacity="0"/></radialGradient>
  <radialGradient id="vignette" cx=".71" cy=".38" r=".76"><stop offset=".42" stop-color="#140c18" stop-opacity="0"/><stop offset="1" stop-color="#090b12" stop-opacity=".72"/></radialGradient>
  <filter id="blur2" x="-.3" y="-.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="2.5"/></filter>
  <filter id="blur7" x="-.4" y="-.4" width="1.8" height="1.8"><feGaussianBlur stdDeviation="6"/></filter>
  <pattern id="dust" width="43" height="39" patternUnits="userSpaceOnUse"><path d="M2 4h2M33 9h1M13 18h2M35 30h2M7 33h1M23 4h1M24 26h1" stroke="#f9d8b0" opacity=".095"/></pattern>
  <clipPath id="shelf"><path d="M1294 345V77Q1392-18 1490 77V345Z"/></clipPath>
  </defs>`;
}

// Suggest age and depth with broken masonry courses, narrow edge highlights, and an arched bookcase.
function chamber(random, layout) {
  const stones = many(8, row => many(11, col => {
    const x = col*167 - (row%2)*81, y = row*61 - 16, n = Math.round(random()*20);
    return path(`M${x} ${y+n/6}h${155+n/2}l5 3M${x} ${y+5}l${n/3} 17-2 27`, "none","#866975",`opacity="${.05+random()*.15}"`);
  }));
  const levels = [108,177,252,328];
  const shelves = levels.map((y,row) => {
    let x = 1293;
    const rowBooks = many(15, () => {
      const w = 7 + Math.round(random()*10), h = 29 + Math.round(random()*33);
      const [spine,trim] = leather[Math.floor(random()*leather.length)];
      const book = rect(x,y-h,w,h,spine,`rx="2" stroke="#100d15" stroke-width="1.6"`) +
        path(`M${x+2} ${y-h+2}v${h-3}m1-${h-10}h${w-4}m-${w-4} 4h${w-4}m-${w-4} ${h-22}h${w-4}`,"none",trim,'opacity=".68"') +
        rect(x+4,y-h+13,Math.max(2,w-7),7,"#a9806b",'opacity=".38"');
      x += w + Math.round(random()*4);
      return book;
    });
    return rect(1290,y-62,205,64,row%2?"#201723":"#1b141c") + rowBooks +
      path(`M1290 ${y}H1496v8H1290Z`,"url(#panel)","#221824",'stroke-width="2"') +
      path(`M1290 ${y+1}H1496`,"none","#aa7560",'opacity=".37"');
  }).join("");
  return rect(0,0,W,H,"url(#walls)") + stones + rect(0,0,W,H,"url(#dust)") +
    at(layout.archX,0,path("M570 344V202Q579 51 910-28Q1241 51 1250 202V344Z","url(#alcove)","#302530",'stroke-width="9"') +
    path("M548 354V199Q552 50 910-39Q1268 50 1272 199V353","none","#1c1622",'stroke-width="30" opacity=".57"') +
    path("M550 354V199Q554 50 910-39Q1266 50 1270 199V353","none","#5c4754",'stroke-width="1.8" opacity=".52"') +
    path("M735 295V181Q750 80 908 37Q1068 84 1081 181V295Z","none","#654c5a",'stroke-width="2" opacity=".23"')) +
    at(layout.shelfX,0,path("M1280 350V70Q1392-41 1504 70V350Z","url(#stone)","#15101a",'stroke-width="6"') +
    g(shelves,'clip-path="url(#shelf)"') +
    path("M1294 349V77Q1392-18 1490 77V349M1285 348V73Q1392-32 1499 73V348","none","#a37460",'opacity=".51" stroke-width="1.5"')) +
    path("M1530 0L1530 356M1548 0L1548 382","none","#62424f",'stroke-width="3" opacity=".38"') +
    rect(0,0,W,H,"url(#shadow)");
}

// Desk geometry and its grain remain legible at tablet size but sit below the controls on a phone.
function desk(random) {
  const grain = many(34, i => {
    const x = 735+random()*760, y = 302 + random()*169, dx = 20+random()*155;
    return path(`M${x.toFixed(1)} ${y.toFixed(1)}q${dx/2} ${i%2?-5:7} ${dx} ${i%3?0:4}`,"none", i%3?"#a47665":"#261623", 'opacity=".22"');
  });
  return path("M771 287Q1007 277 1447 286L1585 457Q1492 486 752 486L652 443Z","url(#wood)","#241922",'stroke-width="4"') +
    grain + path("M651 444Q985 486 1586 457L1584 477Q1246 539 676 477Z","url(#panel)","#241923",'stroke-width="4"') +
    path("M655 445Q972 489 1582 457M686 468Q1069 512 1564 478","none","#b28266",'opacity=".45" stroke-width="2"') +
    path("M785 489L801 618 841 628 827 495M1469 495L1444 623 1491 629 1514 488","url(#panel)","#211720",'stroke-width="5"') +
    path("M823 506L832 612M1490 503L1471 612","none","#98664b",'opacity=".35" stroke-width="2"');
}

// An open grimoire uses curved page blocks, a sewn spine, hand-inked notes and a diagram.
function grimoire(spell, random) {
  const script = many(13,i => {
    const y = -40+i*6, w = 17+random()*48;
    return path(`M${-105+i*.65} ${y}q${w/2} -7 ${w} -1 m5 1h8`,"none","#5a3c3f",`opacity="${.28+random()*.28}" stroke-width="1.45"`) +
      path(`M37 ${y+4}q15 -4 ${28+random()*25} -3`,"none","#5a3c3f",'opacity=".57" stroke-width="1.45"');
  });
  return oval(0,42,169,31,"#0d0913",'opacity=".68" filter="url(#blur7)"') +
    path("M-141 21L-114-66Q-41-91 0-57Q62-87 122-63L151 20 134 48Q54 31 2 60Q-48 40-143 51Z","#381f35","#9f6c59",'stroke-width="2.5"') +
    path("M-132 33L-107-59Q-45-78 1-51Q54-80 116-57L140 31 133 41Q52 28 2 54Q-52 36-139 43Z","#896750","#edcc93",'stroke-width="2"') +
    path("M-133 34Q-58 22 1 46Q53 19 134 33M-135 39Q-61 28 1 50Q54 24 133 38","none","#ebc88e",'stroke-width="1" opacity=".75"') +
    path("M-130 29L-106-65Q-44-84 0-53L1 46Q-52 21-130 29Z","url(#pageLeft)","#f2daa4",'stroke-width="1.35"') +
    path("M0-53Q53-84 114-62L137 29Q53 18 1 46Z","url(#pageRight)","#f2daa4",'stroke-width="1.35"') +
    path("M0-52Q-5-6 1 44M-98-57Q-49-70-12-49L-13 32M104-55Q61-64 16-46L17 35","none","#835b55",'stroke-width="1.4" opacity=".55"') +
    script + at(83,-24, dot(0,0,22,"none",'stroke="#724950" opacity=".65"') +
      path("M0-18L17 12H-17ZM0-12L10 6H-10Z","none","#724950",'opacity=".7"')) +
    path("M-2 41Q8 56 30 75L23 77 20 86Q9 71-2 59Z","#8d3c4d","#bc6c65") +
    oval(5,-26,63,24,"url(#inkGlow)",'opacity=".7"') +
    path("M-30-17Q-8-37 4-22Q22-36 34-19M-12-24l4-9m19 7 6-8","none",spell.bright,'stroke-width="1.5" opacity=".83"');
}

// Smaller physical details give each variation the feel of an occupied study.
function props(random, layout) {
  const stack = many(layout.bookCount, i => {
    const x = 1379 + layout.shelfX / 2 + Math.round(random()*24), y = 311-i*15, w = 127 - i*12;
    const [cover, trim] = leather[(i+1)%leather.length];
    return at(x,y,path(`M0 0L${w-22}-6 ${w} 1 ${w} 11 18 18 0 12Z`,cover,trim,'stroke-width="1.4"') +
      path(`M19 5L${w-2} 0V10L19 15Z`,"#ab8e71")+
      path(`M22 8L${w-4} 3M24 12L${w-4} 6`,"none","#6f5148",'opacity=".62"')+
      path(`M5 3V11M11 5V13`,"none",trim,'stroke-width="2"'));
  });
  const candle = (x,y,s) => at(x,y, g(
    oval(0,-30,95,91,"url(#candle)") + oval(0,9,21,6,"#3e2830",'stroke="#a67257" stroke-width="2"') +
    path("M-10 6L-9-31Q0-38 9-32L11 5Q2 11-10 6Z","url(#wax)","#a46e52") +
    path("M-8-30Q-3-19 0-31Q7-22 7-15","none","#e0a875",'stroke-width="2.2"') +
    path("M0-33V-43","none","#51362f",'stroke-width="2"') +
    path("M0-38Q-12-41-2-54Q4-61 2-66Q17-49 6-39Z","#ffae5f") +
    path("M0-40Q-5-43 2-55Q8-47 3-40Z","#fff0b0"),`transform="scale(${s})"`));
  return stack + candle(layout.candleX,266,1.13) + (layout.secondCandle ? candle(layout.candleX+30,279,.71) : "") +
    (layout.notes ? at(layout.notesX,352,path("M-59-8L30-29 72-7 47 22-42 33Z","url(#leaf)","#a57a56",'opacity=".91"') +
      many(7,i=>path(`M${-36+i*3} ${i*4-3}l${31+random()*17} -6`,"none","#755348",'opacity=".68"')) +
      path("M28-11l13-8 12 5-4 14-16 2Z","none","#875248",'opacity=".68"')) : "") +
    at(layout.quillX,339,oval(0,14,17,5,"#190f1c") +
      path("M-13 6L-8-5-4-9V-14H5V-9L12-1 13 10Q0 16-13 10Z","#211b30","#986d70",'stroke-width="1.6"') +
      path("M1-10Q11-46 69-72Q61-61 43-41L15-32 32-34Q18-25 1-10Z","#947c91","#c8aeb6",'stroke-width="1.1"') +
      path("M2-13Q29-52 64-68","none","#ead2c5",'opacity=".6"'));
}

// Four authored silhouettes make the variation visible even where the header crops the drawing.
function shape(kind, i) {
  const a = i * Math.PI / 6;
  if (kind === 0) return {
    lines: dot(0,0,69,"none") + dot(0,0,52,"none",'stroke-dasharray="54 8 10 8"') +
      poly([[-54,31],[0,-60],[54,31]],"none") + poly([[-54,-31],[0,60],[54,-31]],"none") +
      dot(0,0,17,"none",'stroke-dasharray="4 3"') + path("M-19 0H19M0-21V21"),
    anchors: many(12,j=>at(...pt(81,j*Math.PI/6),path("M0-2L2 0 0 2-2 0Z","currentColor"))),
    rune: pt(86,a+Math.PI/12),
  };
  if (kind === 1) return {
    lines: path("M-92 46Q-119-20-58-69Q-25-98 8-87M92-46Q117 22 58 69Q25 98-8 87") +
      path("M-81 46Q-103-24-48-65M81-46Q103 24 48 65M-88 24L-76 27M89-23L75-27") +
      poly([[0,-81],[77,-5],[0,80],[-77,5]],"none") + poly([[0,-45],[41,0],[0,43],[-41,0]],"none") +
      path("M-39 0L-13-10 0-35 12-11 39 0 12 12 0 36-12 12ZM-28-29L29 29M-28 29L29-29"),
    anchors: path("M-106 12l12-10 1 13-12 10ZM106-12l-12 10-1-13 12-10Z","currentColor"),
    rune: pt(99,a+Math.PI/12),
  };
  if (kind === 2) return {
    lines: at(-53,24,poly([[0,-47],[40,23],[-40,23]],"none") + dot(0,0,23,"none") + path("M-20 4H20M0-20V24")) +
      at(7,-39,poly([[0,-50],[43,25],[-43,25]],"none") + dot(0,0,23,"none") + path("M-16-16L16 16M16-16L-16 16")) +
      at(61,32,poly([[0,-44],[38,22],[-38,22]],"none") + dot(0,0,21,"none") + path("M0-17L15 10-15 10Z")) +
      path("M-102 58Q-91-53-12-86M31-81Q95-61 108 28M-73 69Q2 100 78 68","none","inherit",'stroke-dasharray="7 6"'),
    anchors: path("M-53 17l6 7-6 7-6-7ZM7-46l6 7-6 7-6-7ZM61 25l6 7-6 7-6-7Z","currentColor"),
    rune: pt(96,a+Math.PI/12),
  };
  return {
    lines: path("M-110 58Q-78-36-4-31Q55-22 105-75M-103 76Q-59-8 2 3Q66 21 115-58M-119 37Q-81-55-12-61Q40-60 84-92") +
      path("M-100-64Q-58-29-35 15Q-12 57 27 63Q57 66 102 23M-91-77Q-38-48-8 7Q14 41 50 36Q77 32 112 7") +
      poly([[-60,-34],[-43,-16],[-54,3],[-75,-12]],"none") +
      poly([[-8,-48],[11,-32],[-6,-14],[-24,-32]],"none") +
      poly([[44,11],[62,28],[51,49],[32,33]],"none"),
    anchors: path("M-61-18l5 4-5 5-4-5ZM-6-37l5 5-5 5-5-5ZM49 27l6 5-6 5-5-5Z","currentColor"),
    rune: [-111 + i * 20, Math.round(64-i*12 + (i%2 ? 21 : -18))],
  };
}

// Draw soft reflections first, then crisp rune strokes and a ribbon of spell light rising from the book.
function spellwork(spell, kind, x, y, bx, by, random) {
  const ribbon = `M${bx+4} ${by-29}C${bx+84} ${by-78} ${x-74} ${y+116} ${x-29} ${y+65}S${x+70} ${y+40} ${x+30} ${y+13}`;
  const marks = many(12, i => {
    const [rx,ry] = shape(kind,i).rune;
    const symbol = bindings[Math.floor(random()*bindings.length)];
    return at(rx,ry,g(path(symbol),"transform=\"scale("+(i%3===0?1.17:.85)+")\""));
  });
  const geom = shape(kind,0);
  const core = g((geom.lines + geom.anchors + marks).replaceAll('stroke="none"','stroke="inherit"'),`color="${spell.bright}" stroke-linecap="round" stroke-linejoin="round"`);
  const embers = many(66,i => {
    const angle = random()*Math.PI*2, r = 54+random()*99;
    return dot((x + Math.cos(angle)*r).toFixed(1),(y + Math.sin(angle)*r*.74).toFixed(1),
      (i%9===0?2.1:.45+random()*1.35).toFixed(1),i%4===0?"#ffe0ac":spell.bright,`opacity="${(.17+random()*.66).toFixed(2)}"`);
  });
  return path(ribbon,"none",spell.color,'stroke-width="19" opacity=".45" filter="url(#blur7)"') +
    path(ribbon,"none",spell.bright,'stroke-width="2.7" opacity=".75"') +
    path(`M${bx-14} ${by-37}Q${bx-54} ${by-74} ${x+12} ${y+61}T${x+28} ${y+12}`,"none",spell.color,'stroke-width="2.2" opacity=".57"') +
    at(x,y,g(core,`stroke="${spell.color}" stroke-width="8" opacity=".65" filter="url(#blur7)"`) +
      g(core,`stroke="${spell.color}" stroke-width="5.6" opacity=".66" filter="url(#blur2)"`) +
      g(core,`stroke="${spell.bright}" stroke-width="2.8" opacity=".98"`)) + embers;
}

// Keep the variant name available for the review UI without adding text to the art.
export function renderStudy(characterName = "Orna") {
  const random = seeded(characterName);
  const kind = Math.floor(random() * spells.length), spell = spells[kind];
  const x = spell.x + Math.round(random()*36) - 18, y = spell.y + Math.round(random()*23) - 11;
  const bx = 1109 + Math.round(random()*57), by = 246 + Math.round(random()*15);
  // Keep the approved spell families while the architecture and desk props get independent seed streams.
  const arrangement = seedStream(characterName,"wizard","setting");
  const layout = {
    archX:between(-82,58,arrangement), shelfX:between(-34,53,arrangement),
    candleX:between(1294,1422,arrangement), notesX:between(922,1028,arrangement),
    quillX:between(1238,1349,arrangement), bookCount:between(2,5,arrangement),
    secondCandle:arrangement()>.42, notes:arrangement()>.32,
  };
  const artwork = definitions(spell) + chamber(random,layout) + oval(x,y+33,350,239,"url(#magic)") +
    desk(random) + oval(bx,by+57,294,144,"url(#magic)",'opacity=".47"') + props(random,layout) +
    at(bx,by,grimoire(spell,random)) +
    spellwork(spell,kind,x,y,bx,by,random) + rect(0,0,W,H,"url(#vignette)");
  return { variant:spell.name, lighting:layout.secondCandle?"Paired candlelight":"Single candlelight",
    extras:[layout.notes?"loose notes":null, layout.secondCandle?"second candle":null].filter(Boolean),
    focus:{x,y}, svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"><title>The Wizard's Study</title>${artwork}</svg>` };
}
