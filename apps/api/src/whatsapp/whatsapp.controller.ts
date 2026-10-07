import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.types";
import { RequireRole } from "../auth/roles.decorator";
import { SendReceiptDto, WhatsAppLogQueryDto } from "./whatsapp.dto";
import { WhatsAppService } from "./whatsapp.service";

@Controller()
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get("whatsapp/status") @RequireRole("owner", "cashier")
  status() { return this.whatsapp.status(); }

  @Get("whatsapp/logs") @RequireRole("owner")
  logs(@Query() query: WhatsAppLogQueryDto) { return this.whatsapp.logs(query.limit); }

  @Post("transactions/:id/whatsapp") @RequireRole("owner", "cashier")
  send(@Param("id") id: string, @Body() body: SendReceiptDto, @Req() request: AuthenticatedRequest) {
    return this.whatsapp.sendReceipt(id, body.phone, request.user.sub);
  }
}
