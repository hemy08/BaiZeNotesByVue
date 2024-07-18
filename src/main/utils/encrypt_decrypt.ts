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
): Promise<{ publicKey: string; privateKey: string }> {
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
      const binary = char.charCodeAt(0).toString(2)
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

export function CryptoEncrypt(data: CryptoData): CryptoResult {
  const cipherInfo = crypto.getCipherInfo(data.algorithm)
  let bufIv: Buffer
  if (!data.iv) {
    // 如果未提供IV，则生成一个（这取决于算法是否需要IV）
    // 注意：对于某些算法（如AES-GCM），IV是必需的
    bufIv = crypto.randomBytes(cipherInfo.ivLength)
    data.iv = bufIv.toString()
  } else {
    bufIv = Buffer.from(data.iv, 'hex')
  }
  let secretKey: Buffer
  if (!data.secretKey) {
    data.secretKeyEncoding = 'hex'
    secretKey = crypto.randomBytes(cipherInfo.keyLength)
  } else {
    secretKey = Buffer.from(data.secretKey, data.secretKeyEncoding)
  }
  const inputEncoding = data.inputEncoding || 'utf8'
  const outputEncoding = data.outputEncoding || 'hex'

  let result = ''
  try {
    const cipher = crypto.createCipheriv(data.algorithm, secretKey, bufIv)
    let encrypted = cipher.update(data.context, inputEncoding, outputEncoding)
    encrypted += cipher.final(outputEncoding)
    result = encrypted
  } catch (error) {
    console.log(error)
    result = error as string
  }
  return {
    context: result,
    iv: bufIv.toString('hex'),
    secretKey: secretKey.toString(data.secretKeyEncoding),
    secretKeyEncoding: data.secretKeyEncoding
  }
}

export function CryptoDecrypt(data: CryptoData) {
  let bufIv: Buffer
  if (data.iv) {
    bufIv = Buffer.from(data.iv, 'hex' as BufferEncoding)
  } else {
    bufIv = crypto.randomBytes(crypto.getCipherInfo(data.algorithm).ivLength)
  }
  const bufKey = Buffer.from(data.secretKey, data.secretKeyEncoding)
  const inputEncoding = data.inputEncoding || 'hex'
  const outputEncoding = data.outputEncoding || 'utf8'
  try {
    const decipher = crypto.createDecipheriv(data.algorithm, bufKey, bufIv)
    let decrypted = decipher.update(data.context, inputEncoding, outputEncoding)
    decrypted += decipher.final(outputEncoding)
    return decrypted
  } catch (error) {
    console.log(error)
    return error
  }
}
