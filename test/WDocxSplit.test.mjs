import fs from 'fs'
import path from 'path'
import http from 'http'
import { spawnSync } from 'child_process'
import w from 'wsemi'
import assert from 'assert'
import WDocxSplit from '../src/WDocxSplit.mjs'


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
