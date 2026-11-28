/* =========================================================================
   白泽笔记报告 HTML Wiki · 导航渲染脚本（自动生成，勿手改）
   生成来源：build/generate-report-wiki.js（与 assets/report-nav.html、report-nav-home.html
   由同一导航数据函数生成，避免漂移）
   行为：生成 <nav class="rgnav"> 插入 #report-nav 容器；当前页高亮 + 所属分类自动展开 +
        点击空白处收起下拉 + 右侧「当前：」标签
   ========================================================================= */
;(function () {
    'use strict'

    // 导航数据（分类 / 条目 / 显示标题；路径相对报告根）
    var DATA = {
        "home": "README.html",
        "mdIndex": "README.md",
        "categories": [
            {
                "title": "01-检查与扫描",
                "entries": [
                    {
                        "title": "总体优化项报告",
                        "file": "01-检查与扫描/总体优化项报告.html"
                    },
                    {
                        "title": "代码质量检查报告",
                        "file": "01-检查与扫描/代码质量检查报告.html"
                    },
                    {
                        "title": "性能检查报告",
                        "file": "01-检查与扫描/性能检查报告.html"
                    },
                    {
                        "title": "内存检查报告",
                        "file": "01-检查与扫描/内存检查报告.html"
                    },
                    {
                        "title": "架构检查报告",
                        "file": "01-检查与扫描/架构检查报告.html"
                    },
                    {
                        "title": "功能检查报告",
                        "file": "01-检查与扫描/功能检查报告.html"
                    },
                    {
                        "title": "完整性检查报告",
                        "file": "01-检查与扫描/完整性检查报告.html"
                    },
                    {
                        "title": "全量扫描与审查报告（合并）",
                        "file": "01-检查与扫描/全量扫描与审查报告.html"
                    },
                    {
                        "title": "代码整体结构分析报告",
                        "file": "01-检查与扫描/代码整体结构分析报告.html"
                    },
                    {
                        "title": "Markdown 编辑器能力补全选项报告",
                        "file": "01-检查与扫描/Markdown编辑器能力补全选项报告.html"
                    },
                    {
                        "title": "Monaco 与 WYSIWYG 双编辑器技术评估报告",
                        "file": "01-检查与扫描/Monaco与WYSIWYG双编辑器技术评估报告.html"
                    },
                    {
                        "title": "业界对标与改进建议报告",
                        "file": "01-检查与扫描/业界对标与改进建议报告.html"
                    },
                    {
                        "title": "2026-11-20-全量代码扫描报告",
                        "file": "01-检查与扫描/2026-11-20-全量代码扫描报告.html"
                    }
                ]
            },
            {
                "title": "02-修复与实施",
                "entries": [
                    {
                        "title": "127 项基线修复实施汇总（合并）",
                        "file": "02-修复与实施/127项基线修复实施汇总.html"
                    },
                    {
                        "title": "修复批次实施记录",
                        "file": "02-修复与实施/修复批次实施记录.html"
                    },
                    {
                        "title": "项目问题复查报告",
                        "file": "02-修复与实施/项目问题复查报告.html"
                    },
                    {
                        "title": "国际化实施报告",
                        "file": "02-修复与实施/国际化实施报告.html"
                    },
                    {
                        "title": "预览单跳重构报告",
                        "file": "02-修复与实施/预览单跳重构报告.html"
                    },
                    {
                        "title": "系统设置补充实现",
                        "file": "02-修复与实施/系统设置补充实现.html"
                    },
                    {
                        "title": "公共接口归位修复计划",
                        "file": "02-修复与实施/公共接口归位修复计划.html"
                    },
                    {
                        "title": "代码结构优化计划",
                        "file": "02-修复与实施/代码结构优化计划.html"
                    },
                    {
                        "title": "1.5.2 版本计划（捕获与日常入口）",
                        "file": "02-修复与实施/1.5.2版本计划.html"
                    }
                ]
            },
            {
                "title": "03-专项治理",
                "entries": [
                    {
                        "title": "IPC 通信矩阵（当前口径）",
                        "file": "03-专项治理/IPC通信矩阵.html"
                    },
                    {
                        "title": "IPC 通信治理报告（合并）",
                        "file": "03-专项治理/IPC通信治理报告.html"
                    },
                    {
                        "title": "mkdocs-material 语法支持（合并）",
                        "file": "03-专项治理/mkdocs-material语法支持.html"
                    },
                    {
                        "title": "插件工具集成（合并）",
                        "file": "03-专项治理/插件工具集成.html"
                    },
                    {
                        "title": "专项验证记录（合并）",
                        "file": "03-专项治理/专项验证记录.html"
                    },
                    {
                        "title": "B1 Wiki 链接交互风险与实施方案",
                        "file": "03-专项治理/B1Wiki链接交互风险与实施方案.html"
                    },
                    {
                        "title": "B5 附件管理风险与实施方案",
                        "file": "03-专项治理/B5附件管理风险与实施方案.html"
                    },
                    {
                        "title": "B2 全文索引风险与实施方案",
                        "file": "03-专项治理/B2全文索引风险与实施方案.html"
                    },
                    {
                        "title": "当前遗留问题清单（跟踪台账）",
                        "file": "03-专项治理/当前遗留问题清单.html"
                    },
                    {
                        "title": "依赖升级与代码签名排期",
                        "file": "03-专项治理/依赖升级与代码签名排期.html"
                    },
                    {
                        "title": "依赖安全治理报告",
                        "file": "03-专项治理/依赖安全治理报告.html"
                    }
                ]
            }
        ]
    }

    /**
     * 定位本脚本 URL：优先 document.currentScript；降级为扫描带 report-nav.js 的 script 标签。
     * 本脚本固定位于 <报告根>/assets/report-nav.js，故其上一级 ../ 即报告根。
     */
    function findScriptSrc() {
        if (document.currentScript && document.currentScript.src) return document.currentScript.src
        var scripts = document.getElementsByTagName('script')
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || ''
            if (/report-nav\.js(?:[?#]|$)/.test(src)) return src
        }
        return ''
    }

    var root
    try {
        root = new URL('../', findScriptSrc() || location.href)
    } catch (err) {
        // 极端降级：按当前页同目录解析（正常情况下不会走到这里）
        root = new URL('./', location.href)
    }

    /** 相对报告根路径 → 绝对 URL（file:// 与 http(s) 均可用） */
    function toUrl(relative) {
        return new URL(relative, root).href
    }

    /** 规范化 pathname：解码百分号编码、统一分隔符、去掉末尾斜杠 */
    function norm(pathname) {
        try {
            return decodeURIComponent(pathname).replace(/\\/g, '/').replace(/\/+$/, '')
        } catch (err) {
            return pathname
        }
    }

    function createLink(className, href, text, title) {
        var a = document.createElement('a')
        if (className) a.className = className
        a.href = href
        if (title) a.title = title
        a.textContent = text
        return a
    }

    /** 当前页高亮 + 所属分类自动展开 + 右侧「当前：」标签 */
    function highlightCurrent(nav) {
        var self = norm(location.pathname)
        var links = nav.querySelectorAll('a[href$=".html"]')
        var current = null
        for (var i = 0; i < links.length; i++) {
            var link = links[i]
            if (norm(new URL(link.href, location.href).pathname) === self) {
                link.classList.add('active')
                current = link
            }
        }
        var label = document.getElementById('rgnav-current')
        if (current) {
            var box = current.closest('details')
            if (box) box.setAttribute('open', '')
            if (label) {
                label.textContent = current.textContent.trim()
                label.setAttribute('href', current.getAttribute('href'))
            }
            return
        }
        var home = nav.querySelector('.rgnav-home')
        if (home && norm(new URL(home.href, location.href).pathname) === self) {
            home.classList.add('active')
        }
        if (label) label.textContent = document.title.replace(' · 报告', '')
    }

    /** 生成导航 DOM 并挂载到 #report-nav（若容器内已有静态片段则跳过，保证幂等） */
    function renderNav() {
        var mount = document.getElementById('report-nav')
        if (!mount || mount.querySelector('.rgnav')) return

        var nav = document.createElement('nav')
        nav.className = 'rgnav'
        nav.setAttribute('aria-label', '报告整体导航')
        nav.appendChild(createLink('rgnav-home', toUrl(DATA.home), '🏠 报告首页', '报告 HTML Wiki 首页'))

        var sep = document.createElement('span')
        sep.className = 'rgnav-sep'
        nav.appendChild(sep)

        for (var c = 0; c < DATA.categories.length; c++) {
            var category = DATA.categories[c]
            var details = document.createElement('details')
            var summary = document.createElement('summary')
            summary.textContent = category.title + ' ▾'
            details.appendChild(summary)
            var drop = document.createElement('div')
            drop.className = 'rgnav-drop'
            for (var e = 0; e < category.entries.length; e++) {
                var entry = category.entries[e]
                drop.appendChild(createLink('', toUrl(entry.file), entry.title))
            }
            details.appendChild(drop)
            nav.appendChild(details)
        }

        var right = document.createElement('span')
        right.className = 'rgnav-right'
        right.appendChild(document.createTextNode('当前：'))
        var currentLabel = createLink('', '#', '—')
        currentLabel.id = 'rgnav-current'
        right.appendChild(currentLabel)
        right.appendChild(document.createTextNode(' · '))
        right.appendChild(createLink('', toUrl(DATA.mdIndex), 'MD 索引', 'Markdown 索引'))
        nav.appendChild(right)

        mount.appendChild(nav)
        highlightCurrent(nav)
    }

    // 点击页面空白处收起下拉（与旧内联脚本行为一致）
    document.addEventListener('click', function (event) {
        var within = event.target.closest && event.target.closest('.rgnav details')
        var opened = document.querySelectorAll('.rgnav details[open]')
        for (var i = 0; i < opened.length; i++) {
            if (opened[i] !== within) opened[i].removeAttribute('open')
        }
    })

    // <script defer> 执行时 DOM 已解析完（readyState=interactive），这里同时兼容动态注入
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderNav)
    } else {
        renderNav()
    }
})()
