// plantuml templates merged

// ========== ActivityDiagram.ts ==========
const ActivityDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    ':Ready;\n' +
    ':next(o); <<procedure>>\n' +
    ':Receiving;\n' +
    'split\n' +
    ' :nak(i); <<input>>\n' +
    ' :ack(o); <<output>>\n' +
    'split again\n' +
    ' :ack(i); <<input>>\n' +
    ' :next(o)\n' +
    ' on several lines; <<procedure>>\n' +
    ' :i := i + 1; <<task>>\n' +
    ' :ack(o); <<output>>\n' +
    'split again\n' +
    ' :err(i); <<input>>\n' +
    ' :nak(o); <<output>>\n' +
    'split again\n' +
    ' :foo; <<save>>\n' +
    'split again\n' +
    ' :bar; <<load>>\n' +
    'split again\n' +
    ' :i > 5; <<continuous>>\n' +
    'stop\n' +
    'end split\n' +
    ':finish;\n' +
    '@enduml\n' +
    '```\n\n'

// ========== ArchimateDiagram.ts ==========
const ArchimateDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    'skinparam rectangle<<behavior>> {\n' +
    '\troundCorner 25\n' +
    '}\n' +
    'sprite $bProcess jar:archimate/business-process\n' +
    'sprite $aService jar:archimate/application-service\n' +
    'sprite $aComponent jar:archimate/application-component\n' +
    '\n' +
    'rectangle "Handle claim"  as HC <<$bProcess>><<behavior>> #Business\n' +
    'rectangle "Capture Information"  as CI <<$bProcess>><<behavior>> #Business\n' +
    'rectangle "Notify\\nAdditional Stakeholders" as NAS <<$bProcess>><<behavior>> #Business\n' +
    'rectangle "Validate" as V <<$bProcess>><<behavior>> #Business\n' +
    'rectangle "Investigate" as I <<$bProcess>><<behavior>> #Business\n' +
    'rectangle "Pay" as P <<$bProcess>><<behavior>> #Business\n' +
    '\n' +
    'HC *-down- CI\n' +
    'HC *-down- NAS\n' +
    'HC *-down- V\n' +
    'HC *-down- I\n' +
    'HC *-down- P\n' +
    '\n' +
    'CI -right->> NAS\n' +
    'NAS -right->> V\n' +
    'V -right->> I\n' +
    'I -right->> P\n' +
    '\n' +
    'rectangle "Scanning" as scanning <<$aService>><<behavior>> #Application\n' +
    'rectangle "Customer admnistration" as customerAdministration <<$aService>><<behavior>> #Application\n' +
    'rectangle "Claims admnistration" as claimsAdministration <<$aService>><<behavior>> #Application\n' +
    'rectangle Printing <<$aService>><<behavior>> #Application\n' +
    'rectangle Payment <<$aService>><<behavior>> #Application\n' +
    '\n' +
    'scanning -up-> CI\n' +
    'customerAdministration  -up-> CI\n' +
    'claimsAdministration -up-> NAS\n' +
    'claimsAdministration -up-> V\n' +
    'claimsAdministration -up-> I\n' +
    'Payment -up-> P\n' +
    '\n' +
    'Printing -up-> V\n' +
    'Printing -up-> P\n' +
    '\n' +
    'rectangle "Document\\nManagement\\nSystem" as DMS <<$aComponent>> #Application\n' +
    'rectangle "General\\nCRM\\nSystem" as CRM <<$aComponent>>  #Application\n' +
    'rectangle "Home & Away\\nPolicy\\nAdministration" as HAPA <<$aComponent>> #Application\n' +
    'rectangle "Home & Away\\nFinancial\\nAdministration" as HFPA <<$aComponent>>  #Application\n' +
    '\n' +
    'DMS .up.|> scanning\n' +
    'DMS .up.|> Printing\n' +
    'CRM .up.|> customerAdministration\n' +
    'HAPA .up.|> claimsAdministration\n' +
    'HFPA .up.|> Payment\n' +
    '\n' +
    'legend left\n' +
    'Example from the "Archisurance case study" (OpenGroup).\n' +
    'See\n' +
    '====\n' +
    '<$bProcess> :business process\n' +
    '====\n' +
    '<$aService> : application service\n' +
    '====\n' +
    '<$aComponent> : application component\n' +
    'endlegend\n' +
    '@enduml\n' +
    '```\n\n'

