# Spørg Publikum – Bryllupsversion 💍

Lille (men kærligt) realtime app bygget med Express + Socket.IO + React/Vite. Ingen database – al data ligger i hukommelsen.

## Lynstart (3 kommandoer)

```bash
# 1) Installer afhængigheder (server + klient via postinstall)
npm install

# 2) Start begge dev‑servere (Express :3001, Vite :5173)
npm run dev

# 3) Åbn appen
# Vært:      http://localhost:5173/host   (opretter automatisk en session)
# Publikum:  Brug QR / link der vises på værtssiden (/join/:sessionId)
```

### Alternativ: kør hver for sig

```bash
npm run server
npm run client
```

### Noter

- Al tilstand er flygtig (in-memory). Genstart = nye runder / koder.
- Der findes (deaktiveret) kladder til HMAC signering og rate limiting.
- Perfekt til en hurtig afstemning under taler eller lege. 🥂

# Ask-the-Audience (Wedding Edition)

Minimal Express + Socket.IO + Vite React app. No DB; all state in memory.

## Quick start (3 commands)

```bash
# 1) Install deps (server + client via postinstall)
npm install

# 2) Start both servers (Express on :3001, Vite on :5173)
npm run dev

# 3) Open the app
# Host view:   http://localhost:5173/host   (auto-creates a session)
# Audience:    use the QR/link shown on the host view (/join/:sessionId)
```

### Alternate: run separately

```bash
npm run server
npm run client
```

### Notes

- All state is in-memory; restarting the server clears sessions.
- Optional HMAC + rate limit scaffolds exist but are disabled by default.

## Configuration (.env)

These environment variables control host/ports, logging, and CORS.

- PORT: port for the Express/Socket.IO server (default 3001)
- NODE_ENV: production or development (affects CORS defaults)
- DEBUG: set to 1/true to enable verbose socket debug logs
- CLIENT_ORIGINS: comma-separated list of allowed browser origins for cross-origin access
  - Also used to select the primary origin for building public links/QRs: the first entry is used.
  - Supports simple wildcards (\*) and raw regex when wrapped in slashes, e.g. /^https?:\/\/foo\.example\.com$/
  - Trailing slash in a pattern is treated as optional (https://site.com and https://site.com/ both match)
- ATA_HMAC_SECRET: optional secret for audience ack HMAC (only used if you enable HMAC scaffold in code)

Client-side (Vite) env vars:

- VITE_SERVER_URL: optional override for the Socket.IO server URL in the browser.
  - Defaults to window.location.origin (same-origin) when not set.
  - Useful in development if the API runs on a different host/port without a dev proxy.
- VITE_DEBUG: set to 1/true to enable client-side debug logs in the browser console.

Behavior:

- Same-origin is always allowed automatically (UI and API on the same host:port).
- In development, the server also allows http://localhost:5173 and http://127.0.0.1:5173 by default (Vite).
- In production, only the origins listed in CLIENT_ORIGINS are allowed for cross-origin requests.
- The startup log prints effective CORS patterns and the chosen primary origin.

Examples:

```
# Development example
PORT=3001
NODE_ENV=development
DEBUG=1
CLIENT_ORIGINS=http://localhost:5173
VITE_DEBUG=1
# VITE_SERVER_URL=http://localhost:3001  # optional; defaults to same-origin

# Production example (multiple public hostnames)
NODE_ENV=production
PORT=3001
CLIENT_ORIGINS=https://app.example.com,https://alt.example.com
# VITE_DEBUG=0
# VITE_SERVER_URL=https://app.example.com  # usually unnecessary; same-origin default works
```
