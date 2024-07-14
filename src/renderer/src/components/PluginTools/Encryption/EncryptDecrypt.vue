<template xmlns="http://www.w3.org/1999/html">
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">加密/解密文本</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">使用加密算法（如AES、TripleDES、Rabbit或RC4）加密和解密文本明文。</p>
    <a href="https://tools.w3cschool.cn/encryption"> https://tools.w3cschool.cn/encryption </a>
    <div style="width: 100%; display: flex; flex-direction: row">
      <div style="width: 50%">
        <h2>文本加密</h2>
        <div style="width: 100%; display: flex; flex-direction: column">
          <div style="width: 100%; display: flex; flex-direction: row">
            <div>
              <label for="input-text">请输入你需要加密的文本: </label>
              <textarea id="input-text" placeholder="请输入你需要加密的文本..." style="width: 500px; height: 200px;margin-top: 20px" ></textarea>
            </div>
            <div style="width: 100%; margin: 20px; display: flex; flex-direction: column">
              <div style="margin-top: 10px"><label for="input-secret-key">请输入你的秘钥</label></div>
              <div style="margin-top: 10px"><input id="input-secret-key" type="text" placeholder="请输入你的秘钥..." style="width: 200px;" ></div>
              <div style="margin-top: 10px"><label>请选择加密算法</label></div>
              <div style="margin-top: 10px">
                <select style="width: 200px">
                  <option id="encrypt-by-AES" value="AES">AES</option>
                  <option id="encrypt-by-DES" value="DES">DES</option>
                  <option id="encrypt-by-TripleDES" value="TripleDES">TripleDES</option>
                  <option id="encrypt-by-RC4" value="RC4">RC4</option>
                  <option id="encrypt-by-RC4Drop" value="RC4Drop">RC4Drop</option>
                  <option id="encrypt-by-Rabbit" value="DES">Rabbit</option>
                  <option id="encrypt-by-RabbitLegacy" value="DES">RabbitLegacy</option>
                </select>
              </div>
            </div>
          </div>
          <div style="margin-top: 20px">
            <label for="encrypt-result">加密结果: </label>
            <textarea id="encrypt-result" placeholder="加密结果..." style="width: 900px; height: 200px;margin-top: 20px" ></textarea>
          </div>
        </div>
      </div>
      <div style="width: 50px">
        <div style="width: 2px; background-color: black; height: 100%; margin: 1px 22px"></div>
      </div>
      <div style="width: 50%">
        <h2>文本解密</h2>
        <div>
          <textarea
            id="input-text"
            placeholder="请输入你需要解密的文本..."
            style="width: 900px; height: 200px"
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped></style>
