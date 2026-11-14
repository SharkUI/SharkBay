import { useEffect, useState } from "react";
import type { WebRuntimeBridge } from "./web-bridge";

export function RuntimeStatus({ runtime }: { runtime: WebRuntimeBridge }) {
  const [state, setState] = useState(runtime.connection);
  useEffect(() => runtime.onConnection(setState), [runtime]);
  const descriptions = { connected: "已连接", connecting: "正在连接…", disconnected: "连接已断开，正在重连…", unauthorized: "连接授权已失效，请从主机获取新的连接链接" };
  const online = state === "connected";
  return (
    <>
      <span className="sr-only" role="status">{descriptions[state]}</span>
      <span className="sidebar-status-control" title={`云电脑：${descriptions[state]}`}>
        <span className="sidebar-status-button" data-active={online} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="13" rx="2" fill={online ? "currentColor" : "none"} fillOpacity="0.2" />
            <path d="M12 16v5M8 21h8" />
            {online ? <path d="m8 9 3 3 5-5" /> : <path d="m5 5 14 9" />}
          </svg>
        </span>
        <select className="sidebar-status-select" aria-label={`Cloud computer: ${online ? "Online" : "Offline"}`} defaultValue="">
          <option value="" hidden>Cloud computer</option>
          <option value="power" disabled>{online ? "Turn Off" : "Turn On"}</option>
          <option value="auto" disabled>Auto</option>
          <option value="desktop" disabled>View Desktop</option>
        </select>
      </span>
    </>
  );
}
