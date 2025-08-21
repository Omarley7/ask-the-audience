import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { __DEBUG__, socket } from "../socket.js";

function ackKey(sessionId) {
  return `ata:${sessionId}:ack`;
}

export default function AudienceView() {
  const { sessionId } = useParams();
  const [roundId, setRoundId] = useState(1);
  const [votingOpen, setVotingOpen] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [choice, setChoice] = useState(null);
  const [question, setQuestion] = useState(null); // { text, options: string[4] }
  const [scores, setScores] = useState({ A: 0, B: 0 });
  const [roundAwards, setRoundAwards] = useState({ A: false, B: false });
  // Joining always open while session exists

  const storedAck = useMemo(
    () => localStorage.getItem(ackKey(sessionId)),
    [sessionId]
  );

  // Join on mount (or rejoin with existing ack)
  useEffect(() => {
    if (__DEBUG__)
      console.log("[aud][join] emitting audience:join", {
        sessionId,
        hadStoredAck: !!storedAck,
      });
    socket.emit(
      "audience:join",
      { sessionId, clientAck: storedAck || undefined },
      (resp) => {
        if (__DEBUG__) console.log("[aud][join:ack] response", resp);
        if (resp?.error) {
          if (__DEBUG__) console.warn("[aud][join:error]", resp.error);
          return; // could handle 'full'
        }
        if (resp?.clientAck && !storedAck) {
          if (__DEBUG__) console.log("[aud][join] storing new clientAck");
          localStorage.setItem(ackKey(sessionId), resp.clientAck);
        }
        setRoundId(resp.roundId);
        setVotingOpen(!!resp.votingOpen);
        setHasVoted(!!resp.hasVoted);
        if (resp?.question) setQuestion(resp.question);
        if (resp?.scores) setScores(resp.scores);
        if (resp?.roundAwards) setRoundAwards(resp.roundAwards);
        if (__DEBUG__)
          console.log("[aud][state:init]", {
            roundId: resp.roundId,
            votingOpen: !!resp.votingOpen,
            hasVoted: !!resp.hasVoted,
          });
      }
    );
  }, [sessionId]);

  // Live updates from host (voting open/close, round resets)
  useEffect(() => {
    function onAudState(msg) {
      if (__DEBUG__) console.log("[aud][state:update] incoming", msg);
      if (msg?.roundId && msg.roundId !== roundId) {
        if (__DEBUG__)
          console.log("[aud][state:round] change", roundId, "->", msg.roundId);
        setRoundId(msg.roundId);
        // new round -> allow new vote
        setHasVoted(false);
        setChoice(null);
      }
      if (typeof msg?.votingOpen === "boolean") {
        if (__DEBUG__)
          console.log(
            "[aud][state:votingOpen]",
            votingOpen,
            "->",
            msg.votingOpen
          );
        setVotingOpen(msg.votingOpen);
        if (!msg.votingOpen) {
          // when voting closes, keep hasVoted/choice; on new round reset local vote state
        }
      }
      // If host resets current round, we might receive a marker; unlock vote
      if (typeof msg?.resetSeq === "number" && msg.roundId === roundId) {
        if (__DEBUG__) console.log("[aud][state:reset] unlocking vote");
        setHasVoted(false);
        setChoice(null);
      }
      if (msg?.scores) setScores(msg.scores);
      if (msg?.roundAwards) setRoundAwards(msg.roundAwards);
      if (msg?.question) setQuestion(msg.question);
    }
    socket.on("audience:state", onAudState);
    return () => socket.off("audience:state", onAudState);
  }, [roundId]);

  // Reset lock on round change via soft polling from host updates? Not required for audience.
  // Audience does not receive live round updates; their state gets refreshed on rejoin.

  function cast(option) {
    if (!votingOpen) {
      if (__DEBUG__)
        console.log("[aud][vote] blocked: voting closed", { option });
      return;
    }
    const ok = window.confirm(`Lock in your choice: ${option}?`);
    if (!ok) return;
    const clientAck = localStorage.getItem(ackKey(sessionId));
    if (__DEBUG__)
      console.log("[aud][vote] emitting audience:vote", {
        option,
        roundId,
        hasVoted,
      });
    socket.emit(
      "audience:vote",
      { sessionId, roundId, option, clientAck },
      (resp) => {
        if (__DEBUG__) console.log("[aud][vote:ack]", resp);
        if (resp?.ok) {
          setHasVoted(true);
          setChoice(option);
        } else if (resp?.error) {
          if (__DEBUG__) console.warn("[aud][vote:error]", resp.error);
          alert(`Could not vote: ${resp.error}`);
        }
      }
    );
  }

  const disabled = !votingOpen || hasVoted;

  return (
    <div className="card">
      <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        Vælg dit svar <span className="badge">Runde #{roundId}</span>
      </h2>
      {question?.text && (
        <div className="mb-3">
          <div className="text-gold text-base font-semibold">Spørgsmål</div>
          <p className="mt-1 text-sm text-gray-200">{question.text}</p>
        </div>
      )}
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-300">
        <span className="badge">Team A: {scores.A ?? 0}</span>
        <span className="badge">Team B: {scores.B ?? 0}</span>
        {(roundAwards?.A || roundAwards?.B) && (
          <span className="badge" title="Point tildelt i denne runde">
            🏆 Runde:{" "}
            {[
              roundAwards?.A ? "Team A" : null,
              roundAwards?.B ? "Team B" : null,
            ]
              .filter(Boolean)
              .join(" & ")}
          </span>
        )}
      </div>
      {hasVoted ? (
        <p className="text-gold mb-2 font-bold">
          Du valgte <b>{choice ?? "…"}</b>. Tak! Din stemme er låst for denne
          runde ✨
        </p>
      ) : !votingOpen ? (
        <p className="text-gold mb-2 font-bold">
          Afstemningen er ikke åben endnu
        </p>
      ) : (
        <p className="text-gold mb-2 font-bold">Afstemningen er åben 💕</p>
      )}
      <div
        className="grid grid-cols-2 gap-4 max-sm:grid-cols-1"
        role="group"
        aria-label="Answer options"
      >
        {["A", "B", "C", "D"].map((k, idx) => {
          const isChosen = hasVoted && choice === k;
          const label = question?.options?.[idx];
          return (
            <button
              key={k}
              className={
                "option transition " +
                (isChosen ? "ring-4 ring-[#ffe9a9] scale-[1.02]" : "")
              }
              onClick={() => cast(k)}
              disabled={disabled}
              aria-disabled={disabled}
              title={
                disabled
                  ? "Afventer åben afstemning eller du har allerede stemt"
                  : `Vælg ${k}`
              }
              accessKey={k.toLowerCase()}
            >
              <div className="text-2xl font-bold">{k}</div>
              {label ? (
                <div className="mt-1 text-sm text-gray-200">{label}</div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
