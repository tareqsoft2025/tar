#!/usr/bin/env python3
"""
يستخرج منطقة من خريطة Protomaps العالمية (بيانات OpenStreetMap المفتوحة، رخصة ODbL) إلى ملف PMTiles صغير
للعمل دون إنترنت داخل التطبيق. لا يحمّل كل الكوكب: يقرأ فقط الدلائل والبلاطات المطلوبة عبر طلبات Range.

مثال (قطاع غزة):
  python3 native/tools/extract_map.py --bbox 34.17,31.20,34.60,31.62 --maxzoom 15 --out dist/maps/gaza.pmtiles

المتطلبات: pip install pmtiles
"""
import argparse, datetime, math, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pmtiles.reader import Reader
from pmtiles.tile import deserialize_directory, deserialize_header, find_tile, zxy_to_tileid
from pmtiles.writer import Writer


def get_range(url, offset, length, tries=6):
    req = urllib.request.Request(url, headers={'Range': f'bytes={offset}-{offset + length - 1}', 'User-Agent': 'pef-map-extract/1.0'})
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            err = e
    raise err


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=None, help='رابط ملف pmtiles (الافتراضي: آخر بناء يومي من Protomaps)')
    ap.add_argument('--bbox', required=True, help='west,south,east,north')
    ap.add_argument('--minzoom', type=int, default=0)
    ap.add_argument('--maxzoom', type=int, default=15)
    ap.add_argument('--out', required=True)
    ap.add_argument('--threads', type=int, default=16)
    a = ap.parse_args()
    w, s, e, n = [float(v) for v in a.bbox.split(',')]

    src = a.src
    if not src:
        for d in range(0, 10):
            day = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=d)).strftime('%Y%m%d')
            u = f'https://build.protomaps.com/{day}.pmtiles'
            try:
                get_range(u, 0, 127, tries=1); src = u; break
            except Exception:  # noqa: BLE001
                continue
    if not src:
        sys.exit('لم يُعثر على بناء Protomaps')
    print('المصدر:', src)

    header = deserialize_header(get_range(src, 0, 127))
    reader = Reader(lambda o, l: get_range(src, o, l))
    meta = reader.metadata()
    dircache = {}

    def directory(off, ln):
        k = (off, ln)
        if k not in dircache:
            dircache[k] = deserialize_directory(get_range(src, off, ln))   # المكتبة تفكّ الضغط بنفسها
        return dircache[k]

    def locate(tid):
        off, ln = header['root_offset'], header['root_length']
        for _ in range(4):
            r = find_tile(directory(off, ln), tid)
            if r is None:
                return None
            if r.run_length == 0:
                off, ln = header['leaf_directory_offset'] + r.offset, r.length
            else:
                return header['tile_data_offset'] + r.offset, r.length
        return None

    ids = []
    for z in range(a.minzoom, a.maxzoom + 1):
        x1, y1 = tile_xy(n, w, z)
        x2, y2 = tile_xy(s, e, z)
        for x in range(x1, x2 + 1):
            for y in range(y1, y2 + 1):
                ids.append((zxy_to_tileid(z, x, y), z, x, y))
    ids.sort()
    print('بلاطات مطلوبة:', len(ids))

    def fetch(item):
        tid = item[0]
        loc = locate(tid)
        if not loc:
            return tid, None
        return tid, get_range(src, loc[0], loc[1])

    done = 0
    with open(a.out, 'wb') as f, ThreadPoolExecutor(a.threads) as ex:
        wr = Writer(f)
        got = 0
        for tid, data in ex.map(fetch, ids):   # map يحافظ على الترتيب (مطلوب لملف مجمّع)
            done += 1
            if data:
                wr.write_tile(tid, data)
                got += 1
            if done % 250 == 0:
                print(f'  {done}/{len(ids)} (موجود {got})', flush=True)
        h = dict(header)
        h.update({'min_zoom': a.minzoom, 'max_zoom': a.maxzoom,
                  'min_lon_e7': int(w * 1e7), 'min_lat_e7': int(s * 1e7), 'max_lon_e7': int(e * 1e7), 'max_lat_e7': int(n * 1e7),
                  'center_zoom': min(12, a.maxzoom), 'center_lon_e7': int((w + e) / 2 * 1e7), 'center_lat_e7': int((s + n) / 2 * 1e7)})
        meta = dict(meta)
        meta['name'] = 'PEF offline map'
        meta['description'] = 'OpenStreetMap data via Protomaps, extract bbox ' + a.bbox
        meta['attribution'] = '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>'
        wr.finalize(h, meta)
    print('تم:', a.out, got, 'بلاطة')


if __name__ == '__main__':
    main()
