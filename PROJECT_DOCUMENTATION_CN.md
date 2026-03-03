# LearningLab 项目详尽文档（可评审版）

- 文档版本：v1.2
- 代码快照时间：2026-03-03
- 适用范围：`learninglab` 当前仓库实现（前端 React + 后端 Proxy）
- 构建状态：`npm run build` 已通过（2026-03-03）

## 0. 这份文档解决什么问题

本文件目标是把“产品意图、算法机制、工程落地”三件事对齐，避免评审时出现口径不一致。

- 给产品经理：明确当前可交付范围、用户价值、已知限制。
- 给算法同学：明确目前哪些是规则算法，哪些依赖 Gemini，输入输出怎么定义。
- 给开发同学：明确模块职责、数据结构、接口契约、部署与风险。

---

## 1. 项目概览

### 1.1 产品定位

LearningLab（代码内名称 `LinguistFlow`）是一个多语言学习 Web 应用，核心围绕三件事：

1. AI 生成练习素材（听力/阅读）
2. 高频交互训练（听写 + RSVP 极速阅读）
3. 词汇沉淀与复习（词库 + 复习模式 + 学习统计）

### 1.2 当前支持语言与等级

- 语言：`EN` / `FR` / `KR`
- 等级：`A0` ~ `C2`（按用户-语言维度保存）

### 1.3 核心页面模块

- 任务中心（Mission）
- 听力实验室（Listening）
- 极速阅读（Reader）
- 词汇库（Vocab）
- 统计面板（Stats）
- 韩语字母教练（仅 KR + A 段位时引导）
- 设置弹窗（词典管理 + API 配置）

---

## 2. 功能清单（按“是否真实落地”划分）

### 2.1 已落地并可用

1. 多用户本地化（IndexedDB `users`）与用户切换
2. 每日任务状态（按 `YYYY-MM-DD_userId` 维护）
3. 听力素材 AI 生成（文本段落 + TTS 音频）
4. 听写逐词判定（正确/错误状态）
5. Flow Sync 自适应播放速率与卡顿回环
6. 阅读素材 AI 获取与 RSVP 展示
7. ORP（最佳识别点）对齐阅读渲染
8. 全文翻译调用
9. 生词收藏、AI 释义补全
10. 复习清单筛选（到期词）
11. 学习日志入库与统计展示（LXP、连续天数）
12. 词典文件流式导入（Web Worker + 批量写库）
13. 云端词典下载导入（按 URL 流式）
14. 韩语字母发音（AI TTS + 本地缓存确认）
15. 后端 Gemini Proxy（`/api/proxy`）
16. Proxy 基础鉴权（Bearer Token）+ 内存级限流
17. 词卡复习接入 `calculateNextReview`（自动更新 `strength/nextReview/reviewHistory`）
18. 词典导入接入 Cuckoo/Bloom 去重（本地与云端导入均生效）
19. 生词保存接入形态学规则（词形归并去重 + 韩语助词结构提取）

### 2.2 部分落地（代码存在，但链路未完全闭环）

1. Dashboard 高级统计函数
   - 现状：`getChartData`、`getMasteryGainHeatmap`、`calculateProficiency` 未在页面主视图使用。

### 2.3 当前未做（需明确给评审）

1. 账号体系（登录、鉴权、多端同步）
2. 服务端持久化（当前以浏览器本地存储为主）
3. 服务端审计/告警体系
4. 自动化测试体系（单测/集成/E2E）

---

## 3. 典型用户流程

### 3.1 听力训练流程

1. 用户输入主题或 URL
2. 前端调用 `generateAIPractice` / `generatePracticeFromUrl`
3. AI 返回句段 JSON（含翻译、可选 hardWords）+ TTS 音频
4. 前端按段播放，用户逐词输入
5. Flow Sync 根据键入节奏动态调速或循环当前段
6. 结束后写入学习日志（`DICTATION`）并更新任务完成状态

### 3.2 阅读训练流程

1. 用户输入主题/链接
2. 前端调用 `fetchReadingMaterial` 获取阅读文本
3. 可选难度分析（`analyzeTextDifficulty`）触发预热弹层
4. 文本切块后进入 RSVP 播放
5. 用户可收藏当前块、调整 WPM、查看全文翻译
6. 翻译动作写入学习日志（`READER`）并更新任务完成

### 3.3 生词沉淀流程

1. 听力提示原文或阅读中点击词
2. 写入本地词库（按 `userId` + `language`）
3. 异步调用 `defineWord` 回填翻译与元数据
4. 复习模式按到期时间拉取列表

---

## 4. 技术架构

### 4.1 架构总览

