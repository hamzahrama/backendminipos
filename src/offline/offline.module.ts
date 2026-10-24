import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OfflineService } from "./offline.service";
import { OfflineController } from "./offline.controller";

@Module({
  imports: [PrismaModule],
  providers: [OfflineService],
  controllers: [OfflineController],
  exports: [OfflineService],
})
export class OfflineModule {}
