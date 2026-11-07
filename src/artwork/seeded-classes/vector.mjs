// Shared geometry for the 1600 by 640 banner canvas.
export const path = (d, fill = "none", stroke = "none", detail = "") =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" ${detail}/>`;
export const rect = (x,y,w,h,fill,detail="") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${detail}/>`;
export const oval = (x,y,rx,ry,fill,detail="") => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${detail}/>`;
export const circle = (x,y,r,fill,detail="") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${detail}/>`;
export const group = (markup, attributes="") => `<g ${attributes}>${markup}</g>`;
export const at = (x,y,markup,attributes="") => group(markup,`transform="translate(${x} ${y}) ${attributes}"`);
export const drawMany = (count, draw) => Array.from({length:count},(_,index)=>draw(index)).join("");
export const pick = (items, random) => items[Math.floor(random() * items.length)];
export const between = (min,max,random) => min + Math.floor(random() * (max - min + 1));

// Stable per class and canonical name. Separate streams keep a changed prop from reshuffling the rest.
export function seedStream(name, scene, layer) {
  let state = 2166136261;
  for (const character of `${scene}\0${String(name ?? "").trim().normalize("NFC")}\0${layer}`) {
    state = Math.imul(state ^ character.codePointAt(0),16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
