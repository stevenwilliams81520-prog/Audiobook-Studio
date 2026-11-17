#!/usr/bin/env python3
"""Bundle src/ into a single HTML file: www/index.html (the Capacitor web app)."""
import pathlib
root = pathlib.Path(__file__).parent
css = (root / 'src/app.css').read_text()
lame = (root / 'vendor/lame.min.js').read_text()
js = '\n'.join((root / 'src' / f).read_text() for f in ['mp4.js', 'audio.js', 'engine.js', 'captions.js', 'ocr.js', 'app.js', 'quick.js', 'studio.js'])
theme_js = """<script>try{var p=localStorage.getItem('abs_theme')||'auto';if(p==='dark'||(p==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');}catch(e){}</script>"""
html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" id="theme-color" content="#f2f2f7">
{theme_js}
<title>Audiobook Studio</title>
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<div id="modal"></div>
<div id="toast"></div>
<script>
{lame}
</script>
<script>
{js}
</script>
</body>
</html>
'''
for p in ['www/index.html']:
    out = root / p
    out.parent.mkdir(exist_ok=True)
    out.write_text(html)
print('built', len(html) // 1024, 'KB')
