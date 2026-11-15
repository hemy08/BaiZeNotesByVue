/**
 * 主题名称与描述词条（中）
 * CMP-30 收尾：应用主题（28 个）与 Monaco 编辑器主题的名称/描述统一走 i18n key，
 * 主题数据（main/config/theme-config.ts、main/config/theme-registry.ts）保留原中文字段，
 * 仅在词典缺失时作为回退（theme.nameKey ?? theme.name）。
 * 键形约定：
 * - themeNames.app.<themeId>.name / themeNames.app.<themeId>.description（应用主题）
 * - themeNames.monaco.<themeId>.name / themeNames.monaco.<themeId>.description（内置编辑器主题）
 * - themeNames.monaco.dynamicDescription（磁盘动态加载主题的「{name} 主题」描述模板）
 */
export default {
    app: {
        baize: {
            name: '白泽紫韵',
            description: '优雅的紫色渐变主题'
        },
        warm: {
            name: '暖白温馨',
            description: '温暖的米白色主题'
        },
        light: {
            name: '清新简约',
            description: '简洁明亮的浅色主题'
        },
        lavender: {
            name: '薰衣草梦',
            description: '浅蓝浅紫渐变护眼主题'
        },
        coral: {
            name: '珊瑚暖阳',
            description: '温暖的珊瑚色主题'
        },
        mint: {
            name: '薄荷清风',
            description: '清新的薄荷绿主题'
        },
        sunset: {
            name: '日落余晖',
            description: '温暖的橙红渐变主题'
        },
        rose: {
            name: '玫瑰花园',
            description: '浪漫的玫瑰粉主题'
        },
        dark: {
            name: '深邃夜空',
            description: '护眼深色主题'
        },
        deepdark: {
            name: '极简深黑',
            description: '纯黑背景深色主题'
        },
        icon: {
            name: '白泽图标',
            description: '与白泽图标一致的紫粉渐变主题'
        },
        ocean: {
            name: '深海蔚蓝',
            description: '深邃的海洋蓝主题'
        },
        forest: {
            name: '森林秘境',
            description: '深邃的森林绿主题'
        },
        'eyecare-green': {
            name: '护眼绿洲',
            description: '柔和的绿色护眼主题'
        },
        'eyecare-beige': {
            name: '护眼米黄',
            description: '温和的米黄色护眼主题'
        },
        'eyecare-blue': {
            name: '护眼淡蓝',
            description: '舒适的淡蓝色护眼主题'
        },
        'eyecare-pink': {
            name: '护眼樱粉',
            description: '柔和的樱花粉护眼主题'
        },
        'eyecare-amber': {
            name: '护眼琥珀',
            description: '温暖的琥珀色护眼主题'
        },
        'eyecare-teal': {
            name: '护眼青瓷',
            description: '清雅的青瓷色护眼主题'
        },
        'eyecare-lilac': {
            name: '护眼丁香',
            description: '淡雅的丁香紫护眼主题'
        },
        'baize-text': {
            name: '白泽文字',
            description: '紫粉渐变配金色文字深色主题'
        },
        'baize-starry': {
            name: '白泽星空',
            description: '深蓝星空配金色主题'
        },
        'baize-beast': {
            name: '白泽神兽',
            description: '紫粉渐变配白色神兽主题'
        },
        'baize-clear': {
            name: '白泽清晰',
            description: '紫粉渐变配金色高对比主题'
        },
        'baize-data-light': {
            name: '白泽数据浅色',
            description: '清新数据主题，青紫渐变，浅色背景'
        },
        'baize-mirror-light': {
            name: '白泽镜像浅色',
            description: '科技镜像主题，透镜设计，纯净白色'
        },
        'baize-data-dark': {
            name: '白泽数据深色',
            description: '数据科技主题，青紫光晕，深色背景'
        },
        'baize-mirror-dark': {
            name: '白泽镜像深色',
            description: '科技洞察主题，透镜光效，深邃夜空'
        }
    },
    monaco: {
        vs: {
            name: 'Visual Studio Light',
            description: 'Visual Studio 浅色主题'
        },
        'vs-dark': {
            name: 'Visual Studio Dark',
            description: 'Visual Studio 深色主题'
        },
        'hc-black': {
            name: 'High Contrast',
            description: '高对比度主题'
        },
        dynamicDescription: '{name} 主题'
    }
}
