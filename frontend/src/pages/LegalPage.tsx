import type { ReactNode } from "react";
import { Link } from "react-router";

// Shown in both policies. Change it here if you'd rather use a different address.
const CONTACT_EMAIL = "chinyereukpong8064@gmail.com";
const UPDATED = "28 October 2026";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-paper text-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 md:px-8">
        <Link to="/" className="text-2xl font-medium tracking-tight">Connuit</Link>
        <nav className="flex gap-5 font-mono text-xs uppercase">
          <Link to="/privacy" className="hover:opacity-60">Privacy</Link>
          <Link to="/terms" className="hover:opacity-60">Terms</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-6 md:px-8">
        <h1 className="text-4xl tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-3 font-mono text-xs uppercase opacity-60">Last updated {UPDATED}</p>
        <div className="mt-10 flex flex-col gap-8 text-lg leading-relaxed">{children}</div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="flex list-disc flex-col gap-1.5 pl-6">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const Contact = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a>
);

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy">
      <p>
        Connuit is a workflow automation app built and run by Chinyere Ukpong. This page explains what
        it stores, what it does with it, and how to have it removed.
      </p>

      <Section title="What we store">
        <List
          items={[
            <>Your <strong>email address</strong> and a <strong>hashed password</strong> (we never store the password itself).</>,
            <>The <strong>workflows</strong> you build, and the <strong>run history</strong> of each one: every step's status and output, including data fetched from other services.</>,
            <>The <strong>credentials</strong> you save (Slack and Discord webhook URLs, API keys, Telegram bot tokens). They are encrypted before they are stored and are never sent back to your browser.</>,
            <>If you connect Gmail: a Google <strong>refresh token</strong> and the address of the connected account, encrypted in the same way.</>,
            <>A count of how many AI steps you have run each day, to enforce a fair-use limit.</>,
          ]}
        />
      </Section>

      <Section title="How we use Google user data">
        <p>
          When you choose <em>Connect Gmail</em>, Connuit asks for one permission only:
          <code className="mx-1 rounded bg-mint px-1.5 py-0.5 font-mono text-base">gmail.send</code>
          (send email on your behalf). We use it for one purpose: to send the emails that your own
          workflows are set up to send, to the recipients you chose, when they run.
        </p>
        <p>
          Connuit <strong>cannot read, list, search or delete</strong> anything in your mailbox. We don't
          use Google data for advertising, we don't sell it, and nobody at Connuit reads your emails.
        </p>
        <p>
          Connuit's use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Who else handles your data">
        <p>Connuit relies on a few providers to run:</p>
        <List
          items={[
            <><strong>Amazon Web Services</strong> (the server that runs the API) and <strong>Vercel</strong> (the website).</>,
            <><strong>MongoDB Atlas</strong> (the database) and <strong>Upstash</strong> (the queue that schedules runs).</>,
            <>
              <strong>Google Gemini</strong>, for AI steps. The text an AI step receives is sent to Gemini.
              Under the free tier Google may use it to improve its products, so don't send anything
              confidential through an AI step.
            </>,
            <>The services <em>you</em> point a workflow at (Slack, Discord, Telegram, Gmail, any API). Data goes to them because you told the workflow to send it.</>,
          ]}
        />
        <p>We don't sell your data and we don't share it for advertising.</p>
      </Section>

      <Section title="Keeping it safe">
        <p>
          Credentials are encrypted with AES-256-GCM, passwords are hashed, and all traffic uses HTTPS.
          This is a small independent project, so no system is perfectly secure, but these are the
          standard protections.
        </p>
      </Section>

      <Section title="Your choices">
        <List
          items={[
            <>Delete any workflow or saved credential in the app whenever you like.</>,
            <>
              To disconnect Gmail, delete the Google credential in the app, and optionally remove Connuit
              at{" "}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                myaccount.google.com/permissions
              </a>
              .
            </>,
            <>To have your account and all its data deleted, email <Contact />. We'll do it and confirm.</>,
          ]}
        />
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes, the date at the top changes too. Questions: <Contact />.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of service">
      <p>
        By creating an account or using Connuit you agree to these terms. Connuit is an independent
        project by Chinyere Ukpong, offered free of charge.
      </p>

      <Section title="The service">
        <p>
          Connuit lets you build workflows that fetch data, ask AI, and send messages, and run them on a
          schedule, from a webhook, or from a Telegram message. It is provided <strong>as is</strong>,
          with no promise that it will always be available, error-free, or that runs will always complete.
          Don't rely on it for anything where a missed or repeated message would cause real harm.
        </p>
      </Section>

      <Section title="Your account and content">
        <List
          items={[
            <>Keep your password safe. You are responsible for what happens under your account.</>,
            <>You own your workflows and data. You are responsible for what your workflows do, including who they message and what they send.</>,
            <>Only connect accounts and credentials you are allowed to use.</>,
          ]}
        />
      </Section>

      <Section title="What you must not do">
        <List
          items={[
            <>Send spam, scams, harassment, or anything illegal, including through the Gmail, Slack, Discord or Telegram steps.</>,
            <>Try to break, overload, or get around the limits of the service or other people's accounts.</>,
            <>Use Connuit to access systems or data you aren't authorised to.</>,
          ]}
        />
        <p>We may suspend or remove accounts that do, without notice.</p>
      </Section>

      <Section title="Limits">
        <p>
          To keep the service free, AI steps are limited per user per day, and the whole app has a daily
          cap. Schedules can run at most every five minutes. These limits can change.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          To the fullest extent the law allows, Connuit and its author are not liable for any loss
          arising from using the service, including lost data, failed or unwanted messages, or AI output
          that is wrong. AI answers can be mistaken, so check anything important.
        </p>
      </Section>

      <Section title="Ending and changes">
        <p>
          You can stop using Connuit at any time and ask for your data to be deleted (see the{" "}
          <Link to="/privacy" className="underline underline-offset-4">privacy policy</Link>). We may change
          or stop the service, or these terms, at any time; the date above shows the latest version.
          Questions: <Contact />.
        </p>
      </Section>
    </LegalLayout>
  );
}
