<script setup lang="ts">
import { Menu } from 'electron'

const template = [
  {
    label: '文件',
    submenu: [
      {
        label: '新建文件',
        accelerator: 'ctrl+n',
        click: function () {
          alert('ctrl')
        }
      },
      {
        label: '新建窗口',
        accelerator: 'Ctrl+Shift+N',
        click: function () {
          alert('新建窗口')
        }
      }
    ]
  },
  {
    label: '编辑',
    submenu: [
      {
        label: '编辑文件'
      },
      {
        label: '编辑窗口'
      }
    ]
  }
]

const m = Menu.buildFromTemplate(template)

Menu.setApplicationMenu(m)
</script>

<template></template>

<style scoped></style>
