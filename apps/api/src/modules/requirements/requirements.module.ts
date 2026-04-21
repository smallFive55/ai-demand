import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RequirementFieldSnapshotEntity } from '../../database/entities/requirement-field-snapshot.entity'
import { RequirementMessageEntity } from '../../database/entities/requirement-message.entity'
import { RequirementEntity } from '../../database/entities/requirement.entity'
import { AuditModule } from '../audit/audit.module'
import { BusinessUnitsModule } from '../admin/business-units/business-units.module'
import { EchoLlmChatService } from './llm/echo-llm-chat.service'
import { HttpLlmChatService } from './llm/http-llm-chat.service'
import { LLM_CHAT, LlmChatPort } from './llm/llm-chat.port'
import { IntakeBusinessUnitsController } from './intake-business-units.controller'
import { RequirementsController } from './requirements.controller'
import { RequirementsService } from './requirements.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RequirementEntity,
      RequirementMessageEntity,
      RequirementFieldSnapshotEntity,
    ]),
    AuditModule,
    BusinessUnitsModule,
  ],
  controllers: [RequirementsController, IntakeBusinessUnitsController],
  providers: [
    RequirementsService,
    EchoLlmChatService,
    HttpLlmChatService,
    {
      provide: LLM_CHAT,
      useFactory: (echo: EchoLlmChatService, http: HttpLlmChatService): LlmChatPort =>
        process.env.LLM_API_URL?.trim() ? http : echo,
      inject: [EchoLlmChatService, HttpLlmChatService],
    },
  ],
})
export class RequirementsModule {}
