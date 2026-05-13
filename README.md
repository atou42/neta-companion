# Neta Companion

Neta Companion 是一个单页网页陪伴项目，线上地址是：

```text
https://neta.atou.cc/
```

它把三个原本分开的方向合成在同一个房间里：

- `CuiMao`：左侧主视觉。保留 360 凝视、鼠标跟随和移动端看向 sprite 的行为。
- `Neta FM`：右侧播放器。包含黑胶唱片、真实音频频谱、播放进度、播放控制、随机播放、循环模式和队列。
- `pet-foundry sprite`：全屏浮层桌宠。当前角色是芙莉莲方向的 chibi sprite，会跟随 FM 状态播放不同动作，也可以拖拽、点击和偶发走动。

项目目标不是做三个并排 tab，而是做一个可陪伴、可工作、可学习的房间感网页。CuiMao 是空间里的注视者，Neta FM 是房间里的电台，sprite 是会在画面里活动的小伙伴。

## 运行方式

这是静态项目，没有前端构建步骤。根目录的 `index.html`、`styles.css`、`app.js` 是源文件，`dist/` 是 Cloudflare Workers Static Assets 的部署目录。

本地预览：

```bash
python3 -m http.server 8088
```

打开：

```text
http://127.0.0.1:8088/
```

部署前同步源文件到 `dist/`：

```bash
rsync -a index.html styles.css app.js public dist/
```

部署：

```bash
wrangler deploy --config wrangler.jsonc
```

## 目录说明

```text
index.html                  页面结构
styles.css                  页面布局、视觉和动画
app.js                      播放器、sprite、CuiMao 凝视和交互逻辑
public/cuimao/              CuiMao 主视觉资源
public/fm/playlist.json     Neta FM 当前歌单
public/foundry/             上线 sprite sheet 和生产契约
public/sprite-lab/          sprite 调试工具，不在主界面露出
dist/                       Cloudflare 部署目录
docs/sprite-production-flow.md  sprite 生产流程
source-projects/            原始参考项目归档
```

## 关键交互

桌面端鼠标在左侧 360 区域时，CuiMao 跟随鼠标；鼠标进入右侧 FM 区域时，CuiMao 看向 sprite。移动端没有鼠标，所以默认看向 sprite。

FM 播放器支持底部按钮控制，也支持点击黑胶唱针播放和暂停。波形图使用浏览器音频分析器读取当前 BGM 的频率数据，播放时是真实跟着音频变化，不是固定装饰。

Sprite 会响应 FM 状态。播放中会听歌、轻舞、偶发走动；暂停时安静；切歌时施法；加载时调频；错误时信号丢失；拖拽时是被拎起的动作；点击时会切换动作或给反馈。

## 给 Agent 的修改指南

先读这份 README，再看 `docs/sprite-production-flow.md`。不要只看单个文件就开始改，因为这个项目的体验来自页面、音频、sprite 和部署目录一起协作。

修改页面时，通常要同时改根目录源文件和 `dist/`。如果改了 `index.html`、`styles.css`、`app.js` 或 `public/` 资源，部署前要确认 `dist/` 里也同步了同样内容。这个项目没有打包器，不能假设构建命令会自动处理。

不要把 `output/` 里的临时探索材料默认加入提交。只有当它是可复现生产流程、验收证据或当前线上资源来源时，才应该提交。分享截图、临时 mock、波形探索图这类材料不要混进主线。

不要绕过 sprite 生产流程。上线 sprite sheet 是 `public/foundry/companion-spritesheet.webp`，生产契约是 `public/foundry/sprite-production.json`。替换 sprite 之前必须走 `docs/sprite-production-flow.md` 里的流程，保留 provider 原图、提示词、抠图、对齐、QA 预览和 manifest。不要用白底、透明底、手工补格子或概念图直接替换上线 sheet。

改 FM 歌单时，`public/fm/playlist.json` 和 `dist/fm/playlist.json` 要一致。歌单里的 `mood`、`tempo`、`energy`、`vocalType` 会影响播放器视觉和未来分类，不要随意删字段。音频链接必须能被浏览器播放，并且最好允许跨域音频分析，否则实时波形会退回非真实模式。

改播放器或 sprite 交互后，要用真实浏览器验证。至少检查桌面宽屏、移动竖屏、播放、暂停、切歌、拖拽 sprite、点击 sprite、黑胶唱针播放/暂停、实时波形和队列显示。只跑静态语法检查不够。

推荐的最小检查：

```bash
node --check app.js
python3 -m http.server 8088
```

然后用浏览器打开本地页面，实际点一遍主流程。部署后再打开线上地址确认资源不是旧缓存。

## 部署信息

当前部署方式是 Cloudflare Workers Static Assets，配置在 `wrangler.jsonc`。线上域名是：

```text
https://neta.atou.cc/
```

Git 远端：

```text
Gitea:  https://git.talesofai.com/neta/neta-companion
GitHub: https://github.com/atou42/neta-companion
```
