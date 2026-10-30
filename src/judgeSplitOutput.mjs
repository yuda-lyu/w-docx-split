import isestr from 'wsemi/src/isestr.mjs'


//splitDocx.exe(srcPython/splitDocx.py之run)結束時於stdout印出單行結果: 成功為`success`, 失敗為`error: <訊息>`, 且不論成敗離開碼皆為0, 故離開碼無法判定成敗, 須依輸出判定
let codeFail = 'E_SPLIT_FAILED'


//judgeSplitOutput, 依splitDocx.exe之輸出(stdout與stderr合併之字串)判定分割成敗, 內部函數(不入JSDoc), 回傳{ ok, msg }
//判準為fail-closed: 輸出中任一行以`error:`開頭視為失敗(即使同時有`success`行); 無`error:`行時須有整行為`success`之行才視為成功; 其餘(空輸出, 未知輸出, 非字串)一律視為失敗
//失敗訊息為`[E_SPLIT_FAILED] 原因`, 原因取自exe之`error:`行, 無`error:`行時為固定說明, 不回顯其餘輸出內容
function judgeSplitOutput(out) {
    let lines = isestr(out) ? out.split(/\r?\n/).map((v) => v.trim()) : []

    //exe自報失敗, 原因為`error:`之後之文字
    let lineErr = lines.find((v) => v.startsWith('error:'))
    if (lineErr !== undefined) {
        let detail = lineErr.slice('error:'.length).trim()
        return { ok: false, msg: `[${codeFail}] ${detail !== '' ? detail : 'splitDocx.exe reported an error'}` }
    }

    //成功須有明確之success行
    if (lines.includes('success')) {
        return { ok: true, msg: '' }
    }

    return { ok: false, msg: `[${codeFail}] splitDocx.exe returned no success result` }
}


export default judgeSplitOutput
