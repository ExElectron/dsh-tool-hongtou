// 确定性回退提炼（模型不可用时的兜底）：只输出结构化 JSON 提纲，同样交给阶段二渲染。

import { firstUserNeed, lastAssistantConclusion, eventTypeCounts, executionTrail } from "./log.js";
import { normalizeDraft } from "./schema.js";

export function deterministicDraft(snapshot, options = {}) {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const subject = options.subject ?? "当前会话事项办理情况";
  const counts = eventTypeCounts(events);
  const trail = executionTrail(events);
  const need = firstUserNeed(events) || subject;
  const conclusion = lastAssistantConclusion(events) || "会话尚未形成明确的最终回复";
  return normalizeDraft({
    issuer: "DeepSeek Harness 平台管理中心",
    documentNumber: `DSH发〔${new Date().getFullYear()}〕1号`,
    title: `DeepSeek Harness 平台管理中心关于${subject}的办理情况通报`,
    recipient: "各受理窗口、相关研发运维组：",
    lead: "现将有关事项办理情况通报如下。",
    sections: [
      { title: "事项起因与背景", paragraphs: [`本事项源于当前会话提出的工作要求，核心诉求概括为：${need}。系统已将有关需求纳入本次办理范围。`], items: [] },
      {
        title: "主要调度与技术执行过程",
        paragraphs: [
          `本次共核验原始会话事件${events.length}条，主要事件类型包括${counts || "无可分类事件"}。`,
          `办理过程中共识别工具、命令、子任务或后台作业执行记录${trail ? `：${trail}` : "，未识别到可提取的技术执行记录"}。`,
        ],
        items: [],
      },
      {
        title: "成果与验收结论",
        paragraphs: [`截至公文生成时，会话最近可提取的办结性结论为：${conclusion}。该结论仅反映当前日志已记载内容，不对尚未完成的事项作扩大认定。`],
        items: [],
      },
      { title: "后续运行与归档要求", paragraphs: ["有关责任单元应继续核对生成物、测试记录和运行状态，发现异常及时处置；本次完整会话日志及生成公文应一并归档，确保办理过程可追溯。"], items: [] },
    ],
    attachments: [],
    closing: "请各有关单位结合职责抓好落实，并及时反馈后续运行中发现的问题。",
  }, options);
}
