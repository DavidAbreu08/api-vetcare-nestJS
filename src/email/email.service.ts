import { EmailMessages } from "./email.messages";
import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Every user-provided or variable value interpolated into an HTML email goes through this (names, reasons, links). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

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
        <a href="${escapeHtml(link)}" style="
          display: inline-block;
          padding: 10px 20px;
          background-color: #4CAF50;
          color: #fff;
          text-decoration: none;
          border-radius: 5px;
          margin: 10px 0;
        ">Create Password</a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
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
        <p>Olá ${escapeHtml(userName)},</p>
        <p>
          A sua reserva para o dia <strong>${escapeHtml(reservationDate)}</strong> das <strong>${escapeHtml(timeStart)}</strong> às <strong>${escapeHtml(timeEnd)}</strong> foi criada com sucesso e será analisada pelo veterinário.
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
        <p>Olá ${escapeHtml(userName)},</p>
        <p>
          A sua reserva para o dia <strong>${escapeHtml(reservationDate)}</strong> das <strong>${escapeHtml(timeStart)}</strong> às <strong>${escapeHtml(timeEnd)}</strong> foi confirmada pelo veterinário.
        </p>
        ${note ? `<p><strong>O veterinário deixou uma nota para si:</strong> ${escapeHtml(note)}</p>` : ""}
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
        <p>Olá ${escapeHtml(userName)},</p>
        <p>A sua reserva foi <strong>reagendada</strong>.</p>
        <p>
          <strong>Data e hora anterior:</strong> ${escapeHtml(oldDate)} das ${escapeHtml(oldTimeStart)} às ${escapeHtml(oldTimeEnd)}<br>
          <strong>Nova data e hora:</strong> ${escapeHtml(newDate)} das ${escapeHtml(newTimeStart)} às ${escapeHtml(newTimeEnd)}
        </p>
        ${note ? `<p><strong>Nota:</strong> ${escapeHtml(note)}</p>` : ""}
        <br>
        <p>A nova data aguarda confirmação da clínica; receberá um email quando for confirmada.</p>
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
        <p>Olá ${escapeHtml(userName)},</p>
        <p>Lamentamos informar que a sua reserva para o dia <strong>${escapeHtml(reservationDate)}</strong> foi <strong>cancelada</strong>.</p>
        ${note ? `<p><strong>Motivo:</strong> ${escapeHtml(note)}</p>` : ""}
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
      subject: EmailMessages.RESERVATION_CREATED_SUBJECT,
      html: this.reservationCreatedTemplate(
        userName,
        reservationDate,
        timeStart,
        timeEnd
      ),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(EmailMessages.RESERVATION_CREATED_SENT);
    } catch {
      this.logger.error(EmailMessages.RESERVATION_CREATED_SEND_ERROR);
      throw new Error(EmailMessages.RESERVATION_CREATED_FAILED);
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
      subject: EmailMessages.RESERVATION_CONFIRMED_SUBJECT,
      html: this.reservationConfirmedTemplate(
        userName,
        reservationDate,
        timeStart,
        timeEnd,
        note
      ),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(EmailMessages.RESERVATION_CONFIRMED_SENT);
    } catch {
      this.logger.error(EmailMessages.RESERVATION_CONFIRMED_SEND_ERROR);
      throw new Error(EmailMessages.RESERVATION_CONFIRMED_FAILED);
    }
  }

  // Method to send the reset password email
  async sendResetPasswordEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: to, // Receiver address
      subject: EmailMessages.PASSWORD_RESET_SUBJECT,
      text: `You have requested a password reset. Please click the link below to reset your password:\n\n${resetLink}`,
    };

    try {
      // Send the email using the transporter
      await this.transporter.sendMail(mailOptions);
      this.logger.log(EmailMessages.PASSWORD_RESET_SENT);
    } catch {
      this.logger.error(EmailMessages.PASSWORD_RESET_SEND_ERROR);
      throw new Error(EmailMessages.PASSWORD_RESET_FAILED);
    }
  }

  async sendEmployeeWelcomeEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: EmailMessages.EMPLOYEE_WELCOME_SUBJECT,
      html: this.htmlTemplate(resetLink),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(EmailMessages.EMPLOYEE_WELCOME_SENT);
    } catch {
      this.logger.error(EmailMessages.EMPLOYEE_WELCOME_SEND_ERROR);
      throw new Error(EmailMessages.WELCOME_FAILED);
    }
  }

  async sendClientWelcomeEmail(to: string, resetToken: string) {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: EmailMessages.CLIENT_WELCOME_SUBJECT,
      html: this.htmlTemplate(resetLink),
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(EmailMessages.CLIENT_WELCOME_SENT);
    } catch {
      this.logger.error(EmailMessages.CLIENT_WELCOME_SEND_ERROR);
      throw new Error(EmailMessages.WELCOME_FAILED);
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
      subject: EmailMessages.RESERVATION_RESCHEDULED_SUBJECT,
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
      await this.transporter.sendMail(mailOptions);
      this.logger.log(EmailMessages.RESERVATION_RESCHEDULED_SENT);
    } catch {
      this.logger.error(EmailMessages.RESERVATION_RESCHEDULED_SEND_ERROR);
      throw new Error(EmailMessages.RESERVATION_RESCHEDULED_FAILED);
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
      subject: EmailMessages.RESERVATION_CANCELLED_SUBJECT,
      html: this.reservationCancelledTemplate(userName, reservationDate, note),
    };
    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(EmailMessages.RESERVATION_CANCELLED_SENT);
    } catch {
      this.logger.error(EmailMessages.RESERVATION_CANCELLED_SEND_ERROR);
      throw new Error(EmailMessages.RESERVATION_CANCELLED_FAILED);
    }
  }
}
