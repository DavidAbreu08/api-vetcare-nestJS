import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersEntity } from 'src/app/users/users.entity';
import { UsersService } from 'src/app/users/users.service';
import { compareSync } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser } from './types/current-user';

@Injectable()
export class AuthService {

    constructor(
        private readonly userService: UsersService, 
        private readonly jwtService: JwtService
    ) {}

    async login(user){
        const payload = { sub: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }

        return {
            token: this.jwtService.sign(payload)
        }
    }


    async validateUser(email: string, password: string){
        let user: UsersEntity;
        try {
            user = await this.userService.findOneOrFail({ email });
        } catch (error) {
            return null;
        }

        const isPasswordValid = compareSync(password, user.password);
        if (!isPasswordValid) return null;

        return user;
    }

    async validateJwtUser(id: string){
        const user = await this.userService.findOneOrFail({id});
        if(!user) throw new UnauthorizedException('User not Found!');
        const currentUser: CurrentUser = { id: user.id, email: user.email , firstName: user.firstName, lastName: user.lastName, role: user.role };
        return currentUser;
    }

}
