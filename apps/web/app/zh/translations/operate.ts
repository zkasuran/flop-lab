// SPDX-License-Identifier: Apache-2.0
import type { Chinese } from "./types";
const en = {
  title: "Operate",
  question: "Is my miner or validator ready to join?",
  note: "Compare a host with sourced operator requirements. Keep unknown checks visible before deciding what to run.",
  doctor: "Is this machine ready to mine or validate?",
  staking: "What stake does my miner or validator need and what can it lose?",
  watch: "How do I get told when something on the network changes?",
};
const zh = {
  title: "运维",
  question: "我的矿工或验证者是否已准备好加入？",
  note: "将主机条件与注明来源的运营要求对照。决定运行什么之前，保留并查看结果未知的检查。",
  doctor: "这台机器是否已准备好挖矿或验证？",
  staking: "我的矿工或验证者需要多少质押？可能损失什么？",
  watch: "网络发生变化时，如何获得通知？",
} satisfies Chinese<typeof en>;
const metrics = {
  doctor: { label: "主机探测记录中的逻辑 CPU 数", note: "探测命令：nproc。这是记录中的主机，不是你运行浏览器的设备。" },
  staking: { label: "质押记录页中的矿工数", note: "索引中的余额和容量，不是运行时资格或校准租约证明。" },
  watch: { label: "保存的轮询中向来源发出的请求数", note: "有界轮询记录，不是持续监控或当前服务健康状态。" },
};
export const operate = { en, zh, metrics };
