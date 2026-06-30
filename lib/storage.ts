import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import type { DocumentType, OrderDocument } from '@/types/database';

const BUCKET = 'order-documents';

/** Allowed upload mime types: PDF, JPG, PNG, DOCX, XLSX, XLS. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const;

export interface UploadOrderDocumentParams {
  orderId: string;
  lineItemId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  documentType?: DocumentType;
}

export interface UploadOrderDocumentResult {
  data: OrderDocument | null;
  path: string | null;
  error: Error | null;
}

/**
 * Read a local file as base64, upload it to the order-documents bucket at
 * orders/{orderId}/{lineItemId}/{fileName}, then insert an order_documents row.
 */
export async function uploadOrderDocument({
  orderId,
  lineItemId,
  fileUri,
  fileName,
  mimeType,
  documentType = 'other',
}: UploadOrderDocumentParams): Promise<UploadOrderDocumentResult> {
  try {
    if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      return {
        data: null,
        path: null,
        error: new Error(
          `Unsupported file type "${mimeType}". Allowed: PDF, JPG, PNG, DOCX.`
        ),
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return {
        data: null,
        path: null,
        error: userError ?? new Error('Not authenticated.'),
      };
    }

    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const path = `orders/${orderId}/${lineItemId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, decode(base64), {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) {
      return { data: null, path: null, error: uploadError };
    }

    const { data: row, error: insertError } = await supabase
      .from('order_documents')
      .insert({
        order_id: orderId,
        order_line_item_id: lineItemId,
        uploaded_by: user.id,
        file_name: fileName,
        file_url: path,
        document_type: documentType,
      })
      .select('*')
      .single();
    if (insertError) {
      return { data: null, path, error: insertError };
    }

    return { data: row ?? null, path, error: null };
  } catch (err) {
    return {
      data: null,
      path: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Create a short-lived signed URL (1 hour) for a stored document path.
 */
export async function getSignedUrl(
  path: string
): Promise<{ url: string | null; error: Error | null }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  return { url: data?.signedUrl ?? null, error };
}
