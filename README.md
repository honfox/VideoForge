# VideoForge · 视频格式转换器

**纯浏览器本地转码的视频格式转换器。文件不会上传到任何服务器，断网可用。**

基于 `ffmpeg.wasm`（WebAssembly 版 FFmpeg），支持分辨率、缩放方式、帧速率、编码器、码率控制等高级参数，可输出 MP4 / WebM / MKV / MOV / AVI / **AMV** / GIF / MP3 / M4A / WAV 等格式，特别适合给廉价 MP4 小播放器转片。

---

## 目录

- [快速开始](#快速开始)
- [单文件版（一个 exe，无需 Node.js）](#单文件版一个-exe无需-nodejs)
- [退出方式](#退出方式)
- [功能详解](#功能详解)
- [设备屏幕适配](#设备屏幕适配)
- [AMV 格式说明](#amv-格式说明)
- [多线程加速](#多线程加速)
- [输出体积说明](#输出体积说明为什么转出来反而更大)
- [性能提示](#性能提示)
- [常见问题 FAQ](#常见问题-faq)
- [开发与构建](#开发与构建)
- [发布到 GitHub](#发布到-github)
- [目录结构](#目录结构)

---

## 快速开始

### 方式一：单文件 exe（推荐，无需任何依赖）

从 [Releases](https://github.com/honfox/VideoForge/releases) 下载 `VideoForge.exe`（约 150 MB），**双击即用**。不需要安装 Node.js，拷贝到任何 Windows 电脑上都能跑。

也可以在本仓库 `dist/VideoForge.exe` 找到本地构建产物。

### 方式二：start.bat 一键启动

双击 `start.bat`：优先启动 `dist/VideoForge.exe`，没有则回退到 Node.js 方式，并自动打开浏览器（默认 `http://localhost:5173`）。

### 方式三：Node.js 源码运行

```bash
npm start                      # 启动服务，手动打开 http://localhost:5173
node server.js --open          # 启动并自动打开浏览器
node server.js --no-open 8888  # 不自动开浏览器，指定端口
```

要求 Node.js 20+（单文件构建需要；仅跑源码 18+ 也可以）。

> **必须通过 `http://` 访问**，不能直接双击 `index.html`。浏览器对 `file://` 下的 ES Module 与 Web Worker 有安全限制。

---

## 单文件版（一个 exe，无需 Node.js）

`VideoForge.exe` 把 **Node 运行时 + 全部网页资源**（`index.html`、`assets/`、`vendor/`，含约 62 MB 的 ffmpeg.wasm）打进了同一个文件：

- 使用 Node 20+ 内置的 **SEA（Single Executable Applications）**方案，不依赖 pkg / nexe 等第三方打包器
- `server.js` 检测 `sea.isSea()` 后直接从内嵌资源读取文件发给浏览器，**不在磁盘释放任何临时文件**
- `build.js` 会自动探测当前 Node 版本的 SEA sentinel（不同 Node 构建该值可能不同，硬编码会失败），无需手工配置
- 只嵌入白名单扩展名的静态资源，测试用的大视频不会被卷进去
- 单文件版双击运行时**默认自动打开浏览器**（`--no-open` 可关闭），Ctrl+C / 关页面均可退出

### 自己构建

```bash
npm install    # 安装 devDependency：postject
npm run build  # 产出 dist/VideoForge.exe（约 152 MB）
```

想换程序名，改 `build.js` 里的 `OUT_EXE`；想换图标，可在构建后用 ResourceHacker 等工具处理。

### 命令行参数

| 参数 | 说明 |
| --- | --- |
| `--open` | 启动后自动打开浏览器（单文件版默认开启） |
| `--no-open` | 不自动打开浏览器 |
| `8888` | 指定端口（默认 5173，被占用时自动顺延，最多试 20 个） |
| `PORT=8888 node server.js` | 也可以用环境变量指定端口 |

---

## 退出方式

| 方式 | 行为 |
| --- | --- |
| **关闭浏览器标签页 / 窗口** | 页面通过 `/__events`（SSE 长连接）与服务端保持连接，最后一个页面关闭 **3 秒后服务端自动退出** |
| **刷新页面** | 不会误退出——旧连接断开后新连接秒建，3 秒宽限期足以覆盖 |
| **Ctrl+C** | 立即优雅退出（强制断开全部保活连接，1.5 秒兜底强退） |
| **访问 `/__quit`** | 浏览器打开 `http://localhost:5173/__quit` 手动退出 |

> 多个标签页同时打开时，全部关闭才会退出；只关其中一个服务继续运行。

---

## 功能详解

### 输出格式

| 格式 | 编码组合 | 用途 |
| --- | --- | --- |
| MP4 | H.264 + AAC | 最通用 |
| WebM | VP8 + Vorbis | 网页嵌入 |
| MKV | H.264 + AAC | 多轨封装 |
| MOV | H.264 + AAC | 剪辑软件 |
| AVI | MPEG-4 + MP3 | 老设备 |
| **AMV** | **AMV(MJPEG) + ADPCM** | **廉价 MP4 小播放器** |
| GIF | 256 色调色板 | 动图 |
| MP3 / M4A / WAV | 仅音频 | 提取音轨 |

### 高级参数

- **分辨率**：保持原始 / 4K / 2K / 1080p / 720p / 480p / 360p / 240p / AMV 160×120 / 自定义（支持只填宽或高，另一边按比例算）
- **设备屏幕适配**：量出播放器屏幕的长和宽，自动匹配比例并推荐分辨率，一键选择横屏 / 竖屏输出
- **缩放方式**：适应留边（pad）、填满裁切（crop）、强制拉伸、仅限宽度、仅限高度、不缩放；可配置留边颜色与重采样算法（lanczos / bicubic / bilinear / nearest / area）
- **帧速率**：保持原始 / 60 / 50 / 30 / 25 / 24 / 23.976 / 15 / 12 / 10 / 自定义；帧率模式支持 CFR / VFR / 透传
- **视频编码**：编码器、CRF 恒定质量或目标码率、x264 速度预设、像素格式、GOP
- **音频编码**：重新编码 / 直接复制 / 移除，编码器、码率、采样率、声道
- **其它**：起止时间裁剪、faststart、移除元数据
- **实时命令预览**（可复制）与运行日志
- **参数自动记忆**：所有转换参数保存在浏览器 localStorage，刷新 / 重开自动恢复；隐私模式或存储被禁用时自动降级，不影响使用

### 界面与交互

- 暗色单一强调色设计，控件统一规格；结果列表跨任务保留，"清空"按钮单独清理
- AMV 预设透明化：参数区顶部显示锁定说明，切走时自动恢复之前的参数（刷新后直接进入 AMV 则重置为默认）
- "复制视频流"开启时，分辨率 / 帧率区显示"不生效"提示；GIF / AMV 下该开关禁用并说明原因
- "恢复默认"需二次确认，点击后 2.6 秒内再次点击才生效，同时清除已保存的参数
- 起止时间、自定义尺寸实时校验，错误信息直接显示在对应输入框下方
- 快捷键 `Ctrl + Enter` 开始转换；运行日志可折叠，引擎加载与转码开始时自动展开
- 转换结果提供下载链接，任务卡片显示结果数量

---

## 设备屏幕适配

给 MP3 / MP4 小屏播放器转视频时，先用尺子量出屏幕的宽和高（单位随意，两边一致即可）：

1. 填入长宽 → 自动反推屏幕比例，误差 2.5% 内吸附到最接近的标准比例（4:3 / 16:9 / 3:2 …），否则按实测比例输出
2. 按「长边像素」推荐偶数分辨率（默认 320，覆盖绝大多数廉价播放器；越高越清晰但文件越大）
3. 点「横屏播放」或「竖屏播放」直接写入自定义尺寸，并自动跳到「分辨率 / 缩放」页；缩放方式保持用户自己的选择

说明书里标注了屏幕分辨率（如 320×240）时可勾选「已知设备分辨率」，比例校验一致后直接采用。输入格式为 AMV 时自动收敛到 160×120 以内的容器上限。

---

## AMV 格式说明

AMV 是廉价 MP4 播放器使用的动画格式：RIFF/AVI 变体容器，视频为 MJPEG 变体，音频为单声道 ADPCM。

由于容器限制，转 AMV 时应用会自动处理：

- 视频编码器使用 `amv`（不是普通 mjpeg）
- 音频固定为 `adpcm_ima_amv`、22050 Hz、单声道
- 音频块大小 `block_size = 22050 / 帧率`，因此帧率必须能整除 22050，可选 10 / 14 / 15 / 18 / 21 / 25 / 30 fps，默认 15
- 高度 120 不是 16 的倍数，需要 `-strict -1` 才允许写出
- 默认分辨率 160×120，建议不要超过 224×176，否则部分设备无法解码

---

## 多线程加速

`server.js` 会发送 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`，让页面进入 cross-origin isolated 状态，从而启用 `SharedArrayBuffer`。

- 检测到隔离环境时自动加载 `vendor/core-mt/`（多线程构建），线程数固定为 **4**——这是运行时 pthread 池的上限，超过会死在等线程创建上
- 未检测到隔离（例如用 `npx serve` 等第三方静态服务器打开）时，自动回退 `vendor/core/` 单线程构建
- 多线程运行时启动失败也会自动回退
- 实测：2 秒 720p H.264 转码从 9.1s（单线程）降到 3.9s（4 线程）；GIF 从 20s 降到 7s

---

## 输出体积说明（为什么转出来反而更大）

转码是**按目标质量重新分配码率**，不是"打包压缩"。源文件本身码率越低，越容易在重编码后变大：

- **CRF 模式是画质优先**：默认 CRF 23 接近"视觉无损"，如果源视频只有几百 kbps（长时间录屏、AI 生成短片常见），重编码会把这个画质水平重新"买"回来，输出通常是源文件的 2~4 倍
- **GIF 没有码率概念**：每帧独立压缩 + 256 色 + 抖动，体积只受分辨率和帧率影响，长视频转 GIF 必然暴涨
- **AMV（MJPEG）压缩率有限**：160×120 也要约 300 kbps，10 分钟以上就会超过大部分源文件
- **WAV 是未压缩 PCM**：约 10 MB/分钟（48kHz 立体声）

应用内的对应机制：

- 底栏与命令预览会显示**预估输出体积**（经验模型，误差 ±50%，用于判断"会不会比源文件还大"）
- 预计大于源文件时会给出**体积提醒**，并可一键切换到"体积优先"（CRF 27 · 音频 96k）
- MJPEG / MPEG-4 / AMV 使用 qscale 质量控制，映射曲线已按老编码器的压缩效率校准（CRF 15 → q12，而不是过去偏松的 q10）
- GIF 默认抖动已从 `bayer_scale=5` 降为 `3`，同画质下体积更小

想手动控制体积：提高 CRF（26~30）、切换"目标码率"模式、降低分辨率 / 帧率，或先用起止时间截短片段。

---

## 性能提示

浏览器内转码受单线程 WebAssembly 限制，速度约为实时的 0.3～1 倍。1080p 以上、VP9、GIF 调色板生成都会明显变慢，建议先用短片段试跑。超大文件（> 512 MB）可能触发浏览器内存上限。

---

## 常见问题 FAQ

**Q：转码是离线的吗？会上传文件吗？**
全程在浏览器里用 WebAssembly 跑 FFmpeg，文件不经过任何服务器。唯一的网络请求是首次打开页面时从本地服务加载 32～33 MB 的 wasm 运行时（之后走浏览器缓存）；用 `VideoForge.exe` 时连这个请求也是本地的。

**Q：为什么关掉浏览器窗口后，服务还在跑？**
旧版本只能 Ctrl+C 退出。现在页面与服务端有一条保活长连接，最后一个标签页关闭 3 秒后服务端自动退出；多标签页时全部关闭才退。刷新页面不会误退出。

**Q：exe 被杀毒软件报毒怎么办？**
SEA 打包方式是改写官方 `node.exe` 的签名区注入数据，属于正常现象（同类工具 pkg / nexe 同样如此）。如有误报请添加信任。

**Q：端口被占用？**
默认 5173，被占用时自动往后顺延（最多试 20 个），启动日志里会显示实际地址。也可以用 `node server.js 8888` 或 `VideoForge.exe 8888` 手动指定。

**Q：第一次打开白屏 / 引擎加载失败？**
首次加载需要从本地服务拉取 32～33 MB 的 wasm，耐心等几秒；确认是通过 `http://localhost:端口` 访问而不是 `file://`。多线程加载失败会自动回退单线程，日志里有说明。

**Q：转换结果存在哪里？**
结果只在浏览器内存里，通过下载链接保存。刷新或关闭页面前记得先下载。

**Q：想命令行批量转换？**
本项目是 GUI 优先设计，暂无 CLI 批量模式。可以打开多个标签页并行处理不同文件。

---

## 开发与构建

```bash
npm install        # 安装开发依赖（仅 postject，用于打包）
npm run dev        # 开发模式：启动服务并自动打开浏览器
npm start          # 启动服务（不自动开浏览器）
npm run build      # 打包 dist/VideoForge.exe
```

技术要点：

- `server.js` 零依赖（仅 Node 内置模块），同时是 SEA 单文件版的宿主：检测 `sea.isSea()` 后从内嵌资源读文件，否则读磁盘
- `build.js` 收集 `index.html` + `assets/` + `vendor/` 白名单扩展名文件 → 生成 `sea-config.json` → `node --experimental-sea-config` 生成 blob → 复制 `node.exe` → postject 注入 → 输出 `dist/VideoForge.exe`
- 转码全程在 Web Worker 中执行，主线程不卡顿；日志按 150ms 批量写入 DOM，避免多线程下的高频日志拖死主线程
- 转码过程有看门狗：两分钟无进度会自动中止
- `ffmpeg.wasm` 运行时已本地化到 `vendor/`，离线可用

---

## 发布到 GitHub

仓库里**不包含** `dist/VideoForge.exe`（超过 GitHub 100 MB 单文件限制，已在 `.gitignore` 中排除），发布方式：

```bash
# 1. 提交代码
git add .
git commit -m "release: v1.1.0"
git push

# 2. 打 tag 并创建 Release，把 exe 作为附件上传
gh release create v1.1.0 dist/VideoForge.exe --title "v1.1.0" --notes "首个单文件版"
```

没有 `gh` 也可以在 GitHub 网页端操作：Releases → Draft a new release → 上传 `dist/VideoForge.exe` 作为附件。

> 根目录的测试视频（`.flv` 等）已被 `.gitignore` 排除，不会被提交，也不会打进 exe。

---

## 目录结构

```
index.html              页面结构
start.bat               Windows 一键启动（优先单文件版）
server.js               零依赖静态服务器（SEA 单文件版宿主）
build.js                单文件打包脚本（Node SEA）
assets/styles.css       样式
assets/js/app.js        UI 与状态管理
assets/js/builder.js    ffmpeg 参数与滤镜构建
assets/js/device-fit.js 设备屏幕适配：比例吸附 / 分辨率推荐
assets/js/engine.js     ffmpeg.wasm 封装
assets/js/formats.js    格式 / 编码器 / 预设定义
assets/js/storage.js    参数持久化（localStorage）
vendor/ffmpeg/          ffmpeg.wasm 客户端（ESM）
vendor/core/            ffmpeg-core.js + wasm（单线程）
vendor/core-mt/         ffmpeg-core.js + wasm（多线程）
```

## License

MIT
