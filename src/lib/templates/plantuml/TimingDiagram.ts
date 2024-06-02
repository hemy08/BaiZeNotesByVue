export const TimingDiagram =
  '```plantuml\n' +
  '@startuml\n' +
  'scale 5 as 150 pixels\n' +
  '\n' +
  'clock clk with period 1\n' +
  'binary "enable" as en\n' +
  'binary "R/W" as rw\n' +
  'binary "data Valid" as dv\n' +
  'concise "dataBus" as db\n' +
  'concise "address bus" as addr\n' +
  '\n' +
  '@6 as :write_beg\n' +
  '@10 as :write_end\n' +
  '\n' +
  '@15 as :read_beg\n' +
  '@19 as :read_end\n' +
  '\n' +
  '\n' +
  '@0\n' +
  'en is low\n' +
  'db is "0x0"\n' +
  'addr is "0x03f"\n' +
  'rw is low\n' +
  'dv is 0\n' +
  '\n' +
  '@:write_beg-3\n' +
  ' en is high\n' +
  '@:write_beg-2\n' +
  ' db is "0xDEADBEEF"\n' +
  '@:write_beg-1\n' +
  'dv is 1\n' +
  '@:write_beg\n' +
  'rw is high\n' +
  '\n' +
  '\n' +
  '@:write_end\n' +
  'rw is low\n' +
  'dv is low\n' +
  '@:write_end+1\n' +
  'rw is low\n' +
  'db is "0x0"\n' +
  'addr is "0x23"\n' +
  '\n' +
  '@12\n' +
  'dv is high\n' +
  '@13 \n' +
  'db is "0xFFFF"\n' +
  '\n' +
  '@20\n' +
  'en is low\n' +
  'dv is low\n' +
  '@21 \n' +
  'db is "0x0"\n' +
  '\n' +
  'highlight :write_beg to :write_end #Gold:Write\n' +
  'highlight :read_beg to :read_end #lightBlue:Read\n' +
  '\n' +
  'db@:write_beg-1 <-> @:write_end : setup time\n' +
  'db@:write_beg-1 -> addr@:write_end+1 : hold\n' +
  '@enduml\n' +
  '```'
