import { CloudSun, Megaphone, Newspaper, Webhook, type LucideIcon } from "lucide-react";
import type { Draft } from "./model";
import { askAi, hackerNews, slack, stepFrom, weather } from "./blocks";

// Starters that run as-is (free public APIs), apart from picking a Slack channel.

export interface Template {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  build: () => Draft;
}

export const TEMPLATES: Template[] = [
  {
    key: "morning-news",
    title: "Morning news briefing",
    description: "Every morning, AI picks the 3 stories worth reading from Hacker News and posts them to Slack.",
    icon: Newspaper,
    build: () => ({
      name: "Morning news briefing",
      trigger: { type: "cron", schedule: "0 9 * * *" },
      steps: [
        stepFrom(hackerNews, { mode: "front" }, "Get the front page"),
        stepFrom(askAi, { instruction: "Pick the 3 most interesting stories. For each, write one sentence on why it matters and include its link." }, "Pick and summarize"),
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
    key: "weather",
    title: "Weather heads-up",
    description: "One line before you leave the house: umbrella or not, coat or not.",
    icon: CloudSun,
    build: () => ({
      name: "Weather heads-up",
      trigger: { type: "cron", schedule: "0 7 * * *" },
      steps: [
        stepFrom(weather, { city: "london" }, "Get today's weather"),
        stepFrom(askAi, { instruction: "Write one friendly line telling me whether I need an umbrella or a coat today, and the high temperature." }, "Write the heads-up"),
        stepFrom(slack, {}, "Post to Slack"),
      ],
    }),
  },
  {
    key: "webhook-to-slack",
    title: "Explain any app's events in plain English",
    description: "Another app calls your private URL; AI explains what happened in one sentence and tells the team.",
    icon: Webhook,
    build: () => ({
      name: "Explain events to the team",
      trigger: { type: "webhook" },
      steps: [
        stepFrom(askAi, { instruction: "This is an event another app just sent us. Explain what happened in one plain-English sentence for the team." }, "Explain the event"),
        stepFrom(slack, {}, "Post to Slack"),
      ],
    }),
  },
];
