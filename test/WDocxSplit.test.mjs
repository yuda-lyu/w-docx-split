import fs from 'fs'
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

    let fpOut = `./test/out/001.docx`
    let fpOutTrue = `./test/outTrue/001.docx`

    let fpIn = `./test/docin.docx`
    let strSep = '[systag:sepline]'
    let fdOut = `./test/out`
    let opt = {
        padZero: 3,
    }

    it('convert', async function() {
        await WDocxSplit(fpIn, strSep, fdOut, opt)
        let r = (fs.statSync(fpOut)).size
        let rr = (fs.statSync(fpOutTrue)).size
        //轉出docx檔案每次不同, 改用門檻比對
        // console.log('r', r, 'rr', rr)
        let b = r > 12000 && rr > 12000
        w.fsDeleteFolder(fdOut)
        assert.strict.deepEqual(true, b)
    })

})
