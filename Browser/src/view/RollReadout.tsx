import type {CSSProperties} from 'react';
import type {PresentationFrame} from '../presentation/plan';

export default function RollReadout({frame,name,color}:{frame:PresentationFrame;name?:string;color:string}){
  const dice=frame.dice??[],total=dice.reduce((sum,value)=>sum+value,0),doubles=dice.length===2&&dice[0]===dice[1];
  return <aside className="roll-readout" role="status" aria-live="polite" aria-atomic="true" aria-label="Dice result" style={{'--roll-color':color} as CSSProperties}>
    <div className="roll-readout-heading"><b>{name??'Player'}</b><span>{frame.text.includes('utility rent')?'Utility roll':doubles?'Doubles':'Dice result'}</span></div>
    <div className="roll-readout-values">{dice.map((value,index)=><span className="roll-face" key={index} aria-label={`Die ${index+1}: ${value}`}>{value}</span>)}<span className="roll-equals" aria-hidden="true">=</span><strong aria-label={`Total ${total}`}>{total}</strong></div>
  </aside>;
}
