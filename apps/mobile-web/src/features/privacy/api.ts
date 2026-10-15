import { api } from '../../lib/apiClient';

function newIdempotencyKey(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // fall through for older Hermes/web runtimes
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let exportKey: string | null = null;
let deletionKey: string | null = null;

export type PrivacyExportResponse = {
  export_job_id: string;
  status: string;
};

export type PrivacyExportStatus = {
  export_job_id: string;
  status: string;
  download_url: string | null;
  expires_at: string | null;
};

export type DeleteAccountResponse = {
  deletion_job_id: string;
  status: string;
};

export async function requestPrivacyExport(): Promise<PrivacyExportResponse> {
  exportKey ??= newIdempotencyKey('privacy-export');
  const response = await api.post<PrivacyExportResponse>('/v1/privacy/export', undefined, {
    headers: { 'X-Idempotency-Key': exportKey },
  });
  exportKey = null;
  return response;
}

export async function getPrivacyExportStatus(
  jobId: string,
): Promise<PrivacyExportStatus> {
  return api.get<PrivacyExportStatus>(`/v1/privacy/export/${jobId}`);
}

export async function requestAccountDeletion(): Promise<DeleteAccountResponse> {
  deletionKey ??= newIdempotencyKey('account-deletion');
  return api.post<DeleteAccountResponse>(
    '/v1/privacy/delete-account',
    { confirm: 'DELETE_MY_ACCOUNT' },
    { headers: { 'X-Idempotency-Key': deletionKey } },
  );
}

export async function waitForExportReady(
  jobId: string,
  {
    timeoutMs = 45_000,
    intervalMs = 2000,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<PrivacyExportStatus> {
  const started = Date.now();
  let last: PrivacyExportStatus | null = null;
  while (Date.now() - started < timeoutMs) {
    last = await getPrivacyExportStatus(jobId);
    if (last.status === 'completed' || last.status === 'failed') {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last ?? { export_job_id: jobId, status: 'queued', download_url: null, expires_at: null };
}