```text
[React/Vite 前端]
  |- UI Components
  |- services/gemini.ts  ----(直连或代理)----> [Gemini API]
  |- services/db.ts      ----> IndexedDB
  |- services/audioCache ----> Cache API
  |- services/fileParser ----> Web Worker

[Node Express Proxy]
  |- POST /api/proxy
  |- Bearer Token 鉴权
  |- In-memory Rate Limit
  |- 读取 GEMINI_API_KEY
  |- 透传 generateContent 请求
```

### 4.2 关键技术选型

- 前端：React 19 + TypeScript + Vite 6
- 样式：Tailwind CSS 4
- 后端：Express 5 + Helmet + CORS + dotenv
- AI SDK：`@google/genai`
- 本地存储：IndexedDB + localStorage + Cache API
- 文档/词典解析：Web Worker + `pdfjs-dist`（依赖已安装）

---

## 5. 代码模块职责映射

### 5.1 页面与容器

- `App.tsx`
  - 全局状态编排：当前 Tab、语言、用户、词汇集、复习模式
  - 任务完成状态更新
  - 生词添加与 AI 释义联动

### 5.2 核心组件

1. `ListeningLab.tsx`
   - AI 生成听力素材
   - 逐词输入判定
   - Flow Sync 播放状态机
   - 学习日志落库

2. `SpeedReader.tsx`
   - 文本切块与 ORP 渲染
   - 动态停顿节奏
   - 难度预热
   - 翻译与日志落库

3. `VocabularyBank.tsx`
   - 词卡翻转
   - AI 释义触发
   - 按“记住/模糊”触发 SRS 调度（更新下次复习时间）

4. `Dashboard.tsx`
   - 词汇战力 LXP
   - 连续学习天数
   - 语言等级进度条

5. `SettingsModal.tsx`
   - 词典导入（本地/云端）
   - 词典优先级与启停管理
   - API Key / Proxy URL / Proxy Token 配置

6. `KoreanAlphabetCoach.tsx`
   - 韩文字母组合音节表
   - TTS 发音与本地确认缓存

### 5.3 服务层

- `services/gemini.ts`：统一 AI 调用入口 + 代理回退策略
- `services/db.ts`：IndexedDB 读写抽象
- `services/fileParser.ts`：流式词典解析 Worker
- `services/sync.ts`：远程字典下载与导入
- `services/scheduler.ts`：复习调度函数
- `services/stats.ts`：统计计算函数
- `services/audioCache.ts`：音频缓存服务

---

## 6. 数据模型与存储设计

### 6.1 主要 Type 定义

- `User`
  - `levels: Record<Language, CEFRLevel>`
  - `preferences`（主题、语速、引导模式）
  - `missionStatus: Record<string, DailyMission>`

- `VocabularyItem`
  - 词面、上下文、语言、强度、复习时间戳、AI 元数据等

- `StudyLog`
  - 类型（`DICTATION` / `READER`）、分数、时长、时间戳

- `DictionarySource` / `DictionaryEntry`
  - 词典元信息与词条实体

### 6.2 浏览器存储分层

1. `localStorage`
   - `vocab_${userId}`：词汇数组
   - `GEMINI_API_KEY`、`GEMINI_PROXY_URL`、`GEMINI_PROXY_TOKEN`

2. IndexedDB（DB: `LinguistFlowDB`, version `6`）
   - `users`
   - `study_logs`
   - `dict_meta`
   - `dict_entries`
   - `audio_cache`（韩语字母教练使用）

3. Cache API
   - cache name: `linguist-flow-audio-v1`
   - 用于长句 TTS 音频 Blob 缓存（听力练习）

---

## 7. 算法与策略细节（评审重点）

### 7.1 Flow Sync（听力）

- 输入信号：用户按键时间间隔序列
- 基线更新：最近最多 20 次按键，至少 10 次后更新平均间隔
- 基线约束：`400ms ~ 2500ms`
- 速率策略：
  - `timeSinceKey < 1.5 * baseline` -> `1.0x`
  - 否则 -> `0.5x`
- 循环策略：`timeSinceKey >= 3 * baseline` 时触发回环
- 回环锚点：优先对齐到最近静音点（RMS < 0.01，50ms 窗）

结论：这是规则驱动状态机，不依赖模型在线推理，稳定可解释。

### 7.2 RSVP + ORP（阅读）

- 核心：每个 chunk 选择一个视觉锚点字符（ORP）固定在中线
- 非韩语：短词居中，长词取约 40% 位置
- 韩语：按字符长度偏向前部（0/1/2 档）
- 目的：降低眼跳成本，提高高速阅读稳定性

### 7.3 动态停顿（阅读节奏）

