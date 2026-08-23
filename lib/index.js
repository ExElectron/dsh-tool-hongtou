// dsh-hongtou 插件入口：两阶段解耦流水线编排。
// 阶段一（LLM 结构化 JSON）→ 阶段二（Node.js 确定性注入 XML 模板）→ 校验落盘。

import { writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { draftWithModel } from "./phase1-llm.js";
import { deterministicDraft } from "./fallback.js";
import { renderDocument, validateGeneratedXml } from "./phase2-render.js";

const name = "dsh-tool-hongtou";
const inject = ["commands", "sessionQuery", "llm"];

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));

// 公章自动探测：插件目录或会话工作区下放置 seal.png（或 assets/seal.png）
// 即自动盖章；不存在则维持原有无水印输出，完全向后兼容。
async function findSeal(workspace) {
  const candidates = [
    join(PLUGIN_DIR, "seal.png"),
    join(PLUGIN_DIR, "assets", "seal.png"),
    join(workspace, "seal.png"),
    join(workspace, "assets", "seal.png"),
  ];
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      /* 继续探测下一个候选路径 */
    }
  }
  return null;
}

function sanitizeFilename(value) {
  return String(value ?? "").replace(/[\\/:*?"<>|\s]/gu, "_").replace(/_+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 60);
}

function timestampTag(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function run(ctx, invocation) {
  const agent = invocation.agent;
  const sessionId = agent?.session?.id;
  const date = new Date();
  const subjectRaw = invocation.rawInput.trim();
  const subject = subjectRaw || "当前会话事项办理情况";

  const snapshot = await ctx.sessionQuery.readSession(sessionId);
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  if (events.length === 0) {
    return { kind: "error", text: "当前会话尚未产生任何事件记录，无法生成公文。请先完成至少一轮对话后重试。" };
  }

  // 阶段一：LLM 只输出结构化 JSON 提纲；失败则回退到确定性提炼（同为 JSON 提纲）。
  let draft = null;
  let provenance = "确定性提炼";
  try {
    const result = await draftWithModel(ctx, agent, snapshot, { subject });
    draft = result.draft;
    provenance = `模型拟制（${result.provider}/${result.model}）`;
  } catch (error) {
    ctx.logger?.warn?.(`dsh-hongtou: 阶段一模型拟制失败，回退确定性提炼：${error?.message ?? error}`);
    draft = deterministicDraft(snapshot, { subject });
  }

  // 阶段二：Node.js 纯代码渲染，注入 Word 2003 XML 模板骨架。
  const workspace = agent?.workspace?.cwd ?? process.cwd();
  const seal = await findSeal(workspace);
  const xml = await renderDocument(draft, { date, seal });
  const failures = validateGeneratedXml(xml);
  if (failures.length) {
    return { kind: "error", text: `生成的公文 XML 校验未通过：${failures.join("；")}` };
  }

  const outputDir = join(workspace, "output");
  await mkdir(outputDir, { recursive: true });
  const tag = timestampTag(date);
  const filename = `红头公文_${sanitizeFilename(subject)}_${tag}.xml`;
  const filePath = join(outputDir, filename);
  await writeFile(filePath, xml, "utf8");

  const toolCount = events.filter((event) => /(?:tool|command|subagent|job)/iu.test(String(event?.type ?? ""))).length;
  return {
    kind: "success",
    text: [
      `红头公文已生成：${filePath}`,
      `生成方式：${provenance}`,
      `公文标题：${draft.title}`,
      `发文字号：${draft.documentNumber}`,
      `正文结构：${draft.sections.map((section) => section.title).join("；")}`,
      `事件核验：共 ${events.length} 条，工具调度 ${toolCount} 条`,
      seal ? `公章：已加盖（${seal}）` : "公章：未配置（插件目录放置 seal.png 后自动盖章）",
    ].join("\n"),
  };
}

function apply(ctx) {
  ctx.commands.register({
    name: "hongtou",
    description: "将当前会话完整上下文生成为红头公文 Word 2003 XML",
    input: { hint: "[事由/标题]" },
    handler: (invocation) => run(ctx, invocation),
  });
}

export { apply, inject, name };
