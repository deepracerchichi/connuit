import { Activity, CloudSun, GitPullRequest, Megaphone, Send, UserPlus, type LucideIcon } from "lucide-react";
import { TELEGRAM_SAMPLE, type Draft } from "./model";
import { askAi, decide, fetchUrl, hackerNews, slack, stepFrom, telegram, weather } from "./blocks";

// Starters for jobs teams really automate. Each runs as-is on free public APIs (no keys), apart
// from picking where it posts (a Slack channel, a Telegram bot). Webhook and Telegram starters
// carry sample data, so "Test run" works before anything real calls them.

export interface Template {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  build: () => Draft;
}

const sample = (data: object) => JSON.stringify(data, null, 2);

export const TEMPLATES: Template[] = [
  {
    key: "lead-triage",
    title: "Lead triage",
    description: "Your website's contact form calls this. AI spots real sales leads and briefs #sales; everything else goes to #support.",
    icon: UserPlus,
    build: () => ({
      name: "Lead triage",
      trigger: {
        type: "webhook",
        sample: sample({
          name: "Dana Whitfield",
          email: "dana@northwind.io",
          company: "Northwind (240 employees)",
          message: "We're looking at tools to automate onboarding emails for about 3,000 new customers a month. Could we get a demo and team pricing?",
        }),
      },
      steps: [
        {
          ...stepFrom(decide, { question: "Is this a genuine sales enquiry from a business (not spam, a job application or a support question)?" }, "Is it a real lead?"),
          yes: [
            stepFrom(askAi, { instruction: "Brief the sales team in 3 short lines: who this is, what they want, how big it looks, and their email." }, "Brief sales"),
            stepFrom(slack, {}, "Tell sales"),
          ],
          no: [
            stepFrom(askAi, { instruction: "In one line for the support team: who this is and what they need." }, "Brief support"),
            stepFrom(slack, {}, "Tell support"),
          ],
        },
      ],
    }),
  },
  {
    key: "telegram-assistant",
    title: "AI assistant on Telegram",
    description: "Message your Telegram bot and get an AI reply in the same chat, any time.",
    icon: Send,
    build: () => ({
      name: "Telegram assistant",
      trigger: { type: "telegram", credentialId: "", sample: TELEGRAM_SAMPLE },
      steps: [
        stepFrom(askAi, { instruction: "Someone messaged our Telegram bot. Reply helpfully and warmly, in under 1,000 characters." }, "Write a reply"),
        stepFrom(telegram, { chatId: "{{trigger.chatId}}", text: "{{previousOutput}}" }, "Reply on Telegram"),
      ],
    }),
  },
  {
    key: "outage-watch",
    title: "Vendor outage watch",
    description: "Every hour, check GitHub's status page. If anything is degraded or down, warn #engineering. Swap in any Statuspage URL (Slack, Atlassian, Discord…).",
    icon: Activity,
    build: () => ({
      name: "Vendor outage watch",
      trigger: { type: "cron", schedule: "0 * * * *" },
      steps: [
        stepFrom(fetchUrl, { url: "https://www.githubstatus.com/api/v2/status.json" }, "Check GitHub's status"),
        {
          ...stepFrom(decide, { question: 'Is anything degraded or down (is status.indicator anything other than "none")?' }, "Is something wrong?"),
          yes: [
            stepFrom(askAi, { instruction: "Write a short alert for the engineering team: what's affected, how bad it is, and the link https://www.githubstatus.com." }, "Write the alert"),
            stepFrom(slack, {}, "Alert engineering"),
          ],
        },
      ],
    }),
  },
  {
    key: "review-nudge",
    title: "Pull requests waiting longest",
    description: "Every weekday morning, list the 5 pull requests that have waited longest for review and nudge the team. Change the repo in the first step.",
    icon: GitPullRequest,
    build: () => ({
      name: "Review nudge",
      trigger: { type: "cron", schedule: "0 9 * * 1-5" },
      steps: [
        stepFrom(
          fetchUrl,
          { url: "https://api.github.com/search/issues?q=repo:vercel/next.js+is:pr+is:open+draft:false&sort=created&order=asc&per_page=5" },
          "Get the oldest open PRs",
        ),
        stepFrom(
          askAi,
          { instruction: "List these pull requests: title, author, the date it was opened, and its link. End with one friendly line nudging reviewers." },
          "Write the nudge",
        ),
        stepFrom(slack, {}, "Post to Slack"),
      ],
    }),
  },
  {
    key: "mentions",
    title: "Hear when the internet talks about you",
    description: "Every hour, find new stories mentioning your product, read the mood, and draft a reply.",
    icon: Megaphone,
    build: () => ({
      name: "Mentions watch",
      trigger: { type: "cron", schedule: "0 * * * *" },
      steps: [
        stepFrom(hackerNews, { mode: "search", query: "your product" }, "Find new mentions"),
        stepFrom(
          askAi,
          { instruction: "Summarize what people are saying and whether it's positive or negative. Then draft a short, friendly reply to the most important one. If there's nothing new, say so in one line." },
          "Read the mood",
        ),
        stepFrom(slack, {}, "Post to Slack"),
      ],
    }),
  },
  {
    key: "rain-alert",
    title: "Rain alert, only when it matters",
    description: "Checks the forecast every morning. AI decides if rain is likely, and only then warns you on Slack. Dry days stay quiet.",
    icon: CloudSun,
    build: () => ({
      name: "Rain alert",
      trigger: { type: "cron", schedule: "0 7 * * *" },
      steps: [
        stepFrom(weather, { city: "london" }, "Get today's weather"),
        {
          ...stepFrom(decide, { question: "Is the chance of rain today 50% or higher?" }, "Will it rain?"),
          yes: [
            stepFrom(askAi, { instruction: "Write one friendly line warning me to take an umbrella, with the chance of rain and the high temperature." }, "Write the warning"),
            stepFrom(slack, {}, "Post to Slack"),
          ],
        },
      ],
    }),
  },
];
