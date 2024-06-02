export const zenuml =
  '```mermaid\n' +
  'zenuml\n' +
  '    try {\n' +
  '      Consumer->API: Book something\n' +
  '      API->BookingService: Start booking process\n' +
  '    } catch {\n' +
  '      API->Consumer: show failure\n' +
  '    } finally {\n' +
  '      API->BookingService: rollback status\n' +
  '    }\n' +
  '```'
