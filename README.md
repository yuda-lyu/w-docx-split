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
