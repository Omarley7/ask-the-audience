import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BarChart from "../components/BarChart.jsx";
import Qr from "../components/Qr.jsx";
import { __DEBUG__, SERVER_URL, socket } from "../socket.js";

export default function SimpleHostView() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const [sess, setSess] = useState({ sessionId, joinUrl: "", qrDataUrl: "" });
  const [state, setState] = useState({
    roundId: 1,
    votingOpen: false,
    tally: { A: 0, B: 0, C: 0, D: 0 },
  });
  const activeId = sessionId || sess.sessionId;

  // Create session if not provided
  useEffect(() => {
    if (!sessionId) {
      (async () => {
        const res = await fetch(`${SERVER_URL}/api/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "simple" }),
        });
        const data = await res.json();
        if (__DEBUG__) console.log("[simple-host] created session", data);
        setSess(data);
        nav(`/simple/host/${data.sessionId}`, { replace: true });
      })();
    } else if (sess.sessionId && !sess.qrDataUrl) {
      (async () => {
        const r = await fetch(
          `${SERVER_URL}/api/session/${sess.sessionId}/qr?mode=simple`
        );
        if (r.ok) {
          const data = await r.json();
          setSess(data);
        }
      })();
    }
  }, [sessionId]);

  // Subscribe as host for state updates
  useEffect(() => {
    if (!activeId) return;
    socket.emit("host:subscribe", { sessionId: activeId });
    const onUpdate = (s) =>
      setState({
        roundId: s.roundId,
        votingOpen: s.votingOpen,
        tally: s.tally,
      });
    socket.on("state:update", onUpdate);
    return () => socket.off("state:update", onUpdate);
  }, [activeId]);

  function toggleVoting(open) {
    if (!activeId) return;
    setState((prev) => ({ ...prev, votingOpen: open }));
    socket.emit("session:setVoting", { sessionId: activeId, votingOpen: open });
  }

  async function resetCurrentRound() {
    if (!activeId) return;
    const ok = window.confirm(`Nulstil?`);
    if (!ok) return;
    try {
      await fetch(`${SERVER_URL}/api/session/${activeId}/reset`, {
        method: "POST",
      });
    } catch (e) {
      if (__DEBUG__) console.warn("[simple-host] reset error", e);
    }
  }

  const joinHref = `${location.origin}/simple/join/${activeId ?? ""}`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={"card" + (state.votingOpen ? " open-glow" : "")}>
        <h2 className="mb-2 text-xl font-semibold max-md:text-center">
          Værtspanel (simpel)
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {!state.votingOpen ? (
            <button
              className="primary grow saturate-150"
              onClick={() => toggleVoting(true)}
            >
              Åben
            </button>
          ) : (
            <button
              className="primary grow"
              onClick={() => toggleVoting(false)}
            >
              Luk
            </button>
          )}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button className="warn grow" onClick={resetCurrentRound}>
            Nulstil
          </button>
        </div>
        <div className="panel flex flex-col items-center gap-4">
          <div className="flex flex-nowrap items-center gap-4">
            <div className="copy text-base">
              {sessionId ?? sess.sessionId ?? "..."}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(joinHref)}
              title="Kopiér deltagerlinket til udklipsholderen"
              className="hover:ring-gold/40 rounded-full border border-[#2a3a7d] bg-[#18224d] px-4 py-2 font-semibold hover:ring-2"
            >
              Kopiér deltagerlink
            </button>
          </div>
          <Qr dataUrl={sess.qrDataUrl} />
        </div>
      </div>
      <div className="card">
        <h2 className="mt-0 text-xl font-semibold">Stemmer lige nu</h2>
        <BarChart tally={state.tally} />
      </div>
    </div>
  );
}
