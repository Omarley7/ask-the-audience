import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const DEBUG = ![undefined, "", "0", "false", "off"].includes(
  (import.meta.env.VITE_DEBUG || "").toLowerCase()
);
export const __DEBUG__ = DEBUG;
if (DEBUG) console.log(`(debug) Connecting to server at ${SERVER_URL}`);
export const socket = io(SERVER_URL, { autoConnect: true });
