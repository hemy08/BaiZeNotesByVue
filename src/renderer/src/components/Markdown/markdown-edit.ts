import mermaid from 'mermaid'
import { Range } from 'monaco-editor'
import * as monaco from 'monaco-editor'
import EventBus from '../../event-bus'
import MarkdownIt from 'markdown-it'

type MappingTable = {
  [key: string]: string // 键是字符串，值是数字
}
export const MdEditToolSvgs: MappingTable = {
  h1: '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m11 14v-2h2V6.31l-2.5 1.44V5.44L16 4h2v12h2v2h-6Z"/></svg>',
  h2: '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m18 14h-6a2 2 0 0 1-2-2c0-.53.2-1 .54-1.36l4.87-5.23c.37-.36.59-.86.59-1.41a2 2 0 0 0-2-2 2 2 0 0 0-2 2h-2a4 4 0 0 1 4-4 4 4 0 0 1 4 4c0 1.1-.45 2.1-1.17 2.83L15 16h6v2Z"/></svg>',
  h3: '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m12 0h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1h2v1h4v-4h-4v-2h4V6h-4v1h-2V6a2 2 0 0 1 2-2Z"/></svg>',
  h4: '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m15 14v-5h-5v-2l5-7h2v7h1v2h-1v5h-2m0-7V7.42L15.45 11H18Z"/></svg>',
  h5: '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m12 0h5v2h-5v4h2a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-2a2 2 0 0 1-2-2v-1h2v1h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>',
  h6: '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m12 0h4a2 2 0 0 1 2 2v1h-2V6h-4v4h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 8v4h4v-4h-4Z"/></svg>',
  'f-family':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 8h3v12h1v1h-4v-1h1v-3h-4l-1.5 3H14v1h-4v-1h1l6-12m1 1-3.5 7H18V9M5 3h5c1.11 0 2 .89 2 2v11H9v-5H6v5H3V5c0-1.11.89-2 2-2m1 2v4h3V5H6Z"/></svg>',
  'f-size':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 4v3h5v12h3V7h5V4H2m19 5h-9v3h3v7h3v-7h3V9Z"/></svg>',
  'f-bold':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13.5 15.5H10v-3h3.5A1.5 1.5 0 0 1 15 14a1.5 1.5 0 0 1-1.5 1.5m-3.5-9h3A1.5 1.5 0 0 1 14.5 8 1.5 1.5 0 0 1 13 9.5h-3m5.6 1.29c.97-.68 1.65-1.79 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.1 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42Z"/></svg>',
  'f-italic':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8Z"/></svg>',
  'f-delete':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.2 9.8c-1.2-2.3.5-5 2.9-5.5 3.1-1 7.6.4 7.5 4.2h-3c0-.3-.1-.6-.1-.8-.2-.6-.6-.9-1.2-1.1-.8-.3-2.1-.2-2.8.3C9 8.2 10.4 9.5 12 10H7.4c-.1-.1-.1-.2-.2-.2M21 13v-2H3v2h9.6c.2.1.4.1.6.2.6.3 1.1.5 1.3 1.1.1.4.2.9 0 1.3-.2.5-.6.7-1.1.9-1.8.5-4-.2-3.9-2.4h-3c-.1 2.6 2.1 4.4 4.5 4.7 3.8.8 8.3-1.6 6.3-5.9l3.7.1Z"/></svg>',
  'f-under':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 21h14v-2H5v2m7-4a6 6 0 0 0 6-6V3h-2.5v8a3.5 3.5 0 0 1-3.5 3.5A3.5 3.5 0 0 1 8.5 11V3H6v8a6 6 0 0 0 6 6Z"/></svg>',
  'color-fill':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 11.5s-2 2.17-2 3.5a2 2 0 0 0 2 2 2 2 0 0 0 2-2c0-1.33-2-3.5-2-3.5M5.21 10 10 5.21 14.79 10m1.77-1.06L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.56-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.59.59-1.56 0-2.12Z"/></svg>',
  'f-quote':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m10 7-2 4h3v6H5v-6l2-4h3m8 0-2 4h3v6h-6v-6l2-4h3Z"/></svg>',
  'f-super':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16 7.41 11.41 12 16 16.59 14.59 18 10 13.41 5.41 18 4 16.59 8.59 12 4 7.41 5.41 6 10 10.59 14.59 6 16 7.41M21.85 9h-4.88V8l.89-.82c.76-.64 1.32-1.18 1.7-1.63.37-.44.56-.85.57-1.23a.884.884 0 0 0-.27-.7c-.18-.19-.47-.28-.86-.29-.31.01-.58.07-.84.17l-.66.39-.45-1.17c.27-.22.59-.39.98-.53S18.85 2 19.32 2c.78 0 1.38.2 1.78.61.4.39.62.93.62 1.57-.01.56-.19 1.08-.54 1.55-.34.48-.76.93-1.27 1.36l-.64.52v.02h2.58V9Z"/></svg>',
  'f-sub':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16 7.41 11.41 12 16 16.59 14.59 18 10 13.41 5.41 18 4 16.59 8.59 12 4 7.41 5.41 6 10 10.59 14.59 6 16 7.41m5.85 13.62h-4.88v-1l.89-.8c.76-.65 1.32-1.19 1.7-1.63.37-.44.56-.85.57-1.24a.898.898 0 0 0-.27-.7c-.18-.16-.47-.28-.86-.28-.31 0-.58.06-.84.18l-.66.38-.45-1.17c.27-.21.59-.39.98-.53s.82-.24 1.29-.24c.78.04 1.38.25 1.78.66.4.41.62.93.62 1.57-.01.56-.19 1.08-.54 1.55-.34.47-.76.92-1.27 1.36l-.64.52v.02h2.58v1.35Z"/></svg>',
  'align-left':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m0 4h12v2H3V7m0 4h18v2H3v-2m0 4h12v2H3v-2m0 4h18v2H3v-2Z"/></svg>',
  'align-center':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m4 4h10v2H7V7m-4 4h18v2H3v-2m4 4h10v2H7v-2m-4 4h18v2H3v-2Z"/></svg>',
  'align-justify':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m0 4h18v2H3V7m0 4h18v2H3v-2m0 4h18v2H3v-2m0 4h18v2H3v-2Z"/></svg>',
  'align-right':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m6 4h12v2H9V7m-6 4h18v2H3v-2m6 4h12v2H9v-2m-6 4h18v2H3v-2Z"/></svg>',
  'list-numbered':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 13v-2h14v2H7m0 6v-2h14v2H7M7 7V5h14v2H7M3 8V5H2V4h2v4H3m-1 9v-1h3v4H2v-1h2v-.5H3v-1h1V17H2m2.25-7a.75.75 0 0 1 .75.75c0 .2-.08.39-.21.52L3.12 13H5v1H2v-.92L4 11H2v-1h2.25Z"/></svg>',
  'list-bulleted':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 5h14v2H7V5m0 8v-2h14v2H7M4 4.5A1.5 1.5 0 0 1 5.5 6 1.5 1.5 0 0 1 4 7.5 1.5 1.5 0 0 1 2.5 6 1.5 1.5 0 0 1 4 4.5m0 6A1.5 1.5 0 0 1 5.5 12 1.5 1.5 0 0 1 4 13.5 1.5 1.5 0 0 1 2.5 12 1.5 1.5 0 0 1 4 10.5M7 19v-2h14v2H7m-3-2.5A1.5 1.5 0 0 1 5.5 18 1.5 1.5 0 0 1 4 19.5 1.5 1.5 0 0 1 2.5 18 1.5 1.5 0 0 1 4 16.5Z"/></svg>',
  'line-scan':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 22v-2h3v-3h2v3.5c0 .4-.2.7-.5 1-.3.3-.7.5-1 .5H17M7 22H3.5c-.4 0-.7-.2-1-.5-.3-.3-.5-.7-.5-1V17h2v3h3v2M17 2h3.5c.4 0 .7.2 1 .5.3.3.5.6.5 1V7h-2V4h-3V2M7 2v2H4v3H2V3.5c0-.4.2-.7.5-1s.6-.5 1-.5H7m12 9H5v2h14v-2Z"/></svg>',
  'line-enter':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ><path d="M8.95005 17.65L3.30005 12L8.95005 6.34998L10 7.39998L6.15005 11.25H19.2V7.24998H20.7001V12.75H6.15005L10 16.6L8.95005 17.65Z"/></svg>',
  'code-line':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m14.6 16.6 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4m-5.2 0L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Z"/></svg>',
  'code-block':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.59 3.41 7 4.82 3.82 8 7 11.18 5.59 12.6 1 8l4.59-4.59m5.82 0L16 8l-4.59 4.6L10 11.18 13.18 8 10 4.82l1.41-1.41M22 6v12c0 1.11-.89 2-2 2H4a2 2 0 0 1-2-2v-4h2v4h16V6h-2.97V4H20c1.11 0 2 .89 2 2Z"/></svg>',
  'math-line':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11.5 19.1c-.2 1.1-.6 1.9-1.3 2.4-.7.5-1.6.6-2.7.4-.4-.1-1.2-.2-1.5-.4l.5-1.5c.3.1.9.3 1.2.3 1.1.2 1.7-.3 1.9-1.5L12 5.2c.2-1.2.7-2 1.4-2.6.7-.5 1.7-.7 2.8-.5.4.1 1.2.2 1.8.5L17.5 4c-.2-.1-.9-.2-1.2-.3-1.3-.2-2 .4-2.3 1.9l-2.5 13.5Z"/></svg>',
  'math-block':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M14 2H4l5 8-5 8h12v-4h-2v2H8.25L12 10 8.25 4H14v2h2V2z"/></svg>',
  'line-links':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.973.973 0 0 1 0-1.42Z"/></svg>',
  'task-lists':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 15h6v2h-6v-2M9 7H7v2h2V7m2 6h6v-2h-6v2m0-4h6V7h-6v2m-2 2H7v2h2v-2m12-6v14c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2m-2 0H5v14h14V5M9 15H7v2h2v-2Z"/></svg>',
  'i-images':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m8.5 13.5 2.5 3 3.5-4.5 4.5 6H5m16 1V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z"/></svg>',
  'images-center':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 5a7 7 0 0 0-7 7 7 7 0 0 0 7 7c1.04 0 2.06-.24 3-.68.94.44 1.96.68 3 .68a7 7 0 0 0 7-7 7 7 0 0 0-7-7c-1.04 0-2.06.24-3 .68-.94-.44-1.96-.68-3-.68m0 2c.34 0 .67.03 1 .1-1.28 1.31-2 3.07-2 4.9 0 1.83.72 3.59 2 4.89-.33.07-.66.11-1 .11a5 5 0 0 1-5-5 5 5 0 0 1 5-5m6 0a5 5 0 0 1 5 5 5 5 0 0 1-5 5c-.34 0-.67-.03-1-.1 1.28-1.31 2-3.07 2-4.9 0-1.83-.72-3.59-2-4.89.33-.07.66-.11 1-.11Z"/></svg>',
  'i-emoji':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.5 2C3.56 2 2 3.56 2 5.5v13C2 20.44 3.56 22 5.5 22H16l6-6V5.5C22 3.56 20.44 2 18.5 2h-13m.25 2h12.5A1.75 1.75 0 0 1 20 5.75V15h-1.5c-1.94 0-3.5 1.56-3.5 3.5V20H5.75A1.75 1.75 0 0 1 4 18.25V5.75A1.75 1.75 0 0 1 5.75 4m8.69 2.77c-.16 0-.32.02-.47.06-.94.26-1.47 1.22-1.23 2.17.05.15.12.3.21.44l3.23-.88c0-.17-.02-.34-.06-.51-.21-.75-.9-1.28-1.68-1.28M8.17 8.5c-.17 0-.32 0-.47.05-.93.26-1.48 1.22-1.23 2.15.03.16.12.3.21.46l3.23-.88c0-.17-.02-.34-.06-.5A1.72 1.72 0 0 0 8.17 8.5m8.55 2.76-9.13 2.51a5.266 5.266 0 0 0 5.36 1.64 5.273 5.273 0 0 0 3.77-4.15Z"/></svg>',
  'i-symbol':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 7v7h2V7H2m4 0v2h4v2H8v3h2v-1c1.11 0 2-.89 2-2V9c0-1.11-.89-2-2-2H6m9.8 0-.2 2H14v2h1.4l-.2 2H14v2h1l-.2 2h2l.2-2h1.4l-.2 2h2l.2-2H22v-2h-1.4l.2-2H22V9h-1l.2-2h-2L19 9h-1.4l.2-2h-2m1.6 4h1.4l-.2 2h-1.4l.2-2M2 15v2h2v-2H2m6 0v2h2v-2H8Z"/></svg>',
  'i-table':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 4v4h6V8H5m8 0v4h6V8h-6m-8 6v4h6v-4H5m8 0v4h6v-4h-6Z"/></svg>',
  'i-label':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6Z"/></svg>',
  'i-classification':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m18 21-4-4h3V7h-3l4-4 4 4h-3v10h3M2 19v-2h10v2M2 13v-2h7v2M2 7V5h4v2H2Z"/></svg>',
  'i-material':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 16.61v-1.24l6-3.46V7.23l-5 2.89-5-2.89V13l-1 .58L2 13V5l1.07-.62L9 7.81l3.93-2.27 2-1.16L16 5v8.06L10.92 16l4.05 2.33 5.03-2.9V11l1-.58 1 .58v5.58l-7.03 4.06L8 16.61m14-6.86-1 .58-1-.58V8.58L21 8l1 .58v1.17Z"/></svg>',
  'i-mermaid':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 3a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H7v4.063C7 16.355 7.644 17 8.438 17H12.5v-2.5a2 2 0 0 1 2-2H21a2 2 0 0 1 2 2V21a2 2 0 0 1-2 2h-6.5a2 2 0 0 1-2-2v-2.5H8.437A2.939 2.939 0 0 1 5.5 15.562V11.5H3a2 2 0 0 1-2-2Zm2-.5a.5.5 0 0 0-.5.5v6.5a.5.5 0 0 0 .5.5h6.5a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5ZM14.5 14a.5.5 0 0 0-.5.5V21a.5.5 0 0 0 .5.5H21a.5.5 0 0 0 .5-.5v-6.5a.5.5 0 0 0-.5-.5Z"/></svg>',
  'i-plantuml':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.5 17c-.13 0-.26 0-.39.04l-1.61-3.25a2.5 2.5 0 0 0-1.75-4.29c-.13 0-.25 0-.39.04l-1.63-3.25c.48-.45.77-1.08.77-1.79a2.5 2.5 0 0 0-5 0c0 .71.29 1.34.76 1.79L8.64 9.54c-.14-.04-.26-.04-.39-.04a2.5 2.5 0 0 0-1.75 4.29l-1.61 3.25C4.76 17 4.63 17 4.5 17a2.5 2.5 0 0 0 0 5A2.5 2.5 0 0 0 7 19.5c0-.7-.29-1.34-.76-1.79l1.62-3.25c.14.04.26.04.39.04s.25 0 .39-.04l1.63 3.25c-.47.45-.77 1.09-.77 1.79a2.5 2.5 0 0 0 5 0A2.5 2.5 0 0 0 12 17c-.13 0-.26 0-.39.04L10 13.79c.46-.45.75-1.08.75-1.79s-.29-1.34-.75-1.79l1.61-3.25c.13.04.26.04.39.04s.26 0 .39-.04L14 10.21c-.45.45-.75 1.09-.75 1.79a2.5 2.5 0 0 0 2.5 2.5c.13 0 .25 0 .39-.04l1.63 3.25c-.47.45-.77 1.09-.77 1.79a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0-2.5-2.5Z"/></svg>',
  'toggle-buttons':
    '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5H7Z"/></svg>'
}