// ========== AsciiMath.ts ==========
const AsciiMath =
    '\n```plantuml\n' +
    '@startuml\n' +
    ':<latex>\\int_0^1f(x)dx</latex>;\n' +
    ':<latex>x^2+y_1+z_{12}^{34}</latex>;\n' +
    'note right\n' +
    'Try also\n' +
    '<latex>\\dfrac{d}{dx}f(x)=\\lim\\limits_{h \\to 0}\\dfrac{f(x+h)-f(x)}{h}</latex>\n' +
    '<latex>P(y|\\mathbf{x}) \\mbox{ or } f(\\mathbf{x})+\\epsilon</latex>\n' +
    'end note\n' +
    '@enduml\n' +
    '```\n\n'

// ========== ClassDiagram.ts ==========
const ClassDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    '\n' +
    'abstract class AbstractList\n' +
    'abstract AbstractCollection\n' +
    'interface List\n' +
    'interface Collection\n' +
    '\n' +
    'List <|-- AbstractList\n' +
    'Collection <|-- AbstractCollection\n' +
    '\n' +
    'Collection <|- List\n' +
    'AbstractCollection <|- AbstractList\n' +
    'AbstractList <|-- ArrayList\n' +
    '\n' +
    'class ArrayList {\n' +
    '  Object[] elementData\n' +
    '  size()\n' +
    '}\n' +
    '\n' +
    'enum TimeUnit {\n' +
    '  DAYS\n' +
    '  HOURS\n' +
    '  MINUTES\n' +
    '}\n' +
    '\n' +
    'annotation SuppressWarnings\n' +
    '\n' +
    '@enduml\n' +
    '```\n\n'

// ========== ComponentDiagram.ts ==========
const ComponentDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    '\n' +
    'package "Some Group" {\n' +
    '  HTTP - [First Component]\n' +
    '  [Another Component]\n' +
    '}\n' +
    '\n' +
    'node "Other Groups" {\n' +
    '  FTP - [Second Component]\n' +
    '  [First Component] --> FTP\n' +
    '}\n' +
    '\n' +
    'cloud {\n' +
    '  [Example 1]\n' +
    '}\n' +
    '\n' +
    '\n' +
    'database "MySql" {\n' +
    '  folder "This is my folder" {\n' +
    '    [Folder 3]\n' +
    '  }\n' +
    '  frame "Foo" {\n' +
    '    [Frame 4]\n' +
    '  }\n' +
    '}\n' +
    '\n' +
    '\n' +
    '[Another Component] --> [Example 1]\n' +
    '[Example 1] --> [Folder 3]\n' +
    '[Folder 3] --> [Frame 4]\n' +
    '\n' +
    '@enduml\n' +
    '```\n\n'

// ========== DeploymentDiagram.ts ==========
const DeploymentDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    '\n' +
    'allowmixing\n' +
    '\n' +
    'skinparam nodesep 10\n' +
    'abstract        abstract\n' +
    'abstract class  "abstract class"\n' +
    'annotation      annotation\n' +
    'circle          circle\n' +
    '()              circle_short_form\n' +
    'class           class\n' +
    'diamond         diamond\n' +
    '<>              diamond_short_form\n' +
    'entity          entity\n' +
    'enum            enum\n' +
    'exception       exception\n' +
    'interface       interface\n' +
    'metaclass       metaclass\n' +
    'protocol        protocol\n' +
    'stereotype      stereotype\n' +
    'struct          struct\n' +
    'object          object\n' +
    'map map {\n' +
    ' key => value\n' +
    '}\n' +
    'json JSON {\n' +
    '   "fruit":"Apple",\n' +
    '   "size":"Large",\n' +
    '   "color": ["Red", "Green"]\n' +
    '}\n' +
    'action action\n' +
    'actor actor\n' +
    'actor/ "actor/"\n' +
    'agent agent\n' +
    'artifact artifact\n' +
    'boundary boundary\n' +
    'card card\n' +
    'circle circle\n' +
    'cloud cloud\n' +
    'collections collections\n' +
    'component component\n' +
    'control control\n' +
    'database database\n' +
    'entity entity\n' +
    'file file\n' +
    'folder folder\n' +
    'frame frame\n' +
    'hexagon hexagon\n' +
    'interface interface\n' +
    'label label\n' +
    'node node\n' +
    'package package\n' +
    'person person\n' +
    'process process\n' +
    'queue queue\n' +
    'rectangle rectangle\n' +
    'stack stack\n' +
    'storage storage\n' +
    'usecase usecase\n' +
    'usecase/ "usecase/"\n' +
    'state state\n' +
    '@enduml\n' +
    '```\n\n'

