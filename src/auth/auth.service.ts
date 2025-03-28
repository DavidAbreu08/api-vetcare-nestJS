import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersEntity } from 'src/app/users/entities/users.entity';
import { UsersService } from 'src/app/users/users.service';
import { compareSync, hashSync } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CurrentUser } from './types/current-user';
import * as crypto from 'crypto';
import { EmailService } from 'src/email/email.service';
import { ResetTokenEntityRepository } from './repository/reset-token.repository';

@Injectable()
export class AuthService {

    constructor(
        private readonly userService: UsersService, 
        private readonly jwtService: JwtService,
        private readonly emailService: EmailService,
        private readonly resetTokenRepo: ResetTokenEntityRepository,
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

    async getEmployees(){
        return await this.userService.findEmployees();
    }
    

    async changePassword(id: string, oldPassword: string, newPassword: string, confirmNewPassword: string){
        const user = await this.userService.findOneOrFail({id});
        if(!user){
            throw new UnauthorizedException('User not Found!');
        }
    
        const isPasswordValid = compareSync(oldPassword, user.password);

        if (!isPasswordValid) throw new UnauthorizedException('Old Password is invalid!');

        if(newPassword !== confirmNewPassword) throw new UnauthorizedException('New Password and Confirm New Password must be the same!');

        const newHashedPassword = await hashSync(newPassword, 10);
        user.password = newHashedPassword;

        await this.userService.save(user);

        return {
            statusCode: HttpStatus.ACCEPTED,
            message: 'Password changed successfully!'
        };
    }

    private async generateAndSaveResetToken(user: UsersEntity): Promise<string> {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
    
        const resetToken = this.resetTokenRepo.create({
          resetToken: token,
          user: user,
          expiresAt,
        });
    
        await this.resetTokenRepo.save(resetToken);
        return token;
    }

    async forgotPassword(email: string) {
        try {
            const user = await this.userService.findOneOrFail({ email });

            // Optionally delete old tokens for this user first (to prevent multiple resets)
            await this.resetTokenRepo.delete({ user: { id: user.id } });
        
            const token = await this.generateAndSaveResetToken(user);
        
            
            // Send the email with the reset link
            await this.emailService.sendResetPasswordEmail(user.email, token);
        
            return { message: 'If this user exists, they will receive an email!' };
    
        } catch (err) {
            console.error('Error occurred during password reset:', err);
        }
    
        // Always return the same response for security
        return {
          message: 'If this user exists, they will receive an email!',
        };
    }


    async resetPassword(newPassword: string, confirmNewPassword: string){
        return ""
    }
}
