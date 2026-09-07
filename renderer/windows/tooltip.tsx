import { createRoot } from "react-dom/client";
import { Tooltip } from "../pages/Tooltip";
import UiTranslator from "../components/UiTranslator";
import "../styles/index.css";
import React from "react";

const root = createRoot(document.getElementById("root") as Element);

root.render(
  <>
    <UiTranslator />
    <Tooltip />
  </>
);
