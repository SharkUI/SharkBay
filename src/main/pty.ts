import { createRequire } from "node:module";
import type * as LydellPty from "@lydell/node-pty";

const requireFromHere = createRequire(import.meta.url);

const ptyModule = requireFromHere("@lydell/node-pty") as typeof LydellPty;

export const spawn = ptyModule.spawn;
export type IPty = LydellPty.IPty;
