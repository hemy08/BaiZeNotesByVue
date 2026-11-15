import { describe, it, expect } from 'vitest'
import {
    ASCIITable,
    FormulaSymbolTable,
    HTMLSpecCharTable,
    PhysicalTable,
    SubnetMaskBitsTable,
    HTTPStatusCodeTable,
    NumericCaseTable,
    NormalFontTable,
    HTMLMimeTypeTable,
    GreeceLetterTable,
    CompressedArray
} from '../../src/renderer/src/components/PluginTools/Informations/Information'

describe('Information tables', () => {
    describe('ASCIITable', () => {
        it('should contain all 128 standard ASCII characters', () => {
            expect(ASCIITable.length).toBe(128)
        })

        it('should keep every field complete for all entries', () => {
            for (const item of ASCIITable) {
                expect(item.bin.length).toBeGreaterThan(0)
                expect(item.oct.length).toBeGreaterThan(0)
                expect(item.dec.length).toBeGreaterThan(0)
                expect(item.hex.length).toBeGreaterThan(0)
                expect(item.abridge.length).toBeGreaterThan(0)
                expect(item.mark.length).toBeGreaterThan(0)
            }
        })

        it('should keep dec values sequential from 0 to 127', () => {
            for (let i = 0; i < ASCIITable.length; i++) {
                expect(ASCIITable[i].dec).toBe(String(i))
            }
        })

        it('should keep bin values consistent with decimal index', () => {
            for (let i = 0; i < ASCIITable.length; i++) {
                const bin = ASCIITable[i].bin.replace(' ', '')
                expect(bin).toBe(i.toString(2).padStart(8, '0'))
            }
        })

        it('should keep hex values consistent with decimal index', () => {
            for (let i = 0; i < ASCIITable.length; i++) {
                expect(ASCIITable[i].hex).toBe('0x' + i.toString(16).toUpperCase().padStart(2, '0'))
            }
        })

        it('should sample key entries correctly', () => {
            expect(ASCIITable[0]).toMatchObject({
                dec: '0',
                hex: '0x00',
                abridge: 'NUL(null)',
                mark: '空字符'
            })
            expect(ASCIITable[32]).toMatchObject({
                dec: '32',
                hex: '0x20',
                abridge: '(space)',
                mark: '空格'
            })
            expect(ASCIITable[65]).toMatchObject({
                dec: '65',
                hex: '0x41',
                abridge: 'A',
                mark: '大写字母A'
            })
            expect(ASCIITable[97]).toMatchObject({
                dec: '97',
                hex: '0x61',
                abridge: 'a',
                mark: '小写字母a'
            })
            expect(ASCIITable[127]).toMatchObject({
                dec: '127',
                hex: '0x7F',
                abridge: 'DEL (delete)',
                mark: '删除'
            })
        })

        it('should keep oct values correct at representative indices', () => {
            const octMap: Record<number, string> = {
                0: '00',
                7: '07',
                8: '010',
                15: '017',
                16: '020',
                64: '0100',
                127: '0177'
            }
            for (const [index, oct] of Object.entries(octMap)) {
                expect(ASCIITable[Number(index)].oct).toBe(oct)
            }
        })
    })

    describe('FormulaSymbolTable', () => {
        it('should not be empty and keep fields complete', () => {
            expect(FormulaSymbolTable.length).toBeGreaterThan(0)
            for (const item of FormulaSymbolTable) {
                expect(item.id.length).toBeGreaterThan(0)
                expect(item.mark.length).toBeGreaterThan(0)
            }
        })

        it('should contain 75 formula symbols', () => {
            expect(FormulaSymbolTable.length).toBe(75)
        })

        it('should sample key symbols', () => {
            const byId = (id: string) => FormulaSymbolTable.find((item) => item.id === id)
            expect(byId('≈')?.mark).toBe('约等于')
            expect(byId('√')?.mark).toBe('根号')
            expect(byId('∑')?.mark).toBe('求和')
            expect(byId('f(x)')?.mark).toBe('函数')
            expect(byId('℃')?.mark).toBe('摄氏度')
        })

        it('should have 73 unique ids (≡ and π are duplicated in source data)', () => {
            const ids = FormulaSymbolTable.map((item) => item.id)
            expect(new Set(ids).size).toBe(73)
        })
    })

    describe('HTMLSpecCharTable', () => {
        it('should contain 114 HTML entities with complete fields', () => {
            expect(HTMLSpecCharTable.length).toBe(114)
            for (const item of HTMLSpecCharTable) {
                expect(item.id.length).toBeGreaterThan(0)
                expect(item.mark.length).toBeGreaterThan(0)
            }
        })

        it('should use numeric entity ids only', () => {
            for (const item of HTMLSpecCharTable) {
                expect(item.id).toMatch(/^&#\d+$/)
            }
        })

        it('should sample key entities', () => {
            const byId = (id: string) => HTMLSpecCharTable.find((item) => item.id === id)
            expect(byId('&#36')?.mark).toBe('美元符号')
            expect(byId('&#165')?.mark).toBe('人民币符号')
            expect(byId('&#8364')?.mark).toBe('欧元符号')
            expect(byId('&#169')?.mark).toBe('版权符号')
        })
    })

    describe('PhysicalTable', () => {
        it('should contain 24 physical quantities with complete fields', () => {
            expect(PhysicalTable.length).toBe(24)
            for (const item of PhysicalTable) {
                expect(item.symbol.length).toBeGreaterThan(0)
                expect(item.name.length).toBeGreaterThan(0)
                expect(item.mark.length).toBeGreaterThan(0)
            }
        })

        it('should sample key quantities', () => {
            const bySymbol = (symbol: string) =>
                PhysicalTable.find((item) => item.symbol === symbol)
            expect(bySymbol('m')?.name).toBe('质量')
            expect(bySymbol('v')?.name).toBe('速度')
            expect(bySymbol('g')?.name).toBe('重力加速度')
            expect(bySymbol('G')?.name).toBe('万有引力常数')
            expect(bySymbol('ε_0')?.name).toBe('真空介电常数')
        })

        it('should have 23 unique symbols (F is duplicated in source data)', () => {
            const symbols = PhysicalTable.map((item) => item.symbol)
            expect(new Set(symbols).size).toBe(23)
        })
    })

    describe('SubnetMaskBitsTable', () => {
        it('should cover all 33 mask lengths from /32 to /0', () => {
            expect(SubnetMaskBitsTable.length).toBe(33)
            for (let i = 0; i < SubnetMaskBitsTable.length; i++) {
                expect(SubnetMaskBitsTable[i].bit).toBe(String(32 - i))
            }
        })

        it('should keep nums equal to 2^(32-bit) for every row', () => {
            for (const item of SubnetMaskBitsTable) {
                const bit = parseInt(item.bit, 10)
                expect(item.nums).toBe(String(2 ** (32 - bit)))
            }
        })

        it('should sample key mask rows', () => {
            expect(SubnetMaskBitsTable[0]).toEqual({
                mask: '255.255.255.255',
                bit: '32',
                nums: '1'
            })
            expect(SubnetMaskBitsTable[8]).toEqual({
                mask: '255.255.255.0',
                bit: '24',
                nums: '256'
            })
            expect(SubnetMaskBitsTable[24]).toEqual({
                mask: '255.0.0.0',
                bit: '8',
                nums: '16777216'
            })
            expect(SubnetMaskBitsTable[32]).toEqual({
                mask: '0.0.0.0',
                bit: '0',
                nums: '4294967296'
            })
        })
    })

    describe('HTTPStatusCodeTable', () => {
        it('should keep code and desc complete', () => {
            expect(HTTPStatusCodeTable.length).toBeGreaterThan(50)
            for (const item of HTTPStatusCodeTable) {
                expect(item.code.length).toBeGreaterThan(0)
                expect(item.desc.length).toBeGreaterThan(0)
            }
        })

        it('should use unique three-digit codes', () => {
            const codes = HTTPStatusCodeTable.map((item) => item.code)
            expect(new Set(codes).size).toBe(codes.length)
            for (const code of codes) {
                // 所有条目都以三位数字开头（注意：'499' 条目只有数字、没有文字部分，属源数据特例）
                expect(code).toMatch(/^\d{3}/)
            }
        })

        it('should follow the "code + text" format except the bare 499 entry', () => {
            const bare = HTTPStatusCodeTable.filter((item) => item.code === '499')
            expect(bare).toHaveLength(1)
            const withText = HTTPStatusCodeTable.filter((item) => item.code !== '499')
            for (const item of withText) {
                expect(item.code).toMatch(/^\d{3} /)
            }
        })

        it('should sample key status codes', () => {
            const byCode = (code: string) => HTTPStatusCodeTable.find((item) => item.code === code)
            expect(byCode('200 OK')?.desc).toContain('请求已成功')
            expect(byCode('404 Not Found')?.desc).toContain('请求失败')
            expect(byCode("418 I'm a teapot")?.desc).toContain('愚人节')
            expect(byCode('500 Internal Server Error')?.desc).toContain('未曾预料')
        })
    })

    describe('NumericCaseTable', () => {
        it('should contain 21 rows with complete fields', () => {
            expect(NumericCaseTable.length).toBe(21)
            for (const item of NumericCaseTable) {
                expect(item.number.length).toBeGreaterThan(0)
                expect(item.lower.length).toBeGreaterThan(0)
                expect(item.upper.length).toBeGreaterThan(0)
            }
        })

        it('should keep number values unique', () => {
            const numbers = NumericCaseTable.map((item) => item.number)
            expect(new Set(numbers).size).toBe(numbers.length)
        })

        it('should sample key conversions', () => {
            const byNumber = (number: string) =>
                NumericCaseTable.find((item) => item.number === number)
            expect(byNumber('1')).toEqual({ number: '1', lower: '一', upper: '壹' })
            expect(byNumber('10')).toEqual({ number: '10', lower: '十', upper: '拾' })
            expect(byNumber('10000')?.lower).toBe('万')
            expect(byNumber('10000万')?.lower).toBe('亿')
        })
    })

    describe('NormalFontTable', () => {
        it('should contain 28 fonts with complete fields', () => {
            expect(NormalFontTable.length).toBe(28)
            for (const item of NormalFontTable) {
                expect(item.name.length).toBeGreaterThan(0)
                expect(item.cssStyle.length).toBeGreaterThan(0)
            }
        })

        it('should sample key fonts', () => {
            const byName = (name: string) => NormalFontTable.find((item) => item.name === name)
            expect(byName('Arial')?.cssStyle).toBe('Arial')
            expect(byName('黑体')?.cssStyle).toBe('SimHei')
            expect(byName('微软雅黑')?.cssStyle).toBe('Microsoft YaHei')
            expect(byName('楷体')?.cssStyle).toBe('KaiTi')
        })
    })

    describe('HTMLMimeTypeTable', () => {
        it('should contain 346 entries with complete fields', () => {
            expect(HTMLMimeTypeTable.length).toBe(346)
            for (const item of HTMLMimeTypeTable) {
                expect(item.ext.length).toBeGreaterThan(0)
                expect(item.type).toContain('/')
            }
        })

        it('should keep the placeholder row as the first entry', () => {
            expect(HTMLMimeTypeTable[0]).toEqual({
                ext: '当不知道哪种文件类型？',
                type: 'application/octet-stream'
            })
        })

        it('should sample known MIME types', () => {
            const byExt = (ext: string) => HTMLMimeTypeTable.find((item) => item.ext === ext)
            expect(byExt('.html')?.type).toBe('text/html')
            expect(byExt('.txt')?.type).toBe('text/plain')
            expect(byExt('.pdf')?.type).toBe('application/pdf')
            expect(byExt('.css')?.type).toBe('text/css')
            expect(byExt('.json')?.type).toBeUndefined()
        })
    })

    describe('GreeceLetterTable', () => {
        it('should contain 64 entities with complete fields', () => {
            expect(GreeceLetterTable.length).toBe(64)
            for (const item of GreeceLetterTable) {
                expect(item.char).toMatch(/^&/)
                expect(item.code).toMatch(/^&#\d+;$/)
            }
        })

        it('should keep char values unique', () => {
            const chars = GreeceLetterTable.map((item) => item.char)
            expect(new Set(chars).size).toBe(chars.length)
        })

        it('should sample key greek letters', () => {
            const byChar = (char: string) => GreeceLetterTable.find((item) => item.char === char)
            expect(byChar('&alpha;')?.code).toBe('&#945;')
            expect(byChar('&beta;')?.code).toBe('&#946;')
            expect(byChar('&Omega;')?.code).toBe('&#936;')
            expect(byChar('&pi;')?.code).toBe('&#960;')
        })
    })

    describe('CompressedArray', () => {
        it('should split a table into chunks of the given size', () => {
            const table = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            expect(CompressedArray(table, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]])
        })

        it('should return single-element chunks when size is 1', () => {
            expect(CompressedArray([1, 2, 3], 1)).toEqual([[1], [2], [3]])
        })

        it('should return a single chunk when size exceeds table length', () => {
            expect(CompressedArray([1, 2, 3], 10)).toEqual([[1, 2, 3]])
        })

        it('should return an empty array for an empty table', () => {
            expect(CompressedArray([], 3)).toEqual([])
        })
    })
})
