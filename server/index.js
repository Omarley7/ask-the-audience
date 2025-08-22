// Express + Socket.IO server with in-memory sessions
// Minimal, commented, no DB.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const QRCode = require("qrcode");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const PORT = process.env.SERVER_PORT || 3001;
const DEV = process.env.NODE_ENV === "development";

// Allowlist origins:
// - When DEV=false: use CLIENT_ORIGINS env (comma-separated; supports wildcard/regex via toRegex)
// - When DEV=true: add common dev UI origins (Vite on 5173) in addition to CLIENT_ORIGINS
const ENV_ORIGINS = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const ORIGIN_PATTERNS = [...ENV_ORIGINS, ...(DEV ? DEFAULT_DEV_ORIGINS : [])];

// turn "https://*.myapp.com" into /^https:\/\/.*\.myapp\.com$/
// If an env pattern ends with a trailing slash (e.g. "https://foo.bar/"), we treat that
// slash as optional so both https://foo.bar and https://foo.bar/ are accepted.
const toRegex = (p) => {
  // Allow raw regex by wrapping with forward slashes: /^https?:\/\/foo$/
  if (p.startsWith("/") && p.endsWith("/")) return new RegExp(p.slice(1, -1));
  let optionalSlash = false;
  if (p.endsWith("/")) {
    optionalSlash = true;
    p = p.slice(0, -1); // drop the trailing slash; we'll add it back as optional
  }
  const esc = p.replace(/\./g, "\\.").replace(/\*/g, ".*");
  const suffix = optionalSlash ? "(?:/)?" : "";
  return new RegExp(`^${esc}${suffix}$`);
};
const ORIGIN_REGEXES = ORIGIN_PATTERNS.map(toRegex);
const isAllowedOrigin = (origin) => {
  console.log("Checking origin:", origin);
  const res = ORIGIN_REGEXES.some((rx) => rx.test(origin));
  console.log("Allowed origin:", res);
  return res;
};

// Same-origin check using request Host header vs Origin header
function isSameOriginReq(req, origin) {
  try {
    if (!origin) return true; // curl or non-browser
    const u = new URL(origin);
    const hostHeader = req.headers.host; // e.g. example.com:3001
    if (!hostHeader) return false;
    const originHostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    return hostHeader.toLowerCase() === originHostPort.toLowerCase();
  } catch {
    return false;
  }
}

// pick a primary origin for building links/QRs
// We avoid a separate CLIENT_PUBLIC_ORIGIN; instead, we use the FIRST entry of CLIENT_ORIGINS
// (if provided). Otherwise we fall back to the first effective pattern (dev default),
// and finally to a localhost URL with the server port.
const PRIMARY_ORIGIN = (
  ENV_ORIGINS[0] ||
  ORIGIN_PATTERNS[0] ||
  `http://localhost:${PORT}`
).replace(/\/$/, "");

// Debug toggle (set DEBUG=1 or true to enable verbose socket logging)
const DEBUG = process.env.SERVER_DEBUG ? true : false;
const dbg = (...args) => {
  if (DEBUG) console.log(...args);
};

const app = express();
// Configure CORS per-request so we can allow same-origin dynamically and still support allowlists
app.use(
  cors((req, cb) => {
    const origin = req.headers.origin;
    // No Origin header: non-browser or same-origin simple GET.
    // Do not set ACAO; request proceeds normally.
    if (!origin) return cb(null, { origin: true });
    // Allow same-origin (UI and API on same host:port)
    if (isSameOriginReq(req, origin)) return cb(null, { origin: true });
    // Allow explicitly allowed cross-origins
    if (isAllowedOrigin(origin)) return cb(null, { origin: true });
    return cb(new Error("Not allowed by CORS"));
  })
);
app.use(express.json());

const server = http.createServer(app);
// Important: configure Socket.IO CORS so ACAO headers are sent for allowed origins
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // No Origin header (non-browser) -> allow
      if (!origin) return cb(null, true);
      // Allow primary origin explicitly (handles optional trailing slash)
      const o = origin.replace(/\/$/, "");
      if (o === PRIMARY_ORIGIN) return cb(null, true);
      // Allow dev/default and env-allowed origins
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Also keep a stricter gate at the transport level
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    if (!origin) return callback(null, true);
    if (isSameOriginReq(req, origin)) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback("Not allowed by CORS", false);
  },
});