// ========== DitaaDiagram.ts ==========
const DitaaDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    'ditaa\n' +
    '+--------+   +-------+    +-------+\n' +
    '|        +---+ ditaa +--> |       |\n' +
    '|  Text  |   +-------+    |diagram|\n' +
    '|Document|   |!magic!|    |       |\n' +
    '|     {d}|   |       |    |       |\n' +
    '+---+----+   +-------+    +-------+\n' +
    '    :                         ^\n' +
    '    |       Lots of work      |\n' +
    '    +-------------------------+\n' +
    '@enduml\n' +
    '```\n\n'

// ========== EntityRelationship.ts ==========
const EntityRelationship =
    '\n```plantuml\n' +
    '@startchen\n' +
    '\n' +
    'entity PARENT {\n' +
    '  Number <<key>>\n' +
    '  Name\n' +
    '}\n' +
    '\n' +
    'entity CHILD <<weak>> {\n' +
    '  Name <<key>>\n' +
    '  Age\n' +
    '}\n' +
    '\n' +
    'relationship PARENT_OF <<identifying>> {\n' +
    '}\n' +
    '\n' +
    'PARENT_OF -1- PARENT\n' +
    'PARENT_OF =N= CHILD\n' +
    '\n' +
    '@endchen\n' +
    '```\n\n'

// ========== ExtendedBackusNaurForm.ts ==========
const ExtendedBackusNaurForm =
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

// ========== GanttDiagram.ts ==========
const GanttDiagram =
    '\n```plantuml\n' +
    '@startgantt\n' +
    'saturday are closed\n' +
    'sunday are closed\n' +
    '\n' +
    'Project starts the 1st of january 2021\n' +
    '[Prototype design end] as [TASK1] requires 19 days\n' +
    '[TASK1] is colored in Lavender/LightBlue\n' +
    '[Testing] requires 14 days\n' +
    '[TASK1]->[Testing]\n' +
    '\n' +
    "2021-01-18 to 2021-01-22 are named [End's committee]\n" +
    '2021-01-18 to 2021-01-22 are colored in salmon \n' +
    '@endgantt\n' +
    '```\n\n'

// ========== InformationEngineering.ts ==========
const InformationEngineering =
    '\n```plantuml\n' +
    '@startuml\n' +
    '\n' +
    "' hide the spot\n" +
    'hide circle\n' +
    '\n' +
    "' avoid problems with angled crows feet\n" +
    'skinparam linetype ortho\n' +
    '\n' +
    'entity "Entity01" as e01 {\n' +
    '  *e1_id : number <<generated>>\n' +
    '  --\n' +
    '  *name : text\n' +
    '  description : text\n' +
    '}\n' +
    '\n' +
    'entity "Entity02" as e02 {\n' +
    '  *e2_id : number <<generated>>\n' +
    '  --\n' +
    '  *e1_id : number <<FK>>\n' +
    '  other_details : text\n' +
    '}\n' +
    '\n' +
    'entity "Entity03" as e03 {\n' +
    '  *e3_id : number <<generated>>\n' +
    '  --\n' +
    '  e1_id : number <<FK>>\n' +
    '  other_details : text\n' +
    '}\n' +
    '\n' +
    'e01 ||..o{ e02\n' +
    'e01 |o..o{ e03\n' +
    '\n' +
    '@enduml\n' +
    '```\n\n'

