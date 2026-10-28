import fs from 'fs'
import path from 'path'
import assert from 'assert'
import crypto from 'crypto'
import { execSync, execFileSync } from 'child_process'
import fsGetBinManifestEntry from 'wsemi/src/fsGetBinManifestEntry.mjs'
import fsEnsureBins from 'wsemi/src/fsEnsureBins.mjs'


//規格: 外部執行檔之存放下載校驗與離線(制式規格) S1、S2、S5、M1、M2、M4、F12、§8 T1、T2
describe(`bin/manifest.json`, function() {
    this.timeout(120000)

    let fdt = './test/_tmp/binManifest'
    let fdDecoy = './bin-cache/_decoy_'

    //manifest, 於it內讀取(缺清單時為單案失敗而非整檔載入失敗)
    let readManifest = () => {
        return JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
    }

    //lines, 讀取設定檔之各行
    let lines = (fn) => {
        return fs.readFileSync(fn, 'utf8').split(/\r?\n/).map((v) => v.trim())
    }

    after(function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.rmSync(fdDecoy, { recursive: true, force: true })
        try {
            fs.rmdirSync('./bin-cache') //本檔建立且已空時移除, 他處已有快取(非空)時略過
        }
        catch (err) {}
        try {
            fs.rmdirSync('./test/_tmp') //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    it(`should declare the pinned manifest of this package listing only bin/splitDocx.exe as an own file (M1, M2, S2)`, function() {
        let manifest = readManifest()
        assert.strict.equal(manifest.schema, 1)
        assert.strict.equal(manifest.pkg, 'w-docx-split')
        assert.strict.equal(manifest.mode, 'pinned')
        assert.strict.equal(manifest.repo, 'yuda-lyu/w-docx-split')
        assert.strict.equal(/^[0-9a-f]{40}$/.test(manifest.commit), true, manifest.commit) //M2/F15: 釘選之自有檔網址ref須為40碼提交
        assert.strict.deepStrictEqual(manifest.files.map((v) => [v.name, v.path]), [['splitDocx.exe', 'bin/splitDocx.exe']])
        assert.strict.equal(manifest.files[0].url, undefined) //自有檔取自本repo, 非廠商網址
    })

    it(`should pass the schema check of fsEnsureBins (M1, M2)`, async function() {
        //離線且快取為空資料夾: 清單有效時為E_OFFLINE_MISSING(缺檔), 清單無效時為E_MANIFEST; 不連網
        let err = null
        try {
            await fsEnsureBins('bin/manifest.json', { pkgRoot: '.', cacheDir: `${fdt}/cache`, mirror: '', offline: true })
        }
        catch (e) {
            err = e
        }
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
    })

    it(`should match the real files in bin/ (M4, T2)`, async function() {
        let manifest = readManifest()
        for (let f of manifest.files) {
            for (let p of [f, ...(f.parts || [])]) {
                if (typeof p.path === 'string') {
                    let e = await fsGetBinManifestEntry(p.path)
                    assert.strict.deepStrictEqual([e.sha256, e.size], [p.sha256, p.size], p.path)
                }
            }
        }
    })

    it(`should pin a commit whose bin/splitDocx.exe bytes equal the manifest and the working tree (M2, U1)`, async function() {
        let manifest = readManifest()
        let git = (args, opt = {}) => {
            return execFileSync('git', args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opt })
        }

        //淺層clone(如CI)不含該提交, 略過
        if (git(['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true') {
            this.skip()
        }

        //GitHub原始檔網址<repo>/<commit>/<path>回傳該提交內之位元組, 故須等於清單之雜湊與工作樹之實檔
        git(['cat-file', '-e', `${manifest.commit}^{commit}`], { stdio: 'ignore' })
        let b = git(['show', `${manifest.commit}:${manifest.files[0].path}`])
        assert.strict.equal(crypto.createHash('sha256').update(b).digest('hex'), manifest.files[0].sha256)
        assert.strict.equal(b.length, manifest.files[0].size)
        assert.strict.equal(b.equals(fs.readFileSync(manifest.files[0].path)), true)
    })

    it(`should keep the legacy src/splitDocx.exe identical to bin/splitDocx.exe (S2, older versions download it from master)`, async function() {
        //舊版於執行時自主幹src/splitDocx.exe下載, 該檔須保留於repo(不入npm包, 見T1)且與bin/之檔位元相同
        let a = await fsGetBinManifestEntry('bin/splitDocx.exe')
        let b = await fsGetBinManifestEntry('src/splitDocx.exe')
        assert.strict.deepStrictEqual([b.sha256, b.size], [a.sha256, a.size])
    })

    it(`should keep the cache out of git and the npm package (S5) and bin/ out of the npm package except the manifest (S1)`, function() {
        assert.strict.equal(lines('.gitignore').includes('/bin-cache/'), true)
        assert.strict.equal(lines('.npmignore').includes('/bin-cache/'), true)
        assert.strict.equal(lines('.npmignore').includes('/test/_tmp/'), true)
        assert.strict.equal(lines('.npmignore').includes('/bin/*'), true)
        assert.strict.equal(lines('.npmignore').includes('!/bin/manifest.json'), true)
        assert.strict.equal(lines('.npmignore').includes('src/splitDocx.exe'), true) //舊路徑檔不入包
        assert.strict.equal(lines('.gitattributes').includes('bin/** binary'), true) //F12
    })

    it(`should not pack external executables into the npm package, only bin/manifest.json (S1, S5, T1)`, function() {
        //先放誘餌檔使缺規則時確定性變紅: 測試暫存(他測試平行執行時放有執行檔副本)與快取夾內各放一個
        fs.mkdirSync(`${fdt}/leak`, { recursive: true })
        fs.writeFileSync(`${fdt}/leak/splitDocx.exe`, 'MZ')
        fs.mkdirSync(fdDecoy, { recursive: true })
        fs.writeFileSync(`${fdDecoy}/splitDocx.exe`, 'MZ')

        let r = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }))
        let info = Array.isArray(r) ? r[0] : Object.values(r)[0] //npm 11以前為陣列, npm 12起為以套件名為鍵之物件
        let fps = info.files.map((v) => v.path)
        assert.strict.deepStrictEqual(fps.filter((v) => /\.(exe|dll|msi|zip|7z|\d{3})$/i.test(v)), [])
        assert.strict.deepStrictEqual(fps.filter((v) => v.startsWith('bin/') || v.startsWith('bin-cache/')), ['bin/manifest.json'])
        assert.strict.equal(fps.includes('src/splitDocx.exe'), false)
        assert.strict.deepStrictEqual(fps.filter((v) => v.startsWith('test/_tmp/') || v.startsWith('sgud/') || v.startsWith('tmp/')), [])
    })

})


