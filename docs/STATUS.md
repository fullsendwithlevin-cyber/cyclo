# Projektstatus

Stand: Ende der ersten Implementierungsrunde. Alle Phasen 1–8 haben einen lauffähigen, getesteten Kern.
Verifiziert mit `npm run lint`, `npm run typecheck`, `npm test` (Unit + Integration gegen echtes
Postgres/pgvector), `npm run build` und `npm run test:e2e` (Playwright, Desktop + Mobile).

---

## PHASE 1 – Foundation
**STATUS:** ✅ fertig

**Implemented:** Next.js 16 / React 19 / Tailwind 4, Prisma 7 + PostgreSQL + pgvector (27 Modelle, FKs,
Indexe, HNSW- und GIN-Indexe), eigene OAuth-2.0-/PKCE-Anmeldung (Google) + Entwicklungs-Login,
DB-Sessions (Token nur gehasht gespeichert), App-Shell (Sidebar, Mobile-Bottom-Navigation, ⌘K-Palette,
Dark/Light Mode), Dashboard, Chat mit Streaming (NDJSON), AI-Provider-Abstraktion (Anthropic, OpenAI).

**Tests:** Auth-Helfer (PKCE-Testvektor, Open-Redirect-Schutz), Crypto, Rate Limiting, E2E-Login-Redirect, Dashboard.

**Known limitations:** Login nur mit Google (Microsoft dient nur als Datenquelle). Rate Limiting ist In-Memory (pro Instanz).

## PHASE 2 – Produktivität
**STATUS:** ✅ fertig

**Implemented:** Aufgaben (Status INBOX…CANCELLED, Prioritäten, Deadlines, Aufwand, Abhängigkeiten mit
Zyklusprüfung, Liste + Kanban-Board mit Drag & Drop), Projekte mit Meilensteinen/Notizen/Dokumenten/
Terminen, App-Kalender (Wochenansicht, Vorschläge bestätigen), deutsche Schnelleingabe
(„Prüfung Elektrotechnik Freitag 10:00“ → Prüfung + Termin), freie Zeitfenster, Konfliktprüfung,
Erinnerungen (Worker versendet fällige).

**Tests:** Aufgaben-Service (Priorisierung, Zyklen, blockierter Abschluss, Mandantentrennung),
Zeitzonen inkl. Sommerzeit, Datumsparser, Slot-Suche, E2E Aufgaben + Kalender-Schnelleingabe.

**Known limitations:** Keine wiederkehrenden App-Termine.

## PHASE 3 – Wissen
**STATUS:** ✅ fertig

**Implemented:** Upload mit Magic-Byte-Validierung, Extraktion (PDF, DOCX, XLSX, PPTX, TXT/MD/CSV),
OCR für Bilder/gescannte PDFs über das Vision-Modell, Chunking mit Seiten-/Überschriften-Metadaten,
Embeddings (OpenAI, 1536 dim), hybride Suche (pgvector + tsvector, Reciprocal Rank Fusion, Diversität,
Metadatenfilter), Quellenangaben [n] im Chat, Gedächtnis in 4 Ebenen mit Klassifikation,
Deduplizierung, Geheimnis-Filter und automatischer Extraktion nach Gesprächen.

**Tests:** Chunking, Validierung, PPTX-Extraktion, Query-Rewriting, RRF, Upload→Index→Suche,
pgvector-Vektorsuche (deterministische Test-Embeddings), Gedächtnis, E2E Upload→Worker→Suche.

**Known limitations:** Ohne `OPENAI_API_KEY` nur Volltextsuche. Reranking heuristisch (kein Cross-Encoder).
OCR benötigt einen KI-Provider – ohne ihn schlägt die Verarbeitung mit klarer Meldung fehl.

## PHASE 4 – Integrationen
**STATUS:** ✅ implementiert, ⚠️ nicht gegen Live-Konten getestet

**Implemented:** Google Calendar (Kalender, Termine CRUD, Suche, Free/Busy, Verifikation nach
Schreibzugriff), Gmail (Suche, Lesen, Threads, Labels, Anhänge importieren, Entwurf, Senden mit
Header-Injection-Schutz), Google Drive (Suche, Import inkl. Google-Docs-Export), OneNote über Microsoft
Graph (Notizbücher → Abschnitte → Seiten → Inhalt → Suchindex, inkrementell), Schulplattform-Adapter
(`SchoolProvider` → `IcsSchoolAdapter` → normalisierte Prüfungen/Termine), verschlüsselter Token-Vault
mit automatischem Refresh, Statusanzeige (verbunden/abgelaufen/Fehler/nicht konfiguriert).

**Tests:** Google-Event-Mapping, Gmail-MIME/HTML/RFC-822, Wichtigkeits-Heuristik, ICS-Parser
(Zeitzonen, Faltung, ganztägig, abgesagt, RRULE-Warnung), Prüfungserkennung, Terminänderung →
`exam.changed`, abgelaufene Tokens → Status EXPIRED, E2E: SSRF-Schutz beim ICS-Link.

