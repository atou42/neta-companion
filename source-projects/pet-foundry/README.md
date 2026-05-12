# Pet Foundry

Pet Foundry 是 agent-neutral 的 companion / character asset toolkit。

它不绑定 Codex。Codex pet 是第一个 profile，也是当前最佳实践样板。你可以用 Codex、Claude Code、Pi，或者任何能读写文件和运行 Python 的 agent 来用它。

最小 effort：先用 synthetic 自测跑一遍，不需要图片模型，不需要 OpenAI API Key。

```bash
python3 -m pip install -r requirements.txt
python scripts/run_faithful_pet_acceptance.py
```

跑完后，你第一个能拿到的是一套可检查的 pet spritesheet 产物：

```text
validation/faithful-pet/synthetic-run/final/spritesheet.webp
validation/faithful-pet/synthetic-run/final/validation.json
validation/faithful-pet/synthetic-run/qa/review.json
validation/faithful-pet/synthetic-run/qa/contact-sheet.png
```

这一步只是证明工具链能跑通。真正做一个新 companion 或 character asset 时，才需要图片生成能力。项目可以直接调用 image2，也可以接收 Codex `$imagegen` 或其他外部产物。完整路线是先生成 canonical base，再逐行生成动画横条，记录原始生成来源，finalize 成 `spritesheet.webp`，最后包装成通用 companion 包。需要 Codex 时，再额外导出 Codex 兼容的 `pet.json + spritesheet.webp`。

Pet Foundry 不是任何 agent 的运行时，也不包含内置宠物资源。它负责资产生产：用 hatch-pet 的角色生成纪律，减少角色在不同动画行里漂移；再用 Asset Forge 桥接层把结果变成可追踪、可校验、可导出的资产包。

## 最快拿到可用包

如果已经有一个完成 finalize 的 hatch-pet run，可以直接包装：

```bash
./scripts/build_companion_asset_package.py build \
  --run-dir runs/starry \
  --output-dir runs/starry-asset-package

./scripts/build_companion_asset_package.py validate \
  runs/starry-asset-package
```

通用 companion 包在这里：

```text
runs/starry-asset-package/exports/companion/
├── companion.json
└── spritesheet.webp
```

Codex 特例导出在这里：

```text
runs/starry-asset-package/exports/codex-pet/
├── pet.json
└── spritesheet.webp
```

把这个目录复制到 `${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/`，Codex App 就能读取这个自定义 pet。

对其他 agent，不需要复制到 Codex 目录。直接读取 `exports/companion/companion.json` 和同目录的 `spritesheet.webp` 即可。

## 目录说明

```text
asset_forge/
  faithful_pet.py          # hatch-pet vendored 目录定位和规格检查
  image2_runner.py         # image2 调用、结果校验、hatch-pet job 记录适配
  companion_bridge.py      # 通用 companion 包 CLI 入口
  hatch_pet_bridge.py      # 把 finalized hatch-pet run 包成通用 companion 资产包
  validator.py             # 少量 hash / JSON / 校验工具

scripts/
  run_faithful_pet_acceptance.py      # synthetic 自测
  run_image2.py                       # 直接调用 image2，拿图片和 provider metadata
  generate_hatch_pet_image2_job.py    # 按 imagegen-jobs.json 调 image2 并记录结果
  apply_sprite_lab_alignment.py       # 应用 Sprite Lab 导出的逐帧 offset 对齐 JSON
  auto_align_spritesheet.py           # 对 finalized spritesheet 做自动几何对齐
  open_sprite_lab.py                  # 为生成好的 spritesheet 启动/输出 Sprite Lab 预加载 URL
  qa_spritesheet_alignment.py         # spritesheet 几何 / 对齐 QA
  qa_visual_consistency.py            # 行间视觉一致性 QA
  queue_alignment_repairs.py          # QA 失败行排队重做
  sprite_lab_agent_server.py          # 本地网页 Agent Bridge：从 Sprite Lab 触发生成/finalize/load run
  build_companion_asset_package.py    # 通用 companion 包 build / validate
  build_hatch_pet_asset_package.py    # 旧入口，保留兼容

web/sprite-lab/
  index.html                          # sheet 预览、动作播放、逐帧对齐和导出工具
  player.html                         # 网页宠物运行态预览
  sprite-core.js                      # Sprite Lab 布局和 alignment JSON 纯逻辑

vendor/openai-skills/hatch-pet/
  OpenAI hatch-pet skill 本地版本

tests/
  test_faithful_pet.py
```

## 环境要求

需要 Python 3.10 或更新版本。

安装依赖：

```bash
python3 -m pip install -r requirements.txt
```

如果要生成动画预览视频，需要安装 `ffmpeg`：

```bash
brew install ffmpeg
```

## 环境变量

`CODEX_HOME` 可选。不设置时默认是 `~/.codex`。它会影响 Codex 本地图片生成目录和最终 pet 安装目录。

```bash
export CODEX_HOME="$HOME/.codex"
```

`TALESOFAI_IMAGE_API_KEY` 用于项目内置 image2 调用。正常只需要配这个。

```bash
export TALESOFAI_IMAGE_API_KEY="你的 Tales of AI image API Key"
```

`OPENAI_API_KEY` 只在使用 hatch-pet 的备用图片生成脚本时需要。正常用 Codex 的 `$imagegen` 或 image2 时，不一定需要它。

```bash
export OPENAI_API_KEY="你的 OpenAI API Key"
```

## 典型流程

先创建一次 hatch-pet run：

```bash
python vendor/openai-skills/hatch-pet/scripts/prepare_pet_run.py \
  --pet-name "Starry" \
  --description "A compact star-sea academy digital pet." \
  --pet-notes "small pixel-art-adjacent mascot, starry academy theme" \
  --output-dir runs/starry \
  --force
```

