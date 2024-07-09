@echo off
echo "======================================"
echo "begin build electron applications"
echo "======================================"
electron-vite build
echo "======================================"
echo "copy file to out dir"
echo "======================================"
.\copyfile.bat
echo "======================================"
echo "run electron dev"
echo "======================================"
electron-vite dev
