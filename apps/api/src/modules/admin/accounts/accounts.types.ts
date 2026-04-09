import type {
  AdminAccount,
  CreateAccountPayload,
  ImportAccountError,
  ImportAccountResponse,
  UpdateAccountPayload,
} from '@ai-demand/contracts'

export type Account = AdminAccount
export type CreateAccountInput = CreateAccountPayload
export type UpdateAccountInput = UpdateAccountPayload
export type ImportAccountResult = ImportAccountError
export type ImportAccountsSummary = ImportAccountResponse
