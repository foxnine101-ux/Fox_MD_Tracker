# -*- coding: utf-8 -*-
"""
スクリーンショットから文字を読む(名前がわからないアイテムの名前を、アイテムの説明の画面から拾う用)。

  Windows に入っている文字読み取り(Windows.Media.Ocr・日本語)を PowerShell から呼ぶ。
  exe に部品を足さなくてよいので、この PC に日本語の読み取りが入っていれば動く(無ければエラーを返す)。
  RO の文字は小さいので、2倍に拡大してから読む(jRO の画面で確かめた: 説明の画面の1行目 = 「+7 [シャドウ] メロンシールド」)。
"""
import json
import os
import re
import subprocess
import tempfile

PS_SCRIPT = r'''
param([string]$Path, [int]$Scale = 2)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$tr = New-Object Windows.Graphics.Imaging.BitmapTransform
$tr.ScaledWidth = [uint32]($dec.PixelWidth * $Scale); $tr.ScaledHeight = [uint32]($dec.PixelHeight * $Scale)
$tr.InterpolationMode = [Windows.Graphics.Imaging.BitmapInterpolationMode]::Cubic
$bmp = Await ($dec.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied, $tr, [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation, [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
$eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language "ja"))
if ($null -eq $eng) { Write-Output "NO_JA"; exit 2 }
$res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
foreach ($l in $res.Lines) { Write-Output $l.Text }
'''

MAX_IMAGE = 8 * 1024 * 1024


def tidy(line):
    """読み取りは1文字ごとに空白が入る → 空白を詰める。"""
    return re.sub(r"\s+", "", line or "")


def guess_name(lines):
    """説明の画面の1行目(「+7 [シャドウ] メロンシールド」)からアイテム名を出す。精錬値は外し、「]」の後ろに空白を入れる。"""
    for raw in lines:
        s = tidy(raw)
        s = re.sub(r"^[+＋]\d+", "", s)                    # 精錬値
        s = re.sub(r"^\[★\d+\]", "", s)                    # グレード
        s = s.replace("［", "[").replace("］", "]")
        s = re.sub(r"^(\[[^\]]{1,8}\])(?=\S)", r"\1 ", s)   # 「[シャドウ] メロン…」
        if len(s) >= 2:
            return s[:40]
    return ""


def read_lines(image_bytes, scale=2, timeout=40):
    """画像(PNG/JPEG などのバイト列)から、読めた行の並びを返す。読めないときは RuntimeError。"""
    if not image_bytes or len(image_bytes) > MAX_IMAGE:
        raise RuntimeError("画像が大きすぎるか、空です")
    if os.name != "nt":
        raise RuntimeError("Windows でだけ使えます")
    d = tempfile.mkdtemp(prefix="foxocr_")
    img, ps = os.path.join(d, "shot.png"), os.path.join(d, "ocr.ps1")
    try:
        with open(img, "wb") as f:
            f.write(image_bytes)
        with open(ps, "w", encoding="utf-8-sig") as f:
            f.write(PS_SCRIPT)
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)       # 黒い窓を出さない
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps,
                            "-Path", img, "-Scale", str(scale)],
                           capture_output=True, timeout=timeout, creationflags=flags)
        out = r.stdout.decode("utf-8", "replace").replace("﻿", "")
        if "NO_JA" in out:
            raise RuntimeError("この PC に日本語の文字読み取りが入っていません(Windows の設定 → 言語 → 日本語 → 光学式文字認識)")
        if r.returncode != 0:
            raise RuntimeError("文字を読めませんでした: " + r.stderr.decode("utf-8", "replace").strip()[-200:])
        return [l.strip() for l in out.splitlines() if l.strip()]
    finally:
        for p in (img, ps):
            try:
                os.remove(p)
            except OSError:
                pass
        try:
            os.rmdir(d)
        except OSError:
            pass


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    ls = read_lines(open(sys.argv[1], "rb").read())
    print(json.dumps({"name": guess_name(ls), "lines": [tidy(x) for x in ls]}, ensure_ascii=False, indent=1))
