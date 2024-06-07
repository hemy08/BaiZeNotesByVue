export const ArchimateDiagram =
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
