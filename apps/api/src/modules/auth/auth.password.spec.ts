import { Test, TestingModule } from '@nestjs/testing'
import { AccountsService } from '../admin/accounts/accounts.service'
import { RolesService } from '../admin/roles/roles.service'
import { AuditService } from '../audit/audit.service'
import { IntegrationTestDbModule } from '../../test/integration-test-db.module'
import { resetTestDatabaseBeforeFile } from '../../test/integration-test-hooks'
import { AuthService } from './auth.service'
import { MailService } from './mail.service'

resetTestDatabaseBeforeFile()

describe('AuthService — 修改密码 / 忘记密码 / 重置', () => {
  let auth: AuthService
  let accounts: AccountsService
  let mail: MailService
  let moduleRef: TestingModule
  let lastResetUrl: string

  beforeEach(async () => {
    lastResetUrl = ''
    moduleRef = await Test.createTestingModule({
      imports: [IntegrationTestDbModule],
      providers: [AuthService, MailService, AccountsService, AuditService, RolesService],
    }).compile()

    await moduleRef.init()

    auth = moduleRef.get(AuthService)
    accounts = moduleRef.get(AccountsService)
    mail = moduleRef.get(MailService)

    jest.spyOn(mail, 'sendPasswordResetEmail').mockImplementation(async (_to, url) => {
      lastResetUrl = url
      return true
    })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await moduleRef.close()
  })

  it('已登录用户可修改密码并用新密码登录', async () => {
    const created = await accounts.create(
      {
        name: 'Pwd User',
        email: 'pwd-user@example.com',
        roleId: 'viewer',
        password: 'initial123',
      },
      't',
      'r1',
    )

    await auth.changePassword(created.id, 'initial123', 'updated123')

    const session = await auth.login('pwd-user@example.com', 'updated123')
    expect(session.user.name).toBe('Pwd User')
    await expect(
      auth.changePassword(created.id, 'wrong-pass-1', 'anothernew1'),
    ).rejects.toThrow('当前密码不正确')
  })

  it('忘记密码令牌可重置密码并失效', async () => {
    const created = await accounts.create(
      {
        name: 'Reset User',
        email: 'reset-user@example.com',
        roleId: 'viewer',
        password: 'before-reset1',
      },
      't',
      'r2',
    )

    await auth.requestPasswordReset('reset-user@example.com')
    expect(lastResetUrl).toContain('token=')
    const token = new URL(lastResetUrl).searchParams.get('token')
    expect(token).toBeTruthy()

    await auth.resetPasswordWithToken(token!, 'after-reset12')
    const session = await auth.login('reset-user@example.com', 'after-reset12')
    expect(session.user.id).toBe(created.id)

    await expect(auth.resetPasswordWithToken(token!, 'anotherone1')).rejects.toThrow('重置令牌无效或已过期')
  })
})
