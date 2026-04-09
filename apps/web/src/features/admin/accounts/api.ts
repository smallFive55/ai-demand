import { api } from '@/api/client'
import type {
  AdminAccount,
  CreateAccountPayload,
  ImportAccountResult,
  UpdateAccountPayload,
} from './types'

export type Account = AdminAccount

export const accountsApi = {
  list: () => api.get<AdminAccount[]>('/admin/accounts'),
  create: (payload: CreateAccountPayload) =>
    api.post<AdminAccount>('/admin/accounts', payload),
  update: (id: string, payload: UpdateAccountPayload) =>
    api.put<AdminAccount>(`/admin/accounts/${id}`, payload),
  disable: (id: string) => api.post<AdminAccount>(`/admin/accounts/${id}/disable`),
  importBatch: (items: CreateAccountPayload[]) =>
    api.post<ImportAccountResult>('/admin/accounts/import', { items }),
}
