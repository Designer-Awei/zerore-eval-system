import { NextResponse } from "next/server";
import { getZeroreRequestContext } from "@/auth/context";
import { previewCsvLines } from "@/lib/csv";
import { inferFormatFromFileName, parseByFormat } from "@/parsers";
import { redactRawRows } from "@/pii/redaction";
import { toCanonicalCsv } from "@/pipeline/enrich";
import { ingestRequestSchema } from "@/schemas/api";
import type { IngestResponse } from "@/types/pipeline";

/**
 * Parse uploaded source text and return canonical raw chatlog rows.
 * @param request Next.js request object.
 * @returns Ingest response with raw rows and preview lines.
 */
export async function POST(request: Request) {
  try {
    const context = getZeroreRequestContext(request);
    const parsedBody = ingestRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "请求体不合法，请检查上传内容。" }, { status: 400 });
    }
    const body = parsedBody.data;
    const fileName = body.fileName ?? "upload.txt";
    const format = body.format ?? inferFormatFromFileName(fileName);

    const parsedRows = parseByFormat(body.text, format, fileName);
    const redaction = redactRawRows(parsedRows);
    const rawRows = redaction.rows;
    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: "未解析到有效行，请检查字段或文本格式。" },
        { status: 400 },
      );
    }

    const canonicalCsv = toCanonicalCsv(rawRows);
    const sessions = new Set(rawRows.map((row) => row.sessionId)).size;
    const hasTimestamp = rawRows.every((row) => Boolean(row.timestamp));
    const warnings: string[] = [];
    if (!hasTimestamp) {
      warnings.push("检测到缺失 timestamp，部分时序指标将在评估阶段降级。");
    }
    if (redaction.report.redactedFields > 0) {
      warnings.push(`PII 脱敏已处理 ${redaction.report.redactedFields} 处：${redaction.report.categories.join(", ")}。`);
    }

    const response: IngestResponse = {
      format,
      fileName,
      rawRows,
      canonicalCsv,
      previewTop20: previewCsvLines(canonicalCsv, 21),
      ingestMeta: {
        sessions,
        rows: rawRows.length,
        hasTimestamp,
        workspaceId: context.workspaceId,
        piiRedaction: redaction.report,
      },
      warnings,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest 未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
