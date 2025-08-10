// Express + Socket.IO server with in-memory sessions
// Minimal, commented, no DB.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const QRCode = require("qrcode");
const crypto = require("crypto");

const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN },
});

/** @typedef {{
 *  sessionId: string,
 *  createdAt: number,
 *  votingOpen: boolean,
 *  roundId: number,
 *  acks: Set<string>,
 *  votesByRound: Record<number, {
 *    byAck: Record<string,'A'|'B'|'C'|'D'>,
 *    tally: {A:number;B:number;C:number;D:number}
 *  }>
 * }} Session
 */

/** In-memory store */
const sessions = new Map(); // Map<sessionId, Session>

// ---- Optional security scaffolding (disabled by default) ----
const ENABLE_HMAC = false; // set true to include HMAC checks for clientAck
const HMAC_SECRET =
  process.env.ATA_HMAC_SECRET || crypto.randomBytes(32).toString("hex");
const signAck = (ack) =>
  crypto.createHmac("sha256", HMAC_SECRET).update(ack).digest("hex");
const verifyAck = (ack, sig) => signAck(ack) === sig;

// Simple soft rate limiter scaffold (disabled by default)
const ENABLE_RATE_LIMIT = false;
const rateBuckets = new Map(); // ip -> {count, ts}
function checkRate(ip, key) {
  if (!ENABLE_RATE_LIMIT) return true;
  const now = Date.now();
  const bucketKey = `${ip}:${key}`;
  const entry = rateBuckets.get(bucketKey) || { count: 0, ts: now };
  // decay every 10s
  if (now - entry.ts > 10000) {
    entry.count = 0;
    entry.ts = now;
  }
  entry.count++;
  rateBuckets.set(bucketKey, entry);
  return entry.count <= 20; // allow ~20 ops per 10s per key
}

// Helpers
const genSessionId = () => String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
const genAck = () => crypto.randomBytes(16).toString("hex"); // 128-bit hex
const emptyTally = () => ({ A: 0, B: 0, C: 0, D: 0 });

function getOrCreateRound(sess) {
  if (!sess.votesByRound[sess.roundId]) {
    sess.votesByRound[sess.roundId] = { byAck: {}, tally: emptyTally() };
  }
  return sess.votesByRound[sess.roundId];
}

function sessionState(sess) {
  const { roundId, votingOpen } = sess;
  const round = getOrCreateRound(sess);
  return { roundId, votingOpen, tally: round.tally };
}

// ---- REST: create session ----
app.post("/api/session", async (req, res) => {
  const sessionId = genSessionId();
  const joinUrlPath = `/join/${sessionId}`;
  const fullJoinUrl = `${ORIGIN}${joinUrlPath}`;

  /** @type {Session} */
  const session = {
    sessionId,
    createdAt: Date.now(),
    votingOpen: false,
    roundId: 1,
    acks: new Set(),
    votesByRound: {},
  };
  getOrCreateRound(session);
  sessions.set(sessionId, session);

  const qrDataUrl = await QRCode.toDataURL(fullJoinUrl, {
    margin: 1,
    scale: 4,
  });
  res.json({ sessionId, joinUrl: joinUrlPath, qrDataUrl });
});

// ---- Socket.IO ----
io.on("connection", (socket) => {
  const ip =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;

  // Host joins a room and gets immediate state
  socket.on("host:subscribe", ({ sessionId }) => {
    const sess = sessions.get(sessionId);
    if (!sess) return;
    socket.join(`host:${sessionId}`);
    socket.emit("state:update", sessionState(sess));
  });

  // Host controls
  socket.on("session:setVoting", ({ sessionId, votingOpen }) => {
    const sess = sessions.get(sessionId);
    if (!sess) return;
    sess.votingOpen = !!votingOpen;
    io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
    io.to(`aud:${sessionId}`).emit("audience:state", {
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
    });
  });

  socket.on("session:reset", ({ sessionId }) => {
    const sess = sessions.get(sessionId);
    if (!sess) return;
    sess.roundId += 1;
    sess.votingOpen = false;
    getOrCreateRound(sess); // new empty round
    io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
    io.to(`aud:${sessionId}`).emit("audience:state", {
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
    });
  });

  // Audience flow
  socket.on("audience:join", ({ sessionId, clientAck, sig }, ackCb) => {
    if (!checkRate(ip, "join"))
      return ackCb && ackCb({ error: "rate_limited" });
    const sess = sessions.get(sessionId);
    if (!sess) return ackCb && ackCb({ error: "not_found" });
    // Join audience room for live voting state updates
    socket.join(`aud:${sessionId}`);

    // If client provided an existing ack, respect it
    if (clientAck && sess.acks.has(clientAck)) {
      const round = getOrCreateRound(sess);
      return (
        ackCb &&
        ackCb({
          clientAck,
          roundId: sess.roundId,
          votingOpen: sess.votingOpen,
          hasVoted: !!round.byAck[clientAck],
        })
      );
    }

    // Soft cap ~30 (allow up to 35)
    if (sess.acks.size >= 35) {
      return ackCb && ackCb({ error: "full" });
    }

    // Issue a new ack
    const newAck = genAck();
    const payload = {
      clientAck: newAck,
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
      hasVoted: false,
    };
    if (ENABLE_HMAC) payload.sig = signAck(newAck);
    sess.acks.add(newAck);
    ackCb && ackCb(payload);
  });

  socket.on(
    "audience:vote",
    ({ sessionId, roundId, option, clientAck, sig }, ackCb) => {
      if (!checkRate(ip, "vote"))
        return ackCb && ackCb({ error: "rate_limited" });
      const sess = sessions.get(sessionId);
      if (!sess) return ackCb && ackCb({ error: "not_found" });

      if (!sess.votingOpen) return ackCb && ackCb({ error: "voting_closed" });
      if (roundId !== sess.roundId)
        return ackCb && ackCb({ error: "stale_round" });
      if (!clientAck || !sess.acks.has(clientAck))
        return ackCb && ackCb({ error: "unknown_ack" });
      if (ENABLE_HMAC && !verifyAck(clientAck, sig))
        return ackCb && ackCb({ error: "bad_sig" });
      if (!["A", "B", "C", "D"].includes(option))
        return ackCb && ackCb({ error: "bad_option" });

      const round = getOrCreateRound(sess);
      if (round.byAck[clientAck])
        return ackCb && ackCb({ error: "already_voted" });

      round.byAck[clientAck] = option;
      round.tally[option] += 1;

      io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
      // no need to echo to audience; their voting state doesn't change mid-round on vote
      ackCb && ackCb({ ok: true });
    }
  );
});

server.listen(PORT, () => {
  console.log(`Ask-the-Audience server on :${PORT}`);
});
