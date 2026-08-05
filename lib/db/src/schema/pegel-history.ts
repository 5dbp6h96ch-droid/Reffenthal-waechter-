import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Speichert jeden gemessenen Pegelstand mit Zeitstempel dauerhaft.
 * Ermöglicht Wochen- und Monatstrends im Dashboard.
 *
 * unique_measured_at stellt sicher, dass doppelte Einträge (gleicher Zeitstempel
 * vom WSV-API) beim INSERT ignoriert werden (ON CONFLICT DO NOTHING).
 */
export const pegelHistoryTable = pgTable(
  "pegel_history",
  {
    id: serial("id").primaryKey(),
    valueCm: integer("value_cm").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("pegel_history_measured_at_unique").on(t.measuredAt)],
);

export const insertPegelHistorySchema = createInsertSchema(pegelHistoryTable).omit({ id: true });
export type InsertPegelHistory = z.infer<typeof insertPegelHistorySchema>;
export type PegelHistory = typeof pegelHistoryTable.$inferSelect;
