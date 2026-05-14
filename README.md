# Channel AI - Telegram 频道 AI 自动运营系统

基于 Grammy + SQLite + Vue + Tailwind 构建的多频道 AI 内容自动生成与发布系统。

## 功能特性

- **多频道管理**：通过 Bot 指令或 Web 面板管理多个 TG 频道
- **AI 内容创作**：多模型协作（OpenAI GPT-4o + Gemini）自动生成高质量内容
- **AI 图片生成**：DALL-E 3 / Gemini Imagen 自动配图
- **网络搜索采集**：Tavily API / Playwright 搜索最新资讯辅助创作
- **定时自动发布**：基于 Cron 表达式的定时任务，每天自动运营
- **Web 管理面板**：Vue 3 + Tailwind 现代化管理界面

## 快速开始

### 1. 安装依赖

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入你的 API Key
```

`.env` 配置示例：
```env
BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
TAVILY_API_KEY=tvly-...
API_SECRET=your_admin_password
PORT=3000
DB_PATH=./data/channel_ai.db
ADMIN_USER_IDS=123456789,987654321
```

### 3. 初始化数据库

```bash
cd backend
npm run db:migrate
```

### 4. 启动服务

```bash
# 启动 Backend（Bot + API 服务器 + 调度器）
cd backend
npm run dev

# 启动 Frontend
cd frontend
npm run dev
```

- Backend API：http://localhost:3000
- Frontend 管理面板：http://localhost:5173

## Bot 指令

| 指令 | 说明 |
|------|------|
| `/addchannel @channel` | 添加频道（引导式配置） |
| `/channels` | 查看所有管理的频道 |
| `/run <id>` | 手动触发内容生成并发布 |
| `/preview <id>` | 预览内容（不发布） |
| `/setschedule <id> <cron>` | 设置自动发布时间 |
| `/togglechannel <id>` | 启用/禁用频道 |
| `/status` | 查看今日任务状态 |

## AI 流水线

```
搜索研究 → 文本创作 → 提示词生成 → 图片生成 → 发布到频道
```

每个频道可单独配置：
- 文本生成：OpenAI GPT-4o 或 Google Gemini
- 图片生成：DALL-E 3 或 Gemini Imagen
- 提示词生成：独立选择模型
- 内容风格：资讯型/创意型/科技型等

## 项目结构

```
channel_ai/
├── backend/          # Node.js + Grammy + Hono + Drizzle
│   └── src/
│       ├── bot/          # Telegram Bot 指令
│       ├── api/          # REST API
│       ├── orchestrator/ # AI 编排流水线
│       ├── providers/    # AI 模型适配器
│       ├── scheduler/    # Cron 定时任务
│       ├── tools/        # 搜索工具
│       └── db/           # SQLite 数据库
└── frontend/         # Vue 3 + Vite + Tailwind
    └── src/
        ├── views/        # 页面组件
        ├── stores/       # Pinia 状态管理
        ├── api/          # API 封装
        └── router/       # 路由
```
