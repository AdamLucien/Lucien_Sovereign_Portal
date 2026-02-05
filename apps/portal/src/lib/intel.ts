import { apiFetch } from './api';

import type { IntelRequestDTO, IntelUploadResponseDTO } from '@lucien/contracts';

export const fetchIntelRequests = async (engagementId: string) => {
  return apiFetch<IntelRequestDTO[]>(`/api/engagements/${engagementId}/intel`);
};

export const uploadIntelFile = async (engagementId: string, requestId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('requestId', requestId);

  return apiFetch<IntelUploadResponseDTO>(`/api/engagements/${engagementId}/intel/upload`, {
    method: 'POST',
    body: formData,
  });
};
