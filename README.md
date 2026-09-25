# Chief of Staff – persönlicher KI-Assistent

Ein persönlicher digitaler Mitarbeiter statt eines Chatbots:
**sehen → verstehen → planen → handeln → kontrollieren → berichten.**

Der Assistent verbindet Kalender, Aufgaben, Prüfungen, E-Mails, OneNote, Dokumente und Schulplattform,
plant mehrstufige Aufträge („Organisiere meine nächste Prüfung“), handelt innerhalb deiner
Berechtigungen und fragt bei heiklen Aktionen nach.

> Die ursprüngliche Zyklus-App **Cyclo** liegt unverändert als eigenständige Seite in `index.html`.

## Funktionen

| Bereich | Stand |
|---|---|
| Chat mit Agent (Tool-Use, Plan-Ansicht, Quellen, Visualisierungen, Anhänge, Sprache) | ✅ |
| Human-in-the-Loop: Bestätigen/Ablehnen, Autonomie-Modi SAFE / ASSISTED / AUTONOMOUS | ✅ |
| Aufgaben (Prioritäten, Deadlines, Abhängigkeiten, Board), Projekte, Meilensteine, Notizen | ✅ |
| Kalender (App-Kalender + Google Calendar), Schnelleingabe „Prüfung Freitag 10:00“, Konflikte | ✅ |
| Prüfungen + Lernplan-Algorithmus (freie Zeiten, Spaced Repetition) | ✅ |
| Dokumente: PDF, DOCX, XLSX, PPTX, TXT/MD/CSV, Bilder (OCR per Vision-Modell) → RAG | ✅ |
| Hybride Suche (pgvector + Volltext, RRF), globale Suche mit Quellenfilter | ✅ |
| Gedächtnis (episodisch, semantisch, Aufgaben, Präferenzen) | ✅ |
| Gmail, Google Drive, OneNote (Graph), Schulplattform per ICS-Export | ✅ (benötigen eigene OAuth-Zugänge) |
| Proaktivität: Events, Relevanzschwelle, Automationen, Tagesbriefing, Erinnerungen, Push/E-Mail | ✅ |
| Web-/Browser-Tools mit SSRF-Schutz | ✅ (Websuche braucht Brave-API-Key) |
| Audit-Log, Agent-Run-Ansicht, Prompt-Injection-Schutz (Kapselung + Taint-Regel) | ✅ |

Nicht verbundene Dienste werden **nie simuliert**: UI und Agent zeigen klar „nicht verbunden“ bzw.
„nicht konfiguriert“ inklusive Lösung.

## Schnellstart (Entwicklung)

```bash
cp .env.example .env               # TOKEN_ENCRYPTION_KEY setzen, optional ANTHROPIC_API_KEY
docker compose up -d db            # oder eigenes Postgres 16 mit pgvector
npm install
npx prisma migrate deploy
npm run dev                        # http://localhost:3000 (Entwicklungs-Login aktiv)
npm run worker                     # zweites Terminal: Hintergrundjobs, Syncs, Briefing
```

Details zu OAuth (Google/Microsoft), Push, E-Mail und Deployment: [docs/SETUP.md](docs/SETUP.md).

## Tests

```bash
npm test          # Unit- + Integrationstests (legt <db>_test an)
npm run test:e2e  # Playwright gegen echten Server + Worker (<db>_e2e, Test-KI)
npm run lint && npm run typecheck && npm run build
```

## Dokumentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Analyse, Architektur, Datenmodell, Sicherheitsmodell
- [docs/SETUP.md](docs/SETUP.md) – Einrichtung und Betrieb
- [docs/STATUS.md](docs/STATUS.md) – Phasenstatus, Tests, bekannte Einschränkungen
