// Turns a PDF or DOCX into plain text, entirely in the browser.
export async function pdfToText(pdfjsLib, data) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: true }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let lastY = null, prevEnd = 0, line = "";
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const x = it.transform[4], y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 3) { out += line.trim() + "\n"; line = ""; prevEnd = 0; }
      if (line && x - prevEnd > 1.5 && !/\s$/.test(line) && !/^\s/.test(it.str)) line += " ";
      line += it.str; prevEnd = x + (it.width || 0); lastY = y;
    }
    out += line.trim() + "\n";
  }
  return out;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function docxToText(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a valid .docx file");
  let p = dv.getUint32(eocd + 16, true);
  const count = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (name !== "word/document.xml") continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = u8.subarray(start, start + csize);
    const xml = dec.decode(method === 0 ? raw : await inflateRaw(raw));
    return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }
  throw new Error("Could not find text in this .docx");
}
