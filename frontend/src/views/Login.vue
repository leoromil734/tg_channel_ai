<template>
  <div class="min-h-screen bg-gray-950 flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">🤖</div>
        <h1 class="text-2xl font-bold text-white">Channel AI</h1>
        <p class="text-gray-400 text-sm mt-1">频道智能运营管理后台</p>
      </div>

      <!-- Login card -->
      <div class="bg-gray-900 rounded-2xl p-6 border border-gray-800">
        <form @submit.prevent="handleLogin">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-300 mb-1.5">访问密钥</label>
            <input
              v-model="secret"
              type="password"
              class="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 placeholder-gray-500"
              placeholder="输入 API_SECRET"
              autofocus
              required
            />
          </div>

          <div v-if="error" class="mb-4 text-red-400 text-sm bg-red-900/30 rounded-lg px-3 py-2">
            {{ error }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            {{ loading ? '验证中...' : '登录' }}
          </button>
        </form>
      </div>

      <p class="text-center text-xs text-gray-600 mt-4">
        密钥在后端 .env 文件的 API_SECRET 字段配置
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const secret = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!secret.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    // Verify by calling a protected endpoint
    await axios.get('/res/channels', {
      headers: { Authorization: `Bearer ${secret.value}` },
    })
    localStorage.setItem('api_secret', secret.value)
    router.replace('/dashboard')
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 401) {
      error.value = '密钥错误，请重新输入'
    } else {
      // Non-401 means server is reachable but something else failed → accept the key
      localStorage.setItem('api_secret', secret.value)
      router.replace('/dashboard')
    }
  } finally {
    loading.value = false
  }
}
</script>
