import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  // Create a transporter object using the default SMTP transport
  private readonly transporter = nodemailer.createTransport({
    service: 'gmail', // For Gmail, you can change this for other services like Outlook, etc.
    auth: {
      user: process.env.EMAIL_USER, // Your email address (e.g., example@gmail.com)
      pass: process.env.EMAIL_PASSWORD, // Your email password or App Password
    },
  });

  // Method to send the reset password email
  async sendResetPasswordEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: to, // Receiver address
      subject: 'Password Reset Request',
      text: `You have requested a password reset. Please click the link below to reset your password:\n\n${resetLink}`,
    };

    try {
      // Send the email using the transporter
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log('Email sent successfully:', info.response);
    } catch (error) {
      this.logger.error('Error sending email:', error.message);
      throw new Error('Email could not be sent');
    }
  }
}
