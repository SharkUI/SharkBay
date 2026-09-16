import type { AppUpdater } from "electron-updater";
import type { AppUpdateState } from "../shared/app-updates.js";

type UpdateClient = Pick<AppUpdater,
  "autoDownload" | "autoInstallOnAppQuit" | "allowPrerelease" | "allowDowngrade" |
  "on" | "checkForUpdates" | "quitAndInstall"
>;

export class AppUpdates {
  private state: AppUpdateState = { status: "idle" };
  private checking = false;
  private manual = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly updater: UpdateClient,
    private readonly enabled: boolean,
    private readonly onChanged: (state: AppUpdateState) => void,
  ) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    if (!enabled) return;

    updater.on("update-available", ({ version }) => {
      this.setState({ status: "downloading", version, percent: 0 });
    });
    updater.on("download-progress", ({ percent }) => {
      if (this.state.status !== "downloading") return;
      const progress = Math.max(0, Math.min(100, Math.floor(percent)));
      if (progress !== this.state.percent) this.setState({ ...this.state, percent: progress });
    });
    updater.on("update-downloaded", ({ version }) => {
      this.setState({ status: "ready", version });
    });
    updater.on("update-not-available", () => {
      this.setState({ status: "up-to-date", manual: this.manual });
    });
    updater.on("error", (error) => this.reportError(error));
  }

  getState(): AppUpdateState {
    return this.state;
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), 4 * 60 * 60 * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async check(manual = false): Promise<AppUpdateState> {
    if (!this.enabled) {
      this.setState({ status: "unsupported", manual });
      return this.state;
    }
    if (this.checking || this.state.status === "ready" || this.state.status === "installing") {
      if (manual) {
        this.manual = true;
        this.setState("manual" in this.state ? { ...this.state, manual: true } : this.state);
      }
      return this.state;
    }

    this.checking = true;
    this.manual = manual;
    this.setState({ status: "checking", manual });
    try {
      const result = await this.updater.checkForUpdates();
      await result?.downloadPromise;
    } catch (error) {
      this.reportError(error);
    } finally {
      this.checking = false;
    }
    return this.state;
  }

  install(): void {
    if (this.state.status !== "ready") return;
    this.setState({ status: "installing", version: this.state.version });
    try {
      this.updater.quitAndInstall();
    } catch (error) {
      this.reportError(error);
    }
  }

  private reportError(error: unknown): void {
    console.error("[app-update]", error);
    const visible = this.manual || ("manual" in this.state && this.state.manual) ||
      this.state.status === "downloading" || this.state.status === "ready" || this.state.status === "installing";
    this.setState({ status: "error", manual: visible, message: "Update failed. Check your connection and try again." });
  }

  private setState(state: AppUpdateState): void {
    this.state = state;
    this.onChanged(state);
  }
}
