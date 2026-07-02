import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import styles from "./landing-page.module.css";

const demoHref =
  "mailto:hello@rolelens.app?subject=RoleLens%20demo%20request&body=Hi%20RoleLens%20team%2C%0A%0AI%27d%20like%20to%20book%20a%20demo.";

const capabilities = [
  {
    icon: ClipboardList,
    title: "Job pipeline",
    text: "Track saved roles, fit signals, status, and follow-up context in one private workspace.",
  },
  {
    icon: FileText,
    title: "Resume focus",
    text: "Turn each posting into resume notes and keyword checks before you submit.",
  },
  {
    icon: MessageSquareText,
    title: "Interview prep",
    text: "Keep practice prompts, goals, and next actions connected to your search.",
  },
];

const workflowSteps = [
  "Sign up or book a demo",
  "Import and save target roles",
  "Review fit, resume notes, and practice goals",
];

const faqs = [
  {
    question: "Can visitors browse the live job feed?",
    answer:
      "No. The product workspace is account gated, so live data stays behind login or signup.",
  },
  {
    question: "What happens after signup?",
    answer:
      "You land in the RoleLens dashboard and can use jobs, resume review, interview prep, and goals.",
  },
  {
    question: "How do demos work?",
    answer:
      "Book a demo from the landing page and we will walk through the workflow before your team adopts it.",
  },
];

export function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.navbar}>
        <Link href="/" className={styles.brand} aria-label="RoleLens home">
          <span className={styles.brandMark}>R</span>
          <span>RoleLens</span>
        </Link>
        <nav className={styles.navLinks} aria-label="Landing navigation">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className={styles.navActions}>
          <Link href="/login" className={styles.textButton}>
            Login
          </Link>
          <a href={demoHref} className={styles.secondaryButton}>
            <CalendarCheck size={16} />
            Book a Demo
          </a>
          <Link href="/signup" className={styles.primaryButton}>
            Sign up
          </Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Private career ops workspace</p>
          <h1 id="landing-title">RoleLens</h1>
          <p className={styles.heroLead}>
            Replace the exposed job board feel with a focused landing page, then
            keep the live jobs, resume work, and interview prep behind account
            access.
          </p>
          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primaryButtonLarge}>
              Start with Sign up
              <ArrowRight size={18} />
            </Link>
            <a href={demoHref} className={styles.secondaryButtonLarge}>
              <CalendarCheck size={18} />
              Book a Demo
            </a>
          </div>
          <div className={styles.trustRow} aria-label="Access model">
            <span>
              <LockKeyhole size={15} />
              Account gated
            </span>
            <span>
              <ShieldCheck size={15} />
              Shared state after login
            </span>
            <span>
              <Sparkles size={15} />
              Guided workflow
            </span>
          </div>
        </div>

        <div className={styles.productPreview} aria-label="RoleLens product preview">
          <div className={styles.previewTopbar}>
            <div>
              <p>Application Match</p>
              <strong>Frontend Product Engineer</strong>
            </div>
            <span>Private preview</span>
          </div>
          <div className={styles.previewGrid}>
            <aside className={styles.scorePanel}>
              <div className={styles.scoreRing}>
                <span>82%</span>
              </div>
              <p>Role fit</p>
              <button type="button">Review Resume</button>
            </aside>
            <section className={styles.matchPanel}>
              <div className={styles.tabs} aria-hidden="true">
                <span className={styles.activeTab}>Jobs</span>
                <span>Resume</span>
                <span>Interview</span>
              </div>
              <div className={styles.searchBar}>
                <Search size={15} />
                <span>Senior React, Remote, Vancouver</span>
              </div>
              <div className={styles.jobRows}>
                {["Design systems", "Product analytics", "TypeScript", "Interview loop"].map(
                  (item, index) => (
                    <div className={styles.jobRow} key={item}>
                      <CheckCircle2 size={16} />
                      <div>
                        <strong>{item}</strong>
                        <span>{index === 3 ? "Practice queued" : "Matched in posting"}</span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className={styles.signalBand} aria-label="RoleLens outcomes">
        <div>
          <strong>One workspace</strong>
          <span>for saved roles, resume notes, and interview practice</span>
        </div>
        <div>
          <strong>Zero public feed</strong>
          <span>on first page load for signed-out visitors</span>
        </div>
        <div>
          <strong>Two entry paths</strong>
          <span>self-serve signup or guided demo</span>
        </div>
      </section>

      <section id="platform" className={styles.capabilities}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Platform</p>
          <h2>Move the live product behind a proper front door.</h2>
          <p>
            The landing page introduces the product, while the actual workspace
            remains reserved for people who create an account or request a demo.
          </p>
        </div>
        <div className={styles.capabilityGrid}>
          {capabilities.map((capability) => {
            const Icon = capability.icon;
            return (
              <article className={styles.capabilityCard} key={capability.title}>
                <Icon size={22} />
                <h3>{capability.title}</h3>
                <p>{capability.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="workflow" className={styles.workflow}>
        <div className={styles.workflowVisual}>
          {workflowSteps.map((step, index) => (
            <div className={styles.workflowStep} key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
        <div className={styles.workflowCopy}>
          <p className={styles.eyebrow}>Workflow</p>
          <h2>Let visitors choose the right path before they touch product data.</h2>
          <p>
            New users can create an account, teams can request a demo, and the
            app routes stay protected until a session is active.
          </p>
          <div className={styles.workflowActions}>
            <Link href="/signup" className={styles.primaryButton}>
              Sign up
            </Link>
            <a href={demoHref} className={styles.secondaryButton}>
              <CalendarCheck size={16} />
              Book a Demo
            </a>
          </div>
        </div>
      </section>

      <section className={styles.featureRows} aria-label="RoleLens feature previews">
        <article>
          <div>
            <p className={styles.eyebrow}>Job search</p>
            <h2>Open with positioning, not raw data.</h2>
            <p>
              Signed-out visitors see a focused product story. Signed-in users
              can move into jobs, detail pages, and dashboard analytics.
            </p>
          </div>
          <div className={styles.miniDashboard}>
            <div className={styles.metricCard}>
              <BarChart3 size={18} />
              <strong>Pipeline</strong>
              <span>12 active roles</span>
            </div>
            <div className={styles.metricCard}>
              <Target size={18} />
              <strong>Goals</strong>
              <span>3 next actions</span>
            </div>
            <div className={styles.metricCard}>
              <FileText size={18} />
              <strong>Resume</strong>
              <span>5 fit notes</span>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.demoPanel} aria-labelledby="demo-title">
        <div>
          <p className={styles.eyebrow}>Access</p>
          <h2 id="demo-title">Start with signup or a guided demo.</h2>
          <p>
            Product routes now have a clear gate, so the first page can behave
            like a real SaaS front door.
          </p>
        </div>
        <div className={styles.demoActions}>
          <Link href="/signup" className={styles.primaryButtonLarge}>
            Sign up
            <ArrowRight size={18} />
          </Link>
          <a href={demoHref} className={styles.secondaryButtonLarge}>
            <CalendarCheck size={18} />
            Book a Demo
          </a>
        </div>
      </section>

      <section id="faq" className={styles.faq}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>FAQ</p>
          <h2>Common access questions</h2>
        </div>
        <div className={styles.faqList}>
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>RoleLens</span>
        <div>
          <Link href="/login">Login</Link>
          <Link href="/signup">Sign up</Link>
          <a href={demoHref}>Book a Demo</a>
        </div>
      </footer>
    </main>
  );
}
