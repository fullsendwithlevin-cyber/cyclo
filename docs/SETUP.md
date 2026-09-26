# Einrichtung & Betrieb

## 1. Voraussetzungen

- Node.js ≥ 20.19 (empfohlen 22)
- PostgreSQL 16 mit Erweiterung **pgvector** (`docker compose up -d db` nutzt `pgvector/pgvector:pg16`)
- Optional: Chromium für die Browser-Tools des Agenten

## 2. Umgebungsvariablen

Alle Variablen stehen mit Erklärung in `.env.example`. Minimal nötig:

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Postgres-Verbindung |
| `APP_URL` | Öffentliche URL (für OAuth-Redirects und Origin-Prüfung) |
| `TOKEN_ENCRYPTION_KEY` | 32-Byte-Schlüssel (Base64) für die Verschlüsselung von OAuth-Tokens und ICS-URLs |
| `ANTHROPIC_API_KEY` *oder* `AI_PROVIDER=openai` + `OPENAI_API_KEY` *oder* `AI_PROVIDER=gemini` + `GEMINI_API_KEY` (kostenlos, aistudio.google.com) | Chat/Agent/OCR (Gemini liefert auch Embeddings) |

Ohne KI-Schlüssel funktionieren Aufgaben, Kalender, Prüfungen, Dokument-Upload (ohne OCR) und Suche;
Chat und Agent zeigen dann einen Hinweis. Mit `OPENAI_API_KEY` werden zusätzlich Embeddings
(semantische Suche) und serverseitige Spracherkennung aktiv.

## 3. Google (Anmeldung, Calendar, Gmail, Drive)

1. Google Cloud Console → Projekt → *APIs & Dienste*: **Google Calendar API**, **Gmail API**, **Google Drive API** aktivieren.
2. OAuth-Zustimmungsbildschirm konfigurieren (Scopes siehe unten; für Gmail ggf. Verifizierung/Testnutzer).
3. OAuth-Client (Webanwendung) anlegen, autorisierte Weiterleitungs-URI: `${APP_URL}/api/oauth/callback/google`.
4. `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` setzen.

| Funktion | Scopes |
|---|---|
| Anmeldung | `openid email profile` |
| Calendar | `calendar.readonly`, `calendar.events` |
| Gmail | `gmail.readonly`, `gmail.compose`, `gmail.send` |
| Drive | `drive.readonly` |

Jede Integration wird unter *Einstellungen → Integrationen* einzeln verbunden (inkrementelle Zustimmung).

## 4. Microsoft (OneNote)

1. Microsoft Entra ID → App-Registrierung, Kontotyp nach Bedarf (`MICROSOFT_TENANT=common` für private + Organisationskonten).
2. Plattform *Web*, Umleitungs-URI `${APP_URL}/api/oauth/callback/microsoft`.
3. Delegierte Berechtigungen: `offline_access`, `User.Read`, `Notes.Read`.
4. Client-Geheimnis erstellen → `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`.

Nach dem Verbinden indexiert der Worker geänderte Seiten inkrementell (max. 40 pro Lauf wegen Graph-Throttling).

## 5. Schulplattform (z. B. ADING)

Es gibt keine verifizierte offizielle ADING-API. Unterstützt wird deshalb nur der **offizielle
Kalender-Export (iCal/ICS-Abo-Link)** der Plattform – ohne Passwörter, ohne Scraping, ohne
Umgehung von Schutzmaßnahmen. Der Link wird verschlüsselt gespeichert und stündlich abgeglichen.
Prüfungen werden per Stichwort (Prüfung, Test, Klausur, LK …) erkannt, Themen aus der Beschreibung
(„Themen: …“) übernommen. Wiederkehrende Termine (RRULE) werden nur mit dem ersten Termin übernommen.

## 6. Worker, Scheduler, Cron

`npm run worker` verarbeitet die Job-Queue (Dokumente, Events, Syncs, Automationen, Briefing,
Erinnerungen) und stößt jede Minute den Scheduler an. Mehrere Worker sind möglich.
In serverlosen Umgebungen kann der Scheduler zusätzlich über `POST /api/cron` mit
`Authorization: Bearer $CRON_SECRET` ausgelöst werden – ein Worker wird trotzdem benötigt.

## 7. Benachrichtigungen

- **Push:** `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
  Aktivierung pro Gerät unter *Einstellungen → Benachrichtigungen* (HTTPS erforderlich).
- **E-Mail:** `SMTP_URL`, `SMTP_FROM`.
- Push/E-Mail werden nur für Hinweise der Priorität *Kritisch* oder *Wichtig* versendet.

## 8. Deployment

```bash
docker compose up -d --build   # db, migrate, web (Port 3000), worker
```

Das Image baut Next.js im `standalone`-Modus; derselbe Container startet mit
`npx tsx workers/index.ts` als Worker. Hinter einem Reverse Proxy HTTPS terminieren und `APP_URL`
auf die öffentliche HTTPS-URL setzen (Session-Cookie ist dann `__Host-`/`Secure`).

## 9. Kostenlos betreiben

| Baustein | Gratis-Option |
|---|---|
| Server | Oracle Cloud „Always Free“ (ARM-VM, 4 Kerne/24 GB) oder eigener PC/Raspberry Pi mit Docker |
| Domain + HTTPS | DuckDNS-Subdomain (z. B. `mein-name.duckdns.org`) + Caddy-Profil aus `docker-compose.yml` |
| KI | `AI_PROVIDER=gemini` + `GEMINI_API_KEY` von aistudio.google.com (Gratis-Kontingent mit Ratenlimits) |
| Google-Login/Calendar/Gmail | Google Cloud OAuth-Client (gratis; App im Modus „Testing“, eigene Adresse als Testnutzer) |
| Datenbank, Worker | im Docker-Compose enthalten |

Ablauf auf dem Server:

```bash
git clone https://github.com/fullsendwithlevin-cyber/cyclo && cd cyclo
cp .env.example .env
# .env: APP_URL=https://mein-name.duckdns.org, ALLOW_DEV_LOGIN=false,
#       TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32), AI_PROVIDER=gemini, GEMINI_API_KEY=…,
#       GOOGLE_CLIENT_ID/SECRET=…, POSTGRES_PASSWORD=<zufällig>
DOMAIN=mein-name.duckdns.org docker compose --profile https up -d --build
```

Ports 80/443 in der Firewall (bei Oracle zusätzlich in der „Security List“) öffnen.
Hinweis: Gratis-Kontingente können Ratenlimits haben; Spracherkennung auf dem Server braucht
weiterhin `OPENAI_API_KEY` – ohne ihn nutzt die App die Spracherkennung des Browsers.

## 10. Migrationen

`prisma migrate dev --create-only` erzeugt neue Migrationen. Prisma kennt die pgvector-/Volltext-
Indexe nicht und schlägt vor, sie zu löschen – `npm run db:check` verhindert, dass solche
`DROP INDEX`-Zeilen eingecheckt werden.
