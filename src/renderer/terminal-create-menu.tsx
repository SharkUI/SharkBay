import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AgentCli } from "./types";

export function TerminalCreateMenu({ agents, disabled, renderIcon, onLaunch, onBrowser }: {
  agents: AgentCli[];
  disabled: boolean;
  renderIcon: (agent?: AgentCli) => ReactNode;
  onLaunch: (agent?: AgentCli) => Promise<unknown>;
  onBrowser?: () => Promise<unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !ref.current) return;
      event.preventDefault();
      setOpen(false);
      ref.current.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  function launch(action: () => Promise<unknown>) {
    setOpen(false);
    void action();
  }

  return (
    <div className="terminal-create-menu" ref={ref}>
      <button className="terminal-create-toggle" type="button" aria-label="New session" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {open ? <div className="terminal-create-options" role="group" aria-label="New session options">
        <button type="button" disabled={disabled} onClick={() => launch(() => onLaunch())}>{renderIcon()}<span>Terminal</span></button>
        {agents.map((agent) => <button key={agent.id} type="button" disabled={disabled} onClick={() => launch(() => onLaunch(agent))}>{renderIcon(agent)}<span>{agent.label}</span></button>)}
        {onBrowser ? <button type="button" disabled={disabled} onClick={() => launch(onBrowser)}>Browser</button> : null}
      </div> : null}
    </div>
  );
}
