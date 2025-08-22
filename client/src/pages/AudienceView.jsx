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
  const [question, setQuestion] = useState(null); // { text, options: Array<{text:string, audioUri?:string|null}> }
  const [scores, setScores] = useState({ A: 0, B: 0 });
  const [roundAwards, setRoundAwards] = useState({ A: false, B: false });
  const [nowPlaying, setNowPlaying] = useState(null); // idx of option playing
  const [audioObj, setAudioObj] = useState(null);
  const [reveal, setReveal] = useState({ show: false, correctLetters: [] });
  const letters = ["A", "B", "C", "D"]; // canonical option letters
  const [order, setOrder] = useState([0, 1, 2, 3]); // display order -> original index
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
        if (resp?.reveal) setReveal(resp.reveal);
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
      if (msg?.reveal) setReveal(msg.reveal);
    }
    socket.on("audience:state", onAudState);
    return () => socket.off("audience:state", onAudState);
  }, [roundId]);

  // Reset lock on round change via soft polling from host updates? Not required for audience.
  // Audience does not receive live round updates; their state gets refreshed on rejoin.

  // Cleanup audio when leaving page
  useEffect(() => {
    return () => {
      try {
        audioObj?.pause?.();
      } catch (e) {
        /* ignore */
      }
    };
  }, [audioObj]);

  // Shuffle displayed option order whenever the question changes
  useEffect(() => {
    if (!question) return;
    const idxs = [0, 1, 2, 3];
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    setOrder(idxs);
    // stop any playing audio on question change
    try {
      audioObj?.pause?.();
    } catch (e) {
      /* ignore */
    }
    setNowPlaying(null);
  }, [question?.text]);

  function extractDeezerId(uri) {
    if (!uri) return null;
    // Accept numeric id, deezer:track:ID, or URLs like https://www.deezer.com/track/ID
    const s = String(uri);
    const m = s.match(/(\d{3,})/); // first long number
    return m ? m[1] : null;
  }

  async function preview(idx) {
    try {
      const opt = question?.options?.[idx];
      const audioUri = typeof opt === "object" ? opt?.audioUri : null;
      const id = extractDeezerId(audioUri);
      if (!id) return alert("Ingen preview tilgængelig");
      // Toggle pause if same track is playing
      if (nowPlaying === idx && audioObj && !audioObj.paused) {
        audioObj.pause();
        setNowPlaying(null);
        return;
      }
      // Fetch directly from Deezer with JSONP to avoid CORS issues
      const j = await new Promise((resolve, reject) => {
        const cbName = `dzCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const script = document.createElement("script");
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("deezer_timeout"));
        }, 10000);
        function cleanup() {
          try {
            delete window[cbName];
          } catch {
            throw new Error("deezer_cleanup_error");
          }
          if (script && script.parentNode)
            script.parentNode.removeChild(script);
          clearTimeout(timeout);
        }
        window[cbName] = (data) => {
          cleanup();
          resolve(data);
        };
        script.onerror = () => {
          cleanup();
          reject(new Error("deezer_script_error"));
        };
        script.src = `https://api.deezer.com/track/${encodeURIComponent(
          id
        )}?output=jsonp&callback=${cbName}`;
        document.body.appendChild(script);
      });
      if (!j || j.error || !j.preview) return alert("Preview ikke tilgængelig");
      try {
        audioObj?.pause?.();
      } catch (e) {
        /* ignore */
      }
      const a = new Audio(j.preview);
      a.onended = () => setNowPlaying(null);
      await a.play();
      setAudioObj(a);
      setNowPlaying(idx);
    } catch (e) {
      if (__DEBUG__) console.error("[aud] preview error", e);
      alert("Kunne ikke afspille preview");
    }
  }

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
  const isCorrectLetter = (k) =>
    reveal?.show &&
    Array.isArray(reveal?.correctLetters) &&
    reveal.correctLetters.includes(k);
  const hideLetters = !!(
    question?.phaseTitle ||
    (question?.options || []).some((o) => typeof o === "object")
  );

  return (
    <div className="card">
      <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        {question?.phaseTitle || "Vælg dit svar"}{" "}
      </h2>
      {question?.text && (
        <div className="mb-3">
          <div className="flex flex-row justify-between">
            <div className="text-gold text-base font-semibold">Spørgsmål</div>
            <span className="badge">Runde #{roundId}</span>
          </div>
          <p className="mt-1 text-base text-gray-100">{question.text}</p>
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
        {order.map((origIdx) => {
          const k = letters[origIdx];
          const isChosen = hasVoted && choice === k;
          const opt = question?.options?.[origIdx];
          const text = typeof opt === "string" ? opt : opt?.text;
          const hasAudio = opt && typeof opt === "object" && !!opt.audioUri;
          if (hasAudio) {
            return (
              <div
                key={k}
                className={
                  "flex" + (isCorrectLetter(k) ? " open-glow rounded-xl" : "")
                }
              >
                <button
                  className={
                    "option transition flex-1 border-r-0 rounded-r-none " +
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
                  {!hideLetters && (
                    <div className="text-2xl font-bold">{k}</div>
                  )}
                  {text ? (
                    <div className="mt-1 text-base font-medium">{text}</div>
                  ) : null}
                </button>
                <button
                  className={
                    "option flex-1 rounded-l-none border-l-0 transition"
                  }
                  onClick={() => preview(origIdx)}
                  type="button"
                  title="Afspil preview"
                >
                  <div className="text-2xl font-bold">🎵</div>
                  <div className="mt-1 text-base font-medium">
                    {nowPlaying === origIdx && audioObj && !audioObj.paused
                      ? "Pause"
                      : "Preview"}
                  </div>
                </button>
              </div>
            );
          }
          return (
            <button
              key={k}
              className={
                "option transition " +
                (isChosen ? "ring-4 ring-[#ffe9a9] scale-[1.02]" : "") +
                (isCorrectLetter(k) ? " open-glow rounded-xl" : "")
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
              {!hideLetters && <div className="text-2xl font-bold">{k}</div>}
              {text ? (
                <div className="mt-1 text-base font-medium">{text}</div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