查看下一步要生成什么：

```bash
python vendor/openai-skills/hatch-pet/scripts/pet_job_status.py \
  --run-dir runs/starry
```

按 `imagegen-jobs.json` 里的 prompt 和 input images 生成 base 和每一行 row strip。用内置 image2 路线时，脚本会生成图片、校验 provider metadata，并自动调用 `record_imagegen_result.py` 记录。

先跑 base：

```bash
python scripts/generate_hatch_pet_image2_job.py \
  --run-dir runs/starry \
  --job-id base \
  --output-dir provider-runs/starry/image2/base \
  --force
```

row strip 需要参考图。image2 当前接收的是 http(s) 图片 URL，所以本地 `references/...` 和 `decoded/base.png` 要提供 URL 映射：

```json
{
  "references/layout-guides/idle.png": "https://example.com/starry/idle-guide.png",
  "references/canonical-base.png": "https://example.com/starry/canonical-base.png",
  "decoded/base.png": "https://example.com/starry/base.png"
}
```

然后生成某一行：

```bash
python scripts/generate_hatch_pet_image2_job.py \
  --run-dir runs/starry \
  --job-id idle \
  --output-dir provider-runs/starry/image2/idle \
  --input-url-map runs/starry/input-url-map.json \
  --force
```

只想直接调用 image2，不绑定 hatch-pet job：

```bash
python scripts/run_image2.py \
  --prompt "A compact star-sea academy companion sprite." \
  --output-dir provider-runs/starry/image2/freeform
```

默认走项目内置 image2 客户端，不需要配置外部 CLI 路径。老环境要强制使用已有 `image2.py` 时，可以临时加 `--image2-cli /path/to/image2.py`。

如果不用内置 image2，也可以继续手动记录外部产物。

内置 Codex imagegen 路径示例：

```bash
python vendor/openai-skills/hatch-pet/scripts/record_imagegen_result.py \
  --run-dir runs/starry \
  --job-id base \
  --source "$CODEX_HOME/generated_images/.../ig_....png"
```

如果使用 image2 产物，要带上 provider metadata：

```bash
python vendor/openai-skills/hatch-pet/scripts/record_imagegen_result.py \
  --run-dir runs/starry \
  --job-id idle \
  --source /path/to/image2-output.png \
  --provider image2 \
  --provider-metadata /path/to/image2-response.json
```

所有 job 完成后 finalize：

```bash
python vendor/openai-skills/hatch-pet/scripts/finalize_pet_run.py \
  --run-dir runs/starry
```

finalize 会生成：

```text
runs/starry/final/spritesheet.webp
runs/starry/final/validation.json
runs/starry/qa/review.json
runs/starry/qa/contact-sheet.png
runs/starry/qa/videos/
```

## 包装成 Asset Forge 资产包

完成 hatch-pet run 后，使用桥接 CLI：

```bash
./scripts/build_companion_asset_package.py build \
  --run-dir runs/starry \
  --output-dir runs/starry-asset-package

./scripts/build_companion_asset_package.py validate \
  runs/starry-asset-package
```

包装后的目录大致是：

```text
runs/starry-asset-package/
├── contract.json
├── asset.manifest.json
├── sources/hatch-pet/
├── neutral/images/spritesheet.webp
├── neutral/data/atlas.json
├── neutral/data/animations.json
├── qa/
├── previews/contact-sheet.png
└── exports/
    ├── companion/
    │   ├── companion.json
    │   └── spritesheet.webp
    └── codex-pet/
        ├── pet.json
        └── spritesheet.webp
```

`exports/companion/` 是通用出口。`exports/codex-pet/` 是 Codex App 的兼容出口，可以直接复制到：

```text
${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/
```

## Sprite Lab

Sprite Lab 是一个本地网页工具，用来预览和微调 spritesheet。它可以加载 PNG / WebP / JPG sheet，按行配置动作，支持单行一个动作的 sheet，也支持同一张 sheet 内不同动作行有不同帧数。

启动：

```bash
npm run serve:sprite-lab
```

打开：

```text
http://127.0.0.1:4177
```

页面里可以播放当前动作，选择任意帧做 X/Y 位置微调。画布会显示同一动作其他帧的虚影、坐标轴和刻度线。调好后可以导出新的 PNG sheet，也可以导出 alignment JSON。

运行态预览页面：

```text
http://127.0.0.1:4177/player.html
```

网页端生成 / Agent Bridge / 对齐后处理说明见：

```text
docs/sprite-lab-usage.md
```

## 关键规则

不要直接生成整张最终 atlas 当作正式路径。正常路径是先 base，再逐行生成状态动画。

不要用本地脚本补画缺失动作、伪造 row strip、手改 `imagegen-jobs.json`。视觉来源必须通过 `record_imagegen_result.py` 记录。

默认不接受 synthetic test source。只有测试和调试时才应该加 `--allow-synthetic-sources`。

unused cell 必须完全透明。used cell 不能是空的。review 和 final validation 必须通过。

## 自测

运行 synthetic acceptance：

```bash
python scripts/run_faithful_pet_acceptance.py
```

运行测试：

```bash
python3 -m unittest tests/test_faithful_pet.py -v
```

测试会覆盖 vendored hatch-pet 契约、image2 provenance、finalize 校验、桥接打包、默认拒绝 synthetic source、拒绝脏 unused cell。

## 许可证

vendored `hatch-pet` 保留原 Apache-2.0 许可证，见 `vendor/openai-skills/hatch-pet/LICENSE.txt`。
