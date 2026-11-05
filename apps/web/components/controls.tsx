// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useRef, useState } from 'react';
import { tools, toolHref } from '@/content/tools';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [status, setStatus] = useState(label);
  return <button className="quiet-button" aria-live="polite" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setStatus('Copied'); }
    catch { setStatus('Select text to copy'); }
  }}>{status}</button>;
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.dataset.theme === 'light'); }, []);
  return <button className="quiet-button" aria-label="Light theme" aria-pressed={light} onClick={() => {
    const next = !light;
    document.documentElement.dataset.theme = next ? 'light' : 'dark';
    try { localStorage.setItem('flop-theme', next ? 'light' : 'dark'); } catch { /* Storage is optional. */ }
    setLight(next);
  }}>{light ? 'Dark' : 'Light'}</button>;
}

export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const open = () => { setQuery(''); dialog.current?.showModal(); input.current?.focus(); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close(); else open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const matches = tools.filter(tool => `${tool.name} ${tool.tagline}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <button className="quiet-button" onClick={open}>Find tool <span className="shortcut mono">/</span></button>
    <dialog ref={dialog} aria-labelledby="palette-title" onClick={event => { if (event.target === dialog.current) dialog.current.close(); }} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const links = Array.from(dialog.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
      if (!links.length) return;
      event.preventDefault();
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
    }}>
      <div className="palette-head"><h2 id="palette-title">Find a tool</h2><button className="quiet-button" onClick={() => dialog.current?.close()}>Close</button></div>
      <input ref={input} className="palette-search" aria-label="Search tools" placeholder="Search by name or task" value={query} onChange={event => setQuery(event.target.value)} />
      <ul className="palette-list">{matches.map(tool => <li key={tool.slug}><a href={toolHref(tool)} onClick={() => dialog.current?.close()}>{tool.name}<span className={`badge ${tool.status}`}>{tool.status}</span></a></li>)}</ul>
      {!matches.length && <p className="palette-empty muted" role="status">No tools match this search.</p>}
    </dialog>
  </>;
}
