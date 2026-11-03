import type {PresentationFrame} from './plan';

export function frameTimeoutMs(frame:PresentationFrame,externalMotion:boolean){
  if(frame.kind==='card')return undefined;
  // Leave room for a slower frame, without an eight-second stall after a lost callback.
  return frame.duration+(externalMotion?Math.max(1250,Math.min(3000,frame.duration/2)):50);
}
