type XtermMouse = {
  activeProtocol: string;
  activeEncoding: string;
  onProtocolChange(listener: () => void): { dispose(): void };
};

// xterm exposes the tracking mode as read-only and does not expose its encoding.
export function xtermMouse(terminal: unknown): XtermMouse {
  return (terminal as { _core: { coreMouseService: XtermMouse } })._core.coreMouseService;
}
