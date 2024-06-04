const fs = require('fs');
const path = require('path');
const dialog = require('electron').dialog;
const Store = require('electron-store');
const { config } = require('../config');
const FileStreamQueue = require('./FileStreamQueue');

const store = new Store();

class Reader {
  /**
   * Open and decode a file
   * @param {string} filePath
   * @param {BufferEncoding} encoding
   * @returns {Error|string} If error occurs, Error is returned instead of throwing an error.
   */
  static openAndDecode(filePath, encoding='utf-8') {
    try {
      if (!fs.existsSync(filePath)) {
        return new Error(`文件${filePath}不存在`);
      }
      // console.log(`[open file] ${filePath} -> length: ${content.length}`);
      return fs.readFileSync(filePath, {encoding: encoding});
    } catch (e) {
      console.error(`Failed to read file "${filePath}": ${e.message}`);
      return new Error(`文件打开失败: ${e.message}`);
    }
  }

  /**
   * 解析文件名
   *
   * @param {string} fileAbsolutePath 文件绝对路径
   * @param {string|undefined|null} extension 扩展名, 如: ".html" (若给定扩展名，将不会返回带扩展名的文件名)
   * @returns {string} 文件名
   */
  static parseFileName(fileAbsolutePath, extension) {
    if (typeof extension === 'string' && extension.length > 0) {
      return path.basename(fileAbsolutePath, extension);
    }
    return path.basename(fileAbsolutePath);
  }

