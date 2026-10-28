import fs from 'fs'
import os from 'os'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import assert from 'assert'
import { spawnSync } from 'child_process'
import ensureBins from '../src/ensureBins.mjs'
import autoDownloadFiles from '../src/autoDownloadFiles.mjs'
import WDocxSplit from '../src/WDocxSplit.mjs'


//規格: 外部執行檔之存放下載校驗與離線(制式規格) D1、D3、D4、O1、O2、O3、E2、E3、§8 T3~T7(T8為主幹模式, 本套件為釘選模式, 不適用)
//以本機HTTP伺服器扮raw.githubusercontent.com(自有檔網址為<repo>/<commit>/<path>), 以本地資料夾扮鏡像, 全程不連外網; 取得之檔為repo內bin/splitDocx.exe之實檔
describe(`ensureBins`, function() {
    this.timeout(180000)

    let port = 8967
    let fdt = path.resolve('./test/_tmp/ensureBins')
    let keys = ['W_BIN_MIRROR', 'W_BIN_CACHE', 'W_BIN_OFFLINE']
    let bkEnv = {}

    let manifest = JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
    let ent = manifest.files[0]
    let name = ent.name
    let bytes = fs.readFileSync(ent.path)
    let bad = Buffer.from(bytes) //與實檔同大小而內容不同
    bad[1000] = bad[1000] ^ 0xff
    let urlPath = `/${manifest.repo}/${manifest.commit}/${ent.path}`

    let body = bytes //伺服器目前回傳之內容
    let status = 200 //伺服器目前回傳之狀態碼
    let urls = [] //伺服器收到之請求路徑
    let server = null
    let seq = 0
    let cacheDir = ''

    let sha256Of = (fp) => {
        return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')
    }

    //fetchLocal, 僅放行raw.githubusercontent.com之網址並改指本機伺服器, 其餘一律拒絕(確保測試不連外網)
    let fetchLocal = (url, init) => {
        let u = String(url)
        if (!u.startsWith('https://raw.githubusercontent.com/')) {
            return Promise.reject(new Error(`unexpected url[${u}]`))
        }
        return globalThis.fetch(u.replace('https://raw.githubusercontent.com', `http://127.0.0.1:${port}`), init)
    }

    //noNet, 被呼叫即代表連網
    let nNet = 0
    let noNet = () => {
        nNet++
        return Promise.reject(new Error('network must not be used'))
    }

    let catchErr = (pm) => {
        return pm.then(() => null).catch((e) => e)
    }

    let putMirror = (fdMirror, buf) => {
        let fd = path.join(fdMirror, manifest.pkg, ent.sha256)
        fs.mkdirSync(fd, { recursive: true })
        fs.writeFileSync(path.join(fd, name), buf)
        return path.join(fd, name)
    }

    let listFiles = (fd) => {
        if (!fs.existsSync(fd)) {
            return []
        }
        return fs.readdirSync(fd, { recursive: true, withFileTypes: true }).filter((v) => v.isFile()).map((v) => path.join(v.parentPath, v.name))
    }

    before(async function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.mkdirSync(fdt, { recursive: true })
        server = http.createServer((req, res) => {
            urls.push(req.url)
            if (req.url === urlPath) {
                res.writeHead(status, { 'content-length': String(body.length) })
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
    })

    after(async function() {
        await new Promise((resolve) => {
            server.close(resolve)
        })
        fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    beforeEach(function() {
        for (let k of keys) {
            bkEnv[k] = process.env[k]
            delete process.env[k]
        }
        body = bytes
        status = 200
        urls.length = 0
        nNet = 0
        seq++
        cacheDir = path.join(fdt, `cache${seq}`)
    })

    afterEach(function() {
        for (let k of keys) {
            if (bkEnv[k] === undefined) {
                delete process.env[k]
            }
            else {
                process.env[k] = bkEnv[k]
            }
        }
    })

    it(`T3: first call downloads from the pinned-commit url of GitHub, verifies and caches; second call hits the verified cache without network (D3, D4, O2)`, async function() {
        //規格D3: 快取位置<快取>/<sha256>/<name>; O2: 快取未命中時自GitHub(釘選提交)取得
        let r1 = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        let fp = path.join(cacheDir, ent.sha256, name)
        assert.strict.deepStrictEqual(Object.keys(r1), [name])
        assert.strict.equal(r1[name], fp)
        assert.strict.equal(sha256Of(fp), ent.sha256)
        assert.strict.equal(fs.statSync(fp).size, ent.size)
        assert.strict.deepStrictEqual(urls, [urlPath]) //M2: 網址ref為清單之40碼提交, 非master、非releases/latest
        assert.strict.deepStrictEqual(listFiles(cacheDir), [fp]) //只存最終檔, 無暫存殘留

        //規格D4: 第二次不連網(快取命中並校驗)
        let r2 = await ensureBins({ fetch: noNet, cacheDir, mirror: '', offline: false })
        assert.strict.equal(r2[name], fp)
        assert.strict.equal(nNet, 0)
        assert.strict.equal(urls.length, 1)
    })

    it(`T3: concurrent calls share one download (E2)`, async function() {
        //原autoDownloadFiles以pmDownload使併發呼叫共用同一次下載, 改用ensureBins後須維持
        let rs = await Promise.all([1, 2, 3].map(() => ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })))
        assert.strict.deepStrictEqual(rs.map((r) => r[name]), [1, 2, 3].map(() => path.join(cacheDir, ent.sha256, name)))
        assert.strict.equal(urls.length, 1)
    })

    it(`T4: content or size not matching the manifest is refused and leaves no file (D2, E3)`, async function() {
        for (let [label, b, code] of [
            ['same size, different content', bad, 'E_HASH_MISMATCH'],
            ['truncated', bytes.subarray(0, bytes.length - 10), 'E_SIZE_MISMATCH'],
            ['longer', Buffer.concat([bytes, Buffer.from('x')]), 'E_SIZE_MISMATCH'],
        ]) {
            body = b
            let err = await catchErr(ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false, maxAttempts: 1, retryDelayMs: 0 }))
            assert.strict.equal(err instanceof Error, true, label)
            assert.strict.equal(err.code, code, `${label}: ${err && err.message}`)
            assert.strict.deepStrictEqual(listFiles(cacheDir), [], label)
        }
    })

    it(`T4: an HTTP error status is refused and leaves no file (D2, E3)`, async function() {
        body = Buffer.from('not found')
        status = 404
        let err = await catchErr(ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false, maxAttempts: 1, retryDelayMs: 0 }))
        assert.strict.equal(err instanceof Error, true)
        assert.strict.equal(err.code, 'E_HTTP', err && err.message)
        assert.strict.deepStrictEqual(listFiles(cacheDir), [])
    })

    it(`T5: W_BIN_MIRROR (local folder) is used before GitHub, and the mirror copy is verified (O1, O2)`, async function() {
        let fdMirror = path.join(fdt, `mirror${seq}`)
        let fpMirror = putMirror(fdMirror, bytes)
        process.env.W_BIN_MIRROR = fdMirror

        //鏡像命中: 不連網
        let r = await ensureBins({ fetch: noNet, cacheDir, offline: false })
        assert.strict.equal(r[name], path.join(cacheDir, ent.sha256, name))
        assert.strict.equal(sha256Of(r[name]), ent.sha256)
        assert.strict.equal(nNet, 0)
        assert.strict.equal(fs.existsSync(fpMirror), true)
    })

    it(`T5: a tampered mirror copy is refused; online it falls back to GitHub, offline it is E_OFFLINE_MISSING (O2, O3)`, async function() {
        let fdMirror = path.join(fdt, `mirror${seq}`)
        putMirror(fdMirror, bad)
        process.env.W_BIN_MIRROR = fdMirror

        //連網時: 拒用鏡像, 改自GitHub取得正確之檔
        let r = await ensureBins({ fetch: fetchLocal, cacheDir, offline: false })
        assert.strict.equal(sha256Of(r[name]), ent.sha256)
        assert.strict.deepStrictEqual(urls, [urlPath])

        //離線時: 鏡像是唯一來源, 其不符即視為缺檔, 不留檔
        let cacheDir2 = path.join(fdt, `cache${seq}b`)
        let err = await catchErr(ensureBins({ fetch: noNet, cacheDir: cacheDir2, offline: true }))
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        assert.strict.equal(nNet, 0)
        assert.strict.deepStrictEqual(listFiles(cacheDir2), [])
    })

    it(`T6: W_BIN_OFFLINE=1 without cache or mirror is E_OFFLINE_MISSING naming the file, sha256, size and the path to place it (O3, D3)`, async function() {
        process.env.W_BIN_OFFLINE = '1'
        process.env.W_BIN_CACHE = path.join(fdt, `shared${seq}`)
        let err = await catchErr(ensureBins({ fetch: noNet }))
        assert.strict.equal(err instanceof Error, true)
        assert.strict.equal(err.code, 'E_OFFLINE_MISSING', err.message)
        assert.strict.equal(nNet, 0)
        assert.strict.equal(urls.length, 0)

        //D3: 共用快取之結構為<W_BIN_CACHE>/<套件>/<sha256>/<name>
        let m = err.missing[0]
        assert.strict.equal(m.name, name)
        assert.strict.equal(m.sha256, ent.sha256)
        assert.strict.equal(m.size, ent.size)
        assert.strict.equal(m.cachePath, path.join(process.env.W_BIN_CACHE, manifest.pkg, ent.sha256, name))
        for (let s of [name, ent.sha256, String(ent.size), m.cachePath]) {
            assert.strict.equal(err.message.includes(s), true, `message should include [${s}]`)
        }
    })

    it(`T6: with an offline mirror configured, the error also names the mirror path (O3, O1)`, async function() {
        let fdMirror = path.join(fdt, `mirror${seq}`) //不存在之鏡像
        let err = await catchErr(ensureBins({ fetch: noNet, cacheDir, mirror: fdMirror, offline: true }))
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        let fpMirror = path.join(fdMirror, manifest.pkg, ent.sha256, name)
        assert.strict.equal(err.missing[0].mirrorPath, fpMirror)
        assert.strict.equal(err.message.includes(fpMirror), true)
    })

    it(`T7: a tampered cache file is refused and fetched again (D4)`, async function() {
        let r = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        let fp = r[name]
        assert.strict.equal(urls.length, 1)

        //同大小而內容不同
        fs.writeFileSync(fp, bad)
        fs.utimesSync(fp, 1, 1)
        let r2 = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        assert.strict.equal(r2[name], fp)
        assert.strict.equal(sha256Of(fp), ent.sha256)
        assert.strict.equal(urls.length, 2)

        //被截斷(大小不同)
        fs.writeFileSync(fp, bytes.subarray(0, 100))
        fs.utimesSync(fp, 1, 1)
        let r3 = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        assert.strict.equal(sha256Of(r3[name]), ent.sha256)
        assert.strict.equal(urls.length, 3)
    })

    it(`T7: offline, a tampered cache file is never returned (D4, O3)`, async function() {
        let r = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        fs.writeFileSync(r[name], bad)
        fs.utimesSync(r[name], 1, 1)
        let err = await catchErr(ensureBins({ fetch: noNet, cacheDir, mirror: '', offline: true }))
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        assert.strict.equal(nNet, 0)
    })

    it(`should read W_BIN_CACHE, W_BIN_MIRROR and W_BIN_OFFLINE (D3, O1, O3)`, async function() {
        let fdMirror = path.join(fdt, `mirror${seq}`)
        putMirror(fdMirror, bytes)
        process.env.W_BIN_CACHE = path.join(fdt, `shared${seq}`)
        process.env.W_BIN_MIRROR = fdMirror
        process.env.W_BIN_OFFLINE = '1'
        let r = await ensureBins({ fetch: noNet })
        //D3: 共用快取為<W_BIN_CACHE>/<套件>/<sha256>/<name>
        assert.strict.equal(r[name], path.join(process.env.W_BIN_CACHE, manifest.pkg, ent.sha256, name))
        assert.strict.equal(sha256Of(r[name]), ent.sha256)
        assert.strict.equal(nNet, 0)
    })

    it(`should place the default cache under the package root even when the module is loaded from another working directory (D3)`, function() {
        //pkgRoot於模組載入時決定, 故以子行程於他處工作目錄載入(被安裝為相依套件時, 載入時之工作目錄為使用者專案而非套件根)
        let env = { ...process.env }
        for (let k of keys) {
            delete env[k]
        }
        let cwdOther = os.tmpdir()
        let r = spawnSync(process.execPath, [path.resolve('test/tools/ensureBinsChild.mjs'), path.resolve('src/ensureBins.mjs')], { cwd: cwdOther, env, encoding: 'utf8', windowsHide: true })
        assert.strict.equal(r.status, 0, r.stderr)
        let o = JSON.parse(r.stdout.trim().split('\n').pop())
        assert.strict.equal(path.resolve(o.cwd), path.resolve(cwdOther)) //確實於他處載入
        assert.strict.equal(o.code, 'E_OFFLINE_MISSING')
        assert.strict.equal(o.cachePath, path.join(path.resolve('.'), 'bin-cache', ent.sha256, name))
    })

    it(`should not forward floatingManifestUrl, which would change the trust anchor of the manifest (E2)`, async function() {
        //floatingManifestUrl只在主幹模式生效, 但被轉傳時無效值會使fsEnsureBins以E_ARG拒絕; 套件端丟棄它故仍正常取得
        let fdMirror = path.join(fdt, `mirror${seq}`)
        putMirror(fdMirror, bytes)
        let r = await ensureBins({ cacheDir, fetch: noNet, mirror: fdMirror, offline: true, floatingManifestUrl: 'not-a-valid-url' })
        assert.strict.equal(sha256Of(r[name]), ent.sha256)
        assert.strict.equal(nNet, 0)
    })

    it(`should export ensureBins as the static property WDocxSplit.ensureBins so the default export (UMD) stays unchanged (D1, E2)`, function() {
        assert.strict.equal(WDocxSplit.ensureBins, ensureBins)
        assert.strict.equal(typeof WDocxSplit, 'function')
    })

})


