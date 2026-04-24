/**
 * @fileoverview Viewer and exporter for one generated remediation package.
 */

"use client";

import { useState } from "react";
import type { RemediationPackageSnapshot } from "@/remediation";
import styles from "./remediationPackagePanel.module.css";

type RemediationPackagePanelProps = {
  packageSnapshot: RemediationPackageSnapshot | null;
  loading: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  showGenerateAction?: boolean;
};

/**
 * Render the remediation package panel in the workbench.
 *
 * @param props Panel props.
 * @returns Panel content.
 */
export function RemediationPackagePanel(props: RemediationPackagePanelProps) {
  const [copiedFileName, setCopiedFileName] = useState("");

  /**
   * Copy one package file to clipboard.
   *
   * @param fileName Artifact file name.
   * @param content File content.
   */
  async function handleCopy(fileName: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFileName(fileName);
      window.setTimeout(() => setCopiedFileName(""), 1600);
    } catch {
      setCopiedFileName("");
    }
  }

  if (!props.packageSnapshot) {
    return (
      <div className={styles.emptyState}>
        <p>先完成一次评估并识别 bad case，再把结果编译成 `issue-brief.md / remediation-spec.yaml / badcases.jsonl / acceptance-gate.yaml`。</p>
        {props.showGenerateAction === false ? null : (
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!props.canGenerate || props.loading}
            onClick={props.onGenerate}
          >
            {props.loading ? "生成中…" : "生成调优包"}
          </button>
        )}
      </div>
    );
  }

  const packageSnapshot = props.packageSnapshot;

  return (
    <div className={styles.stack}>
      <div className={styles.headerRow}>
        <div className={styles.titleBlock}>
          <h3>{packageSnapshot.title}</h3>
          <p>
            packageId={packageSnapshot.packageId} · priority={packageSnapshot.priority} · selected=
            {packageSnapshot.selectedCaseCount}
          </p>
        </div>
        {props.showGenerateAction === false ? null : (
          <button className={styles.primaryButton} type="button" disabled={props.loading} onClick={props.onGenerate}>
            {props.loading ? "重新生成中…" : "重新生成"}
          </button>
        )}
      </div>

      <div className={styles.metaGrid}>
        <article className={styles.metaCard}>
          <span>Run</span>
          <strong>{packageSnapshot.runId}</strong>
          <small>本次调优包来源的评估 run</small>
        </article>
        <article className={styles.metaCard}>
          <span>Scenario</span>
          <strong>{packageSnapshot.scenarioId ?? "generic"}</strong>
          <small>当前调优目标绑定的业务场景</small>
        </article>
        <article className={styles.metaCard}>
          <span>Replay Gate</span>
          <strong>{packageSnapshot.acceptanceGate.replay.minWinRate}</strong>
          <small>最低 replay win rate</small>
        </article>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Problem Summary</p>
        <ul className={styles.bulletList}>
          {packageSnapshot.problemSummary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Dominant Tags</p>
        <div className={styles.tagRow}>
          {packageSnapshot.dominantTags.map((tag) => (
            <span className={styles.tagPill} key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Target Metrics</p>
        <div className={styles.metricList}>
          {packageSnapshot.targetMetrics.length > 0 ? (
            packageSnapshot.targetMetrics.map((item) => (
              <article className={styles.metricCard} key={item.metricId}>
                <strong>{item.displayName}</strong>
                <p>
                  {item.currentValue.toFixed(4)} → {item.targetValue.toFixed(4)} ·
                  {item.direction === "increase" ? " 提高" : " 降低"}
                </p>
                <small>{item.reason}</small>
              </article>
            ))
          ) : (
            <div className={styles.emptyInline}>当前未生成额外目标指标，将以 replay / regression gate 为主。</div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Package Files</p>
        <div className={styles.fileList}>
          {packageSnapshot.files.map((file) => (
            <details className={styles.fileCard} key={file.fileName}>
              <summary className={styles.fileSummary}>
                <div>
                  <strong>{file.fileName}</strong>
                  <p>{file.relativePath}</p>
                </div>
                <div className={styles.fileActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      downloadTextFile(`${packageSnapshot.packageId}.${file.fileName}`, file.content);
                    }}
                  >
                    下载
                  </button>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      void handleCopy(file.fileName, file.content);
                    }}
                  >
                    {copiedFileName === file.fileName ? "已复制" : "复制"}
                  </button>
                </div>
              </summary>
              <pre className={styles.filePreview}>{file.content}</pre>
            </details>
          ))}
        </div>
      </div>

      <p className={styles.footerNote}>
        artifactDir: <code>{packageSnapshot.artifactDir}</code>。可以直接把这四个文件交给 Claude Code / Codex 做后续开发与回归。
      </p>
    </div>
  );
}

/**
 * Download one text artifact in the browser.
 *
 * @param fileName Target file name.
 * @param content File content.
 */
function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
