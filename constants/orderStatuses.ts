import { palette } from './theme';

/**
 * Order-level lifecycle statuses (orders.overall_status).
 * Mirrors the DB CHECK constraint exactly.
 */
export const OVERALL_STATUSES = [
  'draft',
  'pending_charter_approval',
  'charter_rejected',
  'pending_payment',
  'pending_port_approval',
  'active',
  'in_execution',
  'completed',
  'cancelled',
] as const;

export type OverallStatus = (typeof OVERALL_STATUSES)[number];

/**
 * Per-line-item statuses (order_line_items.line_status).
 * Mirrors the DB CHECK constraint exactly.
 */
export const LINE_STATUSES = [
  'pending_supplier',
  'supplier_accepted',
  'supplier_declined',
  'preparing',
  'ready',
  'in_transit',
  'delivered',
  'cancelled',
] as const;

export type LineStatus = (typeof LINE_STATUSES)[number];

type StatusMeta = { label: string; color: string; pulsing?: boolean };

export const OVERALL_STATUS_META: Record<OverallStatus, StatusMeta> = {
  draft: { label: 'Draft', color: palette.hullGray },
  pending_charter_approval: { label: 'Pending Charter Approval', color: palette.signalAmber },
  charter_rejected: { label: 'Charter Rejected', color: palette.alertRed },
  pending_payment: { label: 'Pending Payment', color: palette.signalAmber },
  pending_port_approval: { label: 'Pending Port Approval', color: palette.signalAmber },
  active: { label: 'Active', color: palette.steelBlue },
  in_execution: { label: 'In Execution', color: palette.oceanMid, pulsing: true },
  completed: { label: 'Completed', color: palette.engineGreen },
  cancelled: { label: 'Cancelled', color: palette.alertRed },
};

export const LINE_STATUS_META: Record<LineStatus, StatusMeta> = {
  pending_supplier: { label: 'Awaiting Supplier', color: palette.signalAmber },
  supplier_accepted: { label: 'Accepted', color: palette.steelBlue },
  supplier_declined: { label: 'Declined', color: palette.alertRed },
  preparing: { label: 'Preparing', color: palette.steelBlue },
  ready: { label: 'Ready for Delivery', color: palette.steelBlue },
  in_transit: { label: 'In Transit', color: palette.oceanMid, pulsing: true },
  delivered: { label: 'Delivered', color: palette.engineGreen },
  cancelled: { label: 'Cancelled', color: palette.alertRed },
};

/**
 * Visual stepper sequence shown on the captain order detail.
 */
export const ORDER_STEPPER: { key: OverallStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'pending_charter_approval', label: 'Charter Approval' },
  { key: 'pending_payment', label: 'Payment' },
  { key: 'active', label: 'Active' },
  { key: 'in_execution', label: 'In Execution' },
  { key: 'completed', label: 'Completed' },
];

/**
 * Supplier action transitions — the next status a supplier can move a line to,
 * keyed by current line_status. Drives the StatusUpdateSheet buttons.
 */
export const SUPPLIER_NEXT_ACTIONS: Partial<
  Record<LineStatus, { next: LineStatus; label: string; requiresDocument?: boolean }[]>
> = {
  pending_supplier: [
    { next: 'supplier_accepted', label: 'Accept Order' },
    { next: 'supplier_declined', label: 'Decline Order' },
  ],
  supplier_accepted: [{ next: 'preparing', label: 'Mark as Preparing' }],
  preparing: [{ next: 'ready', label: 'Mark as Ready' }],
  ready: [{ next: 'in_transit', label: 'Mark as In Transit' }],
  in_transit: [{ next: 'delivered', label: 'Mark as Delivered', requiresDocument: true }],
};
