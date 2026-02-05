export type ISODateString = string;
export type Id = string;

export type IntelFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'file'
  | 'number'
  | 'email'
  | 'url'
  | 'checkbox';

export type IntelFieldVisibility = 'client_visible' | 'operator_only';

export interface IntelFieldOption {
  label: string;
  value: string;
}

export interface IntelField {
  id: Id;
  key: string;
  label: string;
  type: IntelFieldType;
  required: boolean;
  description?: string;
  options?: IntelFieldOption[];
  visibility?: IntelFieldVisibility;
}

export interface IntelTemplate {
  id: Id;
  name: string;
  description?: string;
  version: number;
  fields: IntelField[];
  createdAt: ISODateString;
  updatedAt?: ISODateString;
}

export interface ProtocolItemDTO {
  id: Id;
  title: string;
  status: 'draft' | 'active' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  updatedAt: ISODateString;
}

export interface DashboardDTO {
  sessionId: Id;
  activeProtocols: ProtocolItemDTO[];
  pendingDirectives: number;
  lastSyncAt: ISODateString;
}

export interface DirectiveDTO {
  id: Id;
  code: string;
  title: string;
  summary?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'blocked';
  issuedAt: ISODateString;
  dueAt?: ISODateString;
}

export type IntelRequestStatus = 'pending' | 'submitted' | 'needs_revision' | 'accepted';

export interface IntelRequestDTO {
  id: Id;
  status: IntelRequestStatus;
  title: string;
  description?: string | null;
  required: boolean;
  templateKey: string;
  visibility?: string | null;
  fields: IntelField[];
}

export interface IntelUploadResponseDTO {
  requestId: Id;
  uploadId: Id;
  status: 'accepted' | 'failed';
  receivedAt: ISODateString;
  message?: string;
}

export interface DeliverableDTO {
  id: Id;
  title: string;
  status: 'queued' | 'in_review' | 'delivered' | 'rejected';
  submittedAt: ISODateString;
  deliveredAt?: ISODateString;
}

export interface SettlementDTO {
  id: Id;
  deliverableId: Id;
  amount: number;
  currency: string;
  status: 'pending' | 'settled' | 'disputed';
  settledAt?: ISODateString;
}

export interface MessageDTO {
  id: Id;
  threadId: Id;
  sender: string;
  body: string;
  createdAt: ISODateString;
}

export interface LucienSession {
  id: Id;
  subject: string;
  role: 'operator' | 'analyst' | 'viewer' | 'admin';
  issuedAt: ISODateString;
  expiresAt: ISODateString;
}
