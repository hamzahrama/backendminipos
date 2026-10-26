import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { OfflineService } from "./offline.service";
import { OfflineController } from "./offline.controller";

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [OfflineService],
  controllers: [OfflineController],
  exports: [OfflineService],
})
export class OfflineModule {}
