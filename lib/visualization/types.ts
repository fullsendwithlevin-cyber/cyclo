import { z } from "zod";

/**
 * Deklarative Visualisierungen. Der Agent erzeugt nur Daten (JSON),
 * gerendert wird ausschließlich durch eigene React-Komponenten – kein HTML/JS aus dem Modell.
 */
const isoDate = z.string().describe("ISO-8601-Datum oder -Zeitpunkt");

export const visualizationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("table"),
    title: z.string(),
    columns: z.array(z.string()).min(1).max(12),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(200),
  }),
  z.object({
    type: z.literal("timeline"),
    title: z.string(),
    items: z.array(z.object({ date: isoDate, title: z.string(), detail: z.string().optional(), tone: z.enum(["default", "important", "done"]).optional() })).max(100),
  }),
  z.object({
    type: z.literal("kanban"),
    title: z.string(),
    columns: z.array(z.object({ title: z.string(), cards: z.array(z.object({ title: z.string(), meta: z.string().optional() })).max(50) })).max(8),
  }),
  z.object({
    type: z.literal("progress"),
    title: z.string(),
    items: z.array(z.object({ label: z.string(), value: z.number().min(0), max: z.number().positive() })).max(30),
  }),
  z.object({
    type: z.literal("mindmap"),
    title: z.string(),
    root: z.string(),
    branches: z.array(z.object({ label: z.string(), children: z.array(z.string()).max(12).optional() })).max(12),
  }),
  z.object({
    type: z.literal("flowchart"),
    title: z.string(),
    nodes: z.array(z.object({ id: z.string(), label: z.string() })).max(30),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })).max(60),
  }),
  z.object({
    type: z.literal("study_plan"),
    title: z.string(),
    sessions: z.array(z.object({ start: isoDate, end: isoDate, topic: z.string(), status: z.enum(["planned", "proposed", "done"]).optional() })).max(60),
  }),
  z.object({
    type: z.literal("calendar"),
    title: z.string(),
    events: z.array(z.object({ start: isoDate, end: isoDate, title: z.string(), kind: z.string().optional() })).max(100),
  }),
  z.object({
    type: z.literal("roadmap"),
    title: z.string(),
    phases: z.array(z.object({ title: z.string(), start: isoDate.optional(), end: isoDate.optional(), items: z.array(z.string()).max(20) })).max(12),
  }),
]);

export type VisualizationSpec = z.infer<typeof visualizationSchema>;
export type VisualizationType = VisualizationSpec["type"];
