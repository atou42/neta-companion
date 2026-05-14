# Sprite Variant Switching Spec

日期：2026-05-14

目标是在不破坏当前线上稳定 sprite 的前提下，让页面可以加载多张 sprite sheet，并在运行时切换。这个能力服务于当前芙莉莲 sprite 有稳定版、候选修正版、局部实验版并存的场景。线上默认仍使用稳定版，候选版只有在通过结构和视觉验收后才允许进入可选列表。

## 背景

当前页面把 sprite sheet 写死在 `styles.css` 的 `.companion-sprite` 里。它只能加载 `public/foundry/companion-spritesheet.webp?v=20260512-frieren15d`。这让线上验证候选 sprite 很麻烦，要么直接替换稳定资源，要么临时改 CSS。两种方式都容易把未验收的素材推到用户面前。

项目已经有严格的生产合同 `public/foundry/sprite-production.json`。这个合同定义了 15 行、每行 8 帧、单格 192x208、整图 1536x3120 的动作语义。多版本切换不能绕过这个合同。每个可切换版本都必须声明自己符合这个合同，或者明确标记为不可上线的 archive/reference 资源。

## 设计原则

线上默认要稳。没有 manifest、manifest 损坏、候选 sheet 缺失、尺寸不匹配、行列不匹配时，页面继续使用当前稳定版，但错误要在控制台清楚暴露，不能静默假装切换成功。

切换要轻。这个功能只换 sprite sheet，不改动作语义，不改行号，不改播放状态机。所有版本共享当前 `spriteActions` 映射，除非未来另开一个动作合同版本。

验证要可追踪。每个上线候选必须能追到来源、生产 run、hash、QA 预览和验收状态。`output/` 里的探索图不能直接成为线上可选项。

体验要藏得住。普通用户不需要看到实验入口。现有 Tune 面板可以承载选择器，默认折叠。桌面和移动端都能切换，但 UI 不应该抢 FM 主界面的空间。

## 资源合同

新增 `public/foundry/sprite-variants.json` 作为运行时清单。它只负责声明有哪些 sprite 可以被页面加载，不替代 `sprite-production.json`。

清单必须包含 schema、默认版本、版本列表和缓存版本号。默认版本必须存在于版本列表里。版本列表里的每个条目必须包含 id、label、status、sheet、contract、atlas、hash、version 和 source。`status` 只允许 `stable`、`candidate`、`archive`。页面只展示 `stable` 和 `candidate`，`archive` 只给开发和排查使用。

`sheet` 必须是站内相对路径。首期不允许外链 sprite sheet，避免跨域、缓存和隐私问题进入主链路。`contract` 首期固定指向 `public/foundry/sprite-production.json`。`atlas` 必须和合同一致。`hash` 使用 sha256，部署前由脚本校验，运行时只做信息展示和排查，不在浏览器里重新算整图 hash。

稳定版条目指向当前线上资源 `public/foundry/companion-spritesheet.webp`。候选版只有当资源已放入 `public/foundry/variants/<id>/companion-spritesheet.webp`，并且对应 QA 材料可追踪时，才进入清单。

## 前端行为

CSS 里的固定 `background-image` 要改成 CSS 变量或由 JS 设置。默认 CSS 仍指向稳定版，保证 JS 失败时页面能显示 sprite。

页面启动时先用稳定版渲染，再异步加载 `sprite-variants.json`。manifest 成功后，读取本地保存的 variant id。保存值存在且版本可展示时切过去；否则继续使用默认版本。

切换时只更新 `.companion-sprite` 的背景图地址。动作行、帧序号、播放速度、点击反馈、拖拽、走动、FM 联动全部保持当前状态。切换过程中不重置当前 FM，不重置播放状态，也不重置 sprite 调参。

切换前要预加载新图。预加载成功后再替换背景图，避免一瞬间空白。预加载失败时保持旧图，Tune 面板里给出短反馈，控制台输出失败路径和 variant id。

