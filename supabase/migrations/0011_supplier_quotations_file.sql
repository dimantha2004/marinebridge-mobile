-- 0011_supplier_quotations_file.sql
-- Add file_url column to supplier_quotations table to allow uploading files with quotes

ALTER TABLE public.supplier_quotations
ADD COLUMN IF NOT EXISTS file_url TEXT;
