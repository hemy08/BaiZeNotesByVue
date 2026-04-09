// mermaid templates merged

// ========== C4Context.ts ==========
const C4Context =
    '\n```mermaid\n' +
    'C4Context\n' +
    '   title System Context diagram for Internet Banking System\n' +
    '   Enterprise_Boundary(b0, "BankBoundary0") {\n' +
    '     Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")\n' +
    '     Person(customerB, "Banking Customer B")\n' +
    '     Person_Ext(customerC, "Banking Customer C", "desc")\n' +
    '\n' +
    '     Person(customerD, "Banking Customer D", "A customer of the bank, <br/> with personal bank accounts.")\n' +
    '\n' +
    '     System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")\n' +
    '\n' +
    '     Enterprise_Boundary(b1, "BankBoundary") {\n' +
    '\n' +
    '       SystemDb_Ext(SystemE, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")\n' +
    '\n' +
    '       System_Boundary(b2, "BankBoundary2") {\n' +
    '         System(SystemA, "Banking System A")\n' +
    '         System(SystemB, "Banking System B", "A system of the bank, with personal bank accounts. next line.")\n' +
    '       }\n' +
    '\n' +
    '       System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")\n' +
    '       SystemDb(SystemD, "Banking System D Database", "A system of the bank, with personal bank accounts.")\n' +
    '\n' +
    '       Boundary(b3, "BankBoundary3", "boundary") {\n' +
    '         SystemQueue(SystemF, "Banking System F Queue", "A system of the bank.")\n' +
    '         SystemQueue_Ext(SystemG, "Banking System G Queue", "A system of the bank, with personal bank accounts.")\n' +
    '       }\n' +
    '     }\n' +
    '   }\n' +
    '\n' +
    '   BiRel(customerA, SystemAA, "Uses")\n' +
    '   BiRel(SystemAA, SystemE, "Uses")\n' +
    '   Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")\n' +
    '   Rel(SystemC, customerA, "Sends e-mails to")\n' +
    '\n' +
    '   UpdateElementStyle(customerA, $fontColor="red", $bgColor="grey", $borderColor="red")\n' +
    '   UpdateRelStyle(customerA, SystemAA, $textColor="blue", $lineColor="blue", $offsetX="5")\n' +
    '   UpdateRelStyle(SystemAA, SystemE, $textColor="blue", $lineColor="blue", $offsetY="-10")\n' +
    '   UpdateRelStyle(SystemAA, SystemC, $textColor="blue", $lineColor="blue", $offsetY="-40", $offsetX="-50")\n' +
    '   UpdateRelStyle(SystemC, customerA, $textColor="red", $lineColor="red", $offsetX="-50", $offsetY="20")\n' +
    '\n' +
    '   UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")\n' +
    '```\n\n'

// ========== blockDiagram.ts ==========
const blockDiagram =
    '\n```mermaid\n' +
    'block-beta\n' +
    '  columns 3\n' +
    '  Start(("Start")) space:2\n' +
    '  down<[" "]>(down) space:2\n' +
    '  Decision{{"Make Decision"}} right<["Yes"]>(right) Process1["Process A"]\n' +
    '  downAgain<["No"]>(down) space r3<["Done"]>(down)\n' +
    '  Process2["Process B"] r2<["Done"]>(right) End(("End"))\n' +
    '\n' +
    '  style Start fill:#969;\n' +
    '  style End fill:#696;\n' +
    '```\n\n'

// ========== classDiagram.ts ==========
const classDiagram =
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

// ========== erDiagram.ts ==========
const erDiagram =
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

// ========== flowchart.ts ==========
const flowchart =
    '\n```mermaid\n' +
    'flowchart TB\n' +
    '    c1-->a2\n' +
    '    subgraph one\n' +
    '    a1-->a2\n' +
    '    end\n' +
    '    subgraph two\n' +
    '    b1-->b2\n' +
    '    end\n' +
    '    subgraph three\n' +
    '    c1-->c2\n' +
    '    end\n' +
    '```\n\n'

