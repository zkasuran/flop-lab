// SPDX-License-Identifier: Apache-2.0
import type { Chinese } from "./types";
const en = {
  title: "Agents",
  question: "How does an agent spend, route and dispute safely?",
  note: "Inspect the evidence behind routing, budget limits and dispute review. Use the tools to explain a decision before an agent acts.",
  scoreboard: "Which miner has reliability evidence over time?",
  spendguard: "Will my policy hold when agents share one budget?",
  challenger: "Which challenge windows close next and what evidence is missing?",
  tclk: "Did this agent-to-agent deal follow the protocol?",
  mcp: "How does my agent call the read-only suite?",
  swaps: "Is this atomic swap safe to start?",
};
const zh = {
  title: "智能体",
  question: "智能体如何安全地支付、路由和处理争议？",
  note: "查看路由、预算限制和争议审查背后的证据。在智能体采取行动前，用工具解释决策依据。",
  scoreboard: "哪些矿工有长期的可靠性证据？",
  spendguard: "多个智能体共享预算时，我的策略是否仍然有效？",
  challenger: "哪些挑战窗口即将关闭？还缺少哪些证据？",
  tclk: "这笔智能体之间的交易是否遵循协议？",
  mcp: "我的智能体如何调用只读的工具集？",
  swaps: "这笔原子交换是否可以安全启动？",
} satisfies Chinese<typeof en>;
const metrics = {
  scoreboard: { label: "排名样本中的结算数", note: "有界样本，不代表矿工在线率。" },
  spendguard: { label: "策略示例目录中的模型数", note: "身份来自记录，策略预算和请求由脚本设定。" },
  challenger: { label: "审查样本中的结算数", note: "部分结算记录，不代表当前具备挑战资格。" },
  tclk: { label: "交易检查样本中的 HTLC 行数", note: "索引器的有界样本。哈希匹配不是支付证明。" },
  swaps: {
    label: "记录响应中未结的 FLOP_BTC 订单数",
    note: "订单与索引中的 HTLC 是不同对象。未验证跨链双方均已完成。",
  },
  mcp: { label: "本地 MCP 服务器列出的操作数", note: "由已构建服务器的 tools/list 生成。不代表托管服务的可用性。" },
};
export const agents = { en, zh, metrics };
