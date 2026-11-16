import { applicationError } from "src/app/core/exceptions/application-error";
import { ErrorMetadata } from "src/app/core/enums/error-metadata.enum";
import { jwtSecret } from './jwt-secret';
import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class AuthenticateJWT implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const token = req.header("Authorization")?.split(" ")[1]; // Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI...

    if (!token) {
      throw applicationError(ErrorMetadata.UNAUTHORIZED, "Acesso negado");
    }

    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(
        token,
        jwtSecret()
      );
      req.user = decoded;
    } catch (err) {
      throw applicationError(ErrorMetadata.FORBIDDEN, "Token inválido");
    }
    // Downstream failures must reach the global filter with their original status.
    next();
  }
}
