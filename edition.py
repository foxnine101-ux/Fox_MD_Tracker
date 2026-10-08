# -*- coding: utf-8 -*-
# 公開版か開発版か。
#   DEV = True  … 開発版(耐性リアルタイムなど、まだ公開しない機能も使える)
#   DEV = False … 公開版(リリースに置いてみんなに配るもの)
# ビルド(.github/workflows/build.yml)がこのファイルを書きかえて、両方の exe を作る。
# python で直接動かすときは開発版。
DEV = True
