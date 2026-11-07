// Habitats share the existing scene compositor. Each place owns its terrain, main feature and local objects.
const palettes = {
  aberration: ["Aberration", "#201d36", "#454068", "#bdadf4", "#9286b6"],
  beast: ["Beast", "#1c2e2a", "#425742", "#d7ca95", "#859572"],
  celestial: ["Celestial", "#25324b", "#5a5d82", "#ffe3aa", "#b8b0c8"],
  construct: ["Construct", "#242b37", "#4f5555", "#f1bc7c", "#95aba9"],
  dragon: ["Dragon", "#302333", "#684748", "#f6b478", "#ae8b87"],
  elemental: ["Elemental", "#213249", "#42667b", "#a0e1dd", "#8ca6b9"],
  fey: ["Fey", "#1d2f38", "#456359", "#eab2f4", "#96af9d"],
  fiend: ["Fiend", "#291a2a", "#6d343d", "#ffa77c", "#b67f81"],
  giant: ["Giant", "#253444", "#526674", "#d1d6bc", "#9daeb0"],
  humanoid: ["Humanoid", "#283349", "#565b68", "#e6bc90", "#aa98a2"],
  monstrosity: ["Monstrosity", "#252936", "#4a5459", "#d7bb8a", "#8f9b9a"],
  ooze: ["Ooze", "#1b2b30", "#3f574b", "#badd83", "#91a98c"],
  plant: ["Plant", "#172f2b", "#3d5d46", "#c7df93", "#7b9d79"],
  undead: ["Undead", "#222a3b", "#3f4858", "#b5d9cd", "#85999e"],
  generic: ["General adventurer", "#242f43", "#4c6174", "#efd5a3", "#98a9bd"],
};

const inventories = {
  relics: [["crystals","lens","reliquary","cards","candles","shells","urn","compass"],["stones","moss","cairn","lantern","urn","reeds"]],
  distortion: [["crystals","feathers","shells","lens","stones","hourglass","reliquary","incense"],["stones","moss","cairn","urn","reeds"]],
  astronomy: [["lens","compass","folio","map","hourglass","ink","ledger","crystals","wax"],["books","satchel","crate","lantern","stones"]],
  wildTrail: [["antler","bones","feathers","herbs","flowers","stones","moss","reeds","shells"],["moss","reeds","stones","cairn","antler"]],
  spring: [["reeds","shells","flowers","herbs","feathers","moss","stones","crystals","offering"],["reeds","moss","stones","cairn","basket"]],
  dawn: [["offering","vials","flowers","candles","reliquary","icon","incense","bell","folio"],["urn","moss","lantern","cairn","flowers"]],
  gears: [["gear","hammer","tongs","rivets","billets","chisels","scales","lens","ledger"],["crate","barrel","chain","lantern","satchel"]],
  quarry: [["chisels","hammer","rivets","stones","rope","crystals","compass","map","billets"],["stones","cairn","chain","crate","barrel"]],
  treasure: [["coins","reliquary","blade","shield","crystals","horn","scales","urn","keys"],["crate","chain","urn","stones","satchel"]],
  scorched: [["billets","blade","shield","chain","stones","coins","horn","rivets","tongs"],["stones","chain","cairn","crate","towerBanner"]],
  wind: [["stones","feathers","crystals","compass","map","rope","herbs","horn","flask"],["stones","cairn","moss","reeds","satchel"]],
  shoreline: [["rope","seaMap","compass","shells","powder","satchel","horn","flask","feathers"],["crate","barrel","rope","lantern","stones"]],
  twilight: [["flowers","herbs","feathers","moss","crystals","shells","offering","incense","stones"],["moss","reeds","cairn","flowers","stones"]],
  embers: [["wax","reliquary","candles","chain","cards","bones","incense","crystals","icon"],["urn","stones","cairn","chain","lantern"]],
  hall: [["horn","shield","axe","flask","candles","letters","urn","blade","books"],["towerBanner","barrel","lantern","basket","crate"]],
  trade: [["scales","coins","ledger","letters","offering","herbs","dice","shells","keys","flask"],["crate","barrel","basket","satchel","lantern"]],
  track: [["blade","rope","antler","bones","shield","stones","feathers","lantern","herbs"],["stones","moss","crate","cairn","reeds"]],
  seepage: [["vials","flask","stones","crystals","keys","chain","shells","tincture","rivets"],["stones","moss","reeds","chain","urn"]],
  grave: [["urn","incense","bones","candles","icon","reliquary","flowers","cards","wax"],["cairn","moss","stones","urn","lantern"]],
  expedition: [["map","compass","rope","flask","lantern","satchel","letters","feathers","herbs","blade"],["basket","stones","lantern","crate","cairn"]],
  study: [["folio","ink","ledger","books","wax","hourglass","lens","letters","candles"],["books","satchel","urn","basket","lantern"]],
};

