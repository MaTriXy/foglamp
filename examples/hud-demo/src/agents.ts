// Agent catalog shared by the UI (cards) and the server (run logic). Pure data
// so the client can import it without pulling in `ai`/`foglamp`.

export interface AgentMeta {
  id: string;
  name: string;
  provider: string;
  model: string;
  tools: string[];
  blurb: string;
}

export const AGENTS: AgentMeta[] = [
  {
    id: "support",
    name: "support-copilot",
    provider: "openai",
    model: "gpt-5.4-pro",
    tools: ["lookup_order", "issue_refund", "send_email"],
    blurb: "Resolves a refund and emails the customer.",
  },
  {
    id: "analyst",
    name: "data-analyst",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    tools: ["run_query", "make_chart"],
    blurb: "Answers a question over the warehouse.",
  },
  {
    id: "reviewer",
    name: "code-reviewer",
    provider: "google",
    model: "gemini-3.1-pro",
    tools: ["list_files", "get_diff", "post_comment"],
    blurb: "Reviews a pull request and comments.",
  },
  {
    id: "researcher",
    name: "research-agent",
    provider: "openai",
    model: "gpt-5.4-mini",
    tools: ["search_web", "fetch_page", "summarize"],
    blurb: "Researches a topic across the web.",
  },
  {
    id: "sql",
    name: "sql-bot",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    tools: ["list_tables", "run_query"],
    blurb: "Turns a question into SQL.",
  },
  {
    id: "triage",
    name: "triage-agent",
    provider: "google",
    model: "gemini-3.1-flash",
    tools: ["classify", "route"],
    blurb: "Triages tickets — occasionally flaky.",
  },
];