- 基础延迟：`(60 / WPM) * 1000 * chunk词数`
- 放大因子：
  - 长词块（长度>8）*1.2
  - 逗号停顿 *2.0
  - 句末停顿 *3.0

### 7.4 复习调度（当前状态）

- 预设间隔：`[0,1,3,7,14,30]` 天
- 正确+1级，错误-1级（夹紧 0~5）
- 词卡按钮已接入：依据“记住/模糊”计算并写回 `strength`、`nextReview`、`reviewHistory`

### 7.5 词典导入解析策略

- 主线程负责下载流，Worker 负责文本切行解析
- 批大小：`3000` 词/批次
- 文件读取块：`1MB`
- 分隔符：优先 `\t`，其次 CSV 逗号规则分割
- 去重思路：导入会话内使用 Cuckoo Filter 主去重，Bloom Filter 作为降级路径与一致性校验
- 结果反馈：导入状态显示 `unique imported` 与 `duplicates skipped`

### 7.6 形态学归并策略（生词链路）

- 英语/法语：生词保存前生成 lemma 候选（如复数、时态、变位），同 lemma 视为重复词
- 韩语：保存前解析助词结构，自动提取 `rootWord` 并写入 metadata
- 已知词集合：不再只看原词，而是按 lemma 集合构建，减少词形噪声

---

## 8. AI 集成设计

### 8.1 调用策略

- 优先使用 `GEMINI_PROXY_URL`（如果配置）
- 否则直连 Gemini（读取本地 API Key）

### 8.2 主要模型用途

1. `gemini-3-flash-preview`
   - 释义、难度分析、翻译、听力句段结构化输出
2. `gemini-3-pro-preview`
   - 阅读素材获取（可带 Google Search 工具）
3. `gemini-2.5-flash-preview-tts`
   - 音频生成（听力、韩语发音）

### 8.3 返回约束

- 多处使用 `responseSchema` + `responseMimeType: application/json`
- 目的：减少前端后处理和脏数据概率

---

## 9. 后端 API 契约

### 9.1 `POST /api/proxy`

请求体：

```json
{
  "model": "gemini-3-flash-preview",
  "contents": "...",
  "config": {}
}
```

请求头（必需）：

```text
Authorization: Bearer <PROXY_AUTH_TOKEN>
```

响应体：

```json
{
  "text": "...",
  "candidates": []
}
```

错误：

- `400`：缺少 `model` 或 `contents`
- `401`：Token 缺失或不匹配
- `429`：超过速率限制
- `503`：Proxy 未配置鉴权 token
- `500`：上游调用异常（返回 `error.message`）

### 9.2 安全中间件现状

- 已启用：`helmet`、`X-Content-Type-Options`、禁缓存头、Bearer 鉴权、内存级限流
- 当前缺失：请求签名、服务端持久审计日志、分布式限流
- 限流粒度：按客户端 IP（`x-forwarded-for` 优先，回退 `req.ip`）

---

## 10. 运行与部署

### 10.1 环境要求

- Node.js（建议 LTS）
- `.env`：
  - `GEMINI_API_KEY`
  - `PROXY_AUTH_TOKEN`
  - `RATE_LIMIT_WINDOW_MS`（默认 `60000`）
  - `RATE_LIMIT_MAX_REQUESTS`（默认 `60`）
  - `PORT`（建议 `3001`，避免与 Vite 3000 冲突）

### 10.2 常用命令

- `npm install`
- `npm start`（同时启动前端和 proxy）
- `npm run dev`（仅前端）
- `npm run proxy`（仅后端代理）
- `npm run build`（生产构建）

### 10.3 端口约定

- 前端开发服务器：`3000`
- 代理服务：建议 `3001`

---

## 11. 质量状态与容量观察

### 11.1 当前验证结论

- 本地生产构建通过
- 暂无自动化测试
- 无 CI/CD 定义文件

### 11.2 性能观察

- 构建产物主包约 `837KB`（gzip ~226KB）
- Vite 提示主 chunk > 500KB（建议后续拆包）

---

## 12. 风险清单（可直接用于评审）

### 12.1 高优先级

1. 安全风险：前端可配置并存储 API Key（localStorage），若误用生产域名可能泄露
2. 代理为单实例内存限流：多实例部署或重启后计数不共享，需升级到 Redis 等集中式方案
3. 代理鉴权为静态 token：缺少轮换、过期与细粒度权限

### 12.2 中优先级

1. 词典过滤器已接入导入去重，但尚未接入在线检索/高亮链路
2. 编码一致性风险：中文文案存在乱码迹象，影响可维护性
3. 统计视图较轻，部分统计函数未落到 UI

### 12.3 低优先级

