import { path, rect, oval, circle, group, at, drawMany, between, pick, seedStream } from "./vector.mjs";

export const P = path, R = rect, E = oval, C = circle, G = group, T = at, N = drawMany;
export const line = (d, colour, width = 1, opacity = 1) =>
  P(d,"none",colour,`stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" opacity="${opacity}"`);
export const placed = (x,y,scale,markup,angle=0) =>
  T(x,y,G(markup,`transform="rotate(${angle}) scale(${scale})"`));

const times = [
  { name:"Dawn", colour:"#ffd7a0", sky:"#876777" },
  { name:"Mist", colour:"#bbd9de", sky:"#606b88" },
  { name:"Dusk", colour:"#ffc6a4", sky:"#876078" },
  { name:"Moonlight", colour:"#c4d7ff", sky:"#515485" },
];
const gradient = (id, x2, y2, stops) => `<linearGradient id="${id}" x2="${x2}" y2="${y2}">${stops.map(([pos,c,o])=>`<stop offset="${pos}" stop-color="${c}" stop-opacity="${o??1}"/>`).join("")}</linearGradient>`;
const glow = (id, colour, opacity) => `<radialGradient id="${id}"><stop stop-color="${colour}" stop-opacity="${opacity}"/><stop offset=".46" stop-color="${colour}" stop-opacity="${opacity*.29}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`;

// Create one palette and independent streams for the architecture, focal object, and accents.
export function composition(scene, characterName, variant) {
  const stream = layer => seedStream(characterName,scene.id,layer);
  const mood = stream("paint-light");
  const time = pick(times,mood);
  const [deep, mid, bright, trim] = scene.colours;
  const x = between(1140,1235,stream("paint-focus"));
  const wash = between(1040,1430,mood);
  const magic = ["#b998ff","#79e3d3","#ffb578","#9cc8ff"][variant%4];
  const rockStops = [[0,deep],[.22,mid],[.55,deep],[.76,mid],[1,"#28232c"]];
  const defs = `<defs>
  ${gradient("room","100%","70%",[[0,"#0a111c"],[.44,deep],[.77,mid],[1,"#1e1929"]])}
  ${gradient("night","7%","100%",[[0,deep],[.45,time.sky],[.68,time.sky],[1,time.colour]])}
  ${gradient("air","0%","100%",[[0,time.colour,0],[.48,time.colour,.52],[1,time.colour,0]])}
  ${gradient("flagstone","25%","100%",[[0,mid],[.58,deep],[1,"#11121d"]])}
  ${gradient("stone","84%","79%",rockStops)}
  ${gradient("recess","28%","100%",[[0,"#080e19"],[.64,deep],[1,mid]])}
  ${gradient("wood","15%","100%",[[0,"#ab7654"],[.18,"#775044"],[.6,"#452b31"],[1,"#221725"]])}
  ${gradient("oak","90%","16%",[[0,"#281c28"],[.32,"#775446"],[.58,"#51353a"],[.8,"#92674c"],[1,"#211923"]])}
  ${gradient("paper","64%","100%",[[0,"#c49e72"],[.32,"#edd5a1"],[.66,"#ae815d"],[1,"#8c6260"]])}
  ${gradient("steel","92%","62%",[[0,"#353142"],[.25,"#98aabb"],[.43,"#4b5266"],[.48,"#d1ced0"],[.66,"#77758b"],[1,"#352e42"]])}
  ${gradient("brass","82%","70%",[[0,"#392837"],[.22,"#9f6b46"],[.42,"#e1b77c"],[.51,"#ae7654"],[.72,"#72534e"],[1,"#d3a876"]])}
  ${gradient("fabric","95%","32%",[[0,"#231928"],[.27,mid],[.37,deep],[.56,mid],[.69,deep],[.89,mid],[1,"#24192a"]])}
  ${gradient("leather","35%","100%",[[0,"#7f4948"],[.39,"#5d353d"],[1,"#2d2230"]])}
  ${gradient("bark","86%","20%",[[0,"#1d2730"],[.26,"#444039"],[.5,"#75614c"],[.71,"#3d3733"],[1,"#181f28"]])}
  ${gradient("water","10%","100%",[[0,deep],[.32,mid],[.52,trim],[.78,deep],[1,"#18232d"]])}
  ${gradient("glass","100%","100%",[[0,trim,.23],[.32,bright,.62],[.53,trim,.21],[.83,deep,.72],[1,bright,.36]])}
  ${glow("sun",time.colour,.72)}${glow("ember","#ffb36b",.87)}${glow("magic",magic,.72)}${glow("accent",bright,.65)}
  ${glow("shadow","#0a0b15",.76)}
  <linearGradient id="scrim"><stop stop-color="#0a101a" stop-opacity=".84"/><stop offset=".32" stop-color="#0a101a" stop-opacity=".56"/><stop offset=".58" stop-color="#0b101a" stop-opacity=".11"/><stop offset="1" stop-color="#111421" stop-opacity="0"/></linearGradient>
  <linearGradient id="bottom" x2="0" y2="100%"><stop offset=".62" stop-color="#10101b" stop-opacity="0"/><stop offset="1" stop-color="#10101b" stop-opacity=".53"/></linearGradient>
  <filter id="mist" x="-.4" y="-.5" width="1.8" height="2"><feGaussianBlur stdDeviation="5"/></filter>
  <pattern id="pigment" width="83" height="61" patternUnits="userSpaceOnUse">
    <path d="M2 5h1m32 8h1m39-5h2M13 19h2m51 4h1M9 42h1m32-15h2m8 18h1m25 5h1M4 57h1m23-5h2" stroke="#fbe3bb" opacity=".13"/>
  </pattern></defs>`;
  return { stream, time, deep, mid, bright, trim, x, wash, magic, defs };
}

// Door and vault silhouettes use a separate dark interior, projecting jambs, and wedge-shaped joints.
export function archD(width,height,drop=0) {
  const half=width/2, spring=-height*.56, crown=-height+drop;
  return `M${-half} 0V${spring}Q${-half} ${crown+24} 0 ${crown}Q${half} ${crown+24} ${half} ${spring}V0`;
}
// Preserve a quiet left side, with a printed grain rather than repeated ornamental scratch marks.
export function finish() {
  return R(0,0,1600,640,"url(#pigment)",'opacity=".53"')+
    R(0,0,1600,640,"url(#bottom)")+R(0,0,1600,640,"url(#scrim)");
}
