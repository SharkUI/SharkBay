import { useEffect, useState } from "react";
import type { AppUpdateState, AppUpdatesBridge } from "../shared/app-updates";

export function UpdateHint({ updates }: { updates?: AppUpdatesBridge }) {
  const [state, setState] = useState<AppUpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!updates) return;
    let cancelled = false;
    let receivedEvent = false;
    const unsubscribe = updates.onChanged((next) => {
      receivedEvent = true;
      setState(next);
      setDismissed(false);
    });
    void updates.getState().then((next) => {
      if (!cancelled && !receivedEvent) setState(next);
    }).catch(() => {});
    return () => { cancelled = true; unsubscribe(); };
  }, [updates]);

  if (!updates || dismissed || state.status === "idle" || ("manual" in state && !state.manual)) return null;

  const fail = () => setState({ status: "error", manual: true, message: "Update failed. Please try again." });
  const install = () => {
    if (state.status !== "ready") return;
    setState({ status: "installing", version: state.version });
    void updates.install().catch(fail);
  };
  const retry = () => { void updates.check().catch(fail); };
  let label: string;
  switch (state.status) {
    case "checking": label = "Checking for updates…"; break;
    case "up-to-date": label = "SharkBay is up to date"; break;
    case "unsupported": label = "Updates require an installed build"; break;
    case "error": label = state.message; break;
    case "downloading": label = `Downloading v${state.version} · ${state.percent}%`; break;
    case "ready": label = `v${state.version} ready`; break;
    case "installing": label = "Restarting to update…"; break;
  }

  return (
    <div className="update-hint">
      <span role="status" aria-live="polite">{label}</span>
      {state.status === "ready" ? (
        <div className="update-hint-actions">
          <button type="button" onClick={install} title="Restart SharkBay to install. Running agents and terminals will stop.">Restart to update</button>
          <button type="button" onClick={() => setDismissed(true)} title="Install when SharkBay quits">Later</button>
        </div>
      ) : null}
      {state.status === "error" ? <button type="button" onClick={retry}>Retry</button> : null}
      {state.status === "up-to-date" || state.status === "unsupported" || state.status === "error" ? (
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss update message">×</button>
      ) : null}
    </div>
  );
}
