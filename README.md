# dsh-tool-hongtou

DeepSeek Harness 红头公文总结插件（Cordis 主机侧插件）——**两阶段解耦流水线**。

## 架构

```
/ hongtou [事由/标题]
  │
  ├─ 会话上下文：ctx.sessionQuery.readSession() 读取完整原始事件日志
  │
  ├─ 阶段一：LLM 结构化输出（lib/phase1-llm.js）
  │    · 只输出合法 JSON 提纲，严禁手写 XML 标签与 Markdown 符号
  │    · 输出经 schema 校验（lib/schema.js）+ Markdown/占位符清洗
  │    · 失败自动重试一次；仍失败回退确定性提炼（lib/fallback.js，同为 JSON）
  │
  └─ 阶段二：确定性排版渲染（lib/phase2-render.js）
       · Node.js 纯代码解析 JSON，注入 templates/document-skeleton.xml 骨架
       · 序号（一、/（一）/1.）、字体、行距、红线全部由代码确定性生成
       · 最终校验：无文本框/批注/注释/占位符/Markdown 残留 → 落盘 output/
```

## 关键保证

- **版式 100% 复刻标准红头公文样板**（`templates/document-skeleton.xml` 由一次性构建脚本从样板真实片段组装）：
  - 完整复制样板 `<w:fonts>`（含方正粗宋简体/华文中宋/宋体/仿宋_GB2312/黑体/楷体等）、`<w:styles>`（11 个样式）、`<w:docPr>`、`<w:sectPr>`（含页眉页脚与页码框架）；
  - 红头机关名 = VML 艺术字 `v:textpath`（华文中宋加粗、fillcolor=red、height 51pt，宽度按机关名字数自适应居中）；
  - 红色分割线 = 样板原样双 VML 线条（3pt 粗线 from 5.25pt,53.2pt → 1.5pt 细线 60.65pt，横跨版心）；
  - 文号段 `first-line=4960`、标题段宋体加粗 2 号居中 `right=654`、正文段 `first-line-chars=200`（首行缩进 2 字符）、落款段 `first-line=645`+前导空格、日期段 `first-line-chars=1400`、全程 `spacing line=560 exact`（28 磅固定行距）、`snapToGrid off`；
  - 模板**不含任何文本框、批注**；最终文档经 split 移除注入占位符，无注释残留。
- **模型零排版权**：LLM 输出在进入渲染层前经过 `stripMarkdown`（链接、强调、列表、代码符号、表格管道）与 `hasForbiddenContent`（xxxx、×××、（空一行）、（空两格）、（此处填写…）等）双重清洗；非法内容直接回退，绝不进入文档。
- **序号确定性生成**：`sections` 编号 `一、二、…`，子条款编号 `（一）（二）…`，由阶段二按数组顺序生成，杜绝模型序号错乱。

## 安装 / 挂载

插件通过 `dsh.bundle.patch` 声明挂载行。安装到 web profile：

```bash
# 从 npm 安装
dsh plugin --profile web add dsh-tool-hongtou

# 或从 GitHub 安装
dsh plugin --profile web add github:ExElectron/dsh-tool-hongtou
```

或手动在 profile 的 `package.json` 中添加依赖并声明 bundle：

```jsonc
"dependencies": {
  "dsh-tool-hongtou": "^0.2.0"
  // 或 "dsh-tool-hongtou": "github:ExElectron/dsh-tool-hongtou"
},
"dsh": { "profile": { "bundles": ["dsh-tool-hongtou"] } }
```

挂载后**重启 dsh**（web profile 在启动时装配 bundle 补丁），然后在会话中输入：

```
/hongtou
/hongtou 红头公文插件重构事项
```

## 开发

```bash
# 语法检查与单元测试（dsh 沙箱内需 --test-isolation=none，避免子进程管道 EPERM）
node --check lib/index.js && node --check lib/schema.js && node --check lib/phase1-llm.js && node --check lib/phase2-render.js
node --test --test-isolation=none test/schema.test.js test/phase1.test.js test/phase2.test.js test/e2e.test.js
```

## 结构

- `lib/index.js` — Cordis 插件入口（`apply` / `inject` / `name`），两阶段编排与落盘。
- `lib/phase1-llm.js` — 阶段一：LLM 结构化 JSON 输出（system 强约束、JSON 提取、校验重试）。
- `lib/schema.js` — JSON schema 校验、Markdown/占位符清洗、提纲规范化。
- `lib/phase2-render.js` — 阶段二：模板注入渲染、转义、序号生成、生成后校验。
- `lib/fallback.js` — 确定性回退提炼（模型不可用时）。
- `lib/log.js` — 会话事件日志序列化与统计。
- `templates/document-skeleton.xml` — Word 2003 XML 模板骨架（标准红头版心，无文本框/批注）。
- `test/` — schema / phase1 / phase2 / 端到端测试。
