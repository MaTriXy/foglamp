import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { project } from "./project";

// One row per Foggy conversation. The id is the client-minted threadId (already
// sanitized to [A-Za-z0-9_-] by the /foggy handler), so the chat request and
// the persisted thread share an identity. Messages are stored as the full
// UIMessage[] blob — Foggy threads are small and always loaded whole, so a
// per-message table would only buy a join.
export const foggyThread = pgTable(
  "foggy_thread",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    // First user message, truncated — shown in the history list.
    title: text("title").notNull(),
    messages: jsonb("messages").$type<unknown[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // The history list: this user's threads in this project, newest first.
    index("foggy_thread_user_project_updated_idx").on(
      table.userId,
      table.projectId,
      table.updatedAt,
    ),
  ],
);

export const foggyThreadRelations = relations(foggyThread, ({ one }) => ({
  user: one(user, {
    fields: [foggyThread.userId],
    references: [user.id],
  }),
  project: one(project, {
    fields: [foggyThread.projectId],
    references: [project.id],
  }),
}));