切换成功后保存到 `localStorage`，key 使用 `netaSpriteVariant`。这个保存只影响当前浏览器。线上默认不因为某个用户选择候选版而改变。

## Tune 面板

现有 Tune 面板新增一个 Sprite 版本选择控件。控件放在尺寸和速度调节之前，因为版本选择比参数调节更基础。

选项显示 label 和状态。稳定版显示 `Stable`，候选版显示 `Candidate`。候选版不使用警告文案吓用户，但要让状态可见。当前选中的版本需要有明确选中态。

当 manifest 没加载成功时，选择控件隐藏，现有调参功能不受影响。当 manifest 加载成功但只有一个可展示版本时，选择控件也可以隐藏，避免无意义 UI。

## 校验和脚本

新增或扩展脚本校验 `sprite-variants.json`。校验内容包括 JSON schema、默认版本存在、id 唯一、路径存在、路径站内、状态合法、合同一致、atlas 尺寸一致、图片真实尺寸一致、sha256 一致。

这个脚本要能单独运行，也要能作为部署前检查的一部分运行。失败时直接退出非零，不允许生成 fallback 清单或自动改写坏数据。

现有 `scripts/validate_sprite_production.py` 继续负责单个生产 run 和单张 sheet 的生产质量。新的 variants 校验只负责“这张图能不能被线上清单引用”。二者不是替代关系。

## 候选资源晋级规则

候选 sprite 进入线上可选列表前，必须通过结构校验、图片尺寸校验、合同一致性校验、黑底/暖色/房间背景合成预览、真实页面桌面和移动端播放验收。

如果候选版只解决某一行，比如只修 poke 或只修 playing，它不能作为完整 variant 上线，除非已经被合成进完整 15 行 sheet 并重新验收。局部实验可以保留在 `output/`，但不能写进 `sprite-variants.json`。

如果候选版在白边、脏边、帧漂移、低质量动作上有明显问题，即使尺寸合格，也只能留在 `output/` 或 archive，不进入用户可选列表。

## 验收标准

页面默认打开时显示稳定版 sprite。禁用 JS 或 manifest 404 时仍显示稳定版。manifest 正常时 Tune 面板可以看到可展示版本。切换到候选版后，当前动作不中断，页面不白屏，刷新后仍保持用户选择。

桌面端要验证 ready、playing、paused、switching、loading、error、grabbed、walk、poke 这些动作在切换前后都能播放。移动竖屏要验证 sprite 仍在可视区域内，Tune 面板不挤坏 FM 主流程。

拖拽性能不能因为多版本能力变差。切换功能不能在 pointermove 中读 manifest、创建 Image、读布局或写大量样式。拖拽期间只允许沿用当前已加载 sheet。

部署前必须确认根目录源文件和 `dist/` 一致。线上验证要打开 `https://neta.atou.cc/`，确认实际加载的是新 manifest，默认版本仍是稳定版。

## 非目标

这个规格不负责重新生成芙莉莲 sprite，不负责设计新的舞蹈动作，不负责把候选图自动抠图，不负责 Discord 文件发送，也不负责给每个动作单独热切换素材。

这个规格也不做远程用户上传 sprite。未来如果允许用户上传，需要另写权限、存储、尺寸校验、内容安全和缓存隔离方案。

## 推荐实现顺序

先把稳定版 manifest 和前端加载链路做出来，只放当前稳定版。确认 JS 失败和 manifest 失败都不会影响默认显示。

再加入候选目录和校验脚本，把目前最干净的完整候选 sheet 作为 candidate，但不设为默认。

最后把 Tune 面板接入切换控件，补桌面和移动端浏览器验收。

## 自检结论

本规格聚焦运行时多版本能力，没有把素材重做和播放器改造混进同一项。默认稳定、候选可切、坏数据暴露、部署可验收这四件事是主线。实现时不需要改动现有 sprite 动作合同，也不需要改变 FM 状态机。
