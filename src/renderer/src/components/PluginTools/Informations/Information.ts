interface ASCIIInfo {
  bit: string
  oct: string
  dec: string
  hex: string
  abridge: string
  mask: string
}

interface FormulaSymInfo {
  id: string
  mark: string
}

interface HTMLChar {
  id: string
  mark: string
}

interface PhySymInfo {
  symbol: string
  name: string
  mark: string
}

interface SubNetMaskBitsInfo {
  mask: string
  bit: string
  nums: string
}

interface HTTPStatusCodeInfo {
  code: string
  desc: string
}

interface NumericCaseInfo {
  number: string
  lower: string
  upper: string
}

interface NormalFontStyle {
  name: string
  cssStyle: string
}

interface HTMLMimeType {
  ext: string
  type: string
}

interface GreeceLetterInfo {
  char: string
  code: string
}

export const ASCIITable: ASCIIInfo[] = [
  { bin: '0000 0000', oct: '00', dec: '0', hex: '0x00', abridge: 'NUL(null)', mark: '空字符' },
  {
    bin: '0000 0001',
    oct: '01',
    dec: '1',
    hex: '0x01',
    abridge: 'SOH(start of headline)',
    mark: '标题开始'
  },
  {
    bin: '0000 0010',
    oct: '02',
    dec: '2',
    hex: '0x02',
    abridge: 'STX (start of text)',
    mark: '正文开始'
  },
  {
    bin: '0000 0011',
    oct: '03',
    dec: '3',
    hex: '0x03',
    abridge: 'ETX (end of text)',
    mark: '正文结束'
  },
  {
    bin: '0000 0100',
    oct: '04',
    dec: '4',
    hex: '0x04',
    abridge: 'EOT (end of transmission)',
    mark: '传输结束'
  },
  { bin: '0000 0101', oct: '05', dec: '5', hex: '0x05', abridge: 'ENQ (enquiry)', mark: '请求' },
  {
    bin: '0000 0110',
    oct: '06',
    dec: '6',
    hex: '0x06',
    abridge: 'ACK (acknowledge)',
    mark: '收到通知'
  },
  { bin: '0000 0111', oct: '07', dec: '7', hex: '0x07', abridge: 'BEL (bell)', mark: '响铃' },
  { bin: '0000 1000', oct: '010', dec: '8', hex: '0x08', abridge: 'BS (backspace)', mark: '退格' },
  {
    bin: '0000 1001',
    oct: '011',
    dec: '9',
    hex: '0x09',
    abridge: 'HT (horizontal tab)',
    mark: '水平制表符'
  },
  {
    bin: '0000 1010',
    oct: '012',
    dec: '10',
    hex: '0x0A',
    abridge: 'LF (NL line feed, new line)',
    mark: '换行键'
  },
  {
    bin: '0000 1011',
    oct: '013',
    dec: '11',
    hex: '0x0B',
    abridge: 'VT (vertical tab)',
    mark: '垂直制表符'
  },
  {
    bin: '0000 1100',
    oct: '014',
    dec: '12',
    hex: '0x0C',
    abridge: 'FF (NP form feed, new page)',
    mark: '换页键'
  },
  {
    bin: '0000 1101',
    oct: '015',
    dec: '13',
    hex: '0x0D',
    abridge: 'CR (carriage return)',
    mark: '回车键'
  },
  {
    bin: '0000 1110',
    oct: '016',
    dec: '14',
    hex: '0x0E',
    abridge: 'SO (shift out)',
    mark: '不用切换'
  },
  {
    bin: '0000 1111',
    oct: '017',
    dec: '15',
    hex: '0x0F',
    abridge: 'SI (shift in)',
    mark: '启用切换'
  },
  {
    bin: '0001 0000',
    oct: '020',
    dec: '16',
    hex: '0x10',
    abridge: 'DLE (data link escape)',
    mark: '数据链路转义'
  },
  {
    bin: '0001 0001',
    oct: '021',
    dec: '17',
    hex: '0x11',
    abridge: 'DC1 (device control 1)',
    mark: '设备控制1'
  },
  {
    bin: '0001 0010',
    oct: '022',
    dec: '18',
    hex: '0x12',
    abridge: 'DC2 (device control 2)',
    mark: '设备控制2'
  },
  {
    bin: '0001 0011',
    oct: '023',
    dec: '19',
    hex: '0x13',
    abridge: 'DC3 (device control 3)',
    mark: '设备控制3'
  },
  {
    bin: '0001 0100',
    oct: '024',
    dec: '20',
    hex: '0x14',
    abridge: 'DC4 (device control 4)',
    mark: '设备控制4'
  },
  {
    bin: '0001 0101',
    oct: '025',
    dec: '21',
    hex: '0x15',
    abridge: 'NAK (negative acknowledge)',
    mark: '拒绝接收'
  },
  {
    bin: '0001 0110',
    oct: '026',
    dec: '22',
    hex: '0x16',
    abridge: 'SYN (synchronous idle)',
    mark: '同步空闲'
  },
  {
    bin: '0001 0111',
    oct: '027',
    dec: '23',
    hex: '0x17',
    abridge: 'ETB (end of trans. block)',
    mark: '结束传输块'
  },
  { bin: '0001 1000', oct: '030', dec: '24', hex: '0x18', abridge: 'CAN (cancel)', mark: '取消' },
  {
    bin: '0001 1001',
    oct: '031',
    dec: '25',
    hex: '0x19',
    abridge: 'EM (end of medium)',
    mark: '媒介结束'
  },
  {
    bin: '0001 1010',
    oct: '032',
    dec: '26',
    hex: '0x1A',
    abridge: 'SUB (substitute)',
    mark: '代替'
  },
  {
    bin: '0001 1011',
    oct: '033',
    dec: '27',
    hex: '0x1B',
    abridge: 'ESC (escape)',
    mark: '换码(溢出)'
  },
  {
    bin: '0001 1100',
    oct: '034',
    dec: '28',
    hex: '0x1C',
    abridge: 'FS (file separator)',
    mark: '文件分隔符'
  },
  {
    bin: '0001 1101',
    oct: '035',
    dec: '29',
    hex: '0x1D',
    abridge: 'GS (group separator)',
    mark: '分组符'
  },
  {
    bin: '0001 1110',
    oct: '036',
    dec: '30',
    hex: '0x1E',
    abridge: 'RS (record separator)',
    mark: '记录分隔符'
  },
  {
    bin: '0001 1111',
    oct: '037',
    dec: '31',
    hex: '0x1F',
    abridge: 'US (unit separator)',
    mark: '单元分隔符'
  },
  { bin: '0010 0000', oct: '040', dec: '32', hex: '0x20', abridge: '(space)', mark: '空格' },
  { bin: '0010 0001', oct: '041', dec: '33', hex: '0x21', abridge: '!', mark: '叹号' },
  { bin: '0010 0010', oct: '042', dec: '34', hex: '0x22', abridge: '"', mark: '双引号' },
  { bin: '0010 0011', oct: '043', dec: '35', hex: '0x23', abridge: '#', mark: '井号' },
  { bin: '0010 0100', oct: '044', dec: '36', hex: '0x24', abridge: '$', mark: '美元符' },
  { bin: '0010 0101', oct: '045', dec: '37', hex: '0x25', abridge: '%', mark: '百分号' },
  { bin: '0010 0110', oct: '046', dec: '38', hex: '0x26', abridge: '&', mark: '和号' },
  { bin: '0010 0111', oct: '047', dec: '39', hex: '0x27', abridge: "'", mark: '单引号' },
  { bin: '0010 1000', oct: '050', dec: '40', hex: '0x28', abridge: '(', mark: '开括号' },
  { bin: '0010 1001', oct: '051', dec: '41', hex: '0x29', abridge: ')', mark: '闭括号' },
  { bin: '0010 1010', oct: '052', dec: '42', hex: '0x2A', abridge: '*', mark: '星号' },
  { bin: '0010 1011', oct: '053', dec: '43', hex: '0x2B', abridge: '+', mark: '加号' },
  { bin: '0010 1100', oct: '054', dec: '44', hex: '0x2C', abridge: ',', mark: '逗号' },
  { bin: '0010 1101', oct: '055', dec: '45', hex: '0x2D', abridge: '-', mark: '减号/破折号' },
  { bin: '0010 1110', oct: '056', dec: '46', hex: '0x2E', abridge: '.', mark: '句号' },
  { bin: '0010 1111', oct: '057', dec: '47', hex: '0x2F', abridge: '/', mark: '斜杠' },
  { bin: '0011 0000', oct: '060', dec: '48', hex: '0x30', abridge: '0', mark: '字符0' },
  { bin: '0011 0001', oct: '061', dec: '49', hex: '0x31', abridge: '1', mark: '字符1' },
  { bin: '0011 0010', oct: '062', dec: '50', hex: '0x32', abridge: '2', mark: '字符2' },
  { bin: '0011 0011', oct: '063', dec: '51', hex: '0x33', abridge: '3', mark: '字符3' },
  { bin: '0011 0100', oct: '064', dec: '52', hex: '0x34', abridge: '4', mark: '字符4' },
  { bin: '0011 0101', oct: '065', dec: '53', hex: '0x35', abridge: '5', mark: '字符5' },
  { bin: '0011 0110', oct: '066', dec: '54', hex: '0x36', abridge: '6', mark: '字符6' },
  { bin: '0011 0111', oct: '067', dec: '55', hex: '0x37', abridge: '7', mark: '字符7' },
  { bin: '0011 1000', oct: '070', dec: '56', hex: '0x38', abridge: '8', mark: '字符8' },
  { bin: '0011 1001', oct: '071', dec: '57', hex: '0x39', abridge: '9', mark: '字符9' },
  { bin: '0011 1010', oct: '072', dec: '58', hex: '0x3A', abridge: ':', mark: '冒号' },
  { bin: '0011 1011', oct: '073', dec: '59', hex: '0x3B', abridge: ';', mark: '分号' },
  { bin: '0011 1100', oct: '074', dec: '60', hex: '0x3C', abridge: '<', mark: '小于' },
  { bin: '0011 1101', oct: '075', dec: '61', hex: '0x3D', abridge: '=', mark: '等号' },
  { bin: '0011 1110', oct: '076', dec: '62', hex: '0x3E', abridge: '>', mark: '大于' },
  { bin: '0011 1111', oct: '077', dec: '63', hex: '0x3F', abridge: '?', mark: '问号' },
  { bin: '0100 0000', oct: '0100', dec: '64', hex: '0x40', abridge: '@', mark: '电子邮件符号' },
  { bin: '0100 0001', oct: '0101', dec: '65', hex: '0x41', abridge: 'A', mark: '大写字母A' },
  { bin: '0100 0010', oct: '0102', dec: '66', hex: '0x42', abridge: 'B', mark: '大写字母B' },
  { bin: '0100 0011', oct: '0103', dec: '67', hex: '0x43', abridge: 'C', mark: '大写字母C' },
  { bin: '0100 0100', oct: '0104', dec: '68', hex: '0x44', abridge: 'D', mark: '大写字母D' },
  { bin: '0100 0101', oct: '0105', dec: '69', hex: '0x45', abridge: 'E', mark: '大写字母E' },
  { bin: '0100 0110', oct: '0106', dec: '70', hex: '0x46', abridge: 'F', mark: '大写字母F' },
  { bin: '0100 0111', oct: '0107', dec: '71', hex: '0x47', abridge: 'G', mark: '大写字母G' },
  { bin: '0100 1000', oct: '0110', dec: '72', hex: '0x48', abridge: 'H', mark: '大写字母H' },
  { bin: '0100 1001', oct: '0111', dec: '73', hex: '0x49', abridge: 'I', mark: '大写字母I' },
  { bin: '0100 1010', oct: '0112', dec: '74', hex: '0x4A', abridge: 'J', mark: '大写字母J' },
  { bin: '0100 1011', oct: '0113', dec: '75', hex: '0x4B', abridge: 'K', mark: '大写字母K' },
  { bin: '0100 1100', oct: '0114', dec: '76', hex: '0x4C', abridge: 'L', mark: '大写字母L' },
  { bin: '0100 1101', oct: '0115', dec: '77', hex: '0x4D', abridge: 'M', mark: '大写字母M' },
  { bin: '0100 1110', oct: '0116', dec: '78', hex: '0x4E', abridge: 'N', mark: '大写字母N' },
  { bin: '0100 1111', oct: '0117', dec: '79', hex: '0x4F', abridge: 'O', mark: '大写字母O' },
  { bin: '0101 0000', oct: '0120', dec: '80', hex: '0x50', abridge: 'P', mark: '大写字母P' },
  { bin: '0101 0001', oct: '0121', dec: '81', hex: '0x51', abridge: 'Q', mark: '大写字母Q' },
  { bin: '0101 0010', oct: '0122', dec: '82', hex: '0x52', abridge: 'R', mark: '大写字母R' },
  { bin: '0101 0011', oct: '0123', dec: '83', hex: '0x53', abridge: 'S', mark: '大写字母S' },
  { bin: '0101 0100', oct: '0124', dec: '84', hex: '0x54', abridge: 'T', mark: '大写字母T' },
  { bin: '0101 0101', oct: '0125', dec: '85', hex: '0x55', abridge: 'U', mark: '大写字母U' },
  { bin: '0101 0110', oct: '0126', dec: '86', hex: '0x56', abridge: 'V', mark: '大写字母V' },
  { bin: '0101 0111', oct: '0127', dec: '87', hex: '0x57', abridge: 'W', mark: '大写字母W' },
  { bin: '0101 1000', oct: '0130', dec: '88', hex: '0x58', abridge: 'X', mark: '大写字母X' },
  { bin: '0101 1001', oct: '0131', dec: '89', hex: '0x59', abridge: 'Y', mark: '大写字母Y' },
  { bin: '0101 1010', oct: '0132', dec: '90', hex: '0x5A', abridge: 'Z', mark: '大写字母Z' },
  { bin: '0101 1011', oct: '0133', dec: '91', hex: '0x5B', abridge: '[', mark: '开方括号' },
  { bin: '0101 1100', oct: '0134', dec: '92', hex: '0x5C', abridge: '\\', mark: '反斜杠' },
  { bin: '0101 1101', oct: '0135', dec: '93', hex: '0x5D', abridge: ']', mark: '闭方括号' },
  { bin: '0101 1110', oct: '0136', dec: '94', hex: '0x5E', abridge: '^', mark: '脱字符' },
  { bin: '0101 1111', oct: '0137', dec: '95', hex: '0x5F', abridge: '_', mark: '下划线' },
  { bin: '0110 0000', oct: '0140', dec: '96', hex: '0x60', abridge: '`', mark: '开单引号' },
  { bin: '0110 0001', oct: '0141', dec: '97', hex: '0x61', abridge: 'a', mark: '小写字母a' },
  { bin: '0110 0010', oct: '0142', dec: '98', hex: '0x62', abridge: 'b', mark: '小写字母b' },
  { bin: '0110 0011', oct: '0143', dec: '99', hex: '0x63', abridge: 'c', mark: '小写字母c' },
  { bin: '0110 0100', oct: '0144', dec: '100', hex: '0x64', abridge: 'd', mark: '小写字母d' },
  { bin: '0110 0101', oct: '0145', dec: '101', hex: '0x65', abridge: 'e', mark: '小写字母e' },
  { bin: '0110 0110', oct: '0146', dec: '102', hex: '0x66', abridge: 'f', mark: '小写字母f' },
  { bin: '0110 0111', oct: '0147', dec: '103', hex: '0x67', abridge: 'g', mark: '小写字母g' },
  { bin: '0110 1000', oct: '0150', dec: '104', hex: '0x68', abridge: 'h', mark: '小写字母h' },
  { bin: '0110 1001', oct: '0151', dec: '105', hex: '0x69', abridge: 'i', mark: '小写字母i' },
  { bin: '0110 1010', oct: '0152', dec: '106', hex: '0x6A', abridge: 'j', mark: '小写字母j' },
  { bin: '0110 1011', oct: '0153', dec: '107', hex: '0x6B', abridge: 'k', mark: '小写字母k' },
  { bin: '0110 1100', oct: '0154', dec: '108', hex: '0x6C', abridge: 'l', mark: '小写字母l' },
  { bin: '0110 1101', oct: '0155', dec: '109', hex: '0x6D', abridge: 'm', mark: '小写字母m' },
  { bin: '0110 1110', oct: '0156', dec: '110', hex: '0x6E', abridge: 'n', mark: '小写字母n' },
  { bin: '0110 1111', oct: '0157', dec: '111', hex: '0x6F', abridge: 'o', mark: '小写字母o' },
  { bin: '0111 0000', oct: '0160', dec: '112', hex: '0x70', abridge: 'p', mark: '小写字母p' },
  { bin: '0111 0001', oct: '0161', dec: '113', hex: '0x71', abridge: 'q', mark: '小写字母q' },
  { bin: '0111 0010', oct: '0162', dec: '114', hex: '0x72', abridge: 'r', mark: '小写字母r' },
  { bin: '0111 0011', oct: '0163', dec: '115', hex: '0x73', abridge: 's', mark: '小写字母s' },
  { bin: '0111 0100', oct: '0164', dec: '116', hex: '0x74', abridge: 't', mark: '小写字母t' },
  { bin: '0111 0101', oct: '0165', dec: '117', hex: '0x75', abridge: 'u', mark: '小写字母u' },
  { bin: '0111 0110', oct: '0166', dec: '118', hex: '0x76', abridge: 'v', mark: '小写字母v' },
  { bin: '0111 0111', oct: '0167', dec: '119', hex: '0x77', abridge: 'w', mark: '小写字母w' },
  { bin: '0111 1000', oct: '0170', dec: '120', hex: '0x78', abridge: 'x', mark: '小写字母x' },
  { bin: '0111 1001', oct: '0171', dec: '121', hex: '0x79', abridge: 'y', mark: '小写字母y' },
  { bin: '0111 1010', oct: '0172', dec: '122', hex: '0x7A', abridge: 'z', mark: '小写字母z' },
  { bin: '0111 1011', oct: '0173', dec: '123', hex: '0x7B', abridge: '{', mark: '开花括号' },
  { bin: '0111 1100', oct: '0174', dec: '124', hex: '0x7C', abridge: '|', mark: '垂线' },
  { bin: '0111 1101', oct: '0175', dec: '125', hex: '0x7D', abridge: '}', mark: '闭花括号' },
  { bin: '0111 1110', oct: '0176', dec: '126', hex: '0x7E', abridge: '~', mark: '波浪号' },
  { bin: '0111 1111', oct: '0177', dec: '127', hex: '0x7F', abridge: 'DEL (delete)', mark: '删除' }
]

