import { EmailMessages } from "./email.messages";
import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { applicationError } from "../app/core/exceptions/application-error";
import { ErrorMetadata } from "../app/core/enums/error-metadata.enum";

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
        <h2>Reservation Received!</h2>
        <p>Hello ${escapeHtml(userName)},</p>
        <p>
          Your reservation for <strong>${escapeHtml(reservationDate)}</strong> from <strong>${escapeHtml(timeStart)}</strong> to <strong>${escapeHtml(timeEnd)}</strong> has been created and will be reviewed by the veterinarian.
        </p>
        <p>You will receive a confirmation or a request to make changes shortly.</p>
        <br>
        <p>Thank you,<br>VetCare Team</p>
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
        <h2>Reservation Confirmed!</h2>
        <p>Hello ${escapeHtml(userName)},</p>
        <p>
          Your reservation for <strong>${escapeHtml(reservationDate)}</strong> from <strong>${escapeHtml(timeStart)}</strong> to <strong>${escapeHtml(timeEnd)}</strong> has been confirmed by the veterinarian.
        </p>
        ${note ? `<p><strong>Your veterinarian left a note:</strong> ${escapeHtml(note)}</p>` : ""}
        <p>We look forward to seeing you at your appointment.</p>
        <br>
        <p>Thank you,<br>VetCare Team</p>
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
        <h2>Reservation Rescheduled</h2>
        <p>Hello ${escapeHtml(userName)},</p>
        <p>Your reservation has been <strong>rescheduled</strong>.</p>
        <p>
          <strong>Previous date and time:</strong> ${escapeHtml(oldDate)} from ${escapeHtml(oldTimeStart)} to ${escapeHtml(oldTimeEnd)}<br>
          <strong>New date and time:</strong> ${escapeHtml(newDate)} from ${escapeHtml(newTimeStart)} to ${escapeHtml(newTimeEnd)}
        </p>
        ${note ? `<p><strong>Note:</strong> ${escapeHtml(note)}</p>` : ""}
        <br>
        <p>The new date is awaiting clinic confirmation. You will receive an email once it is confirmed.</p>
        <p>Thank you,<br>VetCare Team</p>
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
        <h2>Reservation Cancelled</h2>
        <p>Hello ${escapeHtml(userName)},</p>
        <p>Your reservation for <strong>${escapeHtml(reservationDate)}</strong> has been <strong>cancelled</strong>.</p>
        ${note ? `<p><strong>Reason:</strong> ${escapeHtml(note)}</p>` : ""}
        <br>
        <p>Please contact us if you have any questions.</p>
        <p>Thank you,<br>VetCare Team</p>
      </div>
    `;
  }

  // Email delivery:
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
    } catch (cause: unknown) {
      this.logger.error(EmailMessages.RESERVATION_CREATED_SEND_ERROR);
      throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, EmailMessages.RESERVATION_CREATED_FAILED, cause);
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
    } catch (cause: unknown) {
      this.logger.error(EmailMessages.RESERVATION_CONFIRMED_SEND_ERROR);
      throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, EmailMessages.RESERVATION_CONFIRMED_FAILED, cause);
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
    } catch (cause: unknown) {
      this.logger.error(EmailMessages.PASSWORD_RESET_SEND_ERROR);
      throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, EmailMessages.PASSWORD_RESET_FAILED, cause);
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
    } catch (cause: unknown) {
      this.logger.error(EmailMessages.EMPLOYEE_WELCOME_SEND_ERROR);
      throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, EmailMessages.WELCOME_FAILED, cause);
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
    } catch (cause: unknown) {
      this.logger.error(EmailMessages.CLIENT_WELCOME_SEND_ERROR);
      throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, EmailMessages.WELCOME_FAILED, cause);
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
    } catch (cause: unknown) {
      this.logger.error(EmailMessages.RESERVATION_RESCHEDULED_SEND_ERROR);
      throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, EmailMessages.RESERVATION_RESCHEDULED_FAILED, cause);
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
    } catch (cause: unknown) {
      this.logger.error(EmailMessages.RESERVATION_CANCELLED_SEND_ERROR);
      throw applicationError(ErrorMetadata.SERVICE_UNAVAILABLE, EmailMessages.RESERVATION_CANCELLED_FAILED, cause);
    }
  }
}
