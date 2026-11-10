import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import type { Request, Response } from "express";
import { AppModule } from "./app.module";
import { buildCorsOptions } from "./security/cors.config";

const server = express();
let cachedServer: express.Express | null = null;

export async function createNestServer(expressInstance: express.Express) {
  if (process.env.NODE_ENV === "production") {
    for (const name of ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]) {
      if (!process.env[name] || process.env[name]!.length < 32) {
        throw new Error(`${name} wajib diatur dengan panjang minimal 32 karakter saat production.`);
      }
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressInstance),
  );

  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (Number.isInteger(trustProxy) && trustProxy > 0) app.set("trust proxy", trustProxy);

  app.enableCors(buildCorsOptions());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();
  return expressInstance;
}

// Serverless handler for Vercel
export default async function handler(req: Request, res: Response) {
  if (!cachedServer) {
    cachedServer = await createNestServer(server);
  }
  return cachedServer(req, res);
}

// Local server execution
async function bootstrap() {
  if (process.env.VERCEL) {
    return;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (Number.isInteger(trustProxy) && trustProxy > 0) app.set("trust proxy", trustProxy);
  app.enableCors(buildCorsOptions());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

if (!process.env.VERCEL) {
  void bootstrap();
}