export const FormulaSymbolTable: FormulaSymInfo[] = [
  { id: '≈', mark: '约等于' },
  { id: '≡', mark: '恒等于' },
  { id: '≠', mark: '不等于' },
  { id: '＝', mark: '等于号' },
  { id: '≤', mark: '小于等于' },
  { id: '≥', mark: '大于等于' },
  { id: '＜', mark: '小于' },
  { id: '＞', mark: '大于' },
  { id: '∀', mark: '任意' },
  { id: '∃', mark: '存在' },
  { id: '∷', mark: '成比例' },
  { id: '±', mark: '正负号' },
  { id: '＋', mark: '加号' },
  { id: '－', mark: '减号' },
  { id: '×', mark: '乘号' },
  { id: '÷', mark: '除号' },
  { id: '∫', mark: '积分' },
  { id: '∮', mark: '闭合曲面（曲线）积分' },
  { id: '∝', mark: '正比例' },
  { id: '∞', mark: '无穷大' },
  { id: '∧', mark: '与（合取）' },
  { id: '∨', mark: '或（析取）' },
  { id: '¬', mark: '非（否定）' },
  { id: '→', mark: '蕴含' },
  { id: '⇔', mark: '双条件（等价' },
  { id: '∑', mark: '求和' },
  { id: '∏', mark: '求积' },
  { id: '∪', mark: '并集' },
  { id: '∩', mark: '交集' },
  { id: '∈', mark: '属于' },
  { id: '∉', mark: '不属于' },
  { id: '⊆', mark: '包含于' },
  { id: '⊇', mark: '包含' },
  { id: '∵', mark: '因为' },
  { id: '∴', mark: '所以' },
  { id: '⊥', mark: '垂直' },
  { id: '‖', mark: '平行' },
  { id: '∠', mark: '角' },
  { id: '⌒', mark: '半圆' },
  { id: '⊙', mark: '园' },
  { id: '≌', mark: '全等' },
  { id: '∽', mark: '相似' },
  { id: '△', mark: '三角形' },
  { id: '≡', mark: '分币符号' },
  { id: 'π', mark: '圆周率' },
  { id: 'e', mark: '自然常数' },
  { id: 'ⁿ', mark: 'n次方' },
  { id: '√', mark: '根号' },
  { id: 'f(x)', mark: '函数' },
  { id: 'lim', mark: '极限' },
  { id: '℃', mark: '摄氏度' },
  { id: 'α', mark: 'Alpha' },
  { id: 'β', mark: 'Beta' },
  { id: 'γ', mark: 'Gamma' },
  { id: 'δ', mark: 'Delta' },
  { id: 'ε', mark: 'Epsilon' },
  { id: 'ζ', mark: 'Zeta' },
  { id: 'η', mark: 'Eta' },
  { id: 'θ', mark: 'Theta' },
  { id: 'ι', mark: 'Iota' },
  { id: 'κ', mark: 'Kappa' },
  { id: 'λ', mark: 'Lambda' },
  { id: 'μ', mark: 'Mu' },
  { id: 'ν', mark: 'Nu' },
  { id: 'ξ', mark: 'Xi' },
  { id: 'ο', mark: 'Omicron' },
  { id: 'π', mark: 'Pi' },
  { id: 'ρ', mark: 'Rho' },
  { id: 'σ', mark: 'Sigma' },
  { id: 'τ', mark: 'Tau' },
  { id: 'υ', mark: 'Upsilon' },
  { id: 'φ', mark: 'Phi' },
  { id: 'χ', mark: 'Chi' },
  { id: 'ψ', mark: 'Psi' },
  { id: 'ω', mark: 'Omega' }
]

