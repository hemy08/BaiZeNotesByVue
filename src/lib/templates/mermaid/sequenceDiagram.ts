export const sequenceDiagram =
  '```mermaid\n' +
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
  '```'
