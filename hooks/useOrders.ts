import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Order, UserRole } from '@/types/database';
import type { CartItem, VesselInfo } from '@/stores/cartStore';

/**
 * Lists orders relevant to the current user. RLS already restricts visibility,
 * so a plain select ordered by created_at desc is sufficient; we add role
 * specific .eq filters as a belt-and-suspenders narrowing where it helps.
 */
export function useOrders(role: UserRole | null | undefined, userId: string | null | undefined) {
  const query = useQuery<Order[]>({
    queryKey: ['orders', userId, role],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase.from('orders').select('*').order('created_at', { ascending: false });

      if (userId) {
        if (role === 'charter_party') {
          q = q.eq('charter_party_id', userId);
        } else if (role === 'ship_agent') {
          q = q.eq('ship_agent_id', userId);
        } else if (role === 'captain') {
          q = q.eq('captain_id', userId);
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface CreateOrderPayload {
  captainId: string;
  vessel: VesselInfo;
  items: CartItem[];
  totalAmount: number;
}

/**
 * Inserts an order row plus its line items from a cart payload.
 * Returns the new order id.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation<{ orderId: string; lineItems: { id: string; service_category_id: string | null }[] }, Error, CreateOrderPayload>({
    mutationFn: async (payload) => {
      const { vessel, items, captainId, totalAmount } = payload;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          captain_id: captainId,
          vessel_name: vessel.vesselName,
          imo_number: vessel.imoNumber || null,
          port_id: vessel.portId,
          eta: vessel.eta,
          etd: vessel.etd,
          charter_party_id: vessel.charterPartyId,
          ship_agent_id: vessel.shipAgentId,
          overall_status: 'pending_charter_approval',
          total_amount: totalAmount,
        })
        .select('id')
        .single();

      if (orderError) throw orderError;
      if (!order) throw new Error('Failed to create order');

      const orderId = order.id;
      let lineItems: { id: string; service_category_id: string | null }[] = [];

      if (items.length > 0) {
        const lineRows = items.map((item) => ({
          order_id: orderId,
          service_category_id: item.serviceCategoryId,
          quantity: item.quantity ?? 1,
          unit: item.unit ?? 'units',
          specifications: item.specifications || null,
          special_instructions: item.specialInstructions || null,
          requested_datetime: item.requestedDatetime,
          unit_price: item.estimatedUnitPrice,
          total_price: item.estimatedTotalPrice,
          line_status: 'delivered' as const,
        }));

        const { data: insertedLines, error: lineError } = await supabase
          .from('order_line_items')
          .insert(lineRows)
          .select('id, service_category_id');
        if (lineError) throw lineError;
        lineItems = insertedLines ?? [];
      }

      return { orderId, lineItems };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
