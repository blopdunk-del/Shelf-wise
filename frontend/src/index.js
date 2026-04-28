import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { registerServiceWorker } from "@/lib/pwa";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register PWA service worker in production-like environments
if (process.env.NODE_ENV !== "test") {
  registerServiceWorker();
}
