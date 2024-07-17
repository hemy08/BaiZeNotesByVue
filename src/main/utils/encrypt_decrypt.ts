import { ipcMain } from 'electron'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto')

// 生成RSA密钥对
function generateRsaKeyPair(
  bits = 2048,
  publicKeyEncoding = {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding = {
    type: 'pkcs8',
    format: 'pem'
  }
) {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: bits,
        publicKeyEncoding: publicKeyEncoding,
        privateKeyEncoding: privateKeyEncoding
      },
      (err, publicKey, privateKey) => {
        if (err) {
          return reject(err)
        }
        resolve({ publicKey, privateKey })
      }
    )
  })
}

export function CreateRsaKeyPair(bits: number) {
  generateRsaKeyPair(bits)
    .then(({ publicKey, privateKey }) => {
      global.MainWindow.webContents.send('plugin-tools-generator-rsa-result', publicKey, privateKey)
    })
    .catch((err) => {
      console.error(err)
    })
}

interface HashResult {
  [key: string]: string // 使用索引签名来允许任何字符串键
}

const hashTextInput = [
  { text: 'MD4', algorithm: 'md4' },
  { text: 'MD5', algorithm: 'md5' },
  { text: 'SHA1', algorithm: 'sha1' },
  { text: 'SHA224', algorithm: 'sha224' },
  { text: 'SHA256', algorithm: 'sha256' },
  { text: 'SHA384', algorithm: 'sha384' },
  { text: 'SHA512', algorithm: 'sha512' },
  { text: 'SHA512-256', algorithm: 'sha512-256' },
  { text: 'RIPEMD160', algorithm: 'RIPEMD160' }
]

function DigestBufferToBinaryString(hexString: Buffer) {
  return hexString
    .toString()
    .split('')
    .map((char) => {
      let binary = char.charCodeAt(0).toString(2)
      return binary.padStart(8, '0')
    })
    .join('')
}

export function CreateHash(context: string, encType: string): HashResult {
  let encoding = 'hex'
  if (['binary', 'base64', 'base64url'].includes(encType.toLowerCase())) {
    encoding = encType.toLowerCase()
  }
  const result: HashResult = {}
  hashTextInput.forEach((item) => {
    try {
      const hash = crypto.createHash(item.algorithm)
      hash.update(context)
      if (encoding === 'binary') {
        result[item.text] = DigestBufferToBinaryString(hash.digest())
      } else {
        result[item.text] = hash.digest(encoding)
      }
    } catch (error) {
      console.log(error)
    }
  })
  return result
}

export function CreateHmac(context: string, secKey: string, encType: string) {
  let encoding = 'hex'
  if (['binary', 'base64', 'base64url'].includes(encType.toLowerCase())) {
    encoding = encType.toLowerCase()
  }
  console.log('crypto.getCiphers()', crypto.getCiphers(), crypto.createCipheriv())
  const result: HashResult = {}
  hashTextInput.forEach((item) => {
    try {
      const hmac = crypto.createHmac(item.algorithm, secKey)
      hmac.update(context)
      if (encoding === 'binary') {
        result[item.text] = DigestBufferToBinaryString(hmac.digest())
      } else {
        result[item.text] = hmac.digest(encoding)
      }
    } catch (error) {
      console.log(error)
    }
  })
  return result
}

/* [
  'aes-128-cbc',
  'aes-128-cfb',
  'aes-128-ctr',
  'aes-128-ecb',
  'aes-128-gcm',
  'aes-128-ofb',
  'aes-192-cbc',
  'aes-192-ctr',
  'aes-192-ecb',
  'aes-192-gcm',
  'aes-192-ofb',
  'aes-256-cbc',
  'aes-256-cfb',
  'aes-256-ctr',
  'aes-256-ecb',
  'aes-256-gcm',
  'aes-256-ofb',
  'bf-cbc',
  'bf-cfb',
  'bf-ecb',
  'des-cbc',
  'des-ecb',
  'des-ede',
  'des-ede-cbc',
  'des-ede3',
  'des-ede3-cbc',
  'rc2-cbc',
  'rc4'
]*/

export function CryptoEncrypt(context: string, secretKey: string, algorithm: string) {
  const cipher = crypto.createCipheriv(algorithm, secretKey)
  const result = cipher.encrypt()
}

export function CryptoDecrypt() {}
