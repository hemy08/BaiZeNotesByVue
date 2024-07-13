<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">Hash 哈希文本生成</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">
      使用所需的函数哈希文本字符串：MD5、SHA1、SHA256、SHA224、SHA512、SHA384、SHA3或RIPEMD160
    </p>
    <a href="https://tools.w3cschool.cn/hash-text"> https://tools.w3cschool.cn/hash-text </a>
    <div><label>需要进行HASH的文本：</label></div>
    <div>
      <textarea
        id="hash-text-input"
        placeholder="请输入你的文本..."
        style="width: 800px; height: 200px"
      ></textarea>
    </div>
    <div><label>需要进行HASH的文本：</label></div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped></style>
