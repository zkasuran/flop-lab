// SPDX-License-Identifier: Apache-2.0
import type { Chinese } from "./types";
const en = {
  title: "Build",
  question: "How do I integrate with FLOP correctly?",
  note: "Start with the public interfaces and examples you can replay. Trace a result to its documented contract before integrating it.",
  x402: "Does my API speak FLOP's 402 protocol correctly?",
  kestra: "Read the devnet and check settlements in a dated Kestra flow.",
  sdk: "Do the FLOP SDKs behave as documented?",
  console: "What does each public tool return and how is its devnet cost estimated?",
  start: "How do I start a FLOP agent that is safe by default?",
  yellowpaper: "What does the yellowpaper say beside the observed value?",
  knowledge: "What does the network's own knowledge catalog say?",
  export: "How do I get devnet data into a spreadsheet or notebook?",
  python: "How do I use flop-lab from Python?",
  openapi: "How do I read the suite's results as an API?",
  action: "Can I bound FLOP evidence checks in CI?",
};
const zh = {
  title: "构建",
  question: "如何正确接入 FLOP？",
  note: "从公共接口和可重放的示例开始。接入前，先将结果追溯到文档中声明的接口约定。",
  x402: "我的 API 是否正确实现了 FLOP 的 402 协议？",
  kestra: "使用注明时间的 Kestra 工作流读取开发网并检查结算。",
  sdk: "FLOP SDK 的行为是否符合文档？",
  console: "各公共工具返回什么？如何估算其开发网成本？",
  start: "如何创建一个默认配置注重安全的 FLOP 智能体？",
  yellowpaper: "与观测值对照时，黄皮书如何规定？",
  knowledge: "网络自身的知识目录如何描述它？",
  export: "如何将开发网数据导入电子表格或笔记本？",
  python: "如何通过 Python 使用 flop-lab？",
  openapi: "如何通过 API 读取工具集的结果？",
  action: "我能否在 CI 中限定 FLOP 证据检查的范围？",
} satisfies Chinese<typeof en>;
const metrics = {
  export: { label: "导出记录中的区块行数", note: "有界记录。导出完成不能证明已覆盖整条链。" },
  x402: { label: "支付预览中的结算数", note: "公开结算不能证明向商户支付了款项。" },
  kestra: { label: "工作流记录中读取的结算数", note: "保存的摘录保留了原始有界查询的行数。" },
  sdk: { label: "SDK 运行记录中失败的检查数", note: "固定版本产物配合脚本化传输，不代表实时网络故障。" },
  console: { label: "MCP 发现记录中的工具数", note: "仅反映发现结果。并非每项工具都有输出模式或已在控制台启用。" },
  start: { label: "入门示例重放中的已登记模型数", note: "已记录的发现结果，不是当前报价或支出估算。" },
  yellowpaper: { label: "固定版本黄皮书中的参数数", note: "固定版本规范条目。目录一致性不验证已部署的运行时存储。" },
  knowledge: { label: "知识清单记录中的概念数", note: "目录中的声明。未验证来源溯源或运行时行为。" },
  openapi: { label: "API 磁带样本中的结算行数", note: "随包提供的算术摘要。未验证推理结果或当前网络健康状况。" },
  action: { label: "已记录磁带中通过的算术检查数", note: "抽样的托管资金与显示比例算术。未验证推理或当前状态。" },
};
export const build = { en, zh, metrics };
