import { erpClient, isERPClientError } from '../../../../../lib/erp-client';
import { errorResponse } from '../../../../../lib/errors';
import { jsonResponse } from '../../../../../lib/response';

const resolveStatus = (
  outstandingAmount: number,
  dueDate: string,
): 'paid' | 'overdue' | 'unpaid' => {
  if (outstandingAmount <= 0) return 'paid';
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'unpaid';
  return due.getTime() < Date.now() ? 'overdue' : 'unpaid';
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  try {
    const invoice = await erpClient.fetchLatestInvoice(engagementId);

    if (!invoice) {
      return errorResponse(403, 'invoice_not_found', 'Settlement not available.');
    }

    const status = resolveStatus(invoice.outstanding_amount, invoice.due_date);

    return jsonResponse({
      id: invoice.name,
      deliverableId: invoice.project,
      amount: invoice.grand_total ?? invoice.outstanding_amount,
      currency: invoice.currency ?? 'USD',
      status,
      settledAt: status === 'paid' ? (invoice.posting_date ?? undefined) : undefined,
    });
  } catch (error) {
    if (isERPClientError(error)) {
      return errorResponse(500, 'erp_unavailable', 'ERP request failed.');
    }
    throw error;
  }
}
