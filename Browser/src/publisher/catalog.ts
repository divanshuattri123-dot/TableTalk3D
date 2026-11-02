export const STORE_PRODUCTS = [
  { id:'brass_dragon',kind:'token',name:'Brass Dragon',description:'A mechanical dragon with a warm brass finish.',assetId:'m-4b0af65406ffcde1',icon:'054_TokenIcon_Golden_Dragon',accent:'#b5863c',tag:'SIGNATURE PIECE' },
  { id:'samurai_red',kind:'token',name:'Crimson Samurai',description:'A sculpted samurai piece in deep crimson.',assetId:'m-f569c1bbee9360a9',icon:'035_TokenIcon_Tokyo_SamuraiHelmet',accent:'#ab3548',tag:'TOKYO COLLECTION' },
  { id:'atlantic_lantern',kind:'token',name:'Atlantic Lantern',description:'Bring a little old-world glow to your table.',assetId:'m-a5227642e7a2a22a',icon:'013_TokenIcon_Atlantic_Lantern',accent:'#397a87',tag:'ATLANTIC COLLECTION' },
  { id:'remove_ads',kind:'no_ads',name:'Remove Ads',description:'One upgrade for an uninterrupted table. No gameplay advantages.',assetId:undefined,icon:undefined,accent:'#264c65',tag:'ONE-TIME UPGRADE' }
] as const;
export type ProductId=typeof STORE_PRODUCTS[number]['id'];
export type PreviewReceipt={productId:ProductId;receiptId:string;mode:'preview'};
export type PreviewWallet={receipts:PreviewReceipt[];equipped?:ProductId};
export type WalletAction={type:'GRANT_TEST';productId:ProductId;receiptId:string}|{type:'EQUIP';productId:ProductId}|{type:'CLASSIC'};
export const emptyWallet=():PreviewWallet=>({receipts:[]});
export const owns=(wallet:PreviewWallet,id:ProductId)=>wallet.receipts.some(r=>r.mode==='preview'&&r.productId===id);
export function reducePreviewWallet(wallet:PreviewWallet,action:WalletAction):PreviewWallet {
  if(action.type==='CLASSIC')return {...wallet,equipped:undefined};
  const product=STORE_PRODUCTS.find(p=>p.id===action.productId);if(!product)return wallet;
  if(action.type==='EQUIP')return product.kind==='token'&&owns(wallet,product.id)?{...wallet,equipped:product.id}:wallet;
  if(!action.receiptId||owns(wallet,product.id))return wallet;
  return {...wallet,receipts:[...wallet.receipts,{productId:product.id,receiptId:action.receiptId,mode:'preview'}]};
}
export function readPreviewWallet(raw:string|null):PreviewWallet {
  try {const value=JSON.parse(raw??'{}');if(!Array.isArray(value.receipts))return emptyWallet();
    const receipts=value.receipts.filter((r:PreviewReceipt)=>r?.mode==='preview'&&typeof r.receiptId==='string'&&STORE_PRODUCTS.some(p=>p.id===r.productId));
    const wallet:PreviewWallet={receipts};if(STORE_PRODUCTS.some(p=>p.id===value.equipped&&p.kind==='token')&&owns(wallet,value.equipped))wallet.equipped=value.equipped;
    return wallet;
  }catch{return emptyWallet();}
}
