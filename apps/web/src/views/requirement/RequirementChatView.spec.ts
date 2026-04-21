import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock API, auth store hooks and router BEFORE importing the component
vi.mock('@/features/intake/api', () => ({
  intakeApi: {
    createRequirement: vi.fn(),
    getRequirement: vi.fn(),
    listMessages: vi.fn(),
    listFieldSnapshots: vi.fn(),
    appendMessage: vi.fn(),
    listEnabledBusinessUnits: vi.fn(),
    patchIntake: vi.fn(),
    abandonRequirement: vi.fn(),
  },
}))

const mockRouter = { replace: vi.fn(), push: vi.fn() }
let mockRouteQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => ({ query: mockRouteQuery }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    isBusiness: true,
    isAdmin: false,
    isDeliveryManager: false,
  }),
}))

import { ref as vueRef } from 'vue'

const mockCurrentRequirement = vueRef<null | {
  id: string
  status: string
  title: string
  admissionAssessment: {
    businessUnitId: string | null
    projectIds: string[]
    admissionScore: number | null
    admissionRationale?: string
  }
}>(null)

vi.mock('@/stores/requirement', () => ({
  useRequirementStore: () => ({
    get currentRequirement() {
      return mockCurrentRequirement.value
    },
    fetchRequirement: vi.fn(async () => {
      // tests flip mockCurrentRequirement directly
    }),
  }),
}))

import RequirementChatView from './RequirementChatView.vue'
import { intakeApi } from '@/features/intake/api'

const mockedApi = intakeApi as unknown as {
  createRequirement: ReturnType<typeof vi.fn>
  listMessages: ReturnType<typeof vi.fn>
  listEnabledBusinessUnits: ReturnType<typeof vi.fn>
  abandonRequirement: ReturnType<typeof vi.fn>
  getRequirement: ReturnType<typeof vi.fn>
}

function collectingRequirement(id = 'req-abc') {
  return {
    id,
    title: '活动自动化',
    description: '',
    status: 'collecting',
    projectIds: [],
    submitterId: 'biz-1',
    collectedFields: {},
    admissionAssessment: {
      businessUnitId: null,
      projectIds: [],
      admissionScore: null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function abandonedRequirement(id = 'req-abc') {
  return { ...collectingRequirement(id), status: 'abandoned' }
}

describe('RequirementChatView - abandon flow (Story 2.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockCurrentRequirement.value = collectingRequirement()
    mockedApi.createRequirement.mockResolvedValue(collectingRequirement())
    mockedApi.listMessages.mockResolvedValue([])
    mockedApi.listEnabledBusinessUnits.mockResolvedValue([])
    mockedApi.getRequirement.mockResolvedValue(collectingRequirement())
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('shows abandon button only while collecting and opens the confirm modal', async () => {
    const wrapper = mount(RequirementChatView)
    await flushPromises()

    const btn = wrapper.find('[data-test="abandon-button"]')
    expect(btn.exists()).toBe(true)
    expect(wrapper.find('[data-test="abandon-modal"]').exists()).toBe(false)

    await btn.trigger('click')
    expect(wrapper.find('[data-test="abandon-modal"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('确认放弃该需求？')
  })

  it('confirms abandon: calls API with trimmed reason and switches to read-only banner', async () => {
    mockedApi.abandonRequirement.mockResolvedValueOnce(abandonedRequirement())

    const wrapper = mount(RequirementChatView)
    await flushPromises()

    await wrapper.get('[data-test="abandon-button"]').trigger('click')
    await wrapper.get('[data-test="abandon-reason"]').setValue('  业务优先级调整  ')
    await wrapper.get('[data-test="abandon-confirm"]').trigger('click')
    // Flip store to abandoned (fetchRequirement is mocked no-op)
    mockCurrentRequirement.value = abandonedRequirement()
    await flushPromises()

    expect(mockedApi.abandonRequirement).toHaveBeenCalledWith('req-abc', {
      reason: '业务优先级调整',
    })
    expect(wrapper.find('[data-test="abandoned-banner"]').exists()).toBe(true)

    const textarea = wrapper.get('[data-test="chat-input"]').element as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)

    expect(wrapper.find('[data-test="abandon-button"]').exists()).toBe(false)
  })

  it('passes reason as undefined when left empty', async () => {
    mockedApi.abandonRequirement.mockResolvedValueOnce(abandonedRequirement())

    const wrapper = mount(RequirementChatView)
    await flushPromises()

    await wrapper.get('[data-test="abandon-button"]').trigger('click')
    await wrapper.get('[data-test="abandon-confirm"]').trigger('click')
    await flushPromises()

    expect(mockedApi.abandonRequirement).toHaveBeenCalledWith('req-abc', { reason: undefined })
  })

  it('cancels abandon without calling API', async () => {
    const wrapper = mount(RequirementChatView)
    await flushPromises()

    await wrapper.get('[data-test="abandon-button"]').trigger('click')
    await wrapper.get('[data-test="abandon-cancel"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="abandon-modal"]').exists()).toBe(false)
    expect(mockedApi.abandonRequirement).not.toHaveBeenCalled()
  })

  it('surfaces guided error when abandon fails and keeps modal open', async () => {
    const { ApiError } = await import('@/api/client')
    mockedApi.abandonRequirement.mockRejectedValueOnce(
      new ApiError(
        400,
        'BAD_REQUEST',
        '问题：无法放弃需求。原因：仅在「对话收集中」阶段允许放弃操作。下一步：请在需求列表查看当前状态或联系交付经理。',
      ),
    )

    const wrapper = mount(RequirementChatView)
    await flushPromises()

    await wrapper.get('[data-test="abandon-button"]').trigger('click')
    await wrapper.get('[data-test="abandon-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="abandon-modal"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('问题：无法放弃需求')
    expect(wrapper.text()).toContain('下一步：')
  })

  it('loads requirement from WeCom deep link instead of creating a new session', async () => {
    mockRouteQuery = { requirementId: 'req-deep', step: 'abandon', source: 'wecom' }
    mockCurrentRequirement.value = abandonedRequirement('req-deep')
    mockedApi.listMessages.mockResolvedValueOnce([])

    const wrapper = mount(RequirementChatView)
    await flushPromises()

    expect(mockedApi.listMessages).toHaveBeenCalledWith('req-deep')
    expect(mockedApi.createRequirement).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="deep-link-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('问题：该需求已通过企业微信通知标记为「已放弃」')
  })

  it('shows neutral hint when deep link step=abandon but requirement is NOT abandoned (HIGH-4)', async () => {
    // 深链声称 step=abandon，但实际状态仍为 collecting —— 不得展示"已放弃"误导文案
    mockRouteQuery = { requirementId: 'req-collecting', step: 'abandon', source: 'wecom' }
    mockCurrentRequirement.value = collectingRequirement('req-collecting')
    mockedApi.listMessages.mockResolvedValueOnce([])

    const wrapper = mount(RequirementChatView)
    await flushPromises()

    expect(wrapper.find('[data-test="deep-link-hint"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('已通过企业微信通知标记为「已放弃」')
    expect(wrapper.text()).toContain('无法确认放弃状态')
  })
})
