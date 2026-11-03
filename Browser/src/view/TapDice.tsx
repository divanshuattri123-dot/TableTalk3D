const DOTS:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function Face({value,side}:{value:number;side:string}){
  return <span className={`tap-die-face face-${side}`}>{Array.from({length:9},(_,i)=><i className={DOTS[value]!.includes(i)?'has-pip':''} key={i}/>)}</span>;
}
export default function TapDice({onThrow,disabled=false,utility=false}:{onThrow:()=>void;disabled?:boolean;utility?:boolean}){
  return <button type="button" className="tap-dice" disabled={disabled} aria-label={utility?'Roll dice for utility rent':'Roll dice'} title="Touch the dice to throw" onClick={onThrow}>
    <span className="tap-dice-pair" aria-hidden="true"><span className="tap-die first"><Face value={5} side="front"/><Face value={3} side="right"/><Face value={1} side="top"/></span><span className="tap-die second"><Face value={3} side="front"/><Face value={1} side="right"/><Face value={5} side="top"/></span></span>
    <span className="tap-dice-hint">Tap the dice</span>
  </button>;
}
