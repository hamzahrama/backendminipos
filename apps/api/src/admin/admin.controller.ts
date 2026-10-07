import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.types";
import { RequireRole } from "../auth/roles.decorator";
import { AdminTenantQueryDto, UpdateTenantStatusDto } from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@RequireRole("super_admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get("summary") summary() { return this.admin.summary(); }
  @Get("tenants") tenants(@Query() query: AdminTenantQueryDto) { return this.admin.listTenants(query); }
  @Get("tenants/:id") tenant(@Param("id") id: string) { return this.admin.getTenant(id); }
  @Patch("tenants/:id/status") status(@Param("id") id: string, @Body() body: UpdateTenantStatusDto, @Req() request: AuthenticatedRequest) {
    return this.admin.setStatus(id, body, request.user);
  }
}
