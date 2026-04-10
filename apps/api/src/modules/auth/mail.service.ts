import { Injectable, Logger } from '@nestjs/common'

/**
 * 可选 SMTP：未配置 SMTP_HOST 时不发信；可将 AUTH_LOG_PASSWORD_RESET_TOKEN=true 在日志中输出重置链接（仅内网联调）。
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    const host = process.env.SMTP_HOST?.trim()
    if (!host) {
      if (process.env.AUTH_LOG_PASSWORD_RESET_TOKEN === 'true') {
        this.logger.warn(`[密码重置] 未配置 SMTP，重置链接（勿泄露）：${resetUrl} → ${to}`)
      }
      return false
    }

    const port = parseInt(process.env.SMTP_PORT ?? '587', 10)
    const secure = process.env.SMTP_SECURE === 'true'
    const user = process.env.SMTP_USER?.trim()
    const pass = process.env.SMTP_PASSWORD
    const from = process.env.SMTP_FROM?.trim() ?? 'noreply@localhost'

    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    })

    await transporter.sendMail({
      from,
      to,
      subject: '重置您的登录密码',
      text: `请点击以下链接重置密码（1 小时内有效）：\n${resetUrl}\n\n如非本人操作请忽略本邮件。`,
      html: `<p>请点击以下链接重置密码（<strong>1 小时内有效</strong>）：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如非本人操作请忽略本邮件。</p>`,
    })
    return true
  }
}
