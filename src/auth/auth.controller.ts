import { Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Roles } from 'src/app/core/decorators/roles.decorator';
import { Role } from 'src/app/core/enums/role.enum';
import { RolesGuard } from 'src/app/core/guards/roles/roles.guard';

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

    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @UseGuards(AuthGuard('jwt'))
    @Get('employees')
    async getEmployees(){
        return await this.authService.getEmployees();
    }
}
