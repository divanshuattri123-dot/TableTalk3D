import {useEffect,useRef} from 'react';
import {privacySections,publisher} from './release';

export default function PrivacySheet({onClose}:{onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  return <dialog ref={dialog} className="privacy-sheet" aria-labelledby="privacy-title" onCancel={onClose}>
    <header><div><small>{publisher.name} · Updated {publisher.updated}</small><h1 id="privacy-title">Privacy & support</h1></div><button type="button" autoFocus aria-label="Close privacy and support" onClick={onClose}>×</button></header>
    <div className="privacy-copy"><p className="privacy-preview">Test-build notice. Publisher contact setup is pending before public store release.</p>{privacySections.map(([title,copy])=><section key={title}><h2>{title}</h2><p>{copy}</p></section>)}
      <section><h2>Technical support</h2><p>Report game bugs with your app version, Android version and the steps that caused the problem. Avoid posting names, private room codes or other personal information in public reports.</p><a href={publisher.supportUrl} target="_blank" rel="noreferrer">Open public bug reports ↗</a>{publisher.supportEmail&&<p><a href={`mailto:${publisher.supportEmail}`}>{publisher.supportEmail}</a></p>}</section>
    </div>
  </dialog>;
}
