import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileText,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./landing-page.module.css";

const capabilities = [
  {
    icon: ClipboardList,
    title: "Job pipeline",
    text: "Track saved roles, fit signals, status, and follow-up context in one private workspace.",
  },
  {
    icon: FileText,
    title: "Resume focus",
    text: "Save your experience, career history, and education to build a one-page resume.",
  },
];

const workflowSteps = [
  "Bring your experience together",
  "Import and save target roles",
  "Apply with a tailored resume",
];

const faqs = [
  {
    question: "What can I do with RoleLens?",
    answer:
      "Build a resume, discover and save roles, and track your applications from one workspace. Create an account to get started.",
  },
  {
    question: "What happens after signup?",
    answer:
      "You can build your resume, save jobs, and track your applications.",
  },
  {
    question: "Can I keep track of application progress?",
    answer:
      "Yes. Save the roles that interest you, update their application status, and use your dashboard to see your pipeline.",
  },
];

export function LandingPage() {
  return (
    <main id="main-content" className={styles.page}>
      <a href="#landing-title" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.navbar}>
        <div className={styles.navbarInner}>
          <Link href="/" className={styles.brand} aria-label="RoleLens home">
            <BrandMark size={34} />
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
            <ThemeToggle />
            <Link href="/signup" className={styles.primaryButton}>
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            A little clarity for your next chapter
          </p>
          <h1 id="landing-title" tabIndex={-1}>
            Your next role.
            <br />
            <span>A clearer path.</span>
          </h1>
          <p className={styles.heroLead}>
            Keep your experience, career history, and education together. Build
            a concise resume and track the roles you want to apply for.
          </p>
          <div className={styles.heroActions}>
            <Link href="/signup" className={styles.primaryButtonLarge}>
              Create your workspace
              <ArrowRight size={18} />
            </Link>
            <a href="#workflow" className={styles.secondaryButtonLarge}>
              See how it works
              <ArrowRight size={18} />
            </a>
          </div>
          <div className={styles.trustRow} aria-label="Workspace features">
            <span>
              <LockKeyhole size={15} />
              Your own workspace
            </span>
            <span>
              <ShieldCheck size={15} />
              Application tracking
            </span>
            <span>
              <Sparkles size={15} />
              Resume builder
            </span>
          </div>
        </div>

        <div
          className={styles.productPreview}
          aria-label="RoleLens product preview"
        >
          <div className={styles.previewTopbar}>
            <div>
              <p>Application Match</p>
              <strong>Frontend Product Engineer</strong>
            </div>
            <span>Example workspace</span>
          </div>
          <div className={styles.previewGrid}>
            <aside className={styles.scorePanel}>
              <div className={styles.scoreRing}>
                <span>82%</span>
              </div>
              <p>Role fit</p>
              <Link href="/signup" className={styles.previewCta}>
                Build your resume
              </Link>
            </aside>
            <section className={styles.matchPanel}>
              <div className={styles.tabs} aria-hidden="true">
                <span className={styles.activeTab}>Jobs</span>
                <span>Resume</span>
              </div>
              <div className={styles.searchBar}>
                <Search size={15} />
                <span>Senior React, Remote, Vancouver</span>
              </div>
              <div className={styles.jobRows}>
                {[
                  "Design systems",
                  "Product analytics",
                  "TypeScript",
                  "Education",
                ].map((item, index) => (
                  <div className={styles.jobRow} key={item}>
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>{item}</strong>
                      <span>
                        {index === 3
                          ? "Ready for your resume"
                          : "Matched in posting"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className={styles.signalBand} aria-label="RoleLens outcomes">
        <div>
          <strong>One workspace</strong>
          <span>for your resume and saved roles</span>
        </div>
        <div>
          <strong>A clearer pipeline</strong>
          <span>see where every application stands</span>
        </div>
        <div>
          <strong>Ready to apply</strong>
          <span>turn your experience into a focused resume</span>
        </div>
      </section>

      <section id="platform" className={styles.capabilities}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Platform</p>
          <h2>Everything you need for your next move.</h2>
          <p>
            Keep the details organized so you can spend your time on the
            opportunities that matter.
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
          <h2>Less juggling. More momentum.</h2>
          <p>
            Start with your experience, shortlist the roles that fit, and build
            a resume you can take into your next application.
          </p>
          <div className={styles.workflowActions}>
            <Link href="/signup" className={styles.primaryButton}>
              Sign up
            </Link>
          </div>
        </div>
      </section>

      <section
        className={styles.featureRows}
        aria-label="RoleLens feature previews"
      >
        <article>
          <div>
            <p className={styles.eyebrow}>Job search</p>
            <h2>Know what deserves your attention.</h2>
            <p>
              See your saved roles and application progress together. Keep your
              career history close when it is time to prepare your next resume.
            </p>
          </div>
          <div className={styles.miniDashboard}>
            <div className={styles.metricCard}>
              <BarChart3 size={18} />
              <strong>Pipeline</strong>
              <span>12 active roles</span>
            </div>
            <div className={styles.metricCard}>
              <FileText size={18} />
              <strong>Experience</strong>
              <span>Career history in one place</span>
            </div>
            <div className={styles.metricCard}>
              <FileText size={18} />
              <strong>Resume</strong>
              <span>One-page preview</span>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.demoPanel} aria-labelledby="demo-title">
        <div>
          <p className={styles.eyebrow}>Your next chapter</p>
          <h2 id="demo-title">Give your job search a little clarity.</h2>
          <p>
            One place for your experience, your shortlist, and your next step.
          </p>
        </div>
        <div className={styles.demoActions}>
          <Link href="/signup" className={styles.primaryButtonLarge}>
            Sign up
            <ArrowRight size={18} />
          </Link>
          <Link href="/login" className={styles.secondaryButtonLarge}>
            Login
          </Link>
        </div>
      </section>

      <section id="faq" className={styles.faq}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>FAQ</p>
          <h2>A few things to know</h2>
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
          <a href="#workflow">How it works</a>
        </div>
      </footer>
    </main>
  );
}
