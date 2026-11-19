/* مولّد ملفات Excel (.xlsx) على الجهاز بلا مكتبات: ZIP بدون ضغط + XML. أوراق من اليمين لليسار، ورأس منسّق ومجمّد. */
(function () {
  'use strict';
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const safeName = (n, used) => { let s = String(n || 'ورقة').replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || 'ورقة'; let k = 2, b = s; while (used.has(s)) { s = b.slice(0, 28) + ' ' + k++; } used.add(s); return s; };

  // sheet = { name, title?, subtitle?, widths?, rows:[رأس، بيانات…], rowSt?:[null|'late' لكل صف بيانات], foot?:[خلايا إجمالي] }
  // التخطيط: عنوان مدمج، سطر فرعي، رأس ملوّن، صفوف بخطوط شبكية وتظليل متناوب، صفوف المتأخرين بالأحمر، إجمالي، فلتر، تجميد، طباعة أفقية.
  const ST = { head: 1, body: 2, zebra: 3, bodyC: 4, zebraC: 5, late: 6, lateC: 7, title: 8, sub: 9, tot: 10, totC: 11, pct: 12, pctZ: 13, pctLate: 14, pctTot: 15, hrs: 16, hrsZ: 17, hrsLate: 18, hrsTot: 19, tagPEF: 20, tagHHO: 21, link: 22 };
  function sheetXml(sh, idx, nameMap) {
    const rows = sh.rows || [], head = rows[0] || [], data = rows.slice(1), nCols = Math.max(1, ...rows.map((r) => r.length), (sh.foot || []).length);
    const title = sh.title || sh.name, sub = sh.subtitle || '', hasFoot = !!(sh.foot && sh.foot.length);
    // أعمدة قصيرة (أرقام/أوقات/تواريخ) تُوسَّط تلقائياً
    const center = Array.from({ length: nCols }, (_, c) => { let mx = 0, any = false; data.forEach((r) => { const v = r[c]; if (v != null && v !== '') { any = true; mx = Math.max(mx, String(v).length); } }); return any && mx <= 16; });
    const widths = Array.from({ length: nCols }, (_, c) => (sh.widths && sh.widths[c]) || Math.min(48, Math.max(10, ...[head[c], ...data.map((r) => r[c])].map((v) => (v == null ? 0 : String(v).length * 1.15 + 3)))));
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.round(w * 10) / 10}" customWidth="1"/>`).join('');
    const last = colName(nCols - 1);
    const links = [];
    const cell = (v, ref, st) => {
      if (v && typeof v === 'object' && v.link) { const t = nameMap && nameMap[v.link.to]; if (t) links.push(`<hyperlink ref="${ref}" location="${esc("'" + t.replace(/'/g, "''") + "'!A" + v.link.row)}" display="${esc(v.v)}"/>`); }
      if (v && typeof v === 'object' && 'v' in v) v = v.v;
      if (v == null || v === '') return `<c r="${ref}" s="${st}"/>`;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    };
    let r = 1, xml = '';
    xml += `<row r="${r}" ht="34" customHeight="1">` + Array.from({ length: nCols }, (_, c) => cell(c === 0 ? title : '', colName(c) + r, ST.title)).join('') + '</row>'; r++;
    const back = sh.back && nCols >= 4 ? sh.back : null;   // زر رجوع في أعلى الورقة (رابط داخلي) في A2:B2، والسطر الفرعي في C2 فما بعد
    xml += `<row r="${r}" ht="22" customHeight="1">` + Array.from({ length: nCols }, (_, c) => (back ? (c === 0 ? cell({ v: back.label || '▸ رجوع إلى الورقة السابقة', link: back }, colName(c) + r, ST.link) : c === 1 ? cell('', colName(c) + r, ST.link) : cell(c === 2 ? sub : '', colName(c) + r, ST.sub)) : cell(c === 0 ? sub : '', colName(c) + r, ST.sub))).join('') + '</row>'; r++;
    const hr = r;
    xml += `<row r="${r}" ht="${head.some((h) => String(h || '').includes('\n')) ? 38 : 26}" customHeight="1">` + Array.from({ length: nCols }, (_, c) => cell(head[c], colName(c) + r, ST.head)).join('') + '</row>'; r++;
    data.forEach((row, ri) => {
      const rs = sh.rowSt && sh.rowSt[ri], late = rs === 'late', subr = rs === 'sub', z = ri % 2 === 1;
      xml += `<row r="${r}" ht="${subr ? 24 : 21}" customHeight="1">` + Array.from({ length: nCols }, (_, c) => {
        const raw = row[c], f = raw && typeof raw === 'object' ? raw.f : null, val = raw && typeof raw === 'object' && 'v' in raw ? raw.v : raw;
        let st;
        if (raw && typeof raw === 'object' && raw.link) st = ST.link;
        else if (f === 'pct' || f === 'hrs') st = subr ? ST[f + 'Tot'] : late ? ST[f + 'Late'] : z ? ST[f + 'Z'] : ST[f];
        else if (subr) st = center[c] ? ST.totC : ST.tot;
        else if (late) st = center[c] ? ST.lateC : ST.late;
        else if (val === 'PEF') st = ST.tagPEF;
        else if (val === 'HHO') st = ST.tagHHO;
        else st = center[c] ? (z ? ST.zebraC : ST.bodyC) : (z ? ST.zebra : ST.body);
        return cell(raw, colName(c) + r, st);
      }).join('') + '</row>'; r++;
    });
    const lastData = r - 1;
    if (hasFoot) { xml += `<row r="${r}" ht="26" customHeight="1">` + Array.from({ length: nCols }, (_, c) => { const fv = sh.foot[c], f = fv && typeof fv === 'object' ? fv.f : null; return cell(fv, colName(c) + r, f === 'pct' || f === 'hrs' ? ST[f + 'Tot'] : center[c] ? ST.totC : ST.tot); }).join('') + '</row>'; r++; }
    const scaleCols = [].concat(sh.scale == null ? [] : sh.scale);
    const cf = data.length ? scaleCols.map((c, k) => `<conditionalFormatting sqref="${colName(c)}${hr + 1}:${colName(c)}${lastData}"><cfRule type="colorScale" priority="${k + 1}"><colorScale><cfvo type="num" val="${sh.scaleMin == null ? 0 : sh.scaleMin}"/><cfvo type="num" val="${sh.scaleMid == null ? 60 : sh.scaleMid}"/><cfvo type="num" val="${sh.scaleMax == null ? 100 : sh.scaleMax}"/><color rgb="FFF6B7B0"/><color rgb="FFFBE7A6"/><color rgb="FF9FD9B6"/></colorScale></cfRule></conditionalFormatting>`).join('') : '';
    const merges = back ? `<mergeCells count="3"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:B2"/><mergeCell ref="C2:${last}2"/></mergeCells>` : `<mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells>`;
    const filter = data.length ? `<autoFilter ref="A${hr}:${last}${lastData}"/>` : '';
    const pane = `<pane ySplit="${hr}" topLeftCell="A${hr + 1}" activePane="bottomLeft" state="frozen"/>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr>${sh.tab ? `<tabColor rgb="${sh.tab}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" rightToLeft="1" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${xml}</sheetData>${filter}${merges}${cf}${links.length ? `<hyperlinks>${links.join('')}</hyperlinks>` : ''}<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;Cصفحة &amp;P من &amp;N</oddFooter></headerFooter></worksheet>`;
  }
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="2"><numFmt numFmtId="164" formatCode="0&quot;%&quot;"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>'
    + '<fonts count="10">'
    + '<font><sz val="11"/><color rgb="FF1B2B2E"/><name val="Arial"/></font>'                                   // 0 عادي
    + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>'                              // 1 رأس
    + '<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>'                              // 2 عنوان
    + '<font><i/><sz val="10"/><color rgb="FF5C6F72"/><name val="Arial"/></font>'                              // 3 فرعي
    + '<font><b/><sz val="11"/><color rgb="FFC0392B"/><name val="Arial"/></font>'                              // 4 متأخر أحمر
    + '<font><b/><sz val="11"/><color rgb="FF12413A"/><name val="Arial"/></font>'                              // 5 إجمالي
    + '<font><sz val="11"/><color rgb="FF1B2B2E"/><name val="Arial"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FF0F5F73"/><name val="Arial"/></font>'   // 7 PEF
    + '<font><b/><sz val="11"/><color rgb="FF9A5B00"/><name val="Arial"/></font>'   // 8 HHO
    + '<font><u/><b/><sz val="11"/><color rgb="FF1F5FBF"/><name val="Arial"/></font>'   // 9 رابط
    + '</fonts>'
    + '<fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF1D5A4B"/><bgColor indexed="64"/></patternFill></fill>'   // 2 رأس
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F8F6"/><bgColor indexed="64"/></patternFill></fill>'   // 3 تظليل
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEA"/><bgColor indexed="64"/></patternFill></fill>'   // 4 متأخر
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF0F3D33"/><bgColor indexed="64"/></patternFill></fill>'   // 5 عنوان
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFDCEBE5"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F1F5"/><bgColor indexed="64"/></patternFill></fill>'   // 7 PEF
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1DC"/><bgColor indexed="64"/></patternFill></fill></fills>'   // 8 HHO // 6 إجمالي
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCFDBD8"/></left><right style="thin"><color rgb="FFCFDBD8"/></right><top style="thin"><color rgb="FFCFDBD8"/></top><bottom style="thin"><color rgb="FFCFDBD8"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="23">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'                                                                                                                                  // 0
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'   // 1 رأس
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>'                  // 2 جسم
    + '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>'   // 3 تظليل
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'                           // 4 جسم وسط
    + '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'            // 5 تظليل وسط
    + '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>'   // 6 متأخر
    + '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'            // 7 متأخر وسط
    + '<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'                            // 8 عنوان
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'                                          // 9 فرعي
    + '<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'            // 10 إجمالي
    + '<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'            // 11 إجمالي وسط
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="164" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="164" fontId="5" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="165" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="165" fontId="5" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="7" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="8" fillId="8" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="9" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '</cellXfs></styleSheet>';

  function zip(files) {   // files = [{name, data:Uint8Array}] — تخزين بلا ضغط
    const chunks = [], central = []; let off = 0;
    const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    files.forEach((f) => {
      const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)]);
      chunks.push(lh, nm, f.data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
      off += lh.length + nm.length + sz;
    });
    let cl = 0; central.forEach((c) => { cl += c.length; });
    const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), 0, 0]);
    const all = chunks.concat(central, [end]); let n = 0; all.forEach((c) => { n += c.length; });
    const out = new Uint8Array(n); let p = 0; all.forEach((c) => { out.set(c, p); p += c.length; });
    return out;
  }

  function build(sheets, meta) {
    const used = new Set(), names = sheets.map((s) => safeName(s.name, used)), F = [], nameMap = {};
    sheets.forEach((s, i) => { nameMap[s.name] = names[i]; });
    const T = (n, x) => F.push({ name: n, data: enc.encode(x) });
    T('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    T('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc((meta && meta.title) || 'تقرير الموارد البشرية')}</dc:title><dc:creator>${esc((meta && meta.author) || 'تطبيق الموارد البشرية')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
    T('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>');
    T('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    const dn = sheets.map((sh, i) => { const nc = Math.max(1, ...(sh.rows || []).map((r) => r.length), (sh.foot || []).length), last = colName(nc - 1), nd = Math.max(0, (sh.rows || []).length - 1), q = "'" + names[i].replace(/'/g, "''") + "'";
      return `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${esc(q)}!$3:$3</definedName>` + (nd ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(q)}!$A$3:$${last}$${3 + nd}</definedName>` : ''); }).join('');
    T('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><definedNames>' + dn + '</definedNames></workbook>');
    T('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    T('xl/styles.xml', STYLES);
    sheets.forEach((sh, i) => T(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh, i, nameMap)));
    return zip(F);
  }
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  window.HRXlsx = { build, MIME };
})();
