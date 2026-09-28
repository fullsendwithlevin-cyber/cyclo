# Auf dem eigenen Windows-PC starten (gratis, ohne Konto)

Läuft komplett lokal: Datenbank, App, Worker und Llama (über Ollama). Kein Google-, KI- oder
Kreditkarten-Konto nötig. Empfohlen: mindestens 16 GB RAM.

## 1. Einmalig installieren

1. **Docker Desktop** von https://www.docker.com/products/docker-desktop/ installieren, PC neu starten
   und Docker Desktop einmal öffnen (muss laufen, Wal-Symbol unten rechts).
2. Auf https://github.com/fullsendwithlevin-cyber/cyclo → grüner Knopf **Code** → **Download ZIP**,
   ZIP entpacken (z. B. nach `C:\assistent`).

## 2. Einstellungen (`.env`)

Im Ordner `.env.example` kopieren und die Kopie in `.env` umbenennen (Windows zeigt
Dateiendungen evtl. nicht an: Explorer → Ansicht → „Dateinamenerweiterungen“ einschalten).

Schlüssel erzeugen – in PowerShell:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

`.env` mit dem Editor öffnen und diese Zeilen setzen:

```
APP_URL="http://localhost:3000"
TOKEN_ENCRYPTION_KEY="<Ausgabe von oben>"
ALLOW_DEV_LOGIN="false"
OWNER_EMAIL="deine@adresse.ch"
OWNER_PASSWORD="<mindestens 12 Zeichen>"
AI_PROVIDER="llama"
LLAMA_BASE_URL="http://ollama:11434/v1"
LLAMA_MODEL="llama3.1:8b"
LLAMA_EMBEDDING_MODEL="nomic-embed-text"
```

## 3. Starten

PowerShell im Ordner öffnen (im Explorer in die Adressleiste `powershell` tippen, Enter):

```powershell
docker compose --profile llama up -d --build
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama pull nomic-embed-text
```

Der erste Start dauert einige Minuten (Downloads). Danach im Browser **http://localhost:3000**
öffnen und mit `OWNER_EMAIL` / `OWNER_PASSWORD` anmelden.

## Alltag

- Stoppen: `docker compose --profile llama stop` · Starten: `docker compose --profile llama start`
- Updates: neue ZIP holen, `.env` behalten, `docker compose --profile llama up -d --build`
- Vom Handy im selben WLAN: `http://<IP des PCs>:3000` (IP mit `ipconfig` → „IPv4-Adresse“);
  Windows-Firewall muss Port 3000 erlauben.
- Erinnerungen und Briefing laufen nur, solange der PC an ist.
- Zu langsam? `LLAMA_MODEL="llama3.2:3b"` setzen und `ollama pull llama3.2:3b` – schneller, aber
  ruft Werkzeuge weniger zuverlässig auf.
