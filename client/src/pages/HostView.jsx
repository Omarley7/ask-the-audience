import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BarChart from "../components/BarChart.jsx";
import Qr from "../components/Qr.jsx";
import { __DEBUG__, SERVER_URL, socket } from "../socket.js";

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
        const res = await fetch(`${SERVER_URL}/api/session`, {
          method: "POST",
        });
        const data = await res.json();
        console.log("[host] created session", data);
        setSess(data);
        nav(`/host/${data.sessionId}`, { replace: true });
      })();
    } else if (sess.sessionId && !sess.qrDataUrl) {
      console.log(
        "[host] fetching QR code for existing session",
        sess.sessionId
      );
      (async () => {
        const r = await fetch(`${SERVER_URL}/api/session/${sess.sessionId}`);
        if (r.ok) {
          const data = await r.json();
          if (__DEBUG__) console.log("[host] fetched existing session", data);
          setSess(data);
        } else if (__DEBUG__) {
          console.warn("[host] failed to fetch session", r.status);
        }
      })();
    }
  }, [sessionId]);

  // Subscribe as host for state updates
  useEffect(() => {
    if (!activeId) return;
    if (__DEBUG__) console.log("[host] subscribe ->", activeId);
    socket.emit("host:subscribe", { sessionId: activeId });
    const onUpdate = (s) => {
      if (__DEBUG__) console.log("[host] state:update", s);
      setState(s);
    };
    socket.on("state:update", onUpdate);
    return () => socket.off("state:update", onUpdate);
  }, [activeId]);

  function toggleVoting(open) {
    if (!activeId) return;
    // optimistic update for snappier UI
    if (__DEBUG__)
      console.log("[host] toggleVoting emit", {
        sessionId: activeId,
        votingOpen: open,
      });
    setState((prev) => ({ ...prev, votingOpen: open }));
    socket.emit("session:setVoting", { sessionId: activeId, votingOpen: open });
  }
  function nextRound() {
    if (__DEBUG__)
      console.log("[host] nextRound emit", { sessionId: activeId });
    socket.emit("session:nextRound", { sessionId: activeId });
  }
  function prevRound() {
    if (__DEBUG__)
      console.log("[host] prevRound emit", { sessionId: activeId });
    socket.emit("session:prevRound", { sessionId: activeId });
  }

  async function resetCurrentRound() {
    if (!activeId) return;
    const totalVotes =
      (state?.tally?.A || 0) +
      (state?.tally?.B || 0) +
      (state?.tally?.C || 0) +
      (state?.tally?.D || 0);
    const ok = window.confirm(
      totalVotes > 0
        ? `Nulstil runde #${state.roundId}? Dette sletter ${totalVotes} stemme(r).`
        : `Nulstil runde #${state.roundId}?`
    );
    if (!ok) return;
    try {
      if (__DEBUG__)
        console.log("[host] POST reset round", {
          url: `${SERVER_URL}/api/session/${activeId}/reset`,
        });
      // Optimistic: zero tally immediately
      setState((prev) => ({
        ...prev,
        tally: { A: 0, B: 0, C: 0, D: 0 },
      }));
      const r = await fetch(`${SERVER_URL}/api/session/${activeId}/reset`, {
        method: "POST",
      });
      if (!r.ok) {
        if (__DEBUG__) console.warn("[host] reset failed", r.status);
        // Re-fetch state by re-subscribing ping
        socket.emit("host:subscribe", { sessionId: activeId });
        alert("Kunne ikke nulstille runden");
      }
    } catch (e) {
      if (__DEBUG__) console.error("[host] reset error", e);
      alert("Kunne ikke nulstille runden");
    }
  }

  const joinHref = `${location.origin}/join/${activeId ?? ""}`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={"card" + (state.votingOpen ? " open-glow" : "")}>
        <h2 className="mb-2 text-xl font-semibold max-md:text-center">
          Værtspanel
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {!state.votingOpen && (
            <button
              className="primary grow saturate-150"
              onClick={() => toggleVoting(true)}
            >
              Åben
            </button>
          )}
          {state.votingOpen && (
            <button
              className="primary grow"
              onClick={() => toggleVoting(false)}
            >
              Luk
            </button>
          )}
          <button className="secondary bg-green-900" onClick={nextRound}>
            Næste
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {(() => {
            const totalVotes =
              (state.tally?.A || 0) +
              (state.tally?.B || 0) +
              (state.tally?.C || 0) +
              (state.tally?.D || 0);
            const disabled = totalVotes === 0;
            return (
              <button
                className={
                  "warn grow " + (disabled ? "saturate-50 opacity-60" : "")
                }
                disabled={disabled}
                title={
                  disabled
                    ? "Ingen stemmer at nulstille"
                    : "Nulstil denne runde (sletter alle stemmer)"
                }
                onClick={resetCurrentRound}
              >
                Nulstil
              </button>
            );
          })()}
          {state.roundId > 1 && (
            <button className="secondary" onClick={prevRound}>
              Tilbage
            </button>
          )}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-400">
          <span className="badge">Runde #{state.roundId}</span>
          {typeof state.audienceCount === "number" && (
            <span className="badge" title="Aktive deltagere">
              👥 {state.audienceCount}
            </span>
          )}
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
