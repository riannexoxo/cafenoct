// Shows the moment you click, while the next page loads.
export default function Loading() {
  const line = (w: string, h = 12) => <div className="sk" style={{ width: w, height: h }} />;
  return (
    <div className="page-loading" aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>{line("120px", 10)}{line("min(420px, 80%)", 34)}</div>
      <div className="stats skel">{[0, 1, 2, 3].map((i) => <div className="stat" key={i}>{line("60%", 10)}{line("50%", 24)}</div>)}</div>
      <div className="grid g2">{[0, 1].map((i) => <div className="card skel" key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>{line("40%", 14)}{line("90%")}{line("75%")}{line("60%")}</div>)}</div>
    </div>
  );
}
