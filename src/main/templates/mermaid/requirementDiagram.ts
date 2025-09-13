export const requirementDiagram =
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
