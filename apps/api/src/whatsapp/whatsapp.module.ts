import { Module } from "@nestjs/common";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppGateway } from "./whatsapp.gateway";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, { provide: WhatsAppGateway, useFactory: () => new WhatsAppGateway() }],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
