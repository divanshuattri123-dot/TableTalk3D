interface Track {
  readonly paused:boolean;
  volume:number;
  loop:boolean;
  preload:string;
  play():Promise<void>;
  pause():void;
}
interface AudioSettings {enabled:boolean;volume:number;music?:string}

export function watchAudioPreview(track:Pick<Track,'pause'>|null,document:EventTarget&{readonly hidden:boolean}) {
  const visibility=()=>{if(document.hidden)track?.pause();};
  document.addEventListener('visibilitychange',visibility);visibility();
  return()=>{document.removeEventListener('visibilitychange',visibility);track?.pause();};
}

export class GameAudio {
  private settings:AudioSettings={enabled:false,volume:0};
  private music?:Track;
  private sounds:Track[]=[];
  private unlocked=false;
  constructor(private create:(src:string)=>Track,private visible:boolean) {}

  configure(settings:AudioSettings) {
    if(settings.music!==this.settings.music) {
      this.music?.pause();
      this.music=settings.music?this.create(settings.music):undefined;
      if(this.music){this.music.loop=true;this.music.preload='none';}
    }
    this.settings=settings;
    if(this.music)this.music.volume=settings.volume*.4;
    this.sounds.forEach(sound=>sound.volume=settings.volume);
    this.sync();
  }
  unlock() {this.unlocked=true;this.sync();}
  setVisible(visible:boolean) {this.visible=visible;this.sync();}
  private audible() {return this.visible&&this.unlocked&&this.settings.enabled&&this.settings.volume>0;}
  private sync() {
    if(!this.audible()) {
      this.music?.pause();this.sounds.forEach(sound=>sound.pause());this.sounds=[];
    } else if(this.music?.paused) this.start(this.music);
  }
  private start(track:Track) {
    // Android can revoke autoplay permission after suspension; a later gesture may retry.
    void track.play().catch(()=>{});
  }
  play(src:string) {
    if(!this.audible())return;
    this.sounds=this.sounds.filter(sound=>!sound.paused);
    if(this.sounds.length>=3)this.sounds.shift()?.pause();
    const sound=this.create(src);sound.volume=this.settings.volume;
    this.sounds.push(sound);this.start(sound);
  }
  dispose() {
    this.music?.pause();this.sounds.forEach(sound=>sound.pause());
    this.music=undefined;this.sounds=[];this.settings={...this.settings,music:undefined};
  }
}