1. 未使用组件/函数增加认知负担（如快捷键弹窗组件）
2. `loading` 控制在个别按钮流程中未完整覆盖

---

## 13. “盘问问答库”

### 13.1 产品经理常问

1. 问：核心用户价值是什么？
   - 答：把“内容获取-训练-沉淀-复习”闭环在一个界面完成，减少学习切换成本。

2. 问：为什么先做本地存储而不是云端账号？
   - 答：当前阶段优先验证训练交互和学习效果；本地方案降低后端复杂度，加快迭代。

3. 问：每日任务怎么定义完成？
   - 答：词汇数累计 + 听力完成标记 + 阅读完成标记，按日期和用户维度记录。

4. 问：韩语初学者与其他用户路径有何不同？
   - 答：KR 且 A 段位用户，任务中心首任务引导到字母教练，先打基础发音。

5. 问：现阶段最影响留存的短板是什么？
   - 答：统计反馈偏轻、缺乏云端同步与账号体系。

### 13.2 算法同学常问

1. 问：Flow Sync 是模型驱动还是规则驱动？
   - 答：规则驱动状态机，输入是键入间隔，输出是播放速率与回环位置。

2. 问：难度评估怎么做？
   - 答：由 Gemini 输出结构化难度结果（density/level/suggestion/difficultWords），前端用于预热决策。

3. 问：ORP 规则为什么分 KR 与非 KR？
   - 答：韩语形态构词特点与拉丁语系差异明显，视觉锚点策略需单独处理。

4. 问：字典去重为什么同时有 Bloom 和 Cuckoo？
   - 答：当前导入主链路已启用两者：Cuckoo 负责主去重，Bloom 负责降级路径与一致性兜底。

5. 问：目前“算法可解释性”如何？
   - 答：除文本难度/生成内容外，播放节奏、评分、复习排序都是可解释规则。

### 13.3 开发同学常问

1. 问：AI 请求失败会怎样？
   - 答：服务层有 try/catch 与兜底返回，UI 显示失败提示，不会导致页面崩溃。

2. 问：如何切换直连与代理？
   - 答：在设置中填 `GEMINI_PROXY_URL` 即走代理，否则读取本地 API Key 直连。

3. 问：为什么建议代理端口用 3001？
   - 答：Vite dev 默认 3000，代理若也跑 3000 会冲突。

4. 问：词典导入大文件会卡 UI 吗？
   - 答：解析在 Worker 进行，主线程只做流式下载和进度展示。

5. 问：现阶段最先该补的工程项？
   - 答：分布式限流、token 轮换机制、编码统一、自动化测试与 CI。

---

## 14. 下一阶段建议（按优先级）

1. P0：把 Proxy 限流升级为 Redis/集中式方案，支持多实例
2. P0：将静态 token 升级为可轮换机制（含过期与最小权限）
3. P1：统一 UTF-8 编码并清理乱码文案
4. P1：词典过滤器接入查询路径，形成“导入-查询-去重”闭环
5. P1：按路由/模块拆包，降低主 chunk 体积
6. P2：引入 Vitest + Playwright 建立最小自动化回归

---

## 15. 结论（评审口径）

这个项目已经形成可运行、可演示、可迭代的学习闭环，强项在交互训练与 AI 结合；短板在工程化和安全化。对外口径应坚持三点：

1. 当前是功能闭环 MVP，不是生产级 SaaS。
2. 算法层以可解释规则为主，AI 负责内容生成和难度标注。
3. 下一阶段重点是安全、复习闭环、工程质量，而不是继续堆功能。

---

## 16. 版本变更记录（Changelog）

### v1.2（2026-03-03）

1. 接通“幽灵模块”：词典导入去重正式接入 Cuckoo/Bloom 组合策略（本地导入与云端导入均生效）。
2. 接通形态学主链路：生词保存启用 lemma 归并去重，韩语词自动提取助词结构并写入 metadata。
3. 已知词识别从“原词匹配”升级为“lemma 集合匹配”，并在阅读页收藏按钮上体现“已收藏”状态。
4. 新增 `services/dictionaryDedup.ts`，统一封装导入会话去重逻辑，导入反馈增加 `unique` / `duplicates skipped`。
5. 更新文档口径：将 Cuckoo/Bloom 与形态学从“部分落地”调整为“已接入主链路”。

### v1.1（2026-03-03）

1. Proxy 增加基础鉴权（Bearer Token）与内存级 Rate Limit。
2. 前端代理请求支持 `GEMINI_PROXY_TOKEN` 透传。
3. 词卡复习接入 `calculateNextReview`，自动更新 `strength/nextReview/reviewHistory`。