  /**
   * 读取文件内容
   *
   * @param {string} filePath 文件路径
   * @param {string} encoding 文件编码
   * @returns {Promise<string>}
   */
  static readFile(filePath, encoding='utf8') {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) reject(new Error('读取HTML文件模板失败: 文件不存在。'));
      fs.readFile(filePath, { encoding }, (err, data) => {
        if (err) reject(new Error(`读取HTML文件模板失败: ${err.message}`))
        else resolve(data);
      })
    })
  }

  /**
   * 递归删除文件夹
   *
   * @param {string} path2Delete path to Delete
   * @returns {void}
   */
  static deleteFolderRecursive(path2Delete) {
    if (fs.existsSync(path2Delete)) {
      fs.readdirSync(path2Delete).forEach(function(file){
        const curPath = path.join(path2Delete, file)
        if (fs.lstatSync(curPath).isDirectory()) {
          Reader.deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(path2Delete);
    }
  }

  static saveAs(remoteDialog, filters, title, nameFieldLabel = '') {
    const _dialog = remoteDialog || dialog;
    return new Promise((resolve, reject) => {
      _dialog.showSaveDialog({
        title: title ?? '文件另存为',
        buttonLabel: '保存',
        filters: filters ?? [
          {
            name: 'Markdown文件',
            extensions: ['md'],
          },
          {
            name: 'HTML文件',
            extensions: ['html'],
          },
          {
            name: 'PDF文件',
            extensions: ['pdf'],
          },
        ],
        nameFieldLabel: nameFieldLabel,
        properties: ['showOverwriteConfirmation']
      }).then((file) => {
        if (!file.canceled) {
          resolve(file.filePath);
        }
      }).catch((err) => {
        console.log(err);
      });
    });

  }

  static saveFile(filePath, fileValue, showWarning = true) {
    return new Promise((resolve, reject) => {
      // 文件不存在，先创建文件
      if (!fs.existsSync(filePath)) {
        try {
          fs.appendFileSync(filePath, '', {
            mode: 0o666,
            encoding: 'utf-8'
          });
        } catch (e) {
          if (showWarning) {
            window.Alert('无法写入文件', `文件创建失败: ${e.message}`);
          }
          reject(e);
          return;
        }
      }

      FileStreamQueue.getInstance().add({
        filePath,
        fileValue
      }, () => {
        resolve();
      }, (err) => {
        if (showWarning) {
          window.Alert('无法写入文件', err);
        }
        reject(err);
      })
    });
  }

  static openFile() {
    return new Promise((resolve, reject) => {
      dialog.showOpenDialog({
        title: '打开文件',
        properties: ['openFile'],
        filters: [
          {
            extensions: ['md', 'markdown'],
            name: 'Markdown文件',
          },
        ],
      })
        .then((value) => {
          if (!value.canceled && value.filePaths.length > 0) {
            const splitNames = value.filePaths[0].split(path.sep);
            const str = Reader.openAndDecode(value.filePaths[0]);
            resolve({
              name: splitNames[splitNames.length - 1],
              path: value.filePaths[0],
              value: str,
            });
          }
        })
        .catch(e => {
          console.log(e);
        });
    });
  }

  static openDirectory(title = '打开文件夹') {
    return new Promise((resolve) => {
      dialog.showOpenDialog({
        title,
        properties: ['openDirectory'],
      })
        .then((value) => {
          if (!value.canceled && Array.isArray(value.filePaths) && value.filePaths.length > 0) {
            const directory = new Directory(value.filePaths[0]);
            resolve(directory.getRoot());
          }
          resolve(null);
        })
        .catch(e => {
          resolve(null);
        });
    });
  }

  static reload(dirPath) {
    return new Promise((resolve, reject) => {
      const directory = new Directory(dirPath);
      resolve(directory.getRoot());
    });
  }

  /**
   * 扫描给定文件夹路径下的文件，该方法为同步方法
   *
   * @param {string} dirPath 待扫描文件夹路径
   * @param {boolean} onlyScanMarkdown 是否只扫描Markdown文件，默认为true
   * @returns {Array<{fileName: string; filePath: string}>} 返回全路径列表
   */
  static scanDirectory(dirPath, onlyScanMarkdown = true) {
    if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) return [];

    const res = [];
    const children = fs.readdirSync(dirPath).map(item => ({
      fileName: item,
      filePath: path.join(dirPath, item),
    }));

    const traverse = (folderDir) => {
      for (let i = 0; i < folderDir.length; ++i) {
        const stat = fs.lstatSync(folderDir[i].filePath);
        if (stat.isFile()) {
          if (onlyScanMarkdown && /\.(md|markdown)$/gi.test(folderDir[i].filePath)) {
            res.push({
              filePath: folderDir[i].filePath,
              fileName: folderDir[i].fileName
            });
          } else if (!onlyScanMarkdown) {
            res.push({
              filePath: folderDir[i].filePath,
              fileName: folderDir[i].fileName
            });
          }
        } else {
         traverse(fs.readdirSync(folderDir[i].filePath).map(item => ({
           filePath: path.join(folderDir[i].filePath, item),
           fileName: item
         })));
        }
      }
    };

    traverse(children);

    return res;
  }
}

class Directory {
  constructor(rootPath) {
    const splitPath = rootPath.split(path.sep);
    const preference = {
      ...config.DEFAULT_PREFERENCE,
      ...(store.get('preference') || {}),
    };

    this.onlyShowMd = (preference?.onlyShowMd === 'on');
    this.id = 0;
    this.root = {
      nodeType: 'dir',
      text: splitPath[splitPath.length - 1],
      icon: 'jstree-folder',
      path: rootPath,
      // id: this.id++,
      id: this.id,
      children: [],
      // 默认展开根节点
      state: { opened: true, selected: true },
    };
    this.root.children = this.traverse(this.root);
  }

  static genNodeId(absolutePath) {
    const stat = fs.lstatSync(absolutePath);
    return (stat.isFile() ? 'file_' : 'fir_') + absolutePath;
  }

  static genFileNodeId(absolutePath) {
    const stat = fs.lstatSync(absolutePath);
    return stat.isFile() ? `file_${absolutePath}` : null;
  }

  /**
   * 综合排序
   *
   * @param {Array<string>} arr
   */
  static generalSort(arr) {
    const reg = /^[a-zA-Z0-9.]/;
    arr.sort((x, y) => {
      if(reg.test(x) || reg.test(y)) {
        if (x.startsWith('.') && !y.startsWith('.')) {
          return -1;
        }
        if (!x.startsWith('.') && y.startsWith('.')) {
          return 1;
        }

        const prevLowerCase = x.toLocaleLowerCase();
        const nextLowerCase = y.toLocaleLowerCase();

        const prevNumber = parseInt(prevLowerCase);
        const nextNumber = parseInt(nextLowerCase);

        // 数字排在字符串前面
        if (!isNaN(prevNumber) && isNaN(nextNumber)) {
          return -1;
        }

        if (isNaN(prevNumber) && !isNaN(nextNumber)) {
          return 1;
        }

        // 同时为数字时比较数字
        if (!isNaN(prevNumber) && !isNaN(nextNumber) && prevNumber !== nextNumber) {
          return prevNumber > nextNumber ? 1: -1;
        }

        // 同时不为数字，使用字典序
        if (prevLowerCase > nextLowerCase) {
          return 1;
        } else if (prevLowerCase < nextLowerCase) {
          return -1;
        } else {
          return 0;
        }
      } else {
        return x.localeCompare(y, 'zh-Hans-CN', { ignorePunctuation: true });
      }
    });
  }
  traverse(node) {
    if (!fs.existsSync(node.path) || !fs.lstatSync(node.path).isDirectory()) return [];

    const children = fs.readdirSync(node.path);

    let sortedDirectories = [];
    let sortedFiles = [];

    // 按先目录，后文件的顺序排序
    children.forEach(child => {
      const childPath = path.join(node.path, child);
      const stat = fs.lstatSync(childPath);
      if (stat.isDirectory()) {
        sortedDirectories.push(child);
      // 不展示Windows隐藏文件
      } else if (stat.isFile() && !(/^~\$/g.test(child))) {
        // 隐藏非md文件
        if ((this.onlyShowMd && /\.(md|markdown)$/i.test(child)) || !this.onlyShowMd) {
          sortedFiles.push(child);
        }
      }
    });

    // 综合排序
    Directory.generalSort(sortedDirectories);
    Directory.generalSort(sortedFiles);

    const directoryChildren = sortedDirectories.map(child => {
      const childPath = path.join(node.path, child);
      const tempNode = {
        nodeType: 'dir',
        icon: 'jstree-folder',
        text: child,
        path: childPath,
        id: 'dir_' + childPath,
        children: [],
      };

      tempNode.children = this.traverse(tempNode);

      return tempNode;
    });

    const fileChildren = sortedFiles.map(child => {
      const childPath = path.join(node.path, child);
      const tempNode = {
        nodeType: 'file',
        icon: `jstree-file ${/\.(md|markdown)$/i.test(child) ? 'md-file' : 'regular-file'}`,
        text: child,
        path: childPath,
        id: 'file_' + childPath,
        children: [],
      };

      tempNode.children = this.traverse(tempNode);

      return tempNode;
    });

    return directoryChildren.concat(fileChildren);

  }

  getRoot() {
    return this.root;
  }

  static get ROOT_ID() {
    return '#j1_1';
  }
}

module.exports = {
  Reader,
  Directory
}
