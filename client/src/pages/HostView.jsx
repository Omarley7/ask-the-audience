import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BarChart from "../components/BarChart.jsx";
import Qr from "../components/Qr.jsx";
import { socket } from "../socket.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function HostView() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const [sess, setSess] = useState({ sessionId, joinUrl: "", qrDataUrl: "" });
  const [state, setState] = useState({
    roundId: 1,
    votingOpen: false,
    tally: { A: 0, B: 0, C: 0, D: 0 },
  });
  // Joining always allowed once session exists
  const activeId = sessionId || sess.sessionId; // use this for emits / links

  // Create session if not provided
  useEffect(() => {
    if (!sessionId) {
      (async () => {
        const res = await fetch(`${API}/api/session`, { method: "POST" });
        const data = await res.json();
        setSess(data);
        nav(`/host/${data.sessionId}`, { replace: true });
      })();
    }
  }, [sessionId]);

  // Subscribe as host for state updates
  useEffect(() => {
    if (!activeId) return;
    socket.emit("host:subscribe", { sessionId: activeId });
    const onUpdate = (s) => {
      setState(s);
    };
    socket.on("state:update", onUpdate);
    return () => socket.off("state:update", onUpdate);
  }, [activeId]);

  // Fetch QR & join link if navigated directly with existing sessionId (best-effort)
  useEffect(() => {
    (async () => {
      if (sessionId && !sess.qrDataUrl) {
        try {
          // tiny helper: call session create endpoint ONLY if we don't already know joinUrl.
          // In a real app we'd have a GET, but we're keeping API minimal; so skip here.
        } catch {}
      }
    })();
  }, [sessionId]);

  function toggleVoting(open) {
    if (!activeId) return;
    // optimistic update for snappier UI
    setState((prev) => ({ ...prev, votingOpen: open }));
    socket.emit("session:setVoting", { sessionId: activeId, votingOpen: open });
  }
  function resetRound() {
    socket.emit("session:reset", { sessionId });
  }

  const joinHref = `${location.origin}/join/${activeId ?? ""}`;

  return (
    <div className="grid">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Session</h2>
        <div className="bgroup" style={{ marginBottom: "1rem" }}>
          {!state.votingOpen && (
            <button className="primary" onClick={() => toggleVoting(true)}>
              Open voting
            </button>
          )}
          {state.votingOpen && (
            <button onClick={() => toggleVoting(false)}>Close voting</button>
          )}
          <button className="warn" onClick={resetRound}>
            Next round
          </button>
        </div>
        <div className="status">
          <span className="badge">Round #{state.roundId}</span>
          <span>•</span>
          <span className="badge">
            {state.votingOpen ? "Voting OPEN" : "Voting CLOSED"}
          </span>
        </div>

        <div style={{ marginTop: "1rem" }} className="panel">
          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>Session code</div>
              <div className="copy">{sessionId ?? sess.sessionId ?? "..."}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>Join link</div>
              <div
                className="copy"
                style={{ display: "flex", gap: ".5rem", alignItems: "center" }}
              >
                <a
                  className="link"
                  href={joinHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  {joinHref}
                </a>
                <button
                  onClick={() => navigator.clipboard?.writeText(joinHref)}
                >
                  Copy
                </button>
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <Qr dataUrl={sess.qrDataUrl} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Live Tally</h2>
        <BarChart tally={state.tally} />
      </div>
    </div>
  );
}
