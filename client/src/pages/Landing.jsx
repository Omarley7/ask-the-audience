import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function Landing() {
  const nav = useNavigate();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);

  async function createSession() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/session`, { method: "POST" });
      const data = await res.json();
      nav(`/host/${data.sessionId}`);
    } catch (e) {
      alert("Kunne ikke oprette session");
    } finally {
      setCreating(false);
    }
  }

  function join(e) {
    e.preventDefault();
    if (!code.trim()) return;
    nav(`/join/${code.trim()}`);
  }

  return (
    <div className="landing">
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.75rem" }}>Velkommen 💛</h2>
        <p style={{ marginTop: 0 }}>
          Start en ny afstemning som vært eller deltag ved at indtaste en kode.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <button
            className="primary"
            onClick={createSession}
            disabled={creating}
            style={{ padding: "1rem", fontSize: "1.1rem" }}
          >
            {creating ? "Opretter…" : "Bliv vært"}
          </button>
          <form onSubmit={join} style={{ display: "flex", gap: ".5rem" }}>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Kode"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              style={{
                flex: 1,
                fontSize: "1.1rem",
                padding: ".75rem",
                width: "1rem",
              }}
              aria-label="Indtast kode"
            />
            <button
              type="submit"
              disabled={!code}
              style={{ padding: ".75rem 1rem" }}
            >
              Deltag
            </button>
          </form>
        </div>
      </div>
      {/* Footer removed (global footer in App handles attribution) */}
    </div>
  );
}
