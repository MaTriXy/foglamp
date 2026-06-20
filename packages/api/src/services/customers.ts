import { listCustomers } from "@foglamp/clickhouse";

import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

/**
 * The "Customers" breakdown on the Overview: per-customer cost rolled up from
 * trace_summary (like Sessions), joined to the customers dimension for the
 * display name/image. Top spenders first; the card takes the first N.
 */
export async function getCustomerList(
  db: Db,
  ch: Ch,
  userId: string,
  input: {
    projectId: string;
    from: Date;
    to: Date;
    limit?: number;
  },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await listCustomers(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
    limit: input.limit,
  });
  return {
    customers: rows.map((r) => ({
      customerId: r.customer_id,
      customerName: r.customer_name || null,
      customerImageUrl: r.customer_image_url || null,
      spanCount: num(r.span_count),
      llmSpanCount: num(r.llm_span_count),
      errorCount: num(r.error_count),
      totalCost: decimalOrNull(r.total_cost),
      pricedSpanCount: num(r.priced_span_count),
      totalTokens: num(r.total_tokens),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    })),
  };
}
