export default function BarChart({ tally }) {
  const total =
    (tally?.A || 0) + (tally?.B || 0) + (tally?.C || 0) + (tally?.D || 0);
  const entries = ["A", "B", "C", "D"].map((k) => [k, tally?.[k] || 0]);
  return (
    <div className="p-4">
      {entries.map(([k, v]) => {
        const pct = total ? Math.round((v / total) * 100) : 0;
        return (
          <div key={k} className="mb-3 last:mb-0">
            <div className="mt-1 flex justify-between text-sm text-gray-400">
              <span>
                <b>{k}</b> • {v}
              </span>
              <span>{pct}%</span>
            </div>
            <div
              className="relative h-7 overflow-hidden rounded-xl border border-[#2a3a7d] bg-[#151d41]"
              aria-label={`Mulighed ${k} har ${v} stemmer (${pct}%)`}
            >
              <div
                className="h-full bg-gradient-to-r from-[#d6b25a] to-[#f1d485] shadow-inner"
                style={{ width: pct + "%" }}
              />
            </div>
          </div>
        );
      })}
      <div className="mt-4 flex justify-between text-sm text-gray-400">
        <span>I alt</span>
        <span className="badge">{total}</span>
      </div>
    </div>
  );
}
