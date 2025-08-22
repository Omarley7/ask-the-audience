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
    scores: { A: 0, B: 0 },
    roundAwards: { A: false, B: false },
    question: null,
    reveal: { show: false, correctLetters: [] },
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

  function revealNow() {
    if (!activeId) return;
    if (__DEBUG__) console.log("[host] reveal emit", { sessionId: activeId });
    socket.emit("session:reveal", { sessionId: activeId });
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

  async function awardPoint(team) {
    if (!activeId) return;
    if (!["A", "B"].includes(team)) return;
    try {
      // Optimistic update
      setState((prev) => ({
        ...prev,
        scores: {
          ...prev.scores,
          [team]:
            (prev.scores?.[team] || 0) + (prev.roundAwards?.[team] ? 0 : 1),
        },
        roundAwards: { ...prev.roundAwards, [team]: !prev.roundAwards?.[team] },
      }));
      const r = await fetch(`${SERVER_URL}/api/session/${activeId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team }), // toggle
      });
      if (!r.ok) {
        // revert by re-syncing
        socket.emit("host:subscribe", { sessionId: activeId });
      }
    } catch (e) {
      if (__DEBUG__) console.error("[host] awardPoint error", e);
      socket.emit("host:subscribe", { sessionId: activeId });
    }
  }

  const joinHref = `${location.origin}/join/${activeId ?? ""}`;
  const hasCorrect = Array.isArray(state?.question?.options)
    ? state.question.options.some(
        (o) => o && typeof o === "object" && o.isCorrect
      )
    : false;

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
          {hasCorrect && !state?.reveal?.show && (
            <button
              className="secondary bg-amber-900"
              onClick={revealNow}
              title="Fremhæv de korrekte svar på vært og publikum"
            >
              Reveal
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
        <div className="mb-2 flex items-center gap-2 text-sm text-gray-300">
          <span className="badge">Team A: {state.scores?.A ?? 0}</span>
          <span className="badge">Team B: {state.scores?.B ?? 0}</span>
          {(state.roundAwards?.A || state.roundAwards?.B) && (
            <span className="badge" title="Point tildelt i denne runde">
              🏆 Runde:{" "}
              {[
                state.roundAwards?.A ? "Team A" : null,
                state.roundAwards?.B ? "Team B" : null,
              ]
                .filter(Boolean)
                .join(" & ")}
            </span>
          )}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={
              "secondary " +
              (state.roundAwards?.A ? "opacity-70 ring-2 ring-green-700" : "")
            }
            onClick={() => awardPoint("A")}
            title="Giv Team A et point for denne runde"
          >
            {state.roundAwards?.A ? "-1 Team A" : "+1 Team A"}
          </button>
          <button
            className={
              "secondary " +
              (state.roundAwards?.B ? "opacity-70 ring-2 ring-green-700" : "")
            }
            onClick={() => awardPoint("B")}
            title="Giv Team B et point for denne runde"
          >
            {state.roundAwards?.B ? "-1 Team B" : "+1 Team B"}
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
        {state.question?.text && (
          <div className="panel mb-4">
            <div className="text-gold font-semibold">
              {state.question?.phaseTitle ? (
                <span>
                  {state.question.phaseTitle}
                  <span className="opacity-70"> · Aktuelt spørgsmål</span>
                </span>
              ) : (
                "Aktuelt spørgsmål"
              )}
            </div>
            <p className="mt-1 text-sm text-gray-200">{state.question.text}</p>
            <ul className="mt-2 list-inside list-disc text-sm text-gray-300">
              {["A", "B", "C", "D"].map((k, idx) => {
                const opt = state.question?.options?.[idx];
                const text = typeof opt === "string" ? opt : opt?.text;
                const isCorrect = !!(
                  state?.reveal?.show &&
                  state?.reveal?.correctLetters?.includes(k)
                );
                return (
                  <li
                    key={k}
                    className={
                      isCorrect ? "font-semibold text-emerald-400" : undefined
                    }
                  >
                    <span className="font-semibold">{k}:</span> {text || ""}
                    {isCorrect ? <span className="ml-2">✅</span> : null}
                  </li>
                );
              })}
            </ul>
            {state.question?.note ? (
              <div className="mt-3 rounded border border-gray-700 bg-[#0f1330] p-2 text-xs text-gray-300">
                <div className="mb-1 font-semibold text-gray-200">Note</div>
                <div className="whitespace-pre-wrap leading-snug">
                  {state.question.note}
                </div>
              </div>
            ) : null}
          </div>
        )}
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
