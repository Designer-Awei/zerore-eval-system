/**
 * @fileoverview Eval Copilot chat console.
 *
 * Single-pane chat:
 *  - Top: transcript (user / agent / plan / tool / result / final cards)
 *  - Bottom: input + sample-data button + scenario picker
 *  - Streams events from /api/copilot/chat (SSE)
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/shell";
import styles from "./copilotConsole.module.css";

type ChatTurn =
  | { kind: "user"; text: string }
  | { kind: "plan"; plan: string[] }
  | { kind: "tool_call"; tool: string; args: unknown; iteration: number }
  | {
      kind: "tool_result";
      tool: string;
      ok: boolean;
      summary: string;
      data?: unknown;
      iteration: number;
    }
  | {
      kind: "final";
      message: string;
      next_actions?: Array<{ label: string; skill?: string; args?: unknown }>;
    }
  | { kind: "error"; message: string };

const SAMPLE_PROMPT_BUILT_IN =
  "我有一份客服对话日志，请帮我跑评估，告诉我哪里需要优化。";

/**
 * Render the Eval Copilot chat console.
 *
 * @returns The console element.
 */
export function CopilotConsole() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [scenarioId, setScenarioId] = useState("toB-customer-support");
  const [attachedRows, setAttachedRows] = useState<unknown[] | null>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new turn.
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  /**
   * Submit one user turn to the copilot.
   */
  const send = useCallback(
    async (textOverride?: string, presetRows?: unknown[]) => {
      const text = (textOverride ?? input).trim();
      if (!text || running) return;
      const userTurn: ChatTurn = { kind: "user", text };
      const nextTurns = [...turns, userTurn];
      setTurns(nextTurns);
      setInput("");
      setRunning(true);

      try {
        const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
        for (const t of nextTurns) {
          if (t.kind === "user") {
            messages.push({ role: "user", content: t.text });
          } else if (t.kind === "final") {
            messages.push({ role: "assistant", content: t.message });
          }
        }

        const rows = presetRows ?? attachedRows ?? undefined;

        const res = await fetch("/api/copilot/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages,
            attachments: rows ? { rawRows: rows, scenarioId } : { scenarioId },
          }),
        });

        if (!res.ok || !res.body) {
          const err = await res.text().catch(() => "");
          setTurns((prev) => [
            ...prev,
            { kind: "error", message: `请求失败 (${res.status}) ${err.slice(0, 200)}` },
          ]);
          return;
        }

        // SSE consumer
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const ln of lines) {
            if (!ln.startsWith("data: ")) continue;
            const payload = ln.slice(6);
            if (payload === "[DONE]") break;
            try {
              const event = JSON.parse(payload);
              setTurns((prev) => [...prev, mapEventToTurn(event)]);
            } catch {
              /* ignore malformed line */
            }
          }
        }
      } catch (e) {
        setTurns((prev) => [
          ...prev,
          { kind: "error", message: e instanceof Error ? e.message : String(e) },
        ]);
      } finally {
        setRunning(false);
      }
    },
    [input, running, turns, scenarioId, attachedRows],
  );

  /**
   * Load the bundled e-commerce sample as attached rows.
   */
  const loadBuiltInSample = useCallback(async (): Promise<unknown[] | null> => {
    try {
      const res = await fetch("/sample-data/ecommerce-angry-escalation.csv");
      if (!res.ok) throw new Error("示例文件未找到");
      const text = await res.text();
      const rows = parseCsvToRawRows(text);
      setAttachedRows(rows);
      setAttachedFileName("ecommerce-angry-escalation.csv");
      return rows;
    } catch (e) {
      setTurns((prev) => [
        ...prev,
        { kind: "error", message: e instanceof Error ? e.message : String(e) },
      ]);
      return null;
    }
  }, []);

  /**
   * Handle a user file upload (CSV/JSON).
   */
  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const rows = f.name.endsWith(".json") || f.name.endsWith(".jsonl")
        ? parseJsonlToRawRows(text)
        : parseCsvToRawRows(text);
      setAttachedRows(rows);
      setAttachedFileName(f.name);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        { kind: "error", message: `文件解析失败：${err instanceof Error ? err.message : String(err)}` },
      ]);
    }
  }, []);

  /**
   * Trigger a one-tap "next action" button from a final turn.
   */
  const triggerNextAction = useCallback(
    (action: { label: string; skill?: string; args?: unknown }) => {
      const text = action.skill
        ? `请执行 ${action.skill}${action.args ? ` (args=${JSON.stringify(action.args)})` : ""}`
        : action.label;
      void send(text);
    },
    [send],
  );

  return (
    <AppShell>
      <div className={styles.layout}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Eval Copilot</h1>
            <p className={styles.sub}>
              用一句话描述你的需求，Copilot 会自动规划 → 调用评测工具 → 给出叙述结论。
              内置 3 个 skill：<code>run_evaluate · summarize_findings · build_remediation</code>
            </p>
          </div>
        </header>

        <section className={styles.transcript} ref={transcriptRef}>
          {turns.length === 0 ? (
            <div className={styles.welcome}>
              <strong>开始一次评估对话</strong>
              <p>试试 ↓</p>
              <div className={styles.suggest}>
                <button onClick={() => void send("帮我看下这周客服 agent 的表现")}>
                  帮我看下这周客服 agent 的表现
                </button>
                <button
                  onClick={() => {
                    void loadBuiltInSample().then((rows) => {
                      if (rows) {
                        void send(SAMPLE_PROMPT_BUILT_IN, rows);
                      }
                    });
                  }}
                >
                  ▶ 一键 Demo（自动加载示例日志 + 跑评估）
                </button>
              </div>
            </div>
          ) : null}

          {turns.map((t, i) => (
            <TurnView key={i} turn={t} onAction={triggerNextAction} />
          ))}

          {running ? <LoadingDot /> : null}
        </section>

        <footer className={styles.composer}>
          <div className={styles.composerMeta}>
            <label className={styles.scenarioLabel}>
              场景：
              <select
                className={styles.scenarioSelect}
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
              >
                <option value="toB-customer-support">ToB 客服</option>
                <option value="">通用</option>
              </select>
            </label>
            <label className={styles.attachLabel}>
              <input
                type="file"
                accept=".csv,.json,.jsonl"
                onChange={onFile}
                className={styles.attachInput}
              />
              📎 附加日志
            </label>
            {attachedFileName ? (
              <span className={styles.attached}>
                已附加：{attachedFileName}（{attachedRows?.length ?? 0} 行）
                <button
                  className={styles.attachedClear}
                  onClick={() => {
                    setAttachedRows(null);
                    setAttachedFileName(null);
                  }}
                >
                  ✕
                </button>
              </span>
            ) : (
              <button className={styles.sampleBtn} onClick={() => void loadBuiltInSample()}>
                使用内置示例日志
              </button>
            )}
          </div>
          <div className={styles.composerRow}>
            <textarea
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例如：跑评估并告诉我 top 3 风险"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={running}
            />
            <button
              className={styles.sendBtn}
              disabled={!input.trim() || running}
              onClick={() => void send()}
            >
              {running ? "运行中…" : "发送"}
            </button>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}