//規格 D1、E2: 套件端不得自寫下載, 且不得於postinstall下載
describe(`no self-written download in src/ (D1, E2)`, function() {

    let fdSrc = './src'

    it(`should not import fsDownloadFile nor fetch binaries by itself in any src/*.mjs`, function() {
        let fps = fs.readdirSync(fdSrc).filter((v) => v.endsWith('.mjs')).map((v) => path.join(fdSrc, v))
        assert.strict.equal(fps.length > 0, true)
        for (let fp of fps) {
            let c = fs.readFileSync(fp, 'utf8')
            assert.strict.equal(/fsDownloadFile(?!Verify)/.test(c), false, `${fp} imports fsDownloadFile`)
            assert.strict.equal(/raw\/refs\/heads|raw\.githubusercontent\.com|\bfetch\s*\(|https?:\/\/github\.com/.test(c), false, `${fp} downloads by itself`)
        }
    })

    it(`should have removed src/downloadFiles.mjs and scripts/install.mjs`, function() {
        assert.strict.equal(fs.existsSync('src/downloadFiles.mjs'), false)
        assert.strict.equal(fs.existsSync('scripts/install.mjs'), false)
    })

    it(`should not download at install time: no install-time script (D1)`, function() {
        let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        for (let k of ['preinstall', 'install', 'postinstall']) {
            assert.strict.equal(Object.prototype.hasOwnProperty.call(pkg.scripts, k), false, k)
        }
    })

    it(`should depend on a wsemi that provides fsEnsureBins (E1, E4: 1.9.27 or later)`, function() {
        let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        let m = /^\^?(\d+)\.(\d+)\.(\d+)$/.exec(pkg.dependencies.wsemi)
        assert.strict.notEqual(m, null, pkg.dependencies.wsemi)
        let [, a, b, c] = m.map(Number)
        assert.strict.equal(a > 1 || (a === 1 && (b > 9 || (b === 9 && c >= 27))), true, pkg.dependencies.wsemi)
    })

})


//規格 §9: rollup UMD之套件, toolg/gDistRollup.mjs之external/globals須含新增import之內建模組
describe(`rollup externals for the UMD build (§9)`, function() {

    it(`should list url, crypto, stream and stream/promises in both globals and external of toolg/gDistRollup.mjs`, function() {
        let c = fs.readFileSync('toolg/gDistRollup.mjs', 'utf8')
        for (let n of ['url', 'crypto', 'stream', 'stream/promises']) {
            assert.strict.equal(c.includes(`        '${n}',`), true, `external lacks ${n}`)
            assert.strict.equal(c.includes(`'${n}': '${n}',`), true, `globals lacks ${n}`)
        }
    })

})
