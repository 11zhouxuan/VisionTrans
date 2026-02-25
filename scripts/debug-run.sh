#!/bin/bash
# VisionTrans Debug 模式运行脚本
# 用法: ./scripts/debug-run.sh
# 
# 这个脚本会构建并安装应用，然后从终端启动它，
# 这样所有的 eprintln! 日志都会输出到终端。
# 
# 日志标签:
#   [wordbook]     - 单词本服务层日志
#   [wordbook-cmd] - 单词本命令层日志

set -e

echo "🔄 停止旧进程..."
pkill -f "VisionTrans" 2>/dev/null || true
sleep 1

echo "🗑️  删除旧 app..."
rm -rf /Applications/VisionTrans.app

echo "🔧 重置截图权限..."
tccutil reset ScreenCapture com.visiontrans.desktop 2>/dev/null || true

echo "🏗️  构建 release..."
pnpm tauri build 2>&1

echo "📦 安装到 Applications..."
cp -R src-tauri/target/release/bundle/macos/VisionTrans.app /Applications/VisionTrans.app

echo ""
echo "🚀 以 Debug 模式启动（日志输出到终端）..."
echo "================================================"
echo "  按 Ctrl+C 停止应用"
echo "  所有 [wordbook] 日志会显示在下方"
echo "================================================"
echo ""

# 直接运行二进制文件，这样 stderr 会输出到终端
/Applications/VisionTrans.app/Contents/MacOS/VisionTrans 2>&1
