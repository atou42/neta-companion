"""
从绿幕视频生成 sprite.webp 和 frame_front.webp。

用法：
    python3 build_sprite.py [视频路径]
    默认: source-video.mp4

抠图逻辑全部用 ffmpeg 滤镜完成，无需任何 Python 图像处理：
    chromakey  → 把绿色背景抠成 alpha=0
    eq         → 饱和度 +20%、对比度 +5%（让嘴唇/皮肤更红润）
    fps        → 从整段视频均匀抽到 121 帧
    tile       → 把所有帧拼成 11×11 的雪碧图
    libwebp    → 输出带 alpha 通道的 webp
"""
import subprocess
import sys
import os
import shutil
import tempfile

VIDEO = sys.argv[1] if len(sys.argv) > 1 else 'source-video.mp4'
GREEN_HEX = '0x01BE0A'  # 当前视频绿幕背景颜色 (实测)
COLS = 11
ROWS = 11
TARGET_FRAMES = COLS * ROWS


def run(cmd):
    print('$', ' '.join(cmd))
    subprocess.run(cmd, check=True)


def get_duration():
    out = subprocess.check_output([
        'ffprobe',
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=duration',
        '-of', 'default=nokey=1:noprint_wrappers=1',
        VIDEO,
    ], text=True).strip()
    duration = float(out)
    if duration <= 0:
        raise ValueError(f'Invalid video duration: {duration}')
    return duration


def build_sprite():
    duration = get_duration()
    target_fps = TARGET_FRAMES / duration
    temp_root = tempfile.mkdtemp(prefix='cuimao-build-')
    raw_dir = os.path.join(temp_root, 'raw')
    stable_dir = os.path.join(temp_root, 'stable')
    os.makedirs(raw_dir)
    try:
        run([
            'ffmpeg', '-y', '-i', VIDEO,
            '-vf', (
                f'chromakey=color={GREEN_HEX}:similarity=0.22:blend=0.06,'
                f'eq=saturation=1.20:contrast=1.05,'
                f'fps=fps={target_fps:.8f},'
                f'trim=end_frame={TARGET_FRAMES},'
                f'setpts=N/FRAME_RATE/TB,'
                f'format=rgba'
            ),
            '-frames:v', str(TARGET_FRAMES),
            os.path.join(raw_dir, 'frame_%03d.png'),
            '-loglevel', 'error',
        ])
        run([
            'node',
            'stabilize_frames.mjs',
            raw_dir,
            stable_dir,
            str(TARGET_FRAMES),
        ])
        run([
            'ffmpeg', '-y',
            '-framerate', '24',
            '-i', os.path.join(stable_dir, 'frame_%03d.png'),
            '-vf', f'tile={COLS}x{ROWS}',
            '-frames:v', '1',
            '-c:v', 'libwebp',
            '-quality', '92',
            '-compression_level', '6',
            'sprite.webp',
            '-loglevel', 'error',
        ])
        run([
            'ffmpeg', '-y',
            '-i', os.path.join(stable_dir, 'frame_001.png'),
            '-vf', 'scale=1440:1440:flags=lanczos,format=yuva420p',
            '-frames:v', '1',
            '-c:v', 'libwebp',
            '-lossless', '1',
            'frame_front.webp',
            '-loglevel', 'error',
        ])
    finally:
        shutil.rmtree(temp_root)
    print(f'  sprite.webp = {os.path.getsize("sprite.webp")/1e6:.2f} MB')
    print(f'  frame_front.webp = {os.path.getsize("frame_front.webp")/1e6:.2f} MB')


if __name__ == '__main__':
    print(f'Building sprite from {VIDEO}...')
    build_sprite()
    print('Done.')
