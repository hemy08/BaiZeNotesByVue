export const WBSDiagram =
    '\n```plantuml\n' +
    '@startwbs\n' +
    '<style>\n' +
    'wbsDiagram {\n' +
    '  .pink {\n' +
    '      BackgroundColor pink\n' +
    '  }\n' +
    '  .your_style_name {\n' +
    '      BackgroundColor SkyBlue\n' +
    '  }\n' +
    '}\n' +
    '</style>\n' +
    '* this is the partner workpackage <<your_style_name>>\n' +
    '** this is my workpackage <<pink>>\n' +
    '** this is another workpackage\n' +
    '@endwbs\n' +
    '```\n\n'
