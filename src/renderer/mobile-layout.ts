import { useEffect, useState } from "react";

export function useCompactWebLayout(maxWidth = 1179) {
  const [compact, setCompact] = useState(() => window.matchMedia(`(max-width: ${maxWidth}px)`).matches);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [maxWidth]);
  return window.sharkBay?.runtime?.host === "web" && compact;
}

export function useWebViewport() {
  useEffect(() => {
    if (window.sharkBay?.runtime?.host !== "web" || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      // Pinching should zoom the page, rather than resizing the terminal.
      if (viewport.scale !== 1) return;
      root.style.setProperty("--web-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--web-viewport-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--web-viewport-height");
      root.style.removeProperty("--web-viewport-top");
    };
  }, []);
}
