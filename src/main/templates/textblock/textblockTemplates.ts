import { blockcode } from './constBlockCode'

const image_links = '![]()\n'
const linksList =
  '- []()\n' + '- []()\n' + '- []()\n' + '- []()\n' + '- []()\n' + '- []()\n' + '- []()\n'

function getFmtData(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = ('0' + (now.getMonth() + 1)).slice(-2)
  const date = ('0' + now.getDate()).slice(-2)
  const hours = ('0' + now.getHours()).slice(-2)
  const minutes = ('0' + now.getMinutes()).slice(-2)
  const seconds = ('0' + now.getSeconds()).slice(-2)

  const fmt_date = `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`
  return `<span style="color:rgb(100,180,246);font-size:11pt">最后更新：${fmt_date}</span>\n`
}

export const textBlocks = {
  imageLinks: { label: '图片链接', data: image_links },
  blockCode: { label: '折叠代码块', data: blockcode },
  linksList: { label: '有序链接列表', data: linksList },
  lastUpdate: { label: '文章更新日期', data: getFmtData() }
}
