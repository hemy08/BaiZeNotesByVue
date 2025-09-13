export const C4Context =
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
