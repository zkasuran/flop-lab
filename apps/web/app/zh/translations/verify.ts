// SPDX-License-Identifier: Apache-2.0
import type { Chinese } from "./types";
const en = {
  title: "Verify",
  question: "Do the claims hold when checked from outside?",
  note: "Compare a claim with evidence collected from outside the network. Inspect missing evidence as carefully as a passing check.",
  harness: "Which documented claims have public evidence?",
  verify: "Do the settlement, receipt and attestation agree?",
  spec: "Which yellowpaper clauses can public devnet evidence settle?",
  contracts: "Do the network's tools return what they advertise?",
  indexer: "Do the indexer's totals agree with their parts?",
  economics: "Do rewards, emission and fees follow the spec?",
  metering: "How is effective FLOP measured and calibrated?",
  proofs: "What proofs are miners submitting and what do they cover?",
  invariants: "Which security invariants and failure cases can be checked from outside?",
};
const zh = {
  title: "验证",
  question: "从网络外部检查时，这些声明是否成立？",
  note: "将声明与从网络外部收集的证据对照。对缺失证据的审视应与通过的检查同样仔细。",
  harness: "哪些文档声明有公开证据？",
  verify: "结算、收据和证明是否一致？",
  spec: "公开的开发网证据能判定哪些黄皮书条款？",
  contracts: "网络工具的返回结果是否符合其声明？",
  indexer: "索引器的总数是否等于各部分之和？",
  economics: "奖励、发行和费用是否符合规范？",
  metering: "有效 FLOP 如何计量和校准？",
  proofs: "矿工提交了哪些证明？这些证明覆盖什么？",
  invariants: "哪些安全不变量和失败情形能从外部检查？",
} satisfies Chinese<typeof en>;
const metrics = {
  harness: { label: "一致性检查记录中的请求数", note: "本次运行还读取了公共网关，不代表当前运行状况。" },
  verify: { label: "记录中的通道开启区块", note: "由索引器报告，不是最终性证明。" },
  spec: { label: "规范证据中报告的 proofs24h", note: "这是报告字段，不是已部署运行时行为的证明。" },
  contracts: { label: "接口约定审计记录中的请求数", note: "已记录的探测，不代表服务当前可用。" },
  indexer: { label: "不变量审计记录中的请求数", note: "还读取了区块浏览器 API。一致性不等于独立的链证明。" },
  economics: { label: "经济参数对照样本中的结算数", note: "与固定版本目标对比，未验证发行或奖励到账。" },
  metering: { label: "矿工记录页中的校准对象数", note: "索引中的上限字段。缺少接受和到期区块，无法观测租约有效性。" },
  proofs: { label: "索引器查询记录中的证明行数", note: "直接路径的数据为空，不能证明付费通道缺少证据。" },
  invariants: { label: "固定版本矩阵中的参与方失败情形数", note: "引文覆盖范围。限定范围的检查不能验证整条安全规则。" },
};
export const verify = { en, zh, metrics };
