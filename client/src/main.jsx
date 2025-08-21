import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import AudienceView from "./pages/AudienceView.jsx";
import HostSetup from "./pages/HostSetup.jsx";
import HostView from "./pages/HostView.jsx";
import Landing from "./pages/Landing.jsx";
import SimpleAudienceView from "./pages/SimpleAudienceView.jsx";
import SimpleHostView from "./pages/SimpleHostView.jsx";
import "./tailwind.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Landing />} />
          <Route path="/host" element={<HostView />} />
          <Route path="/host/setup" element={<HostSetup />} />
          <Route path="/host/:sessionId" element={<HostView />} />
          <Route path="/join/:sessionId" element={<AudienceView />} />
          <Route path="/simple/host" element={<SimpleHostView />} />
          <Route path="/simple/host/:sessionId" element={<SimpleHostView />} />
          <Route
            path="/simple/join/:sessionId"
            element={<SimpleAudienceView />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
