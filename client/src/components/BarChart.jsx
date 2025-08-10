export default function BarChart({ tally }) {
  const total =
    (tally?.A || 0) + (tally?.B || 0) + (tally?.C || 0) + (tally?.D || 0);
  const entries = [
    ["A", tally?.A || 0],
    ["B", tally?.B || 0],
    ["C", tally?.C || 0],
    ["D", tally?.D || 0],
  ];
  return (
    <div className="chart">
      {entries.map(([k, v]) => {
        const pct = total ? Math.round((v / total) * 100) : 0;
        return (
          <div key={k} style={{ marginBottom: "0.75rem" }}>
            <div className="labelrow">
              <span>
                <b>{k}</b> • {v}
              </span>
              <span>{pct}%</span>
            </div>
            <div
              className="bar"
              aria-label={`Mulighed ${k} har ${v} stemmer (${pct}%)`}
            >
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <div className="labelrow">
        <span>I alt</span>
        <span className="badge">{total}</span>
      </div>
    </div>
  );
}
