// SPDX-License-Identifier: Apache-2.0
import { common } from "./translations/common";
import styles from "./zh.module.css";
export default function ChineseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="zh-Hans" className={styles.chinese}>
      <p className={styles.notice}>{common.zh.notice}</p>
      {children}
    </div>
  );
}
