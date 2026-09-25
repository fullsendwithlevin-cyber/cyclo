import { Brain, CalendarDays, CheckSquare, FileText, FolderKanban, GraduationCap, Mail, NotebookPen, StickyNote } from "lucide-react";
import type { SearchKind } from "@/lib/search/global";

export const KIND_LABEL: Record<SearchKind, string> = {
  task: "Aufgabe",
  project: "Projekt",
  event: "Termin",
  exam: "Prüfung",
  document: "Dokument",
  onenote: "OneNote",
  email: "E-Mail",
  memory: "Gedächtnis",
  note: "Notiz",
};

export function ResultIcon({ kind, className = "h-4 w-4" }: { kind: SearchKind; className?: string }) {
  const Icon = { task: CheckSquare, project: FolderKanban, event: CalendarDays, exam: GraduationCap, document: FileText, onenote: NotebookPen, email: Mail, memory: Brain, note: StickyNote }[kind];
  return <Icon className={className} />;
}
