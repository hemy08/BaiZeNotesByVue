// By using fast-string-search package,
// it will increase 10x performance better than String.prototype.indexOf method.
// const fss = require('fast-string-search');

import * as fs from 'fs'
import * as path from 'path'

/**
 * 匹配结果接口
 */
export interface MatchResult {
  line: number
  startColumn: number
  endColumn: number
  text: string
}

/**
 * 文件搜索结果接口
 */
export interface FileSearchResult {
  filePath: string
  fileName: string
  occurrences: number
  matchResults: MatchResult[]
}

/**
 * 搜索配置接口
 */
export interface FindConfig {
  files: string | string[]
  find: string
  ignoreCase?: boolean
}

/**
 * 搜索回调函数类型
 */
export type FindCallback = (error: Error | null, results?: FileSearchResult[]) => void

/**
 * 在字符串中插入新字符串
 * @param source 源字符串
 * @param start 插入位置
 * @param newStr 要插入的字符串
 * @returns 插入后的字符串
 */
function insertStr(source: string, start: number, newStr: string): string {
  return source.slice(0, start) + newStr + source.slice(start)
}

/**
 * 在单个文件中替换并查找关键字
 * @param filePath 文件路径
 * @param keyword 关键字
 * @param ignoreCase 是否忽略大小写
 * @param cb 回调函数
 */
function replaceInSingleFile(
  filePath: string,
  keyword: string,
  ignoreCase: boolean,
  cb: (error: Error | null, occurrences?: number, matchResults?: MatchResult[]) => void
): void {
  fs.readFile(filePath, 'utf8', function (error, contents) {
    if (error) {
      return cb(error)
    }

    const lines = contents.split('\n')
    const matchResults: MatchResult[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const searchStr = ignoreCase ? line.toLowerCase() : line
      const searchKeyword = ignoreCase ? keyword.toLowerCase() : keyword
      const startIndex = searchStr.indexOf(searchKeyword)

      if (startIndex > -1) {
        // 使用随机字符作为占位符，防止HTML注入
        const replaceCharLeft = new Date().getTime() + String(Math.random()).slice(2)
        const replaceCharRight = new Date().getTime() + String(Math.random()).slice(2)
        const startStr = `${replaceCharLeft}span class='h-word'${replaceCharRight}`
        const endStr = `${replaceCharLeft}/span${replaceCharRight}`
        const offset = 20

        let richLine = insertStr(line, startIndex, startStr)
        richLine = insertStr(richLine, startIndex + startStr.length + keyword.length, endStr)

        const start = startIndex - offset
        const end = startIndex + startStr.length + keyword.length + endStr.length + offset
        let text = richLine.slice(start >= 0 ? start : 0, end)

        // 防注入替换
        text = text
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(new RegExp(replaceCharLeft.toString(), 'g'), '<')
          .replace(new RegExp(replaceCharRight.toString(), 'g'), '>')

        if (start > 0) {
          text = '...' + text
        }

        if (end < richLine.length - 1) {
          text = text + '...'
        }

        matchResults.push({
          line: i + 1,
          startColumn: startIndex + 1,
          endColumn: startIndex + 1 + keyword.length,
          text,
        })
      }
    }

    return cb(null, matchResults.length, matchResults)
  })
}

/**
 * 在多个文件中查找关键字
 * @param config 搜索配置
 * @param cb 回调函数
 */
export function findInFiles(config: FindConfig, cb?: FindCallback): void {
  cb = cb || function () {}

  if (!Array.isArray(config.files)) {
    config.files = [config.files]
    return findInFiles(config, cb)
  }

  const totalFiles = config.files.length
  let processedFiles = 0
  const foundInFiles: FileSearchResult[] = []

  config.files.forEach(function (file) {
    replaceInSingleFile(file, config.find, config.ignoreCase || false, function (error, occurrences, matchResults) {
      if (error) {
        return cb(error)
      }
      if (occurrences && occurrences > 0) {
        foundInFiles.push({
          filePath: file,
          fileName: path.basename(file),
          occurrences: occurrences,
          matchResults: matchResults || [],
        })
      }
      processedFiles++
      if (processedFiles === totalFiles) {
        cb(null, foundInFiles)
      }
    })
  })
}
