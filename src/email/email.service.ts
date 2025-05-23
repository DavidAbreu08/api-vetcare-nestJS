import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import * as dotenv from "dotenv";

dotenv.config();

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  // Create a transporter object using the default SMTP transport
  private readonly transporter = nodemailer.createTransport({
    service: "gmail", // For Gmail, you can change this for other services like Outlook, etc.
    auth: {
      user: process.env.EMAIL_USER, // Your email address (e.g., example@gmail.com)
      pass: process.env.EMAIL_PASSWORD, // Your email password or App Password
    },
  });

  public htmlTemplate(link: string): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Welcome to VetCare!</h2>
        <p>Your account has been created.</p>
        <p>
          Please click the button below to create your password. This link will expire in 1 hour.
        </p>
        <a href="${link}" style="
          display: inline-block;
          padding: 10px 20px;
          background-color: #4CAF50;
          color: #fff;
          text-decoration: none;
          border-radius: 5px;
          margin: 10px 0;
        ">Create Password</a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${link}">${link}</a></p>
        <br>
        <p>Thank you,<br>VetCare Team</p>
      </div>
    `;
  }

  // Method to send the reset password email
  async sendResetPasswordEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: to, // Receiver address
      subject: "Password Reset Request",
      text: `You have requested a password reset. Please click the link below to reset your password:\n\n${resetLink}`,
    };

    try {
      // Send the email using the transporter
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log("Email sent successfully:", info.response);
    } catch (error) {
      this.logger.error("Error sending email:", error.message);
      throw new Error("Email could not be sent");
    }
  }

  async sendEmployeeWelcomeEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: "Your Employee Account Has Been Created",
      html: this.htmlTemplate(resetLink),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Welcome email sent to ${to}: ${info.response}`);
    } catch (error) {
      this.logger.error(`Error sending welcome email to ${to}:`, error.message);
      throw new Error("Could not send welcome email");
    }
  }

  async sendClientWelcomeEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: "Your Client Account Has Been Created",
      html: this.htmlTemplate(resetLink),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Welcome email sent to ${to}: ${info.response}`);
    } catch (error) {
      this.logger.error(`Error sending welcome email to ${to}:`, error.message);
      throw new Error("Could not send welcome email");
    }
  }
}