// ---- Helpers ----

/**
 * Convert one server-sent event into a chat turn (1:1 mapping).
 *
 * @param event Server event.
 * @returns Chat turn.
 */
function mapEventToTurn(event: { type: string } & Record<string, unknown>): ChatTurn {
  switch (event.type) {
    case "plan":
      return { kind: "plan", plan: (event.plan as string[]) ?? [] };
    case "tool_call":
      return {
        kind: "tool_call",
        tool: String(event.tool ?? ""),
        args: event.args,
        iteration: Number(event.iteration ?? 0),
      };
    case "tool_result":
      return {
        kind: "tool_result",
        tool: String(event.tool ?? ""),
        ok: Boolean(event.ok),
        summary: String(event.summary ?? ""),
        data: event.data,
        iteration: Number(event.iteration ?? 0),
      };
    case "final":
      return {
        kind: "final",
        message: String(event.message ?? ""),
        next_actions: Array.isArray(event.next_actions)
          ? (event.next_actions as Array<{ label: string; skill?: string; args?: unknown }>)
          : undefined,
      };
    case "error":
    default:
      return { kind: "error", message: String(event.message ?? "未知错误") };
  }
}

/**
 * Render a single chat turn.
 *
 * @param props Turn props.
 * @returns The turn element.
 */
function TurnView(props: {
  turn: ChatTurn;
  onAction: (a: { label: string; skill?: string; args?: unknown }) => void;
}) {
  const { turn, onAction } = props;
  switch (turn.kind) {
    case "user":
      return (
        <div className={`${styles.bubble} ${styles.bubbleUser}`}>
          <div className={styles.bubbleRole}>你</div>
          <div className={styles.bubbleBody}>{turn.text}</div>
        </div>
      );
    case "plan":
      return (
        <div className={`${styles.bubble} ${styles.bubbleAgent}`}>
          <div className={styles.bubbleRole}>Copilot · 计划</div>
          <ol className={styles.planList}>
            {turn.plan.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      );
    case "tool_call":
      return (
        <div className={styles.toolCall}>
          <span className={styles.toolBadge}>调用</span>
          <code>{turn.tool}</code>
          <span className={styles.toolIter}>iter {turn.iteration}</span>
        </div>
      );
    case "tool_result":
      return (
        <div className={`${styles.toolResult} ${turn.ok ? styles.toolOk : styles.toolFail}`}>
          <span className={styles.toolBadge}>{turn.ok ? "✓" : "✗"}</span>
          <code>{turn.tool}</code>
          <span className={styles.toolSummary}>{turn.summary}</span>
        </div>
      );
    case "final":
      return (
        <div className={`${styles.bubble} ${styles.bubbleAgent}`}>
          <div className={styles.bubbleRole}>Copilot</div>
          <div className={styles.bubbleBody}>{turn.message}</div>
          {turn.next_actions && turn.next_actions.length > 0 ? (
            <div className={styles.nextActions}>
              {turn.next_actions.map((a, i) => (
                <button key={i} onClick={() => onAction(a)}>
                  {a.label} →
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    case "error":
      return <div className={styles.errorRow}>⚠ {turn.message}</div>;
  }
}

/**
 * Animated three-dot loader.
 *
 * @returns Loader element.
 */
function LoadingDot() {
  return (
    <div className={styles.loader} aria-label="思考中">
      <span /> <span /> <span />
    </div>
  );
}

/**
 * Naive CSV → rawRows parser. Expects header row with sessionId/timestamp/role/content.
 *
 * @param text CSV text.
 * @returns RawRow array.
 */
function parseCsvToRawRows(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((s) => s.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = cols[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Split a CSV line, supporting quoted fields with commas inside.
 *
 * @param line One CSV line.
 * @returns Field array.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse JSON or JSONL into raw rows.
 *
 * @param text JSON / JSONL text.
 * @returns Array of objects.
 */
function parseJsonlToRawRows(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray((parsed as { rawRows?: unknown[] }).rawRows)) {
      return (parsed as { rawRows: unknown[] }).rawRows;
    }
    return [];
  }
  return trimmed
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}