export const HTMLSpecCharTable: HTMLChar[] = [
  { id: '&#36', mark: '美元符号' },
  { id: '&#162', mark: '分币符号' },
  { id: '&#163', mark: '英镑' },
  { id: '&#164', mark: '通用货币符号' },
  { id: '&#165', mark: '人民币符号' },
  { id: '&#8364', mark: '欧元符号' },
  { id: '&#8369', mark: '菲律宾比索' },
  { id: '&#8377', mark: '印度货币符号' },
  { id: '&#8355', mark: '法郎' },
  { id: '&#9833', mark: '四分音符' },
  { id: '&#9834', mark: '八分音符' },
  { id: '&#9835', mark: '带梁的八分音符' },
  { id: '&#9836', mark: '带梁的十六分音符' },
  { id: '&#9837', mark: '音乐的降半音标记' },
  { id: '&#9838', mark: '音乐的升记号' },
  { id: '&#9839', mark: '音乐的还原记号' },
  { id: '&#9840', mark: '十字几号' },
  { id: '&#9832', mark: '温泉符号' },
  { id: '&#9745', mark: '方框对号' },
  { id: '&#9746', mark: '方框错号' },
  { id: '&#10016', mark: '十字星' },
  { id: '&#10026', mark: '星号' },
  { id: '&#10017', mark: '空心六角星' },
  { id: '&#10036', mark: '八角星' },
  { id: '&#10052', mark: '雪花1' },
  { id: '&#10053', mark: '雪花2' },
  { id: '&#10054', mark: '雪花3' },
  { id: '&#8672', mark: '向左的虚线箭头' },
  { id: '&#8674', mark: '向右的虚线箭头' },
  { id: '&#8621', mark: '弓形双箭头' },
  { id: '&#8606', mark: '向左的双箭头' },
  { id: '&#8608', mark: '向右的双箭头' },
  { id: '&#10224', mark: '向上房子箭头' },
  { id: '&#8592', mark: '向左的箭头' },
  { id: '&#8594', mark: '向右的箭头' },
  { id: '&#10225', mark: '倒立房子箭头' },
  { id: '&#8596', mark: '左右箭头' },
  { id: '&#8644', mark: '左右的双箭头' },
  { id: '&#8629', mark: '回车' },
  { id: '&#8610', mark: '向左的鱼骨箭头' },
  { id: '&#8611', mark: '向右的鱼骨箭头' },
  { id: '&#8623', mark: '多弯道路标' },
  { id: '&#8619', mark: '向左的绕线箭头' },
  { id: '&#8620', mark: '向右的绕线箭头' },
  { id: '&#10152', mark: '加粗的右箭头' },
  { id: '&#8668', mark: '向左的绕线箭头' },
  { id: '&#8669', mark: '向右的绕线箭头' },
  { id: '&#10162', mark: '阴影的右箭头' },
  { id: '&#8678', mark: '左箭头' },
  { id: '&#8680', mark: '右箭头' },
  { id: '&#10148', mark: '右三角箭头' },
  { id: '&#8630', mark: '左弯曲箭头' },
  { id: '&#8631', mark: '右弯曲箭头' },
  { id: '&#9650', mark: '三角形' },
  { id: '&#8634', mark: '逆时针旋转箭头' },
  { id: '&#8635', mark: '顺时针旋转箭头' },
  { id: '&#9660', mark: '倒三角' },
  { id: '&#10226', mark: '逆时针旋转' },
  { id: '&#10227', mark: '顺时针旋转' },
  { id: '&#10084', mark: '心形' },
  { id: '&#8673', mark: '向上的虚线箭头' },
  { id: '&#8675', mark: '向下的虚线箭头' },
  { id: '&#9992', mark: '飞机' },
  { id: '&#8607', mark: '向上的双箭头' },
  { id: '&#8609', mark: '向下的双箭头' },
  { id: '&#9733', mark: '五角星' },
  { id: '&#8593', mark: '向上的箭头' },
  { id: '&#8595', mark: '向下的箭头' },
  { id: '&#10022', mark: '四角星' },
  { id: '&#8597', mark: '上下箭头' },
  { id: '&#8645', mark: '上下的双箭头' },
  { id: '&#9728', mark: '八角星' },
  { id: '&#8670', mark: '向上的鱼骨箭头' },
  { id: '&#8671', mark: '向下的鱼骨箭头' },
  { id: '&#9670', mark: '小立正方形' },
  { id: '&#8679', mark: '上箭头' },
  { id: '&#8681', mark: '下箭头' },
  { id: '&#9672', mark: '嵌套正方形' },
  { id: '&#171', mark: '左书名号' },
  { id: '&#187', mark: '右书名号' },
  { id: '&#161', mark: '倒立的感叹号' },
  { id: '&#139', mark: '小于号' },
  { id: '&#155', mark: '大于号' },
  { id: '&#191', mark: '倒立的问号' },
  { id: '&#8220', mark: '左双引号' },
  { id: '&#8221', mark: '右双引号' },
  { id: '&#8453', mark: '百分号' },
  { id: '&#8216', mark: '左单引号' },
  { id: '&#8217', mark: '右单引号' },
  { id: '&#8470', mark: 'Number符号' },
  { id: '&#8226', mark: '着重号' },
  { id: '&#9702', mark: '句号' },
  { id: '&#38', mark: '逻辑与符号' },
  { id: '&#8478', mark: 'R标' },
  { id: '&#124', mark: '竖线' },
  { id: '&#64', mark: '邮箱符号' },
  { id: '&#8451', mark: '摄氏度' },
  { id: '&#8457', mark: '华氏度' },
  { id: '&#176', mark: '度' },
  { id: '&#166', mark: '竖虚线' },
  { id: '&#8211', mark: '连接符' },
  { id: '&#8212', mark: '横线' },
  { id: '&#8230', mark: '省略号' },
  { id: '&#182', mark: '行首符号' },
  { id: '&#8764', mark: '波浪线' },
  { id: '&#8800', mark: '不等号' },
  { id: '&#174', mark: '注册商标标记' },
  { id: '&#169', mark: '版权符号' },
  { id: '&#8471', mark: '录音版符号' },
  { id: '&#153', mark: '暂用商标符号' },
  { id: '&#8480', mark: '服务标记符号' },
  { id: '&#8220', mark: '左双引号' },
  { id: '&#8221', mark: '右双引号' },
  { id: '&#8674', mark: '向右的箭头' }
]

