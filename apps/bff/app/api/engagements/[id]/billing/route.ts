import { erpClient, isERPClientError } from '../../../../../lib/erp-client';
import { errorResponse } from '../../../../../lib/errors';
import { jsonResponse } from '../../../../../lib/response';

type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';

const parseScope = (scopeHeader: string | null) => {
  if (!scopeHeader) return { all: false, ids: [] as string[] };
  const normalized = scopeHeader.trim();
  if (normalized.toUpperCase() === 'ALL') {
    return { all: true, ids: [] as string[] };
  }
  return {
    all: false,
    ids: normalized
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
};

const resolveStatus = (outstanding: number, dueDate?: string): InvoiceStatus => {
  if (outstanding <= 0) return 'paid';
  if (!dueDate) return 'unpaid';
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'unpaid';
  return due.getTime() < Date.now() ? 'overdue' : 'unpaid';
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  const headers = request.headers;
  const role = headers.get('x-lucien-role');
  const scope = parseScope(headers.get('x-lucien-scope'));

  if (role === 'CLIENT' && !scope.all && !scope.ids.includes(engagementId)) {
    return errorResponse(403, 'forbidden', 'Engagement access denied.');
  }

  try {
    const invoices = await erpClient.fetchInvoicesByProject(engagementId);
    if (!invoices) {
      return jsonResponse({
        engagementId,
        outstandingTotal: 0,
        invoices: [],
        note: 'Billing doctype not wired.',
      });
    }

    const items = invoices.map((invoice) => {
      const status = resolveStatus(invoice.outstanding_amount, invoice.due_date);
      return {
        id: invoice.name,
        amount: invoice.grand_total ?? invoice.outstanding_amount,
        currency: invoice.currency ?? 'USD',
        dueDate: invoice.due_date ?? null,
        status,
        outstanding: invoice.outstanding_amount,
        issuedAt: invoice.posting_date ?? null,
      };
    });
    const outstandingTotal = items.reduce(
      (sum, item) => sum + (item.status === 'paid' ? 0 : item.outstanding),
      0,
    );

    return jsonResponse({
      engagementId,
      outstandingTotal,
      invoices: items,
      note: 'Invoices align with ERP Sales Invoice doctype.',
    });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(500, 'erp_unavailable', 'ERP request failed.');
    }
    throw error;
  }
}