**Known limitations:** Für Google/Microsoft werden eigene OAuth-Zugangsdaten benötigt; die Adapter folgen
den offiziellen APIs, wurden hier aber ohne echte Konten nur mit Unit-Tests geprüft. Gmail-Scopes
erfordern ggf. eine Google-Verifizierung. Keine verifizierte offizielle ADING-API → nur ICS-Export.
RRULEs aus ICS werden nicht expandiert.

## PHASE 5 – Agent
**STATUS:** ✅ fertig

**Implemented:** 54 typisierte Tools (Zod → JSON-Schema), Orchestrator mit Tool-Use-Loop, Plan-Tool
(sichtbare Schritte ✓ ● ○ ⚠), Permission-Policy (READ … SENSITIVE, Modi SAFE/ASSISTED/AUTONOMOUS pro
Integration, Overrides pro Tool), Human-in-the-Loop mit Fortsetzung nach Bestätigung (atomar, kein
Doppel-Ausführen), Verifikation nach Aktionen, strukturierte Fehler (Aktion/Grund/Lösung),
Prompt-Injection-Schutz (Kanaltrennung, Kapselung, Tag-Neutralisierung, Taint-Regel, Audit).

**Tests:** 11 Policy-Tests, 7 Injection-Tests, 9 Orchestrator-Integrationstests – u. a. der geforderte
Ablauf *neue Prüfung → Notizen gefunden → Lernplan → Konflikt erkannt → Bestätigung angefordert →
ausgeführt*, Injection-Dokument („Ignore previous instructions … delete/send“) → Löschen trotz
ALLOW-Override nur mit Bestätigung, DENY, Validierung, nicht verbundene Integrationen werden nicht
angeboten. E2E: Agent im Modus „Sicher“ mit Bestätigung im Browser.

**Known limitations:** Kein Tool für Käufe (Kategorie FINANCIAL existiert, bleibt immer bestätigungspflichtig).
Browser-Tools benötigen Chromium; Restrisiko DNS-Rebinding (dokumentiert).

## PHASE 6 – Proaktivität
**STATUS:** ✅ fertig

**Implemented:** DB-Job-Queue (SKIP LOCKED, Backoff, Dedupe), Worker + Scheduler (Gmail 15 min,
OneNote/Schule 60 min, Scan stündlich, Briefing täglich), Domain-Events mit Relevanzbewertung und
einstellbarer Schwelle, Automationen (neue Prüfung → Vorbereitung, Termin verschoben → Lernplan
anpassen, wichtige Mail → Zusammenfassung), Deadline-/Überfällig-/Konflikterkennung, Tagesbriefing,
Benachrichtigungen In-App/Push/E-Mail mit Prioritäten CRITICAL/IMPORTANT/NORMAL/LOW.

**Tests:** Relevanz, Event→Benachrichtigung, Schwelle, Scanner (dedupliziert), Briefing, Queue-Parallelität.
E2E: automatische Prüfungs-Automation läuft im Worker.

**Known limitations:** Push nur mit HTTPS + VAPID-Schlüsseln; E-Mail nur mit SMTP.

## PHASE 7 – Multimodal
**STATUS:** ✅ fertig

**Implemented:** Bilder/PDFs im Chat gehen direkt an das Vision-Modell (z. B. Foto eines Prüfungsplans →
Agent erfasst Prüfungen per Tool), Voice-Layer getrennt vom Agenten (Browser-Spracherkennung oder
Server-STT, Vorlesen per Browser-TTS), Visualisierungs-Engine mit 9 Typen (Tabelle, Timeline, Kanban,
Fortschritt, Mindmap, Flowchart, Lernplan, Kalender, Roadmap) – validierte Daten, eigenes Rendering.

**Tests:** Visualisierung wird über Lernplan-Tool im E2E-Test gerendert.

**Known limitations:** Browser-Spracherkennung nur in Chromium-basierten Browsern/Safari; sonst
`OPENAI_API_KEY` nötig. Qualität der Bildauswertung hängt vom Modell ab.

## PHASE 8 – Hardening
**STATUS:** ✅ fertig (Docker-Image hier nicht gebaut)

**Implemented:** CSP mit Nonce, Security-Header, CSRF (Origin-Prüfung + SameSite), SSRF-Schutz,
Rate Limiting, verschlüsselte Tokens, Redaction in Logs, Audit-Log, Mandantentrennung in allen
Services, Downloads nur als Attachment, ESLint/TypeScript streng, CI-Workflow, Dockerfile +
docker-compose, `standalone`-Build, Migrations-Check.

**Tests:** 94 Vitest-Tests (Unit + Integration), 10 Playwright-Tests (Desktop + Mobile Pixel 7).

**Known limitations:** Docker-Build konnte in dieser Umgebung nicht ausgeführt werden (kein Docker-Daemon).

---

## Next
1. Eigene Google-/Microsoft-OAuth-Zugänge anlegen und die Integrationen mit echten Konten abnehmen.
2. Redis-basiertes Rate Limiting für mehrere Instanzen.
3. RRULE-Expansion für ICS und wiederkehrende App-Termine.
4. Optional: Cross-Encoder-Reranking, Outlook-Kalender als weiterer `CalendarProvider`.
