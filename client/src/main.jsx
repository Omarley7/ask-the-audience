import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import AudienceView from "./pages/AudienceView.jsx";
import HostView from "./pages/HostView.jsx";
import Landing from "./pages/Landing.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Landing />} />
          <Route path="/host" element={<HostView />} />
          <Route path="/host/:sessionId" element={<HostView />} />
          <Route path="/join/:sessionId" element={<AudienceView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
