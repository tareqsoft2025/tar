#!/usr/bin/env python3
"""Minimal Android binary-XML (AXML) encoder for the app manifest."""
import struct, sys
import xml.etree.ElementTree as ET

ANDROID = 'http://schemas.android.com/apk/res/android'
RES = {'versionCode': 0x0101021b, 'versionName': 0x0101021c, 'name': 0x01010003, 'label': 0x01010001,
       'minSdkVersion': 0x0101020c, 'targetSdkVersion': 0x01010270, 'exported': 0x01010010,
       'allowBackup': 0x01010280, 'configChanges': 0x0101001f, 'usesCleartextTraffic': 0x010104ec,
       'launchMode': 0x0101001d, 'screenOrientation': 0x0101001e, 'hardwareAccelerated': 0x010102d3,
       'authorities': 0x01010018, 'grantUriPermissions': 0x0101001b}
INT = {'versionCode', 'minSdkVersion', 'targetSdkVersion'}
BOOL = {'grantUriPermissions', 'exported', 'allowBackup', 'usesCleartextTraffic', 'hardwareAccelerated'}
FLAGS = {'configChanges': {'orientation': 0x80, 'keyboardHidden': 0x20, 'screenSize': 0x400, 'smallestScreenSize': 0x800,
                           'screenLayout': 0x100, 'keyboard': 0x10, 'uiMode': 0x200, 'locale': 0x4, 'layoutDirection': 0x2000,
                           'density': 0x1000, 'fontScale': 0x40000000}}
ENUM = {'launchMode': {'standard': 0, 'singleTop': 1, 'singleTask': 2, 'singleInstance': 3},
        'screenOrientation': {'unspecified': -1, 'portrait': 1, 'landscape': 0}}

def encode(src):
    root = ET.fromstring(src)
    res_names = sorted(RES, key=lambda k: RES[k])
    strings = list(res_names)  # first strings carry resource ids
    def S(s):
        if s not in strings: strings.append(s)
        return strings.index(s)
    S('android'); S(ANDROID)

    def attrs_of(el):
        out = []
        for k, v in el.attrib.items():
            if k.startswith('{' + ANDROID + '}'):
                out.append((ANDROID, k.split('}')[1], v))
            else:
                out.append((None, k, v))
        out.sort(key=lambda t: (RES.get(t[1], 1 << 31), t[1]))
        return out

    def value(name, v):
        if name in INT: return (-1, 0x10, int(v))
        if name in BOOL: return (-1, 0x12, 0xFFFFFFFF if v == 'true' else 0)
        if name in FLAGS:
            n = 0
            for p in v.split('|'): n |= FLAGS[name][p]
            return (-1, 0x11, n)
        if name in ENUM: return (-1, 0x10, ENUM[name][v] & 0xFFFFFFFF)
        i = S(v)
        return (i, 0x03, i)

    body = bytearray()
    # pre-register all strings
    def walk_reg(el):
        S(el.tag)
        for ns, n, v in attrs_of(el):
            S(n)
            if n not in INT and n not in BOOL and n not in FLAGS and n not in ENUM: S(v)
        for c in el: walk_reg(c)
    walk_reg(root)

    def chunk(t, hs, payload, extra=b''):
        return struct.pack('<HHI', t, hs, hs + len(extra) + len(payload)) + extra + payload

    def start_ns():
        return struct.pack('<HHIIIII', 0x100, 16, 24, 1, 0xFFFFFFFF, S('android'), S(ANDROID))
    def end_ns():
        return struct.pack('<HHIIIII', 0x101, 16, 24, 1, 0xFFFFFFFF, S('android'), S(ANDROID))

    def emit(el, first):
        out = bytearray()
        at = attrs_of(el)
        size = 36 + 20 * len(at)
        out += struct.pack('<HHIII', 0x102, 16, size, 1, 0xFFFFFFFF)
        out += struct.pack('<IIHHHHHH', 0xFFFFFFFF, S(el.tag), 0x14, 0x14, len(at), 0, 0, 0)
        for ns, n, v in at:
            raw, dt, data = value(n, v)
            out += struct.pack('<IIIHBBI', S(ANDROID) if ns else 0xFFFFFFFF, S(n), raw & 0xFFFFFFFF, 8, 0, dt, data & 0xFFFFFFFF)
        for c in el: out += emit(c, False)
        out += struct.pack('<HHIIIII', 0x103, 16, 24, 1, 0xFFFFFFFF, 0xFFFFFFFF, S(el.tag))
        return bytes(out)

    inner = start_ns() + emit(root, True) + end_ns()

    # string pool (UTF-16)
    blobs = []
    for s in strings:
        b = s.encode('utf-16-le')
        blobs.append(struct.pack('<H', len(s)) + b + b'\0\0')
    offs, pos = [], 0
    for b in blobs: offs.append(pos); pos += len(b)
    data = b''.join(blobs)
    if len(data) % 4: data += b'\0' * (4 - len(data) % 4)
    n = len(strings)
    starts = 28 + 4 * n
    sp = struct.pack('<HHIIIIII', 1, 28, starts + len(data), n, 0, 0, starts, 0) + struct.pack('<%dI' % n, *offs) + data
    rm = struct.pack('<HHI', 0x180, 8, 8 + 4 * len(res_names)) + struct.pack('<%dI' % len(res_names), *[RES[k] for k in res_names])
    total = 8 + len(sp) + len(rm) + len(inner)
    return struct.pack('<HHI', 3, 8, total) + sp + rm + inner

if __name__ == '__main__':
    open(sys.argv[2], 'wb').write(encode(open(sys.argv[1], encoding='utf-8').read()))
