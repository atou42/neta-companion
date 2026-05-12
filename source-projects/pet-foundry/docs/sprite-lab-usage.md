# Sprite Lab 使用入口

本文档记录当前 Sprite Lab 的固定访问路径、用途，以及如何启用网页端生成能力。

## 1. 固定公开入口

这些是静态公开页面，适合分享给别人体验。

### 调试器：逐帧对齐 / 调 offset

用于打开 spritesheet、切换动作行、逐帧调 X/Y 偏移、导出 alignment JSON。

```text
https://public.cohub.run/s/7f3cc256-aec1-4673-a01c-456c594424e7/sprite-lab-default/index.html
```

### 运行预览：网页宠物运行态

用于像真实网页宠物一样播放动作、切换动作、自然循环。

```text
https://public.cohub.run/s/7f3cc256-aec1-4673-a01c-456c594424e7/sprite-lab-default/player.html
```

### 默认体验素材

上面两个页面默认加载这个已发布 spritesheet：

```text
https://public.cohub.run/s/7f3cc256-aec1-4673-a01c-456c594424e7/pet-62b095ea-default/spritesheet.webp
```

对应 contact sheet：

```text
https://public.cohub.run/s/7f3cc256-aec1-4673-a01c-456c594424e7/pet-62b095ea-default/contact-sheet.png
```

## 2. 当前临时生成入口

如果要从网页里直接调用本空间的 image2 / hatch-pet 生成能力，需要 Agent Bridge。

当前临时 tunnel 入口不要提交真实 token。启动 Agent Bridge 后，用实际 tunnel 地址和本地生成的 token 替换下面占位符：

```text
https://xxxx.trycloudflare.com/sprite-lab/index.html?api=&apiToken=<TOKEN>
```

运行预览 tunnel 入口：

```text
https://xxxx.trycloudflare.com/sprite-lab/player.html?api=&apiToken=<TOKEN>
```

注意：`trycloudflare.com` 是临时 tunnel，不保证长期固定。如果 tunnel 进程重启，URL 可能变化。

## 3. 重新启动 Agent Bridge

在 Cohub runtime / workspace 中运行：

```bash
cd /workspace
. .venv/bin/activate
[ -f "$HOME/.pet-foundry-image2-env" ] && . "$HOME/.pet-foundry-image2-env"

TOKEN="换成一个随机长字符串"
SPRITE_LAB_API_TOKEN="$TOKEN" \
python scripts/sprite_lab_agent_server.py \
  --host 0.0.0.0 \
  --port 3000 \
  --api-token "$TOKEN"
```

如果使用 Cohub Ports 面板打开 3000 端口，得到公网 URL `<PORT_3000_URL>`，则访问：

```text
<PORT_3000_URL>/sprite-lab/index.html?api=&apiToken=<TOKEN>
```

或者用固定公开调试器页面接这个 API：

```text
https://public.cohub.run/s/7f3cc256-aec1-4673-a01c-456c594424e7/sprite-lab-zh/index.html?api=<PORT_3000_URL>&apiToken=<TOKEN>
```

## 4. 重新创建 Cloudflare 临时 tunnel

如果没有 Cohub 端口公网 URL，可以创建临时 tunnel：

```bash
/tmp/cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate
```

命令会输出一个类似下面的地址：

```text
https://xxxx.trycloudflare.com
```

然后访问：

```text
https://xxxx.trycloudflare.com/sprite-lab/index.html?api=&apiToken=<TOKEN>
```

## 5. 网页端生成流程

在调试器页面左侧填写：

- 角色名称
- 角色描述 / 提示词

点击：

```text
生成 Sheet 并加载
```

后端自动执行：

```text
prepare_pet_run.py
image2 生成 base
image2 生成 9 个动作行
finalize QA
geometry/alignment QA
visual consistency QA
失败行自动重做
auto_align_spritesheet.py
最终 QA
加载 aligned spritesheet
```

## 6. 本地重要脚本

```text
scripts/sprite_lab_agent_server.py       # 网页端 Agent Bridge
scripts/qa_spritesheet_alignment.py      # 几何 / 对齐 QA
scripts/qa_visual_consistency.py         # 视觉一致性 QA
scripts/queue_alignment_repairs.py       # QA 失败行排队重做
scripts/auto_align_spritesheet.py        # 确定性自动对齐
scripts/apply_sprite_lab_alignment.py    # 应用 Sprite Lab 导出的 alignment JSON
```

## 7. 当前已验证

已验证默认素材：

```text
runs/pet-62b095ea/final/spritesheet.auto-aligned.webp
```

通过：

```text
qa_spritesheet_alignment.py
qa_visual_consistency.py
```

运行页点击 E2E：

```text
tests/test_player_click_e2e.mjs
```

运行页动作循环 E2E：

```text
tests/test_player_loop_e2e.mjs
```
