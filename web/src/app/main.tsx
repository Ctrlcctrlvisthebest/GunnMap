import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/ui-components.js";
import { App } from "./App.js";
import { ToastProvider } from "../shared/toast.js";

const root = document.getElementById("root");
if (!root) throw new Error("The React root element is missing.");

createRoot(root).render(
  <StrictMode>
    <ToastProvider><App /></ToastProvider>
  </StrictMode>,
);
