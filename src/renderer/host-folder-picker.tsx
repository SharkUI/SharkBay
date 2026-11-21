import { useEffect, useRef, useState } from "react";
import type { HostDirectoryListing } from "../shared/application-api";

export function HostFolderPicker({ load, purpose, busy, operationError, onSelect, onCancel }: {
  load: (input: { path?: string }) => Promise<HostDirectoryListing>;
  purpose: "local" | "remote";
  busy: boolean;
  operationError?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}) {
  const [location, setLocation] = useState<{ path?: string }>({});
  const pathInput = useRef<HTMLInputElement>(null);
  const folderList = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [listing, setListing] = useState<HostDirectoryListing>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (folderList.current) folderList.current.scrollTop = 0;
    setLoading(true);
    setError("");
    void load(location).then((result) => {
      if (cancelled) return;
      setListing(result);
      setDraft(result.path);
    }).catch((failure) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [location, load]);

  useEffect(() => { if (!loading) pathInput.current?.focus(); }, [loading]);

  const disabled = busy || loading;
  return <div className="host-folder-picker" aria-busy={disabled}>
    <nav className="host-folder-toolbar" aria-label="Folder navigation">
      <button className="host-folder-nav-button" type="button" aria-label="Parent folder" title="Parent folder" disabled={disabled || !listing?.parentPath} onClick={() => setLocation({ path: listing!.parentPath! })}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 9 5-5 5 5M10 4v12" /></svg>
      </button>
      <button className="host-folder-nav-button" type="button" aria-label="Home folder" title="Home folder" disabled={disabled} onClick={() => setLocation({})}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m3 9 7-6 7 6M5 8v9h4v-5h2v5h4V8" /></svg>
      </button>
      <form className="host-folder-location" onSubmit={(event) => { event.preventDefault(); if (!disabled && draft.trim()) setLocation({ path: draft.trim() }); }}>
        <label className="sr-only" htmlFor="host-folder-path">Folder on SharkBay host</label>
        <input ref={pathInput} id="host-folder-path" value={draft} title={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} placeholder="/absolute/path/to/folder" />
        <button className="host-folder-nav-button" type="submit" aria-label="Go to folder" title="Go to folder" disabled={disabled || !draft.trim()}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
        </button>
      </form>
    </nav>
    <div ref={folderList} className="host-folder-list" aria-label="Host folders">
      {error ? <p className="host-folder-error" role="alert">{error}</p> : null}
      {loading ? <p className="host-folder-empty" role="status">Loading folders…</p> : listing?.directories.map((entry) => <button key={entry.path} className="host-folder-entry" type="button" disabled={busy} onClick={() => setLocation({ path: entry.path })}>
        <svg className="host-folder-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h6A1.5 1.5 0 0 1 17.5 7v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15Z" /></svg>
        <span>{entry.name}</span>
        <svg className="host-folder-chevron" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
      </button>)}
      {!loading && !error && listing?.directories.length === 0 ? <p className="host-folder-empty">No subfolders</p> : null}
    </div>
    <div className="host-folder-footer">
      {operationError && !loading && !error ? <p className="host-folder-error" role="alert">{operationError}</p> : null}
      <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="button primary" type="button" disabled={disabled || !listing || Boolean(error) || draft.trim() !== listing.path} onClick={() => onSelect(listing!.path)}>
        {busy ? purpose === "local" ? "Adding…" : "Cloning…" : purpose === "local" ? "Add Project" : "Clone Here"}
      </button>
    </div>
  </div>;
}
