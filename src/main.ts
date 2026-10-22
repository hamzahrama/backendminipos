import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { buildCorsOptions } from "./security/cors.config";

async function bootstrap() {
  if (process.env.NODE_ENV === "production") {
    for (const name of ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]) {
      if (!process.env[name] || process.env[name]!.length < 32) {
        throw new Error(`${name} wajib diatur dengan panjang minimal 32 karakter saat production.`);
      }
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a reverse proxy (Caddy), trust its X-Forwarded-For so rate limits apply per client IP.
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (Number.isInteger(trustProxy) && trustProxy > 0) app.set("trust proxy", trustProxy);
  app.enableCors(buildCorsOptions());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
