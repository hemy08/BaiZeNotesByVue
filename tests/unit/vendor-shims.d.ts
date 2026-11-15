/**
 * 测试侧第三方库类型补齐（P1-CQ-3）。
 *
 * 只放「测试代码直接 import、但依赖包自身无类型声明且 src 中没有现成声明」的最小声明。
 * src 已有的环境模块声明（crypto-js、markdown-it-plantuml、monaco-worker-types）
 * 通过 tsconfig.test.json 的 include 直接复用，不在此重复。
 */

/**
 * officegen 0.6.5 无类型声明；import.test.ts 仅用它生成真实 docx 样本，
 * 用到的是 generate() + createP().addText() 这两个 API。
 */
declare module 'officegen' {
    interface OfficegenParagraph {
        addText(text: string): OfficegenParagraph
    }

    interface OfficegenDocument {
        createP(): OfficegenParagraph
        generate(output: NodeJS.WritableStream): void
    }

    const officegen: (type: 'docx' | 'pptx' | 'xlsx') => OfficegenDocument
    export default officegen
}