/** @typedef {{
 *  sessionId: string,
 *  createdAt: number,
 *  votingOpen: boolean,
 *  roundId: number,
 *  mode: 'simple'|'quiz',
 *  acks: Set<string>,
 *  votesByRound: Record<number, {
 *    byAck: Record<string,'A'|'B'|'C'|'D'>,
 *    tally: {A:number;B:number;C:number;D:number},
 *    awarded?: {A:boolean;B:boolean},
 *    resetSeq?: number
 *  }>,
 *  scores: {A:number;B:number},
 *  question?: { text: string, options: any, phaseTitle?: string, note?: string|null } | null,
 *  quiz?: {
 *    id: number,
 *    title?: string,
 *    index: number, // 0-based question index
 *    revealedIndex?: number|null,
 *    questions: Array<{ id: number, text: string, phaseId: number, phaseTitle?: string, note?: string|null, options: Array<{ text: string, audioUri?: string|null, isCorrect?: boolean }> }>
 *  } | null,
 *  qrDataUrl?: string
 * }} Session */

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
    sess.votesByRound[sess.roundId] = {
      byAck: {},
      tally: emptyTally(),
      resetSeq: 0, // increments when host resets the round to allow re-voting
      awarded: { A: false, B: false },
    };
  }
  return sess.votesByRound[sess.roundId];
}

function sessionState(sess) {
  const { roundId, votingOpen } = sess;
  const round = getOrCreateRound(sess);
  // live audience count based on current sockets in the audience room
  const audienceCount =
    io.sockets.adapter.rooms.get(`aud:${sess.sessionId}`)?.size || 0;
  // Derive current question from quiz (if present)
  let q = sess.question || null;
  if (sess.quiz && Array.isArray(sess.quiz.questions)) {
    const idx = Math.max(
      0,
      Math.min(sess.quiz.index || 0, sess.quiz.questions.length - 1)
    );
    const cq = sess.quiz.questions[idx];
    if (cq)
      q = {
        text: cq.text,
        options: cq.options,
        phaseTitle: cq.phaseTitle,
        note: cq.note ?? null,
      };
  }
  // Compute reveal state for current question
  let reveal = { show: false, correctLetters: [] };
  if (sess.quiz && Array.isArray(sess.quiz.questions)) {
    const isSame = (sess.quiz.revealedIndex ?? -1) === (sess.quiz.index ?? -2);
    if (isSame) {
      const cq = sess.quiz.questions[sess.quiz.index];
      if (cq && Array.isArray(cq.options)) {
        const letters = ["A", "B", "C", "D"];
        const arr = [];
        cq.options.forEach((o, i) => {
          if (o && o.isCorrect) arr.push(letters[i]);
        });
        reveal = { show: true, correctLetters: arr };
      }
    }
  }
  return {
    roundId,
    votingOpen,
    tally: round.tally,
    audienceCount,
    scores: sess.scores || { A: 0, B: 0 },
    roundAwards: round.awarded || { A: false, B: false },
    question: q,
    reveal,
  };
}

// ---- REST: create session ----
app.post("/api/session", async (req, res) => {
  const mode = req.body && req.body.mode === "simple" ? "simple" : "quiz";
  const sessionId = genSessionId();
  const joinUrlPath = `/join/${sessionId}`;
  const fullJoinUrl = `${PRIMARY_ORIGIN}${joinUrlPath}`;

  /** @type {Session} */
  const session = {
    sessionId,
    createdAt: Date.now(),
    votingOpen: false,
    roundId: 1,
    mode,
    acks: new Set(),
    votesByRound: {},
    scores: { A: 0, B: 0 },
    question: null,
    quiz: null,
  };
  getOrCreateRound(session);
  sessions.set(sessionId, session);

  const qrDataUrl = await QRCode.toDataURL(fullJoinUrl, {
    margin: 1,
    scale: 4,
  });
  session.qrDataUrl = qrDataUrl;
  res.json({ sessionId, joinUrl: joinUrlPath, qrDataUrl, mode });
});

// Fetch existing session (for refresh scenario)
app.get("/api/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: "not_found" });
  const joinUrlPath = `/join/${sessionId}`;
  const fullJoinUrl = `${PRIMARY_ORIGIN}${joinUrlPath}`;
  if (!sess.qrDataUrl) {
    try {
      sess.qrDataUrl = await QRCode.toDataURL(fullJoinUrl, {
        margin: 1,
        scale: 4,
      });
    } catch (e) {
      return res.status(500).json({ error: "qr_failed" });
    }
  }
  res.json({
    sessionId,
    joinUrl: joinUrlPath,
    qrDataUrl: sess.qrDataUrl,
    mode: sess.mode,
  });
});

