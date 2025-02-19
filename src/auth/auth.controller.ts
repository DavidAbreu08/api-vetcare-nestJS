import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {

    constructor(
        private readonly authService: AuthService) {

    }

    @UseGuards(AuthGuard('local'))
    @Post('login')
    async login(@Req() req: any){
        return await this.authService.login(req.user)
    }


    @UseGuards(AuthGuard('jwt'))
    @Get('me')
    async getProfile(@Req() req: any){
        return await req.user;
    }
}
