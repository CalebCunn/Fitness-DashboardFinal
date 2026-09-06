import {useEffect,useRef} from 'react';
export function useDialog(active,onClose){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{if(!active)return;const previous=document.activeElement,dialog=document.querySelector('[role="dialog"]');if(!dialog)return;
 const focusables=()=>[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(e=>e.getClientRects().length);
 focusables()[0]?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();close.current();}if(e.key==='Tab'){const list=focusables(),first=list[0],last=list[list.length-1];if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus?.();};},[active]);
}
