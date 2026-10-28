//子行程工具: 於他處工作目錄(由呼叫端以cwd指定)載入指定路徑之WDocxSplit.mjs並執行分割, 輸出結果JSON
//供test/WDocxSplit.test.mjs模擬套件被安裝為相依套件(套件夾內無執行檔、工作目錄為使用者專案)時之行為
//用法: node test/tools/splitChild.mjs <WDocxSplit.mjs之絕對路徑> <fpIn> <strSep> <fdOut>
import { pathToFileURL } from 'url'


let [fpMod, fpIn, strSep, fdOut] = process.argv.slice(2)
let { default: WDocxSplit } = await import(pathToFileURL(fpMod).href)

let r = null
let err = null
await WDocxSplit(fpIn, strSep, fdOut, { padZero: 3 })
    .then((v) => {
        r = v
    })
    .catch((e) => {
        err = e
    })

console.log(JSON.stringify({
    cwd: process.cwd(),
    r,
    err: err === null ? null : String(err),
}))
