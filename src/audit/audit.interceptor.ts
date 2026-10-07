import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { catchError, from, map, Observable, of, switchMap } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string; route?: { path?: string }; baseUrl?: string; user?: { sub: string; tenantId: string };
    }>();
    const method = request.method.toUpperCase();
    const user = request.user;
    if (!user || !["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next.handle();
    const resource = `${request.baseUrl ?? ""}${request.route?.path ?? ""}`.slice(0, 180) || "unknown";
    return next.handle().pipe(switchMap((result) => from(this.prisma.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.sub, action: method, resource },
      select: { id: true },
    })).pipe(map(() => result), catchError(() => of(result)))));
  }
}