// ========== JsonDiagram.ts ==========
const JsonDiagram =
    '\n```plantuml\n' +
    '@startjson\n' +
    '#highlight "lastName"\n' +
    '#highlight "address" / "city"\n' +
    '#highlight "phoneNumbers" / "0" / "number"\n' +
    '{\n' +
    '  "firstName": "John",\n' +
    '  "lastName": "Smith",\n' +
    '  "isAlive": true,\n' +
    '  "age": 28,\n' +
    '  "address": {\n' +
    '    "streetAddress": "21 2nd Street",\n' +
    '    "city": "New York",\n' +
    '    "state": "NY",\n' +
    '    "postalCode": "10021-3100"\n' +
    '  },\n' +
    '  "phoneNumbers": [\n' +
    '    {\n' +
    '      "type": "home",\n' +
    '      "number": "212 555-1234"\n' +
    '    },\n' +
    '    {\n' +
    '      "type": "office",\n' +
    '      "number": "646 555-4567"\n' +
    '    }\n' +
    '  ],\n' +
    '  "children": [],\n' +
    '  "spouse": null\n' +
    '}\n' +
    '@endjson\n' +
    '```\n\n'

// ========== MindmapDiagram.ts ==========
const MindmapDiagram =
    '\n```plantuml\n' +
    '@startmindmap\n' +
    '*[#Orange] root node\n' +
    ' *[#lightgreen] some first level node\n' +
    '  *[#FFBBCC] second level node\n' +
    '  *[#lightblue] another second level node\n' +
    ' *[#lightgreen] another first level node\n' +
    '@endmindmap\n' +
    '```\n\n'

// ========== ObjectDiagram.ts ==========
const ObjectDiagram =
    '\n```plantuml\n' +
    '@startuml PERT\n' +
    'left to right direction\n' +
    "' Horizontal lines: -->, <--, <-->\n" +
    "' Vertical lines: ->, <-, <->\n" +
    'title PERT: Project Name\n' +
    '\n' +
    'map Kick.Off {\n' +
    '}\n' +
    'map task.1 {\n' +
    '    Start => End\n' +
    '}\n' +
    'map task.2 {\n' +
    '    Start => End\n' +
    '}\n' +
    'map task.3 {\n' +
    '    Start => End\n' +
    '}\n' +
    'map task.4 {\n' +
    '    Start => End\n' +
    '}\n' +
    'map task.5 {\n' +
    '    Start => End\n' +
    '}\n' +
    'Kick.Off --> task.1 : Label 1\n' +
    'Kick.Off --> task.2 : Label 2\n' +
    'Kick.Off --> task.3 : Label 3\n' +
    'task.1 --> task.4\n' +
    'task.2 --> task.4\n' +
    'task.3 --> task.4\n' +
    'task.4 --> task.5 : Label 4\n' +
    '@enduml\n' +
    '```\n\n'

// ========== RegularExpression.ts ==========
const RegularExpression =
    '\n```plantuml\n' +
    '@startregex\n' +
    'title repetitionEquivalance\n' +
    'a{0,1}b{1,} is the same as a?b+\n' +
    '@endregex\n' +
    '```\n\n'

// ========== SequenceDiagram.ts ==========
const SequenceDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    'skinparam sequenceArrowThickness 2\n' +
    'skinparam roundcorner 20\n' +
    'skinparam maxmessagesize 60\n' +
    'skinparam sequenceParticipant underline\n' +
    '\n' +
    'actor User\n' +
    'participant "First Class" as A\n' +
    'participant "Second Class" as B\n' +
    'participant "Last Class" as C\n' +
    '\n' +
    'User -> A: DoWork\n' +
    'activate A\n' +
    '\n' +
    'A -> B: Create Request\n' +
    'activate B\n' +
    '\n' +
    'B -> C: DoWork\n' +
    'activate C\n' +
    'C --> B: WorkDone\n' +
    'destroy C\n' +
    '\n' +
    'B --> A: Request Created\n' +
    'deactivate B\n' +
    '\n' +
    'A --> User: Done\n' +
    'deactivate A\n' +
    '@enduml\n' +
    '```\n\n'

