import { Outlet } from "react-router-dom";

export default function App() {
  return (
    <>
      <header>
        <div className="icon">💍❤️</div>
        <h1 style={{ margin: 0 }}>
          Ask‑the‑Audience{" "}
          <span style={{ color: "var(--gold)" }}>Wedding Edition</span>
        </h1>
      </header>
      <div className="container">
        <Outlet />
        <p style={{ textAlign: "center", opacity: 0.7, marginTop: "2rem" }}>
          Built with Express + Socket.IO + React/Vite.
        </p>
      </div>
    </>
  );
}
