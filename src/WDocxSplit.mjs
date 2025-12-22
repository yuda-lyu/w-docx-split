import path from 'path'
import process from 'process'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import isp0int from 'wsemi/src/isp0int.mjs'
import str2b64 from 'wsemi/src/str2b64.mjs'
import execProcess from 'wsemi/src/execProcess.mjs'
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsCreateFolder from 'wsemi/src/fsCreateFolder.mjs'


let fdSrv = path.resolve()


function isWindows() {
    return process.platform === 'win32'
}


/**
 * 依照指定字串分割Docx檔
 *
 * @param {String} fpIn 輸入來源Html檔位置字串
 * @param {String} strSep 輸入內文會提供之分割字串
 * @param {String} fdOut 輸入轉出Docx檔位置字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.padZero=0] 輸入是否補0位數整數，例如padZero=3時檔名會變成001.docx，預設0
 * @returns {Promise} 回傳Promise，resolve回傳成功訊息，reject回傳錯誤訊息
 * @example
 *

 *
 */
async function WDocxSplit(fpIn, strSep, fdOut, opt = {}) {
    let errTemp = null

    //isWindows
    if (!isWindows()) {
        return Promise.reject('operating system is not windows')
    }

    //check
    if (!fsIsFile(fpIn)) {
        return Promise.reject(`fpIn[${fpIn}] does not exist`)
    }

    //check
    if (!isestr(strSep)) {
        return Promise.reject(`strSep[${strSep}] is not an effective string`)
    }

    //check
    if (!fsIsFolder(fdOut)) {
        fsCreateFolder(fdOut)
    }

    //padZero
    let padZero = get(opt, 'padZero')
    if (!isp0int(padZero)) {
        padZero = 0
    }

    //轉絕對路徑
    fpIn = path.resolve(fpIn)
    fdOut = path.resolve(fdOut)

    //fnExe
    let fnExe = `splitDocx.exe`

    //fdExe
    let fdExe = ''
    if (true) {
        let fdExeSrc = `${fdSrv}/src/`
        let fdExeNM = `${fdSrv}/node_modules/w-docx-split/src/`
        if (fsIsFile(`${fdExeSrc}${fnExe}`)) {
            fdExe = fdExeSrc
        }
        else if (fsIsFile(`${fdExeNM}${fnExe}`)) {
            fdExe = fdExeNM
        }
        else {
            return Promise.reject('can not find folder for html2docx')
        }
    }
    // console.log('fdExe', fdExe)

    //prog
    let prog = `${fdExe}${fnExe}`
    // console.log('prog', prog)

    //inp
    let inp = {
        fpIn,
        strSep,
        fdOut,
        padZero,
    }
    // console.log('inp', inp)

    //input to b64
    let cInput = JSON.stringify(inp)
    let b64Input = str2b64(cInput)
    // console.log('b64Input', b64Input)

    //execProcess
    await execProcess(prog, b64Input)
        .catch((err) => {
            console.log('execProcess catch', err)
            errTemp = err.toString()
        })

    //check
    if (errTemp) {
        return Promise.reject(errTemp)
    }

    // //check
    // if (!isestr(output)) {
    //     return Promise.reject(`output[${cstr(output)}] is not an effective string`)
    // }

    return 'ok'
}


export default WDocxSplit
