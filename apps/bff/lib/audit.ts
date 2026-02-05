export type SecurityAuditPayload = Record<string, unknown>;

export const logToERPNextSecurity = async (payload: SecurityAuditPayload): Promise<void> => {
  const entry = {
    timestamp: new Date().toISOString(),
    ...payload,
  };
  console.info(JSON.stringify(entry));
};

export const auditSecurity = (payload: SecurityAuditPayload): void => {
  void logToERPNextSecurity(payload).catch(() => undefined);
};
