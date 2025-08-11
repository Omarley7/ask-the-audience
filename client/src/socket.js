import { io } from "socket.io-client";

// Prefer explicit VITE_SERVER_URL; else same-origin (works when backend is served behind same host).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const DEBUG = ![undefined, "", "0", "false", "off"].includes(
  (import.meta.env.VITE_DEBUG || "").toLowerCase()
);
export const __DEBUG__ = DEBUG;
if (DEBUG) console.log(`(debug) Connecting to server at ${SERVER_URL}`);
export const socket = io(SERVER_URL, { autoConnect: true });
