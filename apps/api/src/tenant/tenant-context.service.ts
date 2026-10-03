import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<string>();

  run<T>(tenantId: string, callback: () => T): T {
    return this.storage.run(tenantId, callback);
  }

  getTenantId() {
    return this.storage.getStore();
  }
}
