import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { __DEBUG__, socket } from "../socket.js";

function ackKey(sessionId) {
  return `ata:${sessionId}:ack`;
}

export default function SimpleAudienceView() {
  const { sessionId } = useParams();
  const [votingOpen, setVotingOpen] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [choice, setChoice] = useState(null);

  const storedAck = useMemo(
    () => localStorage.getItem(ackKey(sessionId)),
    [sessionId]
  );

  useEffect(() => {
    socket.emit(
      "audience:join",
      { sessionId, clientAck: storedAck || undefined },
      (resp) => {
        if (__DEBUG__) console.log("[simple-aud][join:ack] response", resp);
        if (resp?.error) return;
        if (resp?.clientAck && !storedAck) {
          localStorage.setItem(ackKey(sessionId), resp.clientAck);
        }
        setVotingOpen(!!resp.votingOpen);
        setHasVoted(!!resp.hasVoted);
      }
    );
  }, [sessionId]);

  useEffect(() => {
    function onAudState(msg) {
      if (typeof msg?.votingOpen === "boolean") setVotingOpen(msg.votingOpen);
      if (typeof msg?.resetSeq === "number") {
        setHasVoted(false);
        setChoice(null);
      }
    }
    socket.on("audience:state", onAudState);
    return () => socket.off("audience:state", onAudState);
  }, []);

  function cast(option) {
    if (!votingOpen) return;
    const ok = window.confirm(`Lock in your choice: ${option}?`);
    if (!ok) return;
    const clientAck = localStorage.getItem(ackKey(sessionId));
    socket.emit(
      "audience:vote",
      { sessionId, roundId: 1, option, clientAck },
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
      <h2 className="mb-2 text-xl font-semibold">Vælg dit svar</h2>
      {hasVoted ? (
        <p className="text-gold mb-2 font-bold">
          Du valgte <b>{choice ?? "…"}</b>. Tak! Din stemme er låst ✨
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
        {["A", "B", "C", "D"].map((k) => (
          <button
            key={k}
            className="option transition"
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
