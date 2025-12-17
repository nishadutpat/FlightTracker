// main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css"; // optional, if you have global styles

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