export const PhysicalTable: PhySymInfo[] = [
  { symbol: 'm', name: '质量', mark: '单位为千克（kg），表示物体所含物质的多少。' },
  { symbol: 'v', name: '速度', mark: '单位为米每秒（m/s），表示物体运动的快慢和方向。' },
  {
    symbol: 'a',
    name: '加速度',
    mark: '单位为米每二次方秒（m/s²），表示物体速度变化的快慢和方向。'
  },
  { symbol: 'F', name: '力', mark: '单位为牛顿（N），表示物体间的相互作用。' },
  {
    symbol: 'p',
    name: '动量',
    mark: '单位为千克米每秒（kg·m/s），表示物体的质量和速度的乘积，是描述物体运动状态的物理量。'
  },
  { symbol: 'W', name: '功', mark: '单位为焦耳（J），表示力对物体做功的多少。' },
  { symbol: 'E', name: '能量', mark: '单位为焦耳（J），表示物体做功的能力。' },
  { symbol: 's 或 x', name: '位移', mark: '单位为米（m），表示物体位置的变化。' },
  { symbol: 't', name: '时间', mark: '单位为秒（s），表示运动过程所经历的时间。' },
  { symbol: 'q', name: '电荷量', mark: '单位为库仑（C），表示物体带电的多少。' },
  { symbol: 'I', name: '电流', mark: '单位为安培（A），表示电荷的定向移动。' },
  { symbol: 'R', name: '电阻', mark: '单位为欧姆（Ω），表示导体对电流的阻碍作用。' },
  { symbol: 'C', name: '电容', mark: '单位为法拉（F），表示电容器储存电荷的能力。' },
  { symbol: 'B', name: '磁场强度', mark: '单位为特斯拉（T），表示磁场的强弱和方向。' },
  {
    symbol: 'g',
    name: '重力加速度',
    mark: '单位为米每二次方秒（m/s²），表示在地球表面附近自由落体运动的加速度，约为9.8m/s²。'
  },
  { symbol: 'h', name: '普朗克常数', mark: '单位为焦耳秒（J·s），是量子力学中的一个重要常数。' },
  {
    symbol: 'k_B',
    name: '玻尔兹曼常数',
    mark: '单位为焦耳每开尔文（J/K），是统计力学和热力学中的一个重要常数。'
  },
  {
    symbol: 'G',
    name: '万有引力常数',
    mark: '描述两个物体之间引力大小的物理常数。约为6.67430×10^-11立方米每千克每秒的平方（m³·kg^-1·s^-2）。'
  },
  {
    symbol: 'm_e',
    name: '电子质量',
    mark: '电子的静止质量。约为9.1093837015×10^-31千克（kg）。描述电子的基本属性之一，对理解原子和分子的结构至关重要。'
  },
  {
    symbol: 'm_p',
    name: '质子质量',
    mark: '质子的静止质量。约为1.67262192369×10^-27千克（kg）。原子核的组成部分之一，对理解原子核的结构和性质有重要意义。'
  },
  {
    symbol: 'm_n',
    name: '中子质量。',
    mark: '中子的静止质量。约为1.674927471×10^-27千克（kg）。原子核的另一种组成部分，对理解原子核的稳定性和衰变过程有重要作用。'
  },
  {
    symbol: 'N_A',
    name: '阿伏伽德罗常数',
    mark: '1摩尔物质所含的基本单位（如原子、分子等）的数目。约为6.02214076×1023个/摩尔（mol-1）。化学和物理学中的基础常数，用于描述物质的微观结构和宏观性质之间的关系。'
  },
  {
    symbol: 'F',
    name: '法拉第常数',
    mark: '每摩尔电子所带的电荷量。值：约为96485.33289库仑/摩尔（C/mol）。电化学中的基础常数，用于描述电解过程中电荷的转移和物质的量的关系。'
  },
  {
    symbol: 'ε_0',
    name: '真空介电常数',
    mark: '描述真空中电场强度与电位移之间关系的物理常数。约为8.854187817×10^-12法拉/米（F/m）。电磁学中的基础常数之一，用于描述电场和磁场在真空中的传播和相互作用。'
  }
]

export const SubnetMaskBitsTable: SubNetMaskBitsInfo[] = [
  { mask: '255.255.255.255', bit: '32', nums: '1' },
  { mask: '255.255.255.254', bit: '31', nums: '2' },
  { mask: '255.255.255.252', bit: '30', nums: '4' },
  { mask: '255.255.255.248', bit: '29', nums: '8' },
  { mask: '255.255.255.240', bit: '28', nums: '16' },
  { mask: '255.255.255.224', bit: '27', nums: '32' },
  { mask: '255.255.255.192', bit: '26', nums: '64' },
  { mask: '255.255.255.128', bit: '25', nums: '128' },
  { mask: '255.255.255.0', bit: '24', nums: '256' },
  { mask: '255.255.254.0', bit: '23', nums: '512' },
  { mask: '255.255.252.0', bit: '22', nums: '1024' },
  { mask: '255.255.248.0', bit: '21', nums: '2048' },
  { mask: '255.255.240.0', bit: '20', nums: '4096' },
  { mask: '255.255.224.0', bit: '19', nums: '8192' },
  { mask: '255.255.192.0', bit: '18', nums: '16384' },
  { mask: '255.255.128.0', bit: '17', nums: '32768' },
  { mask: '255.255.0.0', bit: '16', nums: '65536' },
  { mask: '255.254.0.0', bit: '15', nums: '131072' },
  { mask: '255.252.0.0', bit: '14', nums: '262144' },
  { mask: '255.248.0.0', bit: '13', nums: '524288' },
  { mask: '255.240.0.0', bit: '12', nums: '1048576' },
  { mask: '255.224.0.0', bit: '11', nums: '2097152' },
  { mask: '255.192.0.0', bit: '10', nums: '4194304' },
  { mask: '255.128.0.0', bit: '9', nums: '8388608' },
  { mask: '255.0.0.0', bit: '8', nums: '16777216' },
  { mask: '254.0.0.0', bit: '7', nums: '33554432' },
  { mask: '252.0.0.0', bit: '6', nums: '67108864' },
  { mask: '248.0.0.0', bit: '5', nums: '134217728' },
  { mask: '240.0.0.0', bit: '4', nums: '268435456' },
  { mask: '224.0.0.0', bit: '3', nums: '536870912' },
  { mask: '192.0.0.0', bit: '2', nums: '1073741824' },
  { mask: '128.0.0.0', bit: '1', nums: '2147483648' },
  { mask: '0.0.0.0', bit: '0', nums: '4294967296' }
]

