import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Mock API, auth store hooks and router BEFORE importing the component
vi.mock('@/features/intake/api', () => ({
  intakeApi: {
    getRequirement: vi.fn(),
  },
}))

const mockRouter = { replace: vi.fn(), push: vi.fn() }
let mockRouteQuery: Record<string, unknown> = {}
let mockRouteFullPath = '/delivery-manager/approvals'
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => ({
    get query() {
      return mockRouteQuery
    },
    get fullPath() {
      return mockRouteFullPath
    },
  }),
}))

const authState = {
  isAuthenticated: true,
  isDeliveryManager: true,
}
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
}))

import DeliveryManagerApprovalsLanding from './DeliveryManagerApprovalsLanding.vue'
import { intakeApi } from '@/features/intake/api'

const mockedApi = intakeApi as unknown as {
  getRequirement: ReturnType<typeof vi.fn>
}

function receivedRequirement(id = 'req-R-1') {
  return {
    id,
    title: '营销活动自动化',
    description: '',
    status: 'received',
    projectIds: ['p1'],
    submitterId: 'biz-b',
    deliveryManagerId: 'dm-x',
    collectedFields: {},
    admissionAssessment: {
      businessUnitId: 'bu-1',
      projectIds: ['p1'],
      admissionScore: 88,
      admissionRationale: '匹配度充足',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('DeliveryManagerApprovalsLanding (Story 2.4 deep-link 落地)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockRouteFullPath = '/delivery-manager/approvals'
    authState.isAuthenticated = true
    authState.isDeliveryManager = true
    mockedApi.getRequirement.mockResolvedValue(receivedRequirement())
  })

  it('loads requirement and renders deep-link-hint when source=wecom (AC7 happy path)', async () => {
    mockRouteQuery = {
      requirementId: 'req-R-1',
      step: 'review',
      actionId: 'act-1',
      source: 'wecom',
    }

    const wrapper = mount(DeliveryManagerApprovalsLanding)
    await flushPromises()

    expect(mockedApi.getRequirement).toHaveBeenCalledWith('req-R-1')
    expect(wrapper.find('[data-test="deep-link-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="deep-link-invalid-hint"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="requirement-title"]').text()).toContain('营销活动自动化')
    expect(wrapper.get('[data-test="requirement-status"]').text()).toContain('已接待')
    expect(wrapper.get('[data-test="requirement-admission"]').text()).toContain('匹配度：88')
  })

  it('shows deep-link-invalid-hint when requirementId is missing (AC7 fallback)', async () => {
    mockRouteQuery = { step: 'review', source: 'wecom' }

    const wrapper = mount(DeliveryManagerApprovalsLanding)
    await flushPromises()

    expect(wrapper.find('[data-test="deep-link-invalid-hint"]').exists()).toBe(true)
    const text = wrapper.text()
    expect(text).toContain('问题：')
    expect(text).toContain('原因：')
    expect(text).toContain('下一步：')
    expect(mockedApi.getRequirement).not.toHaveBeenCalled()
  })

  it('shows deep-link-invalid-hint when requirementId format is invalid', async () => {
    // 含非法字符（空格/中文）应被前置校验拦截，避免后端无意义查询
    mockRouteQuery = {
      requirementId: '非法 id!!',
      step: 'review',
      source: 'wecom',
    }

    const wrapper = mount(DeliveryManagerApprovalsLanding)
    await flushPromises()

    expect(wrapper.find('[data-test="deep-link-invalid-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('requirementId')
    expect(mockedApi.getRequirement).not.toHaveBeenCalled()
  })

  it('shows three-part fallback hint when role is not delivery_manager (AC7 no-white-screen)', async () => {
    authState.isDeliveryManager = false
    mockRouteQuery = {
      requirementId: 'req-R-1',
      step: 'review',
      source: 'wecom',
    }

    const wrapper = mount(DeliveryManagerApprovalsLanding)
    await flushPromises()

    expect(wrapper.find('[data-test="deep-link-invalid-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('交付经理')
    expect(mockedApi.getRequirement).not.toHaveBeenCalled()
  })

  it('redirects to /login keeping deep-link context when not authenticated', async () => {
    authState.isAuthenticated = false
    authState.isDeliveryManager = false
    mockRouteFullPath = '/delivery-manager/approvals?requirementId=req-R-1&step=review&source=wecom'
    mockRouteQuery = {
      requirementId: 'req-R-1',
      step: 'review',
      source: 'wecom',
    }

    mount(DeliveryManagerApprovalsLanding)
    await flushPromises()

    expect(mockRouter.replace).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: mockRouteFullPath },
    })
  })

  it('shows fallback hint when API load fails (404 / network)', async () => {
    const { ApiError } = await import('@/api/client')
    mockedApi.getRequirement.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', '需求不存在'))
    mockRouteQuery = {
      requirementId: 'req-R-1',
      step: 'review',
      source: 'wecom',
    }

    const wrapper = mount(DeliveryManagerApprovalsLanding)
    await flushPromises()

    expect(wrapper.find('[data-test="deep-link-invalid-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="deep-link-hint"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('需求不存在')
  })

  it('shows fallback hint when step is not review (stale / mismatched deep link)', async () => {
    mockRouteQuery = {
      requirementId: 'req-R-1',
      step: 'abandon',
      source: 'wecom',
    }

    const wrapper = mount(DeliveryManagerApprovalsLanding)
    await flushPromises()

    expect(wrapper.find('[data-test="deep-link-invalid-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('step')
    expect(mockedApi.getRequirement).not.toHaveBeenCalled()
  })
})