// ========== gantt.ts ==========
const gantt =
    '\n```mermaid\n' +
    'gantt\n' +
    '    dateFormat  YYYY-MM-DD\n' +
    '    title       Adding GANTT diagram functionality to mermaid\n' +
    '    excludes    weekends\n' +
    '    %% (`excludes` accepts specific dates in YYYY-MM-DD format, days of the week ("sunday") or "weekends", but not the word "weekdays".)\n' +
    '\n' +
    '    section A section\n' +
    '    Completed task            :done,    des1, 2014-01-06,2014-01-08\n' +
    '    Active task               :active,  des2, 2014-01-09, 3d\n' +
    '    Future task               :         des3, after des2, 5d\n' +
    '    Future task2              :         des4, after des3, 5d\n' +
    '\n' +
    '    section Critical tasks\n' +
    '    Completed task in the critical line :crit, done, 2014-01-06,24h\n' +
    '    Implement parser and jison          :crit, done, after des1, 2d\n' +
    '    Create tests for parser             :crit, active, 3d\n' +
    '    Future task in critical line        :crit, 5d\n' +
    '    Create tests for renderer           :2d\n' +
    '    Add to mermaid                      :until isadded\n' +
    '    Functionality added                 :milestone, isadded, 2014-01-25, 0d\n' +
    '\n' +
    '    section Documentation\n' +
    '    Describe gantt syntax               :active, a1, after des1, 3d\n' +
    '    Add gantt diagram to demo page      :after a1  , 20h\n' +
    '    Add another diagram to demo page    :doc1, after a1  , 48h\n' +
    '\n' +
    '    section Last section\n' +
    '    Describe gantt syntax               :after doc1, 3d\n' +
    '    Add gantt diagram to demo page      :20h\n' +
    '    Add another diagram to demo page    :48h\n' +
    '```\n\n'

// ========== gitGraph.ts ==========
const gitGraph =
    '\n```mermaid\n' +
    'gitGraph\n' +
    '    commit id: "1"\n' +
    '    commit id: "2"\n' +
    '    branch nice_feature\n' +
    '    checkout nice_feature\n' +
    '    commit id: "3"\n' +
    '    checkout main\n' +
    '    commit id: "4"\n' +
    '    checkout nice_feature\n' +
    '    branch very_nice_feature\n' +
    '    checkout very_nice_feature\n' +
    '    commit id: "5"\n' +
    '    checkout main\n' +
    '    commit id: "6"\n' +
    '    checkout nice_feature\n' +
    '    commit id: "7"\n' +
    '    checkout main\n' +
    '    merge nice_feature id: "customID" tag: "customTag" type: REVERSE\n' +
    '    checkout very_nice_feature\n' +
    '    commit id: "8"\n' +
    '    checkout main\n' +
    '    commit id: "9"\n' +
    '```\n\n'

// ========== graph.ts ==========
const graph =
    '\n```mermaid\n' +
    'graph TB\n' +
    '    sq[Square shape] --> ci((Circle shape))\n' +
    '\n' +
    '    subgraph A\n' +
    '        od>Odd shape]-- Two line<br/>edge comment --> ro\n' +
    '        di{Diamond with <br/> line break} -.-> ro(Rounded<br>square<br>shape)\n' +
    '        di==>ro2(Rounded square shape)\n' +
    '    end\n' +
    '\n' +
    '    %% Notice that no text in shape are added here instead that is appended further down\n' +
    '    e --> od3>Really long text with linebreak<br>in an Odd shape]\n' +
    '\n' +
    '    %% Comments after double percent signs\n' +
    '    e((Inner / circle<br>and some odd <br>special characters)) --> f(,.?!+-*ز)\n' +
    '\n' +
    '    cyr[Cyrillic]-->cyr2((Circle shape Начало));\n' +
    '\n' +
    '     classDef green fill:#9f6,stroke:#333,stroke-width:2px;\n' +
    '     classDef orange fill:#f96,stroke:#333,stroke-width:4px;\n' +
    '     class sq,e green\n' +
    '     class di orange\n' +
    '```\n\n'

// ========== journey.ts ==========
const journey =
    '\n```mermaid\n' +
    'journey\n' +
    '    title My working day\n' +
    '    section Go to work\n' +
    '      Make tea: 5: Me\n' +
    '      Go upstairs: 3: Me\n' +
    '      Do work: 1: Me, Cat\n' +
    '    section Go home\n' +
    '      Go downstairs: 5: Me\n' +
    '      Sit down: 5: Me\n' +
    '```\n\n'