export const HTTPStatusCodeTable: HTTPStatusCodeInfo[] = [
  {
    code: '100 Continue',
    desc: '客户端应当继续发送请求。这个临时响应是用来通知客户端它的部分请求已经被服务器接收，且仍未被拒绝。客户端应当继续发送请求的剩余部分，或者如果请求已经完成，忽略这个响应。服务器必须在请求完成后向客户端发送一个最终响应。'
  },
  {
    code: '101 Switching Protocols',
    desc: '服务器已经理解了客户端的请求，并将通过Upgrade消息头通知客户端采用不同的协议来完成这个请求。在发送完这个响应最后的空行后，服务器将会切换到在Upgrade消息头中定义的那些协议。只有在切换新的协议更有好处的时候才应该采取类似措施。例如，切换到新的HTTP版本比旧版本更有优势，或者切换到一个实时且同步的协议以传送利用此类特性的资源。'
  },
  { code: '102 Processing', desc: '代表处理将被继续执行。' },
  { code: '200 OK', desc: '请求已成功，请求所希望的响应头或数据体将随此响应返回。' },
  {
    code: '201 Created',
    desc: "请求已经被实现，而且有一个新的资源已经依据请求的需要而创建，且其URI已经随Location头信息返回。假如需要的资源无法及时创建的话，应当返回'202 Accepted'。"
  },
  {
    code: '202 Accepted',
    desc: '服务器已接受请求，但尚未处理。正如它可能被拒绝一样，最终该请求可能会也可能不会被执行。在异步操作的场合下，没有比发送这个状态码更方便的做法了。:返回202状态码的响应的目的是允许服务器接受其他过程的请求（例如某个每天只执行一次的基于批处理的操作），而不必让客户端一直保持与服务器的连接直到批处理操作全部完成。在接受请求处理并返回202状态码的响应应当在返回的实体中包含一些指示处理当前状态的信息，以及指向处理状态监视器或状态预测的指针，以便用户能够估计操作是否已经完成。'
  },
  {
    code: '203 Non-Authoritative Information',
    desc: '服务器已成功处理了请求，但返回的实体头部元信息不是在原始服务器上有效的确定集合，而是来自本地或者第三方的拷贝。当前的信息可能是原始版本的子集或者超集。例如，包含资源的元数据可能导致原始服务器知道元信息的超集。使用此状态码不是必须的，而且只有在响应不使用此状态码便会返回200 OK的情况下才是合适的。'
  },
  {
    code: '204 No Content',
    desc: '服务器成功处理了请求，但不需要返回任何实体内容，并且希望返回更新了的元信息。响应可能通过实体头部的形式，返回新的或更新后的元信息。如果存在这些头部信息，则应当与所请求的变量相呼应。 如果客户端是浏览器的话，那么用户浏览器应保留发送了该请求的页面，而不产生任何文档视图上的变化，即使按照规范新的或更新后的元信息应当被应用到用户浏览器活动视图中的文档。 由于204响应被禁止包含任何消息体，因此它始终以消息头后的第一个空行结尾。'
  },
  {
    code: '205 Reset Content',
    desc: '服务器成功处理了请求，且没有返回任何内容。但是与204响应不同，返回此状态码的响应要求请求者重置文档视图。该响应主要是被用于接受用户输入后，立即重置表单，以便用户能够轻松地开始另一次输入。 与204响应一样，该响应也被禁止包含任何消息体，且以消息头后的第一个空行结束。'
  },
  {
    code: '206 Partial Content',
    desc: '服务器已经成功处理了部分GET请求。类似于FlashGet或者迅雷这类的HTTP 下载工具都是使用此类响应实现断点续传或者将一个大文档分解为多个下载段同时下载。'
  },
  {
    code: '207 Multi-Status',
    desc: '代表之后的消息体将是一个XML消息，并且可能依照之前子请求数量的不同，包含一系列独立的响应代码。'
  },
  {
    code: '300 Multiple Choices',
    desc: '被请求的资源有一系列可供选择的回馈信息，每个都有自己特定的地址和浏览器驱动的商议信息。用户或浏览器能够自行选择一个首选的地址进行重定向。 除非这是一个HEAD请求，否则该响应应当包括一个资源特性及地址的列表的实体，以便用户或浏览器从中选择最合适的重定向地址。这个实体的格式由Content-Type定义的格式所决定。浏览器可能根据响应的格式以及浏览器自身能力，自动作出最合适的选择。 如果服务器本身已经有了首选的回馈选择，那么在Location中应当指明这个回馈的URI；浏览器可能会将这个Location值作为自动重定向的地址。此外，除非额外指定，否则这个响应也是可缓存的。'
  },
  {
    code: '301 Moved Permanently',
    desc: '被请求的资源已永久移动到新位置，并且将来任何对此资源的引用都应该使用本响应返回的若干个URI之一。如果可能，拥有链接编辑功能的客户端应当自动把请求的地址修改为从服务器反馈回来的地址。除非额外指定，否则这个响应也是可缓存的。 新的永久性的URI应当在响应的Location域中返回。除非这是一个HEAD请求，否则响应的实体中应当包含指向新的URI的超链接及简短说明。 如果这不是一个GET或者HEAD请求，因此浏览器禁止自动进行重定向，除非得到用户的确认，因为请求的条件可能因此发生变化。 注意：对于某些使用HTTP/1.0协议的浏览器，当它们发送的POST请求得到了一个301响应的话，接下来的重定向请求将会变成GET方式。'
  },
  {
    code: '302 Found',
    desc: '请求的资源现在临时从不同的URI响应请求。由于这样的重定向是临时的，客户端应当继续向原有地址发送以后的请求。只有在Cache-Control或Expires中进行了指定的情况下，这个响应才是可缓存的。 新的临时性的URI应当在响应的Location域中返回。除非这是一个HEAD请求，否则响应的实体中应当包含指向新的URI的超链接及简短说明。 如果这不是一个GET或者HEAD请求，那么浏览器禁止自动进行重定向，除非得到用户的确认，因为请求的条件可能因此发生变化。'
  },
  {
    code: '303 See Other',
    desc: '对应当前请求的响应可以在另一个URI上被找到，而且客户端应当采用GET的方式访问那个资源。这个方法的存在主要是为了允许由脚本激活的POST请求输出重定向到一个新的资源。这个新的URI不是原始资源的替代引用。同时，303响应禁止被缓存。当然，第二个请求（重定向）可能被缓存。 新的URI应当在响应的Location域中返回。除非这是一个HEAD请求，否则响应的实体中应当包含指向新的URI的超链接及简短说明。 注意：许多HTTP/1.1版以前的浏览器不能正确理解303状态。如果需要考虑与这些浏览器之间的互动，302状态码应该可以胜任，因为大多数的浏览器处理302响应时的方式恰恰就是上述规范要求客户端处理303响应时应当做的。'
  },
  {
    code: '304 Not Modified',
    desc: '如果客户端发送了一个带条件的GET请求且该请求已被允许，而文档的内容（自上次访问以来或者根据请求的条件）并没有改变，则服务器应当返回这个状态码。304响应禁止包含消息体，因此始终以消息头后的第一个空行结尾。'
  },
  {
    code: '305 Use Proxy',
    desc: '被请求的资源必须通过指定的代理才能被访问。Location域中将给出指定的代理所在的URI信息，接收者需要重复发送一个单独的请求，通过这个代理才能访问相应资源。只有原始服务器才能创建305响应。'
  },
  { code: '306 Switch Proxy', desc: '在最新版的规范中，306状态码已经不再被使用。' },
  {
    code: '307 Temporary Redirect',
    desc: '请求的资源现在临时从不同的URI响应请求。由于这样的重定向是临时的，客户端应当继续向原有地址发送以后的请求。只有在Cache-Control或Expires中进行了指定的情况下，这个响应才是可缓存的。'
  },
  {
    code: '400 Bad Request',
    desc: '由于包含语法错误，当前请求无法被服务器理解。除非进行修改，否则客户端不应该重复提交这个请求。'
  },
  {
    code: '401 Unauthorized',
    desc: '当前请求需要用户验证。该响应必须包含一个适用于被请求资源的WWW-Authenticate信息头用以询问用户信息。客户端可以重复提交一个包含恰当的Authorization头信息的请求。如果当前请求已经包含了Authorization证书，那么401响应代表着服务器验证已经拒绝了那些证书。如果401响应包含了与前一个响应相同的身份验证询问，且浏览器已经至少尝试了一次验证，那么浏览器应当向用户展示响应中包含的实体信息，因为这个实体信息中可能包含了相关诊断信息。'
  },
  { code: '402 Payment Required', desc: '该状态码是为了将来可能的需求而预留的。' },
  {
    code: '403 Forbidden',
    desc: '服务器已经理解请求，但是拒绝执行它。与401响应不同的是，身份验证并不能提供任何帮助，而且这个请求也不应该被重复提交。如果这不是一个HEAD请求，而且服务器希望能够讲清楚为何请求不能被执行，那么就应该在实体内描述拒绝的原因。当然服务器也可以返回一个404响应，假如它不希望让客户端获得任何信息。'
  },
  {
    code: '404 Not Found',
    desc: '请求失败，请求所希望得到的资源未被在服务器上发现。没有信息能够告诉用户这个状况到底是暂时的还是永久的。假如服务器知道情况的话，应当使用410状态码来告知旧资源因为某些内部的配置机制问题，已经永久的不可用，而且没有任何可以跳转的地址。404这个状态码被广泛应用于当服务器不想揭示到底为何请求被拒绝或者没有其他适合的响应可用的情况下。'
  },
  {
    code: '405 Method Not Allowed',
    desc: '请求行中指定的请求方法不能被用于请求相应的资源。该响应必须返回一个Allow头信息用以表示出当前资源能够接受的请求方法的列表。 鉴于PUT，DELETE方法会对服务器上的资源进行写操作，因而绝大部分的网页服务器都不支持或者在默认配置下不允许上述请求方法，对于此类请求均会返回405错误。'
  },
  {
    code: '406 Not Acceptable',
    desc: '请求的资源的内容特性无法满足请求头中的条件，因而无法生成响应实体。 除非这是一个HEAD请求，否则该响应就应当返回一个包含可以让用户或者浏览器从中选择最合适的实体特性以及地址列表的实体。实体的格式由Content-Type头中定义的媒体类型决定。浏览器可以根据格式及自身能力自行作出最佳选择。但是，规范中并没有定义任何作出此类自动选择的标准。'
  },
  {
    code: '407 Proxy Authentication Required',
    desc: '与401响应类似，只不过客户端必须在代理服务器上进行身份验证。代理服务器必须返回一个Proxy-Authenticate用以进行身份询问。客户端可以返回一个Proxy-Authorization信息头用以验证。'
  },
  {
    code: '408 Request Timeout',
    desc: '请求超时。客户端没有在服务器预备等待的时间内完成一个请求的发送。客户端可以随时再次提交这一请求而无需进行任何更改。'
  },
  { code: '409 Conflict', desc: '由于和被请求的资源的当前状态之间存在冲突，请求无法完成。' },
  {
    code: '410 Gone',
    desc: '被请求的资源在服务器上已经不再可用，而且没有任何已知的转发地址。这样的状况应当被认为是永久性的。'
  },
  {
    code: '411 Length Required',
    desc: '服务器拒绝在没有定义Content-Length头的情况下接受请求。在添加了表明请求消息体长度的有效Content-Length头之后，客户端可以再次提交该请求。'
  },
  {
    code: '412 Precondition Failed',
    desc: '服务器在验证在请求的头字段中给出先决条件时，没能满足其中的一个或多个。这个状态码允许客户端在获取资源时在请求的元信息（请求头字段数据）中设置先决条件，以此避免该请求方法被应用到其希望的内容以外的资源上。'
  },
  {
    code: '413 Request Entity Too Large',
    desc: '服务器拒绝处理当前请求，因为该请求提交的实体数据大小超过了服务器愿意或者能够处理的范围。此种情况下，服务器可以关闭连接以免客户端继续发送此请求。 如果这个状况是临时的，服务器应当返回一个Retry-After的响应头，以告知客户端可以在多少时间以后重新尝试。'
  },
  {
    code: '414 Request-URI Too Long',
    desc:
      '请求的URI长度超过了服务器能够解释的长度，因此服务器拒绝对该请求提供服务。这比较少见，通常的情况包括：\r\n ' +
      '1. 本应使用POST方法的表单提交变成了GET方法，导致查询字符串（Query String）过长。\r\n ' +
      '2. 重定向URI"黑洞"，例如每次重定向把旧的URI作为新的URI的一部分，导致在若干次重定向后URI超长。\r\n' +
      '3. 客户端正在尝试利用某些服务器中存在的安全漏洞攻击服务器。这类服务器使用固定长度的缓冲读取或操作请求的URI，当GET后的参数超过某个数值后，可能会产生缓冲区溢出，导致任意代码被执行。没有此类漏洞的服务器，应当返回414状态码。'
  },
  {
    code: '415 Unsupported Media Type',
    desc: `对于当前请求的方法和所请求的资源，请求中提交的实体并不是服务器中所支持的格式，因此请求被拒绝。`
  },
  {
    code: '416 Requested Range Not Satisfiable',
    desc: '如果请求中包含了Range请求头，并且Range中指定的任何数据范围都与当前资源的可用范围不重合，同时请求中又没有定义If-Range请求头，那么服务器就应当返回416状态码。 假如Range使用的是字节范围，那么这种情况就是指请求指定的所有数据范围的首字节位置都超过了当前资源的长度。服务器也应当在返回416状态码的同时，包含一个Content-Range实体头，用以指明当前资源的长度。这个响应也被禁止使用multipart/byteranges作为其Content-Type。'
  },
  {
    code: '417 Expectation Failed',
    desc: '在请求头Expect中指定的预期内容无法被服务器满足，或者这个服务器是一个代理服务器，它有明显的证据证明在当前路由的下一个节点上，Expect的内容无法被满足。'
  },
  { code: "418 I'm a teapot", desc: '本操作码是在1998年作为IETF的传统愚人节笑话。' },
  {
    code: '421 There are too many connections from your internet address',
    desc: '从当前客户端所在的IP地址到服务器的连接数超过了服务器许可的最大范围。通常，这里的IP地址指的是从服务器上看到的客户端地址（比如用户的网关或者代理服务器地址）。在这种情况下，连接数的计算可能涉及到不止一个终端用户。'
  },
  { code: '422 Unprocessable Entity', desc: '请求格式正确，但是由于含有语义错误，无法响应。' },
  { code: '423 Locked', desc: '当前资源被锁定。' },
  {
    code: '424 Failed Dependency',
    desc: '由于之前的某个请求发生的错误，导致当前请求失败，例如PROPPATCH。'
  },
  {
    code: '425 Unordered Collection',
    desc: '在WebDav Advanced Collections草案中定义，但是未出现在《WebDAV顺序集协议》'
  },
  { code: '426 Upgrade Required', desc: '客户端应当切换到TLS/1.0。' },
  { code: '449 Retry With', desc: '由微软扩展，代表请求应当在执行完适当的操作后进行重试。' },
  { code: '499', desc: '客户端主动断开连接。A请求B过程中，A未等B响应就断开了连接。' },
  {
    code: '500 Internal Server Error',
    desc: '服务器遇到了一个未曾预料的状况，导致了它无法完成对请求的处理。一般来说，这个问题都会在服务器的程序码出错时出现。'
  },
  {
    code: '501 Not Implemented',
    desc: '服务器不支持当前请求所需要的某个功能。当服务器无法识别请求的方法，并且无法支持其对任何资源的请求。'
  },
  {
    code: '502 Bad Gateway',
    desc: '作为网关或者代理工作的服务器尝试执行请求时，从上游服务器接收到无效的响应。'
  },
  {
    code: '503 Service Unavailable',
    desc: '由于临时的服务器维护或者过载，服务器当前无法处理请求。这个状况是临时的，并且将在一段时间以后恢复。如果能够预计延迟时间，那么响应中可以包含一个Retry-After头用以标明这个延迟时间。如果没有给出这个Retry-After信息，那么客户端应当以处理500响应的方式处理它。'
  },
  {
    code: '504 Gateway Timeout',
    desc:
      '作为网关或者代理工作的服务器尝试执行请求时，未能及时从上游服务器（URI标识出的服务器，例如HTTP、FTP、LDAP）或者辅助服务器（例如DNS）收到响应。\r\n' +
      '注意：某些代理服务器在DNS查询超时时会返回400或者500错误'
  },
  {
    code: '505 HTTP Version Not Supported',
    desc: '服务器不支持，或者拒绝支持在请求中使用的HTTP版本。这暗示着服务器不能或不愿使用与客户端相同的版本。响应中应当包含一个描述了为何版本不被支持以及服务器支持哪些协议的实体。'
  },
  {
    code: '506 Variant Also Negotiates',
    desc: '代表服务器存在内部配置错误：被请求的协商变元资源被配置为在透明内容协商中使用自己，因此在一个协商处理中不是一个合适的重点。'
  },
  {
    code: '507 Insufficient Storage',
    desc: '服务器无法存储完成请求所必须的内容。这个状况被认为是临时的。'
  },
  {
    code: '509 Bandwidth Limit Exceeded',
    desc: '服务器达到带宽限制。这不是一个官方的状态码，但是仍被广泛使用。'
  },
  { code: '510 Not Extended', desc: '获取资源所需要的策略并没有没满足。' }
]

