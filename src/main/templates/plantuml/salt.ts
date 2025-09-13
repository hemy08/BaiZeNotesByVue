export const salt =
    '\n```plantuml\n' +
    '@startuml\n' +
    'start\n' +
    'while (\\n{{\\nsalt\\n{+\\nPassword | "****     "\\n[Cancel] | [  OK   ]}\\n}}\\n) is (Incorrect)\n' +
    '  :log attempt;\n' +
    '  :attempt_count++;\n' +
    '  if (attempt_count > 4) then (yes)\n' +
    '    :increase delay timer;\n' +
    '    :wait for timer to expire;\n' +
    '  else (no)\n' +
    '  endif\n' +
    'endwhile (correct)\n' +
    ':log request;\n' +
    ':disable service;\n' +
    '@enduml\n' +
    '```\n\n'
