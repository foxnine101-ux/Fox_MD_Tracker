@echo off
rem 開発用: ソースから起動し、データは リポジトリの外の F:\Claude\Fox_dev_data\Fox_MD_Tracker に置く(設定・記録・ラトリオなど)。
rem 本物の exe(Desktop)とは同時に動かせない(二重起動の防止)。先に本物の exe を終了してから。
rem 本番用 exe の更新は、これでは作らない(python tools/release.py で公開する)。
set "FOX_MD_HOME=%~dp0..\..\Fox_dev_data\Fox_MD_Tracker"
cd /d "%~dp0.."
python md_tracker.py %*