// ========== StateDiagram.ts ==========
const StateDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    '[*] -> State1\n' +
    'State1 --> State2 : Succeeded\n' +
    'State1 --> [*] : Aborted\n' +
    'State2 --> State3 : Succeeded\n' +
    'State2 --> [*] : Aborted\n' +
    'state State3 {\n' +
    '  state "Accumulate Enough Data" as long1\n' +
    '  long1 : Just a test\n' +
    '  [*] --> long1\n' +
    '  long1 --> long1 : New Data\n' +
    '  long1 --> ProcessData : Enough Data\n' +
    '  State2 --> [H]: Resume\n' +
    '}\n' +
    'State3 --> State2 : Pause\n' +
    'State2 --> State3[H*]: DeepResume\n' +
    'State3 --> State3 : Failed\n' +
    'State3 --> [*] : Succeeded / Save Result\n' +
    'State3 --> [*] : Aborted\n' +
    '@enduml\n' +
    '```\n\n'

// ========== TimingDiagram.ts ==========
const TimingDiagram =
    '\n```plantuml\n' +
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
    '```\n\n'

// ========== UseCaseDiagram.ts ==========
const UseCaseDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    'left to right direction\n' +
    'actor Guest as g\n' +
    'package Professional {\n' +
    '  actor Chef as c\n' +
    '  actor "Food Critic" as fc\n' +
    '}\n' +
    'package Restaurant {\n' +
    '  usecase "Eat Food" as UC1\n' +
    '  usecase "Pay for Food" as UC2\n' +
    '  usecase "Drink" as UC3\n' +
    '  usecase "Review" as UC4\n' +
    '}\n' +
    'fc --> UC4\n' +
    'g --> UC1\n' +
    'g --> UC2\n' +
    'g --> UC3\n' +
    '@enduml\n' +
    '```\n\n'

// ========== WBSDiagram.ts ==========
const WBSDiagram =
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

// ========== YamlDiagram.ts ==========
const YamlDiagram =
    '\n```plantuml\n' +
    '@startyaml\n' +
    '#highlight "french-hens"\n' +
    '#highlight "xmas-fifth-day" / "partridges"\n' +
    '\n' +
    'doe: "a deer, a female deer"\n' +
    'ray: "a drop of golden sun"\n' +
    'pi: 3.14159\n' +
    'xmas: true\n' +
    'french-hens: 3\n' +
    'calling-birds: \n' +
    '\t- huey\n' +
    '\t- dewey\n' +
    '\t- louie\n' +
    '\t- fred\n' +
    'xmas-fifth-day: \n' +
    '\tcalling-birds: four\n' +
    '\tfrench-hens: 3\n' +
    '\tgolden-rings: 5\n' +
    '\tpartridges: \n' +
    '\t\tcount: 1\n' +
    '\t\tlocation: "a pear tree"\n' +
    '\tturtle-doves: two\n' +
    '@endyaml\n' +
    '```\n\n'

// ========== nwdiag.ts ==========
const nwdiag =
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

// ========== salt.ts ==========
const salt =
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


// Export all
export {
    ActivityDiagram,
    ArchimateDiagram,
    AsciiMath,
    ClassDiagram,
    ComponentDiagram,
    DeploymentDiagram,
    DitaaDiagram,
    EntityRelationship,
    ExtendedBackusNaurForm,
    GanttDiagram,
    InformationEngineering,
    JsonDiagram,
    MindmapDiagram,
    ObjectDiagram,
    RegularExpression,
    SequenceDiagram,
    StateDiagram,
    TimingDiagram,
    UseCaseDiagram,
    WBSDiagram,
    YamlDiagram,
    nwdiag,
    salt
}
