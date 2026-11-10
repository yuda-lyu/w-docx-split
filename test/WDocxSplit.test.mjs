import fs from 'fs'
import path from 'path'
import http from 'http'
import { spawnSync } from 'child_process'
import w from 'wsemi'
import assert from 'assert'
import WDocxSplit from '../src/WDocxSplit.mjs'
import { setBinEnv } from './tools/binEnv.mjs'
import { genDocx, docxXml } from './tools/docxFixture.mjs'
import { sleep, wordPids, isAutomationWord, waitWordGone, killNewAutomationWords, clearDisabledItems, startHeldWord, startBorrower, startVisibleWordWatch } from './tools/wordInstance.mjs'


function isWindows() {
    return process.platform === 'win32'
}


describe('WDocxSplit', function() {

    //check
    if (!isWindows()) {
        return
    }

    this.timeout(180000)

    let fpOut = `./test/out/001.docx`
    let fpOutTrue = `./test/outTrue/001.docx`

    let fpIn = `./test/docin.docx`
    let strSep = '[systag:sepline]'
    let fdOut = `./test/out`
    let opt = {
        padZero: 3,
    }

    //外部執行檔(規格 O1、O3、D3): 不連外網, 以本機鏡像或本機HTTP伺服器供檔, 快取放test/_tmp/
    let RAW = 'https://raw.githubusercontent.com'
    let fdt = path.resolve('./test/_tmp/WDocxSplit')
    let manifest = JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
    let entry = manifest.files[0]
    let urlPinned = `${RAW}/${manifest.repo}/${manifest.commit}/${entry.path}`
    let envNames = ['W_BIN_CACHE', 'W_BIN_MIRROR', 'W_BIN_OFFLINE']
    let envOld = {}

    let setEnv = (vars) => {
        for (let k of envNames) {
            envOld[k] = process.env[k]
            delete process.env[k]
        }
        for (let [k, v] of Object.entries(vars)) {
            process.env[k] = v
        }
    }

    let restoreEnv = () => {
        for (let k of envNames) {
            if (envOld[k] === undefined) {
                delete process.env[k]
            }
            else {
                process.env[k] = envOld[k]
            }
        }
    }

    //全域fetch之攔截: WDocxSplit無法注入fetch, 故於全域攔截, 記錄所有請求, 只放行GitHub原始檔網址並改指本機伺服器, 其餘(含mode為ban時一律)拒絕
    let port = 8968
    let server = null
    let serverMode = 'good' //good為回傳實檔, tampered為同長度不同內容
    let hits = [] //伺服器收到之請求路徑
    let fetchBak = null
    let fetchCalls = []
    let fetchBan = false
    let bytes = null

    let hookFetch = () => {
        fetchBak = globalThis.fetch
        fetchCalls = []
        fetchBan = false
        globalThis.fetch = (url, init) => {
            let u = String(url)
            fetchCalls.push(u)
            if (fetchBan || !u.startsWith(`${RAW}/`)) {
                return Promise.reject(new Error(`network access is forbidden in this case: ${u}`))
            }
            return fetchBak(u.replace(RAW, `http://127.0.0.1:${port}`), init)
        }
    }

    let unhookFetch = () => {
        globalThis.fetch = fetchBak
    }

    let sizeOf = (fp) => {
        return fs.statSync(fp).size
    }

    describe('with a local folder mirror (O1, O3)', function() {
        let fdMirror = path.join(fdt, 'mirror')
        let fdCache = path.join(fdt, 'cache')

        before(function() {
            fs.rmSync(fdt, { recursive: true, force: true })
            let fdSha = path.join(fdMirror, manifest.pkg, entry.sha256)
            fs.mkdirSync(fdSha, { recursive: true })
            fs.copyFileSync(entry.path, path.join(fdSha, entry.name))
            setEnv({ W_BIN_CACHE: fdCache, W_BIN_MIRROR: fdMirror, W_BIN_OFFLINE: '1' })
            hookFetch()
        })

        after(function() {
            unhookFetch()
            restoreEnv()
            fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        })

        it('convert', async function() {
            await WDocxSplit(fpIn, strSep, fdOut, opt)
            let r = (fs.statSync(fpOut)).size
            let rr = (fs.statSync(fpOutTrue)).size
            //轉出docx檔案每次不同, 改用門檻比對
            // console.log('r', r, 'rr', rr)
            let b = r > 12000 && rr > 12000
            w.fsDeleteFolder(fdOut)
            assert.strict.deepEqual(true, b)

            //分割所用之執行檔應已經由ensureBins自鏡像取得並放入快取<W_BIN_CACHE>/<套件>/<sha256>/<name>(規格 D3), 而非套件內src/splitDocx.exe
            let fpCached = path.join(fdCache, manifest.pkg, entry.sha256, entry.name)
            assert.strict.equal(fs.existsSync(fpCached), true)
            assert.strict.equal(sizeOf(fpCached), entry.size)

            //WDocxSplit無法注入fetch: 取自鏡像時全域fetch不得被呼叫(否則回歸為直連時此測試仍會因真網路而綠)
            assert.strict.deepStrictEqual(fetchCalls, [])
        })

    })

    describe('through the pinned GitHub url of the manifest, served by a local HTTP server (T3, T4)', function() {
        let fdCache = path.join(fdt, 'cache-gh')
        let fdOutGh = path.join(fdt, 'out-gh')

        before(async function() {
            fs.rmSync(fdt, { recursive: true, force: true })
            fs.mkdirSync(fdt, { recursive: true })
            bytes = fs.readFileSync(entry.path)
            server = http.createServer((req, res) => {
                hits.push(req.url)
                let body = bytes
                if (serverMode === 'tampered') {
                    body = Buffer.from(bytes)
                    body[1000] = body[1000] ^ 0xff
                }
                if (req.url === `/${manifest.repo}/${manifest.commit}/${entry.path}`) {
                    res.writeHead(200, { 'content-length': String(body.length) })
                    res.end(body)
                }
                else {
                    res.writeHead(404)
                    res.end()
                }
            })
            await new Promise((resolve, reject) => {
                server.once('error', reject)
                server.listen(port, '127.0.0.1', resolve)
            })
            setEnv({ W_BIN_CACHE: fdCache })
            hookFetch()
        })

        beforeEach(function() {
            serverMode = 'good'
            hits = []
            fetchCalls = []
            fetchBan = false
        })

        after(async function() {
            unhookFetch()
            restoreEnv()
            await new Promise((resolve) => {
                server.close(resolve)
            })
            fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        })

        it('refuses a download whose bytes differ from the manifest: rejects a string with the error code, leaves no cached file and never runs it (T4, M2)', async function() {
            serverMode = 'tampered'
            let err = await WDocxSplit(fpIn, strSep, fdOutGh, opt).then(() => null).catch((e) => e)
            assert.strict.equal(typeof err, 'string') //既有reject型態(字串)不變
            assert.strict.equal(err.startsWith('[E_HASH_MISMATCH]'), true, err)
            assert.strict.equal(hits.length > 0, true)
            assert.strict.equal(fs.existsSync(path.join(fdCache, manifest.pkg, entry.sha256, entry.name)), false)
            assert.strict.equal(fs.existsSync(fdOutGh) && fs.readdirSync(fdOutGh).length > 0, false) //未執行即無輸出
        })

        it('downloads once from the pinned-commit url (not master), verifies, caches and splits; the second call needs no network (T3, D3, D4, O2)', async function() {
            await WDocxSplit(fpIn, strSep, fdOutGh, opt)
            assert.strict.deepStrictEqual(fetchCalls, [urlPinned]) //M2: 釘選提交網址, 非master、非releases/latest
            assert.strict.equal(hits.length, 1)
            let fpCached = path.join(fdCache, manifest.pkg, entry.sha256, entry.name)
            assert.strict.equal(sizeOf(fpCached), entry.size)
            assert.strict.equal(fs.readFileSync(fpCached).equals(bytes), true)
            assert.strict.equal(sizeOf(path.join(fdOutGh, '001.docx')) > 12000, true)
            assert.strict.equal(sizeOf(path.join(fdOutGh, '002.docx')) > 12000, true)

            //第二次: 快取命中(亦校驗), 全域fetch一律拒絕仍成功
            fs.rmSync(fdOutGh, { recursive: true, force: true })
            fetchCalls = []
            fetchBan = true
            await WDocxSplit(fpIn, strSep, fdOutGh, opt)
            assert.strict.equal(sizeOf(path.join(fdOutGh, '001.docx')) > 12000, true)
            assert.strict.equal(hits.length, 1)
        })

    })

    describe('as installed from npm: the package folder holds no executable and the working directory is another project (D1, D3, E2)', function() {
        let fdProj = path.join(fdt, 'proj')
        let fdPkg = path.join(fdProj, 'node_modules', manifest.pkg)
        let fdMirror = path.join(fdt, 'mirror')
        let fdCache = path.join(fdt, 'cache')

        before(function() {
            fs.rmSync(fdt, { recursive: true, force: true })

            //模擬安裝夾(位於repo內, 以父層node_modules解析wsemi): 只含src/*.mjs、bin/manifest.json、package.json, 即npm包之內容
            fs.mkdirSync(path.join(fdPkg, 'src'), { recursive: true })
            fs.mkdirSync(path.join(fdPkg, 'bin'), { recursive: true })
            for (let fn of fs.readdirSync('src').filter((v) => v.endsWith('.mjs'))) {
                fs.copyFileSync(path.join('src', fn), path.join(fdPkg, 'src', fn))
            }
            fs.copyFileSync('bin/manifest.json', path.join(fdPkg, 'bin/manifest.json'))
            fs.copyFileSync('package.json', path.join(fdPkg, 'package.json'))

            //誘餌: 舊版會在使用者專案之src/與node_modules/<pkg>/src/查找執行檔, 此處放不可執行之假檔, 新版不得使用它們
            fs.mkdirSync(path.join(fdProj, 'src'), { recursive: true })
            for (let fp of [path.join(fdProj, 'src', entry.name), path.join(fdPkg, 'src', entry.name), path.join(fdPkg, 'bin', entry.name)]) {
                fs.writeFileSync(fp, 'decoy: not an executable')
            }

            //本機鏡像
            let fdSha = path.join(fdMirror, manifest.pkg, entry.sha256)
            fs.mkdirSync(fdSha, { recursive: true })
            fs.copyFileSync(entry.path, path.join(fdSha, entry.name))
            setEnv({ W_BIN_CACHE: fdCache, W_BIN_MIRROR: fdMirror, W_BIN_OFFLINE: '1' })
        })

        after(function() {
            restoreEnv()
            fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        })

        it('splits with the verified cached executable and ignores the executable-like files next to the package and in the working directory', function() {
            let fdOutPj = path.join(fdProj, 'out')
            let r = spawnSync(process.execPath, [path.resolve('test/tools/splitChild.mjs'), path.join(fdPkg, 'src/WDocxSplit.mjs'), path.resolve(fpIn), strSep, fdOutPj], { cwd: fdProj, encoding: 'utf8', windowsHide: true })
            assert.strict.equal(r.status, 0, r.stderr)
            let o = JSON.parse(r.stdout.trim().split('\n').pop())
            assert.strict.equal(path.resolve(o.cwd), path.resolve(fdProj)) //確實於他處載入
            assert.strict.deepStrictEqual([o.r, o.err], ['ok', null])
            assert.strict.equal(sizeOf(path.join(fdOutPj, '001.docx')) > 12000, true)
            assert.strict.equal(sizeOf(path.join(fdOutPj, '002.docx')) > 12000, true)
            assert.strict.equal(sizeOf(path.join(fdCache, manifest.pkg, entry.sha256, entry.name)), entry.size)
        })

    })

    describe('when splitDocx.exe fails internally (it prints "error: ..." on stdout and still exits with code 0)', function() {
        let fdMirror = path.join(fdt, 'mirror')
        let fdCache = path.join(fdt, 'cache')
        let fdIn = path.join(fdt, 'in')

        before(function() {
            fs.rmSync(fdt, { recursive: true, force: true })
            let fdSha = path.join(fdMirror, manifest.pkg, entry.sha256)
            fs.mkdirSync(fdSha, { recursive: true })
            fs.copyFileSync(entry.path, path.join(fdSha, entry.name))
            fs.mkdirSync(fdIn, { recursive: true })

            //非docx: 副檔名為docx之純文字檔
            fs.writeFileSync(path.join(fdIn, 'notdocx.docx'), 'this is plain text, not a docx')

            //損毀docx: 正常docx只取前一半(zip結尾遺失)
            let buf = fs.readFileSync(fpIn)
            fs.writeFileSync(path.join(fdIn, 'broken.docx'), buf.subarray(0, Math.floor(buf.length / 2)))

            setEnv({ W_BIN_CACHE: fdCache, W_BIN_MIRROR: fdMirror, W_BIN_OFFLINE: '1' })
            hookFetch()
        })

        after(function() {
            unhookFetch()
            restoreEnv()
            fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        })

        for (let name of ['notdocx.docx', 'broken.docx']) {

            it(`rejects a string "[E_SPLIT_FAILED] ..." instead of resolving "ok" for ${name}, writes no output and does not echo the input paths`, async function() {
                let fpBad = path.join(fdIn, name)
                let fdOutBad = path.join(fdt, `out-${name}`)
                let r = null
                let err = null
                await WDocxSplit(fpBad, strSep, fdOutBad, opt)
                    .then((v) => {
                        r = v
                    })
                    .catch((e) => {
                        err = e
                    })

                //exe內部失敗不得被當成功: 回傳不得為'ok', 須以字串reject(既有reject型態), 以`[code] message`呈現
                assert.strict.equal(r, null, `resolved [${r}]`)
                assert.strict.equal(typeof err, 'string')
                assert.strict.equal(err.startsWith('[E_SPLIT_FAILED] '), true, err)

                //訊息為exe之診斷(已依系統字碼頁解碼, 無亂碼), 不回顯輸入路徑(規格V20)
                assert.strict.equal(err.length > '[E_SPLIT_FAILED] '.length, true, err)
                assert.strict.equal(err.includes('�'), false, err)
                assert.strict.equal(err.includes(fpBad), false, err)
                assert.strict.equal(err.includes(fdOutBad), false, err)

                //失敗不得留下輸出檔
                assert.strict.equal(fs.existsSync(path.join(fdOutBad, '001.docx')), false)
                assert.strict.equal(fs.existsSync(fdOutBad) && fs.readdirSync(fdOutBad).length > 0, false)
                assert.strict.deepStrictEqual(fetchCalls, [])
            })

        }

        it('still resolves "ok" for a valid docx after the failures (the failure judgement does not break the success path)', async function() {
            let fdOutOk = path.join(fdt, 'out-ok')
            let r = await WDocxSplit(fpIn, strSep, fdOutOk, opt)
            assert.strict.equal(r, 'ok')
            assert.strict.equal(sizeOf(path.join(fdOutOk, '001.docx')) > 12000, true)
            assert.strict.equal(sizeOf(path.join(fdOutOk, '002.docx')) > 12000, true)
        })

    })

    describe('when the executable is unavailable', function() {
        let fdCache = path.join(fdt, 'cache-off')

        before(function() {
            fs.rmSync(fdt, { recursive: true, force: true })
            setEnv({ W_BIN_CACHE: fdCache, W_BIN_OFFLINE: '1' })
            hookFetch()
        })

        after(function() {
            unhookFetch()
            restoreEnv()
            fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        })

        it('rejects a string "[E_OFFLINE_MISSING] ..." naming the file, sha256, size and the cache path, without any network access (T6, O3, E3)', async function() {
            let err = await WDocxSplit(fpIn, strSep, path.join(fdt, 'out-off'), opt).then(() => null).catch((e) => e)
            assert.strict.equal(typeof err, 'string') //既有reject型態(字串)不變, 以`[code] message`呈現
            assert.strict.equal(err.startsWith('[E_OFFLINE_MISSING]'), true, err)
            let cachePath = path.join(fdCache, manifest.pkg, entry.sha256, entry.name)
            for (let s of [entry.name, entry.sha256, String(entry.size), cachePath]) {
                assert.strict.equal(err.includes(s), true, `message should include [${s}]: ${err}`)
            }
            assert.strict.deepStrictEqual(fetchCalls, [])
            assert.strict.equal(fs.existsSync(path.join(fdt, 'out-off', '001.docx')), false)
        })

        it('keeps the existing string rejections of the argument checks (unchanged behavior)', async function() {
            let err = await WDocxSplit('./test/not-exist.docx', strSep, path.join(fdt, 'out-arg'), opt).then(() => null).catch((e) => e)
            assert.strict.equal(err, `fpIn[./test/not-exist.docx] does not exist`)
            err = await WDocxSplit(fpIn, '', path.join(fdt, 'out-arg'), opt).then(() => null).catch((e) => e)
            assert.strict.equal(err, `strSep[] is not an effective string`)
            assert.strict.deepStrictEqual(fetchCalls, [])
        })

    })

})


