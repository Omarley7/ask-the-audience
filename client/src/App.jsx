import { Outlet } from "react-router-dom";

export default function App() {
  return (
    <>
      <header>
        <div className="icon" aria-hidden>💍❤️</div>
        <h1 style={{ margin: 0 }}>
          Spørg Publikum <span style={{ color: "var(--gold)" }}>Bryllupsspecial</span>
        </h1>
      </header>
      <div className="container">
        <Outlet />
        <p style={{ textAlign: "center", opacity: 0.7, marginTop: "2rem" }}>
          Bygget med Express, Socket.IO & React/Vite – med kærlighed 💛
        </p>
      </div>
    </>
  );
}
