import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  if (process.env.NODE_ENV === "production") {
    for (const name of ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]) {
      if (!process.env[name] || process.env[name]!.length < 32) {
        throw new Error(`${name} wajib diatur dengan panjang minimal 32 karakter saat production.`);
      }
    }
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
