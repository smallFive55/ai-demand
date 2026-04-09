import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AccountManagementPanel from './AccountManagementPanel.vue'
import { accountsApi } from './api'

vi.mock('./api', () => ({
  accountsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    disable: vi.fn(),
    importBatch: vi.fn(),
  },
}))

const mockedApi = accountsApi as unknown as {
  list: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  disable: ReturnType<typeof vi.fn>
  importBatch: ReturnType<typeof vi.fn>
}

describe('AccountManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits create form successfully', async () => {
    mockedApi.list.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mockedApi.create.mockResolvedValueOnce({
      id: 'a1',
      name: 'Alice',
      email: 'alice@example.com',
      roleId: 'admin',
      status: 'enabled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const wrapper = mount(AccountManagementPanel)
    await flushPromises()

    await wrapper.get('button').trigger('click')
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('Alice')
    await inputs[1].setValue('alice@example.com')
    await wrapper.get('select').setValue('admin')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(mockedApi.create).toHaveBeenCalledWith({
      name: 'Alice',
      email: 'alice@example.com',
      roleId: 'admin',
    })
    expect(wrapper.text()).toContain('账号创建成功')
  })

  it('confirms disable action and calls api', async () => {
    mockedApi.list
      .mockResolvedValueOnce([
        {
          id: 'u1',
          name: 'Bob',
          email: 'bob@example.com',
          roleId: 'viewer',
          status: 'enabled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'u1',
          name: 'Bob',
          email: 'bob@example.com',
          roleId: 'viewer',
          status: 'disabled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
    mockedApi.disable.mockResolvedValueOnce({})

    const wrapper = mount(AccountManagementPanel)
    await flushPromises()

    const disableButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('禁用') && !btn.text().includes('确认'))
    expect(disableButton).toBeDefined()
    await disableButton?.trigger('click')
    const confirmButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('确认禁用'))
    expect(confirmButton).toBeDefined()
    await confirmButton?.trigger('click')
    await flushPromises()

    expect(mockedApi.disable).toHaveBeenCalledWith('u1')
    expect(wrapper.text()).toContain('账号已禁用')
  })

  it('shows guided import error for partial failures', async () => {
    mockedApi.list.mockResolvedValueOnce([])
    mockedApi.importBatch.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      errors: [{ index: 0, reasonCode: 'ROLE_NOT_FOUND', message: 'role missing' }],
    })
    mockedApi.list.mockResolvedValueOnce([])

    const wrapper = mount(AccountManagementPanel)
    await flushPromises()

    await wrapper
      .get('textarea')
      .setValue('[{"name":"A","email":"a@example.com","roleId":"missing-role"}]')
    const importButton = wrapper.findAll('button').find((btn) => btn.text() === '执行导入')
    await importButton?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('问题：导入存在失败项')
    expect(wrapper.text()).toContain('下一步：修正失败行后重新导入')
  })
})
