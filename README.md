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
