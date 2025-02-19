import { HttpStatus, Injectable, NestMiddleware } from "@nestjs/common";
import {  Request, Response, NextFunction} from "express";

@Injectable()
export class AuthenticateJWT implements NestMiddleware{

    use(req: Request, res: Response, next: NextFunction){

        const token = req.header('Authorization')?.split(' ')[1]; // Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI...
        
        if (!token) {
            return res.status(401).json({ statusCode: HttpStatus.UNAUTHORIZED ,message: 'Acesso negado' });
        }
        
        try {
            const jwt = require('jsonwebtoken')
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'chave-secreta');
            req.user = decoded;
            next();
        } catch (err) {
            res.status(403).json({ statusCode: HttpStatus.FORBIDDEN , message: 'Token inválido' });
        }
    } 
}

    