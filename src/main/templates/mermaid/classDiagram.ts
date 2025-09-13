export const classDiagram =
    '\n```mermaid\n' +
    '---\n' +
    'title: Animal example\n' +
    '---\n' +
    'classDiagram\n' +
    '    note "From Duck till Zebra"\n' +
    '    Animal <|-- Duck\n' +
    '    note for Duck "can fly\\ncan swim\\ncan dive\\ncan help in debugging"\n' +
    '    Animal <|-- Fish\n' +
    '    Animal <|-- Zebra\n' +
    '    Animal : +int age\n' +
    '    Animal : +String gender\n' +
    '    Animal: +isMammal()\n' +
    '    Animal: +mate()\n' +
    '    class Duck{\n' +
    '        +String beakColor\n' +
    '        +swim()\n' +
    '        +quack()\n' +
    '    }\n' +
    '    class Fish{\n' +
    '        -int sizeInFeet\n' +
    '        -canEat()\n' +
    '    }\n' +
    '    class Zebra{\n' +
    '        +bool is_wild\n' +
    '        +run()\n' +
    '    }\n' +
    '```\n\n'
