import type {GameAsset} from '../assets';

export const BUNDLED_MODELS=new Set(['m-a9fe918d9d51ea81','m-a5227642e7a2a22a','m-95c1d6b8d2ed8206','m-f569c1bbee9360a9','m-05389ace23b75c90','m-4745c4f13ae753e5','m-9cfe58fa91f94226','m-3a5e96b4afdc8b72','m-4b0af65406ffcde1','m-dfc1c1718a2a1115']);

export class ModelStreams {
  private loaded=new Set<string>();
  private pending=new Map<string,Promise<void>>();
  private disposed=false;
  constructor(private load:(asset:GameAsset)=>Promise<string>,private register:(json:string)=>void,private failed:(asset:GameAsset)=>void){}
  ensure(asset:GameAsset):Promise<void> {
    if(this.disposed||BUNDLED_MODELS.has(asset.id)||this.loaded.has(asset.id))return Promise.resolve();
    const active=this.pending.get(asset.id);if(active)return active;
    // A model belongs to this Unity instance, not to the cash/position snapshot that requested it.
    const request=Promise.resolve().then(()=>this.load(asset)).then(json=>{
      if(!this.disposed){this.register(json);this.loaded.add(asset.id);}
    }).catch(()=>{if(!this.disposed)this.failed(asset);}).finally(()=>this.pending.delete(asset.id));
    this.pending.set(asset.id,request);return request;
  }
  dispose(){this.disposed=true;this.pending.clear();}
}