//規格: E2(舊下載入口autoDownloadFiles為對外深層匯入點, 改為經ensureBins之薄包裝並標@deprecated)
//autoDownloadFiles無法注入fetch, 故以全域fetch之攔截確保不連外網(被呼叫即記錄並拋錯)
describe(`autoDownloadFiles (deprecated wrapper of ensureBins)`, function() {
    this.timeout(120000)

    let fdt = path.resolve('./test/_tmp/autoDownloadFiles')
    let manifest = JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
    let ent = manifest.files[0]
    let keys = ['W_BIN_CACHE', 'W_BIN_MIRROR', 'W_BIN_OFFLINE']
    let bak = {}
    let fetchBak = null
    let netCalls = []

    before(function() {
        fetchBak = globalThis.fetch
        globalThis.fetch = (url) => {
            netCalls.push(String(url))
            throw new Error(`network access is forbidden in tests: ${url}`)
        }
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.mkdirSync(`${fdt}/mirror/${manifest.pkg}/${ent.sha256}`, { recursive: true })
        fs.copyFileSync(ent.path, `${fdt}/mirror/${manifest.pkg}/${ent.sha256}/${ent.name}`)
        for (let k of keys) {
            bak[k] = process.env[k]
        }
        process.env.W_BIN_CACHE = `${fdt}/cache`
        process.env.W_BIN_MIRROR = `${fdt}/mirror`
        process.env.W_BIN_OFFLINE = '1'
    })

    beforeEach(function() {
        netCalls.length = 0
    })

    after(function() {
        globalThis.fetch = fetchBak
        for (let k of keys) {
            if (bak[k] === undefined) {
                delete process.env[k]
            }
            else {
                process.env[k] = bak[k]
            }
        }
        fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    it(`should keep returning { fpExe } of the verified cached file, not a path under src/ (E2, D3)`, async function() {
        let r = await autoDownloadFiles()
        assert.strict.deepStrictEqual(netCalls, [])
        assert.strict.deepStrictEqual(Object.keys(r), ['fpExe'])
        assert.strict.equal(r.fpExe, path.resolve(fdt, 'cache', manifest.pkg, ent.sha256, ent.name))
        let h = crypto.createHash('sha256').update(fs.readFileSync(r.fpExe)).digest('hex')
        assert.strict.equal(h, ent.sha256)
    })

    it(`should resolve the same path as ensureBins and share concurrent calls (E2)`, async function() {
        let rs = await Promise.all([autoDownloadFiles(), autoDownloadFiles(), autoDownloadFiles()])
        assert.strict.equal(new Set(rs.map((v) => v.fpExe)).size, 1)
        let bins = await ensureBins({ names: ent.name })
        assert.strict.equal(rs[0].fpExe, bins[ent.name])
        assert.strict.deepStrictEqual(netCalls, [])
    })

    it(`should reject with the code-bearing Error of ensureBins when the file is unavailable offline (E3)`, async function() {
        let fdCache = `${fdt}/cache-empty`
        let bakC = process.env.W_BIN_CACHE
        let bakM = process.env.W_BIN_MIRROR
        process.env.W_BIN_CACHE = fdCache
        delete process.env.W_BIN_MIRROR
        let err = null
        try {
            await autoDownloadFiles()
        }
        catch (e) {
            err = e
        }
        finally {
            process.env.W_BIN_CACHE = bakC
            process.env.W_BIN_MIRROR = bakM
        }
        assert.strict.equal(err instanceof Error, true)
        assert.strict.equal(err.code, 'E_OFFLINE_MISSING', err && err.message)
        assert.strict.equal(err.message.includes(path.join(fdCache, manifest.pkg, ent.sha256, ent.name)), true, err.message)
        assert.strict.deepStrictEqual(netCalls, [])
    })

})
