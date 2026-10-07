import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantContextService } from "./tenant-context.service";

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.user?.tenantId ?? request.refreshTokenClaims?.tenantId;
    if (!tenantId) return next.handle();

    return new Observable((subscriber) =>
      this.tenantContext.run(tenantId, () => next.handle().subscribe(subscriber)),
    );
  }
}
