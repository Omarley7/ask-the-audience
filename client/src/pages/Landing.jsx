import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function Landing() {
  const nav = useNavigate();
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
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="card mx-auto max-w-md">
        <h2 className="mt-0 text-2xl font-semibold sm:text-3xl">
          Velkommen 💛
        </h2>
        <p className="mt-0 text-sm opacity-80 sm:text-base">
          Start en ny afstemning som vært eller deltag ved at indtaste en kode.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <button
            onClick={createSession}
            disabled={creating}
            className="primary py-4 text-lg disabled:opacity-50"
          >
            {creating ? "Opretter…" : "Bliv vært"}
          </button>
          <form onSubmit={join} className="flex flex-wrap justify-end gap-2">
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Kode"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              aria-label="Indtast kode"
              className="focus:ring-gold/40 max-w-full flex-1 rounded-md border border-[#213174] bg-[#0c1331] px-3 py-3 text-lg focus:outline-none focus:ring-2"
            />
            <button
              type="submit"
              disabled={!code}
              className="rounded-full border border-[#2a3a7d] bg-[#18224d] px-4 py-3 font-semibold disabled:opacity-50"
            >
              Deltag
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
