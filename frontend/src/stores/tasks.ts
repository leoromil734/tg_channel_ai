import { defineStore } from 'pinia'
import { ref } from 'vue'
import { tasksApi, type Task, type TaskStats } from '../api/index.js'

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const stats = ref<TaskStats>({ total: 0, done: 0, failed: 0, running: 0, pending: 0 })
  const loading = ref(false)

  async function fetchTasks(params?: { channelId?: number; status?: string; date?: string }) {
    loading.value = true
    try {
      const res = await tasksApi.list(params)
      tasks.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    const res = await tasksApi.stats()
    stats.value = res.data
  }

  return { tasks, stats, loading, fetchTasks, fetchStats }
})
