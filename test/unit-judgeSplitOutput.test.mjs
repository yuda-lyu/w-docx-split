import assert from 'assert'
import judgeSplitOutput from '../src/judgeSplitOutput.mjs'


//純函數測試(不需Word): splitDocx.exe不論成敗離開碼皆為0, 成敗只能依輸出判定(R-SPLIT-RESULT-01)
describe('judgeSplitOutput', function() {

    let prefix = '[E_SPLIT_FAILED] '

    describe('success (output carries the "success" line and no "error:" line)', function() {

        it('judges the exe success output "success\\r\\n" as ok (R02: a valid split is not rejected)', function() {
            assert.strict.deepStrictEqual(judgeSplitOutput('success\r\n'), { ok: true, msg: '' })
            assert.strict.deepStrictEqual(judgeSplitOutput('success\n'), { ok: true, msg: '' })
            assert.strict.deepStrictEqual(judgeSplitOutput('success'), { ok: true, msg: '' })
        })

        it('tolerates extra lines around the success line, e.g. warnings merged from stderr (R02)', function() {
            assert.strict.equal(judgeSplitOutput('some warning\r\nsuccess\r\n').ok, true)
            assert.strict.equal(judgeSplitOutput('\r\n\r\n  success  \r\nanother line\r\n').ok, true)
        })

    })

    describe('failure reported by the exe (the "error:" line, exit code 0)', function() {

        it('judges the exe output "error: ..." as failure with the code and the exe diagnosis (R01)', function() {
            let r = judgeSplitOutput(`error: (-2147352567, 'Exception occurred.', (0, 'Microsoft Word', 'The file is corrupt.', 'wdmain11.chm', 25272, -2146822496), None)\r\n`)
            assert.strict.equal(r.ok, false)
            assert.strict.equal(r.msg, `${prefix}(-2147352567, 'Exception occurred.', (0, 'Microsoft Word', 'The file is corrupt.', 'wdmain11.chm', 25272, -2146822496), None)`)
        })

        it('judges the invalid-argv output of the exe as failure (R01)', function() {
            assert.strict.deepStrictEqual(judgeSplitOutput('error: invalid length of argv\r\n'), { ok: false, msg: `${prefix}invalid length of argv` })
        })

        it('gives a non-empty fixed reason when the "error:" line carries no text (R01)', function() {
            for (let s of ['error:', 'error:\r\n', 'error:   \r\n']) {
                let r = judgeSplitOutput(s)
                assert.strict.equal(r.ok, false, s)
                assert.strict.equal(r.msg.startsWith(prefix), true, s)
                assert.strict.equal(r.msg.length > prefix.length, true, s)
            }
        })

        it('fails closed: an "error:" line wins even when a "success" line is also present (R01, R03)', function() {
            assert.strict.equal(judgeSplitOutput('success\r\nerror: x\r\n').ok, false)
            assert.strict.equal(judgeSplitOutput('error: x\r\nsuccess\r\n').ok, false)
            assert.strict.equal(judgeSplitOutput('success\r\nerror: x\r\n').msg, `${prefix}x`)
        })

        it('takes the first "error:" line as the reason when there are several', function() {
            assert.strict.equal(judgeSplitOutput('error: first\r\nerror: second\r\n').msg, `${prefix}first`)
        })

    })

    describe('fails closed on anything that is not the success output (R03)', function() {

        let msgNo = `${prefix}splitDocx.exe returned no success result`

        it('judges empty or blank output as failure', function() {
            for (let s of ['', ' ', '\r\n', '\n\n']) {
                assert.strict.deepStrictEqual(judgeSplitOutput(s), { ok: false, msg: msgNo }, JSON.stringify(s))
            }
        })

        it('judges unknown output as failure and does not echo it (R04)', function() {
            let s = 'Traceback: C:\\secret\\input.docx failed'
            let r = judgeSplitOutput(s)
            assert.strict.deepStrictEqual(r, { ok: false, msg: msgNo })
            assert.strict.equal(r.msg.includes('secret'), false)
        })

        it('requires the whole line to be "success" (lookalikes are not success)', function() {
            for (let s of ['successful', 'not success', 'success: no', 'Success', 'SUCCESS', 'succes', 'xsuccess']) {
                assert.strict.equal(judgeSplitOutput(s).ok, false, s)
            }
        })

        it('judges non-string input as failure without throwing (R05)', function() {
            let vs = [undefined, null, 0, 1, true, false, {}, [], ['success'], () => 'success', Symbol('x'), NaN]
            for (let v of vs) {
                let r = null
                assert.strict.doesNotThrow(() => {
                    r = judgeSplitOutput(v)
                })
                assert.strict.deepStrictEqual(r, { ok: false, msg: msgNo }, String(typeof v))
            }
        })

    })

})
