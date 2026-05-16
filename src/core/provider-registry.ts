import type { ExecutionTargetKind } from "../shared/types.js";
import type { ExecutionProvider } from "./execution-provider.js";
import { executionTargetKindForTargetId, executionTargetKindForUri } from "./project-uri.js";

export class ExecutionProviderRegistry {
  private readonly providers = new Map<ExecutionTargetKind, ExecutionProvider>();

  constructor(providers: ExecutionProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: ExecutionProvider): void {
    this.providers.set(provider.kind, provider);
  }

  providerForKind(kind: ExecutionTargetKind): ExecutionProvider {
    const provider = this.providers.get(kind);
    if (!provider) {
      throw new Error(`Execution provider "${kind}" is not registered`);
    }
    return provider;
  }

  providerForUri(projectUri: string): ExecutionProvider {
    return this.providerForKind(executionTargetKindForUri(projectUri));
  }

  providerForTargetId(targetId: string): ExecutionProvider {
    return this.providerForKind(executionTargetKindForTargetId(targetId));
  }

  list(): ExecutionProvider[] {
    return [...this.providers.values()];
  }
}
