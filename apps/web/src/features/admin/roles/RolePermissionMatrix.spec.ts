import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RolePermissionMatrix from './RolePermissionMatrix.vue'
import type { PermissionEntry } from './types'

describe('RolePermissionMatrix', () => {
  it('renders resource groups with action checkboxes', () => {
    const wrapper = mount(RolePermissionMatrix, {
      props: { modelValue: [] },
    })

    expect(wrapper.text()).toContain('角色管理')
    expect(wrapper.text()).toContain('账号管理')
    expect(wrapper.text()).toContain('查看')
    expect(wrapper.text()).toContain('管理')
  })

  it('reflects initial permissions via checked checkboxes', () => {
    const initial: PermissionEntry[] = [
      { resource: 'admin.role', actions: ['read'], scope: { type: 'all' } },
    ]
    const wrapper = mount(RolePermissionMatrix, {
      props: { modelValue: initial },
    })

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    const roleReadCheckbox = checkboxes[0]
    expect((roleReadCheckbox.element as HTMLInputElement).checked).toBe(true)
  })

  it('emits update:modelValue when action toggled', async () => {
    const wrapper = mount(RolePermissionMatrix, {
      props: { modelValue: [] },
    })

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].setValue(true)

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeDefined()
    expect(emitted!.length).toBeGreaterThan(0)
    const lastEmit = emitted![emitted!.length - 1][0] as PermissionEntry[]
    expect(lastEmit.some((e) => e.resource === 'admin.role' && e.actions.includes('read'))).toBe(
      true,
    )
  })

  it('shows scope controls when actions are selected', async () => {
    const initial: PermissionEntry[] = [
      { resource: 'admin.account', actions: ['read'], scope: { type: 'all' } },
    ]
    const wrapper = mount(RolePermissionMatrix, {
      props: { modelValue: initial },
    })

    expect(wrapper.text()).toContain('权限范围')
    expect(wrapper.text()).toContain('全部')
    expect(wrapper.text()).toContain('按项目')
    expect(wrapper.text()).toContain('按业务线')
  })

  it('shows scope ID input when project or businessLine is selected', async () => {
    const initial: PermissionEntry[] = [
      {
        resource: 'admin.account',
        actions: ['read'],
        scope: { type: 'project', ids: ['p1'] },
      },
    ]
    const wrapper = mount(RolePermissionMatrix, {
      props: { modelValue: initial },
    })

    const textInputs = wrapper.findAll('input[type="text"]')
    expect(textInputs.length).toBeGreaterThan(0)
  })

  it('shows validation error when scope IDs are missing', async () => {
    const initial: PermissionEntry[] = [
      { resource: 'admin.account', actions: ['read'], scope: { type: 'project' } },
    ]
    const wrapper = mount(RolePermissionMatrix, {
      props: { modelValue: initial },
    })

    const errors = (wrapper.vm as unknown as { validationErrors: string[] }).validationErrors
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('项目')
  })
})
