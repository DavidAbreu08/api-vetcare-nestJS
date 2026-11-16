// Must stay the first import: forces process.env.TZ = "UTC" before anything creates dates or loads TypeORM.
import "./force-utc";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as express from "express";
import { join } from "path";
import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { setupSwagger } from "./swagger";
import { NestExpressApplication } from "@nestjs/platform-express";
import { parseTrustProxy } from "./trust-proxy";
import { configureApiRouting } from "./api-routing";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApiRouting(app);
  // Client IP (req.ip) used by the password recovery rate limits; off unless TRUST_PROXY is set.
  // TODO(deploy): when the API runs behind a proxy/load balancer/cloud (nginx, IIS ARR, Azure App Service,
  // Cloudflare...), set TRUST_PROXY (usually 1, matching the number of proxies in front). Without it every user
  // shares the proxy IP, so the per-IP rate limit of forgot/reset-password blocks password recovery for everyone.
  // A proxy in production is likely: validate this on deploy.
  app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

  app.use(express.static(join(__dirname, "..", "public")));

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    })
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:4200",
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  });

  setupSwagger(app);
  await app.listen(3000);
}

bootstrap();