export const NumericCaseTable: NumericCaseInfo[] = [
  { number: '1', lower: '一', upper: '壹' },
  { number: '2', lower: '二', upper: '贰' },
  { number: '3', lower: '三', upper: '叁' },
  { number: '4', lower: '四', upper: '肆' },
  { number: '5', lower: '五', upper: '伍' },
  { number: '6', lower: '六', upper: '陆' },
  { number: '7', lower: '七', upper: '柒' },
  { number: '8', lower: '八', upper: '捌' },
  { number: '9', lower: '九', upper: '玖' },
  { number: '10', lower: '十', upper: '拾' },
  { number: '100', lower: '百', upper: '佰' },
  { number: '1000', lower: '千', upper: '仟' },
  { number: '10000', lower: '万', upper: '万' },
  { number: '10000万', lower: '亿', upper: '亿' },
  { number: '10000亿', lower: '兆', upper: '兆' },
  { number: '10000兆', lower: '京', upper: '京' },
  { number: '10000京', lower: '垓', upper: '垓' },
  { number: '10000垓', lower: '秭', upper: '秭' },
  { number: '10000秭', lower: '穰', upper: '穰' },
  { number: '10000穰', lower: '沟', upper: '沟' },
  { number: '10000沟', lower: '涧', upper: '涧' }
]

export const NormalFontTable: NormalFontStyle[] = [
  { name: 'Arial', cssStyle: 'Arial' },
  { name: 'Helvetica', cssStyle: 'Helvetica' },
  { name: 'Verdana', cssStyle: 'Verdana' },
  { name: 'Geneva', cssStyle: 'Geneva' },
  { name: 'Tahoma', cssStyle: 'Tahoma' },
  { name: 'Trebuchet MS', cssStyle: 'Trebuchet MS' },
  { name: '黑体', cssStyle: 'SimHei' },
  { name: '宋体', cssStyle: 'SimSun' },
  { name: '新宋体', cssStyle: 'NSimSun' },
  { name: '仿宋', cssStyle: 'FangSong' },
  { name: '楷体', cssStyle: 'KaiTi' },
  { name: '微软雅黑', cssStyle: 'Microsoft YaHei' },
  { name: '隶书', cssStyle: 'LiSu' },
  { name: '幼圆', cssStyle: 'YouYuan' },
  { name: '华文细黑', cssStyle: 'STXihei' },
  { name: '华文楷体', cssStyle: 'STKaiti' },
  { name: '华文楷体', cssStyle: 'STKaiti' },
  { name: '华文宋体', cssStyle: 'STSong' },
  { name: '华文中宋', cssStyle: 'STZhongsong' },
  { name: '华文仿宋', cssStyle: 'STFangsong' },
  { name: '方正舒体', cssStyle: 'FZShuTi' },
  { name: '方正姚体', cssStyle: 'FZYaoti' },
  { name: '华文彩云', cssStyle: 'STCaiyun' },
  { name: '华文琥珀', cssStyle: 'STHupo' },
  { name: '华文隶书', cssStyle: 'STLiti' },
  { name: '华文行楷', cssStyle: 'STXingkai' },
  { name: '华文新魏', cssStyle: 'STXinwei' },
  { name: '华文黑体', cssStyle: 'STHeiti' }
]