// Generate a QR for a given mode's join path
app.get("/api/session/:sessionId/qr", async (req, res) => {
  const { sessionId } = req.params;
  const mode = String(req.query.mode || "quiz");
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: "not_found" });
  const joinUrlPath =
    mode === "simple" ? `/simple/join/${sessionId}` : `/join/${sessionId}`;
  const fullJoinUrl = `${PRIMARY_ORIGIN}${joinUrlPath}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(fullJoinUrl, {
      margin: 1,
      scale: 4,
    });
    return res.json({ sessionId, joinUrl: joinUrlPath, qrDataUrl });
  } catch (e) {
    return res.status(500).json({ error: "qr_failed" });
  }
});

// Minimal session info for joining (to discover mode)
app.get("/api/session/:sessionId/info", (req, res) => {
  const { sessionId } = req.params;
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: "not_found" });
  res.json({ sessionId, mode: sess.mode });
});

// Reset current round votes (host action)
app.post("/api/session/:sessionId/reset", (req, res) => {
  const { sessionId } = req.params;
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: "not_found" });
  const round = getOrCreateRound(sess);
  // Clear votes and bump reset sequence
  round.byAck = {};
  round.tally = emptyTally();
  round.resetSeq = (round.resetSeq || 0) + 1;
  // Also clear any reveal on the current question
  if (sess.quiz) {
    sess.quiz.revealedIndex = null;
  }
  // Optionally close voting to avoid accidental immediate votes; host can reopen
  // Keep current votingOpen state as-is to match UI expectations

  // Notify host with fresh state (tally zeros, counts updated)
  io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
  // Notify audience so clients that had voted can vote again in the same round
  io.to(`aud:${sessionId}`).emit("audience:state", {
    roundId: sess.roundId,
    votingOpen: sess.votingOpen,
    resetSeq: round.resetSeq,
    scores: sess.scores,
    roundAwards: round.awarded,
    question: sess.question || null,
    reveal: sessionState(sess).reveal,
  });
  res.json({ ok: true, roundId: sess.roundId, tally: round.tally });
});

// Load a quiz by code and set the first question/options into session state
// Body: { code: string }
app.post("/api/session/:sessionId/loadQuiz", async (req, res) => {
  const { sessionId } = req.params;
  const { code } = req.body || {};
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: "not_found" });
  if (!code || typeof code !== "string")
    return res.status(400).json({ error: "bad_code" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: "quiz_source_unavailable" });
  }
  // Lazy import to avoid hard dep if not configured
  let createClient;
  try {
    ({ createClient } = require("@supabase/supabase-js"));
  } catch (e) {
    return res.status(503).json({ error: "quiz_source_unavailable" });
  }
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
    }
  );
  try {
    // Find quiz by code
    const { data: quiz, error: qErr } = await sb
      .from("quizzes")
      .select("id, slug, title")
      .eq("code", code)
      .single();
    if (qErr || !quiz) return res.status(404).json({ error: "quiz_not_found" });
    // Get phases sorted then first question with options
    const { data: phases, error: pErr } = await sb
      .from("phases")
      .select("id, title, sort_order")
      .eq("quiz_id", quiz.id)
      .order("sort_order", { ascending: true });
    if (pErr || !phases?.length)
      return res.status(404).json({ error: "no_phases" });
    // Load questions for all phases, preserving phase order
    const phaseIds = phases.map((p) => p.id);
    const { data: allQuestions, error: quErr } = await sb
      .from("questions")
      .select("id, text, phase_id, note")
      .in("phase_id", phaseIds)
      .order("phase_id", { ascending: true })
      .order("id", { ascending: true });
    if (quErr || !allQuestions?.length)
      return res.status(404).json({ error: "no_questions" });
    const qIds = allQuestions.map((x) => x.id);
    const { data: allOptions, error: oErr } = await sb
      .from("options")
      .select("id, text, question_id, audio_uri, is_correct")
      .in("question_id", qIds)
      .order("question_id", { ascending: true })
      .order("id", { ascending: true });
    if (oErr) return res.status(500).json({ error: "no_options" });
    const optionsByQ = new Map();
    for (const opt of allOptions || []) {
      const arr = optionsByQ.get(opt.question_id) || [];
      arr.push({ text: opt.text, audioUri: opt.audio_uri || null });
      optionsByQ.set(opt.question_id, arr);
    }
    const phaseTitleById = new Map();
    for (const p of phases) phaseTitleById.set(p.id, p.title);
    const compiled = allQuestions
      .map((qq) => {
        const raw = (optionsByQ.get(qq.id) || []).slice(0, 4);
        while (raw.length < 4)
          raw.push({ text: "", audioUri: null, isCorrect: false });
        const opts = raw.map((o, i) => ({
          text: o.text,
          audioUri: o.audioUri,
          isCorrect: !!allOptions?.find(
            (oo) => oo.question_id === qq.id && oo.text === o.text
          )?.is_correct,
        }));
        return {
          id: qq.id,
          text: qq.text,
          phaseId: qq.phase_id,
          phaseTitle: phaseTitleById.get(qq.phase_id) || undefined,
          note: qq.note ?? null,
          options: opts,
        };
      })
      .filter((q) => q.options.length > 0);
    if (!compiled.length) return res.status(404).json({ error: "no_options" });

    // Initialize quiz state and current question index
    sess.quiz = {
      id: quiz.id,
      title: quiz.title,
      index: 0,
      revealedIndex: null,
      questions: compiled,
    };
    sess.question = {
      text: compiled[0].text,
      options: compiled[0].options,
      phaseTitle: compiled[0].phaseTitle,
      note: compiled[0].note,
    };
    // Broadcast question to host and audience
    const state = sessionState(sess);
    io.to(`host:${sessionId}`).emit("state:update", state);
    io.to(`aud:${sessionId}`).emit("audience:state", {
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
      scores: sess.scores,
      roundAwards: getOrCreateRound(sess).awarded,
      question: state.question,
      reveal: state.reveal,
    });
    return res.json({
      ok: true,
      question: state.question,
      quiz: { id: quiz.id, title: quiz.title },
      count: compiled.length,
    });
  } catch (e) {
    return res.status(500).json({ error: "quiz_load_failed" });
  }
});

// Simple server-side Deezer proxy to get preview URL (avoids CORS issues)
app.get("/api/deezer/track/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "bad_id" });
  try {
    const r = await fetch(
      `https://api.deezer.com/track/${encodeURIComponent(id)}`
    );
    if (!r.ok) {
      console.log("Deezer API error:", r.statusText);
      return res.status(502).json({ error: "deezer_unavailable" });
    }
    const j = await r.json();
    return res.json({
      preview: j.preview || null,
      title: j.title || null,
      artist: j.artist?.name || null,
    });
  } catch (e) {
    return res.status(500).json({ error: "deezer_failed" });
  }
});

