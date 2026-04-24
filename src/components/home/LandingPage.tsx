import Link from "next/link";
import styles from "./landingPage.module.css";

const CAPABILITIES = [
  {
    title: "发现问题",
    description: "从真实 chatlog 里定位死亡轮次、话题跑偏、情绪下探和高风险 bad case。",
  },
  {
    title: "提取证据",
    description: "不是只给分数，而是给出触发指标、关键片段、原因解释和置信度。",
  },
  {
    title: "生成调优包",
    description: "把 bad case、验收门槛和修复目标编译成 Claude Code / Codex 可读的任务文件。",
  },
  {
    title: "验证是否变好",
    description: "用 baseline replay、固定 sample batch 和后续 sandbox 证明修复后真的提升。",
  },
];

const LOOP_STEPS = [
  "发现问题",
  "提取证据",
  "生成调优包",
  "交给 agent 执行",
  "回放 / 沙箱验证",
];

const STATUS_ITEMS = [
  "已跑通 CSV / JSON / TXT / MD 接入",
  "已跑通 baseline 保存与在线回放对比",
  "已接入 goal completion 与 recovery trace",
  "正在补 bad case 资产层与调优包",
];

const OUTCOMES = [
  {
    title: "给产品经理",
    text: "从“感觉这版好像变好了”切到“哪一轮出了问题、改完是否回升”。",
  },
  {
    title: "给工程师",
    text: "把失败会话直接变成可执行的修复任务和回归门槛，而不是只看一屏图表。",
  },
  {
    title: "给创始人",
    text: "把坏体验沉淀成长期资产，让每次失败都能变成下次发版前的测试。",
  },
];

/**
 * Render the public-facing landing page.
 *
 * @returns Landing page content.
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>ZE</span>
          <span>ZERORE</span>
        </Link>
        <nav className={styles.nav}>
          <a href="#capabilities">Capabilities</a>
          <a href="#loop">Loop</a>
          <a href="#outcomes">Outcomes</a>
        </nav>
        <div className={styles.headerActions}>
          <Link href="/workbench" className={styles.secondaryLink}>
            打开工作台
          </Link>
          <Link href="/remediation-packages" className={styles.secondaryLink}>
            调优包
          </Link>
          <Link href="/datasets" className={styles.secondaryLink}>
            案例池
          </Link>
          <Link href="/online-eval" className={styles.primaryLink}>
            在线评测
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AI Quality Loop For Agent Products</p>
            <h1>
              Find where your
              <span> agent breaks.</span>
            </h1>
            <p className={styles.heroText}>
              ZERORE 不是再做一个 eval dashboard，而是把真实 bad case 自动转成证据、调优包和验证结果。
              从生产问题出发，形成一条能持续迭代的质量闭环。
            </p>
            <div className={styles.heroActions}>
              <Link href="/workbench" className={styles.primaryLink}>
                开始诊断
              </Link>
              <Link href="/remediation-packages" className={styles.secondaryLinkDark}>
                浏览调优包
              </Link>
              <Link href="/datasets" className={styles.secondaryLinkDark}>
                浏览案例池
              </Link>
              <Link href="/online-eval" className={styles.ghostLink}>
                查看回放评测
              </Link>
            </div>
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.heroPanelTop}>
              <p>Current Focus</p>
              <strong>Not a dashboard first. A quality loop first.</strong>
            </div>
            <div className={styles.statusList}>
              {STATUS_ITEMS.map((item) => (
                <div className={styles.statusItem} key={item}>
                  <span />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.metricsStrip}>
          <div>
            <span>Inputs</span>
            <strong>CSV / JSON / TXT / MD / Trace</strong>
          </div>
          <div>
            <span>Core Outputs</span>
            <strong>Evidence / Goal / Recovery / Suggestions</strong>
          </div>
          <div>
            <span>Next Layer</span>
            <strong>Remediation Package + Replay Gate</strong>
          </div>
        </section>

        <section className={styles.section} id="capabilities">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrowDark}>Capabilities</p>
            <h2>从真实对话问题，到可执行修复任务。</h2>
          </div>
          <div className={styles.capabilityGrid}>
            {CAPABILITIES.map((item, index) => (
              <article className={styles.capabilityCard} key={item.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.loopSection} id="loop">
          <div className={styles.sectionIntroLight}>
            <p className={styles.eyebrow}>The Loop</p>
            <h2>每个失败，都应该进入下一次发版前的验证链路。</h2>
          </div>
          <div className={styles.loopGrid}>
            {LOOP_STEPS.map((step, index) => (
              <article className={styles.loopCard} key={step}>
                <span>Step {index + 1}</span>
                <strong>{step}</strong>
                <p>{buildLoopDescription(step)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="outcomes">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrowDark}>Outcomes</p>
            <h2>交付的不是报告本身，而是下一步动作。</h2>
          </div>
          <div className={styles.outcomeGrid}>
            {OUTCOMES.map((item) => (
              <article className={styles.outcomeCard} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div>
            <p className={styles.eyebrow}>Start With A Real Conversation Set</p>
            <h2>先带一批真实对话进来，再看你的产品到底在哪些轮次失控。</h2>
          </div>
          <div className={styles.ctaActions}>
            <Link href="/workbench" className={styles.primaryLink}>
              打开工作台
            </Link>
            <Link href="/remediation-packages" className={styles.secondaryLinkDark}>
              浏览调优包
            </Link>
            <Link href="/datasets" className={styles.secondaryLinkDark}>
              查看案例池
            </Link>
            <Link href="/online-eval" className={styles.secondaryLinkDark}>
              进入在线评测
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * Build a short loop step description.
 *
 * @param step Step label.
 * @returns Description copy.
 */
function buildLoopDescription(step: string): string {
  if (step === "发现问题") {
    return "定位失败会话、死亡轮次、情绪低谷和高风险信号。";
  }
  if (step === "提取证据") {
    return "为每个问题输出 evidence、reason、confidence 和触发指标。";
  }
  if (step === "生成调优包") {
    return "把 bad case、验收门槛和修复目标编译成结构化任务文件。";
  }
  if (step === "交给 agent 执行") {
    return "让 Claude Code / Codex 基于调优包改 prompt、policy、orchestration 或代码。";
  }
  return "用 replay、固定批次和 sandbox 验证这次修复是否真的让体验变好。";
}