export const HTMLMimeTypeTable: HTMLMimeType[] = [
  { ext: '当不知道哪种文件类型？', type: 'application/octet-stream' },
  { ext: '.tif', type: 'image/tiff' },
  { ext: '.001', type: 'application/x-001' },
  { ext: '.301', type: 'application/x-301' },
  { ext: '.323', type: 'text/h323' },
  { ext: '.906', type: 'application/x-906' },
  { ext: '.907', type: 'drawing/907' },
  { ext: '.a11', type: 'application/x-a11' },
  { ext: '.acp', type: 'audio/x-mei-aac' },
  { ext: '.ai', type: 'application/postscript' },
  { ext: '.aif', type: 'audio/aiff' },
  { ext: '.aifc', type: 'audio/aiff' },
  { ext: '.aiff', type: 'audio/aiff' },
  { ext: '.anv', type: 'application/x-anv' },
  { ext: '.asa', type: 'text/asa' },
  { ext: '.asf', type: 'video/x-ms-asf' },
  { ext: '.asp', type: 'text/asp' },
  { ext: '.asx', type: 'video/x-ms-asf' },
  { ext: '.au', type: 'audio/basic' },
  { ext: '.avi', type: 'video/avi' },
  { ext: '.awf', type: 'application/vnd.adobe.workflow' },
  { ext: '.biz', type: 'text/xml' },
  { ext: '.bmp', type: 'application/x-bmp' },
  { ext: '.bot', type: 'application/x-bot' },
  { ext: '.c4t', type: 'application/x-c4t' },
  { ext: '.c90', type: 'application/x-c90' },
  { ext: '.cal', type: 'application/x-cals' },
  { ext: '.cat', type: 'application/vnd.ms-pki.seccat' },
  { ext: '.cdf', type: 'application/x-netcdf' },
  { ext: '.cdr', type: 'application/x-cdr' },
  { ext: '.cel', type: 'application/x-cel' },
  { ext: '.cer', type: 'application/x-x509-ca-cert' },
  { ext: '.cg4', type: 'application/x-g4' },
  { ext: '.cgm', type: 'application/x-cgm' },
  { ext: '.cit', type: 'application/x-cit' },
  { ext: '.class', type: 'java/*' },
  { ext: '.cml', type: 'text/xml' },
  { ext: '.cmp', type: 'application/x-cmp' },
  { ext: '.cmx', type: 'application/x-cmx' },
  { ext: '.cot', type: 'application/x-cot' },
  { ext: '.crl', type: 'application/pkix-crl' },
  { ext: '.crt', type: 'application/x-x509-ca-cert' },
  { ext: '.csi', type: 'application/x-csi' },
  { ext: '.css', type: 'text/css' },
  { ext: '.cut', type: 'application/x-cut' },
  { ext: '.dbf', type: 'application/x-dbf' },
  { ext: '.dbm', type: 'application/x-dbm' },
  { ext: '.dbx', type: 'application/x-dbx' },
  { ext: '.dcd', type: 'text/xml' },
  { ext: '.dcx', type: 'application/x-dcx' },
  { ext: '.der', type: 'application/x-x509-ca-cert' },
  { ext: '.dgn', type: 'application/x-dgn' },
  { ext: '.dib', type: 'application/x-dib' },
  { ext: '.dll', type: 'application/x-msdownload' },
  { ext: '.doc', type: 'application/msword' },
  { ext: '.dot', type: 'application/msword' },
  { ext: '.drw', type: 'application/x-drw' },
  { ext: '.dtd', type: 'text/xml' },
  { ext: '.dwf', type: 'Model/vnd.dwf' },
  { ext: '.dwf', type: 'application/x-dwf' },
  { ext: '.dwg', type: 'application/x-dwg' },
  { ext: '.dxb', type: 'application/x-dxb' },
  { ext: '.dxf', type: 'application/x-dxf' },
  { ext: '.edn', type: 'application/vnd.adobe.edn' },
  { ext: '.emf', type: 'application/x-emf' },
  { ext: '.eml', type: 'message/rfc822' },
  { ext: '.ent', type: 'text/xml' },
  { ext: '.epi', type: 'application/x-epi' },
  { ext: '.eps', type: 'application/x-ps' },
  { ext: '.eps', type: 'application/postscript' },
  { ext: '.etd', type: 'application/x-ebx' },
  { ext: '.exe', type: 'application/x-msdownload' },
  { ext: '.fax', type: 'image/fax' },
  { ext: '.fdf', type: 'application/vnd.fdf' },
  { ext: '.fif', type: 'application/fractals' },
  { ext: '.fo', type: 'text/xml' },
  { ext: '.frm', type: 'application/x-frm' },
  { ext: '.g4', type: 'application/x-g4' },
  { ext: '.gbr', type: 'application/x-gbr' },
  { ext: '.', type: 'application/x-' },
  { ext: '.gif', type: 'image/gif' },
  { ext: '.gl2', type: 'application/x-gl2' },
  { ext: '.gp4', type: 'application/x-gp4' },
  { ext: '.hgl', type: 'application/x-hgl' },
  { ext: '.hmr', type: 'application/x-hmr' },
  { ext: '.hpg', type: 'application/x-hpgl' },
  { ext: '.hpl', type: 'application/x-hpl' },
  { ext: '.hqx', type: 'application/mac-binhex40' },
  { ext: '.hrf', type: 'application/x-hrf' },
  { ext: '.hta', type: 'application/hta' },
  { ext: '.htc', type: 'text/x-component' },
  { ext: '.htm', type: 'text/html' },
  { ext: '.html', type: 'text/html' },
  { ext: '.htt', type: 'text/webviewhtml' },
  { ext: '.htx', type: 'text/html' },
  { ext: '.icb', type: 'application/x-icb' },
  { ext: '.ico', type: 'image/x-icon' },
  { ext: '.ico', type: 'application/x-ico' },
  { ext: '.iff', type: 'application/x-iff' },
  { ext: '.ig4', type: 'application/x-g4' },
  { ext: '.igs', type: 'application/x-igs' },
  { ext: '.iii', type: 'application/x-iphone' },
  { ext: '.img', type: 'application/x-img' },
  { ext: '.ins', type: 'application/x-internet-signup' },
  { ext: '.isp', type: 'application/x-internet-signup' },
  { ext: '.IVF', type: 'video/x-ivf' },
  { ext: '.java', type: 'java/*' },
  { ext: '.jfif', type: 'image/jpeg' },
  { ext: '.jpe', type: 'image/jpeg' },
  { ext: '.jpe', type: 'application/x-jpe' },
  { ext: '.jpeg', type: 'image/jpeg' },
  { ext: '.jpg', type: 'image/jpeg' },
  { ext: '.jpg', type: 'application/x-jpg' },
  { ext: '.js', type: 'application/x-javascript' },
  { ext: '.jsp', type: 'text/html' },
  { ext: '.la1', type: 'audio/x-liquid-file' },
  { ext: '.lar', type: 'application/x-laplayer-reg' },
  { ext: '.latex', type: 'application/x-latex' },
  { ext: '.lavs', type: 'audio/x-liquid-secure' },
  { ext: '.lbm', type: 'application/x-lbm' },
  { ext: '.lmsff', type: 'audio/x-la-lms' },
  { ext: '.ls', type: 'application/x-javascript' },
  { ext: '.ltr', type: 'application/x-ltr' },
  { ext: '.m1v', type: 'video/x-mpeg' },
  { ext: '.m2v', type: 'video/x-mpeg' },
  { ext: '.m3u', type: 'audio/mpegurl' },
  { ext: '.m4e', type: 'video/mpeg4' },
  { ext: '.mac', type: 'application/x-mac' },
  { ext: '.man', type: 'application/x-troff-man' },
  { ext: '.math', type: 'text/xml' },
  { ext: '.mdb', type: 'application/msaccess' },
  { ext: '.mdb', type: 'application/x-mdb' },
  { ext: '.mfp', type: 'application/x-shockwave-flash' },
  { ext: '.mht', type: 'message/rfc822' },
  { ext: '.mhtml', type: 'message/rfc822' },
  { ext: '.mi', type: 'application/x-mi' },
  { ext: '.mid', type: 'audio/mid' },
  { ext: '.midi', type: 'audio/mid' },
  { ext: '.mil', type: 'application/x-mil' },
  { ext: '.mml', type: 'text/xml' },
  { ext: '.mnd', type: 'audio/x-musicnet-download' },
  { ext: '.mns', type: 'audio/x-musicnet-stream' },
  { ext: '.mocha', type: 'application/x-javascript' },
  { ext: '.movie', type: 'video/x-sgi-movie' },
  { ext: '.mp1', type: 'audio/mp1' },
  { ext: '.mp2', type: 'audio/mp2' },
  { ext: '.mp2v', type: 'video/mpeg' },
  { ext: '.mp3', type: 'audio/mp3' },
  { ext: '.mp4', type: 'video/mpeg4' },
  { ext: '.mpa', type: 'video/x-mpg' },
  { ext: '.mpd', type: 'application/vnd.ms-project' },
  { ext: '.mpe', type: 'video/x-mpeg' },
  { ext: '.mpeg', type: 'video/mpg' },
  { ext: '.mpg', type: 'video/mpg' },
  { ext: '.mpga', type: 'audio/rn-mpeg' },
  { ext: '.mpp', type: 'application/vnd.ms-project' },
  { ext: '.mps', type: 'video/x-mpeg' },
  { ext: '.mpt', type: 'application/vnd.ms-project' },
  { ext: '.mpv', type: 'video/mpg' },
  { ext: '.mpv2', type: 'video/mpeg' },
  { ext: '.mpw', type: 'application/vnd.ms-project' },
  { ext: '.mpx', type: 'application/vnd.ms-project' },
  { ext: '.mtx', type: 'text/xml' },
  { ext: '.mxp', type: 'application/x-mmxp' },
  { ext: '.net', type: 'image/pnetvue' },
  { ext: '.nrf', type: 'application/x-nrf' },
  { ext: '.nws', type: 'message/rfc822' },
  { ext: '.odc', type: 'text/x-ms-odc' },
  { ext: '.out', type: 'application/x-out' },
  { ext: '.p10', type: 'application/pkcs10' },
  { ext: '.p12', type: 'application/x-pkcs12' },
  { ext: '.p7b', type: 'application/x-pkcs7-certificates' },
  { ext: '.p7c', type: 'application/pkcs7-mime' },
  { ext: '.p7m', type: 'application/pkcs7-mime' },
  { ext: '.p7r', type: 'application/x-pkcs7-certreqresp' },
  { ext: '.p7s', type: 'application/pkcs7-signature' },
  { ext: '.pc5', type: 'application/x-pc5' },
  { ext: '.pci', type: 'application/x-pci' },
  { ext: '.pcl', type: 'application/x-pcl' },
  { ext: '.pcx', type: 'application/x-pcx' },
  { ext: '.pdf', type: 'application/pdf' },
  { ext: '.pdf', type: 'application/pdf' },
  { ext: '.pdx', type: 'application/vnd.adobe.pdx' },
  { ext: '.pfx', type: 'application/x-pkcs12' },
  { ext: '.pgl', type: 'application/x-pgl' },
  { ext: '.pic', type: 'application/x-pic' },
  { ext: '.pko', type: 'application/vnd.ms-pki.pko' },
  { ext: '.pl', type: 'application/x-perl' },
  { ext: '.plg', type: 'text/html' },
  { ext: '.pls', type: 'audio/scpls' },
  { ext: '.plt', type: 'application/x-plt' },
  { ext: '.png', type: 'image/png' },
  { ext: '.png', type: 'application/x-png' },
  { ext: '.pot', type: 'application/vnd.ms-powerpoint' },
  { ext: '.ppa', type: 'application/vnd.ms-powerpoint' },
  { ext: '.ppm', type: 'application/x-ppm' },
  { ext: '.pps', type: 'application/vnd.ms-powerpoint' },
  { ext: '.ppt', type: 'application/vnd.ms-powerpoint' },
  { ext: '.ppt', type: 'application/x-ppt' },
  { ext: '.pr', type: 'application/x-pr' },
  { ext: '.prf', type: 'application/pics-rules' },
  { ext: '.prn', type: 'application/x-prn' },
  { ext: '.prt', type: 'application/x-prt' },
  { ext: '.ps', type: 'application/x-ps' },
  { ext: '.ps', type: 'application/postscript' },
  { ext: '.ptn', type: 'application/x-ptn' },
  { ext: '.pwz', type: 'application/vnd.ms-powerpoint' },
  { ext: '.r3t', type: 'text/vnd.rn-realtext3d' },
  { ext: '.ra', type: 'audio/vnd.rn-realaudio' },
  { ext: '.ram', type: 'audio/x-pn-realaudio' },
  { ext: '.ras', type: 'application/x-ras' },
  { ext: '.rat', type: 'application/rat-file' },
  { ext: '.rdf', type: 'text/xml' },
  { ext: '.rec', type: 'application/vnd.rn-recording' },
  { ext: '.red', type: 'application/x-red' },
  { ext: '.rgb', type: 'application/x-rgb' },
  { ext: '.rjs', type: 'application/vnd.rn-realsystem-rjs' },
  { ext: '.rjt', type: 'application/vnd.rn-realsystem-rjt' },
  { ext: '.rlc', type: 'application/x-rlc' },
  { ext: '.rle', type: 'application/x-rle' },
  { ext: '.rm', type: 'application/vnd.rn-realmedia' },
  { ext: '.rmf', type: 'application/vnd.adobe.rmf' },
  { ext: '.rmi', type: 'audio/mid' },
  { ext: '.rmj', type: 'application/vnd.rn-realsystem-rmj' },
  { ext: '.rmm', type: 'audio/x-pn-realaudio' },
  { ext: '.rmp', type: 'application/vnd.rn-rn_music_package' },
  { ext: '.rms', type: 'application/vnd.rn-realmedia-secure' },
  { ext: '.rmvb', type: 'application/vnd.rn-realmedia-vbr' },
  { ext: '.rmx', type: 'application/vnd.rn-realsystem-rmx' },
  { ext: '.rnx', type: 'application/vnd.rn-realplayer' },
  { ext: '.rp', type: 'image/vnd.rn-realpix' },
  { ext: '.rpm', type: 'audio/x-pn-realaudio-plugin' },
  { ext: '.rsml', type: 'application/vnd.rn-rsml' },
  { ext: '.rt', type: 'text/vnd.rn-realtext' },
  { ext: '.rtf', type: 'application/msword' },
  { ext: '.rtf', type: 'application/x-rtf' },
  { ext: '.rv', type: 'video/vnd.rn-realvideo' },
  { ext: '.sam', type: 'application/x-sam' },
  { ext: '.sat', type: 'application/x-sat' },
  { ext: '.sdp', type: 'application/sdp' },
  { ext: '.sdw', type: 'application/x-sdw' },
  { ext: '.sit', type: 'application/x-stuffit' },
  { ext: '.slb', type: 'application/x-slb' },
  { ext: '.sld', type: 'application/x-sld' },
  { ext: '.slk', type: 'drawing/x-slk' },
  { ext: '.smi', type: 'application/smil' },
  { ext: '.smil', type: 'application/smil' },
  { ext: '.smk', type: 'application/x-smk' },
  { ext: '.snd', type: 'audio/basic' },
  { ext: '.sol', type: 'text/plain' },
  { ext: '.sor', type: 'text/plain' },
  { ext: '.spc', type: 'application/x-pkcs7-certificates' },
  { ext: '.spl', type: 'application/futuresplash' },
  { ext: '.spp', type: 'text/xml' },
  { ext: '.ssm', type: 'application/streamingmedia' },
  { ext: '.sst', type: 'application/vnd.ms-pki.certstore' },
  { ext: '.stl', type: 'application/vnd.ms-pki.stl' },
  { ext: '.stm', type: 'text/html' },
  { ext: '.sty', type: 'application/x-sty' },
  { ext: '.svg', type: 'text/xml' },
  { ext: '.swf', type: 'application/x-shockwave-flash' },
  { ext: '.tdf', type: 'application/x-tdf' },
  { ext: '.tg4', type: 'application/x-tg4' },
  { ext: '.tga', type: 'application/x-tga' },
  { ext: '.tif', type: 'image/tiff' },
  { ext: '.tif', type: 'application/x-tif' },
  { ext: '.tiff', type: 'image/tiff' },
  { ext: '.tld', type: 'text/xml' },
  { ext: '.top', type: 'drawing/x-top' },
  { ext: '.torrent', type: 'application/x-bittorrent' },
  { ext: '.tsd', type: 'text/xml' },
  { ext: '.txt', type: 'text/plain' },
  { ext: '.uin', type: 'application/x-icq' },
  { ext: '.uls', type: 'text/iuls' },
  { ext: '.vcf', type: 'text/x-vcard' },
  { ext: '.vda', type: 'application/x-vda' },
  { ext: '.vdx', type: 'application/vnd.visio' },
  { ext: '.vml', type: 'text/xml' },
  { ext: '.vpg', type: 'application/x-vpeg005' },
  { ext: '.vsd', type: 'application/vnd.visio' },
  { ext: '.vsd', type: 'application/x-vsd' },
  { ext: '.vss', type: 'application/vnd.visio' },
  { ext: '.vst', type: 'application/vnd.visio' },
  { ext: '.vst', type: 'application/x-vst' },
  { ext: '.vsw', type: 'application/vnd.visio' },
  { ext: '.vsx', type: 'application/vnd.visio' },
  { ext: '.vtx', type: 'application/vnd.visio' },
  { ext: '.vxml', type: 'text/xml' },
  { ext: '.wav', type: 'audio/wav' },
  { ext: '.wax', type: 'audio/x-ms-wax' },
  { ext: '.wb1', type: 'application/x-wb1' },
  { ext: '.wb2', type: 'application/x-wb2' },
  { ext: '.wb3', type: 'application/x-wb3' },
  { ext: '.wbmp', type: 'image/vnd.wap.wbmp' },
  { ext: '.wiz', type: 'application/msword' },
  { ext: '.wk3', type: 'application/x-wk3' },
  { ext: '.wk4', type: 'application/x-wk4' },
  { ext: '.wkq', type: 'application/x-wkq' },
  { ext: '.wks', type: 'application/x-wks' },
  { ext: '.wm', type: 'video/x-ms-wm' },
  { ext: '.wma', type: 'audio/x-ms-wma' },
  { ext: '.wmd', type: 'application/x-ms-wmd' },
  { ext: '.wmf', type: 'application/x-wmf' },
  { ext: '.wml', type: 'text/vnd.wap.wml' },
  { ext: '.wmv', type: 'video/x-ms-wmv' },
  { ext: '.wmx', type: 'video/x-ms-wmx' },
  { ext: '.wmz', type: 'application/x-ms-wmz' },
  { ext: '.wp6', type: 'application/x-wp6' },
  { ext: '.wpd', type: 'application/x-wpd' },
  { ext: '.wpg', type: 'application/x-wpg' },
  { ext: '.wpl', type: 'application/vnd.ms-wpl' },
  { ext: '.wq1', type: 'application/x-wq1' },
  { ext: '.wr1', type: 'application/x-wr1' },
  { ext: '.wri', type: 'application/x-wri' },
  { ext: '.wrk', type: 'application/x-wrk' },
  { ext: '.ws', type: 'application/x-ws' },
  { ext: '.ws2', type: 'application/x-ws' },
  { ext: '.wsc', type: 'text/scriptlet' },
  { ext: '.wsdl', type: 'text/xml' },
  { ext: '.wvx', type: 'video/x-ms-wvx' },
  { ext: '.xdp', type: 'application/vnd.adobe.xdp' },
  { ext: '.xdr', type: 'text/xml' },
  { ext: '.xfd', type: 'application/vnd.adobe.xfd' },
  { ext: '.xfdf', type: 'application/vnd.adobe.xfdf' },
  { ext: '.xhtml', type: 'text/html' },
  { ext: '.xls', type: 'application/vnd.ms-excel' },
  { ext: '.xls', type: 'application/x-xls' },
  { ext: '.xlw', type: 'application/x-xlw' },
  { ext: '.xml', type: 'text/xml' },
  { ext: '.xpl', type: 'audio/scpls' },
  { ext: '.xq', type: 'text/xml' },
  { ext: '.xql', type: 'text/xml' },
  { ext: '.xquery', type: 'text/xml' },
  { ext: '.xsd', type: 'text/xml' },
  { ext: '.xsl', type: 'text/xml' },
  { ext: '.xslt', type: 'text/xml' },
  { ext: '.xwd', type: 'application/x-xwd' },
  { ext: '.x_b', type: 'application/x-x_b' },
  { ext: '.sis', type: 'application/vnd.symbian.install' },
  { ext: '.sisx', type: 'application/vnd.symbian.install' },
  { ext: '.x_t', type: 'application/x-x_t' },
  { ext: '.ipa', type: 'application/vnd.iphone' },
  { ext: '.apk', type: 'application/vnd.android.package-archive' },
  { ext: '.xap', type: 'application/x-silverlight-app' },
  { ext: '.crx', type: 'application/octet-stream' },
  { ext: '.php', type: 'text/html' }
]