// Validate a quiz code without creating a session
// Body: { code: string }
app.post("/api/quiz/validate", async (req, res) => {
  const { code } = req.body || {};
  if (!code || typeof code !== "string")
    return res.status(400).json({ error: "bad_code" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: "quiz_source_unavailable" });
  }
  let createClient;
  try {
    ({ createClient } = require("@supabase/supabase-js"));
  } catch (e) {
    return res.status(503).json({ error: "quiz_source_unavailable" });
  }
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false },
    }
  );
  try {
    const { data: quiz, error: qErr } = await sb
      .from("quizzes")
      .select("id, slug, title")
      .eq("code", code)
      .single();
    if (qErr || !quiz) return res.status(404).json({ error: "quiz_not_found" });
    const { data: phases, error: pErr } = await sb
      .from("phases")
      .select("id, sort_order")
      .eq("quiz_id", quiz.id)
      .order("sort_order", { ascending: true });
    if (pErr || !phases?.length)
      return res.status(404).json({ error: "no_phases" });
    const firstPhase = phases[0];
    const { data: questions, error: quErr } = await sb
      .from("questions")
      .select("id")
      .eq("phase_id", firstPhase.id)
      .order("id", { ascending: true })
      .limit(1);
    if (quErr || !questions?.length)
      return res.status(404).json({ error: "no_questions" });
    const q = questions[0];
    const { data: options, error: oErr } = await sb
      .from("options")
      .select("id")
      .eq("question_id", q.id)
      .order("id", { ascending: true })
      .limit(4);
    if (oErr || !options?.length)
      return res.status(404).json({ error: "no_options" });
    return res.json({ ok: true, quiz: { id: quiz.id, title: quiz.title } });
  } catch (e) {
    return res.status(500).json({ error: "quiz_validate_failed" });
  }
});

