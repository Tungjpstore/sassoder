export type MailUiMailbox = {
  id: string;
  emailAddress: string;
  displayName: string | null;
  permission: string;
  aliases?: Array<{
    id: string;
    emailAddress: string;
    displayName: string | null;
    status: string;
  }>;
};

export type MailFolderKey = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'archive';

export type MailFolder = {
  key: MailFolderKey;
  path: string;
  label: string;
  total: number | null;
  unseen: number | null;
};

export type MailMessageSummary = {
  id: string;
  uid: number;
  folder: MailFolderKey;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  unread: boolean;
  flagged: boolean;
  size: number | null;
};

export type MailMessageDetail = MailMessageSummary & {
  cc: string;
  bodyText: string;
  messageId: string | null;
  references: string | null;
  attachments: Array<{ filename: string; contentType: string; size: number | null }>;
};
