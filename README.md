# ATBard (Gemini High-Fidelity TTS Engine)

ATBard 是一个基于 Google Gemini 3.1 Flash TTS 技术构建的高保真文学朗诵与有声书配音平台。它集成了创新的指令工程（Prompt Engineering）、长文本智能切片连读渲染、高颜值双色自适应主题、本地播放可视化以及精细化的会话历史管理器。

# Demo

* 生成范例

<audio controls>
  <source src="./assets/audios/ATBard_Recite_Zephyr_自然流畅.wav" type="audio/wav" controls title="点击播放示例音频">
</audio>


* 系统界面

<div align="center">
  <img src="assets/images/index_screenshot.jpeg" width="100%" alt="朗诵创建">
</div>

---

## 核心特性

- **双色自适应艺术主题 (Dual Theme Modes)**:
  - **深色模式 (Dark Mode)**: 优雅的暗金色调设计，带给用户沉浸式的专业录音棚质感。
  - **浅色模式 (Light Mode)**: 温暖柔和的宣纸墨香色调，带来典雅清新的数字阅读体验。
  - 支持主题在导航栏一键切换，并自动通过 `localStorage` 记忆持久化。
- **Gemini 高保真 TTS 驱动 (Gemini 3.1 Flash TTS)**:
  - 支持调用 Google 官方最新的 `gemini-3.1-flash-tts` 毫秒级极速高质量语音合成引擎。
  - 提供 **API 配置管理面板 (API Settings)**，允许用户自由配置模型名称、切换官方服务或本地 NewAPI 中转站（OpenAI 格式基础 URL），以适应不同的网络部署环境。
  - **Prompt 透视镜 (Prompt Inspector)**：内置指令工程视图，可随时查看并分析注入 Gemini API 的系统级情绪渲染指令。
- **多选角吟诵 (Voice Casting)**:
  - 提供 5 种不同音色与背景特征的专业声线，包括经典吟诵、叙事讲古、文艺散文等，完美契合不同文体的艺术表现需求。
- **朗诵情感基调与节奏调校 (Emotion & Rhythm Control)**:
  - 内置情感基调模板：儒雅清雅（Elegant）、庄严深邃（Solemn）等。
  - 语速与吟诵节奏（Slow / Normal / Fast）支持三级变频微调。
- **智能名著分卷连读 (Smart Partitioning & Merge)**:
  - 支持连读最大 5 万字的超级长文本手稿。
  - 自动对长篇手稿进行逻辑分段与多线程/顺序分卷合成。
  - 提供分卷进度管理、接力自动连播以及前端一键分卷合并下载（自动打包生成单轨完整 WAV）。
- **豪华播放控制台 (Visualizer Playback Console)**:
  - 内置动态音频频谱动画柱（跟随播放状态实时脉动）。
  - 支持音频进度拖拽拉伸、音量无级调整与一键静音。
  - 支持生成音频（WAV 格式，24,000Hz PCM 单声道）的无损本地导出与文本复制分享。
- **本地生成历史会话 (Session History)**:
  - 完整记录当前会话的朗诵渲染记录，包括合成耗时、Token 吞吐量统计（输入/输出/总计）。
  - 提供直接重播、单段下载与分卷合集打包下载服务。
- **经典手稿模板库 (Preset Library)**:
  - 精选“古诗词”（如《将进酒》）、“散文名家”、“现代诗歌”和“English”多语言测试用例，支持一键载入快速体验。

---

## 技术架构

ATBard 采用前后端分离但整合部署的架构设计：

- **前端 (Frontend)**:
  - 基于 React + TypeScript 构筑核心 UI。
  - 采用 **Vite** 作为开发与生产资源打包工具。
  - 引入 **Tailwind CSS v4** 作为基础样式引擎，利用 HSL 颜色变量绑定实现高性能的主题切换过渡。
- **后端 (Backend)**:
  - 基于 Python **Django** 框架处理 API 服务。
  - 使用 SQLite3 作为持久化数据库保存 API 配置项及状态。
  - 利用最新的 **Google GenAI Python SDK** (`google-genai`) 保持与 Gemini API 交互的稳定高效。

---

## 开发与部署指南

### 1. 环境准备

本应用依赖 `conda` 或系统级 `Python 3.10+` 和 `Node.js 18+` 开发环境。

```bash
# 激活推荐的 Python 运行环境
export PATH=/usr/local/bin:$PATH
conda create -n ATBard python==3.12
conda activate ATBard
```

### 2. 依赖安装

**前端依赖安装**:
```bash
npm install
```

**后端依赖安装**:
确保您已经安装了 Django 和 Google GenAI 库：
```bash
pip install -r requirements.txt
```

### 3. 环境配置 (`.env`)

在项目根目录下创建 `.env` 配置文件（可参考 `.env.example`）：

```ini
# Gemini 核心 API 秘钥配置
GEMINI_API_KEY="您的_GEMINI_API_KEY"

# 应用托管 URL (可选)
APP_URL="http://127.0.0.1:3000"
```

### 4. 数据库迁移

运行 Django 数据库迁移以初始化配置表和本地存储表：

```bash
python manage.py migrate
```

### 5. 编译前端资源

在开发或启动后端之前，必须先将 Vite 前端静态资产编译打包：

```bash
# 运行前端打包，生成 dist/ 静态目录
npm run build

# 运行 TypeScript 类型静态检查 (可选)
npm run lint
```

### 6. 运行应用

通过 Django 服务端直接运行整个项目。它会自动托管 Vite 打包好的前端静态资源并代理 API 请求：

```bash
# 启动本地开发/运行服务器，端口默认 3000
python manage.py runserver 0.0.0.0:3000
```

启动完成后，请在浏览器中访问 [http://localhost:3000](http://localhost:3000)。

---

## 核心 API 路由说明

后端对外暴露以下主要的接口路由：

- `GET  /api/health`: 检查系统全局 Gemini API Key 是否已配置。
- `POST /api/recite`: 接受文本、音色、基调及语速设置，并调用 Gemini 接口生成 base64 PCM 音频流，最终在后端自动转换为 WAV 结构。
- `GET  /api/history`: 获取本地生成的历史记录。
- `POST /api/settings`: 保存与加载自定义 API 设置（包含官方 key、NewAPI base URL 与自定义模型标识）。

---

## 开发人员注意事项

- **主题系统扩展**:
  - 主题配置写在 [src/index.css](file:///opt/aitobox/ATBard/src/index.css) 中。若要为浅色或深色主题增加更多的语义化色值，可以直接在 `.light` 或 `:root` 下添加新的 CSS 自定义属性（Variables），并在顶部的 `@theme` 段中注册。
- **文件下载命名规则**:
  - 系统生成并在本地分卷合并导出的 WAV 音频，均遵循 `ATBard_[Date/Parameters].wav` 的规范格式进行命名。
