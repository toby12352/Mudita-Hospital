import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/noto-sans-myanmar/400.css";
import App from "./app/App";
import { installNumberInputWheelGuard } from "./shared/numberInputWheel";

installNumberInputWheelGuard();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
