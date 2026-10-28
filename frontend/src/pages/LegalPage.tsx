import { useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { buttonClass } from "../components/Button";
import { MenuPattern } from "../components/Nav";

// Shown in both policies. Change it here if you'd rather use a different address.
const CONTACT_EMAIL = "chinyereukpong8064@gmail.com";
const UPDATED = "28 October 2026";

interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

// Same look as the login page and mobile menu: a pill header, a dark rounded card with the faint
// shapes, mono tags with the green square, and everything rising in once on load.
function LegalLayout({ tag, title, intro, sections }: { tag: string; title: string; intro: string; sections: LegalSection[] }) {
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".js-legal-rise", { autoAlpha: 0, y: 24, duration: 0.7, stagger: 0.07, ease: "power3.out" });
    });
    return () => mm.revert();
  }, { scope: pageRef });

  return (
    <div ref={pageRef} className="min-h-svh bg-paper px-3 pb-3 pt-3 text-ink md:px-5 md:pt-5">
      <header className="js-legal-rise mx-auto flex h-16 max-w-6xl items-center justify-between rounded-2xl bg-white py-2 pl-5 pr-2 ring-1 ring-ink/10">
        <Link to="/">
          <img src="/Logo-scroll.svg" alt="Connuit" className="h-7 w-auto" />
        </Link>
        <nav className="flex items-center gap-1 font-mono" aria-label="Legal">
          <Link to="/privacy" className={buttonClass("secondary", "hidden px-4 py-2 text-sm sm:inline-block")}>Privacy</Link>
          <Link to="/terms" className={buttonClass("secondary", "hidden px-4 py-2 text-sm sm:inline-block")}>Terms</Link>
          <Link to="/" className={buttonClass("primary", "px-4 py-2 text-sm")}>Back to site</Link>
        </nav>
      </header>

      <main className="mx-auto mt-3 max-w-6xl md:mt-5">
        {/* ---------- Title card ---------- */}
        <div className="relative overflow-hidden rounded-3xl bg-ink p-7 text-white md:p-14">
          <MenuPattern />
          <div className="relative">
            <span className="js-legal-rise inline-flex items-center gap-3 rounded-md bg-white/10 px-3 py-2 font-mono text-sm uppercase">
              <span className="h-3 w-3 bg-accent ring-1 ring-white/30" />
              {tag}
            </span>
            <h1 className="js-legal-rise mt-6 text-5xl tracking-tight md:text-7xl">{title}</h1>
            <p className="js-legal-rise mt-4 max-w-2xl text-lg text-white/70 md:text-xl">{intro}</p>
            <p className="js-legal-rise mt-8 font-mono text-xs uppercase text-accent">Last updated {UPDATED}</p>
          </div>
        </div>

        {/* ---------- Contents + sections ---------- */}
        <div className="mt-3 grid gap-3 md:mt-5 md:grid-cols-[250px_1fr] md:gap-5">
          <nav
            aria-label="On this page"
            className="js-legal-rise hidden self-start rounded-2xl bg-white p-5 ring-1 ring-ink/10 md:sticky md:top-5 md:block"
          >
            <p className="font-mono text-xs uppercase text-ink/50">On this page</p>
            <ul className="mt-4 flex flex-col gap-1">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex items-baseline gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-mint"
                  >
                    <span className="font-mono text-xs text-ink/40">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-3 md:gap-5">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                className="js-legal-rise scroll-mt-5 rounded-2xl bg-white p-6 ring-1 ring-ink/10 md:p-9"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-accent px-2 py-1 font-mono text-xs text-ink">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="text-2xl tracking-tight md:text-3xl">{s.title}</h2>
                </div>
                <div className="mt-5 flex flex-col gap-4 text-base leading-relaxed text-ink/80 md:text-lg">{s.body}</div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <footer className="mx-auto mt-3 flex max-w-6xl flex-col gap-2 rounded-2xl bg-ink px-6 py-5 font-mono text-xs uppercase text-white sm:flex-row sm:items-center sm:justify-between md:mt-5">
        <span>© {new Date().getFullYear()} Connuit. Built by Chinyere Ukpong.</span>
        <span className="flex gap-5">
          <Link to="/privacy" className="hover:text-accent">Privacy</Link>
          <Link to="/terms" className="hover:text-accent">Terms</Link>
        </span>
      </footer>
    </div>
  );
}

const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="flex flex-col gap-2.5">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3">
        <span className="mt-2.5 h-2 w-2 shrink-0 bg-accent ring-1 ring-ink/20" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const linkClass = "text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink";

const Contact = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>{CONTACT_EMAIL}</a>
);

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-mint px-1.5 py-0.5 font-mono text-[0.9em] text-ink">{children}</code>
);