// 定义一个函数来插入字符串
export function EditInsTextAfterCursor(
  editor: monaco.editor.IStandaloneCodeEditor,
  textToInsert: string
) {
  const position = editor.getPosition()
  if (!position) return

  // 创建一个编辑操作，将字符串插入到光标之后
  const edit = {
    range: new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    ), // 这是一个空范围，表示插入位置
    text: textToInsert, // 要插入的文本
    forceMoveMarkers: true // 如果需要，强制移动标记（如断点）
  }

  // 执行编辑操作
  editor.executeEdits('', [edit])
}

// 假设 editor 是您已经初始化的 Monaco Editor 实例
export function EditCvtToHeader(editor: monaco.editor.IStandaloneCodeEditor, header: string) {
  // 获取当前光标的位置，确保位置存在
  const cursorPosition = editor.getPosition()
  if (!cursorPosition) return
  // 获取当前光标所在行的行号
  const lineNumber = cursorPosition.lineNumber
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  // 计算插入位置（行首）
  const insertPosition = new monaco.Position(lineNumber, 1)
  // 获取光标所在行的内容
  const lineContent = model.getLineContent(lineNumber)

  // 编写插入的内容，获取整行内容，如果行首是#开头的，替换掉
  const headers = ['# ', '## ', '### ', '#### ', '##### ', '###### ']
  const insertHead = headers[parseInt(header.charAt(1)) - 1] || ''
  let textToInsert = ''
  // 前面有#的，替换掉
  if (lineContent.trim().startsWith('#') && lineContent.length > 1) {
    // 如果文字目标lever和当前level一样，去掉前面的#
    if (lineContent.trim().startsWith(insertHead)) {
      textToInsert = lineContent.replace(insertHead, '')
    } else {
      textToInsert = lineContent.replace(/^#+ |\n|$/, insertHead)
    }
  } else {
    textToInsert = insertHead + lineContent.trim()
  }
  // 创建一个编辑操作，将字符串插入到光标之后
  const edit = {
    range: new monaco.Range(
      insertPosition.lineNumber,
      1,
      insertPosition.lineNumber,
      model.getLineMaxColumn(lineNumber)
    ), // 这是一个空范围，表示插入位置
    text: textToInsert, // 要插入的文本
    forceMoveMarkers: true // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('convertToHeader', [edit])
}

const styleHandlers = {
  underline(content: string) {
    if (content.startsWith('<u>') && content.endsWith('</u>')) {
      return content.substring(3, content.length - 4)
    } else {
      return `<u>${content}</u>`
    }
  },
  bold(content: string) {
    if (content.startsWith('**') && content.endsWith('**')) {
      return content.substring(2, content.length - 2)
    } else {
      return `**${content}**`
    }
  },
  deleteline(content: string) {
    if (content.startsWith('~~') && content.endsWith('~~')) {
      return content.substring(2, content.length - 2)
    } else {
      return `~~${content}~~`
    }
  }
}

function editUpdateFontStyleCommon(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) return
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return

  let newText = ''
  // 获取选择内容的起始和结束位置，前后增加三个字符的选择
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  const lineLength = model.getLineLength(endLineNumber)
  const start = Math.max(1, startColumn - 3)
  let end = Math.min(lineLength + 1, endColumn + 3)
  if (style.toLowerCase() == 'underline') {
    end = Math.min(lineLength + 1, endColumn + 4)
  }
  // 获取偏移后的字符
  const selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
  const content = model.getValueInRange(selectRange)
  const handler = styleHandlers[style.toLowerCase()]
  if (handler) {
    newText = handler(content)
  }
  // 创建一个编辑操作，将字符串插入到光标之后
  const edit = {
    range: selection, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: false // 如果需要，强制移动标记（如断点）
  }

  editor.executeEdits('editUpdateFontStyleCommon', [edit])
}

function editUpdateFontStyle(
  editor: monaco.editor.IStandaloneCodeEditor,
  startStr: string,
  endStr: string
) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    EditInsTextAfterCursor(editor, startStr + endStr)
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  let selectRange: Range = selection
  const selectedText = model.getValueInRange(selection)
  // 选择的部分就有*
  let newText: string
  if (selectedText.startsWith(startStr) && selectedText.endsWith(endStr)) {
    newText = selectedText.substring(startStr.length, selectedText.length - endStr.length)
  } else {
    // 选择的部分没有*，向前后增加三个字符
    const lineLength = model.getLineLength(endLineNumber)
    const start = Math.max(1, startColumn - startStr.length)
    const end = Math.min(lineLength + 1, endColumn + endStr.length)
    selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
    const content = model.getValueInRange(selectRange)
    // 三个*，说明文字本来是加粗倾斜的，去掉倾斜
    if (content.startsWith(startStr) && content.endsWith(endStr)) {
      newText = content.substring(startStr.length, content.length - endStr.length)
    } else {
      selectRange = selection
      newText = `${startStr}${selectedText}${endStr}`
    }
  }

  const edit = {
    range: selectRange, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: false // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('editUpdateFontStyle', [edit])
}

function editSetFontItalic(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  if (style.toLowerCase() != 'italic') {
    return
  }
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    EditInsTextAfterCursor(editor, '**')
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  let selectRange: Range = selection
  const selectedText = model.getValueInRange(selection)
  // 选择的部分就有*
  let newText: string
  if (selectedText.startsWith('***') && selectedText.endsWith('***')) {
    newText = selectedText.substring(1, selectedText.length - 1)
  } else if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
    newText = `*${selectedText}*`
  } else if (selectedText.startsWith('*') && selectedText.endsWith('*')) {
    newText = selectedText.substring(1, selectedText.length - 1)
  } else {
    // 选择的部分没有*，向前后增加三个字符
    const lineLength = model.getLineLength(endLineNumber)
    let start = Math.max(1, startColumn - 3)
    let end = Math.min(lineLength + 1, endColumn + 3)
    selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
    let content = model.getValueInRange(selectRange)
    // 三个*，说明文字本来是加粗倾斜的，去掉倾斜
    if (content.startsWith('***') && content.endsWith('***')) {
      newText = content.substring(1, content.length - 1)
    } else {
      start = Math.max(1, startColumn - 2)
      end = Math.min(lineLength + 1, endColumn + 2)
      selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
      content = model.getValueInRange(selectRange)
      // 两个*号，说明文字本身是加粗的，加上倾斜符
      if (content.startsWith('**') && content.endsWith('**')) {
        newText = `*${content}*`
      } else {
        // 一个*号，说明文字本身是倾斜的，去掉倾斜符
        start = Math.max(1, startColumn - 1)
        end = Math.min(lineLength + 1, endColumn + 1)
        selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
        content = model.getValueInRange(selectRange)
        if (content.startsWith('*') && content.endsWith('*')) {
          newText = content.substring(1, content.length - 1)
        } else {
          selectRange = selection
          const selectedText = model.getValueInRange(selection)
          newText = `*${selectedText}*`
        }
      }
    }
  }

  const edit = {
    range: selectRange, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: false // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('editSetFontItalic', [edit])
}

function editSetFontAlign(
  editor: monaco.editor.IStandaloneCodeEditor,
  startStr: string,
  endStr: string
) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    EditInsTextAfterCursor(editor, startStr + endStr)
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return

  const selectedText = model.getValueInRange(selection)
  const newText = `${startStr}${selectedText}${endStr}`

  const edit = {
    range: selection, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: true // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('editSetFontAlign', [edit])
}

const fontStyleHandleFuncMap = {
  fontfamily(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return editUpdateFontStyleCommon(editor, style)
  },
  fontsize(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return editUpdateFontStyleCommon(editor, style)
  },
  underline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '<u>', '</u>')
  },
  bold(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '**', '**')
  },
  deleteline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '~~', '~~')
  },
  codeline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '`', '`')
  },
  mathline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '$', '$')
  },
  italic(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return editSetFontItalic(editor, style)
  },
  alignleft(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: left;">\r\n\r\n', '\r\n\r\n</p>')
  },
  aligncenter(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: center;">\r\n', '\r\n</p>')
  },
  alignjustify(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: justify;width: 100%">\r\n', '\r\n</p>')
  },
  alignright(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: right;">\r\n', '\r\n</p>')
  }
}
// 假设 editor 是您已经初始化的 Monaco Editor 实例
export function EditSetFontStyle(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  const handler = fontStyleHandleFuncMap[style.toLowerCase()]
  if (handler) {
    handler(editor, style.toLowerCase())
  }
}

