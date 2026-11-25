import type { Terminal } from "@xterm/xterm";
import { xtermMouse } from "../shared/xterm-mouse";

export function bindTerminalObserver(terminal: Terminal, viewport: HTMLElement) {
  const mouse = xtermMouse(terminal);
  let protocol = mouse.activeProtocol;
  let observing = false;
  let suppressing = false;
  let following = true;
  let followedTop = viewport.scrollTop;
  let frame = 0;
  let historyPixels = 0;

  function suppressMouse() {
    if (!observing || mouse.activeProtocol === "NONE") return;
    suppressing = true;
    mouse.activeProtocol = "NONE";
    suppressing = false;
  }

  const mouseSubscription = mouse.onProtocolChange(() => {
    if (suppressing) return;
    protocol = mouse.activeProtocol;
    // Let xterm finish notifying its renderer about the application mode first.
    if (observing) queueMicrotask(suppressMouse);
  });

  function followCursor() {
    if (!observing || !following || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!observing || !following || !viewport.clientHeight) return;
      const screen = viewport.querySelector<HTMLElement>(".xterm-screen");
      if (!screen) return;
      const rowHeight = screen.offsetHeight / terminal.rows;
      const cursorBottom = (terminal.buffer.active.cursorY + 1) * rowHeight;
      viewport.scrollTop = Math.max(0, cursorBottom - viewport.clientHeight);
      followedTop = viewport.scrollTop;
    });
  }

  function trackScroll() {
    if (observing && viewport.scrollTop !== followedTop) {
      following = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
    }
  }

  function onWheel(event: WheelEvent) {
    if (!observing || event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
    const screen = viewport.querySelector<HTMLElement>(".xterm-screen");
    const rowHeight = (screen?.offsetHeight ?? 0) / terminal.rows;
    if (!rowHeight) return;
    event.preventDefault();
    event.stopPropagation();
    let pixels = event.deltaY * (event.deltaMode === 1 ? rowHeight : event.deltaMode === 2 ? viewport.clientHeight : 1);
    const buffer = terminal.buffer.active;
    // Scroll the visible part of the current grid before moving into history.
    // On the way down, return to the latest grid before panning through it.
    if (pixels < 0 || buffer.viewportY >= buffer.baseY) {
      const before = viewport.scrollTop;
      viewport.scrollTop += pixels;
      pixels -= viewport.scrollTop - before;
    }
    if (Math.sign(historyPixels) !== Math.sign(pixels)) historyPixels = 0;
    historyPixels += pixels;
    const lines = Math.trunc(historyPixels / rowHeight);
    if (lines) {
      terminal.scrollLines(lines);
      historyPixels -= lines * rowHeight;
    }
    following = event.deltaY > 0 && buffer.viewportY >= buffer.baseY
      && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
  }

  const writeSubscription = terminal.onWriteParsed(followCursor);
  const resizeObserver = new ResizeObserver(followCursor);
  resizeObserver.observe(viewport);
  viewport.addEventListener("wheel", onWheel, { capture: true, passive: false });
  viewport.addEventListener("scroll", trackScroll);
  return {
    setReadOnly(readOnly: boolean) {
      terminal.options.disableStdin = readOnly;
      if (observing === readOnly) return;
      observing = readOnly;
      historyPixels = 0;
      viewport.classList.toggle("is-observer", observing);
      if (observing) {
        following = true;
        suppressMouse();
        followCursor();
      } else {
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
        mouse.activeProtocol = protocol;
      }
    },
    dispose() {
      mouseSubscription.dispose();
      writeSubscription.dispose();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      viewport.removeEventListener("wheel", onWheel, true);
      viewport.removeEventListener("scroll", trackScroll);
    },
  };
}
