export type AppUpdateState =
  | { status: "idle" }
  | { status: "checking" | "up-to-date" | "unsupported"; manual: boolean }
  | { status: "error"; manual: boolean; message: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready" | "installing"; version: string };

export type AppUpdatesBridge = {
  getState: () => Promise<AppUpdateState>;
  check: () => Promise<AppUpdateState>;
  install: () => Promise<void>;
  onChanged: (callback: (state: AppUpdateState) => void) => () => void;
};
