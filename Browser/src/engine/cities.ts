import type { Tile } from './types';

export const CITIES = [
  {id:'india',name:'India & Tricity',tag:'Your neighbourhoods',accent:'#df6631',country:'India'},
  {id:'london',name:'London',tag:'Mayfair to Old Kent Road',accent:'#d52b42',country:'United Kingdom'},
  {id:'atlantic',name:'Atlantic City',tag:'The classic boardwalk',accent:'#1687ae',country:'United States'},
  {id:'new-york',name:'New York',tag:'A city that never sleeps',accent:'#d69a22',country:'United States'},
  {id:'paris',name:'Paris',tag:'Boulevards & landmarks',accent:'#8b61a8',country:'France'},
  {id:'tokyo',name:'Tokyo',tag:'From Asakusa to Shibuya',accent:'#d65b8d',country:'Japan'}
] as const;
export type CityId = typeof CITIES[number]['id'];
export const cityInfo = (id?:CityId) => CITIES.find(c=>c.id===id) ?? CITIES[0];
export const isCityId = (id:string): id is CityId => CITIES.some(c=>c.id===id);
const streets:Record<Exclude<CityId,'india'>,readonly string[]> = {
  london:['Old Kent Road','Whitechapel Road','The Angel Islington','Euston Road','Pentonville Road','Pall Mall','Whitehall','Northumberland Avenue','Bow Street','Marlborough Street','Vine Street','Strand','Fleet Street','Trafalgar Square','Leicester Square','Coventry Street','Piccadilly','Regent Street','Oxford Street','Bond Street','Park Lane','Mayfair'],
  atlantic:['Mediterranean Avenue','Baltic Avenue','Oriental Avenue','Vermont Avenue','Connecticut Avenue','St. Charles Place','States Avenue','Virginia Avenue','St. James Place','Tennessee Avenue','New York Avenue','Kentucky Avenue','Indiana Avenue','Illinois Avenue','Atlantic Avenue','Ventnor Avenue','Marvin Gardens','Pacific Avenue','North Carolina Avenue','Pennsylvania Avenue','Park Place','Boardwalk'],
  'new-york':['Brooklyn Heights','DUMBO','Harlem','Washington Heights','Upper West Side','Chelsea','East Village','Lower East Side','SoHo','Little Italy','Greenwich Village','Flatiron District','Union Square','Gramercy','Madison Avenue','Park Avenue','Midtown','Hudson Yards','Rockefeller Center','Times Square','Central Park','Fifth Avenue'],
  paris:['Belleville','Ménilmontant','La Villette','Bastille','République','Montparnasse','Butte-aux-Cailles','Quartier Latin','Canal Saint-Martin','Le Marais','Saint-Germain-des-Prés','Montmartre','Pigalle','Opéra','Madeleine','Place Vendôme','Champs-Élysées','Rue de Rivoli','Place de la Concorde','Les Invalides','Tour Eiffel','Le Louvre'],
  tokyo:['Yanaka','Ueno','Asakusa','Nippori','Akihabara','Kanda','Nihonbashi','Sumida','Shinbashi','Ikebukuro','Kichijōji','Ebisu','Nakameguro','Shinjuku','Harajuku','Omotesandō','Aoyama','Roppongi','Marunouchi','Ginza','Shibuya','Tokyo Tower']
};
const rails:Record<Exclude<CityId,'india'>,readonly string[]> = {
  london:['King’s Cross Station','Marylebone Station','Fenchurch Street Station','Liverpool Street Station'],
  atlantic:['Reading Railroad','Pennsylvania Railroad','B. & O. Railroad','Short Line'],
  'new-york':['Grand Central Terminal','Penn Station','World Trade Center','Atlantic Terminal'],
  paris:['Gare du Nord','Gare de Lyon','Gare de l’Est','Gare Saint-Lazare'],
  tokyo:['Tokyo Station','Shinjuku Station','Ueno Station','Shinagawa Station']
};
const groupOffsets:Record<string,number>={brown:0,lightBlue:2,pink:5,orange:8,red:11,yellow:14,green:17,darkBlue:20};
// Only names change. A city never changes deed IDs, prices, rent or card destinations.
export function themedBoard(board:readonly Tile[],city:CityId):readonly Tile[] {
  if(city==='india')return board;
  const counts:Record<string,number>={};let railway=0,utility=0,extension=0;
  return board.map(tile=>{
    let name:string|undefined;
    if(tile.kind==='property') {
      const offset=groupOffsets[tile.group];
      if(offset!==undefined){const n=counts[tile.group]??0;name=streets[city][offset+n];counts[tile.group]=n+1;}
      else {const n=extension++;name=`${streets[city][n%22]} ${n<22?'East':'West'}`;}
    } else if(tile.kind==='railroad') name=rails[city][railway++];
    else if(tile.kind==='utility') name=utility++===0?'Electric Company':'Water Works';
    else if(tile.kind==='tax' && tile.amount===100) name='Luxury Tax';
    return name?{...tile,name,boardLabel:name,region:cityInfo(city).name,detail:tile.kind==='tax'?tile.detail:`${cityInfo(city).name} · ${tile.kind==='railroad'?'Rail connection':tile.kind==='utility'?'Public utility':'City property'}`} : tile;
  });
}
