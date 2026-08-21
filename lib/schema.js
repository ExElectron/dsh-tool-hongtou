// 结构化 JSON schema 校验与公文文本清洗（阶段一与阶段二共用）。
// 所有动态文本在进入渲染层前必须经过本模块：剥除 Markdown 语法、占位符、
// 排版动作字符与控制字符，只保留纯中文公文语料。

export const CN_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const FORBIDDEN_PATTERNS = [
  /x{3,}/iu,            // xxxx / xxx 占位
  /×{2,}/u,             // ×× 占位
  /（\s*空[一二两]?行\s*）/u, // （空一行）
  /（\s*空[一二两]?格\s*）/u, // （空两格）
  /（\s*此处[^）]*）/u,      // （此处填写…）
  /（\s*下?略\s*）/u,        // （略）/（下略）
];

const MARKDOWN_PATTERNS = [
  [/^#{1,6}\s*/gmu, ""],                    // 行首 ATX 标题
  [/^>\s*/gmu, ""],                          // 行首引用
  [/^[-*+]\s+/gmu, ""],                      // 行首无序列表
  [/^\s*\d+[.、)]\s+/gmu, ""],               // 行首有序列表（序号由渲染层生成）
  [/!\[([^\]]*)\]\([^)]*\)/gu, "$1"],        // 图片
  [/\[([^\]]*)\]\([^)]*\)/gu, "$1"],         // 链接
  [/`{1,3}[^`]*`{1,3}/gu, "$1"],             // 行内代码
  [/`/gu, ""],                               // 残余反引号
  [/~+/gu, ""],                              // 波浪线
  [/^\s*\|\s*|\s*\|\s*$/gmu, ""],            // 表格行首尾管道
  [/\|/gu, ""],                              // 表格分隔管道
  [/^\s*---+$/gmu, ""],                      // 分隔线
  [/[*_]/gu, ""],                            // 强调符号
  [/^\[\^[^\]]*\]:?/gmu, ""],                // 脚注定义
  [/[ \t]{2,}/gu, " "],                      // 多余空白
];

export function stripMarkdown(value) {
  let text = String(value ?? "");
  for (const [pattern, replacement] of MARKDOWN_PATTERNS) text = text.replace(pattern, replacement);
  return text;
}

export function hasForbiddenContent(value) {
  const text = String(value ?? "");
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeText(value, fallback = "") {
  const cleaned = stripMarkdown(value).replace(/\s+/gu, " ").trim();
  if (!cleaned || hasForbiddenContent(cleaned)) return fallback;
  return cleaned;
}

export function sanitizeParagraphs(values, fallback) {
  const cleaned = (Array.isArray(values) ? values : []).map((value) => sanitizeText(value)).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

export const DRAFT_SCHEMA = {
  issuer: { type: "string", min: 2, max: 60 },
  documentNumber: { type: "string", min: 3, max: 40 },
  title: { type: "string", min: 5, max: 120 },
  recipient: { type: "string", min: 1, max: 60 },
  lead: { type: "string", min: 1, max: 200 },
  attachments: { type: "array", min: 0, max: 20, stringMax: 200 },
  sections: {
    type: "array",
    min: 1,
    max: 8,
    item: {
      title: { type: "string", min: 2, max: 40 },
      paragraphs: { type: "array", min: 0, max: 12, stringMax: 500 },
      items: { type: "nested", min: 0, max: 12 },
    },
  },
  closing: { type: "string", min: 1, max: 300 },
};

function checkField(value, spec, path, errors) {
  if (typeof value !== "string") {
    errors.push(`${path} 必须是字符串`);
    return;
  }
  const length = value.trim().length;
  if (length < spec.min) errors.push(`${path} 长度不足（最少 ${spec.min} 字符）`);
  if (length > spec.max) errors.push(`${path} 长度超限（最多 ${spec.max} 字符）`);
  if (hasForbiddenContent(value)) errors.push(`${path} 包含占位符或排版动作字符`);
}

// 递归校验层次条目：level 0=（一）楷体、level 1=1. 仿宋、level 2=（1）仿宋。
function checkNestedItems(items, path, errors, depth = 0) {
  if (!Array.isArray(items) || items.length > 12) {
    errors.push(`${path} 必须是 0 至 12 项的数组`);
    return;
  }
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof item === "string") {
      checkField(item, { type: "string", min: 1, max: 300 }, itemPath, errors);
      return;
    }
    if (!item || typeof item !== "object" || Array.isArray(item) || depth >= 2) {
      errors.push(`${itemPath} 必须是字符串或不超过三层的嵌套对象`);
      return;
    }
    checkField(item.title, { type: "string", min: 1, max: 200 }, `${itemPath}.title`, errors);
    if (item.items !== undefined) checkNestedItems(item.items, `${itemPath}.items`, errors, depth + 1);
  });
}

