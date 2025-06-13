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

  public reservationCreatedTemplate(
    userName: string,
    reservationDate: string,
    timeStart: string,
    timeEnd: string
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Reserva Recebida!</h2>
        <p>Olá ${userName},</p>
        <p>
          A sua reserva para o dia <strong>${reservationDate}</strong> das <strong>${timeStart}</strong> às <strong>${timeEnd}</strong> foi criada com sucesso e será analisada pelo veterinário.
        </p>
        <p>Em breve receberá uma confirmação ou pedido de alteração.</p>
        <br>
        <p>Obrigado,<br>VetCare Team</p>
      </div>
    `;
  }

  public reservationConfirmedTemplate(
    userName: string,
    reservationDate: string,
    timeStart: string,
    timeEnd: string,
    note?: string
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Reserva Confirmada!</h2>
        <p>Olá ${userName},</p>
        <p>
          A sua reserva para o dia <strong>${reservationDate}</strong> das <strong>${timeStart}</strong> às <strong>${timeEnd}</strong> foi confirmada pelo veterinário.
        </p>
        ${note ? `<p><strong>O veterinário deixou uma nota para si:</strong> ${note}</p>` : ""}
        <p>Aguardamos por si na data marcada.</p>
        <br>
        <p>Obrigado,<br>VetCare Team</p>
      </div>
    `;
  }

  public reservationRescheduledTemplate(
    userName: string,
    oldDate: string,
    oldTimeStart: string,
    oldTimeEnd: string,
    newDate: string,
    newTimeStart: string,
    newTimeEnd: string,
    note?: string
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Reserva Reagendada</h2>
        <p>Olá ${userName},</p>
        <p>A sua reserva foi <strong>reagendada</strong>.</p>
        <p>
          <strong>Data e hora anterior:</strong> ${oldDate} das ${oldTimeStart} às ${oldTimeEnd}<br>
          <strong>Nova data e hora:</strong> ${newDate} das ${newTimeStart} às ${newTimeEnd}
        </p>
        ${note ? `<p><strong>Nota:</strong> ${note}</p>` : ""}
        <br>
        <p>Por favor, confirme a sua disponibilidade.</p>
        <p>Obrigado,<br>VetCare Team</p>
      </div>
    `;
  }

  public reservationCancelledTemplate(
    userName: string,
    reservationDate: string,
    note?: string
  ): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Reserva Cancelada</h2>
        <p>Olá ${userName},</p>
        <p>Lamentamos informar que a sua reserva para o dia <strong>${reservationDate}</strong> foi <strong>cancelada</strong>.</p>
        ${note ? `<p><strong>Motivo:</strong> ${note}</p>` : ""}
        <br>
        <p>Se tiver dúvidas, por favor contacte-nos.</p>
        <p>Obrigado,<br>VetCare Team</p>
      </div>
    `;
  }

  // Envio dos emails:
  async sendReservationCreatedEmail(
    to: string,
    userName: string,
    reservationDate: string,
    timeStart: string,
    timeEnd: string
  ) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: "Reserva Recebida - VetCare",
      html: this.reservationCreatedTemplate(
        userName,
        reservationDate,
        timeStart,
        timeEnd
      ),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Reserva criada: email enviado para ${to}: ${info.response}`
      );
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email de reserva criada para ${to}:`,
        error.message
      );
      throw new Error("Não foi possível enviar o email de reserva criada");
    }
  }

  async sendReservationConfirmedEmail(
    to: string,
    userName: string,
    reservationDate: string,
    timeStart: string,
    timeEnd: string,
    note?: string
  ) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: "Reserva Confirmada - VetCare",
      html: this.reservationConfirmedTemplate(
        userName,
        reservationDate,
        timeStart,
        timeEnd,
        note
      ),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Reserva confirmada: email enviado para ${to}: ${info.response}`
      );
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email de confirmação para ${to}:`,
        error.message
      );
      throw new Error("Não foi possível enviar o email de confirmação");
    }
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

  async sendReservationRescheduledEmail(
    to: string,
    userName: string,
    oldDate: string,
    oldTimeStart: string,
    oldTimeEnd: string,
    newDate: string,
    newTimeStart: string,
    newTimeEnd: string,
    note?: string
  ) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: "Reserva Reagendada - VetCare",
      html: this.reservationRescheduledTemplate(
        userName,
        oldDate,
        oldTimeStart,
        oldTimeEnd,
        newDate,
        newTimeStart,
        newTimeEnd,
        note
      ),
    };
    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Reserva reagendada: email enviado para ${to}: ${info.response}`
      );
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email de reagendamento para ${to}:`,
        error.message
      );
      throw new Error("Não foi possível enviar o email de reagendamento");
    }
  }

  async sendReservationCancelledEmail(
    to: string,
    userName: string,
    reservationDate: string,
    note?: string
  ) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: "Reserva Cancelada - VetCare",
      html: this.reservationCancelledTemplate(userName, reservationDate, note),
    };
    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Reserva cancelada: email enviado para ${to}: ${info.response}`
      );
    } catch (error) {
      this.logger.error(
        `Erro ao enviar email de cancelamento para ${to}:`,
        error.message
      );
      throw new Error("Não foi possível enviar o email de cancelamento");
    }
  }
}
