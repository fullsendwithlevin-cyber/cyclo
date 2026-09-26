import {
  Activity,
  Brain,
  CalendarDays,
  CheckSquare,
  FileText,
  FolderKanban,
  GraduationCap,
  Home,
  Inbox,
  MessageSquare,
  Newspaper,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Heute", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/tasks", label: "Aufgaben", icon: CheckSquare },
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/exams", label: "Prüfungen", icon: GraduationCap },
  { href: "/projects", label: "Projekte", icon: FolderKanban },
  { href: "/documents", label: "Dokumente", icon: FileText },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/briefing", label: "Tagesbriefing", icon: Newspaper },
  { href: "/memory", label: "Gedächtnis", icon: Brain },
  { href: "/activity", label: "Aktivität", icon: Activity },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

export const MOBILE_NAV = ["/", "/chat", "/tasks", "/calendar"];
