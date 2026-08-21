// 会话事件日志序列化（阶段一的输入素材）。

function compactValue(value, depth = 0) {
  if (depth > 3) return "";
  if (typeof value === "string") return value.length > 1500 ? `${value.slice(0, 1500)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.slice(0, 15).map((item) => compactValue(item, depth + 1)).filter(Boolean).join(" | ");
  if (!value || typeof value !== "object") return "";
  return Object.entries(value).slice(0, 20).map(([key, item]) => {
    const rendered = compactValue(item, depth + 1);
    return rendered ? `${key}=${rendered}` : "";
  }).filter(Boolean).join("; ");
}

export function serializeSessionLog(snapshot) {
  const header = snapshot?.session ?? {};
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const lines = [
    `会话标识：${header.id ?? header.sessionId ?? "未知"}`,
    `工作目录：${header.cwd ?? "未记录"}`,
    `事件总数：${events.length}`,
  ];
  for (const event of events) {
    const detail = compactValue(event.data);
    lines.push(`[${event.seq ?? "?"}] ${event.type ?? "unknown"} ${detail}`.trim());
  }
  return lines.join("\n");
}

export function firstUserNeed(events) {
  for (const event of events) {
    const type = String(event?.type ?? "");
    if (!/user\/message|command\/input/iu.test(type)) continue;
    const data = event?.data;
    const text = typeof data?.text === "string" ? data.text : typeof data?.content === "string" ? data.content : "";
    const clean = text.replace(/\s+/gu, " ").trim();
    if (clean) return clean.slice(0, 200);
  }
  return "";
}

export function lastAssistantConclusion(events) {
  const tail = events.filter((event) => /assistant\/(?:message|complete)/iu.test(String(event?.type ?? "")));
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const data = tail[index]?.data;
    const text = typeof data?.text === "string" ? data.text : typeof data?.content === "string" ? data.content : "";
    const clean = text.replace(/\s+/gu, " ").trim();
    if (clean) return clean.slice(0, 240);
  }
  return "";
}

export function eventTypeCounts(events) {
  const counts = new Map();
  for (const event of events) {
    const type = String(event?.type ?? "unknown");
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, count]) => `${type}（${count}次）`).join("、");
}

export function executionTrail(events) {
  const entries = [];
  for (const event of events) {
    const type = String(event?.type ?? "");
    if (!/(?:tool|command|subagent|job|pwsh|bash)/iu.test(type)) continue;
    const data = event?.data ?? {};
    let label = "";
    if (typeof data?.name === "string") label = data.name;
    else if (typeof data?.tool === "string") label = data.tool;
    else if (typeof data?.command === "string") label = data.command.slice(0, 80);
    else if (typeof data?.line === "string") label = data.line.slice(0, 80);
    else label = type;
    if (!label) continue;
    entries.push(`${label}${data?.ok === false || data?.error ? "（异常）" : ""}`);
  }
  return entries.slice(-30).join("、");
}