// Assign/toggle a point to a team for the current round (host action)
// Body: { team: 'A' | 'B', award?: boolean }
app.post("/api/session/:sessionId/score", (req, res) => {
  const { sessionId } = req.params;
  const { team, award } = req.body || {};
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: "not_found" });
  if (!["A", "B"].includes(team))
    return res.status(400).json({ error: "bad_team" });
  const round = getOrCreateRound(sess);
  if (!sess.scores) sess.scores = { A: 0, B: 0 };
  if (!round.awarded) round.awarded = { A: false, B: false };
  // Determine desired new state: toggle if award not provided, else set as boolean
  const current = !!round.awarded[team];
  const next = typeof award === "boolean" ? !!award : !current;
  if (next !== current) {
    // Adjust cumulative score based on change
    if (next) {
      sess.scores[team] = (sess.scores[team] || 0) + 1;
    } else {
      sess.scores[team] = Math.max(0, (sess.scores[team] || 0) - 1);
    }
    round.awarded[team] = next;
  }
  // Notify clients
  const state = sessionState(sess);
  io.to(`host:${sessionId}`).emit("state:update", state);
  io.to(`aud:${sessionId}`).emit("audience:state", {
    roundId: sess.roundId,
    votingOpen: sess.votingOpen,
    scores: sess.scores,
    roundAwards: round.awarded,
  });
  res.json({
    ok: true,
    scores: sess.scores,
    roundId: sess.roundId,
    roundAwards: round.awarded,
  });
});