// ========== mindmap.ts ==========
const mindmap =
    '\n```mermaid\n' +
    'mindmap\n' +
    '  root((mindmap))\n' +
    '    Origins\n' +
    '      Long history\n' +
    '      ::icon(fa fa-book)\n' +
    '      Popularisation\n' +
    '        British popular psychology author Tony Buzan\n' +
    '    Research\n' +
    '      On effectiveness<br/>and features\n' +
    '      On Automatic creation\n' +
    '        Uses\n' +
    '            Creative techniques\n' +
    '            Strategic planning\n' +
    '            Argument mapping\n' +
    '    Tools\n' +
    '      Pen and paper\n' +
    '      Mermaid\n' +
    '```\n\n'

// ========== packet.ts ==========
const packet =
    '\n```mermaid\n' +
    '---\n' +
    'title: "TCP Packet"\n' +
    '---\n' +
    'packet-beta\n' +
    '0-15: "Source Port"\n' +
    '16-31: "Destination Port"\n' +
    '32-63: "Sequence Number"\n' +
    '64-95: "Acknowledgment Number"\n' +
    '96-99: "Data Offset"\n' +
    '100-105: "Reserved"\n' +
    '106: "URG"\n' +
    '107: "ACK"\n' +
    '108: "PSH"\n' +
    '109: "RST"\n' +
    '110: "SYN"\n' +
    '111: "FIN"\n' +
    '112-127: "Window"\n' +
    '128-143: "Checksum"\n' +
    '144-159: "Urgent Pointer"\n' +
    '160-191: "(Options and Padding)"\n' +
    '192-255: "Data (variable length)"\n' +
    '```\n\n'

// ========== pie.ts ==========
const pie =
    '\n```mermaid\n' +
    '%%{init: {"pie": {"textPosition": 0.5}, "themeVariables": {"pieOuterStrokeWidth": "5px"}} }%%\n' +
    'pie showData\n' +
    '    title Key elements in Product X\n' +
    '    "Calcium" : 42.96\n' +
    '    "Potassium" : 50.05\n' +
    '    "Magnesium" : 10.01\n' +
    '    "Iron" :  5\n' +
    '```\n\n'

// ========== quadrantChart.ts ==========
const quadrantChart =
    '\n```mermaid\n' +
    '%%{init: {"quadrantChart": {"chartWidth": 400, "chartHeight": 400}, "themeVariables": {"quadrant1TextFill": "#ff0000"} }}%%\n' +
    'quadrantChart\n' +
    '    title Reach and engagement of campaigns\n' +
    '    x-axis Low Reach --> High Reach\n' +
    '    y-axis Low Engagement --> High Engagement\n' +
    '    quadrant-1 We should expand\n' +
    '    quadrant-2 Need to promote\n' +
    '    quadrant-3 Re-evaluate\n' +
    '    quadrant-4 May be improved\n' +
    '    Campaign A: [0.3, 0.6]\n' +
    '    Campaign B: [0.45, 0.23]\n' +
    '    Campaign C: [0.57, 0.69]\n' +
    '    Campaign D: [0.78, 0.34]\n' +
    '    Campaign E: [0.40, 0.34]\n' +
    '    Campaign F: [0.35, 0.78]\n' +
    '```\n\n'

// ========== requirementDiagram.ts ==========
const requirementDiagram =
    '\n```mermaid\n' +
    'requirementDiagram\n' +
    '\n' +
    '    requirement test_req {\n' +
    '    id: 1\n' +
    '    text: the test text.\n' +
    '    risk: high\n' +
    '    verifymethod: test\n' +
    '    }\n' +
    '\n' +
    '    functionalRequirement test_req2 {\n' +
    '    id: 1.1\n' +
    '    text: the second test text.\n' +
    '    risk: low\n' +
    '    verifymethod: inspection\n' +
    '    }\n' +
    '\n' +
    '    performanceRequirement test_req3 {\n' +
    '    id: 1.2\n' +
    '    text: the third test text.\n' +
    '    risk: medium\n' +
    '    verifymethod: demonstration\n' +
    '    }\n' +
    '\n' +
    '    interfaceRequirement test_req4 {\n' +
    '    id: 1.2.1\n' +
    '    text: the fourth test text.\n' +
    '    risk: medium\n' +
    '    verifymethod: analysis\n' +
    '    }\n' +
    '\n' +
    '    physicalRequirement test_req5 {\n' +
    '    id: 1.2.2\n' +
    '    text: the fifth test text.\n' +
    '    risk: medium\n' +
    '    verifymethod: analysis\n' +
    '    }\n' +
    '\n' +
    '    designConstraint test_req6 {\n' +
    '    id: 1.2.3\n' +
    '    text: the sixth test text.\n' +
    '    risk: medium\n' +
    '    verifymethod: analysis\n' +
    '    }\n' +
    '\n' +
    '    element test_entity {\n' +
    '    type: simulation\n' +
    '    }\n' +
    '\n' +
    '    element test_entity2 {\n' +
    '    type: word doc\n' +
    '    docRef: reqs/test_entity\n' +
    '    }\n' +
    '\n' +
    '    element test_entity3 {\n' +
    '    type: "test suite"\n' +
    '    docRef: github.com/all_the_tests\n' +
    '    }\n' +
    '\n' +
    '\n' +
    '    test_entity - satisfies -> test_req2\n' +
    '    test_req - traces -> test_req2\n' +
    '    test_req - contains -> test_req3\n' +
    '    test_req3 - contains -> test_req4\n' +
    '    test_req4 - derives -> test_req5\n' +
    '    test_req5 - refines -> test_req6\n' +
    '    test_entity3 - verifies -> test_req5\n' +
    '    test_req <- copies - test_entity2\n' +
    '```\n\n'