const entries = {
  aberration: [
    ["sunken-orrery", "The Sunken Orrery", "cavern", "thoughtField", "ground", "distortion", [32,-4,1.08]],
    ["folded-gate", "The Folded Gate", "ruins", "pactGate", "ground", "distortion", [36,-10,1.04]],
    ["hollow-star", "The Hollow Star Observatory", "observatory", "astrolabe", "stoneDesk", "astronomy", [37,-13,1.05]],
    ["aqueduct-rift", "The Rift Beneath the Aqueduct", "undercroft", "boundThreshold", "threshold", "relics", [39,-8,1.07]],
  ],
  beast: [
    ["pine-game-trail", "The Pine Game Trail", "grove", "trailPrints", "ground", "wildTrail", [34,4,1.04]],
    ["scree-den", "The Den Behind the Scree", "cavern", "rockDen", "ground", "wildTrail", [36,-7,1.06]],
    ["reedbed-watering", "The Reedbed Watering Place", "marsh", "lilyBed", "ground", "spring", [33,-5,1.07]],
    ["river-run", "The River Run", "riverbank", "crossing", "ground", "wildTrail", [32,1,1.03]],
  ],
  celestial: [
    ["sun-gate", "The Sun Gate", "sanctuary", "sunGate", "threshold", "dawn", [40,-9,1.03]],
    ["court-above-clouds", "The Court Above the Clouds", "cloudCourt", "oathAltar", "threshold", "dawn", [35,-4,1.04]],
    ["dawn-well", "The Well of First Light", "grove", "healingWell", "ground", "dawn", [36,-9,1.03]],
    ["open-reliquary", "The Open-Air Reliquary", "ruins", "relicPlinth", "ground", "relics", [32,-5,1.09]],
  ],
  construct: [
    ["assembly-furnace", "The Assembly Furnace", "forgeHall", "machine", "stoneDesk", "gears", [34,-7,1.08]],
    ["gear-sluice", "The Gear Sluice", "undercroft", "sluiceWheel", "threshold", "gears", [42,-5,1.07]],
    ["stoneworks-yard", "The Stoneworks Yard", "ruins", "liftWinch", "ground", "quarry", [44,0,1.03]],
    ["calibration-dome", "The Calibration Dome", "observatory", "enchantingRig", "desk", "gears", [36,-14,1.06]],
  ],
  dragon: [
    ["gilded-hoard", "The Gilded Hoard", "cavern", "hoard", "ground", "treasure", [37,-5,1.13]],
    ["scorched-watchtower", "The Scorched Watchtower", "highCliff", "scorchedTower", "ground", "scorched", [40,-6,1.07]],
    ["hoarfrost-eyrie", "The Hoarfrost Eyrie", "mountainPass", "iceClawLedge", "ground", "wind", [31,-8,1.08]],
    ["fallen-tribute-gate", "The Fallen Tribute Gate", "ruins", "tributeGate", "threshold", "treasure", [39,-8,1.12]],
  ],
  elemental: [
    ["kiln-caldera", "The Kiln Caldera", "magmaShelf", "elemental", "ground", "scorched", [38,4,1.1], "fire"],
    ["living-tide", "The Living Tide", "harbour", "elemental", "ground", "shoreline", [38,-49,1.05], "water"],
    ["exposed-fault", "The Exposed Fault", "badlands", "elemental", "ground", "quarry", [34,-5,1.09], "earth"],
    ["wind-scoured-pass", "The Wind-Scoured Pass", "mountainPass", "elemental", "ground", "wind", [43,-3,1.09], "air"],
  ],
  fey: [
    ["lanternwood-crossing", "The Lanternwood Crossing", "twilightMeadow", "fungalRing", "ground", "twilight", [37,-6,1.09]],
    ["bramble-court", "The Court Behind the Brambles", "ruins", "livingArch", "ground", "twilight", [36,-4,1.07]],
    ["stillwater-door", "The Stillwater Door", "riverbank", "boundThreshold", "ground", "spring", [36,-7,1.03]],
    ["hollow-toadstool", "The Hollow Toadstool Hall", "cavern", "rootPool", "ground", "twilight", [38,-8,1.09]],
  ],
  fiend: [
    ["ember-threshold", "The Ember Threshold", "magmaShelf", "pactGate", "ground", "embers", [36,-6,1.04]],
    ["ashen-vault", "The Ashen Summoning Vault", "undercroft", "summonGate", "threshold", "embers", [40,-9,1.04]],
    ["contract-atrium", "The Contract Atrium", "sanctuary", "pactContract", "stoneDesk", "embers", [31,-7,1.08]],
    ["burning-keep", "The Road Beneath the Burning Keep", "badlands", "scorchedTower", "ground", "scorched", [42,-6,1.06]],
  ],
  giant: [
    ["titan-road", "The Titan’s Boulder Road", "mountainPass", "giantBridge", "ground", "quarry", [35,-7,1.1]],
    ["jarl-table", "The Abandoned Table of the Jarl", "greatHall", "giantSeat", "threshold", "hall", [42,-6,1.08]],
    ["mountain-quarry", "The Mountain Quarry", "highCliff", "liftWinch", "ground", "quarry", [36,-3,1.07]],
    ["gate-above-pines", "The Gate Above the Pines", "grove", "sunGate", "ground", "wildTrail", [40,-2,1.16]],
  ],
  humanoid: [
    ["tradesmen-court", "The Tradesmen’s Court", "oldStreet", "marketStall", "threshold", "trade", [37,-4,1.08]],
    ["walled-hall", "The Walled Hall", "greatHall", "armorialRack", "threshold", "hall", [40,-7,1.09]],
    ["boatman-landing", "The Boatman’s Landing", "harbour", "sailRig", "ground", "shoreline", [27,-56,1.03]],
    ["camp-edge", "The Edge of Camp", "pavilion", "campfire", "ground", "expedition", [35,-2,1.07]],
  ],
  monstrosity: [
    ["old-trap-road", "The Old Trap Road", "badlands", "snappedSnare", "ground", "track", [38,-2,1.09]],
    ["span-of-webs", "The Span of Webs", "cavern", "webbedPassage", "ground", "track", [39,-5,1.06]],
    ["scarred-ruin", "The Scarred Ruin", "ruins", "clawLedge", "ground", "quarry", [39,-9,1.07]],
    ["abandoned-shields", "The Marsh of Abandoned Shields", "marsh", "trailPrints", "ground", "track", [36,1,1.1]],
  ],
  ooze: [
    ["stained-cistern", "The Stained Cistern", "canal", "seepage", "threshold", "seepage", [23,-11,1.05]],
    ["alkahest-spill", "The Alkahest Spill", "workroom", "brokenVat", "threshold", "seepage", [32,-2,1.07]],
    ["gel-cavern", "The Gel Cavern", "cavern", "acidPool", "ground", "seepage", [37,-8,1.09]],
    ["sunk-drain", "The Sunk Drain", "undercroft", "seepage", "threshold", "seepage", [44,-5,1.13]],
  ],
  plant: [
    ["briar-gate", "The Briar’s Gate", "ruins", "livingArch", "ground", "twilight", [37,-3,1.11]],
    ["lily-tangle", "The Lily-Tangle", "marsh", "lilyBed", "ground", "spring", [33,-8,1.1]],
    ["fern-hollow", "The Fern Hollow", "grove", "fungalRing", "ground", "wildTrail", [37,-6,1.1]],
    ["root-undercroft", "The Root-Worked Undercroft", "undercroft", "rootPool", "threshold", "twilight", [39,-6,1.09]],
  ],
  undead: [
    ["sealed-sepulchre", "The Sealed Sepulchre", "undercroft", "graveRite", "threshold", "grave", [38,-7,1.09]],
    ["forgotten-graveyard", "The Forgotten Graveyard", "graveyard", "graveLamps", "ground", "grave", [38,-8,1.06]],
    ["black-fen-cairns", "The Cairns of the Black Fen", "marsh", "wardStones", "ground", "grave", [38,-3,1.05]],
    ["doorless-ossuary", "The Ossuary Without Doors", "cavern", "wardedMirror", "ground", "grave", [38,-7,1.09]],
  ],
  generic: [
    ["first-light-gate", "The Gate at First Light", "oldStreet", "wardGate", "threshold", "hall", [38,-4,1.07]],
    ["stillwater-ford", "The Stillwater Ford", "riverbank", "crossing", "ground", "expedition", [31,0,1.03]],
    ["coast-watch", "The Watch on the Coast", "harbour", "sailRig", "ground", "shoreline", [28,-56,1.04]],
    ["reading-room", "The Lamplit Reading Room", "scriptorium", "lecternBook", "stoneDesk", "study", [33,-3,1.04]],
    ["meadow-camp", "The Meadow Camp", "pavilion", "campfire", "ground", "expedition", [38,-2,1.07]],
    ["windward-waymarker", "The Windward Waymarker", "highCliff", "trailGear", "ground", "wind", [37,-6,1.04]],
    ["roadside-shrine", "The Moonlit Roadside Shrine", "sanctuary", "healingWell", "threshold", "dawn", [42,-3,1.05]],
    ["lanterns-below", "The Lanterns Below", "canal", "skiff", "waterline", "shoreline", [33,-3,1.06]],
    ["roadwardens-hall", "The Hall of the Roadwardens", "greatHall", "armorialRack", "threshold", "hall", [40,-4,1.07]],
    ["merchant-nook", "The Travelling Merchant’s Nook", "timberLodge", "marketStall", "threshold", "trade", [39,-9,1.04]],
    ["lost-mountain-bridge", "The Lost Bridge in the Mountains", "mountainPass", "giantBridge", "ground", "wind", [37,-7,1.05]],
    ["glimmer-cave", "The Glimmer at the Cave Mouth", "cavern", "rootPool", "ground", "spring", [38,-7,1.07]],
    ["old-sundial", "The Sundial at the Old Observatory", "observatory", "astrolabe", "stoneDesk", "astronomy", [35,-14,1.03]],
    ["buried-gate", "The Buried Gate", "badlands", "wardStones", "ground", "quarry", [37,-6,1.08]],
    ["lanternwood-clearing", "The Lanternwood Clearing", "twilightMeadow", "fungalRing", "ground", "twilight", [35,-4,1.06]],
    ["broken-watchtower", "The Broken Watchtower", "ruins", "scorchedTower", "ground", "track", [36,-7,1.06]],
  ],
};

// Store habitat names separately from their seed domains so class and creature streams stay independent.
export const habitatScenes = Object.freeze(Object.fromEntries(Object.entries(palettes).map(([id,[name,...colours]]) => [
  id, Object.freeze({ id:"habitat:"+id, name, colours:Object.freeze(colours) })
])));

// The renderer takes the same recipe shape for every class and habitat.
export const habitatLocations = Object.freeze(Object.fromEntries(Object.entries(entries).map(([id,rows]) => [
  id, Object.freeze(rows.map(([key,title,setting,feature,support,inventory,frame,element]) => Object.freeze({
    key,title,setting,feature,support,inventory:inventories[inventory],frame:Object.freeze(frame),element
  })))
])));
