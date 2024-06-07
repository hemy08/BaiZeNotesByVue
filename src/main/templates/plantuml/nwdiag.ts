export const nwdiag =
  '\n```plantuml\n' +
  '@startuml\n' +
  '\n' +
  'nwdiag {\n' +
  '  group nightly {\n' +
  '    color = "#FFAAAA";\n' +
  '    description = "<&clock> Restarted nightly <&clock>";\n' +
  '    web02;\n' +
  '    db01;\n' +
  '  }\n' +
  '  network dmz {\n' +
  '      address = "210.x.x.x/24"\n' +
  '\n' +
  '      user [description = "<&person*4.5>\\n user1"];\n' +
  '      // set multiple addresses (using comma)\n' +
  '      web01 [address = "210.x.x.1, 210.x.x.20",  description = "<&cog*4>\\nweb01"]\n' +
  '      web02 [address = "210.x.x.2",  description = "<&cog*4>\\nweb02"];\n' +
  '\n' +
  '  }\n' +
  '  network internal {\n' +
  '      address = "172.x.x.x/24";\n' +
  '\n' +
  '      web01 [address = "172.x.x.1"];\n' +
  '      web02 [address = "172.x.x.2"];\n' +
  '      db01 [address = "172.x.x.100",  description = "<&spreadsheet*4>\\n db01"];\n' +
  '      db02 [address = "172.x.x.101",  description = "<&spreadsheet*4>\\n db02"];\n' +
  '      ptr  [address = "172.x.x.110",  description = "<&print*4>\\n ptr01"];\n' +
  '  }\n' +
  '}\n' +
  '@enduml\n' +
  '```\n\n'
