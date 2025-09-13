export const packet =
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
