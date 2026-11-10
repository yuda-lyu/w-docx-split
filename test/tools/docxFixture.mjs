import fs from 'fs'
import path from 'path'
import zlib from 'zlib'


//測試用docx夾具產生器與讀取器(不依賴第三方套件): 以僅儲存(STORE)之zip組出最小docx(僅含段落文字), 供Word實例隔離測試使用; docxXml讀回Word輸出之docx內文
//  不產生含外部連結(a:blip r:link, TargetMode=External)之docx: Word開啟時會跳出可見之「安全性注意事項」對話框(NUIDialog)而停住(實測)


let tbl = (() => {
    let t = []
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
        }
        t.push(c >>> 0)
    }
    return t
})()


function crc32(buf) {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) {
        c = tbl[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    }
    return (c ^ 0xFFFFFFFF) >>> 0
}


//zipStored, entries為[{ name, data(string|Buffer) }], 回傳zip之Buffer(方法0=僅儲存, UTF-8檔名旗標)
function zipStored(entries) {
    let locals = []
    let centrals = []
    let offset = 0
    for (let e of entries) {
        let name = Buffer.from(e.name, 'utf8')
        let data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8')
        let crc = crc32(data)

        let lh = Buffer.alloc(30)
        lh.writeUInt32LE(0x04034b50, 0)
        lh.writeUInt16LE(20, 4) //version needed
        lh.writeUInt16LE(0x0800, 6) //flags: UTF-8
        lh.writeUInt16LE(0, 8) //method: store
        lh.writeUInt16LE(0, 10) //time
        lh.writeUInt16LE(0x21, 12) //date(1980-01-01)
        lh.writeUInt32LE(crc, 14)
        lh.writeUInt32LE(data.length, 18)
        lh.writeUInt32LE(data.length, 22)
        lh.writeUInt16LE(name.length, 26)
        lh.writeUInt16LE(0, 28)
        locals.push(lh, name, data)

        let ch = Buffer.alloc(46)
        ch.writeUInt32LE(0x02014b50, 0)
        ch.writeUInt16LE(20, 4) //version made by
        ch.writeUInt16LE(20, 6) //version needed
        ch.writeUInt16LE(0x0800, 8)
        ch.writeUInt16LE(0, 10)
        ch.writeUInt16LE(0, 12)
        ch.writeUInt16LE(0x21, 14)
        ch.writeUInt32LE(crc, 16)
        ch.writeUInt32LE(data.length, 20)
        ch.writeUInt32LE(data.length, 24)
        ch.writeUInt16LE(name.length, 28)
        ch.writeUInt32LE(offset, 42)
        centrals.push(ch, name)

        offset += lh.length + name.length + data.length
    }
    let cd = Buffer.concat(centrals)
    let end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(cd.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...locals, cd, end])
}


function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}


let nsDoc = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


function paragraph(text) {
    return `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
}


function build(texts) {
    let body = texts.map(paragraph).join('')
    let relsDoc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    return zipStored([
        { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
        { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
        { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${nsDoc}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>` },
        { name: 'word/_rels/document.xml.rels', data: relsDoc },
    ])
}


//genDocx, 寫出僅含texts各段落之docx, 回傳fp
function genDocx(fp, texts) {
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, build(texts))
    return fp
}


//readZipEntry, 讀取zip(Buffer)內名為name之項目並解壓, 回傳Buffer; 無此項目回傳null(支援僅儲存與deflate, 以中央目錄之大小為準)
function readZipEntry(buf, name) {
    let i = buf.length - 22
    while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) {
        i--
    }
    if (i < 0) {
        throw new Error('not a zip: end of central directory is missing')
    }
    let n = buf.readUInt16LE(i + 10)
    let p = buf.readUInt32LE(i + 16)
    for (let k = 0; k < n; k++) {
        let method = buf.readUInt16LE(p + 10)
        let sizeComp = buf.readUInt32LE(p + 20)
        let lenName = buf.readUInt16LE(p + 28)
        let lenExtra = buf.readUInt16LE(p + 30)
        let lenComment = buf.readUInt16LE(p + 32)
        let offLocal = buf.readUInt32LE(p + 42)
        if (buf.toString('utf8', p + 46, p + 46 + lenName) === name) {
            let start = offLocal + 30 + buf.readUInt16LE(offLocal + 26) + buf.readUInt16LE(offLocal + 28)
            let raw = buf.subarray(start, start + sizeComp)
            return method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw)
        }
        p += 46 + lenName + lenExtra + lenComment
    }
    return null
}


//docxXml, 讀取docx之word/document.xml(字串); 檔案不存在或無此項目為空字串
function docxXml(fp) {
    if (!fs.existsSync(fp)) {
        return ''
    }
    let b = readZipEntry(fs.readFileSync(fp), 'word/document.xml')
    return b ? b.toString('utf8') : ''
}


export { zipStored, genDocx, readZipEntry, docxXml }