describe('WDocxSplit Word instance isolation', function() {

    //check
    if (!isWindows()) {
        return
    }

    //規格: 主控排程第408項(ds408, 2026-11-10, 源自使用端之調查; 範本為w-html2docx之hd408與w-docx2html之dh408): 分割器每次另開獨立之Word實例(DispatchEx), 只結束本行程所開者, 輸入檔以唯讀開啟
    //  ①他行程已開之Word(含其未存內容)不被借用, 不被結束; ②兩行程並行分割(甲進行中乙完整分割完、同一輸入檔同時與錯開1.5秒)皆成功;
    //  ③例外路徑(輸出路徑無效, 輸入檔不存在, 輸入檔非docx)亦只結束自己之實例且不殘留WINWORD; ④本行程之實例被他行程(舊寫法Dispatch)連上並開文件時, 分割完不結束該實例;
    //  ⑤輸出路徑即輸入檔時照改前行為(同一錯誤, 輸入檔不變)
    //  輸入為docx, 無http資源可扣住分割: 以大量段落之docx使分割持續十餘秒(逐段落經COM掃描與拷貝), 並以可觀察條件同步(分割器之WINWORD出現; 借用者見到實例內文件數達1=輸入檔已開啟)
    //  他行程之Word以PowerShell經COM扮演(見tools/wordInstance.mjs), 一律隱藏; 本組須在無其他Word時執行(見before)

    let fdTmp = path.resolve('./test/_tmp/WDocxSplit-word')
    let fdOut = path.join(fdTmp, 'out')
    let sep = '[systag:sepline]'

    //nHeavy, 重型docx每側之段落數(共2側, 分割約十餘秒); nMid, 並行案每側之段落數
    let nHeavy = 400
    let nMid = 150

    //pre, 本組開始時已存在之WINWORD(須為空, 見before); null為本組未執行(略過或初始化前失敗), 此時after不結束任何WINWORD
    let pre = null

    //restoreBinEnv, splitDocx.exe自本機鏡像(取自repo內bin/)取得, 不連外網
    let restoreBinEnv = null

    //watch, 可見Word視窗之監看(規格: 不得開啟可見之Word視窗)
    let watch = null

    //prog, splitDocx.exe之路徑(直接呼叫用)
    let prog = null

    let fpStopOf = (name) => {
        return path.join(fdTmp, `${name}.stop`)
    }

    //genSplit, 內容為: 標記mark+'A', n個填充段落, 分割字串, 標記mark+'B', n個填充段落之docx(分割為2份, 各含自己之標記)
    let genSplit = (name, mark, n) => {
        let texts = [`${mark}A`]
        for (let i = 0; i < n; i++) {
            texts.push(`filler A ${i} lorem ipsum dolor sit amet consectetur adipiscing elit`)
        }
        texts.push(sep, `${mark}B`)
        for (let i = 0; i < n; i++) {
            texts.push(`filler B ${i} lorem ipsum dolor sit amet consectetur adipiscing elit`)
        }
        return genDocx(path.join(fdTmp, `${name}.docx`), texts)
    }

    //startSplit, 以WDocxSplit分割(本套件之對外API), 立即回傳狀態物件c, c.p於分割結束時resolve為c, 不拋錯; 結束後c.x1、c.x2為001.docx、002.docx之內文(無此檔為空字串)
    let startSplit = (fpIn, name) => {
        let fd = path.join(fdOut, name)
        let c = { ok: false, err: '', fd, files: [], x1: '', x2: '', done: false, p: null }
        c.p = WDocxSplit(fpIn, sep, fd, { padZero: 3 })
            .then((v) => {
                c.ok = v === 'ok'
            })
            .catch((e) => {
                c.err = String(e)
            })
            .then(() => {
                c.files = fs.existsSync(fd) ? fs.readdirSync(fd).sort() : []
                c.x1 = docxXml(path.join(fd, '001.docx'))
                c.x2 = docxXml(path.join(fd, '002.docx'))
                c.done = true
                return c
            })
        return c
    }

    //assertSplit, 規格: 分割成功, 001.docx含mark+'A'且不含mark+'B'與分割字串, 002.docx含mark+'B'且不含mark+'A'; 不含other(他行程之未存文字或他分割之標記)
    let assertSplit = (c, mark, others = []) => {
        assert.strict.deepEqual(true, c.ok, c.err)
        assert.strict.deepEqual(['001.docx', '002.docx'], c.files)
        assert.strict.deepEqual([true, false, false], [c.x1.includes(`${mark}A`), c.x1.includes(`${mark}B`), c.x1.includes('systag')], mark)
        assert.strict.deepEqual([true, false], [c.x2.includes(`${mark}B`), c.x2.includes(`${mark}A`)], mark)
        for (let s of others) {
            assert.strict.deepEqual([false, false], [c.x1.includes(s), c.x2.includes(s)], s)
        }
    }

    //runExe, 直接呼叫分割器(略過WDocxSplit), 回傳{ status, out, err }; 分割器以標準輸出回報success或error: ..., 離開碼皆為0
    let runExe = (inp) => {
        let r = spawnSync(prog, [Buffer.from(JSON.stringify(inp), 'utf8').toString('base64')], { encoding: 'latin1', windowsHide: true, timeout: 120000 })
        return { status: r.status, out: String(r.stdout).trim(), err: String(r.stderr).trim() }
    }

    //newPids, 本組開始後新出現之WINWORD
    let newPids = () => {
        return wordPids().filter((v) => !pre.includes(v))
    }

    //untilNewWord, 等(except以外之)新WINWORD出現(即分割器所開之實例), 分割先結束則回傳false
    let untilNewWord = async (c, except = [], ms = 60000) => {
        let t0 = Date.now()
        while (Date.now() - t0 < ms) {
            if (newPids().filter((v) => !except.includes(v)).length > 0) {
                return true
            }
            if (c.done) {
                return false
            }
            await sleep(100)
        }
        return false
    }

    //ownerFiles, 夾內Word之擁有者檔(~$開頭): 可寫開啟時Word於檔旁建立, 唯讀開啟不建立
    let ownerFiles = () => {
        return fs.readdirSync(fdTmp).filter((v) => v.startsWith('~$'))
    }

    //assertHeldIntact, H於分割後仍在, 其後連續2次讀取皆為文件數1且未存文字不變, 自始無讀取失敗
    let assertHeldIntact = async (h) => {
        let i = h.lines.length
        for (let k = 0; k < 2; k++) {
            let { i: j, line } = await h.waitLine(/^(DOCS|ERR)/, i)
            assert.strict.deepEqual(`DOCS 1 ${h.text}`, line)
            i = j + 1
        }
        assert.strict.deepEqual([], h.lines.filter((v) => /^(ERR|STDERR|SPAWNERR)/.test(v)))
        assert.strict.deepEqual(true, wordPids().includes(h.pid), `held WINWORD ${h.pid}`)
    }

    //assertNoVisible, 規格: 自監看第iw行起無可見之Word視窗(等監看再完成一輪後判定)
    let assertNoVisible = async (iw) => {
        assert.strict.deepEqual([], await watch.visibleSince(iw))
    }

    before(async function() {
        this.timeout(120000)

        //前一組之分割器所開之Word可能仍在結束中
        await waitWordGone(wordPids().filter(isAutomationWord), 30000)

        //有其他Word(含使用者開啟者)時不跑本組: 修前(Dispatch)之分割器會借用並以不儲存結束之; ④之他行程以GetActiveObject連上時亦無法確定連上本行程之實例
        let pids = wordPids()
        if (pids.length > 0) {
            console.log(`skip [Word instance isolation]: other WINWORD is running(${pids.join(',')})`)
            this.skip()
        }
        pre = pids

        restoreBinEnv = setBinEnv('WDocxSplit-word-bin')

        //並行分割前先取得分割器至快取, 免兩個分割同時寫快取
        prog = (await WDocxSplit.ensureBins({ names: 'splitDocx.exe' }))['splitDocx.exe']

        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdOut, { recursive: true })

        //先前被強制結束之Word所留下、指向本套件檔案之停用項目, 會使開檔跳出可見訊息框而停住, 先清除
        let rd = clearDisabledItems(path.resolve('.'))
        if (rd.removed.length > 0 || rd.failed.length > 0) {
            console.log(`Word disabled items under this package: ${JSON.stringify(rd)}`)
        }

        watch = await startVisibleWordWatch(fpStopOf('watch'))
    })

    after(async function() {
        this.timeout(60000)

        //nKilledByWatch, 監看結束之可見視窗所屬Word數(被強制結束者亦會留下停用項目)
        let nKilledByWatch = 0
        if (watch) {
            await watch.stop()
            nKilledByWatch = watch.lines.filter((v) => /^KILLED/.test(v)).length
        }

        //收尾: 只結束本組新出現且經COM自動化啟動之WINWORD(各案已斷言不殘留, 此處為失敗時之清理); 有強制結束者(含監看所結束者)再清其可能留下之停用項目
        if (pre !== null) {
            let rk = await killNewAutomationWords(pre)
            if (rk.killed.length > 0 || nKilledByWatch > 0) {
                let rd = clearDisabledItems(path.resolve('.'))
                console.log(`cleanup: killed WINWORD ${JSON.stringify(rk)}, Word disabled items ${JSON.stringify(rd)}`)
            }
        }
        if (restoreBinEnv) {
            restoreBinEnv()
        }
        fs.rmSync(fdTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    it('①他行程已開之Word(含未存文件)不被借用亦不被結束: 分割期間另起WINWORD, 分割完原實例仍在且文件數與未存文字不變, 輸入檔唯讀開啟, 分割器之WINWORD不殘留', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let h = await startHeldWord(fpStopOf('held1'))
        try {
            let c = startSplit(genSplit('held1', 'MarkHeld1', nHeavy), 'held1')

            //規格①: 分割進行中有H以外之WINWORD, 即分割器另起之實例(未借用H)
            assert.strict.deepEqual(true, await untilNewWord(c, [h.pid]), 'split ended before another WINWORD appeared')
            let during = newPids()
            assert.strict.deepEqual(true, during.includes(h.pid) && during.filter((v) => v !== h.pid).length >= 1, JSON.stringify({ during, held: h.pid }))
            let mine = during.filter((v) => v !== h.pid)

            //規格(輸入檔唯讀開啟): 分割器之Word開著輸入檔(實例內已有文件)期間, 輸入檔旁無擁有者檔(~$); 可寫開啟者Word會建立
            let t0 = Date.now()
            while (!c.done && Date.now() - t0 < 60000 && !fs.existsSync(path.join(fdOut, 'held1', '001.docx'))) {
                await sleep(100)
            }
            assert.strict.deepEqual(false, c.done, 'split ended before the first output was written')
            assert.strict.deepEqual([], ownerFiles())
            await c.p

            //規格①: 分割成功, 輸出含來源內容
            assertSplit(c, 'MarkHeld1')

            //規格①: 分割完H仍在, 文件數與未存文字不變
            await assertHeldIntact(h)

            //規格③: 分割器所開之WINWORD分割完即結束
            assert.strict.deepEqual([], await waitWordGone(mine))
        }
        finally {
            await h.stop()
        }
        assert.strict.deepEqual([], await waitWordGone(newPids()))

        //規格: 不得開啟可見之Word視窗
        await assertNoVisible(iw)
    })

    it('③例外路徑亦只結束自己之實例: 輸出路徑無效(輸入檔與輸出文件已開啟後失敗)、輸入檔不存在、輸入檔非docx皆回報error且不產生輸出檔, 他行程之Word仍在且文件不變, 分割器之WINWORD不殘留', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let h = await startHeldWord(fpStopOf('held3'))
        try {
            let fpOk = genSplit('ok3', 'MarkFail', 3)
            let fpTxt = path.join(fdTmp, 'notdocx.docx')
            fs.writeFileSync(fpTxt, 'this is plain text, not a docx')

            //(a)輸出路徑無效: 輸入檔已開啟、輸出文件已新增後SaveAs2失敗, (b)輸入檔不存在: 開啟失敗, (c)輸入檔非docx: 開啟失敗; 分割器以標準輸出回報error: ...(開啟失敗之訊息含該檔名)
            //  fpNone為不得出現之輸出(saveas為輸出夾本身: 分割器不建立輸出夾); fn為錯誤訊息須含之檔名
            let fdNo = path.join(fdTmp, 'no-such-dir', 'o')
            let cases = [
                ['saveas', { fpIn: fpOk, strSep: sep, fdOut: fdNo, padZero: 3 }, fdNo, ''],
                ['open', { fpIn: path.join(fdTmp, 'no-such.docx'), strSep: sep, fdOut: path.join(fdOut, 'o-open'), padZero: 3 }, path.join(fdOut, 'o-open', '001.docx'), 'no-such.docx'],
                ['notdocx', { fpIn: fpTxt, strSep: sep, fdOut: path.join(fdOut, 'o-txt'), padZero: 3 }, path.join(fdOut, 'o-txt', '001.docx'), ''],
            ]
            for (let [name, inp, fpNone, fn] of cases) {
                if (name !== 'saveas') {
                    fs.mkdirSync(inp.fdOut, { recursive: true })
                }
                let rb = runExe(inp)
                assert.strict.deepEqual(true, rb.out.startsWith('error: ') && rb.out.includes(fn), `${name}: ${rb.status} ${rb.out} ${rb.err}`)
                assert.strict.deepEqual(false, fs.existsSync(fpNone), name)

                //規格③: 每一例外之後他行程之Word皆仍在且文件不變
                await assertHeldIntact(h)
            }

            //規格③: 分割器所開之WINWORD皆已結束
            assert.strict.deepEqual([], await waitWordGone(newPids().filter((v) => v !== h.pid)))
        }
        finally {
            await h.stop()
        }
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

    it('②兩行程交錯分割: 甲分割進行中時乙完整分割完一份, 兩者皆成功且輸出完整, 不殘留WINWORD', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let a = startSplit(genSplit('interleaveA', 'MarkInterleaveA', nHeavy), 'interleaveA')

        //甲之Word已啟動(分割進行中)
        assert.strict.deepEqual(true, await untilNewWord(a), 'split A ended before its WINWORD appeared')
        let b = startSplit(genSplit('interleaveB', 'MarkInterleaveB', 3), 'interleaveB')
        await b.p

        //乙分割完時甲仍在進行(兩者確實交錯)
        assert.strict.deepEqual(false, a.done, 'split A ended before B did')
        await a.p

        //規格②: 兩者皆成功, 各自輸出含其來源內容且不含對方之內容
        assert.strict.deepEqual([true, true], [a.ok, b.ok], JSON.stringify({ A: a.err, B: b.err }))
        assertSplit(a, 'MarkInterleaveA', ['MarkInterleaveB'])
        assertSplit(b, 'MarkInterleaveB', ['MarkInterleaveA'])

        //規格③: 不殘留WINWORD
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

    it('②兩行程並行分割同一輸入檔(同時開始、錯開1.5秒, 各2次): 皆成功且輸出完整, 每次結束後不殘留WINWORD', async function() {
        this.timeout(900000)
        let iw = watch.lines.length
        let fpIn = genSplit('race', 'MarkRace', nMid)
        let rs = []
        for (let rep = 0; rep < 2; rep++) {
            for (let off of [0, 1500]) {
                let name = `race-${off}-${rep}`

                //maxWord, 分割期間同時存在之分割器WINWORD數(取樣觀察, 用以確認兩個實例確有重疊)
                let maxWord = 0
                let smp = { on: true }
                let sampler = (async () => {
                    while (smp.on) {
                        maxWord = Math.max(maxWord, newPids().length)
                        await sleep(300)
                    }
                })()

                //off為情境參數(乙晚甲off毫秒開始), 非同步點
                let [a, b] = await Promise.all([
                    startSplit(fpIn, `${name}-a`).p,
                    sleep(off).then(() => startSplit(fpIn, `${name}-b`).p),
                ])
                smp.on = false
                await sampler
                let full = (c) => c.ok && c.files.length === 2 && c.x1.includes('MarkRaceA') && c.x2.includes('MarkRaceB')
                let left = await waitWordGone(newPids())
                rs.push({ name, a: full(a) || a.err, b: full(b) || b.err, maxWord, left })
            }
        }

        //規格②: 0失敗, 兩分割各自一個實例且期間重疊(同一輸入檔, 輸入檔以唯讀開啟故不跳「檔案使用中」); 規格③: 每次結束後不殘留WINWORD
        assert.strict.deepEqual([], rs.filter((v) => v.a !== true || v.b !== true || v.maxWord < 2 || v.left.length > 0), JSON.stringify(rs))
        await assertNoVisible(iw)
    })

    it('④本行程之Word被他行程(舊寫法Dispatch)連上並開文件時: 分割成功, 分割完不結束該實例, 對方之文件保留, 對方用畢結束後不殘留', async function() {
        this.timeout(180000)
        let iw = watch.lines.length
        let b = null
        let x = []
        let c = startSplit(genSplit('borrowed', 'MarkBorrowed', nHeavy), 'borrowed')
        try {

            //x, 分割器之實例(本組開始時無其他Word, 故此時僅此一個)
            assert.strict.deepEqual(true, await untilNewWord(c), 'split ended before its WINWORD appeared')
            x = newPids()
            assert.strict.deepEqual(1, x.length, JSON.stringify(x))

            //他行程以GetActiveObject連上(分割器之Word啟動需時, 有界重試), 待實例內文件數達1(輸入檔已開啟)後新增文件、寫入未存文字
            b = startBorrower(fpStopOf('borrower'), { text: 'unsaved-text-of-the-borrowing-client-408', attachMs: 30000, waitDocs: 1 })
            let { line } = await b.waitLine(/^(ADDED|NOATTACH|VISIBLE|EXIT)/)
            assert.strict.deepEqual('ADDED', line, b.lines.join(' / '))

            //對方新增文件時分割仍在進行(其後分割器收尾才盤點實例內他人之文件)
            assert.strict.deepEqual(false, c.done, 'split ended before the borrower added its document')
            await c.p

            //規格④: 分割成功, 輸出不含對方文件之文字
            assertSplit(c, 'MarkBorrowed', [b.text])

            //規格④: 對方於分割完後仍持有其同一份文件(文件數1, 以其文件參考讀得其未存文字), 即實例與該文件皆未被分割器關閉
            let { line: lt } = await b.waitLine(/^(TEXTSET|SETFAIL|EXIT)/)
            assert.strict.deepEqual('TEXTSET', lt, b.lines.join(' / '))
            await b.stop()
            assert.strict.deepEqual(true, b.lines.includes(`DOCS 1 ${b.text}`), b.lines.join(' / '))
            b = null
        }
        finally {
            if (b) {
                await b.stop()
            }
            await c.p
        }

        //對方用畢以Quit結束該實例, 不殘留
        assert.strict.deepEqual([], await waitWordGone(x))
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

    it('⑤輸出路徑即輸入檔(輸入檔為輸出夾內之001.docx)時照改前行為: Word拒絕與開啟文件同名之儲存而回報錯誤, 輸入檔不變, 不殘留WINWORD', async function() {
        this.timeout(180000)
        let iw = watch.lines.length

        //規格(不得改變分割之輸出與對外API): 改前以Dispatch開啟之輸入檔與輸出為同一路徑時, Word回報-2146823135(無法給一個與開啟文件相同的檔名), WDocxSplit以[E_SPLIT_FAILED]reject; 唯讀開啟時同一錯誤(例外為保留改前語意, 於本機不可觀察)
        let fdS = path.join(fdOut, 'same')
        let fpS = genSplit('same-src', 'MarkSame', 3)
        fs.mkdirSync(fdS, { recursive: true })
        let fpIn = path.join(fdS, '001.docx')
        fs.copyFileSync(fpS, fpIn)
        let bytes = fs.readFileSync(fpIn)
        let err = await WDocxSplit(fpIn, sep, fdS, { padZero: 3 }).then(() => null).catch((e) => String(e))
        assert.strict.deepEqual(true, typeof err === 'string' && err.startsWith('[E_SPLIT_FAILED] ') && err.includes('-2146823135'), String(err))
        assert.strict.deepEqual(true, fs.readFileSync(fpIn).equals(bytes))
        assert.strict.deepEqual(['001.docx'], fs.readdirSync(fdS))
        assert.strict.deepEqual([], await waitWordGone(newPids()))
        await assertNoVisible(iw)
    })

})
