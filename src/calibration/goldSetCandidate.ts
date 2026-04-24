/**
 * @fileoverview Promote dataset cases into gold-set annotation candidates.
 */

import { buildGoldSetAnnotationTasks, buildGoldSetLabelDraftTemplate } from "@/calibration/goldSetScaffold";
import type {
  GoldSetAnnotationTaskRecord,
  GoldSetCaseRecord,
  GoldSetLabelDraftRecord,
} from "@/calibration/types";
import type { DatasetCaseRecord } from "@/eval-datasets/storage/types";
import type { ChatRole, RawChatlogRow } from "@/types/pipeline";

/**
 * Convert one dataset case into a gold-set case, task and draft.
 *
 * @param datasetCase Stored eval dataset case.
 * @param options Target gold-set metadata.
 * @returns Candidate records ready to append.
 */
export function buildGoldSetCandidateFromDatasetCase(
  datasetCase: DatasetCaseRecord,
  options: {
    goldSetVersion: string;
    assignee?: string;
    reviewer?: string;
    createdAt?: string;
  },
): {
  caseRecord: GoldSetCaseRecord;
  task: GoldSetAnnotationTaskRecord;
  draft: GoldSetLabelDraftRecord;
} {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const caseRecord: GoldSetCaseRecord = {
    caseId: buildGoldCaseId(datasetCase.caseId),
    sceneId: datasetCase.scenarioId ?? datasetCase.caseSetType,
    sessionId: datasetCase.sessionId,
    tags: [
      `source:${datasetCase.caseSetType}`,
      `dataset:${datasetCase.caseId}`,
      ...datasetCase.tags,
    ],
    rawRows: parseDatasetTranscript(datasetCase),
    notes: buildGoldCaseNotes(datasetCase),
  };
  const [task] = buildGoldSetAnnotationTasks([caseRecord], {
    goldSetVersion: options.goldSetVersion,
    sourceCasesPath: `eval-datasets:${datasetCase.caseId}`,
    createdAt,
    assignees: options.assignee ? [options.assignee] : undefined,
    reviewers: options.reviewer ? [options.reviewer] : undefined,
    defaultPriority: "P1",
  });
  const draft = buildGoldSetLabelDraftTemplate(task!);

  return {
    caseRecord,
    task: task!,
    draft,
  };
}

/**
 * Build the deterministic gold-set case ID for a dataset case.
 *
 * @param datasetCaseId Dataset case ID.
 * @returns Gold-set case ID.
 */
export function buildGoldCaseId(datasetCaseId: string): string {
  return `dataset_${datasetCaseId.replace(/[^a-z0-9_-]+/gi, "_")}`;
}

/**
 * Parse the persisted dataset transcript into raw chat rows.
 *
 * @param datasetCase Dataset case.
 * @returns Raw chatlog rows.
 */
function parseDatasetTranscript(datasetCase: DatasetCaseRecord): RawChatlogRow[] {
  const transcript = datasetCase.transcript?.trim();
  if (!transcript) {
    return [
      {
        sessionId: datasetCase.sessionId,
        timestamp: datasetCase.createdAt,
        role: "user",
        content: datasetCase.topicSummary || datasetCase.title || datasetCase.caseId,
      },
    ];
  }

  const baseTimeMs = Date.parse(datasetCase.createdAt);
  const timestampBase = Number.isFinite(baseTimeMs) ? baseTimeMs : Date.now();
  return transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = parseTranscriptLine(line);
      return {
        sessionId: datasetCase.sessionId,
        timestamp: new Date(timestampBase + index * 1000).toISOString(),
        role: parsed.role,
        content: parsed.content,
      };
    });
}

/**
 * Parse one `[turn n] [role] content` line, with a fallback for legacy text.
 *
 * @param line Transcript line.
 * @returns Role and content.
 */
function parseTranscriptLine(line: string): { role: ChatRole; content: string } {
  const matched = line.match(/^\[turn\s+\d+\]\s+\[(user|assistant|system)\]\s*(.*)$/i);
  if (!matched) {
    return { role: "user", content: line };
  }
  return {
    role: matched[1]!.toLowerCase() as ChatRole,
    content: matched[2]?.trim() || line,
  };
}

/**
 * Build reviewer-facing case notes from dataset metadata.
 *
 * @param datasetCase Dataset case.
 * @returns Notes string.
 */
function buildGoldCaseNotes(datasetCase: DatasetCaseRecord): string {
  return [
    `Promoted from eval dataset case ${datasetCase.caseId}.`,
    datasetCase.title ? `Title: ${datasetCase.title}` : "",
    datasetCase.suggestedAction ? `Suggested action: ${datasetCase.suggestedAction}` : "",
    `Baseline score: ${datasetCase.baselineCaseScore}.`,
    typeof datasetCase.failureSeverityScore === "number"
      ? `Failure severity: ${datasetCase.failureSeverityScore}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
