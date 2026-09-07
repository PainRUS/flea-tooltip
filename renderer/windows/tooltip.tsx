import { createRoot } from "react-dom/client";
import { Tooltip } from "../pages/Tooltip";
import UiTranslator from "../components/UiTranslator";
import TooltipPriceColors from "../components/TooltipPriceColors";
import "../styles/index.css";
import React from "react";

function TooltipCardLayer() {
  React.useEffect(() => {
    const layer = document.getElementById("tooltip-card-layer");
    if (!layer) {
      return;
    }

    let latestPosition = { x: -10000, y: -10000 };
    let animationFrame: number | null = null;

    window.electron.onTooltipPositionChanged((position) => {
      latestPosition = position;

      // Coalesce main-process cursor updates into one compositor update per
      // rendered frame. This moves only the DOM card; the native BrowserWindow
      // remains stationary while the cursor stays on the same monitor.
      if (animationFrame !== null) {
        return;
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        layer.style.transform = `translate3d(${latestPosition.x}px, ${latestPosition.y}px, 0)`;
      });
    });

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return (
    <div
      id="tooltip-card-layer"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "max-content",
        height: "max-content",
        transform: "translate3d(-10000px, -10000px, 0)",
        willChange: "transform",
        pointerEvents: "none",
      }}
    >
      <Tooltip />
    </div>
  );
}

const root = createRoot(document.getElementById("root") as Element);

root.render(
  <>
    <UiTranslator />
    <TooltipPriceColors />
    <TooltipCardLayer />
  </>
);