// ========== sankey.ts ==========
const sankey =
    '\n```mermaid\n' +
    '---\n' +
    'config:\n' +
    '  sankey:\n' +
    '    showValues: false\n' +
    '---\n' +
    'sankey-beta\n' +
    '\n' +
    "Agricultural 'waste',Bio-conversion,124.729\n" +
    'Bio-conversion,Liquid,0.597\n' +
    'Bio-conversion,Losses,26.862\n' +
    'Bio-conversion,Solid,280.322\n' +
    'Bio-conversion,Gas,81.144\n' +
    'Biofuel imports,Liquid,35\n' +
    'Biomass imports,Solid,35\n' +
    'Coal imports,Coal,11.606\n' +
    'Coal reserves,Coal,63.965\n' +
    'Coal,Solid,75.571\n' +
    'District heating,Industry,10.639\n' +
    'District heating,Heating and cooling - commercial,22.505\n' +
    'District heating,Heating and cooling - homes,46.184\n' +
    'Electricity grid,Over generation / exports,104.453\n' +
    'Electricity grid,Heating and cooling - homes,113.726\n' +
    'Electricity grid,H2 conversion,27.14\n' +
    'Electricity grid,Industry,342.165\n' +
    'Electricity grid,Road transport,37.797\n' +
    'Electricity grid,Agriculture,4.412\n' +
    'Electricity grid,Heating and cooling - commercial,40.858\n' +
    'Electricity grid,Losses,56.691\n' +
    'Electricity grid,Rail transport,7.863\n' +
    'Electricity grid,Lighting & appliances - commercial,90.008\n' +
    'Electricity grid,Lighting & appliances - homes,93.494\n' +
    'Gas imports,Ngas,40.719\n' +
    'Gas reserves,Ngas,82.233\n' +
    'Gas,Heating and cooling - commercial,0.129\n' +
    'Gas,Losses,1.401\n' +
    'Gas,Thermal generation,151.891\n' +
    'Gas,Agriculture,2.096\n' +
    'Gas,Industry,48.58\n' +
    'Geothermal,Electricity grid,7.013\n' +
    'H2 conversion,H2,20.897\n' +
    'H2 conversion,Losses,6.242\n' +
    'H2,Road transport,20.897\n' +
    'Hydro,Electricity grid,6.995\n' +
    'Liquid,Industry,121.066\n' +
    'Liquid,International shipping,128.69\n' +
    'Liquid,Road transport,135.835\n' +
    'Liquid,Domestic aviation,14.458\n' +
    'Liquid,International aviation,206.267\n' +
    'Liquid,Agriculture,3.64\n' +
    'Liquid,National navigation,33.218\n' +
    'Liquid,Rail transport,4.413\n' +
    'Marine algae,Bio-conversion,4.375\n' +
    'Ngas,Gas,122.952\n' +
    'Nuclear,Thermal generation,839.978\n' +
    'Oil imports,Oil,504.287\n' +
    'Oil reserves,Oil,107.703\n' +
    'Oil,Liquid,611.99\n' +
    'Other waste,Solid,56.587\n' +
    'Other waste,Bio-conversion,77.81\n' +
    'Pumped heat,Heating and cooling - homes,193.026\n' +
    'Pumped heat,Heating and cooling - commercial,70.672\n' +
    'Solar PV,Electricity grid,59.901\n' +
    'Solar Thermal,Heating and cooling - homes,19.263\n' +
    'Solar,Solar Thermal,19.263\n' +
    'Solar,Solar PV,59.901\n' +
    'Solid,Agriculture,0.882\n' +
    'Solid,Thermal generation,400.12\n' +
    'Solid,Industry,46.477\n' +
    'Thermal generation,Electricity grid,525.531\n' +
    'Thermal generation,Losses,787.129\n' +
    'Thermal generation,District heating,79.329\n' +
    'Tidal,Electricity grid,9.452\n' +
    'UK land based bioenergy,Bio-conversion,182.01\n' +
    'Wave,Electricity grid,19.013\n' +
    'Wind,Electricity grid,289.366\n' +
    '```\n\n'

