# Neta Is Watching You

这是一个纯静态网页：移动鼠标时，画面里的角色会跟着鼠标看；鼠标本身被换成了土豆图标。

当前版本已经做过这些定制：

- 角色：Neta 风格人物
- 背景：暖色手绘桌面、视线追踪、纸张、箭头、爱心元素
- 鼠标：土豆图标
- 标题：`Neta`
- 人物漂移：已做逐帧稳定

## 搬到别的地方玩，需要带哪些文件

只要想打开网页玩，带下面 5 个文件就够了：

| 文件 | 必须 | 用途 |
| --- | --- | --- |
| `index.html` | 是 | 网页本体，HTML、样式、交互逻辑都在里面 |
| `sprite.webp` | 是 | 人物 121 帧雪碧图，负责视线跟随 |
| `frame_front.webp` | 是 | 鼠标靠近人物中心时显示的高清正面图 |
| `bg.png` | 是 | 背景图 |
| `cursor.png` | 是 | 土豆鼠标图标 |

这 5 个文件必须放在同一个目录里。直接双击 `index.html` 一般也能打开；更稳的方式是在这个目录启动一个本地服务：

```bash
python3 -m http.server 8017
```

然后打开：

```text
http://localhost:8017/
```

如果要把制作流程也一起带走，建议再带上这些文件：

| 文件 | 用途 |
| --- | --- |
| `README.md` | 这份说明 |
| `source-video.mp4` | 当前人物源视频，重新生成 `sprite.webp` 时会用到 |
| `build_sprite.py` | 从源视频生成人物雪碧图 |
| `stabilize_frames.mjs` | 逐帧稳定脚本，用来减少人物漂移 |

`圆形360角度-绿幕.mov` 是原项目里留下来的旧素材。当前网页不依赖它。想精简项目时可以不带。

## 当前文件说明

| 文件 | 当前作用 |
| --- | --- |
| `index.html` | 主页面。里面包含标题、背景、人物、鼠标、角度映射、调试面板 |
| `bg.png` | 当前背景图 |
| `cursor.png` | 当前土豆鼠标图标 |
| `sprite.webp` | 当前人物动作图。11×11，共 121 帧 |
| `frame_front.webp` | 正面高清图 |
| `source-video.mp4` | 当前人物源视频，约 5 秒、24fps、121 帧 |
| `build_sprite.py` | 生成 `sprite.webp` 和 `frame_front.webp` |
| `stabilize_frames.mjs` | 生成过程中自动把人物居中，减少漂移 |

## 实现原理

网页不直接播放视频。

它会先把人物视频处理成一张大图 `sprite.webp`。这张图里有 121 个小格子，每个小格子是一帧人物方向。

鼠标移动时，页面会做三件事：

1. 算出鼠标相对于人物中心的角度
2. 按 `index.html` 里的 `ANGLE_KEYS` 找到最接近的帧
3. 改变 `sprite.webp` 的显示位置，让人物切到对应方向

鼠标靠近人物中心时，会额外显示 `frame_front.webp`。这样正面凝视更清楚。

## 重新制作一个人物的 SOP

### 1. 准备人物视频

最理想的视频是：

- 角色站在画面中心
- 绿色纯色背景
- 角色从正面开始，依次看向右、下、左，再回到正面
- 角色身体不要明显平移
- 画面比例 1:1
- 分辨率至少 640×640
- 时长 5 到 10 秒都可以

如果视频超过 121 帧也没问题。脚本会自动从整段视频里均匀抽成 121 帧。

生成视频时，提示词要强调：

```text
Anime girl character on a perfectly flat pure green chroma key background.
The character remains locked in the exact same body position and scale.
Only the head, pupils, and gaze direction move.
No camera movement, no zoom, no body drifting, no background texture.
The character starts facing front, then slowly looks to screen right, then down, then screen left, then returns to front.
Keep the full upper body visible, centered, stable, clean edges.
```

如果右下角、左下角这种方向不准，要在提示词里补得更明确：

```text
Include clear diagonal gaze poses: upper right, lower right, lower left, upper left.
When looking lower right, the pupils must visibly point toward the lower right corner, not just screen right.
```

### 2. 放入源视频

把新视频放到项目目录。可以直接覆盖：

```bash
cp /path/to/your-video.mp4 source-video.mp4
```

也可以保留原文件名，然后运行脚本时指定它。

### 3. 生成人物雪碧图

运行：

```bash
python3 build_sprite.py source-video.mp4
```

它会生成两个文件：

- `sprite.webp`
- `frame_front.webp`

脚本内部会做这些事：

1. 用 `ffmpeg` 抠掉绿幕
2. 均匀抽取 121 帧
3. 调整一点饱和度和对比度
4. 调用 `stabilize_frames.mjs` 稳定人物位置
5. 拼成 11×11 的 `sprite.webp`
6. 取第一帧生成高清正面图 `frame_front.webp`

