// SPDX-License-Identifier: Apache-2.0
import type { Chinese } from "./types";
const en = {
  title: "Observe",
  question: "What is the network doing right now and over time?",
  note: "Follow dated public observations and compare changes across recordings. Open a tool to see the source and the limits of its sample.",
  history: "How has the devnet changed day by day?",
  explorer: "Which query explains this block, account or channel?",
  models: "Which models are served, at what price and are they registered?",
  sessions: "Where is each compute channel in its lifecycle?",
  finality: "Is the chain producing and finalizing blocks on time?",
  upgrades: "What changed in the runtime and in the spec?",
  status: "Are FLOP's public services answering?",
  community: "What are builders asking for and how long do public replies take?",
};
const zh = {
  title: "观测",
  question: "网络现在如何运行，又随时间发生了哪些变化？",
  note: "追踪注明时间的公开观测，比较不同记录中的变化。打开工具查看来源和样本范围。",
  history: "开发网每天发生了哪些变化？",
  explorer: "哪个查询能解释这个区块、账户或通道？",
  models: "提供了哪些模型？价格是多少？是否已登记？",
  sessions: "各计算通道处于生命周期的哪个阶段？",
  finality: "链是否按时出块并确认最终性？",
  upgrades: "运行时和规范发生了哪些变化？",
  status: "FLOP 的公共服务是否响应？",
  community: "开发者提出了哪些需求？公开回复需要多长时间？",
} satisfies Chinese<typeof en>;
const metrics = {
  status: {
    label: "网关探测记录的耗时（毫秒）",
    note: "一次注明时间且包含响应体的请求，不代表当前健康状况或持续在线率。",
  },
  community: { label: "抽样的近期 network 议题或拉取请求数", note: "有界公开样本。未观测更早的积压项目或私下回复。" },
  history: { label: "历史记录中的最新区块", note: "最近一次打包记录。分开采集的数据不构成原子快照。" },
  explorer: { label: "示例区块记录中的外部交易数", note: "索引器观测，不是最终确认包含性的证明。" },
  models: { label: "网关目录记录中列出的模型数", note: "服务方公布的列表，未验证推理或矿工可用性。" },
  sessions: { label: "首个记录页中的通道数", note: "这是一个记录页。生命周期视图将完整的有界采集结果与结算证据关联。" },
  finality: {
    label: "报告的最终性落后区块数",
    note: "注明时间的 API 链头数据，不含共识签名或最终确认前缀的存储证明。",
  },
  upgrades: {
    label: "记录对比中发生变化的附录 A 参数数",
    note: "固定版本规范的文本变化，不能确认已部署运行时发生升级。",
  },
};
export const observe = { en, zh, metrics };