// ========== sequenceDiagram.ts ==========
const sequenceDiagram =
    '\n```mermaid\n' +
    'sequenceDiagram\n' +
    '    participant web as Web Browser\n' +
    '    participant blog as Blog Service\n' +
    '    participant account as Account Service\n' +
    '    participant mail as Mail Service\n' +
    '    participant db as Storage\n' +
    '\n' +
    '    Note over web,db: The user must be logged in to submit blog posts\n' +
    '    web->>+account: Logs in using credentials\n' +
    '    account->>db: Query stored accounts\n' +
    '    db->>account: Respond with query result\n' +
    '\n' +
    '    alt Credentials not found\n' +
    '        account->>web: Invalid credentials\n' +
    '    else Credentials found\n' +
    '        account->>-web: Successfully logged in\n' +
    '\n' +
    '        Note over web,db: When the user is authenticated, they can now submit new posts\n' +
    '        web->>+blog: Submit new post\n' +
    '        blog->>db: Store post data\n' +
    '\n' +
    '        par Notifications\n' +
    '            blog--)mail: Send mail to blog subscribers\n' +
    '            blog--)db: Store in-site notifications\n' +
    '        and Response\n' +
    '            blog-->>-web: Successfully posted\n' +
    '        end\n' +
    '    end\n' +
    '```\n\n'

// ========== stateDiagram.ts ==========
const stateDiagram =
    '\n```mermaid\n' +
    'stateDiagram-v2\n' +
    '    [*] --> First\n' +
    '\n' +
    '    state First {\n' +
    '        [*] --> Second\n' +
    '\n' +
    '        state Second {\n' +
    '            [*] --> second\n' +
    '            second --> Third\n' +
    '\n' +
    '            state Third {\n' +
    '                [*] --> third\n' +
    '                third --> [*]\n' +
    '            }\n' +
    '        }\n' +
    '    }\n' +
    '```\n\n'

// ========== timeline.ts ==========
const timeline =
    '\n```mermaid\n' +
    'timeline\n' +
    '    title History of Social Media Platform\n' +
    '    2002 : LinkedIn\n' +
    '    2004 : Facebook\n' +
    '         : Google\n' +
    '    2005 : Youtube\n' +
    '    2006 : Twitter\n' +
    '```\n\n'

// ========== xychart.ts ==========
const xychart =
    '\n```mermaid\n' +
    '---\n' +
    'config:\n' +
    '    xyChart:\n' +
    '        width: 900\n' +
    '        height: 600\n' +
    '    themeVariables:\n' +
    '        xyChart:\n' +
    '            titleColor: "#ff0000"\n' +
    '---\n' +
    'xychart-beta\n' +
    '    title "Sales Revenue"\n' +
    '    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]\n' +
    '    y-axis "Revenue (in $)" 4000 --> 11000\n' +
    '    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]\n' +
    '    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]\n' +
    '```\n\n'

// ========== zenuml.ts ==========
const zenuml =
    '\n```mermaid\n' +
    'zenuml\n' +
    '    try {\n' +
    '      Consumer->API: Book something\n' +
    '      API->BookingService: Start booking process\n' +
    '    } catch {\n' +
    '      API->Consumer: show failure\n' +
    '    } finally {\n' +
    '      API->BookingService: rollback status\n' +
    '    }\n' +
    '```\n\n'


// Export all
export {
    C4Context,
    blockDiagram,
    classDiagram,
    erDiagram,
    flowchart,
    gantt,
    gitGraph,
    graph,
    journey,
    mindmap,
    packet,
    pie,
    quadrantChart,
    requirementDiagram,
    sankey,
    sequenceDiagram,
    stateDiagram,
    timeline,
    xychart,
    zenuml
}
