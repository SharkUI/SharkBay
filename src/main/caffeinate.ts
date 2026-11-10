import { spawn, type ChildProcess } from "node:child_process";

export class CaffeinateController {
  private child: ChildProcess | null = null;

  async setActive(active: boolean): Promise<void> {
    if (!active) {
      const child = this.child;
      this.child = null;
      child?.kill();
      return;
    }
    if (this.child || process.platform !== "darwin") return;

    const child = spawn("/usr/bin/caffeinate", ["-di", "-w", String(process.pid)], { stdio: "ignore" });
    this.child = child;
    const clear = () => {
      if (this.child === child) this.child = null;
    };
    child.once("exit", clear);
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => {
        clear();
        reject(error);
      });
    });
  }
}
