import 'server-only';

export type IntelFieldVisibility = 'client_visible' | 'operator_only';

export interface IntelFieldOption {
  label: string;
  value: string;
}

export interface IntelField {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect' | 'file';
  required: boolean;
  description?: string;
  options?: IntelFieldOption[];
  visibility?: IntelFieldVisibility;
}

export interface IntelTemplate {
  key: string;
  name: string;
  version: number;
  description?: string;
  fields: IntelField[];
}

export const INTEL_TEMPLATES: Record<string, IntelTemplate> = {
  diag_intake_core_v1: {
    key: 'diag_intake_core_v1',
    name: 'Diagnostic Intake Core',
    version: 1,
    description: 'Primary diagnostic intake fields.',
    fields: [
      {
        id: 'field-symptoms',
        key: 'symptoms',
        label: 'Symptoms summary',
        type: 'textarea',
        required: true,
        visibility: 'client_visible',
      },
      {
        id: 'field-started-at',
        key: 'started_at',
        label: 'Started at',
        type: 'date',
        required: false,
        visibility: 'client_visible',
      },
      {
        id: 'field-severity',
        key: 'severity',
        label: 'Severity',
        type: 'select',
        required: true,
        options: [
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
        ],
        visibility: 'client_visible',
      },
      {
        id: 'field-context',
        key: 'context',
        label: 'Context',
        type: 'textarea',
        required: false,
        visibility: 'operator_only',
      },
    ],
  },
  diag_evidence_upload_v1: {
    key: 'diag_evidence_upload_v1',
    name: 'Diagnostic Evidence Upload',
    version: 1,
    description: 'Evidence collection fields for diagnostics.',
    fields: [
      {
        id: 'field-evidence',
        key: 'evidence_files',
        label: 'Evidence files',
        type: 'file',
        required: true,
        visibility: 'client_visible',
      },
      {
        id: 'field-evidence-notes',
        key: 'evidence_notes',
        label: 'Evidence notes',
        type: 'textarea',
        required: false,
        visibility: 'client_visible',
      },
      {
        id: 'field-internal-review',
        key: 'internal_review',
        label: 'Internal review notes',
        type: 'textarea',
        required: false,
        visibility: 'operator_only',
      },
    ],
  },
  sov_ops_access_authority_v1: {
    key: 'sov_ops_access_authority_v1',
    name: 'Sovereign Ops Access Authority',
    version: 1,
    description: 'Access authority request and approval fields.',
    fields: [
      {
        id: 'field-access-level',
        key: 'access_level',
        label: 'Requested access level',
        type: 'select',
        required: true,
        options: [
          { label: 'Tier 1', value: 'tier_1' },
          { label: 'Tier 2', value: 'tier_2' },
          { label: 'Tier 3', value: 'tier_3' },
        ],
        visibility: 'client_visible',
      },
      {
        id: 'field-justification',
        key: 'justification',
        label: 'Justification',
        type: 'textarea',
        required: true,
        visibility: 'client_visible',
      },
      {
        id: 'field-approver',
        key: 'approver',
        label: 'Approver',
        type: 'text',
        required: false,
        visibility: 'operator_only',
      },
      {
        id: 'field-approval-notes',
        key: 'approval_notes',
        label: 'Approval notes',
        type: 'textarea',
        required: false,
        visibility: 'operator_only',
      },
    ],
  },
};