export class hemyMarkdown {
  editor: monaco.editor.IStandaloneCodeEditor

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor
  }

  SetEditor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor
  }

  GetEditor(): monaco.editor.IStandaloneCodeEditor {
    return this.editor
  }

  SetFontStyle(style: string) {
    EditSetFontStyle(this.editor, style)
  }

  CvtToHeader(header: string) {
    EditCvtToHeader(this.editor, header)
  }

  InsertAfterCursor(textToInsert: string) {
    EditInsTextAfterCursor(this.editor, textToInsert)
  }

  PreMermaidRender(text: string): Promise<string> {
    return preRenderMermaidProc(text)
  }
}

function generateRandomNumberString(length: number): string {
  let result = ''
  const characters = '0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

function removeMermaidDiv(mermaidId: string) {
  const divElement = document.getElementById('d' + mermaidId)
  if (divElement) {
    divElement.remove()
  }
}

async function mermaidRender(graphDefinition: string): Promise<string> {
  const mermaidId = 'mermaid' + generateRandomNumberString(10)
  try {
    const renderSvg = await mermaid.render(mermaidId, graphDefinition)
    // 删除mermaid.render过程中增加的div
    removeMermaidDiv(mermaidId)
    return Promise.resolve(
      '<div><pre class="mermaid"><code style="height: auto;display: flex">' +
        renderSvg.svg +
        '</code></pre></div>'
    )
  } catch (error) {
    console.log('mermaidRender error', error)
  }
  removeMermaidDiv(mermaidId)
  return ''
}

export async function preRenderMermaidProc(text: string): Promise<string> {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /```mermaid([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    const renderedSvg = await mermaidRender(match[1])
    renderResult = renderResult.replace(match[0], renderedSvg)
  }

  return renderResult
}

export function PreMarkdownRender(text: string): Promise<string> {
  return preRenderMermaidProc(text)
}

interface markdownTOC {
  level: string
  text: string
  lineNumber: number
}

export function ParserMarkdownChapters(md: MarkdownIt, text: string) {
  // 提取大纲
  const headings: markdownTOC[] = []
  const mdTokens = md.parse(text, [])
  console.log('markdown-it tokens', mdTokens)
  mdTokens.forEach((token) => {
    if (token.type === 'heading_open') {
      const healing: markdownTOC = {
        level: token.tag,
        text: '',
        lineNumber: 0
      }

      if (token.map) {
        healing.lineNumber = token.map[1]
      }

      let nextToken = mdTokens[mdTokens.indexOf(token) + 1]
      while (nextToken && nextToken.type !== 'heading_close') {
        if (nextToken.type === 'inline' && nextToken.children) {
          nextToken.children.forEach((child) => {
            if (child.type === 'text') {
              healing.text += child.content
            }
          })
        }
        nextToken = mdTokens[mdTokens.indexOf(nextToken) + 1]
      }

      headings.push(healing)
    }
  })
  EventBus.$emit('monaco-editor-chapters', headings)
}

export function PostMarkdownRender(text: string): string {
  return text
}
