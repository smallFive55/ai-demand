<script setup lang="ts">
import AccountManagementPanel from '@/features/admin/accounts/AccountManagementPanel.vue'
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-text-primary">账号管理</h1>
      <p class="mt-1 text-sm text-text-muted">管理管理员账号生命周期与批量导入</p>
    </div>
    <AccountManagementPanel />
  </div>
</template>