// ---- Socket.IO ----
io.on("connection", (socket) => {
  const ipAddr =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  dbg(`[conn] socket=${socket.id} ip=${ipAddr}`);
  const ip =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;

  // Host joins a room and gets immediate state
  socket.on("host:subscribe", ({ sessionId }) => {
    dbg(`[host:subscribe] socket=${socket.id} session=${sessionId}`);
    const sess = sessions.get(sessionId);
    if (!sess) return;
    socket.join(`host:${sessionId}`);
    socket.emit("state:update", sessionState(sess));
  });

  // Host controls
  socket.on("session:setVoting", ({ sessionId, votingOpen }) => {
    dbg(`[session:setVoting] session=${sessionId} votingOpen=${votingOpen}`);
    const sess = sessions.get(sessionId);
    if (!sess) return;
    sess.votingOpen = !!votingOpen;
    io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
    io.to(`aud:${sessionId}`).emit("audience:state", {
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
      scores: sess.scores,
      roundAwards: getOrCreateRound(sess).awarded,
      question: sess.question || null,
      reveal: sessionState(sess).reveal,
    });
  });

  socket.on("session:nextRound", ({ sessionId }) => {
    dbg(`[session:nextRound] session=${sessionId}`);
    const sess = sessions.get(sessionId);
    if (!sess) return;
    sess.roundId += 1;
    sess.votingOpen = false;
    getOrCreateRound(sess); // new empty round
    // If quiz loaded, advance to next question (bounded)
    if (sess.quiz && Array.isArray(sess.quiz.questions)) {
      const max = sess.quiz.questions.length - 1;
      sess.quiz.index = Math.min(max, (sess.quiz.index || 0) + 1);
      sess.quiz.revealedIndex = null; // reset reveal on next
      const cq = sess.quiz.questions[sess.quiz.index];
      if (cq)
        sess.question = {
          text: cq.text,
          options: cq.options,
          phaseTitle: cq.phaseTitle,
          note: cq.note,
        };
    }
    io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
    io.to(`aud:${sessionId}`).emit("audience:state", {
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
      scores: sess.scores,
      roundAwards: getOrCreateRound(sess).awarded,
      question: sessionState(sess).question,
      reveal: sessionState(sess).reveal,
    });
  });

  socket.on("session:prevRound", ({ sessionId }) => {
    dbg(`[session:prevRound] session=${sessionId}`);
    const sess = sessions.get(sessionId);
    if (!sess) return;
    if (sess.roundId <= 1) return; // prevent going below round 1
    sess.roundId -= 1;
    sess.votingOpen = false;
    getOrCreateRound(sess); // ensure round exists (it should already)
    // If quiz loaded, move to previous question (bounded)
    if (sess.quiz && Array.isArray(sess.quiz.questions)) {
      sess.quiz.index = Math.max(0, (sess.quiz.index || 0) - 1);
      sess.quiz.revealedIndex = null; // reset reveal on prev
      const cq = sess.quiz.questions[sess.quiz.index];
      if (cq)
        sess.question = {
          text: cq.text,
          options: cq.options,
          phaseTitle: cq.phaseTitle,
          note: cq.note,
        };
    }
    io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
    io.to(`aud:${sessionId}`).emit("audience:state", {
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
      scores: sess.scores,
      roundAwards: getOrCreateRound(sess).awarded,
      question: sessionState(sess).question,
      reveal: sessionState(sess).reveal,
    });
  });

  // Host reveals the correct answer(s) for the current question
  socket.on("session:reveal", ({ sessionId }) => {
    dbg(`[session:reveal] session=${sessionId}`);
    const sess = sessions.get(sessionId);
    if (!sess || !sess.quiz) return;
    sess.quiz.revealedIndex = sess.quiz.index;
    const state = sessionState(sess);
    io.to(`host:${sessionId}`).emit("state:update", state);
    io.to(`aud:${sessionId}`).emit("audience:state", {
      roundId: sess.roundId,
      votingOpen: sess.votingOpen,
      scores: sess.scores,
      roundAwards: getOrCreateRound(sess).awarded,
      question: state.question,
      reveal: state.reveal,
    });
  });

  // Audience flow
  socket.on("audience:join", ({ sessionId, clientAck, sig }, ackCb) => {
    dbg(
      `[audience:join] socket=${socket.id} session=${sessionId} ack=${
        clientAck ? clientAck.slice(0, 8) : "NEW"
      }`
    );
    if (!checkRate(ip, "join"))
      return ackCb && ackCb({ error: "rate_limited" });
    const sess = sessions.get(sessionId);
    if (!sess) return ackCb && ackCb({ error: "not_found" });
    // Join audience room for live voting state updates
    socket.join(`aud:${sessionId}`);
    socket.data.audienceSessionId = sessionId;

    // If client provided an existing ack, respect it
    if (clientAck && sess.acks.has(clientAck)) {
      const round = getOrCreateRound(sess);
      const response = {
        clientAck,
        roundId: sess.roundId,
        votingOpen: sess.votingOpen,
        hasVoted: !!round.byAck[clientAck],
        scores: sess.scores,
        roundAwards: round.awarded,
        mode: sess.mode,
        question: sess.question || null,
        reveal: sessionState(sess).reveal,
      };
      ackCb && ackCb(response);
      io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
      return;
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
      scores: sess.scores,
      roundAwards: getOrCreateRound(sess).awarded,
      mode: sess.mode,
      question: sess.question || null,
      reveal: sessionState(sess).reveal,
    };
    if (ENABLE_HMAC) payload.sig = signAck(newAck);
    sess.acks.add(newAck);
    ackCb && ackCb(payload);
    io.to(`host:${sessionId}`).emit("state:update", sessionState(sess));
  });

  socket.on(
    "audience:vote",
    ({ sessionId, roundId, option, clientAck, sig }, ackCb) => {
      dbg(
        `[audience:vote] socket=${
          socket.id
        } session=${sessionId} round=${roundId} option=${option} ack=${clientAck?.slice(
          0,
          8
        )}`
      );
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
  socket.on("disconnect", (reason) => {
    dbg(`[disconnect] socket=${socket.id} reason=${reason}`);
    const audSessId = socket.data.audienceSessionId;
    if (audSessId) {
      const sess = sessions.get(audSessId);
      if (sess) {
        // Emit updated audience count to host
        io.to(`host:${audSessId}`).emit("state:update", sessionState(sess));
      }
    }
  });
});

if (!DEV) {
  console.log("Serving static files from /client/dist\n");
  app.use(express.static(path.join(__dirname, "..", "client", "dist")));
  app.get("*", (_, res) =>
    res.sendFile(path.join(__dirname, "..", "client", "dist", "index.html"))
  );
} else {
  console.warn(
    "Not serving static files in development mode - VITE instance must host itself.\n"
  );
}

server.listen(PORT, () => {
  console.log(`Server environment: DEV=${DEV} PORT=${PORT} DEBUG=${DEBUG}`);
  console.log(`Primary origin (used for links/QR): ${PRIMARY_ORIGIN}`);
  console.log(`CORS: same-origin + allowlist patterns:`, ORIGIN_PATTERNS);
  if (DEV) {
    console.log(`CORS dev defaults enabled:`, DEFAULT_DEV_ORIGINS);
  }
  if (ENV_ORIGINS.length) {
    console.log(`CORS .env allowlist:`, ENV_ORIGINS);
  }
});
