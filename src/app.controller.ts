import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator";

@Controller()
export class AppController {
  @Get("health")
  @Public()
  getHealth() {
    return { status: "ok", service: "hni-pos-api" };
  }
}
