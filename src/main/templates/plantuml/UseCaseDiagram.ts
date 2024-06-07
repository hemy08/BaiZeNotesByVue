export const UseCaseDiagram =
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
