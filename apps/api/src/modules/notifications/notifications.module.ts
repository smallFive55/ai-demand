import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { HttpWecomNotifierService } from './http-wecom-notifier.service'
import { NoopWecomNotifierService } from './noop-wecom-notifier.service'
import { NotificationsService } from './notifications.service'
import { WECOM_NOTIFIER, type WecomNotifierPort } from './wecom-notifier.port'

/**
 * 通知模块（Story 2.3 Task 3）：
 *  - 默认选择：若设置了 WECOM_WEBHOOK_URL → HttpWecomNotifier，否则 Noop
 *  - 对外仅导出 NotificationsService，隐藏具体通知通道实现
 */
@Module({
  imports: [AuditModule],
  providers: [
    NotificationsService,
    HttpWecomNotifierService,
    NoopWecomNotifierService,
    {
      provide: WECOM_NOTIFIER,
      useFactory: (
        http: HttpWecomNotifierService,
        noop: NoopWecomNotifierService,
      ): WecomNotifierPort =>
        process.env.WECOM_WEBHOOK_URL?.trim() ? http : noop,
      inject: [HttpWecomNotifierService, NoopWecomNotifierService],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
