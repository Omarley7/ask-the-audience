import { Link, Outlet } from "react-router-dom";

export default function App() {
  return (
    <>
      <header className="flex items-center justify-center gap-2 border-b border-[#1f2b5a] bg-gradient-to-b from-[#121a3b] to-[#0b1020] p-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-inherit no-underline"
          aria-label="Til forsiden"
        >
          <div className="text-2xl drop-shadow" aria-hidden>
            💍❤️
          </div>
          <h1 className="m-0 text-center text-lg font-semibold sm:text-2xl">
            Spørg Publikum <span className="text-gold">Bryllupsspecial</span>
          </h1>
        </Link>
      </header>
      <div className="mx-auto max-w-5xl p-4">
        <Outlet />
        <p className="mt-8 text-center text-xs opacity-60">
          Made by{" "}
          <a
            href="https://github.com/Omarley7"
            target="_blank"
            rel="noreferrer"
            className="text-gold hover:underline"
          >
            @Omarley7
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/Omarley7/ask-the-audience"
            target="_blank"
            rel="noreferrer"
            className="text-gold hover:underline"
          >
            ask-the-audience GitHub
          </a>
        </p>
        <p className="mt-8 text-center opacity-70">
          Built with Express, Socket.IO, React/Vite, Tailwind & good vibes ✨
        </p>
      </div>
    </>
  );
}
