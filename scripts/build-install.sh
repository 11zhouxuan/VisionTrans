#!/bin/bash
# VisionTrans 一键构建安装脚本
# 用法: ./scripts/build-install.sh

set -e

echo "🔄 停止旧进程..."
pkill -f visiontrans 2>/dev/null || true
sleep 1

echo "🗑️  删除旧 app..."
rm -rf /Applications/VisionTrans.app

echo "🔧 重置截图权限（避免每次重新授权）..."
# 重置 TCC 数据库中的屏幕录制权限（需要 sudo）
# 注意：这会重置所有应用的屏幕录制权限
# tccutil reset ScreenCapture 2>/dev/null || true
# 更精确的方式：只重置 VisionTrans 的权限
tccutil reset ScreenCapture com.visiontrans.desktop 2>/dev/null || true

echo "🏗️  构建 release..."
source ~/.cargo/env 2>/dev/null || true
pnpm tauri build

echo "📦 安装到 Applications..."
cp -R src-tauri/target/release/bundle/macos/VisionTrans.app /Applications/VisionTrans.app

echo "🚀 启动应用..."
open /Applications/VisionTrans.app

echo "✅ 完成！请在系统弹窗中授予屏幕录制权限。"
