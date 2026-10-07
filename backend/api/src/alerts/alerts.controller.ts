import { Controller, Get, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.types";
import { RequireRole } from "../auth/roles.decorator";
import { AlertsService } from "./alerts.service";

@Controller("alerts")
@RequireRole("owner", "cashier")
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  getAlerts(@Req() request: AuthenticatedRequest) {
    return this.alerts.getActiveAlerts(request.user.tenantId);
  }
}
