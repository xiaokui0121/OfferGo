# OfferGo · AI 求职管理工作台

> 一站式帮你抓岗、改简历、跟投递、复盘面试 —— 面向校招生与早期职场人，用 AI 把零散的找工作流程串成一条工业流水线。

## 产品故事

写这个产品起源于一个观察：身边朋友找工作的时候，**JD 散落在小红书／脉脉／公众号**，**简历改完几版搞不清哪版最好**，**投了哪家、到哪一步、面试官问过什么，全靠 Excel + 截图 + 记忆**。

OfferGo 把这条链路拆成四个核心模块：

| 模块 | 解决的问题 | AI 介入点 |
|---|---|---|
| 岗位库 | 小红书招聘帖正文乱、信息密度低 | 自动判定「是否是真实招聘」+ 结构化抽取公司/岗位/JD/联系方式 |
| AI 改简历 | 简历改得没方向、不知道是否匹配 JD | 输出匹配度分数 + 核心问题 + 逐条 STAR 改写建议 |
| Dashboard 投递管理 | 投到哪一步全凭记忆 | 看板拖拽推进，自动记录时间线 |
| 面试复盘 | 面试结束就忘，下次踩同样的坑 | 录音转文字 + AI 生成 6 题点评 + 追问 + 优劣势总结 |

## 技术栈

- **前端**：React 18 + Vite 7 + Tailwind + shadcn/ui + Wouter（路由）+ TanStack Query
- **后端**：Express + Node 20 + Drizzle ORM
- **数据库**：SQLite（better-sqlite3，WAL 模式，单文件部署）
- **AI**：Claude Sonnet 4.5（经 OpenRouter 中转，OpenAI SDK 兼容协议）
- **采集**：Playwright + 真实浏览器扫码登录（仅本地 / 沙箱可用）
- **部署**：Railway（Nixpacks 构建 + 持久磁盘）

## 快速启动（本地开发）

### 1. 准备 API Key

注册 [OpenRouter](https://openrouter.ai)，充值至少 \$5（支持支付宝），创建一个 Key。

### 2. 安装与启动

```bash
git clone https://github.com/<your-username>/offergo.git
cd offergo
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 OPENROUTER_API_KEY

# 开发模式（热重载）
npm run dev

# 生产构建 + 启动
npm run build
npm start
```

打开 http://localhost:5000 即可使用。首次启动会自动注入 30 条演示岗位、4 条投递记录、1 条面试复盘种子，方便面试官 / 评审快速感知产品形态。

## 部署到 Railway

1. 推代码到 GitHub
2. 在 [Railway](https://railway.app) 用 GitHub 登录，**New Project → Deploy from GitHub Repo**
3. **Variables** 面板添加：
   - `OPENROUTER_API_KEY` = 你的 key
   - `DB_PATH` = `/app/data/data.db`
   - `DATA_DIR` = `/app/data`
4. **Settings → Volumes** 新建一个 Volume，挂载到 `/app/data`（用于持久化 SQLite + JD 图片）
5. **Settings → Networking** 点 Generate Domain，拿到 `xxx.up.railway.app` 链接
6. 等 Build 跑完，访问域名即可

`railway.json` 已配好构建/启动命令，无需额外操作。

## 部署现状声明

> 这是面试演示版本，请阅读以下技术约束。

### LLM 走 OpenRouter 中转

原计划直连 Anthropic 官方 API，但官方仅支持美元信用卡且对大陆地区不友好。当前部署走 OpenRouter（支持支付宝充值）。

**已知风险**：Claude / OpenAI / Google 近期对中转服务商审查趋严，OpenRouter 账号存在被识别后封禁的可能。生产上线后建议接入：

- 公司主体直接开通 Anthropic / OpenAI 官方 API
- 或接入企业级国内代理（火山方舟、阿里通义、智谱清言等）

### 演示模式禁用项

为避免面试当场因为账号/账号风控导致 Demo 不可用，演示版默认关闭以下两项：

| 功能 | 演示版状态 | 原因 |
|---|---|---|
| 小红书扫码登录 + 真实采集 | 禁用，引导观看 B 站演示视频 | 测试账号已被风控，无法在新环境完成扫码 |
| 面试录音上传 + AI 转写 | 禁用，保留一条种子复盘报告 | 录音转文字需独立 STT 模型（Whisper / ElevenLabs Scribe），OpenRouter 不代理，需另开账号且封号风险更高 |

简历优化、JD 抽取、复盘报告查看、Dashboard 看板等核心交互均完整可用。

## 未来演进 Roadmap

如果作为正式产品孵化，下一阶段会做：

1. **多用户支持**：当前单租户 SQLite，重构为 Postgres + 用户系统（Clerk/Auth0）
2. **稳定 LLM 渠道**：公司主体开通官方 API，去除中转风险
3. **国内合规 STT**：接讯飞 / 阿里云语音转写，支持中文方言 + 长音频
4. **多平台抓取**：扩展到 Boss 直聘、拉勾、脉脉、公众号
5. **AI 面试模拟器**：用历史复盘训练个性化面试官 Agent，做对抗练习
6. **简历版本管理**：每次 AI 优化生成快照，可回滚 / 对比 / A/B 投递

## 项目结构

```
offergo/
├── client/              # 前端源码（React + Vite）
│   └── src/
│       ├── pages/       # 路由级页面
│       ├── components/  # 复用组件
│       └── lib/         # 工具与 API client
├── server/              # 后端源码（Express）
│   ├── index.ts         # 入口与中间件
│   ├── routes.ts        # 业务路由 + LLM 调用
│   ├── storage.ts       # Drizzle ORM 数据访问层
│   ├── seed.ts          # 演示数据种子
│   └── scraper/         # 小红书登录 + 采集（演示版禁用）
├── shared/              # 前后端共享 schema
├── script/build.ts      # Vite + esbuild 双端打包脚本
├── data/                # 运行时数据（被 gitignore）
├── railway.json         # Railway 部署配置
└── .env.example         # 环境变量模板
```

## 演示视频

B 站完整演示：[https://b23.tv/DIFbtBO](https://b23.tv/DIFbtBO)

## 作者

Avery · 小红书产品 · 2026 春求职作品

—— 这个仓库本身就是简历的一部分：从 0 设计到上线，全栈实现，AI 接入，所有产品决策都写在 commit message 与本 README 里。
