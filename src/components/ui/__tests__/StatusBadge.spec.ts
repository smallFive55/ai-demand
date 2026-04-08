import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from '../StatusBadge.vue'

describe('StatusBadge', () => {
  it('renders the label for a given status', () => {
    const wrapper = mount(StatusBadge, {
      props: { status: 'collecting' },
    })
    expect(wrapper.text()).toContain('对话收集中')
  })

  it('renders a different label for accepted status', () => {
    const wrapper = mount(StatusBadge, {
      props: { status: 'accepted' },
    })
    expect(wrapper.text()).toContain('已验收')
  })
})
