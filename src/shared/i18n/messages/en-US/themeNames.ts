/**
 * Theme names and descriptions (en)
 * CMP-30 wrap-up: app themes (28) and Monaco editor themes share these keys;
 * the original Chinese fields remain in theme data as a fallback only.
 * Key layout:
 * - themeNames.app.<themeId>.name / themeNames.app.<themeId>.description
 * - themeNames.monaco.<themeId>.name / themeNames.monaco.<themeId>.description
 * - themeNames.monaco.dynamicDescription (template for on-disk themes)
 */
export default {
    app: {
        baize: {
            name: 'Baize Violet',
            description: 'Elegant purple gradient theme'
        },
        warm: {
            name: 'Warm White',
            description: 'Cozy cream-white theme'
        },
        light: {
            name: 'Fresh Minimal',
            description: 'Clean and bright light theme'
        },
        lavender: {
            name: 'Lavender Dream',
            description: 'Eye-care theme with a light blue and lavender gradient'
        },
        coral: {
            name: 'Coral Sun',
            description: 'Warm coral theme'
        },
        mint: {
            name: 'Mint Breeze',
            description: 'Fresh mint-green theme'
        },
        sunset: {
            name: 'Sunset Glow',
            description: 'Warm orange-red gradient theme'
        },
        rose: {
            name: 'Rose Garden',
            description: 'Romantic rose-pink theme'
        },
        dark: {
            name: 'Deep Night',
            description: 'Eye-friendly dark theme'
        },
        deepdark: {
            name: 'Minimal Black',
            description: 'Dark theme with a pure black background'
        },
        icon: {
            name: 'Baize Icon',
            description: 'Purple-pink gradient theme matching the Baize icon'
        },
        ocean: {
            name: 'Deep Ocean',
            description: 'Deep ocean-blue theme'
        },
        forest: {
            name: 'Forest Secrets',
            description: 'Deep forest-green theme'
        },
        'eyecare-green': {
            name: 'Eye-care Oasis',
            description: 'Soft green eye-care theme'
        },
        'eyecare-beige': {
            name: 'Eye-care Beige',
            description: 'Gentle beige eye-care theme'
        },
        'eyecare-blue': {
            name: 'Eye-care Blue',
            description: 'Comfortable light-blue eye-care theme'
        },
        'eyecare-pink': {
            name: 'Eye-care Sakura',
            description: 'Soft sakura-pink eye-care theme'
        },
        'eyecare-amber': {
            name: 'Eye-care Amber',
            description: 'Warm amber eye-care theme'
        },
        'eyecare-teal': {
            name: 'Eye-care Celadon',
            description: 'Delicate celadon eye-care theme'
        },
        'eyecare-lilac': {
            name: 'Eye-care Lilac',
            description: 'Soft lilac eye-care theme'
        },
        'baize-text': {
            name: 'Baize Text',
            description: 'Dark theme with a purple-pink gradient and golden text'
        },
        'baize-starry': {
            name: 'Baize Starry',
            description: 'Deep-blue starry theme with gold accents'
        },
        'baize-beast': {
            name: 'Baize Beast',
            description: 'Purple-pink gradient theme with a white mythical beast'
        },
        'baize-clear': {
            name: 'Baize Clear',
            description: 'High-contrast theme with a purple-pink gradient and gold accents'
        },
        'baize-data-light': {
            name: 'Baize Data Light',
            description: 'Fresh data theme with a cyan-purple gradient on a light background'
        },
        'baize-mirror-light': {
            name: 'Baize Mirror Light',
            description: 'Tech mirror theme with lens design on pure white'
        },
        'baize-data-dark': {
            name: 'Baize Data Dark',
            description: 'Data-tech theme with a cyan-purple glow on a dark background'
        },
        'baize-mirror-dark': {
            name: 'Baize Mirror Dark',
            description: 'Tech insight theme with lens glow on a deep night sky'
        }
    },
    monaco: {
        vs: {
            name: 'Visual Studio Light',
            description: 'Visual Studio light theme'
        },
        'vs-dark': {
            name: 'Visual Studio Dark',
            description: 'Visual Studio dark theme'
        },
        'hc-black': {
            name: 'High Contrast',
            description: 'High contrast theme'
        },
        dynamicDescription: '{name} theme'
    }
}
