// Class names and palettes are shared by the location recipes and review gallery.
const scenes = [
  ["artificer","Artificer","The Enchanter’s Workshop",["#1c2635","#294e52","#89d6cf","#c89560"]],
  ["barbarian","Barbarian","The Storm Camp",["#28212b","#674040","#fca778","#9a7862"]],
  ["bard","Bard","The Velvet Stage",["#291d31","#592744","#ffcb94","#b36a82"]],
  ["cleric","Cleric","The Votive Sanctuary",["#273345","#415075","#f7d899","#9fa5cb"]],
  ["druid","Druid","The Rootbound Grove",["#122c2c","#335440","#c8e896","#78a282"]],
  ["fighter","Fighter","The Fortress Yard",["#252f41","#5a4950","#ffba85","#8896ac"]],
  ["monk","Monk","The Mountain Cloister",["#263449","#505a6e","#f6bbab","#a3aead"]],
  ["paladin","Paladin","The Oath Chapel",["#30304a","#594468","#ffdc96","#aa92bb"]],
  ["ranger","Ranger","The Hidden Trail",["#162d35","#3b5752","#adcfba","#6c9f97"]],
  ["rogue","Rogue","The Thieves’ Passage",["#222437","#453650","#ebb37d","#8493ac"]],
  ["sorcerer","Sorcerer","The Broken Hall",["#26213e","#493266","#d597ff","#8f88ca"]],
  ["warlock","Warlock","The Pact Chamber",["#261a31","#482744","#ff8a9d","#a56b9a"]],
  ["wizard","Wizard","The Wizard’s Study",["#28223a","#42345b","#c299ff","#a8a2c4"]],
  ["alchemist","Alchemist","The Copper Laboratory",["#202c30","#3a5144","#d6ec88","#c98658"]],
  ["animist","Animist","The Wayside Shrine",["#1b3139","#35514a","#8de7d8","#b38f69"]],
  ["champion","Champion","The Vaulted Refuge",["#252e44","#364f65","#f7ce8f","#8cbbca"]],
  ["commander","Commander","The Field Pavilion",["#312634","#654248","#f2c18a","#b87c73"]],
  ["exemplar","Exemplar","The Dawn Shrine",["#332c44","#614859","#ffd68d","#bd9fb2"]],
  ["guardian","Guardian","The Iron Gatehouse",["#1c2b3b","#354a62","#a9c7e3","#7895b3"]],
  ["gunslinger","Gunslinger","The Canyon Powder Room",["#32232e","#664337","#f8b17b","#a98b6e"]],
  ["inventor","Inventor","The Mechanical Test Stand",["#2c2631","#594537","#ffd084","#a59a93"]],
  ["investigator","Investigator","The Lamplit Case Room",["#253038","#474444","#ffc581","#87a5ab"]],
  ["kineticist","Kineticist","The Broken Causeway",["#1d2e46","#345570","#8be6f8","#a4b5c6"]],
  ["magus","Magus","The Duelling Hall",["#242747","#4e4a73","#b3bbff","#a19ec9"]],
  ["necromancer","Necromancer","The Reliquary Crypt",["#222c34","#36544d","#a8dfb9","#879b94"]],
  ["oracle","Oracle","The Veiled Sanctuary",["#30243e","#594263","#f5bdf0","#a78caf"]],
  ["psychic","Psychic","The Still Chamber",["#28213e","#484672","#c8aaff","#9fa7d5"]],
  ["runesmith","Runesmith","The Rune Forge",["#32262e","#643d36","#ffb47e","#a99ba0"]],
  ["summoner","Summoner","The Threshold Chamber",["#1f303d","#355459","#93e5d8","#8aafb0"]],
  ["swashbuckler","Swashbuckler","The Harbour Bastion",["#1e2c45","#45516b","#f9c194","#9aafc5"]],
  ["thaumaturge","Thaumaturge","The Curio Cabinet",["#302337","#58414e","#f9b8c5","#ae889d"]],
  ["witch","Witch","The Hearth Cottage",["#30223c","#49394a","#d5b6e2","#b28b8b"]],
];

export const SEEDED_CLASS_SCENES = Object.freeze(Object.fromEntries(scenes.map(
  ([id, name, title, colours]) =>
    [id, Object.freeze({ id, name, title, colours:Object.freeze(colours) })]
)));
