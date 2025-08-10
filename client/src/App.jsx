import { Link, Outlet } from "react-router-dom";

export default function App() {
  return (
    <>
      <header>
        <Link
          to="/"
          style={{
            display: "flex",
            gap: ".6rem",
            alignItems: "center",
            color: "inherit",
            textDecoration: "none",
          }}
          aria-label="Til forsiden"
        >
          <div className="icon" aria-hidden>
            💍❤️
          </div>
          <h1 style={{ margin: 0 }}>
            Spørg Publikum{" "}
            <span style={{ color: "var(--gold)" }}>Bryllupsspecial</span>
          </h1>
        </Link>
      </header>
      <div className="container">
        <Outlet />
        <p style={{ textAlign: "center", opacity: 0.6, fontSize: ".8rem" }}>
          Made by <strong>Omar</strong> ·{" "}
          <a
            href="https://github.com/Omarley7"
            target="_blank"
            rel="noreferrer"
          >
            @Omarley7
          </a>
        </p>
        <p style={{ textAlign: "center", opacity: 0.7, marginTop: "2rem" }}>
          Bygget med Express, Socket.IO & React/Vite – med kærlighed 💛
        </p>
      </div>
    </>
  );
}
