import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SERVER_URL } from "../socket.js";

export default function Landing() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);

  function goToHostSetup() {
    nav(`/host/setup`);
  }
  async function createSessionSimple() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "simple" }),
      });
      const data = await res.json();
      nav(`/simple/host/${data.sessionId}`);
    } catch (e) {
      alert("Kunne ikke oprette session");
    } finally {
      setCreating(false);
    }
  }

  async function joinByCode(e) {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/session/${code.trim()}/info`);
      if (!r.ok) throw new Error("not_found");
      const { mode } = await r.json();
      if (mode === "simple") nav(`/simple/join/${code.trim()}`);
      else nav(`/join/${code.trim()}`);
    } catch (err) {
      alert("Ukendt kode");
    }
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
            onClick={createSessionSimple}
            disabled={creating}
            className="primary py-4 text-lg disabled:opacity-50"
          >
            {creating ? "Opretter…" : "Bliv vært"}
          </button>
          <button
            onClick={goToHostSetup}
            disabled={creating}
            className="secondary py-4 text-lg disabled:opacity-50"
          >
            Start quiz
          </button>
          <form
            onSubmit={joinByCode}
            className="flex flex-wrap justify-end gap-2"
          >
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
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        className="mx-auto mt-4 drop-shadow md:size-64"
      />
    </div>
  );
}
