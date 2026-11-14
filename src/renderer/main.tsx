import React from "react";
import { createRoot } from "react-dom/client";
import { createWebBridge } from "./bridge/web-bridge";
import { App } from "./App";
import "../styles/app.css";

const mount = document.getElementById("root");

if (!mount) {
  throw new Error("Renderer root element was not found.");
}

async function start() {
if (!window.sharkBay) window.sharkBay = await createWebBridge();
createRoot(mount!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

}
void start().catch((error) => { mount!.textContent = error instanceof Error ? error.message : String(error); });
