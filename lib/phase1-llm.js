// 阶段一：LLM 结构化输出。
// 模型只负责把会话上下文提炼为合法 JSON 公文提纲；任何 XML 标签、
// Markdown 字符、序号（编号由阶段二确定性生成）与占位符一律禁止。

import { serializeSessionLog } from "./log.js";
import { normalizeDraft, validateDraft } from "./schema.js";

const MAX_LOG_CHARS = 90000;

export function buildSystemPrompt() {
  return [
    "你是党政机关公文核稿员。你只做一件事：把用户提供的会话原始事件日志提炼为一篇严谨、事实准确的办理情况通报提纲，并以 JSON 输出。",
    "",
    "硬性纪律：",
    "1. 只输出一个 JSON 对象，禁止输出任何 JSON 以外的文字。",
    "2. 严禁输出任何 XML 标签（<w:...>、</...>、<.../> 等）。",
    "3. 严禁使用任何 Markdown 符号（#、*、_、`、[]、()、>、|、- 列表、围栏）。",
    "4. 段落内严禁自带序号（一、/（一）/1. 等），所有编号由系统自动生成。",
    "5. 严禁出现占位符（xxxx、×××、xxx、（空一行）、（空两格）等）。",
    "6. 不得虚构未发生事项；不得泄露密钥与凭据；不得复述思维链原文，只能概括决策依据与执行轨迹。",
    "7. 发文机关默认用“DeepSeek Harness 平台管理中心”，发文字号默认用“DSH发〔年份〕序号”格式（序号为阿拉伯数字），标题由你根据任务性质自拟，禁止照抄模板固定信息。",
    "",
    "JSON 结构（字段严格如下）：",
    '{"issuer":"发文机关全称","documentNumber":"DSH发〔2026〕1号","title":"发文机关关于事由的办理情况通报","recipient":"主送机关：","lead":"导语段落","sections":[{"title":"事项起因与背景","paragraphs":["事实段落"],"items":[{"title":"（一）层子条款文本，不带序号","items":[{"title":"（一）层下的1.层子条款文本，不带序号","items":["（1）层子条款文本，不带序号"]}]}]},{"title":"主要调度与技术执行过程","paragraphs":["事实段落"],"items":[]},{"title":"成果与验收结论","paragraphs":["事实段落"],"items":[]},{"title":"后续运行与归档要求","paragraphs":["事实段落"],"items":[]}],"attachments":["附件名称，无附件则留空数组"],"closing":"结语段落"}',
    "",
    "sections 可增删，但必须覆盖：事项起因与背景、主要调度与技术执行过程、成果与验收结论、后续运行与归档要求。",
    "items 层级说明：items 数组元素可以是字符串（即（一）层），也可以是对象 {title, items}（title 为（一）层文本，嵌套 items 为其下的 1. 层；再嵌套一层即（1）层）。所有层级的文本都不得自带序号。",
  ].join("\n");
}

export function extractJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回 JSON 对象");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function targetFromAgent(agent) {
  const current = agent?.session?.requestHeader?.()?.config;
  if (current?.provider && current?.model) return { provider: current.provider, model: current.model };
  if (agent?.options?.provider && agent?.options?.model) return { provider: agent.options.provider, model: agent.options.model };
  return null;
}

async function requestJson(ctx, target, system, user) {
  const messages = [
    { id: `hongtou-${Date.now()}-system`, role: "system", source: { kind: "plugin", plugin: "dsh-hongtou" }, content: [{ type: "text", text: system }] },
    { id: `hongtou-${Date.now()}`, role: "user", source: { kind: "plugin", plugin: "dsh-hongtou", form: "notice", summary: "拟制红头公文提纲" }, content: [{ type: "text", text: user }] },
  ];
  let output = "";
  let failure = null;
  for await (const chunk of ctx.llm.stream({
    ...target,
    messages,
    maxTokens: 5000,
    temperature: 0.2,
    stop: ["```"],
  })) {
    if (chunk.type === "text-delta") output += chunk.text;
    if (chunk.type === "block-end" && chunk.block?.type === "text" && !output) output += chunk.block.text;
    if (chunk.type === "finish" && chunk.reason?.kind === "error") failure = chunk.reason.error?.message ?? "模型调用失败";
    if (chunk.type === "finish" && chunk.reason?.kind === "aborted") failure = "模型调用被取消";
  }
  if (failure) throw new Error(failure);
  return output;
}

export async function draftWithModel(ctx, agent, snapshot, options = {}) {
  const target = targetFromAgent(agent);
  if (!target || !ctx?.llm?.stream) throw new Error("当前会话没有可复用的模型路由");
  const subject = options.subject ?? "当前会话事项办理情况";
  const log = serializeSessionLog(snapshot);
  const truncated = log.length > MAX_LOG_CHARS
    ? `${log.slice(0, Math.floor(MAX_LOG_CHARS * 0.55))}\n……中部技术日志因模型输入限额截断，统计仍以完整事件集为准……\n${log.slice(-Math.floor(MAX_LOG_CHARS * 0.45))}`
    : log;
  const user = `事由：${subject}\n\n完整事件日志：\n${truncated}`;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await requestJson(ctx, target, buildSystemPrompt(), user);
    try {
      const candidate = normalizeDraft(extractJson(raw), options);
      const verdict = validateDraft(candidate);
      if (!verdict.ok) throw new Error(`提纲校验未通过：${verdict.errors.join("；")}`);
      return { draft: candidate, provider: target.provider, model: target.model };
    } catch (error) {
      lastError = error;
      user = `${user}\n\n上一次输出被拒绝：${error.message}\n请严格按 JSON 结构重新输出，不要输出任何其他文字。`;
    }
  }
  throw lastError ?? new Error("模型拟制失败");
}
