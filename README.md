# w-docx-split
A tool for split docx.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-docx-split.svg?style=flat)](https://npmjs.org/package/w-docx-split) 
[![license](https://img.shields.io/npm/l/w-docx-split.svg?style=flat)](https://npmjs.org/package/w-docx-split) 
[![npm download](https://img.shields.io/npm/dt/w-docx-split.svg)](https://npmjs.org/package/w-docx-split) 
[![npm download](https://img.shields.io/npm/dm/w-docx-split.svg)](https://npmjs.org/package/w-docx-split) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-docx-split.svg)](https://www.jsdelivr.com/package/npm/w-docx-split)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-docx-split/global.html).

## Core
> `w-docx-split` is based on the `win32com` in `python`, and only run in `Windows`.

## Installation

### Using npm(ES6 module):
```alias
npm i w-docx-split
```

#### Example:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-docx-split/blob/master/g.mjs)]
```alias
import w from 'wsemi'
import WDocxSplit from './src/WDocxSplit.mjs'
//import WDocxSplit from 'w-docx-split/src/WDocxSplit.mjs'
//import WDocxSplit from 'w-docx-split'

async function test() {

    let fpIn = `./test/docin.docx`
    let strSep = '[systag:sepline]'
    let fdOut = `./test/out`
    let opt = {
        padZero: 3,
    }

    let r = await WDocxSplit(fpIn, strSep, fdOut, opt)
    console.log(r)
    // => ok

    w.fsDeleteFolder(fdOut)

}
test()
    .catch((err) => {
        console.log('catch', err)
    })
```

## 外部執行檔

本套件執行時需要下列外部執行檔，不含於 npm 包：

| 檔名 | 用途 | 來源 |
|---|---|---|
| splitDocx.exe | 以 Word 依指定字串分割 docx（僅 Windows） | 本套件 GitHub repo 之 `bin/`（釘選提交） |

- 首次使用到分割功能時自動下載（或預先呼叫本套件匯出之 `ensureBins()`），以 `bin/manifest.json` 所載之 SHA-256 與大小校驗後存於 `<套件根>/bin-cache/`；之後自快取取得（亦校驗）。安裝時不下載。
- 環境變數：
  - `W_BIN_CACHE=<資料夾>`：快取改放 `<資料夾>/w-docx-split/`（套件所在之 `node_modules` 唯讀時使用，多套件可共用同一資料夾）。
  - `W_BIN_MIRROR=<資料夾或 http(s) 網址>`：內網鏡像，先找鏡像再連 GitHub；結構為 `<鏡像>/w-docx-split/<sha256>/splitDocx.exe`。鏡像之檔同樣以清單校驗，不符即不用。
  - `W_BIN_OFFLINE=1`：不連網，只用快取與鏡像；缺檔時錯誤（`E_OFFLINE_MISSING`）會列出缺哪些檔、sha256、大小與應放之完整路徑。
- 離線部署：
  1. 在可連網之電腦設 `W_BIN_CACHE=<空資料夾>`，呼叫本套件之 `ensureBins()` 一次（或使用到分割功能一次）。
  2. 把該資料夾整個帶到內網電腦，設 `W_BIN_MIRROR=<該資料夾>`（全離線時另設 `W_BIN_OFFLINE=1`）。
- 取不到執行檔時，`WDocxSplit()` 以字串 reject，格式為 `[錯誤代碼] 原因`（如 `[E_OFFLINE_MISSING] …`）；`ensureBins()` 則 reject 帶 `code` 之 Error。
- 舊版之 `src/autoDownloadFiles.mjs` 保留為經 `ensureBins` 之相容層（已標 `@deprecated`），回傳之路徑位於快取而非 `src/`。

```alias
import ensureBins from 'w-docx-split/src/ensureBins.mjs'
//import WDocxSplit from 'w-docx-split'
//亦可用 WDocxSplit.ensureBins()

async function test() {

    //部署前預先取得外部執行檔
    let bins = await ensureBins()
    console.log(bins['splitDocx.exe'])
    // => D:\xxx\node_modules\w-docx-split\bin-cache\<sha256>\splitDocx.exe

}
test()
    .catch((err) => {
        console.log('catch', err)
    })
```