export const GreeceLetterTable: GreeceLetterInfo[] = [
  { char: '&Alpha;', code: '&#913;' },
  { char: '&alpha;', code: '&#945;' },
  { char: '&Beta;', code: '&#914;' },
  { char: '&beta;', code: '&#946;' },
  { char: '&Gamma;', code: '&#915;' },
  { char: '&gamma;', code: '&#947;' },
  { char: '&Delta;', code: '&#916;' },
  { char: '&delta;', code: '&#948;' },
  { char: '&Epsilon;', code: '&#917;' },
  { char: '&epsilon;', code: '&#949;' },
  { char: '&Zeta;', code: '&#918;' },
  { char: '&zeta;', code: '&#950;' },
  { char: '&Eta;', code: '&#919;' },
  { char: '&eta;', code: '&#951;' },
  { char: '&Theta;', code: '&#920;' },
  { char: '&theta;', code: '&#952;' },
  { char: '&Iota;', code: '&#921;' },
  { char: '&iota;', code: '&#953;' },
  { char: '&Kappa;', code: '&#922;' },
  { char: '&kappa;', code: '&#954;' },
  { char: '&Lambda;', code: '&#923;' },
  { char: '&lambda;', code: '&#955;' },
  { char: '&Mu;', code: '&#924;' },
  { char: '&mu;', code: '&#956;' },
  { char: '&Nu;', code: '&#925;' },
  { char: '&nu;', code: '&#957;' },
  { char: '&Xi;', code: '&#926;' },
  { char: '&xi;', code: '&#958;' },
  { char: '&Omicron;', code: '&#927;' },
  { char: '&omicron;', code: '&#959;' },
  { char: '&Pi;', code: '&#928;' },
  { char: '&pi;', code: '&#960;' },
  { char: '&Rho;', code: '&#929;' },
  { char: '&rho;', code: '&#961;' },
  { char: '&Sigma;', code: '&#930;' },
  { char: '&sigmaf;', code: '&#962;' },
  { char: '&Tau;', code: '&#931;' },
  { char: '&sigma;', code: '&#963;' },
  { char: '&Upsilon;', code: '&#932;' },
  { char: '&tau;', code: '&#964;' },
  { char: '&Phi;', code: '&#933;' },
  { char: '&upsilon;', code: '&#965;' },
  { char: '&Chi;', code: '&#934;' },
  { char: '&phi;', code: '&#966;' },
  { char: '&Psi;', code: '&#935;' },
  { char: '&chi;', code: '&#967;' },
  { char: '&Omega;', code: '&#936;' },
  { char: '&psi;', code: '&#968;' },
  { char: '&omega;', code: '&#969;' },
  { char: '&thetasym;', code: '&#977;' },
  { char: '&upsih;', code: '&#978;' },
  { char: '&piv;', code: '&#982;' },
  { char: '&weierp;', code: '&#8472;' },
  { char: '&real;', code: '&#8476;' },
  { char: '&image;', code: '&#8465;' },
  { char: '&alefsym;', code: '&#8501;' },
  { char: '&part;', code: '&#8706;' },
  { char: '&forall;', code: '&#8704;' },
  { char: '&empty;', code: '&#8709;' },
  { char: '&notin;', code: '&#8713;' },
  { char: '&nabla;', code: '&#8711;' },
  { char: '&isin;', code: '&#8712;' },
  { char: '&prop;', code: '&#8733;' },
  { char: '&and;', code: '&#8869;' }
]

export function CompressedArray(table: [], num: number): [] {
  return table.reduce((acc, item, index) => {
    // 计算当前元素应该属于哪个子数组
    const subArrayIndex = Math.floor(index / num)
    // 如果子数组还不存在，则初始化它
    if (!acc[subArrayIndex]) {
      acc[subArrayIndex] = []
    }
    // 将当前元素添加到对应的子数组中
    acc[subArrayIndex].push(item)
    // 返回累加器，以便下一轮迭代可以使用
    return acc
  }, [])
}
