import React, { useEffect, useRef, useState } from "react";
import type { CodeGraphProjectStatus, SharkBayBridge } from "./types";

type StatusView = { loading: boolean; status: CodeGraphProjectStatus | null; error: string | null };

export function CodeGraphPanel({ projectUri, api, onOpenTerminal }: {
  projectUri: string;
  api: SharkBayBridge["codeGraph"];
  onOpenTerminal: (options: { title: string; initialCommand: string }) => Promise<void>;
}) {
  const [codeGraphStatus, setStatus] = useState<StatusView>({ loading: true, status: null, error: null });
  const generation = useRef(0);
  const busy = useRef(false);
  const readStatus = api?.getStatus;
  useEffect(() => {
    const revision = ++generation.current;
    busy.current = false;
    setStatus({ loading: true, status: null, error: null });
    const read = async () => {
      try {
        if (!readStatus) throw new Error("CodeGraph status is not exposed by the preload API.");
        const status = await readStatus({ projectUri });
        if (generation.current === revision) setStatus({ loading: false, status, error: null });
      } catch (error) {
        if (generation.current === revision) setStatus({ loading: false, status: null, error: message(error) });
      }
    };
    void read();
    return () => { generation.current++; };
  }, [projectUri, readStatus]);

  async function onMaintainCodeGraph() {
    if (busy.current) return;
    const revision = generation.current;
    busy.current = true;
    setStatus(current => ({ ...current, loading: true, error: null }));
    try {
      if (!api?.ensureStatus) throw new Error("CodeGraph status maintenance is not exposed by the preload API.");
      const status = await api.ensureStatus({ projectUri });
      if (generation.current === revision) setStatus({ loading: false, status, error: null });
    } catch (error) {
      if (generation.current === revision) setStatus(current => ({ ...current, loading: false, error: message(error) }));
    } finally {
      if (generation.current === revision) busy.current = false;
    }
  }

  if (!codeGraphStatus.loading && codeGraphStatus.status?.state === "not-installed") {
    return (
      <section className="subpanel confirm-panel protocol-action-card codegraph-status-card" aria-label="CodeGraph status summary">
        <div>
          <h4>Install CodeGraph</h4>
          <p className="summary-text">CodeGraph provides code intelligence (symbol search, call graphs, impact analysis). Install it to enable the Files index.</p>
        </div>
        <div className="button-row">
          <button className="button compact" type="button" onClick={() => {
            void onOpenTerminal({ title: "Install CodeGraph", initialCommand: "npm i -g @colbymchenry/codegraph" });
          }}>Install CodeGraph</button>
        </div>
      </section>
    );
  }

  const line = codeGraphStatus.loading
    ? "Checking CodeGraph index."
    : codeGraphStatus.error
      ? `CodeGraph status unavailable: ${codeGraphStatus.error}`
      : codeGraphStatus.status?.summary ?? "CodeGraph status unavailable.";

  return (
    <section className="subpanel codegraph-status-card" aria-label="CodeGraph status summary">
      <h4>CodeGraph</h4>
      <div className="codegraph-status-line">{line}</div>
      {codeGraphStatus.status && !["disabled", "unsupported"].includes(codeGraphStatus.status.state) ? (
        <div className="button-row">
          <button className="button compact" type="button" disabled={codeGraphStatus.loading} onClick={onMaintainCodeGraph}>
            {codeGraphStatus.status.state === "uninitialized" ? "Build index" : "Sync index"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
