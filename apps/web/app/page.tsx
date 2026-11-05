// SPDX-License-Identifier: Apache-2.0
import { tools, toolHref } from '@/content/tools';
import { CopyButton } from '@/components/controls';
import { Reveal } from '@/components/reveal';

const command = 'curl --fail https://api.flop.network/v1/models';
export default function Home() {
  return <>
    <section className="hero" aria-labelledby="pitch">
      <div><p className="eyebrow">Independent tools / FLOP devnet</p><h1 id="pitch">Observe first.<br />Build on evidence.</h1>
        <p className="intro">Open tools for a network where agents pay miners for AI inference. Inspect what happened. See what is still unverified.</p>
        <div className="hero-actions"><a className="button" href="#tools">Explore the tools <span aria-hidden="true">↓</span></a><a href="https://docs.flop.network">Read the protocol ↗</a></div>
      </div>
      <aside className="hero-panel"><p className="eyebrow">Field notes / Devnet</p><h2>Evidence before confidence.</h2><p className="muted">Live observations are being connected. No network measurements are shown in this build.</p></aside>
    </section>
    <section className="section" id="tools" aria-labelledby="tools-heading">
      <div className="section-heading"><div><p className="eyebrow">The workbench</p><h2 id="tools-heading">One question. One tool.</h2></div><p className="muted">Planned tools link to their package location. They are not ready to run. Each tool will publish its evidence and limits.</p></div>
      <Reveal><div className="tool-grid">{tools.map(tool => <a className="tool-card" href={toolHref(tool)} key={tool.slug}>
        <div className="card-top"><span className="eyebrow">{tool.slug}</span><span className={`badge ${tool.status}`}>{tool.status}</span></div>
        <h3>{tool.name}</h3><p>{tool.tagline}</p><span className="card-link">{tool.status === 'planned' ? tool.repoPath : 'Open tool'} ↗</span>
      </a>)}</div></Reveal>
    </section>
    <section className="section" aria-labelledby="start-heading"><div className="section-heading"><div><p className="eyebrow">Start with a read</p><h2 id="start-heading">Ask the network yourself.</h2></div><p className="muted">The public model list is keyless. This command reads gateway data. It does not send inference or move funds.</p></div>
      <div className="command"><code>{command}</code><CopyButton text={command} label="Copy command" /></div>
    </section>
  </>;
}
