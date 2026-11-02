export const WORLDS=[
  {id:'theme000',name:'Classic City',detail:'The original city, roads and countryside',accent:'#3c926e'},
  {id:'theme001',name:'Winter Village',detail:'Snow-covered buildings and winter scenery',accent:'#6b9fcb'},
  {id:'theme002',name:'Harbour World',detail:'Coastal buildings and a different skyline',accent:'#248eaa'},
  {id:'theme003',name:'Paris World',detail:'Boulevards, landmarks and gardens',accent:'#a06c98'},
  {id:'theme004',name:'Neon City',detail:'A colourful metropolitan skyline',accent:'#d76590'},
  {id:'theme005',name:'London World',detail:'A landmark-filled city centre',accent:'#bd4c47'},
  {id:'theme006',name:'Blossom City',detail:'Japanese-inspired buildings and blossoms',accent:'#d483a4'},
  {id:'theme007',name:'Future City',detail:'Futuristic towers and layered architecture',accent:'#597dca'},
  {id:'theme008',name:'Forest World',detail:'A woodland city from the supplied collection',accent:'#709452'},
  {id:'theme009',name:'Garden World',detail:'A colourful garden-themed world',accent:'#b881bf'},
  {id:'theme010',name:'Underwater World',detail:'Coral, sea plants and underwater structures',accent:'#398fa9'}
] as const;
export type WorldId=typeof WORLDS[number]['id'];
export const isWorldId=(id:string):id is WorldId=>WORLDS.some(world=>world.id===id);
export const worldInfo=(id?:WorldId)=>WORLDS.find(world=>world.id===id)??WORLDS[0];
