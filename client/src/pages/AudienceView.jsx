import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../socket.js";

function ackKey(sessionId) {
  return `ata:${sessionId}:ack`;
}

export default function AudienceView() {
  const { sessionId } = useParams();
  const [roundId, setRoundId] = useState(1);
  const [votingOpen, setVotingOpen] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [choice, setChoice] = useState(null);
  // Joining always open while session exists

  const storedAck = useMemo(
    () => localStorage.getItem(ackKey(sessionId)),
    [sessionId]
  );

  // Join on mount (or rejoin with existing ack)
  useEffect(() => {
    socket.emit(
      "audience:join",
      { sessionId, clientAck: storedAck || undefined },
      (resp) => {
        if (resp?.error) return; // could handle 'full'
        if (resp?.clientAck && !storedAck) {
          localStorage.setItem(ackKey(sessionId), resp.clientAck);
        }
        setRoundId(resp.roundId);
        setVotingOpen(!!resp.votingOpen);
        setHasVoted(!!resp.hasVoted);
      }
    );
  }, [sessionId]);

  // Live updates from host (voting open/close, round resets)
  useEffect(() => {
    function onAudState(msg) {
      if (msg?.roundId && msg.roundId !== roundId) {
        setRoundId(msg.roundId);
        // new round -> allow new vote
        setHasVoted(false);
        setChoice(null);
      }
      if (typeof msg?.votingOpen === "boolean") {
        setVotingOpen(msg.votingOpen);
        if (!msg.votingOpen) {
          // when voting closes, keep hasVoted/choice; on new round reset local vote state
        }
      }
    }
    socket.on("audience:state", onAudState);
    return () => socket.off("audience:state", onAudState);
  }, [roundId]);

  // Reset lock on round change via soft polling from host updates? Not required for audience.
  // Audience does not receive live round updates; their state gets refreshed on rejoin.

  function cast(option) {
    if (!votingOpen) return;
    const ok = window.confirm(`Lock in your choice: ${option}?`);
    if (!ok) return;
    const clientAck = localStorage.getItem(ackKey(sessionId));
    socket.emit(
      "audience:vote",
      { sessionId, roundId, option, clientAck },
      (resp) => {
        if (resp?.ok) {
          setHasVoted(true);
          setChoice(option);
        } else if (resp?.error) {
          alert(`Could not vote: ${resp.error}`);
        }
      }
    );
  }

  const disabled = !votingOpen || hasVoted;

  return (
    <div className="card">
      <h2
        style={{
          marginTop: 0,
          display: "flex",
          alignItems: "center",
          gap: ".5rem",
        }}
      >
        Vælg dit svar <span className="badge">Runde #{roundId}</span>
      </h2>
      {!votingOpen && (
        <p className="lock">
          Afstemningen er ikke åben endnu – vær sød at vente et øjeblik 💕
        </p>
      )}
      {hasVoted && (
        <p className="lock">
          Du valgte <b>{choice ?? "…"}</b>. Tak! Din stemme er låst for denne
          runde ✨
        </p>
      )}
      <div className="biggrid" role="group" aria-label="Answer options">
        {["A", "B", "C", "D"].map((k) => (
          <button
            key={k}
            className="option gold"
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
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
