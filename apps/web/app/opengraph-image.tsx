// SPDX-License-Identifier: Apache-2.0
import { ImageResponse } from 'next/og';
export const alt = 'flop-lab. Open tools for FLOP devnet. Observe first. Build on evidence.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#101312', color: '#edf2e9', width: '100%', height: '100%', padding: 70 }}><div style={{ fontSize: 34 }}>flop-lab / FLOP devnet</div><div style={{ fontSize: 80, maxWidth: 900, lineHeight: 1.1 }}>Observe first. Build on evidence.</div><div style={{ fontSize: 26, color: '#bded89' }}>Independent community tools. Apache-2.0.</div></div>, size);
}