export function validateDraft(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["顶层必须是 JSON 对象"] };
  }
  checkField(value.issuer, DRAFT_SCHEMA.issuer, "issuer", errors);
  checkField(value.documentNumber, DRAFT_SCHEMA.documentNumber, "documentNumber", errors);
  checkField(value.title, DRAFT_SCHEMA.title, "title", errors);
  checkField(value.recipient, DRAFT_SCHEMA.recipient, "recipient", errors);
  checkField(value.lead, DRAFT_SCHEMA.lead, "lead", errors);
  checkField(value.closing, DRAFT_SCHEMA.closing, "closing", errors);
  if (value.attachments !== undefined) {
    const attachments = value.attachments;
    if (!Array.isArray(attachments) || attachments.length > 20) {
      errors.push("attachments 必须是 0 至 20 项的数组");
    } else {
      attachments.forEach((item, itemIndex) => checkField(item, { type: "string", min: 1, max: 200 }, `attachments[${itemIndex}]`, errors));
    }
  }
  if (!Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 8) {
    errors.push("sections 必须是 1 至 8 项的数组");
  } else {
    value.sections.forEach((section, index) => {
      const path = `sections[${index}]`;
      if (!section || typeof section !== "object") {
        errors.push(`${path} 必须是对象`);
        return;
      }
      checkField(section.title, DRAFT_SCHEMA.sections.item.title, `${path}.title`, errors);
      const paragraphs = section.paragraphs;
      if (!Array.isArray(paragraphs) || paragraphs.length > 12) {
        errors.push(`${path}.paragraphs 必须是 0 至 12 项的数组`);
      } else {
        paragraphs.forEach((item, itemIndex) => checkField(item, { type: "string", min: 1, max: 500 }, `${path}.paragraphs[${itemIndex}]`, errors));
      }
      const items = section.items;
      if (items !== undefined) checkNestedItems(items, `${path}.items`, errors);
    });
  }
  return { ok: errors.length === 0, errors };
}

// 在 LLM 输出进入渲染前做最终净化：逐字段清洗并删除非法内容。
export function normalizeDraft(candidate, options = {}) {
  const year = options.date?.getFullYear?.() ?? new Date().getFullYear();
  const subject = sanitizeText(options.subject, "当前会话事项办理情况");
  const issuer = sanitizeText(candidate?.issuer, "DeepSeek Harness 平台管理中心");

  // 递归清洗层次条目（字符串或 {title, items:[…]}，最多三层对象嵌套）。
  function cleanItem(item) {
    if (typeof item === "string") return sanitizeText(item);
    if (!item || typeof item !== "object" || Array.isArray(item)) return "";
    const title = sanitizeText(item.title);
    if (!title) return "";
    const children = (Array.isArray(item.items) ? item.items : []).map(cleanItem).filter(Boolean).slice(0, 12);
    return { title, items: children };
  }

  const sections = (Array.isArray(candidate?.sections) ? candidate.sections : []).slice(0, 8).map((section, index) => ({
    title: sanitizeText(section?.title, ["事项起因与背景", "主要调度与技术执行过程", "成果与验收结论", "后续运行与归档要求"][index] ?? "有关情况"),
    paragraphs: sanitizeParagraphs(section?.paragraphs, ["有关工作已按程序组织实施，具体情况据实归纳如下。"]),
    items: (Array.isArray(section?.items) ? section.items : []).map(cleanItem).filter(Boolean).slice(0, 12),
  }));
  const requiredSections = sections.length ? sections : [
    { title: "事项起因与背景", paragraphs: ["根据当前会话提出的工作要求，相关研发和运行保障工作随即启动。"], items: [] },
    { title: "主要调度与技术执行过程", paragraphs: ["围绕需求核验、方案实施、工具调度和结果复核等环节开展工作。"], items: [] },
    { title: "成果与验收结论", paragraphs: ["有关成果已形成，关键要求已纳入验证范围。"], items: [] },
    { title: "后续运行与归档要求", paragraphs: ["请有关责任单元做好运行观察、资料归档和问题闭环。"], items: [] },
  ];
  return {
    issuer,
    documentNumber: sanitizeText(candidate?.documentNumber, `DSH发〔${year}〕1号`),
    title: sanitizeText(candidate?.title, `${issuer}关于${subject}的办理情况通报`),
    recipient: sanitizeText(candidate?.recipient, "各受理窗口、相关研发运维组："),
    lead: sanitizeText(candidate?.lead, "现将有关事项办理情况通报如下。"),
    sections: requiredSections,
    attachments: sanitizeParagraphs(candidate?.attachments, []),
    closing: sanitizeText(candidate?.closing, "请各有关单位结合职责抓好落实，并及时反馈后续运行中发现的问题。"),
  };
}
