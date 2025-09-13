export const erDiagram =
    '\n```mermaid\n' +
    'erDiagram\n' +
    '    CAR ||--o{ NAMED-DRIVER : allows\n' +
    '    CAR {\n' +
    '        string registrationNumber PK\n' +
    '        string make\n' +
    '        string model\n' +
    '        string[] parts\n' +
    '    }\n' +
    '    PERSON ||--o{ NAMED-DRIVER : is\n' +
    '    PERSON {\n' +
    '        string driversLicense PK "The license #"\n' +
    '        string(99) firstName "Only 99 characters are allowed"\n' +
    '        string lastName\n' +
    '        string phone UK\n' +
    '        int age\n' +
    '    }\n' +
    '    NAMED-DRIVER {\n' +
    '        string carRegistrationNumber PK, FK\n' +
    '        string driverLicence PK, FK\n' +
    '    }\n' +
    '    MANUFACTURER only one to zero or more CAR : makes\n' +
    '```\n\n'
