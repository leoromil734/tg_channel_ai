import { defineStore } from 'pinia'
import { ref } from 'vue'
import { channelsApi, type Channel, type PipelineConfig } from '../api/index.js'

export const useChannelsStore = defineStore('channels', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchChannels() {
    loading.value = true
    error.value = null
    try {
      const res = await channelsApi.list()
      channels.value = res.data
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createChannel(data: Partial<Channel>) {
    const res = await channelsApi.create(data)
    await fetchChannels()
    return res.data
  }

  async function updateChannel(id: number, data: Partial<Channel>) {
    const res = await channelsApi.update(id, data)
    const idx = channels.value.findIndex((c) => c.id === id)
    if (idx !== -1) channels.value[idx] = res.data
    return res.data
  }

  async function deleteChannel(id: number) {
    await channelsApi.delete(id)
    channels.value = channels.value.filter((c) => c.id !== id)
  }

  async function updateConfig(channelId: number, data: Partial<PipelineConfig>) {
    const res = await channelsApi.updateConfig(channelId, data)
    return res.data
  }

  return { channels, loading, error, fetchChannels, createChannel, updateChannel, deleteChannel, updateConfig }
})
