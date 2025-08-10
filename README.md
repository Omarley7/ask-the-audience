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
