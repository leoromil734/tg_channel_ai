<template>
  <div class="min-h-screen flex">
    <!-- Sidebar -->
    <aside class="w-64 bg-gray-900 text-white flex flex-col fixed inset-y-0 left-0 z-50">
      <div class="p-6 border-b border-gray-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center text-lg">🤖</div>
          <div>
            <div class="font-bold text-white">Channel AI</div>
            <div class="text-xs text-gray-400">频道智能运营</div>
          </div>
        </div>
      </div>

      <nav class="flex-1 p-4 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          :class="$route.path === item.path
            ? 'bg-primary-600 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'"
        >
          <span class="text-lg">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="p-4 border-t border-gray-800">
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <span
            class="w-2 h-2 rounded-full"
            :class="apiConnected ? 'bg-green-400' : 'bg-red-400'"
          ></span>
          <span>{{ apiConnected ? 'API 已连接' : 'API 未连接' }}</span>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex-1 ml-64">
      <header class="h-16 bg-white border-b border-gray-200 flex items-center px-6 sticky top-0 z-40">
        <h1 class="text-lg font-semibold text-gray-800">{{ currentPageTitle }}</h1>
        <div class="ml-auto flex items-center gap-3">
          <span class="text-sm text-gray-500">{{ currentDate }}</span>
        </div>
      </header>

      <main class="p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'

const route = useRoute()
const apiConnected = ref(false)

const navItems = [
  { path: '/dashboard', icon: '📊', label: '总览' },
  { path: '/channels', icon: '📢', label: '频道管理' },
  { path: '/tasks', icon: '⚙️', label: '任务队列' },
  { path: '/content', icon: '📝', label: '内容历史' },
  { path: '/settings', icon: '🔑', label: '提供商设置' },
]

const currentPageTitle = computed(() => {
  return navItems.find((i) => i.path === route.path)?.label ?? 'Channel AI'
})

const currentDate = computed(() => dayjs().format('YYYY年MM月DD日'))

async function checkApiConnection() {
  try {
    const res = await fetch('/health')
    apiConnected.value = res.ok
  } catch {
    apiConnected.value = false
  }
}

onMounted(() => {
  checkApiConnection()
  setInterval(checkApiConnection, 30000)
})
</script>