需要本机有：

```bash
ffmpeg
python3
node
sharp
```

如果 `node stabilize_frames.mjs` 报找不到 `sharp`，在项目目录安装一次：

```bash
npm install sharp
```

### 4. 本地预览

启动服务：

```bash
python3 -m http.server 8017
```

打开：

```text
http://localhost:8017/
```

调试时建议打开：

```text
http://localhost:8017/?debug=1
```

页面快捷键：

| 操作 | 用途 |
| --- | --- |
| `D` | 显示或隐藏调试信息 |
| `C` | 显示或隐藏校准面板 |
| `←` / `→` | 微调整体角度 |
| `Shift + ←` / `Shift + →` | 大幅微调整体角度 |
| `0` | 恢复默认角度 |

也可以用 URL 固定偏移：

```text
http://localhost:8017/?offset=8
```

### 5. 校准眼神方向

最重要的是改 `index.html` 里的 `ANGLE_KEYS`。

当前角度规则是：

- 正上方：`0°`
- 右侧：`90°`
- 下方：`180°`
- 左侧：`270°`

`ANGLE_KEYS` 的意思是：

```js
[鼠标角度, 使用哪一帧]
```

比如：

```js
[90, 36]
```

意思是鼠标在正右侧时，显示第 36 帧。

如果某个方向看起来没对上，先打开调试：

```text
http://localhost:8017/?debug=1
```

移动鼠标到问题位置，看页面显示的 `frame`。然后判断：

- 如果这一帧本身眼神就不够准，是源视频问题
- 如果附近有更准的帧，是 `ANGLE_KEYS` 可以调
- 如果全程都整体偏一点，用 `offset` 或键盘左右键调

当前这版有一个已知点：右侧偏右下的一小段，源视频本身眼神下看的幅度不够，所以不是坐标算错。要最自然，需要重新生成视频时加强“lower right gaze”。

### 6. 更换背景图

直接替换：

```text
bg.png
```

建议尺寸：

- 16:9 或接近网页横屏比例
- 主体留在四周，中间尽量干净
- 不要让背景中间太花，否则会抢人物

替换后刷新页面即可。

如果浏览器缓存旧图，可以把 `index.html` 里的引用改成带版本号：

```css
background: var(--bg-fallback) url('bg.png?v=2') no-repeat center / cover fixed;
```

### 7. 更换鼠标图标

直接替换：

```text
cursor.png
```

建议：

- PNG 透明背景
- 96×96 左右
- 主体不要贴边
- 不要带纯黑边框残留

如果换图后浏览器还显示旧图，在 `index.html` 里改版本号：

```css
background-image: url('cursor.png?v=3');
```

当前土豆图标曾经出现过左右黑边，原因是 PNG 左右边缘有不透明黑色像素。已经清理过。

### 8. 发布或分享

如果只是发给别人本地玩，压缩这 5 个文件即可：

```text
index.html
sprite.webp
frame_front.webp
bg.png
cursor.png
```

如果放到 GitHub Pages 或任意静态网站，也只需要这 5 个文件。

开发素材和脚本可以不公开：

```text
source-video.mp4
build_sprite.py
stabilize_frames.mjs
圆形360角度-绿幕.mov
```

## 常见问题

### 人物漂移怎么办

先重新跑：

```bash
python3 build_sprite.py source-video.mp4
```

这个脚本会调用 `stabilize_frames.mjs` 做稳定。

如果还是漂，通常是视频里身体姿态变化太大。脚本只能修平移，不能修身体变形。

### 某个角度眼神不准怎么办

先判断是代码问题还是素材问题。

打开：

```text
http://localhost:8017/?debug=1
```

看问题位置对应的 `frame`。

如果源视频那一帧本来就没看准，就需要重生成视频。

如果源视频里有更合适的帧，就改 `ANGLE_KEYS`。

### 视频是 10 秒，会不会帧数太多

不会。

`build_sprite.py` 固定输出 121 帧。视频越长，脚本只是抽帧间隔更大，最后网页使用的仍然是 121 帧。

### 页面更新后没变化

多半是浏览器缓存。

解决方式：

1. 强刷新页面
2. 或者给资源加版本号，例如 `cursor.png?v=4`

### 打开页面只有加载圈

检查这几个文件是不是和 `index.html` 放在同一个目录：

```text
sprite.webp
frame_front.webp
bg.png
cursor.png
```

也可以用本地服务打开，不要直接用文件路径：

```bash
python3 -m http.server 8017
```

## 当前发布包清单

最小发布包：

```text
index.html
sprite.webp
frame_front.webp
bg.png
cursor.png
```

完整制作包：

```text
index.html
sprite.webp
frame_front.webp
bg.png
cursor.png
README.md
source-video.mp4
build_sprite.py
stabilize_frames.mjs
```

旧素材可选：

```text
圆形360角度-绿幕.mov
```
