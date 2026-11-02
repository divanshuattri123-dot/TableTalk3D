import {describe,expect,it,vi} from 'vitest';
import {GameAudio,watchAudioPreview} from './gameAudio';

function setup(visible=true) {
  const tracks:{src:string;paused:boolean;volume:number;loop:boolean;preload:string;play:ReturnType<typeof vi.fn>;pause:ReturnType<typeof vi.fn>}[]=[];
  const audio=new GameAudio(src=>{
    const track={src,paused:true,volume:1,loop:false,preload:'',play:vi.fn(),pause:vi.fn()};
    track.play.mockImplementation(()=>{track.paused=false;return Promise.resolve();});
    track.pause.mockImplementation(()=>{track.paused=true;});
    tracks.push(track);return track;
  },visible);
  audio.configure({enabled:true,volume:.5,music:'city.ogg'});
  return {audio,tracks};
}

describe('mobile game audio',()=>{
  it('stops the captured preview when a track changes or the collection closes',()=>{
    const page=Object.assign(new EventTarget(),{hidden:false}),old={pause:vi.fn()},current={pause:vi.fn()};
    const stopOld=watchAudioPreview(old,page);stopOld();watchAudioPreview(current,page);
    expect(old.pause).toHaveBeenCalledOnce();page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));
    expect(old.pause).toHaveBeenCalledOnce();expect(current.pause).toHaveBeenCalledOnce();
  });
  it('pauses a hidden preview without automatically replaying it on return',()=>{
    const page=Object.assign(new EventTarget(),{hidden:true}),preview={pause:vi.fn()};
    watchAudioPreview(preview,page);expect(preview.pause).toHaveBeenCalledOnce();
    page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));expect(preview.pause).toHaveBeenCalledOnce();
  });
  it('waits for a player gesture before starting music or effects',()=>{
    const {audio,tracks}=setup();audio.play('dice.ogg');
    expect(tracks).toHaveLength(1);expect(tracks[0]!.play).not.toHaveBeenCalled();
    audio.unlock();expect(tracks[0]!.play).toHaveBeenCalledOnce();expect(tracks[0]!.loop).toBe(true);
  });
  it('sound off silences music and active effects, including future gestures',()=>{
    const {audio,tracks}=setup();audio.unlock();audio.play('dice.ogg');
    audio.configure({enabled:false,volume:.5,music:'city.ogg'});audio.unlock();audio.play('buy.ogg');
    expect(tracks).toHaveLength(2);expect(tracks.every(track=>track.paused)).toBe(true);
    expect(tracks[0]!.play).toHaveBeenCalledOnce();
  });
  it('pauses in the background and resumes only music on return',()=>{
    const {audio,tracks}=setup();audio.unlock();audio.play('dice.ogg');audio.setVisible(false);
    expect(tracks.every(track=>track.paused)).toBe(true);audio.play('rent.ogg');expect(tracks).toHaveLength(2);
    audio.setVisible(true);expect(tracks[0]!.play).toHaveBeenCalledTimes(2);
    expect(tracks[1]!.play).toHaveBeenCalledOnce();expect(tracks[1]!.paused).toBe(true);
  });
  it('does not start music when configured while hidden, and keeps mute on return',()=>{
    const {audio,tracks}=setup(false);audio.unlock();expect(tracks[0]!.play).not.toHaveBeenCalled();
    audio.configure({enabled:false,volume:.5,music:'city.ogg'});audio.setVisible(true);
    expect(tracks[0]!.play).not.toHaveBeenCalled();
  });
  it('changes music once, keeps playback through volume updates and stops a removed track',()=>{
    const {audio,tracks}=setup();audio.unlock();audio.configure({enabled:true,volume:.8,music:'city.ogg'});
    expect(tracks).toHaveLength(1);expect(tracks[0]!.play).toHaveBeenCalledOnce();expect(tracks[0]!.volume).toBeCloseTo(.32);
    audio.configure({enabled:true,volume:.8,music:'night.ogg'});expect(tracks[0]!.paused).toBe(true);expect(tracks[1]!.play).toHaveBeenCalledOnce();
    audio.configure({enabled:true,volume:.8});expect(tracks[1]!.paused).toBe(true);
  });
  it('limits overlapping effects and applies volume to currently playing sounds',()=>{
    const {audio,tracks}=setup();audio.unlock();for(let i=0;i<4;i++)audio.play(`effect-${i}.ogg`);
    expect(tracks[1]!.paused).toBe(true);expect(tracks.slice(2).every(track=>!track.paused)).toBe(true);
    audio.configure({enabled:true,volume:.2,music:'city.ogg'});expect(tracks.slice(2).map(track=>track.volume)).toEqual([.2,.2,.2]);
    audio.dispose();expect(tracks.every(track=>track.paused)).toBe(true);
  });
  it('contains rejected autoplay promises and can retry after a later gesture',async()=>{
    const {audio,tracks}=setup();tracks[0]!.play.mockRejectedValueOnce(new Error('gesture required'));
    audio.unlock();await Promise.resolve();audio.unlock();expect(tracks[0]!.play).toHaveBeenCalledTimes(2);
  });
});