export function PrivacyPage() {
  const sections: LegalSection[] = [
    {
      id: "what-we-store",
      title: "What we store",
      body: (
        <List
          items={[
            <>Your <strong>email address</strong> and a <strong>hashed password</strong> (we never store the password itself).</>,
            <>The <strong>workflows</strong> you build, and the <strong>run history</strong> of each one: every step's status and output, including data fetched from other services.</>,
            <>The <strong>credentials</strong> you save (Slack and Discord webhook URLs, API keys, Telegram bot tokens). They are encrypted before they are stored and are never sent back to your browser.</>,
            <>If you connect Gmail: a Google <strong>refresh token</strong> and the address of the connected account, encrypted in the same way.</>,
            <>A count of how many AI steps you have run each day, to enforce a fair-use limit.</>,
          ]}
        />
      ),
    },
    {
      id: "google-user-data",
      title: "How we use Google user data",
      body: (
        <>
          <p>
            When you choose <em>Connect Gmail</em>, Connuit asks for one permission only: <Code>gmail.send</Code>{" "}
            (send email on your behalf). We use it for one purpose: to send the emails that your own workflows
            are set up to send, to the recipients you chose, when they run.
          </p>
          <p>
            Connuit <strong>cannot read, list, search or delete</strong> anything in your mailbox. We don't use
            Google data for advertising, we don't sell it, and nobody at Connuit reads your emails.
          </p>
          <p>
            Connuit's use and transfer of information received from Google APIs adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </>
      ),
    },
    {
      id: "who-else",
      title: "Who else handles your data",
      body: (
        <>
          <p>Connuit relies on a few providers to run:</p>
          <List
            items={[
              <><strong>Amazon Web Services</strong> (the server that runs the API) and <strong>Vercel</strong> (the website).</>,
              <><strong>MongoDB Atlas</strong> (the database) and <strong>Upstash</strong> (the queue that schedules runs).</>,
              <>
                <strong>Google Gemini</strong>, for AI steps. The text an AI step receives is sent to Gemini. Under
                the free tier Google may use it to improve its products, so don't send anything confidential
                through an AI step.
              </>,
              <>The services <em>you</em> point a workflow at (Slack, Discord, Telegram, Gmail, any API). Data goes to them because you told the workflow to send it.</>,
            ]}
          />
          <p>We don't sell your data and we don't share it for advertising.</p>
        </>
      ),
    },
    {
      id: "safety",
      title: "Keeping it safe",
      body: (
        <p>
          Credentials are encrypted with AES-256-GCM, passwords are hashed, and all traffic uses HTTPS. This is a
          small independent project, so no system is perfectly secure, but these are the standard protections.
        </p>
      ),
    },
    {
      id: "your-choices",
      title: "Your choices",
      body: (
        <List
          items={[
            <>Delete any workflow or saved credential in the app whenever you like.</>,
            <>
              To disconnect Gmail, delete the Google credential in the app, and optionally remove Connuit at{" "}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className={linkClass}>
                myaccount.google.com/permissions
              </a>
              .
            </>,
            <>To have your account and all its data deleted, email <Contact />. We'll do it and confirm.</>,
          ]}
        />
      ),
    },
    {
      id: "contact",
      title: "Changes and contact",
      body: (
        <p>
          If this policy changes, the date at the top changes too. Questions: <Contact />.
        </p>
      ),
    },
  ];

  return (
    <LegalLayout
      tag="Privacy"
      title="Privacy policy"
      intro="What Connuit stores, what it does with it, and how to have it removed. Written in plain language."
      sections={sections}
    />
  );
}

export function TermsPage() {
  const sections: LegalSection[] = [
    {
      id: "service",
      title: "The service",
      body: (
        <p>
          Connuit lets you build workflows that fetch data, ask AI, and send messages, and run them on a schedule,
          from a webhook, or from a Telegram message. It is provided <strong>as is</strong>, with no promise that it
          will always be available, error-free, or that runs will always complete. Don't rely on it for anything
          where a missed or repeated message would cause real harm.
        </p>
      ),
    },
    {
      id: "account",
      title: "Your account and content",
      body: (
        <List
          items={[
            <>Keep your password safe. You are responsible for what happens under your account.</>,
            <>You own your workflows and data. You are responsible for what your workflows do, including who they message and what they send.</>,
            <>Only connect accounts and credentials you are allowed to use.</>,
          ]}
        />
      ),
    },
    {
      id: "rules",
      title: "What you must not do",
      body: (
        <>
          <List
            items={[
              <>Send spam, scams, harassment, or anything illegal, including through the Gmail, Slack, Discord or Telegram steps.</>,
              <>Try to break, overload, or get around the limits of the service or other people's accounts.</>,
              <>Use Connuit to access systems or data you aren't authorised to.</>,
            ]}
          />
          <p>We may suspend or remove accounts that do, without notice.</p>
        </>
      ),
    },
    {
      id: "limits",
      title: "Limits",
      body: (
        <p>
          To keep the service free, AI steps are limited per user per day, and the whole app has a daily cap.
          Schedules can run at most every five minutes. These limits can change.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Liability",
      body: (
        <p>
          To the fullest extent the law allows, Connuit and its author are not liable for any loss arising from
          using the service, including lost data, failed or unwanted messages, or AI output that is wrong. AI
          answers can be mistaken, so check anything important.
        </p>
      ),
    },
    {
      id: "ending",
      title: "Ending and changes",
      body: (
        <p>
          You can stop using Connuit at any time and ask for your data to be deleted (see the{" "}
          <Link to="/privacy" className={linkClass}>privacy policy</Link>). We may change or stop the service, or
          these terms, at any time; the date above shows the latest version. Questions: <Contact />.
        </p>
      ),
    },
  ];

  return (
    <LegalLayout
      tag="Terms"
      title="Terms of service"
      intro="The short rules for using Connuit. It's a free, independent project, so we keep them simple."
      sections={sections}
    />
  );
}
