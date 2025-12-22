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


//node g.mjs
