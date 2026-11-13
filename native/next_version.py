#!/usr/bin/env python3
"""يطبع اسم النسخة التالية: 5.7 -> 5.8 ، 5.9 -> 5.10 (يُستخدم في الإصدار التلقائي)."""
import json, os

path = os.path.join(os.path.dirname(__file__), '..', 'dist', 'version.json')
try:
    name = str(json.load(open(path, encoding='utf-8')).get('versionName', '1.0'))
except (OSError, ValueError):
    name = '1.0'
parts = [int(p) if p.isdigit() else 0 for p in name.split('.')] or [1]
if len(parts) < 2:
    parts.append(0)
parts[-1] += 1
print('.'.join(str(p) for p in parts))
