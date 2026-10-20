import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initUpdater } from "./updater.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const isNative = !!window.Capacitor?.isNativePlatform?.();

// OTA solo en la app nativa.
initUpdater();

// Service worker solo en web (PWA). En nativo lo evitamos: cachearia la web
// vieja y pisaria las actualizaciones OTA de Capgo.
if (!isNative && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
