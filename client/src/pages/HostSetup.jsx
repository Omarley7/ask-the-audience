import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SERVER_URL } from "../socket.js";

export default function HostSetup() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createSession(mode) {
    const res = await fetch(`${SERVER_URL}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    return data.sessionId;
  }

  async function startWithoutQuestions() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const sessionId = await createSession("quiz");
      nav(`/host/${sessionId}`);
    } catch (e) {
      setError("Kunne ikke oprette session");
    } finally {
      setLoading(false);
    }
  }

  async function startWithQuestions(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const codeTrim = code.trim();
      if (!codeTrim) {
        setError("Indtast en quizkode");
        setLoading(false);
        return;
      }
      // Validate code first
      const vr = await fetch(`${SERVER_URL}/api/quiz/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeTrim }),
      });
      if (!vr.ok) {
        const j = await vr.json().catch(() => ({}));
        const msg =
          j.error === "quiz_source_unavailable"
            ? "Database ikke konfigureret (SUPABASE_URL / SUPABASE_ANON_KEY mangler)."
            : j.error || "Ugyldig kode";
        setError(msg);
        setLoading(false);
        return;
      }
      // Create session and then load quiz into it
      const sessionId = await createSession("quiz");
      const lr = await fetch(
        `${SERVER_URL}/api/session/${sessionId}/loadQuiz`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeTrim }),
        }
      );
      if (!lr.ok) {
        const j = await lr.json().catch(() => ({}));
        const msg =
          j.error === "quiz_source_unavailable"
            ? "Database ikke konfigureret (SUPABASE_URL / SUPABASE_ANON_KEY mangler)."
            : j.error || "Kunne ikke indlæse quiz";
        setError(msg);
        setLoading(false);
        return;
      }
      nav(`/host/${sessionId}`);
    } catch (e) {
      setError("Noget gik galt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="card mx-auto max-w-md">
        <h2 className="mt-0 text-2xl font-semibold sm:text-3xl">Start quiz</h2>
        <p className="mt-0 text-sm opacity-80 sm:text-base">
          Vælg om du vil køre uden spørgsmål eller indlæse spørgsmål fra
          databasen.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <button
            onClick={startWithoutQuestions}
            disabled={loading}
            className="primary py-4 text-lg disabled:opacity-50"
          >
            {loading ? "Arbejder…" : "Start uden spørgsmål"}
          </button>
          <form onSubmit={startWithQuestions} className="flex flex-wrap gap-2">
            <input
              placeholder="Quizkode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="focus:ring-gold/40 max-w-full flex-1 rounded-md border border-[#213174] bg-[#0c1331] px-3 py-3 text-lg focus:outline-none focus:ring-2"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-full border border-[#2a3a7d] bg-[#18224d] px-4 py-3 font-semibold disabled:opacity-50"
            >
              {loading ? "Validerer…" : "Indlæs fra DB"}
            </button>
          </form>
          {error && (
            <div className="panel text-sm text-red-300">Fejl: {error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
