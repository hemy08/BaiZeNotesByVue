export const ExtendedBackusNaurForm =
  '\n```plantuml\n' +
  '@startebnf\n' +
  '<style>\n' +
  'element {\n' +
  '  ebnf {\n' +
  '    LineColor blue\n' +
  '    Fontcolor green\n' +
  '    Backgroundcolor palegreen\n' +
  '    note {\n' +
  '      Backgroundcolor pink\n' +
  '    }\n' +
  '  }\n' +
  '}\n' +
  '</style>\n' +
  'title Title\n' +
  'styled_ebnf = {"a", c , "a" (* Note on a *)}\n' +
  '| ? special ?\n' +
  '| "repetition", 4 * \'2\';\n' +
  '(* Global End Note *)\n' +
  '@endebnf\n' +
  '```\n\n'
