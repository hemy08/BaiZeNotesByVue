// By using fast-string-search package,
// it will increase 10x performance better than String.prototype.indexOf method.
// const fss = require('fast-string-search');

const fs = require('fs');
const path = require('path');

function insertStr(source, start, newStr) {
  return source.slice(0, start) + newStr + source.slice(start);
}

function replaceInSingleFile(filePath, keyword, ignoreCase, cb) {
  fs.readFile(filePath, 'utf8', function (error, contents) {
    if (error) {
      return cb(error);
    }

    const lines = contents.split('\n');
    let matchResults = [];
    let keywordUpperCase=keyword.toUpperCase();

    for (let i = 0; i < lines.length; ++i) {
      let line = lines[i];
      if (line.trim().length === 0) {
        continue;
      }

      const startIndex = ignoreCase?line.toUpperCase().indexOf(keywordUpperCase):line.indexOf(keyword);
      const replaceCharLeft = new Date().getTime() + String(Math.random()).slice(2);
      const replaceCharRight = new Date().getTime() + String(Math.random()).slice(2);
      const startStr = `${replaceCharLeft}span class='h-word'${replaceCharRight}`;
      const endStr = `${replaceCharLeft}/span${replaceCharRight}`;
      const offset = 20;

      if (startIndex > -1) {
        let richLine = insertStr(line, startIndex, startStr);
        richLine = insertStr(richLine, startIndex + startStr.length + keyword.length, endStr);

        const start = startIndex - offset;
        const end = startIndex + startStr.length + keyword.length + endStr.length + offset;
        let text = richLine.slice(start >= 0 ? start : 0, end);

        // 防注入替换
        text = text
          .replaceAll('&', '&amp;')
          .replaceAll('"', '&quot;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll(replaceCharLeft, '<')
          .replaceAll(replaceCharRight, '>');

        if (start > 0) {
          text = '...' + text;
        }

        if (end < richLine.length - 1) {
          text = text + '...';
        }

        matchResults.push({
          line: i + 1,
          startColumn: startIndex + 1,
          endColumn: startIndex + 1 + keyword.length,
          text,
        });
      }
    }

    return cb(null, matchResults.length, matchResults);
  });
}

module.exports = function findInFiles(config, cb) {
  cb = cb || function () {
  };
  if (!Array.isArray(config.files)) {
    config.files = [config.files];
    return findInFiles(config, cb);
  }

  let totalFiles = config.files.length;
  let processedFiles = 0;
  let foundInFiles = [];

  config.files.forEach(function (file) {
    replaceInSingleFile(file, config.find, config.ignoreCase, function (error, occurrences, matchResults) {
      if (error) {
        return cb(error);
      }
      if (occurrences > 0) {
        foundInFiles.push({
          filePath: file,
          fileName: path.basename(file),
          occurrences: occurrences,
          matchResults: matchResults,
        });
      }
      processedFiles++;
      if (processedFiles === totalFiles) {
        cb(null, foundInFiles);
      }
    });
  });
};
