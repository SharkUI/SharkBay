#!/usr/bin/env node
import { changeUserService } from "./user-service.js";

const [command, action, option, ...extra] = process.argv.slice(2);
const usage = "Usage: sharkbay serve [--lan] [--port 17777]\n       sharkbay service enable [--lan]\n       sharkbay service disable";

try {
  if (command === "serve") {
    process.argv.splice(2, 1, "--host", "127.0.0.1");
    await import("./main.js");
  } else if (command === "service" && !extra.length
    && ((action === "enable" && (!option || option === "--lan")) || (action === "disable" && !option))) {
    await changeUserService(action, option === "--lan");
  } else if (!command || command === "--help" || command === "-h") {
    console.log(usage);
  } else {
    throw new Error(usage);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
