import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Channels from '../views/Channels.vue'
import Tasks from '../views/Tasks.vue'
import ContentHistory from '../views/ContentHistory.vue'
import Settings from '../views/Settings.vue'
import Login from '../views/Login.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login, meta: { public: true } },
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard, meta: { title: '总览' } },
    { path: '/channels', component: Channels, meta: { title: '频道管理' } },
    { path: '/tasks', component: Tasks, meta: { title: '任务队列' } },
    { path: '/content', component: ContentHistory, meta: { title: '内容历史' } },
    { path: '/settings', component: Settings, meta: { title: '系统设置' } },
  ],
})

router.beforeEach((to) => {
  const isPublic = to.meta.public === true
  const hasSecret = !!localStorage.getItem('api_secret')
  if (!isPublic && !hasSecret) {
    return { path: '/login' }
  }
})

export default router
